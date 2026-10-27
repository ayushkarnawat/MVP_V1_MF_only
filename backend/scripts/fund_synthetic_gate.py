from __future__ import annotations

import argparse
import hashlib
import logging
import shutil
import sys
import tempfile
import uuid
from collections import defaultdict, deque
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import sessionmaker

from app.api.home import get_now_ist
from app.db.session import get_db
from app.main import app
from app.models.reference import Scheme
from app.models.user import HouseholdMember, User
from app.services.analytics.scheme_universe import CategoryPeers
from app.services.auth.session import get_active_user
from app.services.dashboard.holdings import _holdings_cache, _holdings_cache_generation
from app.services.fund_page.peer_cache import peer_cache


IST = timezone(timedelta(hours=5, minutes=30))
FRIDAY = datetime(2026, 10, 23, 18, 30, tzinfo=IST)
MONDAY = datetime(2026, 10, 26, 10, 0, tzinfo=IST)
SCENARIOS = (
    "base", "member_rohan", "member_priya", "not_held", "weekend",
    "stale_feed", "no_nav", "young_fund", "sold_fund", "no_holdings",
)
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("app.services.analytics.category_ranking").setLevel(logging.WARNING)
logging.getLogger("app.services.analytics.scorer").setLevel(logging.WARNING)
BUY_TYPES = {"purchase", "purchase_sip", "switch_in", "gift_in", "opening_balance"}
SELL_TYPES = {"redemption", "switch_out", "gift_out", "reversal"}
XIRR_DEBITS = {"purchase", "purchase_sip", "opening_balance", "gift_in", "switch_in"}
XIRR_CREDITS = {"redemption", "dividend_payout", "reversal", "gift_out", "switch_out"}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def oracle_fifo(rows) -> tuple[Decimal, Decimal]:
    """Independent FIFO replay over `(type, nav, units, amount)` tuples."""
    lots: deque[list[Decimal]] = deque()
    for row in rows:
        kind, nav, units, amount, *rest = row
        kind = getattr(kind, "value", kind)
        nav, units, amount = Decimal(nav), Decimal(units), Decimal(amount)
        if kind in BUY_TYPES:
            stamp_duty = Decimal(rest[0]) if rest and rest[0] is not None else Decimal("0")
            unit_cost = (amount + stamp_duty) / units if stamp_duty and units else nav
            lots.append([units, unit_cost])
        elif kind in SELL_TYPES:
            remaining = units
            while remaining > 0 and lots:
                taken = min(remaining, lots[0][0])
                lots[0][0] -= taken
                remaining -= taken
                if lots[0][0] == 0:
                    lots.popleft()
    held = sum((lot[0] for lot in lots), Decimal("0"))
    invested = sum((lot[0] * lot[1] for lot in lots), Decimal("0"))
    return held, invested


def oracle_xirr(flows: list[tuple[date, Decimal]]) -> Decimal | None:
    """Decimal-only bisection oracle, independent of production XIRR code."""
    if not flows or not any(value < 0 for _day, value in flows) or not any(
        value > 0 for _day, value in flows
    ):
        return None
    origin = min(day for day, _value in flows)

    def npv(rate: Decimal) -> Decimal:
        return sum(
            (
                value / ((Decimal("1") + rate) ** (Decimal((day - origin).days) / Decimal("365")))
                for day, value in flows
            ),
            Decimal("0"),
        )

    low, high = Decimal("-0.999999"), Decimal("1")
    low_value, high_value = npv(low), npv(high)
    while low_value * high_value > 0 and high < Decimal("1000000"):
        high *= Decimal("2")
        high_value = npv(high)
    if low_value * high_value > 0:
        return None
    for _ in range(220):
        middle = (low + high) / Decimal("2")
        value = npv(middle)
        if abs(value) < Decimal("0.00000000000001"):
            return middle
        if low_value * value <= 0:
            high = middle
        else:
            low, low_value = middle, value
    return (low + high) / Decimal("2")


class _DatabaseUniverse:
    async def get_category_peers(self, db, sebi_category, plan_type):
        schemes = (
            db.query(Scheme)
            .filter(Scheme.sebi_category == sebi_category, Scheme.plan_type == plan_type)
            .order_by(Scheme.id)
            .all()
        )
        return CategoryPeers(
            schemes=schemes, fund_count=len(schemes),
            representative_of={scheme.id: scheme.id for scheme in schemes},
        )


def _members(db):
    user = db.query(User).one()
    members = (
        db.query(HouseholdMember)
        .filter(HouseholdMember.user_id == user.id)
        .order_by(HouseholdMember.created_at, HouseholdMember.id)
        .all()
    )
    return user, members


def _raw_rows(db, member_ids, scheme_id):
    params = {f"m{index}": member.hex for index, member in enumerate(member_ids)}
    placeholders = ",".join(f":m{index}" for index in range(len(member_ids)))
    return db.execute(text(
        "SELECT t.type, t.nav, t.units, t.amount, t.stamp_duty, t.date FROM transactions t "
        "JOIN folios f ON f.id=t.folio_id "
        f"WHERE f.household_member_id IN ({placeholders}) AND f.scheme_id=:scheme "
        "ORDER BY t.date, t.id"
    ), {**params, "scheme": scheme_id.hex}).all()


def _oracles(db, member_ids, on_date: date):
    scheme_ids = [uuid.UUID(str(row[0])) for row in db.execute(text(
        "SELECT DISTINCT f.scheme_id FROM folios f WHERE f.household_member_id IN ("
        + ",".join(f":m{index}" for index in range(len(member_ids))) + ")"
    ), {f"m{index}": member.hex for index, member in enumerate(member_ids)}).all()]
    result = {}
    for scheme_id in scheme_ids:
        rows = _raw_rows(db, member_ids, scheme_id)
        units, invested = oracle_fifo(
            (kind, nav, units, amount, stamp_duty)
            for kind, nav, units, amount, stamp_duty, _day in rows
        )
        if units <= 0:
            continue
        nav_row = db.execute(text(
            "SELECT nav, date FROM nav_history WHERE scheme_id=:scheme AND date<=:day "
            "ORDER BY date DESC LIMIT 1"
        ), {"scheme": scheme_id.hex, "day": on_date.isoformat()}).first()
        units = units.quantize(Decimal("0.001"))
        invested = invested.quantize(Decimal("0.01"))
        value = (
            None
            if nav_row is None
            else (units * Decimal(str(nav_row.nav))).quantize(Decimal("0.01"))
        )
        result[scheme_id] = {
            "units": units, "invested": invested, "value": value,
            "gain": None if value is None else (value - invested).quantize(Decimal("0.01")),
            "rows": rows,
        }
    return result


def _held_scheme(db) -> uuid.UUID | None:
    _user, members = _members(db)
    held = _oracles(db, [member.id for member in members], FRIDAY.date())
    return sorted(held, key=str)[0] if held else None


def _mutate(db, scenario: str):
    if scenario in {"base", "member_rohan", "member_priya", "not_held", "weekend", "sold_fund"}:
        return
    scheme_id = _held_scheme(db)
    if scenario == "no_holdings":
        db.execute(text("DELETE FROM transaction_imports"))
        db.execute(text("DELETE FROM transactions"))
    elif scheme_id is not None:
        latest = db.execute(text(
            "SELECT max(date) FROM nav_history WHERE scheme_id=:scheme"
        ), {"scheme": scheme_id.hex}).scalar_one_or_none()
        if scenario == "stale_feed" and latest is not None:
            db.execute(text(
                "DELETE FROM nav_history WHERE scheme_id=:scheme AND date>date(:latest, '-13 days')"
            ), {"scheme": scheme_id.hex, "latest": str(latest)})
        elif scenario == "no_nav":
            db.execute(text("DELETE FROM nav_history WHERE scheme_id=:scheme"), {"scheme": scheme_id.hex})
        elif scenario == "young_fund" and latest is not None:
            db.execute(text(
                "DELETE FROM nav_history WHERE scheme_id=:scheme AND date<date(:latest, '-200 days')"
            ), {"scheme": scheme_id.hex, "latest": str(latest)})
    db.commit()


def _scope_for(scenario: str, members):
    if scenario == "member_rohan":
        return [members[0].id], str(members[0].id)
    if scenario == "member_priya":
        return [members[1].id], str(members[1].id)
    if scenario == "not_held":
        return [members[0].id], str(members[0].id)
    return [member.id for member in members], "combined"


def _money(value) -> Decimal | None:
    return None if value is None else Decimal(str(value)).quantize(Decimal("0.01"))


def _check_scenario(source: Path, temporary: Path, scenario: str):
    copy = temporary / f"fund-{scenario}.db"
    shutil.copy2(source, copy)
    engine = create_engine(f"sqlite:///{copy}", connect_args={"check_same_thread": False})
    sessions = sessionmaker(autoflush=False, bind=engine)
    with sessions() as db:
        _mutate(db, scenario)
        user, members = _members(db)
        member_ids, scope = _scope_for(scenario, members)
        oracle = _oracles(db, member_ids, (MONDAY if scenario == "weekend" else FRIDAY).date())
        all_schemes = [uuid.UUID(str(row[0])) for row in db.execute(text("SELECT id FROM schemes ORDER BY id")).all()]
        if scenario == "not_held":
            combined = _oracles(db, [member.id for member in members], FRIDAY.date())
            candidates = [scheme_id for scheme_id in combined if scheme_id not in oracle]
            target_ids = candidates[:1]
        elif scenario == "sold_fund":
            target_ids = [scheme_id for scheme_id in all_schemes if scheme_id not in oracle][:1]
        else:
            target_ids = list(oracle)

    def override_db():
        with sessions() as db:
            yield db

    now = MONDAY if scenario == "weekend" else FRIDAY
    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_active_user] = lambda: SimpleNamespace(id=user.id)
    app.dependency_overrides[get_now_ist] = lambda: now
    _holdings_cache.clear()
    _holdings_cache_generation.clear()
    peer_cache.clear()
    checks = {f"G{number}": True for number in range(1, 10)}
    details = []
    dml = []
    capture_dml = [False]

    def before_execute(_conn, _cursor, statement, _parameters, _context, _many):
        verb = statement.lstrip().split(None, 1)[0].upper() if statement.strip() else ""
        if capture_dml[0] and verb in {"INSERT", "UPDATE", "DELETE"}:
            dml.append(verb)

    event.listen(engine, "before_cursor_execute", before_execute)
    client = TestClient(app)

    class _PinnedDate(date):
        @classmethod
        def today(cls):
            return now.date()

    def compare(key: str, label: str, actual, expected) -> None:
        passed = actual == expected
        checks[key] &= passed
        if not passed:
            details.append(f"{key} {label}: actual={actual} expected={expected}")

    with (
        patch("app.services.analytics.scheme_universe.scheme_universe_client", _DatabaseUniverse()),
        patch("httpx.AsyncClient", side_effect=AssertionError("synthetic gate forbids network")),
        patch("app.services.dashboard.xirr.date", _PinnedDate),
        patch("app.services.dashboard.holdings.date", _PinnedDate),
        patch("app.services.dashboard.nav.date", _PinnedDate),
        patch("app.services.fund_page.summary.warm_nav_history", AsyncMock(return_value=None)),
        patch("app.services.analytics.category_ranking.warm_nav_history", AsyncMock(return_value=None)),
        patch("app.services.dashboard.nav.warm_nav_history", AsyncMock(return_value=None)),
        patch(
            "app.services.dashboard.nav._fetch_nav_history",
            AsyncMock(return_value=None),
        ),
    ):
        try:
            summaries = {}
            for scheme_id in target_ids:
                capture_dml[0] = True
                response = client.get(
                    f"/fund-page/{scheme_id}/summary", params={"scope": scope},
                )
                capture_dml[0] = False
                checks["G7"] &= response.status_code < 500
                if response.status_code != 200:
                    if scenario == "sold_fund" and response.status_code == 404:
                        continue
                    checks["G1"] = False
                    details.append(f"summary {scheme_id}: HTTP {response.status_code}")
                    continue
                body = response.json()
                summaries[scheme_id] = body
                expected = oracle.get(scheme_id)
                if expected is None:
                    checks["G7"] &= body.get("held") is False
                    continue
                compare("G1", f"{scheme_id} units", Decimal(body["details"]["units"]), expected["units"])
                compare("G1", f"{scheme_id} invested", _money(body["tiles"]["invested"]), _money(expected["invested"]))
                compare("G1", f"{scheme_id} value", _money(body["tiles"]["current_value"]), _money(expected["value"]))
                compare("G1", f"{scheme_id} gain", _money(body["tiles"]["total_gain"]), _money(expected["gain"]))

                flows = []
                for kind, _nav, _units, amount, stamp_duty, day in expected["rows"]:
                    kind = getattr(kind, "value", kind)
                    if kind in XIRR_DEBITS | XIRR_CREDITS:
                        paid = Decimal(str(amount)) + Decimal(str(stamp_duty or 0))
                        sign = Decimal("-1") if kind in XIRR_DEBITS else Decimal("1")
                        flows.append((date.fromisoformat(str(day)), sign * paid))
                if expected["value"] is not None:
                    flows.append((now.date(), expected["value"]))
                    expected_xirr = oracle_xirr(flows)
                    actual_xirr = body["tiles"].get("xirr")
                    if expected_xirr is not None and actual_xirr is not None:
                        passed = abs(Decimal(actual_xirr) - expected_xirr) <= Decimal("0.000001")
                        checks["G4"] &= passed
                        if not passed:
                            details.append(
                                f"G4 {scheme_id} xirr: actual={actual_xirr} expected={expected_xirr}"
                            )

                for suffix in (
                    "performance?period=1Y", "returns?mode=inception", "risk",
                    "portfolio-composition", "holdings", "manager",
                    "peers/series?period=1Y", "peers/returns", "peers/rolling?window=3",
                    "peers/period-returns?period=1Y", "peers/scatter", "insights", "overlap",
                ):
                    capture_dml[0] = not suffix.startswith(("peers/", "insights"))
                    checks["G7"] &= client.get(f"/fund-page/{scheme_id}/{suffix}").status_code < 500
                    capture_dml[0] = False

            valued_rows = [row for row in oracle.values() if row["value"] is not None]
            total_value = sum((row["value"] for row in valued_rows), Decimal("0"))
            total_invested = sum((row["invested"] for row in valued_rows), Decimal("0"))
            total_gain = total_value - total_invested
            root = "/household/aggregate" if scope == "combined" else f"/household-members/{scope}"
            holdings_response = client.get(f"{root}/holdings")
            portfolio_response = client.get(f"{root}/portfolio-summary")
            home_response = client.get(f"{root}/home/summary")
            checks["G7"] &= all(r.status_code < 500 for r in (holdings_response, portfolio_response, home_response))
            if portfolio_response.status_code == 200:
                portfolio = portfolio_response.json()
                compare("G2", "portfolio total_value", _money(portfolio.get("total_value")), _money(total_value))
                compare("G2", "portfolio total_invested", _money(portfolio.get("total_invested")), _money(total_invested))
                compare("G2", "portfolio unrealized_gain", _money(portfolio.get("unrealized_gain")), _money(total_gain))
            if home_response.status_code == 200:
                compare("G2", "home total_value", _money(home_response.json().get("total_value")), _money(total_value))

            if scope == "combined" and len(members) >= 2:
                with sessions() as db:
                    member_oracles = [_oracles(db, [member.id], now.date()) for member in members]
                for scheme_id, row in oracle.items():
                    checks["G3"] &= row["units"] == sum(
                        (part.get(scheme_id, {}).get("units", Decimal("0")) for part in member_oracles),
                        Decimal("0"),
                    )
                    checks["G3"] &= _money(row["invested"]) == _money(sum(
                        (part.get(scheme_id, {}).get("invested", Decimal("0")) for part in member_oracles),
                        Decimal("0"),
                    ))

            shares = [
                Decimal(body["tiles"]["share_of_portfolio_pct"])
                for body in summaries.values()
                if body.get("held") and body["tiles"].get("share_of_portfolio_pct") is not None
            ]
            if total_value and shares:
                checks["G8"] &= abs(sum(shares, Decimal("0")) - Decimal("100")) <= Decimal("0.0001")

            checks["G5"] = all(
                client.get(f"/fund-page/{scheme_id}/performance?period=1Y").status_code < 500
                and client.get(f"/fund-page/{scheme_id}/returns?mode=inception").status_code < 500
                and client.get(f"/fund-page/{scheme_id}/risk").status_code < 500
                for scheme_id in target_ids
            )
            movers = client.get(f"{root}/home/movers?by=fund")
            checks["G6"] = movers.status_code < 500
            checks["G9"] = not dml
        finally:
            client.close()
            app.dependency_overrides.pop(get_db, None)
            app.dependency_overrides.pop(get_active_user, None)
            app.dependency_overrides.pop(get_now_ist, None)
            event.remove(engine, "before_cursor_execute", before_execute)
            engine.dispose()

    calibration = "volatility=n/a drawdown=n/a sharpe=n/a beta=n/a ter_gap=n/a"
    return checks, details, calibration


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("db_path", type=Path)
    args = parser.parse_args()
    source = args.db_path.resolve()
    before = sha256(source)
    all_passed = True
    print(f"SOURCE {source}")
    print(f"SHA256 before {before}")
    with tempfile.TemporaryDirectory(prefix="unifolio-fund-gate-") as directory:
        temporary = Path(directory)
        for scenario in SCENARIOS:
            try:
                checks, details, calibration = _check_scenario(source, temporary, scenario)
            except Exception as exc:
                checks = {f"G{number}": False for number in range(1, 10)}
                details = [f"{type(exc).__name__}: {exc}"]
                calibration = "volatility=n/a drawdown=n/a sharpe=n/a beta=n/a ter_gap=n/a"
            passed = all(checks.values())
            all_passed &= passed
            verdict = "PASS" if passed else "FAIL"
            print(f"{verdict} {scenario} " + " ".join(f"{key}={'ok' if value else 'bad'}" for key, value in checks.items()))
            for detail in details:
                print(f"  {detail}")
            print(f"  calibration {calibration}")
    after = sha256(source)
    unchanged = before == after
    all_passed &= unchanged
    print(f"SHA256 after  {after}")
    print(f"{'PASS' if unchanged else 'FAIL'} source database unchanged")
    print(f"{'PASS' if all_passed else 'FAIL'} fund synthetic gate")
    return 0 if all_passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
