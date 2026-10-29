#!/bin/sh
# Alerts if the VM's root disk is more than a threshold percent full. Exists
# because of the 29 Oct 2026 incident (docs: Docs/orchestration/
# 2026-10-29-deploy-hardening-guide.md): a deploy filled the ~27 GB disk, which
# also holds Postgres, and nothing warned beforehand. Same alert path as
# check-memory.sh (SES mail through send_job_failure_alert.py), so the email
# subject reads "[LeapSwitch staging] disk-usage failed (exit <percent>)".
#
# Usage: check-disk.sh [threshold_percent]   (default 80)
set -eu
cd "$(dirname "$0")/.."

threshold="${1:-80}"
# Same filesystem Docker's images, build cache and the Postgres volume live on.
path=/var/lib/docker
[ -d "$path" ] || path=/
used=$(df -P "$path" | awk 'NR==2 {gsub("%", "", $5); print $5}')

if [ "$used" -ge "$threshold" ]; then
	report="Disk usage: ${used}% (threshold ${threshold}%)

$(df -h "$path")

$(docker system df 2>&1)

Free space first (Docs/orchestration/2026-10-29-deploy-hardening-guide.md, section 4); never docker system prune -a or docker volume prune."
	printf '%s' "$report" | docker compose run --rm -T backend python scripts/send_job_failure_alert.py disk-usage "$used"
fi
