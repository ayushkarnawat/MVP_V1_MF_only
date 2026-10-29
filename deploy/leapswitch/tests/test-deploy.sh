#!/bin/sh
# Offline tests for scripts/deploy.sh + scripts/lib-deploy.sh (H1 low-disk
# warning, H2 skip-unchanged-backend, H4 build-before-frontend). Uses a fake
# docker and df on PATH and a throwaway git repo, so it touches no real
# containers or disk. Run: sh deploy/leapswitch/tests/test-deploy.sh
set -u
here=$(cd "$(dirname "$0")/.." && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
pass=0
fail=0

ok() { pass=$((pass + 1)); echo "ok   - $1"; }
bad() { fail=$((fail + 1)); echo "FAIL - $1"; }
has() { grep -q -- "$2" "$1" && ok "$3" || bad "$3"; }
lacks() { grep -q -- "$2" "$1" && bad "$3" || ok "$3"; }

# --- fake binaries -----------------------------------------------------------
mkdir -p "$work/bin"
cat >"$work/bin/docker" <<'EOF'
#!/bin/sh
echo "docker $*" >>"$LOG"
case "$*" in
	"image inspect -f"*) [ -n "${FAKE_NO_IMAGE:-}" ] && exit 1; echo sha256:oldimage; exit 0 ;;
	"image inspect"*) [ -n "${FAKE_NO_IMAGE:-}" ] && exit 1; exit 0 ;;
	"compose build"*) [ -n "${FAKE_BUILD_FAIL:-}" ] && exit 1; exit 0 ;;
esac
exit 0
EOF
cat >"$work/bin/df" <<'EOF'
#!/bin/sh
echo "Filesystem 1024-blocks Used Available Capacity Mounted"
echo "/dev/x 100 1 ${FAKE_AVAIL_KB:-99999999} 1% /"
EOF
chmod +x "$work/bin/docker" "$work/bin/df"

# --- throwaway repo shaped like the real one ---------------------------------
repo="$work/repo"
mkdir -p "$repo/deploy/leapswitch" "$repo/backend" "$repo/frontend"
cp -r "$here/scripts" "$repo/deploy/leapswitch/scripts"
printf 'LS_API_DOMAIN=x\nGOOGLE_OAUTH_CLIENT_ID=y\n' >"$repo/deploy/leapswitch/.env"
echo a >"$repo/backend/app.py"
echo a >"$repo/frontend/index.html"
(
	cd "$repo" && git init -q && git config user.email t@t && git config user.name t &&
		git add -A && git commit -q -m init
)

state="$work/state"
run() { # run <name> [args...]; leaves exit code in $rc and output in $LOG
	name=$1
	shift
	LOG="$work/$name.log"
	: >"$LOG"
	export LOG
	PATH="$work/bin:$PATH" DEPLOY_STATE_DIR="$state" \
		sh "$repo/deploy/leapswitch/scripts/deploy.sh" "$@" </dev/null >>"$LOG" 2>&1
	rc=$?
}
head_sha() { (cd "$repo" && git rev-parse HEAD); }

# 1. no state file -> builds, builds BEFORE the frontend, records HEAD
unset FAKE_BUILD_FAIL FAKE_NO_IMAGE FAKE_AVAIL_KB
rm -rf "$state"
run first
[ "$rc" = 0 ] && ok "first deploy succeeds" || bad "first deploy succeeds (rc=$rc)"
has "$work/first.log" "backend: building" "no state file -> builds"
b=$(grep -n "compose build" "$work/first.log" | head -1 | cut -d: -f1)
f=$(grep -n "docker run" "$work/first.log" | head -1 | cut -d: -f1)
[ -n "$b" ] && [ -n "$f" ] && [ "$b" -lt "$f" ] && ok "backend built before the frontend goes live" || bad "build order"
has "$work/first.log" "tag sha256:oldimage leapswitch-backend:previous" "old image tagged :previous"
has "$work/first.log" "builder prune --keep-storage 3GB -f" "cache capped after a build"
[ "$(cat "$state/last-backend-commit")" = "$(head_sha)" ] && ok "HEAD recorded" || bad "HEAD recorded"

# 2. backend unchanged -> skip, :previous untouched, no prune
run unchanged
[ "$rc" = 0 ] && ok "unchanged deploy succeeds" || bad "unchanged deploy succeeds (rc=$rc)"
has "$work/unchanged.log" "skipping the rebuild" "unchanged backend -> skip"
lacks "$work/unchanged.log" "compose build" "no compose build when unchanged"
lacks "$work/unchanged.log" "leapswitch-backend:previous" ":previous not overwritten when skipping"
has "$work/unchanged.log" "docker run" "frontend still built when backend skipped"

# 3. frontend-only change still skips the backend
echo b >"$repo/frontend/index.html"
(cd "$repo" && git commit -q -am fe)
run feonly
lacks "$work/feonly.log" "compose build" "frontend-only commit -> backend skipped"

# 4. committed backend change -> builds
echo b >"$repo/backend/app.py"
(cd "$repo" && git commit -q -am be)
run bechange
has "$work/bechange.log" "backend/ differs" "committed backend change -> builds"

# 5. uncommitted and untracked backend edits -> build
run clean
lacks "$work/clean.log" "compose build" "clean tree again -> skip"
echo c >>"$repo/backend/app.py"
run dirty
has "$work/dirty.log" "compose build" "uncommitted backend edit -> builds"
(cd "$repo" && git checkout -q -- backend)
echo n >"$repo/backend/new.py"
run untracked
has "$work/untracked.log" "compose build" "untracked backend file -> builds"
rm "$repo/backend/new.py"

# 6. forced rebuild, missing image, unknown recorded commit
run forced --rebuild-backend
has "$work/forced.log" "compose build" "--rebuild-backend builds"
FAKE_NO_IMAGE=1 run noimage
has "$work/noimage.log" "compose build" "missing :latest image -> builds"
unset FAKE_NO_IMAGE
echo deadbeefdeadbeefdeadbeefdeadbeefdeadbeef >"$state/last-backend-commit"
run badsha
has "$work/badsha.log" "compose build" "unknown recorded commit -> builds"

# 7. low disk (H1)
echo 1 >"$repo/backend/app.py"
(cd "$repo" && git commit -q -am be2)
FAKE_AVAIL_KB=$((5 * 1024 * 1024)) run lowdisk
[ "$rc" = 1 ] && ok "5 GB free + backend rebuild -> stops without a terminal" || bad "low disk stops (rc=$rc)"
has "$work/lowdisk.log" "WARNING: a backend rebuild needs about 10 GB" "warning names the need and the free space"
lacks "$work/lowdisk.log" "compose build" "nothing built after the warning stop"
lacks "$work/lowdisk.log" "docker run" "frontend untouched after the warning stop"
FAKE_AVAIL_KB=$((5 * 1024 * 1024)) run lowforce --force
[ "$rc" = 0 ] && ok "--force continues past the warning" || bad "--force continues (rc=$rc)"
has "$work/lowforce.log" "compose build" "--force still builds"
# Backend now recorded as deployed, so a frontend-only deploy needs only 1 GB
FAKE_AVAIL_KB=$((5 * 1024 * 1024)) run fe5gb
[ "$rc" = 0 ] && ok "frontend-only deploy fine with 5 GB free" || bad "fe-only 5 GB (rc=$rc)"
FAKE_AVAIL_KB=$((500 * 1024)) run fe500mb
[ "$rc" = 1 ] && ok "frontend-only deploy warns under 1 GB" || bad "fe-only 500 MB (rc=$rc)"

# 8. failed build (H4): frontend untouched, :latest restored, state not advanced
echo 2 >"$repo/backend/app.py"
(cd "$repo" && git commit -q -am be3)
before=$(cat "$state/last-backend-commit")
FAKE_BUILD_FAIL=1 run buildfail
[ "$rc" = 1 ] && ok "failed build exits non-zero" || bad "failed build rc=$rc"
lacks "$work/buildfail.log" "docker run" "failed build never reaches the frontend"
lacks "$work/buildfail.log" "compose up" "failed build never restarts containers"
has "$work/buildfail.log" "tag sha256:oldimage leapswitch-backend:latest" ":latest pointed back at the running image"
[ "$(cat "$state/last-backend-commit")" = "$before" ] && ok "state not advanced by a failed build" || bad "state advanced on failure"

echo
echo "$pass passed, $fail failed"
[ "$fail" = 0 ]
