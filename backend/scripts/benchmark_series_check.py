"""Read-only comparison with same-date printed returns. No network or writes.

    python scripts/benchmark_series_check.py --index nifty_1d_rate --as-of 2026-09-30 \
        --printed 1Y=6.2 --printed 3Y=6.4 --printed 5Y=5.5
    python scripts/benchmark_series_check.py --fixture tests/fixtures/benchmark_series_check.json
    python scripts/benchmark_series_check.py --metal gold --user-id UUID --held-etf UUID --as-of 2026-09-30 --printed 1Y=10

Printed inputs must come from a factsheet at that exact as-on date. The report
never sets active in the database: the owner reviews it before changing that flag.
Fixture output is synthetic and cannot activate a real series. The database path
uses stored daily levels/NAV only and aborts on any write, as measure_*.py does.
"""
from __future__ import annotations

import argparse
import json
import re
import sqlite3
import sys
import uuid
from dataclasses import dataclass, field
from datetime import date, timedelta
from decimal import Decimal
from pathlib import Path
from urllib.parse import quote

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import create_engine, event, select
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from app.models.enums import BenchmarkReturnType
from app.models.reference import BenchmarkIndexHistory, NavHistory, Scheme, SchemeAaum
from app.services.analytics.risk_metrics import years_ago

PERIODS = {"1Y": 1, "3Y": 3, "5Y": 5}
SERIES_TOLERANCE_PP = Decimal("0.05")
METAL_TOLERANCE_PP = Decimal("0.5")
Series = list[tuple[date, Decimal]]


@dataclass(frozen=True)
class SeriesCheck:
    key: str
    period: str
    as_of: date
    computed: Decimal | None
    printed: Decimal | None
    difference_pp: Decimal | None
    passed: bool


def _level(rows: Series, anchor: date, *, exact: bool = False) -> tuple[date, Decimal] | None:
    available = [(day, value) for day, value in rows if day <= anchor]
    if not available:
        return None
    day = max(day for day, _ in available)
    # Never skip a bad last observation in favour of a better-looking old one.
    values = {value for when, value in available if when == day}
    if len(values) != 1:
        return None
    value = values.pop()
    if not value.is_finite() or value <= 0 or (anchor - day).days > (0 if exact else 7):
        return None
    return day, value


def check_series(key: str, rows: Series, as_of: date, printed: dict[str, Decimal]) -> list[SeriesCheck]:
    checks = []
    last = _level(rows, as_of, exact=True)
    for period, years in PERIODS.items():
        first = _level(rows, years_ago(as_of, years))
        value = None
        if first is not None and last is not None and last[0] > first[0]:
            days = Decimal((last[0] - first[0]).days)
            value = ((last[1] / first[1]) ** (Decimal("365") / days) - Decimal("1")) * Decimal("100")
        stated = printed.get(period)
        valid = stated is not None and stated.is_finite()
        difference = abs(value - stated) if value is not None and valid else None
        checks.append(SeriesCheck(key, period, as_of, value, stated, difference,
                                  difference is not None and difference <= SERIES_TOLERANCE_PP))
    return checks


@dataclass(frozen=True)
class MetalETF:
    scheme_id: str
    metal: str
    aaum: Decimal
    navs: Series = field(default_factory=list)
    held: bool = True
    plain_metal: bool = True


@dataclass(frozen=True)
class MetalCheck:
    scheme_id: str | None
    use_etf: bool
    computed: Decimal | None
    printed: Decimal
    difference_pp: Decimal | None


def check_metal_etf(candidates: list[MetalETF], metal: str, as_of: date, printed: Decimal) -> MetalCheck:
    eligible = [c for c in candidates if c.held and c.plain_metal and c.metal == metal
                and c.aaum.is_finite() and c.aaum > 0]
    if not eligible:
        return MetalCheck(None, False, None, printed, None)
    # Deterministic tie, not a choice of whichever ETF happens to pass the test.
    chosen = sorted(eligible, key=lambda c: (-c.aaum, c.scheme_id))[0]
    first = _level(chosen.navs, years_ago(as_of, 1))
    last = _level(chosen.navs, as_of, exact=True)
    value = (last[1] / first[1] - Decimal("1")) * Decimal("100") if first and last else None
    difference = abs(value - printed) if value is not None and printed.is_finite() else None
    return MetalCheck(chosen.scheme_id, difference is not None and difference <= METAL_TOLERANCE_PP,
                      value, printed, difference)


def load_metal_etfs(db: Session, user_id: uuid.UUID, metal: str, as_of: date, *, verified_scheme_ids: set[uuid.UUID]) -> list[MetalETF]:
    """Read held units and latest monthly AAUM at the printed date.

    The executor supplies IDs verified to track plain physical metal. Scheme
    names cannot establish that (for example, "Goldman" is not a gold fund).
    No NAV enrichment, no inference from a name, no unheld candidates.
    """
    from app.models.user import HouseholdMember
    from app.services.dashboard.holdings import FifoState, _load_folio_transactions

    members = list(db.scalars(select(HouseholdMember.id).where(HouseholdMember.user_id == user_id)))
    folios, transactions = _load_folio_transactions(db, members)
    held = set()
    for folio in folios:
        state = FifoState()
        for txn in transactions.get(folio.id, []):
            if txn.date <= as_of:
                state.apply(txn)
        if state.units > 0:
            held.add(folio.scheme_id)
    result = []
    for scheme in db.scalars(select(Scheme).where(Scheme.id.in_(held & verified_scheme_ids))):
        aum = db.scalar(select(SchemeAaum.aaum_value).where(
            SchemeAaum.scheme_id == scheme.id, SchemeAaum.reference_period <= as_of
        ).order_by(SchemeAaum.reference_period.desc()).limit(1))
        if aum is None:
            continue
        navs = list(db.execute(select(NavHistory.date, NavHistory.nav).where(
            NavHistory.scheme_id == scheme.id, NavHistory.date <= as_of).order_by(NavHistory.date)).all())
        result.append(MetalETF(str(scheme.id), metal, aum, navs))
    return result


def guard_read_only(engine) -> None:
    @event.listens_for(engine, "before_cursor_execute")
    def no_write(conn, cursor, statement, parameters, context, executemany):
        # Our queries are SELECT only. Refuse CTEs too, since they can write.
        if (not statement.lstrip().upper().startswith("SELECT ") or re.search(
                r"\b(INSERT|UPDATE|DELETE|REPLACE|CREATE|ALTER|DROP|TRUNCATE|INTO|CALL|COPY)\b", statement, re.I)):
            raise RuntimeError("Series check is read-only; database write refused")


def read_only_engine(url: str):
    parsed = make_url(url)
    if parsed.get_backend_name() == "sqlite":
        path = Path(parsed.database or "").resolve()
        if not path.is_file():
            raise ValueError("An existing local database file is required")
        # SQL guards alone would not prevent SQLite creating a missing file.
        uri = "file:" + quote(str(path), safe="/") + "?mode=ro"
        engine = create_engine(parsed, creator=lambda: sqlite3.connect(uri, uri=True))
    else:
        engine = create_engine(parsed).execution_options(postgresql_readonly=True)
    guard_read_only(engine)
    return engine


def _format(value: Decimal | None) -> str:
    return "not available" if value is None else format(value.quantize(Decimal("0.000001")), "f")


def print_checks(checks: list[SeriesCheck]) -> None:
    print("Index | Period | Computed % | Printed % | Difference points | Result")
    for c in checks:
        print(f"{c.key} | {c.period} | {_format(c.computed)} | {_format(c.printed)} | {_format(c.difference_pp)} | {'PASS' if c.passed else 'FAIL'}")


def _series(rows) -> Series:
    return [(date.fromisoformat(day), Decimal(value)) for day, value in rows]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--fixture", type=Path)
    parser.add_argument("--index")
    parser.add_argument("--metal", choices=("gold", "silver"))
    parser.add_argument("--user-id", type=uuid.UUID)
    parser.add_argument("--held-etf", action="append", type=uuid.UUID, default=[], help="ID verified to track plain physical gold or silver; repeat for each held candidate")
    parser.add_argument("--as-of", type=date.fromisoformat)
    parser.add_argument("--printed", action="append", default=[], metavar="1Y=percent")
    args = parser.parse_args(argv)
    if args.fixture:
        payload = json.loads(args.fixture.read_text(), parse_float=Decimal)
        failed = False
        for case in payload.get("series", []):
            checks = check_series(case["key"], _series(case["levels"]), date.fromisoformat(case["as_of"]),
                                  {p: Decimal(v) for p, v in case["printed"].items()})
            print_checks(checks)
            failed |= not all(c.passed for c in checks)
        for case in payload.get("metals", []):
            candidates = [MetalETF(c["scheme_id"], case["metal"], Decimal(c["aaum"]), _series(c["navs"])) for c in case["etfs"]]
            check = check_metal_etf(candidates, case["metal"], date.fromisoformat(case["as_of"]), Decimal(case["printed"]))
            print(f"{case['metal']} | 1Y | {_format(check.computed)} | {_format(check.printed)} | {_format(check.difference_pp)} | {'PASS' if check.use_etf else 'FAIL'}")
            failed |= not check.use_etf
        return int(failed)
    if not args.as_of or bool(args.index) == bool(args.metal) or (args.metal and not args.user_id):
        parser.error("Supply --as-of and either --index or --metal with --user-id")
    if args.metal and not args.held_etf:
        parser.error("A metal check needs --held-etf IDs verified to track plain physical gold or silver")
    printed = {period: Decimal(value) for period, value in (item.split("=", 1) for item in args.printed)}
    from app.config import settings
    engine = read_only_engine(settings.database_url)
    try:
        with Session(engine, autoflush=False) as db:
            if args.index:
                rows = list(db.execute(select(BenchmarkIndexHistory.date, BenchmarkIndexHistory.value).where(
                    BenchmarkIndexHistory.index_name == args.index,
                    BenchmarkIndexHistory.return_type == BenchmarkReturnType.TRI)).all())
                checks = check_series(args.index, rows, args.as_of, printed)
                print_checks(checks)
                return int(not all(c.passed for c in checks))
            if "1Y" not in printed:
                parser.error("A metal check needs --printed 1Y=percent")
            result = check_metal_etf(load_metal_etfs(db, args.user_id, args.metal, args.as_of, verified_scheme_ids=set(args.held_etf)), args.metal, args.as_of, printed["1Y"])
            print("Metal | Period | Computed % | Printed % | Difference points | Result")
            print(f"{args.metal} | 1Y | {_format(result.computed)} | {_format(result.printed)} | {_format(result.difference_pp)} | {'PASS' if result.use_etf else 'FAIL'}")
            return int(not result.use_etf)
    finally:
        engine.dispose()


if __name__ == "__main__":
    raise SystemExit(main())
