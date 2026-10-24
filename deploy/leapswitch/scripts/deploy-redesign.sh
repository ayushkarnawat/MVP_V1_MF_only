#!/bin/sh
# Builds and publishes the REDESIGN frontend (branch leapswitch-redesign) to
# ls-redesign.unifolio.in. Run from the redesign worktree on the VM
# (/opt/unifolio-redesign), never from the main clone.
#
#   deploy-redesign.sh            frontend only: builds the bundle into this
#                                 worktree's frontend/dist; Caddy serves it
#                                 live through the bind mount (no restart, the
#                                 backend, worker and ls-staging are untouched).
#   deploy-redesign.sh --caddy    also recreates the caddy container, needed
#                                 once (Caddyfile / volume changes) or after
#                                 editing .env's domains.
#   deploy-redesign.sh --full     backend/worker too: delegates to deploy.sh
#                                 (tags :previous, rebuilds from THIS worktree,
#                                 so the backend is the redesign superset).
#
# The API is the same ls-staging-api domain as the main link (shared backend).
set -eu
cd "$(dirname "$0")/.."

[ -f ./.env ] || { echo "missing ./.env (symlink it to the main clone's .env)"; exit 1; }
# shellcheck disable=SC1091
. ./.env

branch="$(git rev-parse --abbrev-ref HEAD)"
case "$branch" in
	leapswitch-redesign) ;;
	*) echo "refusing: this worktree is on '$branch', expected leapswitch-redesign"; exit 1 ;;
esac

expected="$(cd ../.. && pwd)/frontend/dist"
if [ "${REDESIGN_FRONTEND_DIST:-}" != "$expected" ]; then
	echo "REDESIGN_FRONTEND_DIST in .env is '${REDESIGN_FRONTEND_DIST:-unset}', but this worktree builds to '$expected'. Fix .env first."
	exit 1
fi
if [ "${MAIN_FRONTEND_DIST:-}" = "$expected" ]; then
	echo "MAIN_FRONTEND_DIST points at the redesign bundle; that would swap ls-staging's frontend. Fix .env first."
	exit 1
fi

if [ "${1:-}" = "--full" ]; then
	exec ./scripts/deploy.sh
fi

docker run --rm \
	-e "VITE_API_BASE_URL=https://${LS_API_DOMAIN}" \
	-e "VITE_GOOGLE_OAUTH_CLIENT_ID=${GOOGLE_OAUTH_CLIENT_ID}" \
	-v "$(pwd)/../../frontend:/app" -w /app node:20-alpine sh -c \
	"npm ci && npm run build"

if [ "${1:-}" = "--caddy" ]; then
	docker compose up -d --no-deps caddy
fi
echo "redesign bundle built at $expected -> https://${LS_REDESIGN_DOMAIN:-ls-redesign.unifolio.in}"
