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
from app.services.analytics.scheme_universe import get_category_universe
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
    # Fix D (7 Oct): also every peer in the held funds' SEBI categories, so
    # category ranking and the quality score find them fresh at 06:30 and the
    # Analytics run downloads nothing. Its own warm-up stays as a safety net
    # for a category nobody held at 06:00.
    held_ids = {scheme.id for scheme in schemes}
    categories = sorted({s.sebi_category for s in schemes if s.amfi_code and s.sebi_category})
    peers: dict = {}
    for category in categories:
        try:
            universe = await get_category_universe(db, category)
        except Exception:  # one bad category must not stop the others (8 Oct review)
            logger.exception("refresh_nav_daily: peers for category %r skipped", category)
            db.rollback()  # e.g. a failed commit of new peer rows; keep the session usable
            continue
        for peer in universe:
            if peer.id not in held_ids:
                peers[peer.id] = peer
    await warm_nav_history(db, peers.values())
    logger.info(
        "refresh_nav_daily: held_schemes=%d categories=%d peer_schemes=%d success=True",
        len(schemes), len(categories), len(peers),
    )


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    with SessionLocal() as db:
        asyncio.run(main_async(db))


if __name__ == "__main__":
    main()
