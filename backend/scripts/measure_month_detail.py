"""Read-only timing check for the History month-detail computation (decision D6).

    python scripts/measure_month_detail.py <household_member_id> [--limit 1.0]
    python scripts/measure_month_detail.py --aggregate [--user-id <uuid>] [--limit 1.0]

Calls the same service function the endpoints call, in-process. Never writes: a
before_flush guard aborts if the call would persist anything (e.g. the cached
snapshots are stale and get_snapshots wants to rebuild them) -- refresh them
first by opening the History page / GET /household-members/{id}/snapshots.
"""
import argparse
import asyncio
import statistics
import sys
import time
import uuid
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import create_engine, event, select
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from app.models.snapshot import PortfolioSnapshot
from app.models.user import HouseholdMember
from app.services.dashboard.household_members import list_household_members
from app.services.dashboard.snapshots import get_aggregate_month_detail, get_month_detail


class WriteAttempted(RuntimeError):
    pass


def forbid_writes(db: Session):
    """Installs the guard; returns a function that removes it (harness temp DBs only)."""
    @event.listens_for(db, "before_flush")
    def _no_flush(session, ctx, instances):
        if session.new or session.dirty or session.deleted:
            raise WriteAttempted(
                "month-detail tried to write (cached snapshots stale or missing); "
                "refresh them via the snapshots endpoint first. Nothing was committed."
            )
    return lambda: event.remove(db, "before_flush", _no_flush)


def snapshot_months(db: Session, member_ids: list[uuid.UUID]) -> list[date]:
    rows = db.scalars(select(PortfolioSnapshot.snapshot_month)
                      .where(PortfolioSnapshot.household_member_id.in_(member_ids)).distinct())
    return sorted(rows)


def spread(months: list[date], n: int = 10) -> list[date]:
    """n months spread across the history, always including first, middle, latest;
    repeats months when fewer than n exist."""
    if not months:
        return []
    if len(months) == 1:
        return months * n
    idx = [round(i * (len(months) - 1) / (n - 1)) for i in range(n)]
    if len(months) < n:  # repeat to fill, still covering first/middle/latest
        idx = [i % len(months) for i in range(n)]
        idx[0], idx[n // 2], idx[-1] = 0, len(months) // 2, len(months) - 1
    return [months[i] for i in idx]


def time_scope(db: Session, member_ids: list[uuid.UUID], *, user_id: uuid.UUID | None = None,
               aggregate: bool = False, runs: int = 10) -> dict:
    """Times the service call only. Returns months, funds, cold (ms, first call, first
    month), per-call ms list over `runs` spread months, median, worst."""
    months = snapshot_months(db, member_ids)
    if not months:
        raise SystemExit("No snapshot months for this scope; populate snapshots first.")
    chosen = spread(months, runs)

    async def call(month):
        if aggregate:
            return await get_aggregate_month_detail(db, user_id, month)
        return await get_month_detail(db, member_ids, month)

    async def run():
        t0 = time.perf_counter()
        first = await call(chosen[0])
        cold = (time.perf_counter() - t0) * 1000
        timings, funds = [], len(first.funds) if first else 0
        for month in chosen:
            t0 = time.perf_counter()
            detail = await call(month)
            timings.append((month, (time.perf_counter() - t0) * 1000))
            if detail is None:
                raise RuntimeError(f"no detail for {month}")
            funds = max(funds, len({f.scheme_id for f in detail.funds}))
        return cold, timings, funds

    cold, timings, funds = asyncio.run(run())
    ms = [t for _, t in timings]
    return {"months_available": len(months), "funds": funds, "cold_ms": cold, "timings": timings,
            "median_ms": statistics.median(ms), "worst_ms": max(ms)}


def report(label: str, r: dict, limit_s: float) -> bool:
    print(f"\n== {label}: {r['months_available']} months in history, up to {r['funds']} funds ==")
    print(f"cold first call: {r['cold_ms']:.0f} ms")
    for month, t in r["timings"]:
        print(f"  {month}  {t:.0f} ms")
    ok = r["median_ms"] <= limit_s * 1000
    print(f"median {r['median_ms']:.0f} ms | worst {r['worst_ms']:.0f} ms | limit {limit_s*1000:.0f} ms -> "
          f"{'PASS' if ok else 'FAIL'}", flush=True)
    return ok


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("member_id", nargs="?", type=uuid.UUID)
    ap.add_argument("--aggregate", action="store_true", help="the user's whole household")
    ap.add_argument("--user-id", type=uuid.UUID, help="with --aggregate; defaults to the member's owner")
    ap.add_argument("--limit", type=float, default=1.0, help="median limit in seconds")
    a = ap.parse_args()
    if not a.member_id and not (a.aggregate and a.user_id):
        ap.error("give a member id, or --aggregate with --user-id")
    from app.config import settings
    url = make_url(settings.database_url)
    print(f"Database: {url.render_as_string(hide_password=True)}", flush=True)
    engine = create_engine(url)
    try:
        with Session(engine, autoflush=False) as db:
            forbid_writes(db)
            if a.aggregate:
                user_id = a.user_id or db.get(HouseholdMember, a.member_id).user_id
                ids = [m.id for m in list_household_members(db, user_id)]
                ok = report("aggregate", time_scope(db, ids, user_id=user_id, aggregate=True), a.limit)
            else:
                ok = report(f"member {a.member_id}", time_scope(db, [a.member_id]), a.limit)
            db.rollback()
    finally:
        engine.dispose()
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
