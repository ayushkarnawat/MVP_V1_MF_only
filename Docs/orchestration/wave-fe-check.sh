#!/usr/bin/env bash
# Frontend checks for the 2026 waves, one mirror per lane, so four lanes can run at once.
#
#   wsl.exe -d Ubuntu -- bash "/mnt/d/Unifolio code/Docs/orchestration/wave-fe-check.sh" <lane> test <paths under src/>
#   ... <lane> types      (tsc -b)
#   ... <lane> lint       (oxlint)
#   ... <lane> build
#
# <lane> is one of:
#   b | c | a | l | m1     -> the orchestrator's batch worktrees (m1: the merged M1 candidate) (/mnt/d/unifolio-b-journey, -c-hygiene, ...)
#   ag-<name>               -> a Gemini clone at C:\Users\Ayush\ag-<name>  (/mnt/c/Users/Ayush/ag-<name>)
#
# Why a mirror: the Windows folders have no usable node_modules (installed ones carry Linux binaries) and running
# from /mnt is about ten times slower. The mirror is ~/cr6-fe-<lane>; its node_modules is hard-linked once from
# ~/cr6-fe (no extra disk). Edit in the lane's own folder only; this script just mirrors it and runs the tool.
set -euo pipefail

# Where the lane worktrees and the Antigravity clones live, as WSL paths. Defaults are the first laptop's
# (D:\unifolio-* and C:\Users\Ayush\ag-*); on another machine export these before calling the script, e.g.
#   export UNIFOLIO_WT_ROOT=/mnt/d  UNIFOLIO_AG_ROOT=/mnt/c/Users/<windows-user>
WT="${UNIFOLIO_WT_ROOT:-/mnt/d}"
AG="${UNIFOLIO_AG_ROOT:-/mnt/c/Users/Ayush}"

lane="${1:?lane (b, c, a, l or ag-<name>)}"
mode="${2:?mode (test, types, lint, build)}"
shift 2 || true

case "$lane" in
  b) SRC="$WT/unifolio-b-journey/frontend" ;;
  c) SRC="$WT/unifolio-c-hygiene/frontend" ;;
  a) SRC="$WT/unifolio-a-numbers/frontend" ;;
  af) SRC="$WT/unifolio-a-fixes/frontend" ;;
  ax) SRC="$WT/unifolio-a-xirr/frontend" ;;
  aw) SRC="$WT/unifolio-a-wording/frontend" ;;
  d) SRC="$WT/unifolio-d-charts/frontend" ;;
  h) SRC="$WT/unifolio-h-tutorial/frontend" ;;
  l) SRC="$WT/unifolio-l-audit/frontend" ;;
  m1) SRC="$WT/unifolio-m1/frontend" ;;   # the merged M1 candidate (a throwaway worktree)
  dp) SRC="$WT/unifolio-d-popup/frontend" ;;   # D-9 and D-10 (pop-up tests and component)
  do) SRC="$WT/unifolio-d-overview/frontend" ;;   # D-7 (Overview graph)
  di) SRC="$WT/unifolio-d-int/frontend" ;;   # integration of the Batch D part 2 lanes
  m2) SRC="$WT/unifolio-m2/frontend" ;;   # the merged M2 candidate (branch m2-candidate)
  ks) SRC="$WT/unifolio-k-search/frontend" ;;   # Batch K integration (search)
  ed) SRC="$WT/unifolio-e-dates/frontend" ;;   # Batch E (dates)
  fn) SRC="$WT/unifolio-f-nav/frontend" ;;   # Batch F (section index)
  ag-*) SRC="$AG/${lane}/frontend" ;;
  *) echo "unknown lane $lane" >&2; exit 2 ;;
esac
[ -d "$SRC" ] || { echo "Missing $SRC" >&2; exit 2; }

DST="$HOME/cr6-fe-$lane"
BASE="$HOME/cr6-fe"
[ -d "$BASE/node_modules" ] || { echo "Missing $BASE/node_modules (the shared base)" >&2; exit 2; }
mkdir -p "$DST"
[ -d "$DST/node_modules" ] || cp -al "$BASE/node_modules" "$DST/node_modules"

rsync -a --delete --exclude node_modules --exclude dist "$SRC/" "$DST/"
cd "$DST"
export PATH="$HOME/.nvm/versions/node/v20.20.2/bin:/usr/bin:/bin"

case "$mode" in
  test)  exec npx --no-install vitest run "$@" --maxWorkers=2 ;;
  types) exec npx --no-install tsc -b ;;
  lint)  exec npx --no-install oxlint "$@" ;;
  build) exec npx --no-install vite build ;;
  *) echo "mode must be test, types, lint or build" >&2; exit 2 ;;
esac
