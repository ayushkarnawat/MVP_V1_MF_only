#!/usr/bin/env bash
# Read-only status check for the 2026-10-10/11 weekend load-test override
# (see log.md's 2026-10-10 entry). Prints current values next to what they
# should be in "weekend" state and in "reverted/Monday" state, so it's never
# a guess whether the override is still active or has been fully reverted.
#
# Usage: ./scripts/weekend-status-check.sh
# Safety: every AWS call here is a read (describe/list/get) -- nothing is
# ever changed by running this.

set -euo pipefail

export AWS_REGION="ap-south-1"
CLUSTER="unifolio-staging"
SERVICE="unifolio-staging-backend"

echo "===================================================================="
echo " Backend ECS service"
echo "   weekend expected: cpu=2048 memory=4096 desiredCount=3"
echo "   reverted (Monday) expected: cpu=512 memory=1024 desiredCount=1"
echo "===================================================================="
SVC_JSON=$(aws ecs describe-services --cluster "$CLUSTER" --services "$SERVICE" \
  --query "services[0].{desired:desiredCount,running:runningCount,pending:pendingCount,taskDef:taskDefinition}")
echo "$SVC_JSON"
TASKDEF_ARN=$(echo "$SVC_JSON" | sed -n 's/.*"taskDef": "\([^"]*\)".*/\1/p')
aws ecs describe-task-definition --task-definition "$TASKDEF_ARN" \
  --query "taskDefinition.{cpu:cpu,memory:memory,revision:revision}"

echo
echo "===================================================================="
echo " Night-stop/start schedules"
echo "   weekend expected: all DISABLED"
echo "   reverted (Monday) expected: all ENABLED"
echo "===================================================================="
aws scheduler list-schedules --query "Schedules[?contains(Name, 'night-')].{Name:Name,State:State}" --output table

echo
echo "===================================================================="
echo " RDS"
echo "   weekend expected: status=available (kept running through the night)"
echo "   reverted (Monday) expected: status=available during the day, stopped overnight per schedule"
echo "===================================================================="
aws rds describe-db-instances --query "DBInstances[0].{id:DBInstanceIdentifier,status:DBInstanceStatus,class:DBInstanceClass}" --output table
