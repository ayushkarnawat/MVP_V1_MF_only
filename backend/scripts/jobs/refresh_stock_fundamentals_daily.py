import asyncio
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from app.db.session import SessionLocal
from app.services.analytics.stock_fundamentals_client import refresh_stock_fundamentals, refresh_index_valuations

logger = logging.getLogger(__name__)


async def main_async(db) -> int:
    stock_success = False
    try:
        result = await refresh_stock_fundamentals(db)
        stock_success = result.success
        logger.info("stock_fundamentals_daily success=%s universe=%d written=%d failed=%d seconds=%.1f",
                    result.success, result.universe_count, result.rows_written, result.failed, result.seconds)
        if not result.success or result.failed:
            logger.warning("STOCK_FUNDAMENTALS_ALERT stock_refresh_incomplete")
    except Exception:
        db.rollback()
        logger.exception("STOCK_FUNDAMENTALS_ALERT stock_refresh_failed")
    # Independent try block: either pipeline may succeed when the other fails.
    try:
        if not await refresh_index_valuations(db):
            logger.warning("STOCK_FUNDAMENTALS_ALERT index_refresh_incomplete")
    except Exception:
        db.rollback()
        logger.exception("STOCK_FUNDAMENTALS_ALERT index_refresh_failed")
    return 0 if stock_success else 1


def main():
    logging.basicConfig(level=logging.INFO)
    logging.getLogger("httpx").setLevel(logging.WARNING)  # its INFO lines carry the Yahoo crumb in the URL
    with SessionLocal() as db:
        raise SystemExit(asyncio.run(main_async(db)))


if __name__ == "__main__":
    main()
