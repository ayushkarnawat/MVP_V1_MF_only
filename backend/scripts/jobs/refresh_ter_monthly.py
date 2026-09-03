import asyncio
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.services.analytics.amfi_ter_client import refresh_ter_data

logger = logging.getLogger(__name__)


async def main_async(db: Session) -> None:
    success = await refresh_ter_data(db)
    logger.info("refresh_ter_monthly: success=%s", success)


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    with SessionLocal() as db:
        asyncio.run(main_async(db))


if __name__ == "__main__":
    main()
