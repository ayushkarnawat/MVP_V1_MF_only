import asyncio
import logging
import sys
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.enums import BenchmarkIndex, BenchmarkReturnType
from app.services.analytics.nse_indices_client import ensure_index_history_fresh
from app.services.analytics.risk_metrics import years_ago

logger = logging.getLogger(__name__)


# TRI from 1990 (decided 9 Oct): one request per index returns its full history
# (~1 MB, ~0.3 s), and NSE starts each index at its own base date (1995-2005).
# Old scenario windows need it; price stays at 10 years since nothing compares
# against price any more.
_TRI_START = date(1990, 1, 1)


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
        for return_type in BenchmarkReturnType
    ]
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
