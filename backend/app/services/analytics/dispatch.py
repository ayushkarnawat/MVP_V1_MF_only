"""Dispatches a household's analytics recompute as a short-lived ECS
Fargate RunTask, never inline on a request-serving replica (see this plan's
Global Constraints and Docs/superpowers/specs/2026-09-02-analytics-precompute-architecture-design.md).

The RunTask invocation contract (cluster/task-definition ARNs, container
name, subnet/security-group ids) is wired via infra/modules/backend as of
2026-09-10 (`aws_ecs_task_definition.analytics_recompute` + a dedicated
`backend_task` IAM role scoped to RunTask on just that task def), injected
into the running container as the settings below -- pending `terraform
apply` in staging. `dispatch` degrades to a logged no-op when unconfigured
(e.g. local dev, or before that apply)."""

from __future__ import annotations

import logging
import uuid
from typing import Protocol

import boto3
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
        unconfigured dispatch doesn't orphan the claim for up to the 2-hour
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
            # the already-committed claim for up to the 2-hour staleness
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


dispatcher: RecomputeDispatcher = EcsRunTaskDispatcher()
