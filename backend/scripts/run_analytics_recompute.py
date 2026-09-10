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
from app.services.analytics.recompute import recompute_household_analytics, try_claim_recompute

logger = logging.getLogger(__name__)


async def _run_one(user_id: uuid.UUID) -> None:
    # No claim here: --household mode's only caller is an ECS task launched
    # by a dispatch site (analytics.py GET/retry, imports.py CAS-confirm)
    # that already claimed this slot before RunTask was invoked. Claiming
    # again here would race that already-successful claim on the same
    # fresh row and always lose, silently skipping every event-triggered
    # recompute -- the claim is one continuous operation split across two
    # processes, not two independent claimants.
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
        # Unlike --household mode, nothing has claimed on this loop's
        # behalf -- claim per user here so the daily backstop can't race
        # an already-in-flight event-triggered recompute for the same
        # household.
        claim_db = SessionLocal()
        try:
            claimed = try_claim_recompute(claim_db, user_id)
        finally:
            claim_db.close()
        if not claimed:
            logger.info("run_analytics_recompute: skipping user %s, recompute already in flight", user_id)
            continue
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
