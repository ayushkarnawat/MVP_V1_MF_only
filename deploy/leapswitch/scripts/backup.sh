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
# on this same VM. Also needs the profile's `s3.multipart_threshold` raised
# past this dump's size: CloudPe's object storage returns AccessDenied on
# multipart UploadPart (confirmed 16 Oct 2026), so `aws configure set
# s3.multipart_threshold 5GB --profile cloudpe` forces a single-PUT upload.
#
# On any failed step, emails through the same SES-based alert path
# run-job.sh uses for the scheduled jobs (scripts/send_job_failure_alert.py)
# -- a silent backup failure is only discovered the one day it matters, so
# this is not optional the way a log line would be.
#
# Usage: backup.sh (run from deploy/leapswitch/, or via cron with an
# absolute path and `cd` first)
set -u
cd "$(dirname "$0")/.."

# shellcheck disable=SC1091
. ./.env

RETENTION_DAYS=7

alert() {
	# $1 = exit code; reads the failure output from stdin
	docker compose run --rm -T backend python scripts/send_job_failure_alert.py backup "$1"
}

timestamp=$(date -u +%Y%m%dT%H%M%SZ)
sql_file="/tmp/unifolio-${timestamp}.sql"
dump_file="${sql_file}.gz"

docker compose exec -T postgres pg_dump -U "$DB_USERNAME" "$DB_NAME" \
	> "$sql_file" 2>/tmp/unifolio-backup-error.log
status=$?
if [ "$status" -ne 0 ]; then
	# Real exit code -- captured right after the command, not after an `if !`
	# test, whose own `$?` is POSIX-defined as the *negated* status (always 0
	# here), which silently turned every real failure into a reported exit 0
	# (confirmed 22 Oct 2026: an upload failure alerted but still exited 0).
	cat /tmp/unifolio-backup-error.log | alert "$status"
	rm -f /tmp/unifolio-backup-error.log "$sql_file"
	exit "$status"
fi
rm -f /tmp/unifolio-backup-error.log
gzip -f "$sql_file"

if [ -n "${BACKUP_BUCKET_NAME:-}" ]; then
	upload_output=$(aws --profile cloudpe --endpoint-url "$OBJECT_STORAGE_ENDPOINT_URL" \
		s3 cp "$dump_file" "s3://${BACKUP_BUCKET_NAME}/postgres/$(basename "$dump_file")" 2>&1)
	status=$?
	if [ "$status" -ne 0 ]; then
		printf '%s\n' "$upload_output" | alert "$status"
		rm -f "$dump_file"
		exit "$status"
	fi

	# Retention: delete dumps older than RETENTION_DAYS from object storage.
	# ISO-8601 LastModified timestamps sort/compare correctly as plain strings
	# against a YYYY-MM-DD cutoff, so no date parsing is needed here.
	cutoff=$(date -u -d "-${RETENTION_DAYS} days" +%Y-%m-%d)
	old_keys=$(aws --profile cloudpe --endpoint-url "$OBJECT_STORAGE_ENDPOINT_URL" \
		s3api list-objects-v2 --bucket "$BACKUP_BUCKET_NAME" --prefix "postgres/" \
		--query "Contents[?LastModified<='${cutoff}'].Key" --output text 2>&1)
	status=$?
	if [ "$status" -ne 0 ]; then
		printf '%s\n' "$old_keys" | alert "$status"
		rm -f "$dump_file"
		exit "$status"
	fi
	if [ -n "$old_keys" ] && [ "$old_keys" != "None" ]; then
		printf '%s\n' "$old_keys" | tr '\t' '\n' | while IFS= read -r key; do
			[ -n "$key" ] && aws --profile cloudpe --endpoint-url "$OBJECT_STORAGE_ENDPOINT_URL" \
				s3 rm "s3://${BACKUP_BUCKET_NAME}/${key}"
		done
	fi
fi

rm -f "$dump_file"
