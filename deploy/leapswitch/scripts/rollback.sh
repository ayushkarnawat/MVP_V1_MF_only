#!/bin/sh
# Undoes the last deploy.sh run's backend/worker image build. deploy.sh tags
# the image that was running right before each rebuild as :previous; this
# just points :latest back at it and restarts -- no rebuild needed, so it's
# fast and doesn't depend on git/npm/docker build working.
#
# Does NOT touch the database (see restore.sh for that) or roll back the
# frontend bundle (checkout the old commit and re-run deploy.sh's frontend
# build step for that -- Caddy serves whatever is in frontend/dist directly).
#
# Usage: rollback.sh
set -eu
cd "$(dirname "$0")/.."

for svc in backend worker; do
	if ! docker image inspect "leapswitch-${svc}:previous" >/dev/null 2>&1; then
		echo "no leapswitch-${svc}:previous image found -- nothing to roll back to" >&2
		exit 1
	fi
done

for svc in backend worker; do
	docker tag "leapswitch-${svc}:previous" "leapswitch-${svc}:latest"
done

docker compose up -d
