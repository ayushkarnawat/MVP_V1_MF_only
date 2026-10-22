#!/bin/sh
# Alerts if the VM's free memory drops below a threshold. Exists specifically
# because of the tightest point in the 16 GB budget documented in
# Docs/orchestration/leapswitch-staging-plan.html ("Is a.gp1.16g right?"):
# the 05:45-06:05 IST daily-batch-job window, plus any daytime coincidence of
# several concurrent recomputes against the worker container's 5 GB cap.
# Run via cron around that window (see crontab.leapswitch); the threshold
# default (1000 MB) matches the documented worst-case margin before this
# plan calls for resizing to a.gp1.24g instead of tuning further.
#
# Usage: check-memory.sh [threshold_mb]
set -eu
cd "$(dirname "$0")/.."

threshold_mb="${1:-1000}"
available_mb=$(free -m | awk '/^Mem:/{print $7}')

if [ "$available_mb" -lt "$threshold_mb" ]; then
	report="Available memory: ${available_mb}MB (threshold ${threshold_mb}MB)

$(free -h)

Worker container:
$(docker compose ps worker 2>&1)
$(docker stats --no-stream worker 2>&1)"
	printf '%s' "$report" | docker compose run --rm -T backend python scripts/send_job_failure_alert.py low-memory "$available_mb"
fi
