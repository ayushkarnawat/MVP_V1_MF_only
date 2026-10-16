#!/usr/bin/env bash
# Wipes all user-domain data from the LeapSwitch/CloudPe Postgres for a
# fresh-signup round -- the D5 standing condition ("wipe the DB before each
# real-data round") from the staging plan. Mirrors scripts/clean-staging-db.sh
# (AWS) table-for-table; the only difference is reaching the DB directly via
# the local `postgres` container instead of an SSM tunnel, since here it's on
# this same VM. Leaves reference/platform data untouched.
#
# Usage (on the VM, inside this repo checkout): sudo ./scripts/clean-db.sh
# (sudo needed for docker/.env, same reason deploy.sh and run-job.sh need it)

set -euo pipefail
cd "$(dirname "$0")/.."

set -a
# shellcheck disable=SC1091
. ./.env
set +a

CONTAINER=$(docker compose ps -q postgres)
if [[ -z "$CONTAINER" ]]; then
  echo "postgres container not running -- is the stack up?" >&2
  exit 1
fi

psql_exec() { docker exec -e PGPASSWORD="$DB_PASSWORD" -i "$CONTAINER" psql -U "$DB_USERNAME" -d "$DB_NAME" "$@"; }

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
psql_exec -c "$COUNT_QUERY"

echo "=== RUNNING CLEANUP ==="
psql_exec -v ON_ERROR_STOP=1 <<SQL
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
psql_exec -c "$COUNT_QUERY"

echo "=== AFTER (reference data, should remain intact) ==="
psql_exec -c "$REFERENCE_QUERY"

echo "Done."
