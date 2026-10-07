import asyncio
import logging
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))
from sqlalchemy.orm import Session
from app.db.session import SessionLocal
from app.services.analytics.scheme_master import refresh_scheme_master

logger = logging.getLogger(__name__)


async def main_async(db: Session) -> None:
    result = await refresh_scheme_master(db)
    logger.info("refresh_scheme_master_daily: rows=%s inserted=%s updated=%s deactivated=%s",
                result.rows, result.inserted, result.updated, result.deactivated)


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    with SessionLocal() as db:
        asyncio.run(main_async(db))


if __name__ == "__main__":
    main()
