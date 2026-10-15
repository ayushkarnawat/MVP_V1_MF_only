#!/bin/sh
# Daily Postgres dump + upload to CloudPe object storage, run via cron (not
# yet confirmed whether CloudPe's block-volume snapshots are schedulable via
# the OpenStack/Cinder API -- see the plan's backup-automation open item.
# This script is the part that doesn't depend on that answer: an
# application-level logical backup, independent of whatever CloudPe decides
# about volume snapshots.
#
# Requires an `aws` CLI profile named "cloudpe" pointed at
# OBJECT_STORAGE_ENDPOINT_URL with the OBJECT_STORAGE_* credentials from .env
# -- kept as a separate named profile (not the default/env-var AWS
# credentials) so it never collides with the real-AWS credentials SES uses
# on this same VM.
#
# Usage: backup.sh (run from deploy/leapswitch/, or via cron with an
# absolute path and `cd` first)
set -eu
cd "$(dirname "$0")/.."

# shellcheck disable=SC1091
. ./.env

timestamp=$(date -u +%Y%m%dT%H%M%SZ)
dump_file="/tmp/unifolio-${timestamp}.sql.gz"

docker compose exec -T postgres pg_dump -U "$DB_USERNAME" "$DB_NAME" | gzip > "$dump_file"

if [ -n "${BACKUP_BUCKET_NAME:-}" ]; then
	aws --profile cloudpe --endpoint-url "$OBJECT_STORAGE_ENDPOINT_URL" \
		s3 cp "$dump_file" "s3://${BACKUP_BUCKET_NAME}/postgres/$(basename "$dump_file")"
fi

rm -f "$dump_file"
