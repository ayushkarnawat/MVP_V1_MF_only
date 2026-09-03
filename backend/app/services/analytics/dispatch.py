"""Dispatches a household's analytics recompute as a short-lived ECS
Fargate RunTask, never inline on a request-serving replica (see this plan's
Global Constraints and Docs/superpowers/specs/2026-09-02-analytics-precompute-architecture-design.md).

The exact RunTask invocation contract (cluster/task-definition ARNs,
container name, subnet/security-group ids) is being finalized in a parallel
AWS-migration session as of 2026-09-02 -- built against config settings with
empty defaults rather than concrete ARNs, so this code lands and is testable
before that session's values exist. `dispatch` degrades to a logged no-op
when unconfigured."""

from __future__ import annotations

import logging
import uuid
from typing import Protocol

import boto3

from app.config import settings

logger = logging.getLogger(__name__)


class RecomputeDispatcher(Protocol):
    def dispatch(self, user_id: uuid.UUID) -> None: ...


class EcsRunTaskDispatcher:
    def dispatch(self, user_id: uuid.UUID) -> None:
        if not settings.ecs_cluster_arn or not settings.ecs_task_definition_arn:
            logger.info(
                "EcsRunTaskDispatcher: ECS not configured, skipping recompute dispatch "
                "for user %s (set ecs_cluster_arn/ecs_task_definition_arn to enable)",
                user_id,
            )
            return

        client = boto3.client("ecs", region_name=settings.aws_region or None)
        client.run_task(
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
        logger.info("EcsRunTaskDispatcher: dispatched recompute RunTask for user %s", user_id)


dispatcher: RecomputeDispatcher = EcsRunTaskDispatcher()
