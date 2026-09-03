"""Entrypoint for the ECS Fargate RunTask that runs analytics recompute
out-of-process (Docs/superpowers/specs/2026-09-02-analytics-precompute-architecture-design.md).

Two modes:
  --household <uuid>  One event-triggered recompute (CAS import, retry) --
                       the exact argument EcsRunTaskDispatcher passes.
  --all                Daily EventBridge backstop: loops every user with a
                       household member in this one process run, so nav.py's
                       in-process NAV HTTP-fetch dedup and freshly warmed
                       nav_history rows benefit every household in the run,
                       not just the first.

Run from backend/: .venv/bin/python scripts/run_analytics_recompute.py --household <uuid>
                    .venv/bin/python scripts/run_analytics_recompute.py --all
"""
import argparse
import asyncio
import logging
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.db.session import SessionLocal
from app.models.user import User
from app.services.analytics.recompute import recompute_household_analytics

logger = logging.getLogger(__name__)


async def _run_one(user_id: uuid.UUID) -> None:
    db = SessionLocal()
    try:
        await recompute_household_analytics(db, user_id)
    finally:
        db.close()


async def _run_all() -> None:
    db = SessionLocal()
    try:
        user_ids = [row[0] for row in db.query(User.id).all()]
    finally:
        db.close()

    for user_id in user_ids:
        try:
            await _run_one(user_id)
        except Exception:
            logger.exception("run_analytics_recompute: recompute failed for user %s", user_id)


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    parser = argparse.ArgumentParser()
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--household", type=uuid.UUID, help="Recompute one household (user id).")
    group.add_argument("--all", action="store_true", help="Recompute every household, one process run.")
    args = parser.parse_args()

    if args.all:
        asyncio.run(_run_all())
    else:
        asyncio.run(_run_one(args.household))


if __name__ == "__main__":
    main()
