import asyncio
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.services.analytics.amfi_aaum_client import refresh_aaum_data

logger = logging.getLogger(__name__)


async def main_async(db: Session) -> None:
    success = await refresh_aaum_data(db)
    logger.info("refresh_aaum_quarterly: success=%s", success)


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    with SessionLocal() as db:
        asyncio.run(main_async(db))


if __name__ == "__main__":
    main()
