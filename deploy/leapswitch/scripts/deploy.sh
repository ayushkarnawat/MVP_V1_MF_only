#!/bin/sh
# Builds the backend image (only when backend/ changed), the frontend static
# bundle, and (re)starts the stack. Run from the VM, inside this repo
# checkout, after .env is in place.
#
#   deploy.sh                    smart: rebuilds the backend only if backend/
#                                differs from the last deployed commit
#   deploy.sh --rebuild-backend  rebuild the backend image regardless
#   deploy.sh --force            carry on past the low-disk warning without
#                                asking (needed when there is no terminal)
#
# The frontend has no Dockerfile/service of its own -- caddy serves its
# static build output directly (see Caddyfile), so building it is a one-off
# step here rather than a long-running container.
#
# The worker runs the SAME image as the backend (docker-compose.yml), so one
# build serves both. Order matters: the backend image is built BEFORE the new
# frontend goes live, so a failed build changes nothing the testers can see.
# The image running right before a rebuild is tagged :previous so a bad deploy
# can be undone with rollback.sh without a rebuild.
set -eu
cd "$(dirname "$0")/.."
# shellcheck disable=SC1091
. ./scripts/lib-deploy.sh

for arg in "$@"; do
	case "$arg" in
		--force) FORCE=1 ;;
		--rebuild-backend) REBUILD_BACKEND=1 ;;
		*) echo "unknown option: $arg"; exit 1 ;;
	esac
done

# shellcheck disable=SC1091
. ./.env

if backend_needs_build; then
	build=1
	echo "backend: building ($REASON)"
	check_free_space 10 "a backend rebuild"
else
	build=0
	echo "backend: skipping the rebuild ($REASON)"
	check_free_space 1 "a frontend-only deploy"
fi

if [ "$build" = 1 ]; then
	old_id=$(docker image inspect -f '{{.Id}}' leapswitch-backend:latest 2>/dev/null || true)
	if ! docker compose build backend; then
		echo "backend build FAILED; the frontend and the running containers were not touched."
		# A failed build can leave :latest on a half-unpacked image, which cron jobs and
		# `docker compose run` would then use. Point it back at what was running.
		if [ -n "$old_id" ]; then
			docker tag "$old_id" leapswitch-backend:latest
			echo "leapswitch-backend:latest restored to the previously running image."
		fi
		exit 1
	fi
	if [ -n "$old_id" ]; then
		docker tag "$old_id" leapswitch-backend:previous
	fi
fi

# Vite bakes VITE_* vars into the static bundle at build time, not runtime --
# they must be passed into this one-off build container explicitly.
docker run --rm \
	-e "VITE_API_BASE_URL=https://${LS_API_DOMAIN}" \
	-e "VITE_GOOGLE_OAUTH_CLIENT_ID=${GOOGLE_OAUTH_CLIENT_ID}" \
	-v "$(pwd)/../../frontend:/app" -w /app node:20-alpine sh -c \
	"npm ci && npm run build"

docker compose up -d

if [ "$build" = 1 ]; then
	record_backend_commit
	# Only dangling images and old build layers: never volumes, containers or tagged
	# images. Keeps the newest 3 GB of cache so a later rebuild is still quick.
	docker image prune -f || echo "note: image prune failed (harmless)"
	docker builder prune --keep-storage 3GB -f ||
		echo "note: builder prune failed (check 'docker builder prune --help' for the flag name)"
fi
