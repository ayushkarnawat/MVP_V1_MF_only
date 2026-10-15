"""Long-lived worker container for the LeapSwitch staging recompute dispatch
(D2, option 1, go received 2026-10-15:
Docs/orchestration/leapswitch-staging-plan.html). Reachable only on the VM's
internal Docker network -- deploy/leapswitch/docker-compose.yml never
publishes this container's port to the host. AWS staging and production
never run this module; WorkerContainerDispatcher (services/analytics/
dispatch.py) is the only caller, and only when
ANALYTICS_DISPATCH_MODE=worker_container.

Run with: uvicorn app.worker_server:app --host 0.0.0.0 --port 8008
"""
from __future__ import annotations

import logging
import subprocess
import sys
import uuid
from concurrent.futures import ThreadPoolExecutor

from fastapi import FastAPI

logger = logging.getLogger(__name__)

app = FastAPI()

# 3, matching the AWS "bump" load-test shape this plan otherwise sizes
# against (see leapswitch-staging-plan.html's D2 and "Which VM size"
# sections). Briefly raised to 5 on 16 Oct 2026, then reverted the same day
# in favour of a 3rd uvicorn worker instead -- dashboard concurrency (what
# QA actually exercises) outranks recompute-pool depth (a rare-overlap edge
# case that was never observed to need more than 3; a queued recompute is
# invisible to the user, just a longer "pending" state, not a failure). A
# 4th concurrent recompute queues behind these 3.
MAX_CONCURRENT_RECOMPUTES = 3
_pool = ThreadPoolExecutor(max_workers=MAX_CONCURRENT_RECOMPUTES)

# Matches EcsRunTaskDispatcher's own staleness ceiling (dispatch.py / the
# should_dispatch_recompute 15-minute self-heal) -- a hung recompute here
# should not wait indefinitely before the existing self-heal logic takes over.
RECOMPUTE_TIMEOUT_SECONDS = 15 * 60


def _run_recompute(user_id: str) -> None:
    try:
        result = subprocess.run(
            [sys.executable, "scripts/run_analytics_recompute.py", "--household", user_id],
            capture_output=True,
            text=True,
            timeout=RECOMPUTE_TIMEOUT_SECONDS,
        )
    except subprocess.TimeoutExpired:
        logger.error("worker_server: recompute timed out for user %s", user_id)
        return
    if result.returncode != 0:
        logger.error(
            "worker_server: recompute failed for user %s (exit %s): %s",
            user_id,
            result.returncode,
            result.stderr[-4000:],
        )
    else:
        logger.info("worker_server: recompute completed for user %s", user_id)


@app.post("/recompute/{user_id}")
def recompute(user_id: uuid.UUID) -> dict[str, str]:
    """Queues the recompute and returns immediately. Accepting here is the
    worker's equivalent of ECS RunTask reporting a task placed -- actual
    execution may wait behind the 5-slot pool, which only happens under
    genuine time-overlap between recomputes, not sequential back-to-back
    ones (each prior job's slot frees up before a merely-sequential next one
    would need it)."""
    _pool.submit(_run_recompute, str(user_id))
    return {"status": "accepted"}


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok"}
