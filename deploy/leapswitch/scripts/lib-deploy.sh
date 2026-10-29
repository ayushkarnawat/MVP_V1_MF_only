#!/bin/sh
# Shared helpers for deploy.sh and deploy-redesign.sh (sourced, not run).
# Callers must have cd'd into deploy/leapswitch first.
#
# Why this exists (29 Oct 2026 incident): a front-end-only change was deployed
# with --full, the backend and worker rebuilt from scratch (~2 GB each) on a
# ~27 GB disk that also holds Postgres, and the build died with "no space left
# on device". These helpers make a deploy warn before it can fill the disk and
# rebuild the backend only when backend/ actually changed.

FORCE=0
REBUILD_BACKEND=0
# Outside the repo on purpose: the main clone and the redesign worktree both
# deploy the SAME leapswitch-backend image, so "what was last deployed" must
# be one record both can read, not one file per clone.
DEPLOY_STATE_DIR="${DEPLOY_STATE_DIR:-/var/lib/unifolio-deploy}"
BACKEND_STATE_FILE="$DEPLOY_STATE_DIR/last-backend-commit"
REASON=""

# Free KB on the filesystem that holds Docker's data (falls back to /).
free_kb() {
	p=/var/lib/docker
	[ -d "$p" ] || p=/
	df -Pk "$p" | awk 'NR==2 {print $4}'
}

# H1. Warn (never silently refuse) when free space is under the need.
# Interactive: asks y/N. Non-interactive (no terminal): stops unless --force.
check_free_space() {
	need_gb=$1
	what=$2
	avail_kb=$(free_kb)
	need_kb=$((need_gb * 1024 * 1024))
	if [ "$avail_kb" -ge "$need_kb" ]; then
		return 0
	fi
	printf 'WARNING: %s needs about %s GB free, but only %s GB is free on the Docker disk.\n' \
		"$what" "$need_gb" "$((avail_kb / 1024 / 1024))"
	printf 'A build that runs out of space can also stall Postgres, which lives on this disk.\n'
	if [ "$FORCE" = 1 ]; then
		echo "--force given, continuing anyway."
		return 0
	fi
	if [ -t 0 ]; then
		printf 'Continue anyway? [y/N] '
		read -r ans
		case "$ans" in
			y | Y | yes | YES) return 0 ;;
		esac
	else
		echo "No terminal to ask on; re-run with --force to continue anyway."
	fi
	echo "Stopped before changing anything."
	exit 1
}

# H2. Returns 0 (build needed) or 1 (backend unchanged, skip). Sets REASON.
# When in doubt it says "build": every unknown below errs toward rebuilding.
backend_needs_build() {
	if [ "$REBUILD_BACKEND" = 1 ]; then
		REASON="--rebuild-backend was given"
		return 0
	fi
	if ! docker image inspect leapswitch-backend:latest >/dev/null 2>&1; then
		REASON="there is no leapswitch-backend:latest image yet"
		return 0
	fi
	if [ ! -f "$BACKEND_STATE_FILE" ]; then
		REASON="no record of the last deployed backend commit ($BACKEND_STATE_FILE)"
		return 0
	fi
	last=$(cat "$BACKEND_STATE_FILE")
	if ! git cat-file -e "${last}^{commit}" 2>/dev/null; then
		REASON="the recorded commit $last is not in this clone (git fetch it, or use --rebuild-backend)"
		return 0
	fi
	# Compares that commit to the working tree, so uncommitted edits count too.
	if ! git diff --quiet "$last" -- :/backend; then
		REASON="backend/ differs from the last deployed commit $last"
		return 0
	fi
	if [ -n "$(git status --porcelain --untracked-files=all -- :/backend)" ]; then
		REASON="backend/ has untracked or uncommitted files"
		return 0
	fi
	REASON="backend/ is unchanged since $last"
	return 1
}

record_backend_commit() {
	if mkdir -p "$DEPLOY_STATE_DIR" 2>/dev/null &&
		git rev-parse HEAD >"$BACKEND_STATE_FILE" 2>/dev/null; then
		echo "recorded backend commit $(cat "$BACKEND_STATE_FILE")"
	else
		echo "note: could not write $BACKEND_STATE_FILE; the next --full will rebuild the backend."
	fi
}
