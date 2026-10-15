#!/bin/sh
# Runs one scheduled job via `docker compose run`, and on a nonzero exit,
# emails the failure through the existing SES provider instead of a new
# notification channel (backend/scripts/send_job_failure_alert.py) -- the
# cron equivalent of AWS's CloudWatch-alarm-on-log-pattern alerts, since
# CloudPe has no managed alarm/alert service.
#
# Usage: run-job.sh <job-name> <python-args...>
# Example: run-job.sh nav-daily scripts/jobs/refresh_nav_daily.py
set -u
cd "$(dirname "$0")/.." || exit 1

job_name="$1"
shift

output=$(docker compose run --rm -T backend python "$@" 2>&1)
status=$?
printf '%s\n' "$output"

if [ "$status" -ne 0 ]; then
	printf '%s' "$output" | docker compose run --rm -T backend python scripts/send_job_failure_alert.py "$job_name" "$status"
fi

exit "$status"
