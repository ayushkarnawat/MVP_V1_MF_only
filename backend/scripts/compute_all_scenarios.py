# backend/scripts/compute_all_scenarios.py
"""One-off: compute every non-hypothetical scenario (phases and groups included).

Run on staging after migrations, the NAV backfill (backfill_scheme_nav_history.py) and A12's
daily benchmark job; rerun after a seed correction or a later backfill. Safe to rerun:
compute_scenario_results deletes and rewrites one scenario's rows and commits them.
Settled windows never change, so nothing schedules this; Task 8 keeps ongoing rows fresh."""
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.reference import Scenario, ScenarioSchemeResult
from app.services.analytics.scenario_engine import compute_scenario_results

logger = logging.getLogger(__name__)


def main(db: Session) -> int:
    failures = 0
    scenarios = (
        db.query(Scenario).filter(Scenario.scenario_type != "HYPOTHETICAL")
        .order_by(Scenario.start_date, Scenario.name).all()
    )
    for scenario in scenarios:
        try:
            compute_scenario_results(db, scenario)
        except Exception:  # one bad window shouldn't stop the rest
            db.rollback()
            failures += 1
            logger.exception("compute_all_scenarios: %s failed", scenario.name)
            continue
        rows = db.query(ScenarioSchemeResult).filter_by(scenario_id=scenario.id).all()
        logger.info(
            "compute_all_scenarios: %s real=%d proxied=%d no_data=%d", scenario.name,
            sum(1 for r in rows if not r.is_proxied),
            sum(1 for r in rows if r.is_proxied and r.pct_change is not None),
            sum(1 for r in rows if r.pct_change is None),
        )
    logger.info("compute_all_scenarios: done, %d scenarios, %d failed", len(scenarios), failures)
    return failures


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    with SessionLocal() as session:
        sys.exit(1 if main(session) else 0)
