#!/usr/bin/env bash
# Switches staging between three named capacity/cost states, or shows which
# state it's currently in. Reuses the exact AWS CLI patterns already used by
# the EventBridge night-stop/start schedules (scheduler/*.tf) and by the
# 2026-10-13 weekend-bump revert, so this never needs a `terraform apply`:
#   off     - ECS desired-count 0, RDS + fck_nat + bastion stopped, all 7
#             night schedules DISABLED (so nothing fights the off state at
#             5AM). NOT literally $0/day -- see the printed caveat below.
#   minimal - normal day-to-day: desired-count 1 on whatever task definition
#             Terraform currently manages, RDS/fck_nat/bastion running, all 7
#             night schedules ENABLED (the state this repo reverted to on
#             2026-10-13 after the weekend load-test).
#   bump    - weekend load-test capacity: desired-count 3 on a cpu=2048/
#             memory=4096 clone of whatever Terraform's task def currently
#             is (cloned fresh each time, not a hardcoded old revision, so it
#             never goes stale after a real deploy), night schedules
#             DISABLED so a 9PM stop doesn't cut a load test short.
#
# Usage: ./scripts/staging-state.sh {status|off|minimal|bump}
#
# Terraform owns none of desiredCount/cpu/memory/schedule-state (confirmed
# via `terraform plan` on 2026-10-13: these are hardcoded in
# infra/modules/backend/main.tf and infra/modules/scheduler/*.tf with no
# ignore_changes), so toggling them here never produces drift.

set -euo pipefail

export AWS_REGION="ap-south-1"
CLUSTER="unifolio-staging"
SERVICE="unifolio-staging-backend"
RDS_ID="staging-rds"
FCKNAT_ID="i-0681a3cd783bcc695"
BASTION_ID="i-0b3f2f75cfef2465d"
TF_DIR="infra/envs/staging"

TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

set_schedules_state() {
  local target="$1"
  for name in $(aws scheduler list-schedules --query "Schedules[?contains(Name,'night-')].Name" --output text); do
    aws scheduler get-schedule --name "$name" \
      | jq --arg state "$target" 'del(.Arn, .CreationDate, .LastModificationDate) | .State = $state' \
      > "$TMP_DIR/$name.json"
    aws scheduler update-schedule --cli-input-json "file://$TMP_DIR/$name.json" >/dev/null
    echo "  schedule $name -> $target"
  done
}

rds_status() { aws rds describe-db-instances --db-instance-identifier "$RDS_ID" --query "DBInstances[0].DBInstanceStatus" --output text; }

ensure_rds_running() {
  local status; status=$(rds_status)
  if [[ "$status" == "stopped" ]]; then
    echo "Starting RDS ($RDS_ID)..."
    aws rds start-db-instance --db-instance-identifier "$RDS_ID" >/dev/null
    aws rds wait db-instance-available --db-instance-identifier "$RDS_ID"
  elif [[ "$status" != "available" ]]; then
    echo "RDS in transient state ($status), waiting for available..."
    aws rds wait db-instance-available --db-instance-identifier "$RDS_ID"
  else
    echo "RDS already available."
  fi
}

ensure_rds_stopped() {
  local status; status=$(rds_status)
  if [[ "$status" == "available" ]]; then
    echo "Stopping RDS ($RDS_ID)..."
    aws rds stop-db-instance --db-instance-identifier "$RDS_ID" >/dev/null
  else
    echo "RDS already $status."
  fi
}

ec2_state() { aws ec2 describe-instances --instance-ids "$1" --query "Reservations[0].Instances[0].State.Name" --output text; }

ensure_ec2_running() {
  local id="$1" name="$2" state; state=$(ec2_state "$id")
  if [[ "$state" == "stopped" ]]; then
    echo "Starting $name ($id)..."
    aws ec2 start-instances --instance-ids "$id" >/dev/null
    aws ec2 wait instance-running --instance-ids "$id"
  else
    echo "$name already $state."
  fi
}

ensure_ec2_stopped() {
  local id="$1" name="$2" state; state=$(ec2_state "$id")
  if [[ "$state" == "running" ]]; then
    echo "Stopping $name ($id)..."
    aws ec2 stop-instances --instance-ids "$id" >/dev/null
  else
    echo "$name already $state."
  fi
}

terraform_taskdef_arn() {
  terraform -chdir="$TF_DIR" state show module.backend.aws_ecs_task_definition.this -no-color \
    | grep -m1 '^\s*arn ' | sed -E 's/.*"(arn:aws:ecs:[^"]+)".*/\1/'
}

register_bump_taskdef() {
  local base_arn; base_arn=$(terraform_taskdef_arn)
  aws ecs describe-task-definition --task-definition "$base_arn" --query "taskDefinition" \
    | jq '{family, taskRoleArn, executionRoleArn, networkMode, containerDefinitions,
           requiresCompatibilities, cpu: "2048", memory: "4096"}' \
    > "$TMP_DIR/bump-taskdef.json"
  aws ecs register-task-definition --cli-input-json "file://$TMP_DIR/bump-taskdef.json" \
    --query "taskDefinition.taskDefinitionArn" --output text
}

show_status() {
  echo "--- ECS service ($SERVICE) ---"
  local svc_json taskdef_arn
  svc_json=$(aws ecs describe-services --cluster "$CLUSTER" --services "$SERVICE" \
    --query "services[0].{desired:desiredCount,running:runningCount,taskDef:taskDefinition}")
  echo "$svc_json"
  taskdef_arn=$(echo "$svc_json" | jq -r .taskDef)
  aws ecs describe-task-definition --task-definition "$taskdef_arn" --query "taskDefinition.{cpu:cpu,memory:memory,revision:revision}"

  echo "--- RDS ($RDS_ID) ---"
  aws rds describe-db-instances --db-instance-identifier "$RDS_ID" --query "DBInstances[0].DBInstanceStatus" --output text

  echo "--- EC2 (fck_nat / bastion) ---"
  aws ec2 describe-instances --instance-ids "$FCKNAT_ID" "$BASTION_ID" \
    --query "Reservations[].Instances[].{Id:InstanceId,State:State.Name}" --output table

  echo "--- Night schedules ---"
  aws scheduler list-schedules --query "Schedules[?contains(Name, 'night-')].{Name:Name,State:State}" --output table
}

case "${1:-}" in
  status)
    show_status
    ;;
  off)
    echo "=== Switching to OFF (near-zero cost) ==="
    aws ecs update-service --cluster "$CLUSTER" --service "$SERVICE" --desired-count 0 >/dev/null
    aws ecs wait services-stable --cluster "$CLUSTER" --services "$SERVICE"
    set_schedules_state DISABLED
    ensure_rds_stopped
    ensure_ec2_stopped "$FCKNAT_ID" fck_nat
    ensure_ec2_stopped "$BASTION_ID" bastion
    cat <<'EOF'

OFF reached: ECS desired-count 0, RDS stopped, fck_nat + bastion stopped, all
night schedules disabled.

NOT literally $0/day -- these keep billing regardless of stop state:
  - ALB (unifolio-staging-alb): ~$16-20/mo fixed, can't be "stopped", only destroyed
  - 2 Elastic IPs (bastion + fck_nat): stopped-but-attached is still billed
    since AWS's Feb-2024 EIP pricing change, ~$7/mo combined
  - RDS allocated storage bills even while the instance is stopped: a few $/mo
  - KMS CMK, Secrets Manager secrets, Route53 hosted zone: ~$2-3/mo combined
  Rough residual even in full OFF: ~$25-30/month, not $0.

  True $0/day needs `terraform destroy` of the ALB + NAT + bastion resources
  -- much slower to reverse (a `terraform apply` to rebuild, ACM/DNS
  re-propagation, ~10-15 min). Say the word if you want that runbook built
  separately; this script intentionally stops at the safe, fast, reversible
  tier.

  AWS also force-restarts a stopped RDS instance after ~7 days. If OFF is
  held longer than a week, re-run `staging-state.sh off`.
EOF
    ;;
  minimal)
    echo "=== Switching to MINIMAL (normal day-to-day) ==="
    ensure_rds_running
    ensure_ec2_running "$FCKNAT_ID" fck_nat
    ensure_ec2_running "$BASTION_ID" bastion
    TASKDEF_ARN=$(terraform_taskdef_arn)
    aws ecs update-service --cluster "$CLUSTER" --service "$SERVICE" \
      --task-definition "$TASKDEF_ARN" --desired-count 1 >/dev/null
    aws ecs wait services-stable --cluster "$CLUSTER" --services "$SERVICE"
    set_schedules_state ENABLED
    echo "MINIMAL reached: desired-count 1 on Terraform's task def ($TASKDEF_ARN), RDS/fck_nat/bastion running, night schedules enabled."
    ;;
  bump)
    echo "=== Switching to BUMP (weekend load-test capacity) ==="
    ensure_rds_running
    ensure_ec2_running "$FCKNAT_ID" fck_nat
    ensure_ec2_running "$BASTION_ID" bastion
    set_schedules_state DISABLED
    BUMP_ARN=$(register_bump_taskdef)
    aws ecs update-service --cluster "$CLUSTER" --service "$SERVICE" \
      --task-definition "$BUMP_ARN" --desired-count 3 >/dev/null
    aws ecs wait services-stable --cluster "$CLUSTER" --services "$SERVICE"
    echo "BUMP reached: desired-count 3 on $BUMP_ARN (cpu=2048/memory=4096, cloned fresh from Terraform's current image/env), night schedules disabled."
    ;;
  *)
    echo "Usage: $0 {status|off|minimal|bump}" >&2
    exit 1
    ;;
esac
