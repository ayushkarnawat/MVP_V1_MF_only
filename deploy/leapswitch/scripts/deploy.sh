#!/bin/sh
# Builds the frontend static bundle and (re)starts the stack. Run from the
# VM, inside this repo checkout, after .env is in place.
#
# The frontend has no Dockerfile/service of its own -- caddy serves its
# static build output directly (see Caddyfile), so building it is a one-off
# step here rather than a long-running container.
#
# Tags the currently-running backend/worker images as :previous before
# rebuilding, so a bad deploy can be undone with rollback.sh without a
# rebuild (AWS staging's equivalent is retagging the pre-deploy ECR image).
set -eu
cd "$(dirname "$0")/.."

# shellcheck disable=SC1091
. ./.env

for svc in backend worker; do
	if docker image inspect "leapswitch-${svc}:latest" >/dev/null 2>&1; then
		docker tag "leapswitch-${svc}:latest" "leapswitch-${svc}:previous"
	fi
done

# Vite bakes VITE_* vars into the static bundle at build time, not runtime --
# they must be passed into this one-off build container explicitly.
docker run --rm \
	-e "VITE_API_BASE_URL=https://${LS_API_DOMAIN}" \
	-e "VITE_GOOGLE_OAUTH_CLIENT_ID=${GOOGLE_OAUTH_CLIENT_ID}" \
	-v "$(pwd)/../../frontend:/app" -w /app node:20-alpine sh -c \
	"npm ci && npm run build"

docker compose up -d --build
