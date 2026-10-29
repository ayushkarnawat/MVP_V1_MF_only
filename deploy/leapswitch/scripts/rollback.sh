#!/bin/sh
# Undoes the last deploy.sh run's backend image build. deploy.sh tags the image
# that was running right before each rebuild as :previous; this just points
# :latest back at it and restarts -- no rebuild needed, so it's fast and
# doesn't depend on git/npm/docker build working.
#
# The worker runs the backend's image (docker-compose.yml), so restoring the
# backend tag restores both. Old leapswitch-worker:* tags from before that
# change are no longer used and can be removed with `docker rmi`.
#
# Does NOT touch the database (see restore.sh for that) or roll back the
# frontend bundle (checkout the old commit and re-run deploy.sh's frontend
# build step for that -- Caddy serves whatever is in frontend/dist directly).
#
# Usage: rollback.sh
set -eu
cd "$(dirname "$0")/.."

if ! docker image inspect leapswitch-backend:previous >/dev/null 2>&1; then
	echo "no leapswitch-backend:previous image found -- nothing to roll back to" >&2
	exit 1
fi

docker tag leapswitch-backend:previous leapswitch-backend:latest

docker compose up -d
