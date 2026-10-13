"""Daily portfolio intake, manual queue, retention and gated operational summaries."""
import asyncio
import logging
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from app.db.session import SessionLocal
from app.services.analytics.portfolio_disclosure_client import (
    _alert, _alert_due, monthly_zero_batch_summary, refresh_portfolio_disclosures,
)
from app.services.analytics.portfolio_disclosure_manual import (
    ensure_manual_queue_rows, manual_queue_summary,
)
from app.services.analytics.portfolio_disclosure_retention import prune_old_batches

logger = logging.getLogger(__name__)


async def main_async(db) -> None:
    today = date.today()
    ensure_manual_queue_rows(db, today)
    db.commit()
    try:
        result = await refresh_portfolio_disclosures(db, today)
        db.commit()
    except Exception:
        # Leave committed queue/AMC work intact and restore the session for pruning.
        db.rollback()
        raise
    finally:
        pruned = prune_old_batches(db, today)
        db.commit()
    logger.info(
        "refresh_portfolio_disclosures_daily: success=%s amcs_processed=%d amcs_failed=%d "
        "amcs_not_onboarded=%d schemes_written=%d pruned=%d seconds=%.1f",
        result.success, result.amcs_processed, result.amcs_failed, result.amcs_not_onboarded,
        result.schemes_written, pruned, result.seconds,
    )
    if _alert_due(today):
        waiting = {amc: n for amc, n in manual_queue_summary(db, today).items() if n}
        if waiting:
            _alert("ALL", "manual_upload_pending", ", ".join(f"{a}={n}" for a, n in sorted(waiting.items())))
    if today.day == 20:
        missing = monthly_zero_batch_summary(db, today)
        if missing:
            _alert("ALL", "monthly_zero_batch_summary", ", ".join(missing))


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    with SessionLocal() as db:
        asyncio.run(main_async(db))


if __name__ == "__main__":
    main()
