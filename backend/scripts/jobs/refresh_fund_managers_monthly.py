# backend/scripts/jobs/refresh_fund_managers_monthly.py
import asyncio
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from app.db.session import SessionLocal
from app.services.analytics.amfi_factsheet_client import refresh_fund_managers

logger = logging.getLogger(__name__)


async def main_async(db) -> None:
    result = await refresh_fund_managers(db)
    logger.info(
        "refresh_fund_managers_monthly: success=%s amcs_processed=%d amcs_failed=%d "
        "schemes_matched=%d schemes_unmatched=%d seconds=%.1f",
        result.success, result.amcs_processed, result.amcs_failed,
        result.schemes_matched, result.schemes_unmatched, result.seconds,
    )


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    with SessionLocal() as db:
        asyncio.run(main_async(db))


if __name__ == "__main__":
    main()
