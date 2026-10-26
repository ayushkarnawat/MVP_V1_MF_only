"""Portfolio synthetic gate: run the six Portfolio routes against a PRIVATE COPY of a synthetic database.

Usage (never point it at a database you care about; each scenario works on its own temporary copy of the file
and the source file's hash is checked before and after):

    cp /home/ayush/s25/s25.db /tmp/portfolio_gate_copy.db
    .venv/bin/python scripts/portfolio_synthetic_gate.py /tmp/portfolio_gate_copy.db

Besides the cross-route parity checks it holds an INDEPENDENT oracle: invested, realized and unrealized are
recomputed from the raw `transactions` / `folios` / `nav_history` rows with their own FIFO replay (plain SQL, no
holdings, Dashboard or Home code), and the `rich_*` scenarios add the transaction kinds the base data lacks (a
switch, bonus units, an opening balance with stamp duty, a statement-priced fund, a fully sold fund).
"""
from __future__ import annotations

import argparse
import asyncio
import shutil
import sys
import tempfile
import uuid
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from app.api.home import get_now_ist
from app.core.decimal_utils import quantize_amount
from app.db.session import get_db
from app.main import app
from app.models.enums import PlanType, SchemePlanType, SchemeSource, TransactionOrigin, TransactionType
from app.models.folio import Folio
from app.models.imports import Import
from app.models.reference import NavHistory, Scheme
from app.models.transaction import Transaction
from app.models.user import HouseholdMember, User
from app.services.auth.session import get_active_user
from app.services.dashboard.holdings import _holdings_cache, compute_holdings
from scripts.home_synthetic_gate import FRIDAY, MONDAY, ScenarioResult, _mutate, _sha256


SCENARIOS = (
    "base", "member_rohan", "member_priya", "weekend",
    "partial_data", "one_fund_only", "all_funds_down", "no_holdings",
    "rich_aggregate", "rich_member_rohan", "rich_member_priya",
)

_NAMESPACE = uuid.UUID("5f0a1b0e-6a7c-5d6e-9c1e-0c0ffee0f00d")


def _uid(name: str) -> uuid.UUID:
    return uuid.uuid5(_NAMESPACE, name)


# --------------------------------------------------------------------------------------------------------------
# The richer household: every transaction kind the base synthetic data does not contain.
# --------------------------------------------------------------------------------------------------------------

def add_rich_funds(db: Session, member_id: uuid.UUID, import_id: uuid.UUID) -> None:
    """Add six funds to one member, dated inside the base data's price range (fake AMFI codes on purpose: nothing
    here may reach a live price feed).

    * switch        GATE-SWOUT (1,000 units bought, 400 switched out at a gain) -> GATE-SWIN (the units arrive)
    * bonus         GATE-BONUS (100 units bought, 20 bonus units at zero cost)
    * opening       GATE-OPEN  (500 undated opening units plus a purchase that carried stamp duty)
    * statement     GATE-CAS   (no price feed: two statement prices weeks apart)
    * fully sold    GATE-SOLD  (300 units bought, all 300 redeemed at a gain; the feed goes on)
    """
    def fund(key: str, *, source: SchemeSource = SchemeSource.AMFI) -> Folio:
        scheme = Scheme(
            id=_uid(f"scheme-{key}"), amfi_code=None if source == SchemeSource.CAS_ONLY else f"GATE-{key}",
            name=f"Gate {key} Fund", amc_name="Gate AMC", sebi_category="Equity Scheme - Flexi Cap Fund",
            plan_type=SchemePlanType.DIRECT, source=source,
        )
        db.add(scheme)
        db.flush()
        folio = Folio(
            id=_uid(f"folio-{key}"), household_member_id=member_id, scheme_id=scheme.id,
            folio_number=f"GATE-{key}", plan_type=PlanType.DIRECT,
        )
        db.add(folio)
        db.flush()
        return folio

    def txn(key, folio, kind, day, amount, units, nav, *, origin=TransactionOrigin.CAS_ROW, stamp=None) -> None:
        db.add(Transaction(
            id=_uid(f"txn-{key}"), folio_id=folio.id, import_id=import_id, type=kind, date=day,
            amount=Decimal(amount), units=Decimal(units), nav=Decimal(nav), origin=origin,
            **({} if stamp is None else {"stamp_duty": Decimal(stamp)}),
        ))

    def feed(folio: Folio, start: Decimal) -> None:
        day, step = date(2026, 5, 20), 0
        while day <= date(2026, 10, 23):
            if day.weekday() < 5:
                db.add(NavHistory(scheme_id=folio.scheme_id, date=day, nav=start + Decimal("0.01") * step))
                step += 1
            day += timedelta(days=1)

    swap_out, swap_in = fund("SWOUT"), fund("SWIN")
    txn("swout-buy", swap_out, TransactionType.PURCHASE, date(2026, 7, 1), "10000", "1000", "10")
    txn("swout-out", swap_out, TransactionType.SWITCH_OUT, date(2026, 9, 1), "4400", "400", "11")
    txn("swin-in", swap_in, TransactionType.SWITCH_IN, date(2026, 9, 1), "4400", "360", "12.2222")
    feed(swap_out, Decimal("10.50"))
    feed(swap_in, Decimal("12.00"))

    bonus = fund("BONUS")
    txn("bonus-buy", bonus, TransactionType.PURCHASE, date(2026, 6, 1), "5000", "100", "50")
    txn("bonus-add", bonus, TransactionType.BONUS, date(2026, 8, 15), "0", "20", "0")
    feed(bonus, Decimal("48.00"))

    opening = fund("OPEN")
    txn("open-bal", opening, TransactionType.OPENING_BALANCE, date(2026, 7, 1), "10000", "500", "20",
        origin=TransactionOrigin.CAS_OPENING)
    txn("open-buy", opening, TransactionType.PURCHASE, date(2026, 9, 10), "2200", "100", "22", stamp="0.50")
    feed(opening, Decimal("21.00"))

    statement = fund("CAS", source=SchemeSource.CAS_ONLY)
    txn("cas-buy", statement, TransactionType.PURCHASE, date(2026, 5, 1), "3000", "200", "15")
    db.add(NavHistory(scheme_id=statement.scheme_id, date=date(2026, 6, 30), nav=Decimal("16.0000")))
    db.add(NavHistory(scheme_id=statement.scheme_id, date=date(2026, 10, 15), nav=Decimal("17.0000")))

    sold = fund("SOLD")
    txn("sold-buy", sold, TransactionType.PURCHASE, date(2026, 6, 1), "3000", "300", "10")
    txn("sold-red", sold, TransactionType.REDEMPTION, date(2026, 9, 20), "3600", "300", "12")
    feed(sold, Decimal("11.50"))
    db.commit()


# --------------------------------------------------------------------------------------------------------------
# The independent oracle: raw rows in, totals out.
# --------------------------------------------------------------------------------------------------------------

_ADDING = {
    "purchase", "purchase_sip", "switch_in", "dividend_reinvest", "opening_balance", "gift_in", "bonus",
    "segregation",
}
_SELLING = {"redemption", "switch_out"}
_CONSUMING = _SELLING | {"gift_out", "reversal"}


def _num(value) -> Decimal:
    return Decimal(str(value))


def oracle_totals(db: Session, member_ids, on_date: date) -> dict[str, Decimal]:
    """Invested, value, unrealized and realized of a scope, recomputed from `transactions`, `folios` and
    `nav_history` rows with a self-contained FIFO replay (no holdings, Dashboard or Home code).

    Rules restated here: lots are replayed per folio in (date, adding-before-consuming, id) order; a new lot costs
    the row's NAV, or (amount + stamp duty) / units when stamp duty was charged; a redemption or switch-out
    removes the oldest lots first and realises units x (sale NAV - lot cost); a gift-out or reversal removes units
    without a gain (a reversal first cancels the newest lot of exactly its units). A fund counts toward invested
    and value only while units remain AND a stored price exists on or before `on_date`; realized counts everything.
    Per fund (member, scheme, plan) cost and value are rounded to paise before they are added up."""
    ids = [member.hex for member in member_ids]
    if not ids:
        return {"invested": Decimal("0.00"), "value": Decimal("0.00"),
                "unrealized": Decimal("0.00"), "realized": Decimal("0.00")}
    marks = ",".join(f":m{index}" for index in range(len(ids)))
    consuming = ",".join(f"'{kind}'" for kind in sorted(_CONSUMING))
    rows = db.execute(text(
        "SELECT f.id AS folio, f.household_member_id AS member, f.scheme_id AS scheme, f.plan_type AS plan, "
        "t.type AS kind, t.amount AS amount, t.units AS units, t.nav AS nav, t.stamp_duty AS stamp "
        "FROM transactions t JOIN folios f ON f.id = t.folio_id "
        f"WHERE f.household_member_id IN ({marks}) "
        f"ORDER BY f.id, t.date, CASE WHEN t.type IN ({consuming}) THEN 1 ELSE 0 END, t.id"
    ), {f"m{index}": value for index, value in enumerate(ids)}).all()

    realized = Decimal("0")
    funds: dict[tuple, list[Decimal]] = {}
    lots_by_folio: dict[str, list[list[Decimal]]] = {}
    keys: dict[str, tuple] = {}
    for row in rows:
        lots = lots_by_folio.setdefault(row.folio, [])
        keys[row.folio] = (row.member, row.scheme, row.plan)
        units, nav = _num(row.units), _num(row.nav)
        if row.kind in _ADDING:
            if row.stamp and units:
                nav = (_num(row.amount) + _num(row.stamp)) / units
            lots.append([units, nav])
        elif row.kind == "reversal":
            match = next((i for i in range(len(lots) - 1, -1, -1) if lots[i][0] == units), None)
            if match is not None:
                lots.pop(match)
            else:
                remaining = units
                while remaining > 0 and lots:
                    take = min(lots[-1][0], remaining)
                    lots[-1][0] -= take
                    remaining -= take
                    if lots[-1][0] == 0:
                        lots.pop()
        elif row.kind in _CONSUMING:
            remaining = units
            while remaining > 0 and lots:
                take = min(lots[0][0], remaining)
                if row.kind in _SELLING:
                    realized += take * (nav - lots[0][1])
                lots[0][0] -= take
                remaining -= take
                if lots[0][0] == 0:
                    lots.pop(0)
    for folio, lots in lots_by_folio.items():
        total = funds.setdefault(keys[folio], [Decimal("0"), Decimal("0")])
        total[0] += sum((lot[0] for lot in lots), Decimal("0"))
        total[1] += sum((lot[0] * lot[1] for lot in lots), Decimal("0"))

    invested = value = Decimal("0.00")
    prices: dict[str, Decimal | None] = {}
    for (_member, scheme, _plan), (units, cost) in funds.items():
        if units == 0:
            continue
        if scheme not in prices:
            found = db.execute(text(
                "SELECT nav FROM nav_history WHERE scheme_id = :scheme AND date <= :day ORDER BY date DESC LIMIT 1"
            ), {"scheme": scheme, "day": on_date.isoformat()}).first()
            # nav_history.nav is NUMERIC(14,4): a price is read at that scale, as the ORM column reads it.
            prices[scheme] = None if found is None else _num(found[0]).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
        price = prices[scheme]
        if price is None:
            continue
        invested += quantize_amount(cost)
        value += quantize_amount(units * price)
    return {
        "invested": invested, "value": value, "unrealized": value - invested,
        "realized": quantize_amount(realized),
    }


# --------------------------------------------------------------------------------------------------------------
# The gate.
# --------------------------------------------------------------------------------------------------------------

def _prepare(db: Session, scenario: str) -> None:
    if not scenario.startswith("rich_"):
        _mutate(db, scenario)
        return
    member = db.query(HouseholdMember).order_by(HouseholdMember.created_at, HouseholdMember.id).first()
    imported = db.query(Import).filter(Import.household_member_id == member.id).first()
    add_rich_funds(db, member.id, imported.id)


def _run_scenario(source: Path, temp_dir: Path, scenario: str) -> ScenarioResult:
    copy = temp_dir / f"{scenario}.db"
    shutil.copy2(source, copy)
    engine = create_engine(f"sqlite:///{copy}", connect_args={"check_same_thread": False})
    sessions = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    with sessions() as db:
        _prepare(db, scenario)
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
    if scenario in {"member_rohan", "rich_member_rohan"}:
        root = f"/household-members/{member_ids[0]}"
        selected_member_ids = [member_ids[0]]
    elif scenario in {"member_priya", "rich_member_priya"}:
        root = f"/household-members/{member_ids[1]}"
        selected_member_ids = [member_ids[1]]
    else:
        root = "/household/aggregate"
        selected_member_ids = member_ids
    try:
        summary = client.get(f"{root}/portfolio-summary").json()
        allocation = client.get(f"{root}/portfolio-allocation").json()
        series = client.get(f"{root}/portfolio-value-series?days=30").json()
        home_summary = client.get(f"{root}/home/summary").json()
        home_movers = client.get(f"{root}/home/movers?by=fund").json()
        with sessions() as db:
            _holdings_cache.clear()
            # Stored prices only, exactly like the routes: this database has fake AMFI codes and no network.
            rows = asyncio.run(compute_holdings(
                db, selected_member_ids, allow_stale_today=True, stored_only=True,
            ))
            direct_total = sum(
                (quantize_amount(Decimal(row.current_value)) for row in rows
                 if row.current_value is not None and not row.nav_unavailable),
                Decimal("0.00"),
            )
            oracle = oracle_totals(db, selected_member_ids, date.today())
        series_last = None if series["empty"] else series["points"][-1]["value"]
        checks = {
            "value_chain": (
                summary["total_value"] == home_summary["total_value"]
                == allocation["buckets"][0]["current_value"]
                == str(direct_total)
                and (series["empty"] or series_last == summary["total_value"])
            ),
            "today_gain_parity": (
                summary["today_gain"] == home_summary["change_amount"]
                and summary["today_pct"] == home_movers["net_pct"]
            ),
            "oracle_value": Decimal(summary["total_value"]) == oracle["value"],
            "oracle_invested": (
                Decimal(summary["total_invested"]) == oracle["invested"]
                and Decimal(allocation["buckets"][0]["invested"]) == oracle["invested"]
            ),
            "oracle_unrealized": (
                Decimal(summary["unrealized_gain"]) == oracle["unrealized"]
                and Decimal(allocation["buckets"][0]["gain_loss"]) == oracle["unrealized"]
            ),
            "oracle_realized": Decimal(summary["realized_gain"]) == oracle["realized"],
        }
        details = {
            "value_chain": (
                f"summary={summary['total_value']} home={home_summary['total_value']} "
                f"allocation={allocation['buckets'][0]['current_value']} "
                f"holdings_row_sum={direct_total} series_last={series_last}"
            ),
            "today_gain_parity": (
                f"today_gain={summary['today_gain']} home_change={home_summary['change_amount']} "
                f"today_pct={summary['today_pct']} home_net_pct={home_movers['net_pct']}"
            ),
            "oracle_value": f"summary={summary['total_value']} oracle={oracle['value']}",
            "oracle_invested": (
                f"summary={summary['total_invested']} allocation={allocation['buckets'][0]['invested']} "
                f"oracle={oracle['invested']}"
            ),
            "oracle_unrealized": (
                f"summary={summary['unrealized_gain']} allocation={allocation['buckets'][0]['gain_loss']} "
                f"oracle={oracle['unrealized']}"
            ),
            "oracle_realized": f"summary={summary['realized_gain']} oracle={oracle['realized']}",
        }
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
        _holdings_cache.clear()
        engine.dispose()


def _run_all_scenarios(source: Path, temp_dir: Path, scenarios: tuple[str, ...]) -> list[ScenarioResult]:
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
    with tempfile.TemporaryDirectory(prefix="unifolio-portfolio-gate-") as directory:
        results = _run_all_scenarios(source, Path(directory), SCENARIOS)
    after = _sha256(source)
    print(f"source_sha256_after: {after}")
    print("FINAL RESULTS")
    for result in results:
        failed = ",".join(name for name, passed in result.checks.items() if not passed) or "none"
        print(f"{result.scenario}: {'PASS' if result.passed else 'FAIL'} failed_checks={failed}")
    source_unchanged = before == after
    print(f"source_hash: {'PASS' if source_unchanged else 'FAIL'} before={before} after={after}")
    if not source_unchanged or not all(result.passed for result in results):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
