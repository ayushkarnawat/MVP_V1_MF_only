import asyncio
import logging
import sys
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.enums import BenchmarkIndex, BenchmarkReturnType
from app.models.reference import BenchmarkIndexMaster
from app.services.analytics.benchmark_registry import INDICES
from app.services.analytics.nse_indices_client import _cached_date_bounds, ensure_index_history_fresh
from app.services.analytics.risk_metrics import years_ago

logger = logging.getLogger(__name__)


# TRI from 1990 (decided 9 Oct): one request per index returns its full history
# (~1 MB, ~0.3 s), and NSE starts each index at its own base date (1995-2005).
# Old scenario windows need it; price stays at 10 years since nothing compares
# against price any more.
_TRI_START = date(1990, 1, 1)

# Who reads what (PR #12 review L-f): TRI of all eight indices is read by the Analytics windows
# (benchmark_windows.load_index_levels), and the Individual Fund chart will read the TRI of the four legacy
# indices (its plan, Task 4, goes through _benchmark_index_for_category). PRICE rows of the four newer indices
# (Next 50, Smallcap 250, 100, 200) are read by nothing and no planned page reads them. They are fetched only
# because this loop covers every enum member and test_refresh_benchmark_daily_* pins 16 fetches. To stop,
# set this to LEGACY_BENCHMARK_INDICES and change that test to expect 12.
_PRICE_INDICES = tuple(BenchmarkIndex)

# The registry indices beyond the legacy enum (71 of them) are fetched one after another. Each is topped up from a
# month before its newest stored day (a full history only the first time), and the loop waits between requests so
# one morning's run is never a burst of dozens of ~1 MB downloads from the same address (Run 7 backend review).
_TOP_UP_DAYS = 30
_PACE_SECONDS = 1.0


async def main_async(db: Session) -> None:
    end_date = date.today()
    starts = {BenchmarkReturnType.PRICE: years_ago(end_date, 10), BenchmarkReturnType.TRI: _TRI_START}
    results = [
        # fresh_within=0: the job tops up every morning; only Analytics treats
        # history up to 4 days old as fresh (8 Oct).
        await ensure_index_history_fresh(
            db, index, starts[return_type], end_date, return_type=return_type, fresh_within=timedelta(0)
        )
        for index in BenchmarkIndex
        for return_type in starts
        if return_type is BenchmarkReturnType.TRI or index in _PRICE_INDICES
    ]
    # Seed new registry rows without overwriting activation decisions. Existing
    # installations gain a verified name by adding one IndexSpec row, not a migration.
    present = {row.key for row in db.query(BenchmarkIndexMaster).all()}
    for spec in INDICES:
        if spec.key not in present:
            db.add(BenchmarkIndexMaster(**spec.__dict__))
    db.commit()
    for spec in db.query(BenchmarkIndexMaster).order_by(BenchmarkIndexMaster.key):
        if spec.key in set(BenchmarkIndex):
            continue
        # Inactive price series are collected for the read-only printed-return
        # check, but selection must not expose them until that check passes.
        bounds = _cached_date_bounds(db, spec.key, BenchmarkReturnType.TRI)
        start = _TRI_START if bounds is None else bounds[1] - timedelta(days=_TOP_UP_DAYS)
        results.append(await ensure_index_history_fresh(
            db, spec.key, start, end_date,
            return_type=BenchmarkReturnType.TRI, fresh_within=timedelta(0),
        ))
        await asyncio.sleep(_PACE_SECONDS)
    succeeded = sum(results)
    logger.info(
        "refresh_benchmark_daily: fetches=%d succeeded=%d success=%s",
        len(results),
        succeeded,
        succeeded == len(results),
    )


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    with SessionLocal() as db:
        asyncio.run(main_async(db))


if __name__ == "__main__":
    main()
