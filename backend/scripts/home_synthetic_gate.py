from __future__ import annotations

import argparse
import asyncio
import hashlib
import shutil
import sys
import tempfile
import uuid
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.api.home import get_now_ist
from app.core.decimal_utils import quantize_amount
from app.db.session import get_db
from app.main import app
from app.models.user import HouseholdMember, User
from app.services.auth.session import get_active_user
from app.services.dashboard.holdings import _holdings_cache, compute_holdings
from app.services.home.units import build_units_timeline


REFERENCE_SCENARIOS = {"base", "member_rohan", "member_priya", "opening_balance_inside_period"}
IST = timezone(timedelta(hours=5, minutes=30))
FRIDAY = datetime(2026, 10, 23, 18, 30, tzinfo=IST)
MONDAY = datetime(2026, 10, 26, 10, 0, tzinfo=IST)


@dataclass(frozen=True)
class ScenarioResult:
    scenario: str
    lines: tuple[str, ...]
    checks: dict[str, bool]

    @property
    def passed(self) -> bool:
        return all(self.checks.values())


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _held_scheme_hex(db) -> str:
    # A scenario that edits a fund the household no longer holds tests nothing, so
    # the scenarios below always edit a fund that still has units on the books.
    member_ids = [row[0] for row in db.query(HouseholdMember.id).all()]
    timeline = build_units_timeline(db, member_ids)
    held = sorted(
        (scheme_id for scheme_id, points in timeline.items() if points and points[-1][1] > 0),
        key=str,
    )
    if not held:
        raise ValueError("the source database holds no fund")
    return held[0].hex


def _mutate(db, scenario: str) -> None:
    if scenario in {"base", "member_rohan", "member_priya", "weekend", "custom_before_index_data"}:
        return
    latest = db.execute(text("SELECT max(date) FROM nav_history")).scalar_one()
    if scenario in {"partial_data", "stale_statement"}:
        scheme_id = _held_scheme_hex(db)
        days = 12 if scenario == "partial_data" else 5
        db.execute(text(
            "DELETE FROM nav_history WHERE scheme_id = :scheme_id "
            "AND date > date(:latest, :offset)"
        ), {"scheme_id": scheme_id, "latest": latest, "offset": f"-{days} days"})
    elif scenario == "one_fund_only":
        folio_id = db.execute(text("SELECT id FROM folios ORDER BY id LIMIT 1")).scalar_one()
        db.execute(text(
            "DELETE FROM transaction_imports WHERE transaction_id IN "
            "(SELECT id FROM transactions WHERE folio_id <> :folio_id)"
        ), {"folio_id": folio_id})
        db.execute(text("DELETE FROM transactions WHERE folio_id <> :folio_id"), {"folio_id": folio_id})
    elif scenario in {"all_funds_down", "loss_day"}:
        scheme_ids = [row[0] for row in db.execute(text(
            "SELECT DISTINCT scheme_id FROM nav_history ORDER BY scheme_id"
        )).all()]
        if scenario == "loss_day":
            scheme_ids = [_held_scheme_hex(db)]
        factor = Decimal("0.99") if scenario == "all_funds_down" else Decimal("0.95")
        for scheme_id in scheme_ids:
            rows = db.execute(text(
                "SELECT date, nav FROM nav_history WHERE scheme_id = :scheme_id "
                "ORDER BY date DESC LIMIT 2"
            ), {"scheme_id": scheme_id}).all()
            if len(rows) == 2:
                db.execute(text(
                    "UPDATE nav_history SET nav = :nav WHERE scheme_id = :scheme_id AND date = :day"
                ), {"nav": str(Decimal(rows[1].nav) * factor), "scheme_id": scheme_id, "day": rows[0].date})
    elif scenario == "opening_balance_inside_period":
        # 100 units that already existed when a statement began ten days before the latest price, recorded at a
        # cost of 1.00 (far below their worth): a period gain that counts them at cost (review F3) is wrong by
        # almost their whole value, which only a check against an independent reference can see.
        scheme_id = _held_scheme_hex(db)
        folio_id, import_id = db.execute(text(
            "SELECT f.id, t.import_id FROM folios f JOIN transactions t ON t.folio_id = f.id "
            "WHERE f.scheme_id = :scheme_id ORDER BY f.id LIMIT 1"
        ), {"scheme_id": scheme_id}).one()
        db.execute(text(
            "INSERT INTO transactions (id, folio_id, import_id, type, date, amount, units, nav) "
            "VALUES (:id, :folio_id, :import_id, 'opening_balance', date(:latest, '-10 days'), 1.00, 100, 0.01)"
        ), {"id": uuid.uuid4().hex, "folio_id": folio_id, "import_id": import_id, "latest": latest})
    elif scenario == "no_holdings":
        db.execute(text("DELETE FROM transaction_imports"))
        db.execute(text("DELETE FROM transactions"))
    else:
        raise ValueError(f"unknown scenario: {scenario}")
    db.commit()


def _reference_value(db, member_ids, on_date: date) -> Decimal:
    """What the scope's funds were worth on a date, computed without any of the Home modules except the units
    replay: units held that day (every fund, sold ones included) times the newest stored price on or before it."""
    total = Decimal("0")
    for scheme_id, points in build_units_timeline(db, member_ids).items():
        units = Decimal("0")
        for changed_on, held in points:
            if changed_on <= on_date:
                units = held
        if units <= 0:
            continue
        row = db.execute(
            text("SELECT nav FROM nav_history WHERE scheme_id = :scheme AND date <= :day ORDER BY date DESC LIMIT 1"),
            {"scheme": scheme_id.hex, "day": on_date.isoformat()},
        ).first()
        if row is not None:
            total += units * Decimal(str(row[0]))
    return total


def _held_any(db, member_ids, start: date, end: date) -> bool:
    """True when the scope held any unit on any day of [start, end] (so a series for it cannot be empty)."""
    for points in build_units_timeline(db, member_ids).values():
        units = Decimal("0")
        for changed_on, held in points:
            if changed_on <= start:
                units = held
            elif changed_on <= end and held > 0:
                return True
        if units > 0:
            return True
    return False


def _price_on_or_before(db, scheme_id, day: date) -> Decimal | None:
    row = db.execute(
        text("SELECT nav FROM nav_history WHERE scheme_id = :scheme AND date <= :day ORDER BY date DESC LIMIT 1"),
        {"scheme": scheme_id, "day": day.isoformat()},
    ).first()
    return None if row is None else Decimal(str(row[0]))


# Money paid in by the investor, and money paid out to the investor, by stored transaction type.
_CONTRIBUTION_TYPES = {"purchase", "purchase_sip", "switch_in", "gift_in"}
_WITHDRAWAL_TYPES = {"redemption", "switch_out", "dividend_payout", "reversal", "gift_out"}


def _reference_flows(db, member_ids, after: date, upto: date) -> Decimal:
    """Net money put in during (after, upto], straight from the stored rows. Units that already existed when a
    statement began (an opening balance) enter at what they were worth that day, not at their cost (review F3)."""
    placeholders = ",".join(f":m{index}" for index in range(len(member_ids)))
    rows = db.execute(
        text(
            "SELECT t.type, t.date, t.amount, t.stamp_duty, t.units, f.scheme_id FROM transactions t "
            "JOIN folios f ON f.id = t.folio_id "
            f"WHERE f.household_member_id IN ({placeholders}) AND t.date > :after AND t.date <= :upto"
        ),
        {**{f"m{index}": member.hex for index, member in enumerate(member_ids)},
         "after": after.isoformat(), "upto": upto.isoformat()},
    ).all()
    total = Decimal("0")
    for kind, day, amount, stamp_duty, units, scheme_id in rows:
        paid = Decimal(str(amount)) + Decimal(str(stamp_duty or 0))
        if kind == "opening_balance":
            price = _price_on_or_before(db, scheme_id, date.fromisoformat(str(day)))
            total += Decimal(str(units)) * price if price is not None else paid
        elif kind in _CONTRIBUTION_TYPES:
            total += paid
        elif kind in _WITHDRAWAL_TYPES:
            total -= paid
    return total


def _reference_period(db, member_ids, body) -> tuple[Decimal, Decimal, Decimal, Decimal]:
    """(opening value, closing value, net contributions, gain) of a non-empty body's period, computed from the
    stored rows: values at market (`_reference_value`), flows from `_reference_flows`, gain = closing - opening
    - net contributions (the Modified Dietz gain)."""
    requested_start = date.fromisoformat(body["start"])
    first = date.fromisoformat(body["points"][0]["date"])
    last = date.fromisoformat(body["points"][-1]["date"])
    if first > requested_start:
        # the portfolio did not exist yet at the start: it opens empty the day before its first point
        effective, opening = first - timedelta(days=1), Decimal("0")
    else:
        effective, opening = requested_start, _reference_value(db, member_ids, first)
    closing = _reference_value(db, member_ids, last)
    net = _reference_flows(db, member_ids, effective, last)
    return opening, closing, net, closing - opening - net


def _run_scenario(source: Path, temp_dir: Path, scenario: str) -> ScenarioResult:
    copy = temp_dir / f"{scenario}.db"
    shutil.copy2(source, copy)
    engine = create_engine(f"sqlite:///{copy}", connect_args={"check_same_thread": False})
    sessions = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    with sessions() as db:
        _mutate(db, scenario)
        user = db.query(User).one()
        members = (
            db.query(HouseholdMember)
            .filter(HouseholdMember.user_id == user.id)
            .order_by(HouseholdMember.created_at, HouseholdMember.id)
            .all()
        )
        user_id = user.id
        member_ids = [member.id for member in members]

    def override_db():
        with sessions() as session:
            yield session

    now = MONDAY if scenario == "weekend" else FRIDAY
    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_active_user] = lambda: SimpleNamespace(id=user_id)
    app.dependency_overrides[get_now_ist] = lambda: now
    _holdings_cache.clear()
    client = TestClient(app)
    if scenario == "member_rohan":
        root = f"/household-members/{member_ids[0]}"
        selected_member_ids = [member_ids[0]]
    elif scenario == "member_priya":
        root = f"/household-members/{member_ids[1]}"
        selected_member_ids = [member_ids[1]]
    else:
        root = "/household/aggregate"
        selected_member_ids = member_ids
    try:
        summary = client.get(f"{root}/home/summary").json()
        movers = client.get(f"{root}/home/movers?by=fund").json()
        wealth = client.get(f"{root}/home/wealth-series?period=1D").json()
        allocation = client.get(f"{root}/home/allocation").json()
        worth = client.get(f"{root}/home/worth-a-look").json()
        custom_body = None
        if scenario == "custom_before_index_data":
            custom = client.get(
                f"{root}/home/wealth-series?period=custom&from=2016-01-01&to=2016-12-31&benchmark=nifty_50"
            )
            if custom.status_code != 200:
                raise RuntimeError(custom.text)
            custom_body = custom.json()

        mover_total = sum(
            (Decimal(row["change"]) for row in movers["gains"] + movers["losses"]),
            Decimal("0"),
        ) + Decimal(movers["others_change"])
        checks = {
            "identity": summary["change_amount"] == movers["net_change"] == wealth["change_amount"],
            "mover_sum": mover_total == Decimal(movers["net_change"]),
            "value_chain": (
                (wealth["empty"] and summary["total_value"] == allocation["total_value"] == "0.00")
                or (
                    wealth["points"][-1]["value"] == wealth["end_value"]
                    == summary["total_value"] == allocation["total_value"]
                )
            ),
        }
        details = {
            "identity": f"summary={summary['change_amount']} movers={movers['net_change']} wealth={wealth['change_amount']}",
            "mover_sum": f"bars_plus_others={mover_total} net={movers['net_change']}",
            "value_chain": f"point={None if wealth['empty'] else wealth['points'][-1]['value']} end={wealth['end_value']} summary={summary['total_value']} allocation={allocation['total_value']}",
        }
        with sessions() as db:
            _holdings_cache.clear()
            # stored_only like the Home loader: without it this call could fetch a price and hide a mismatch with
            # what the routes (which never fetch) show (review N7).
            rows = asyncio.run(compute_holdings(
                db, selected_member_ids, allow_stale_today=True, stored_only=True
            ))
            direct_total = sum(
                (quantize_amount(Decimal(row.current_value)) for row in rows
                 if row.current_value is not None and not row.nav_unavailable),
                Decimal("0.00"),
            )
        checks["holdings_parity"] = Decimal(summary["total_value"]) == direct_total
        details["holdings_parity"] = (
            f"summary={summary['total_value']} holdings_row_sum={direct_total}"
        )
        if root == "/household/aggregate":
            member_total = sum(
                (Decimal(row["value"]) for row in allocation["members"] or []), Decimal("0")
            )
            checks["allocation_member_sum"] = member_total == Decimal(allocation["total_value"])
            details["allocation_member_sum"] = (
                f"members={member_total} allocation={allocation['total_value']}"
            )
        partial_values = (summary["partial"], wealth["partial"], movers["partial"])
        missing_values = tuple(
            tuple((row["scheme_id"], row["name"]) for row in payload["missing_funds"])
            for payload in (summary, wealth, movers)
        )
        checks["partial_agreement"] = (
            len(set(partial_values)) == 1 and len(set(missing_values)) == 1
        )
        details["partial_agreement"] = (
            f"partial(summary,wealth,movers)={partial_values} "
            f"missing_counts={tuple(len(value) for value in missing_values)}"
        )
        if scenario in {"partial_data", "stale_statement"}:
            # The edited fund's price is older than the others', so every route must say so.
            checks["scenario_effect"] = partial_values == (True, True, True) and len(missing_values[0]) == 1
            details["scenario_effect"] = (
                f"expected partial on all routes with one named fund, got {partial_values} "
                f"and {len(missing_values[0])} named"
            )
        checks["worth_state"] = worth["state"] == "unavailable"
        details["worth_state"] = f"actual={worth['state']} expected=unavailable"
        if custom_body is not None:
            checks["custom_empty"] = custom_body["empty"] is True
            details["custom_empty"] = (
                f"empty={custom_body['empty']} points={len(custom_body['points'])}"
            )
        if scenario in REFERENCE_SCENARIOS:
            # An independent value of the portfolio on a date (every fund the scope ever held, stored price on or
            # before the date) against the series' first and last point of several periods, including a past
            # range inside the years this household had a fund it has since sold (review F1 and F2); and an
            # independent period gain and net contribution (opening balances taken in at market value, review F3)
            # against change_amount and net_contributions. An empty body must be one the reference expects.
            queries = {
                "1M": f"{root}/home/wealth-series?period=1M",
                "1Y": f"{root}/home/wealth-series?period=1Y",
                "past_2023": f"{root}/home/wealth-series?period=custom&from=2023-01-02&to=2023-12-29",
            }
            with sessions() as db:
                for label, query in queries.items():
                    body = client.get(query).json()
                    start, end = date.fromisoformat(body["start"]), date.fromisoformat(body["end"])
                    expected_empty = not _held_any(db, selected_member_ids, start, end)
                    name = f"reference_{label}_empty"
                    checks[name] = body["empty"] is expected_empty
                    details[name] = f"empty={body['empty']} reference_expects_empty={expected_empty} range={start}..{end}"
                    if body["empty"]:
                        continue
                    for which, point in (("first", body["points"][0]), ("last", body["points"][-1])):
                        reference = _reference_value(db, selected_member_ids, date.fromisoformat(point["date"]))
                        gap = abs(Decimal(point["value"]) - reference)
                        name = f"reference_{label}_{which}"
                        checks[name] = gap <= Decimal("0.10")
                        details[name] = f"point={point['value']} reference={reference.quantize(Decimal('0.01'))} on {point['date']}"
                    opening, closing, net, gain = _reference_period(db, selected_member_ids, body)
                    for name, actual, expected, tolerance in (
                        (f"reference_{label}_start_value", body["start_value"], opening, "0.10"),
                        (f"reference_{label}_end_value", body["end_value"], closing, "0.10"),
                        (f"reference_{label}_net_contributions", body["net_contributions"], net, "0.05"),
                        (f"reference_{label}_change_amount", body["change_amount"], gain, "0.25"),
                    ):
                        checks[name] = abs(Decimal(actual) - expected) <= Decimal(tolerance)
                        details[name] = f"actual={actual} reference={expected.quantize(Decimal('0.01'))}"
        lines = tuple(
            f"{scenario} {name}: {'PASS' if passed else 'FAIL'} ({details[name]})"
            for name, passed in checks.items()
        )
        return ScenarioResult(scenario, lines, checks)
    finally:
        client.close()
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_active_user, None)
        app.dependency_overrides.pop(get_now_ist, None)
        engine.dispose()


def _run_all_scenarios(
    source: Path, temp_dir: Path, scenarios: tuple[str, ...]
) -> list[ScenarioResult]:
    results = []
    for scenario in scenarios:
        try:
            result = _run_scenario(source, temp_dir, scenario)
        except Exception as exc:
            result = ScenarioResult(
                scenario=scenario,
                lines=(f"{scenario} execution: FAIL (error={type(exc).__name__}: {exc})",),
                checks={"execution": False},
            )
        results.append(result)
        for line in result.lines:
            print(line)
    return results


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("db_path", type=Path)
    args = parser.parse_args()
    source = args.db_path.resolve()
    before = _sha256(source)
    print(f"source_sha256_before: {before}")
    scenarios = (
        "base", "member_rohan", "member_priya", "weekend", "partial_data",
        "stale_statement", "one_fund_only", "all_funds_down", "loss_day",
        "no_holdings", "custom_before_index_data", "opening_balance_inside_period",
    )
    with tempfile.TemporaryDirectory(prefix="unifolio-home-gate-") as directory:
        results = _run_all_scenarios(source, Path(directory), scenarios)
    print("base calibration fund_shares: n/a")
    print("base calibration tier: n/a")
    print("base calibration 1y_gap: n/a")
    print("base calibration ter_gap: n/a")
    print("base calibration top_five_share: n/a")
    after = _sha256(source)
    print(f"source_sha256_after: {after}")
    print("FINAL RESULTS")
    for result in results:
        failed = ",".join(
            name for name, passed in result.checks.items() if not passed
        ) or "none"
        print(
            f"{result.scenario}: {'PASS' if result.passed else 'FAIL'} "
            f"failed_checks={failed}"
        )
    source_unchanged = before == after
    print(
        f"source_hash: {'PASS' if source_unchanged else 'FAIL'} "
        f"before={before} after={after}"
    )
    if not source_unchanged or not all(result.passed for result in results):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
