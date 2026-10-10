import asyncio
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from sqlalchemy import distinct
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.folio import Folio
from app.models.reference import Scenario, Scheme
from app.services.analytics.scenario_engine import compute_scenario_results
from app.services.analytics.scheme_universe import canonical_category, get_category_peers
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
    # for a category nobody held at 06:00. Peers are one series per fund of the
    # holding's plan type (9 Oct) -- the set all three ranking sections read --
    # not every plan row, which is ~4x the downloads in the merged categories.
    held_ids = {scheme.id for scheme in schemes}
    groups: dict[tuple, Scheme] = {}
    for scheme in schemes:
        if scheme.amfi_code and scheme.sebi_category:
            groups.setdefault((canonical_category(scheme.sebi_category), scheme.plan_type), scheme)
    peers: dict = {}
    for held in groups.values():
        category = held.sebi_category
        try:
            universe = (await get_category_peers(db, category, held.plan_type)).schemes
        except Exception:  # one bad category must not stop the others (8 Oct review)
            logger.exception("refresh_nav_daily: peers for category %r skipped", category)
            db.rollback()  # e.g. a failed commit of new peer rows; keep the session usable
            continue
        for peer in universe:
            if peer.id not in held_ids:
                peers[peer.id] = peer
    await warm_nav_history(db, peers.values())
    recompute_ongoing_scenarios(db)
    logger.info(
        "refresh_nav_daily: held_schemes=%d categories=%d peer_schemes=%d success=True",
        len(schemes), len(groups), len(peers),
    )


def recompute_ongoing_scenarios(db: Session) -> None:
    ongoing = db.query(Scenario).filter_by(is_ongoing=True).all()
    for scenario in ongoing:
        try:
            compute_scenario_results(db, scenario)
        except Exception:
            logger.exception("refresh_nav_daily: scenario recompute failed for %s", scenario.name)
            db.rollback()
    logger.info("refresh_nav_daily: recomputed %d is_ongoing scenarios", len(ongoing))


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    with SessionLocal() as db:
        asyncio.run(main_async(db))


if __name__ == "__main__":
    main()
