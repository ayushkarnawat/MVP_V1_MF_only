"""Dispatches a household's analytics recompute as a short-lived task, never
inline on a request-serving replica (see this plan's Global Constraints and
Docs/superpowers/specs/2026-09-02-analytics-precompute-architecture-design.md).

Two implementations of RecomputeDispatcher exist, selected by
ANALYTICS_DISPATCH_MODE (app/config.py):

- EcsRunTaskDispatcher (default, "ecs"): AWS staging and production. Calls
  ECS RunTask; the invocation contract (cluster/task-definition ARNs,
  container name, subnet/security-group ids) is wired via
  infra/modules/backend as of 2026-09-10. Degrades to a logged no-op when
  unconfigured (e.g. local dev).
- WorkerContainerDispatcher ("worker_container"): LeapSwitch staging only
  (Docs/orchestration/leapswitch-staging-plan.html D2, go received
  2026-10-15). ECS doesn't exist there, so this calls a long-lived sibling
  worker container over the VM's internal Docker network instead.
"""

from __future__ import annotations

import logging
import uuid
from typing import Protocol

import boto3
import httpx
from botocore.exceptions import BotoCoreError, ClientError

from app.config import settings

logger = logging.getLogger(__name__)


class RecomputeDispatcher(Protocol):
    def dispatch(self, user_id: uuid.UUID) -> bool: ...


class EcsRunTaskDispatcher:
    def dispatch(self, user_id: uuid.UUID) -> bool:
        """Returns True only if RunTask actually placed the task -- callers
        use this to roll back an already-committed try_claim_recompute()
        claim when dispatch never really started anything, so a failed/
        unconfigured dispatch doesn't orphan the claim for up to the 15-minute
        staleness ceiling."""
        if not settings.ecs_cluster_arn or not settings.ecs_task_definition_arn:
            logger.info(
                "EcsRunTaskDispatcher: ECS not configured, skipping recompute dispatch "
                "for user %s (set ecs_cluster_arn/ecs_task_definition_arn to enable)",
                user_id,
            )
            return False

        try:
            client = boto3.client("ecs", region_name=settings.aws_region or None)
            response = client.run_task(
                cluster=settings.ecs_cluster_arn,
                taskDefinition=settings.ecs_task_definition_arn,
                launchType="FARGATE",
                networkConfiguration={
                    "awsvpcConfiguration": {
                        "subnets": [s for s in settings.ecs_subnet_ids.split(",") if s],
                        "securityGroups": [g for g in settings.ecs_security_group_ids.split(",") if g],
                        "assignPublicIp": "DISABLED",
                    }
                },
                overrides={
                    "containerOverrides": [
                        {
                            "name": settings.ecs_container_name,
                            "command": ["python", "scripts/run_analytics_recompute.py", "--household", str(user_id)],
                        }
                    ]
                },
            )
        except (BotoCoreError, ClientError):
            # A transport/API-level failure never reaches the "tasks"/
            # "failures" response at all -- left uncaught, it would propagate
            # past every caller's release_recompute_claim() check and orphan
            # the already-committed claim for up to the 15-minute staleness
            # ceiling (round-3 review finding).
            logger.exception("EcsRunTaskDispatcher: RunTask call failed for user %s", user_id)
            return False

        # RunTask can return 200 with no task placed -- failures land in the
        # "failures" list, not an exception. Left unchecked, the caller (and
        # its already-claimed AnalyticsRecomputeStatus row) has no way to
        # know the task never started; it self-heals via
        # should_dispatch_recompute's staleness ceiling, but log loudly since
        # that's a silent multi-hour user-facing stall otherwise.
        failures = response.get("failures") or []
        if failures:
            logger.error(
                "EcsRunTaskDispatcher: RunTask reported failures for user %s: %s", user_id, failures
            )
            return False
        # An empty "tasks" list with no reported failures is not a
        # documented AWS response shape, but "no failures" alone is not
        # sufficient proof a task was placed (round-3 review finding) --
        # require at least one task back before reporting success.
        if not response.get("tasks"):
            logger.error(
                "EcsRunTaskDispatcher: RunTask returned no tasks and no failures for user %s", user_id
            )
            return False
        logger.info("EcsRunTaskDispatcher: dispatched recompute RunTask for user %s", user_id)
        return True


class WorkerContainerDispatcher:
    """D2, go received 2026-10-15 (Docs/orchestration/leapswitch-staging-plan.html):
    dispatches to a long-lived sibling worker container over the LeapSwitch VM's
    internal Docker network -- never the Docker socket (that was option 2,
    rejected: it would give anyone who breaks into the backend root on the
    VM). The worker (app/worker_server.py) runs the identical recompute
    script behind a 3-slot bounded pool, matching the AWS "bump" scenario's
    3-container shape this plan sizes against. Selected only when
    ANALYTICS_DISPATCH_MODE=worker_container; AWS staging and production keep
    EcsRunTaskDispatcher as the default, so this class never runs there."""

    def dispatch(self, user_id: uuid.UUID) -> bool:
        if not settings.worker_container_url:
            logger.info(
                "WorkerContainerDispatcher: worker not configured, skipping recompute dispatch "
                "for user %s (set worker_container_url to enable)",
                user_id,
            )
            return False

        try:
            response = httpx.post(
                f"{settings.worker_container_url}/recompute/{user_id}", timeout=5.0
            )
            response.raise_for_status()
        except httpx.HTTPError:
            # Mirrors EcsRunTaskDispatcher's BotoCoreError/ClientError handling:
            # an unreachable or erroring worker must release the already-
            # committed claim, not orphan it for the 15-minute staleness ceiling.
            logger.exception(
                "WorkerContainerDispatcher: dispatch call failed for user %s", user_id
            )
            return False

        logger.info(
            "WorkerContainerDispatcher: dispatched recompute to worker for user %s", user_id
        )
        return True


def _build_dispatcher() -> RecomputeDispatcher:
    if settings.analytics_dispatch_mode == "worker_container":
        return WorkerContainerDispatcher()
    return EcsRunTaskDispatcher()


dispatcher: RecomputeDispatcher = _build_dispatcher()
