#!/usr/bin/env bash
# Wipes all user-domain data from staging RDS for a fresh testing round.
# Leaves reference/platform data (schemes, nav_history, scheme_ter, scheme_aaum,
# benchmark_index_history, arn_directory, fund_scores) untouched.
#
# Usage: ./scripts/clean-staging-db.sh
#
# Safety: runs everything in one transaction, prints before/after counts for
# both user-domain and reference tables, and only COMMITs if every DELETE in
# the transaction succeeded (psql -v ON_ERROR_STOP=1 + a single multi-statement
# script, same approach used manually all session). No FK has ON DELETE CASCADE
# in this schema (checked across every model + migration), so order matters —
# see Docs/investigations/2026-09-23-schema-and-user-journey-review.md §2 for
# the dependency graph this order is derived from.
#
# 2026-10-06: household_member_merges (0018) points at users without a cascade,
# so it is cleared before users. transaction_imports (0027) and
# household_member_name_changes (0018) cascade from transactions/imports and
# household_members. consent_records (0022) has no foreign key and is
# append-only by design: its rows are kept (they stop pointing at a live user).
# Works on any revision from 0018 to 0029.

set -euo pipefail

REGION="ap-south-1"
LOCAL_PORT="5439"
ENVIRONMENT="staging"

echo "Resolving infra details for '${ENVIRONMENT}'..."

BASTION_INSTANCE_ID=$(aws ec2 describe-instances \
  --region "$REGION" \
  --filters "Name=tag:Name,Values=${ENVIRONMENT}-bastion" "Name=instance-state-name,Values=running" \
  --query "Reservations[0].Instances[0].InstanceId" --output text)

if [[ -z "$BASTION_INSTANCE_ID" || "$BASTION_INSTANCE_ID" == "None" ]]; then
  echo "Could not find a running '${ENVIRONMENT}-bastion' instance. Is it stopped?" >&2
  exit 1
fi

RDS_ENDPOINT=$(aws rds describe-db-instances \
  --region "$REGION" \
  --db-instance-identifier "${ENVIRONMENT}-rds" \
  --query "DBInstances[0].Endpoint.Address" --output text)

SECRET_ARN=$(aws rds describe-db-instances \
  --region "$REGION" \
  --db-instance-identifier "${ENVIRONMENT}-rds" \
  --query "DBInstances[0].MasterUserSecret.SecretArn" --output text)

echo "Bastion: $BASTION_INSTANCE_ID"
echo "RDS endpoint: $RDS_ENDPOINT"

# Reuse an already-open tunnel if one exists; otherwise start one.
if ! (exec 3<>/dev/tcp/127.0.0.1/$LOCAL_PORT) 2>/dev/null; then
  echo "Starting SSM port-forwarding tunnel on localhost:${LOCAL_PORT}..."
  nohup aws ssm start-session \
    --region "$REGION" \
    --target "$BASTION_INSTANCE_ID" \
    --document-name AWS-StartPortForwardingSessionToRemoteHost \
    --parameters "{\"host\":[\"${RDS_ENDPOINT}\"],\"portNumber\":[\"5432\"],\"localPortNumber\":[\"${LOCAL_PORT}\"]}" \
    > /tmp/staging-ssm-tunnel.log 2>&1 &
  disown
  sleep 4
fi

SECRET_JSON=$(aws secretsmanager get-secret-value --region "$REGION" --secret-id "$SECRET_ARN" --query SecretString --output text)
export PGPASSWORD
PGPASSWORD=$(python3 -c "import json,sys; print(json.loads(sys.argv[1])['password'])" "$SECRET_JSON")

CONN="host=127.0.0.1 port=${LOCAL_PORT} dbname=unifolio user=unifolio sslmode=require"

COUNT_QUERY="
SELECT 'users' t, count(*) FROM users
UNION ALL SELECT 'household_members', count(*) FROM household_members
UNION ALL SELECT 'household_member_merges', count(*) FROM household_member_merges
UNION ALL SELECT 'household_member_name_changes', count(*) FROM household_member_name_changes
UNION ALL SELECT 'auth_identities', count(*) FROM auth_identities
UNION ALL SELECT 'sessions', count(*) FROM sessions
UNION ALL SELECT 'pending_identity_verifications', count(*) FROM pending_identity_verifications
UNION ALL SELECT 'otp_requests', count(*) FROM otp_requests
UNION ALL SELECT 'imports', count(*) FROM imports
UNION ALL SELECT 'folios', count(*) FROM folios
UNION ALL SELECT 'transactions', count(*) FROM transactions
UNION ALL SELECT 'portfolio_snapshots', count(*) FROM portfolio_snapshots
UNION ALL SELECT 'analytics_sections', count(*) FROM analytics_sections
UNION ALL SELECT 'analytics_recompute_status', count(*) FROM analytics_recompute_status
UNION ALL SELECT 'account_deletion_surveys', count(*) FROM account_deletion_surveys
ORDER BY t;
"

REFERENCE_QUERY="
SELECT 'schemes' t, count(*) FROM schemes
UNION ALL SELECT 'nav_history', count(*) FROM nav_history
UNION ALL SELECT 'scheme_ter', count(*) FROM scheme_ter
UNION ALL SELECT 'scheme_aaum', count(*) FROM scheme_aaum
UNION ALL SELECT 'benchmark_index_history', count(*) FROM benchmark_index_history
UNION ALL SELECT 'arn_directory', count(*) FROM arn_directory
UNION ALL SELECT 'fund_scores', count(*) FROM fund_scores
ORDER BY t;
"

echo "=== BEFORE ==="
psql "$CONN" -c "$COUNT_QUERY"

echo "=== RUNNING CLEANUP ==="
psql "$CONN" -v ON_ERROR_STOP=1 <<SQL
BEGIN;
DELETE FROM transactions;
DELETE FROM analytics_sections;
DELETE FROM analytics_recompute_status;
DELETE FROM portfolio_snapshots;
DELETE FROM folios;
DELETE FROM imports;
DELETE FROM sessions;
DELETE FROM pending_identity_verifications;
DELETE FROM otp_requests;
DELETE FROM auth_identities;
DELETE FROM household_members;
DELETE FROM household_member_merges;
DELETE FROM users;
DELETE FROM account_deletion_surveys;
COMMIT;
SQL

echo "=== AFTER (user-domain, should be all 0) ==="
psql "$CONN" -c "$COUNT_QUERY"

echo "=== AFTER (reference data, should remain intact) ==="
psql "$CONN" -c "$REFERENCE_QUERY"

unset PGPASSWORD
echo "Done."
