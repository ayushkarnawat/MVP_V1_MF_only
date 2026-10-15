#!/bin/sh
# Builds the frontend static bundle and (re)starts the stack. Run from the
# VM, inside this repo checkout, after .env is in place.
#
# The frontend has no Dockerfile/service of its own -- caddy serves its
# static build output directly (see Caddyfile), so building it is a one-off
# step here rather than a long-running container.
set -eu
cd "$(dirname "$0")/.."

# shellcheck disable=SC1091
. ./.env

# Vite bakes VITE_* vars into the static bundle at build time, not runtime --
# they must be passed into this one-off build container explicitly.
docker run --rm \
	-e "VITE_API_BASE_URL=https://${LS_API_DOMAIN}" \
	-e "VITE_GOOGLE_OAUTH_CLIENT_ID=${GOOGLE_OAUTH_CLIENT_ID}" \
	-v "$(pwd)/../../frontend:/app" -w /app node:20-alpine sh -c \
	"npm ci && npm run build"

docker compose up -d --build
