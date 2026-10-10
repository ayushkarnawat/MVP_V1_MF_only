# backend/scripts/jobs/backfill_scheme_nav_history.py
"""One-time scheme-master-wide NAV backfill (attribute 11, Step 1). Never
registered as a scheduled job -- run manually once via `aws ecs run-task`
on the existing task definition/cluster, since this only ever runs once
plus rare small top-ups for newly-listed schemes. Resumable by
construction (schemes_needing_backfill re-derives "what's left" from
nav_history itself every run -- no separate progress table), batched to
bound peak memory and mfapi.in request-burst size, with a circuit breaker
so a future mfapi.in format/availability regression (see planning doc's
2026-08 AMFI column-format incident) surfaces loudly instead of silently
corrupting the backfill.
"""
import asyncio
import logging
import sys
import time
from collections.abc import Iterator
from pathlib import Path
from typing import TypeVar

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.reference import NavHistory, Scheme
from app.services.dashboard.nav import warm_nav_history

logger = logging.getLogger(__name__)

_BATCH_SIZE = 150
_BATCH_SLEEP_SECONDS = 2.5
_FAILURE_RATE_ABORT_THRESHOLD = 0.25

T = TypeVar("T")


def chunk_schemes(schemes: list[T], batch_size: int) -> Iterator[list[T]]:
    for i in range(0, len(schemes), batch_size):
        yield schemes[i : i + batch_size]


def schemes_needing_backfill(db: Session) -> list[Scheme]:
    already_warmed = db.query(NavHistory.scheme_id).distinct().subquery()
    return (
        db.query(Scheme)
        .filter(Scheme.is_active.is_(True), Scheme.amfi_code.isnot(None), Scheme.amfi_code != "",
                ~Scheme.id.in_(db.query(already_warmed.c.scheme_id)))
        .order_by(Scheme.id)
        .all()
    )


async def main_async(db: Session) -> None:
    targets = schemes_needing_backfill(db)
    batches = list(chunk_schemes(targets, _BATCH_SIZE))
    total = len(targets)
    done = 0
    start = time.monotonic()

    for batch_num, batch in enumerate(batches, start=1):
        before_count = db.query(NavHistory.scheme_id).filter(
            NavHistory.scheme_id.in_([s.id for s in batch])
        ).distinct().count()
        try:
            await warm_nav_history(db, batch)
        except Exception:
            logger.exception("backfill_scheme_nav_history: batch %d/%d raised, aborting", batch_num, len(batches))
            raise
        after_count = db.query(NavHistory.scheme_id).filter(
            NavHistory.scheme_id.in_([s.id for s in batch])
        ).distinct().count()
        newly_warmed = after_count - before_count
        failure_rate = 1 - (newly_warmed / len(batch)) if batch else 0
        done += len(batch)
        elapsed = time.monotonic() - start
        logger.info(
            "backfill_scheme_nav_history: batch %d/%d, %d/%d schemes done (%.1f%%), "
            "%d failures this batch, elapsed=%.0fs",
            batch_num, len(batches), done, total, 100 * done / total if total else 100,
            len(batch) - newly_warmed, elapsed,
        )
        if failure_rate > _FAILURE_RATE_ABORT_THRESHOLD:
            logger.error(
                "backfill_scheme_nav_history: batch %d failure rate %.0f%% exceeds %.0f%% threshold, aborting run",
                batch_num, 100 * failure_rate, 100 * _FAILURE_RATE_ABORT_THRESHOLD,
            )
            return
        if batch_num < len(batches):
            await asyncio.sleep(_BATCH_SLEEP_SECONDS)

    logger.info("backfill_scheme_nav_history: complete, %d/%d schemes backfilled", done, total)


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    with SessionLocal() as db:
        asyncio.run(main_async(db))


if __name__ == "__main__":
    main()
