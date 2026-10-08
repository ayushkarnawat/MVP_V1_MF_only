import asyncio
import logging
import sys
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.enums import BenchmarkIndex
from app.services.analytics.nse_indices_client import ensure_index_history_fresh
from app.services.analytics.risk_metrics import years_ago

logger = logging.getLogger(__name__)


async def main_async(db: Session) -> None:
    end_date = date.today()
    start_date = years_ago(end_date, 10)
    results = [
        # fresh_within=0: the job tops up every morning; only Analytics treats
        # history up to 4 days old as fresh (8 Oct).
        await ensure_index_history_fresh(db, index, start_date, end_date, fresh_within=timedelta(0))
        for index in BenchmarkIndex
    ]
    succeeded = sum(results)
    logger.info(
        "refresh_benchmark_daily: indexes=%d succeeded=%d success=%s",
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
