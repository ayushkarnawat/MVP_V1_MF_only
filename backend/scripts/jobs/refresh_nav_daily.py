import asyncio
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from sqlalchemy import distinct
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.folio import Folio
from app.models.reference import Scheme
from app.services.dashboard.nav import warm_nav_history

logger = logging.getLogger(__name__)


async def main_async(db: Session) -> None:
    schemes = (
        db.query(Scheme)
        .join(Folio, Folio.scheme_id == Scheme.id)
        .filter(Scheme.id.in_(db.query(distinct(Folio.scheme_id))))
        .all()
    )
    await warm_nav_history(db, schemes)
    logger.info("refresh_nav_daily: held_schemes=%d success=True", len(schemes))


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    with SessionLocal() as db:
        asyncio.run(main_async(db))


if __name__ == "__main__":
    main()
