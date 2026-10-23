"""Read-only timing check for the pieces the Home screen would call (planning check H14/N2).

    python scripts/measure_home_staging.py --user-id <uuid> [--runs 5] [--limit 1.5] [--include-live-fetch]

Run it on the staging VM against the staging database, with a household that has real
statements. It calls the same service functions the Dashboard calls today and times:

  1. holdings, cold (cache cleared; the first call after a deploy or 15 minutes idle)
  2. holdings, warm (served from the per-worker cache)
  3. asset-class allocation through look-through (Home donut)
  4. the bulk NAV read a Home value series would need (one query for every held scheme)
  5. the Dashboard's aggregate holdings + XIRR (for comparison only; Home must not call it)

Never writes: a before_flush guard aborts on any ORM write. By default a cold holdings call
that needs a live NAV download is refused (downloading writes nav_history rows, exactly what
opening the Dashboard does today). Pass --include-live-fetch to allow those cache writes and
measure the real cold cost; nothing else is written. Prints only counts and milliseconds,
never names or amounts.
"""
import argparse
import asyncio
import statistics
import sys
import time
import uuid
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import create_engine, event, func, select
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from app.models.reference import NavHistory
from app.services.analytics.asset_allocation_lookthrough import compute_asset_allocation
from app.services.dashboard.aggregate import get_aggregate_holdings
from app.services.dashboard.allocation import compute_allocation
from app.services.dashboard.holdings import compute_holdings, invalidate_holdings_cache
from app.services.dashboard.household_members import list_household_members


class WriteAttempted(RuntimeError):
    pass


def guard(db: Session, allow_nav_writes: bool):
    @event.listens_for(db, "before_flush")
    def _no_flush(session, ctx, instances):
        objs = list(session.new) + list(session.dirty) + list(session.deleted)
        if allow_nav_writes and all(isinstance(o, NavHistory) for o in objs):
            return
        raise WriteAttempted(
            "the call tried to write (a live NAV download?). Re-run with --include-live-fetch "
            "to allow nav_history cache writes. Nothing was committed."
        )


def ms(t0: float) -> float:
    return (time.perf_counter() - t0) * 1000


def timed(label: str, fn, runs: int):
    """fn is an async callable; the first call is reported as cold, the rest as warm."""
    out = []
    for _ in range(runs):
        t0 = time.perf_counter()
        asyncio.run(fn())
        out.append(ms(t0))
    return label, out


def bulk_nav_read(db: Session, scheme_ids: list[uuid.UUID], years: int) -> tuple[int, float]:
    start = date.today() - timedelta(days=365 * years)
    t0 = time.perf_counter()
    rows = db.execute(
        select(NavHistory.scheme_id, NavHistory.date, NavHistory.nav)
        .where(NavHistory.scheme_id.in_(scheme_ids), NavHistory.date >= start)
    ).all()
    return len(rows), ms(t0)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--user-id", required=True, type=uuid.UUID)
    ap.add_argument("--runs", type=int, default=5)
    ap.add_argument("--limit", type=float, default=1.5, help="Home first-load budget in seconds")
    ap.add_argument("--include-live-fetch", action="store_true")
    a = ap.parse_args()

    from app.config import settings
    url = make_url(settings.database_url)
    print(f"Database: {url.render_as_string(hide_password=True)}", flush=True)
    if a.include_live_fetch:
        print("NOTE: live NAV downloads allowed; nav_history cache rows may be written (same as opening the Dashboard).")
    engine = create_engine(url)
    try:
        with Session(engine, autoflush=False) as db:
            guard(db, a.include_live_fetch)
            ids = [m.id for m in list_household_members(db, a.user_id)]
            print(f"members: {len(ids)}")

            for i in ids:
                invalidate_holdings_cache(i)
            t0 = time.perf_counter()
            holdings = asyncio.run(compute_holdings(db, ids))
            cold = ms(t0)
            schemes = sorted({uuid.UUID(h.scheme_id) for h in holdings})
            print(f"holdings: {len(holdings)} rows, {len(schemes)} schemes")
            print(f"1. holdings cold: {cold:.0f} ms")
            _, warm = timed("warm", lambda: compute_holdings(db, ids), a.runs)
            print(f"2. holdings warm: median {statistics.median(warm):.0f} ms, worst {max(warm):.0f} ms")

            _, alloc = timed("alloc", lambda: compute_allocation(db, ids), a.runs)
            print(f"3a. dashboard allocation: median {statistics.median(alloc):.0f} ms")
            _, look = timed("look", lambda: compute_asset_allocation(db, ids), a.runs)
            print(f"3b. look-through asset classes: first {look[0]:.0f} ms, median {statistics.median(look):.0f} ms, worst {max(look):.0f} ms")

            for years in (1, 5, 20):
                n, t = bulk_nav_read(db, schemes, years)
                print(f"4. bulk NAV read {years}y: {n} rows in {t:.0f} ms")

            t0 = time.perf_counter()
            asyncio.run(get_aggregate_holdings(db, a.user_id))
            print(f"5. (comparison) dashboard aggregate holdings + XIRR: {ms(t0):.0f} ms")

            # Budget: what Home needs on a cold open (holdings cold + look-through + a 1-year NAV read).
            _, n1 = bulk_nav_read(db, schemes, 1)
            total = cold + look[0] + n1
            ok = total <= a.limit * 1000
            print(f"\nHome cold-open estimate (1 + 3b + 4 at 1y): {total:.0f} ms | budget {a.limit*1000:.0f} ms -> "
                  f"{'PASS' if ok else 'FAIL'}", flush=True)
            db.rollback()
    finally:
        engine.dispose()
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
