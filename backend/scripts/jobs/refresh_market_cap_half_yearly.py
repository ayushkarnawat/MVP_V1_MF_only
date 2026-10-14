import asyncio
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from app.db.session import SessionLocal
from app.services.analytics.amfi_market_cap_client import refresh_market_cap

logger = logging.getLogger(__name__)


async def main_async(db) -> None:
    result = await refresh_market_cap(db)
    logger.info("refresh_market_cap_half_yearly: success=%s loaded=%d failed=%d rows=%d seconds=%.1f",
                result.success, len(result.periods_loaded), len(result.periods_failed), result.rows_written, result.seconds)


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    with SessionLocal() as db:
        asyncio.run(main_async(db))


if __name__ == "__main__":
    main()
