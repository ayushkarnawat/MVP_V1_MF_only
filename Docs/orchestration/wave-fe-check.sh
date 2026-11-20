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

lane="${1:?lane (b, c, a, l or ag-<name>)}"
mode="${2:?mode (test, types, lint, build)}"
shift 2 || true

case "$lane" in
  b) SRC=/mnt/d/unifolio-b-journey/frontend ;;
  c) SRC=/mnt/d/unifolio-c-hygiene/frontend ;;
  a) SRC=/mnt/d/unifolio-a-numbers/frontend ;;
  af) SRC=/mnt/d/unifolio-a-fixes/frontend ;;
  ax) SRC=/mnt/d/unifolio-a-xirr/frontend ;;
  aw) SRC=/mnt/d/unifolio-a-wording/frontend ;;
  d) SRC=/mnt/d/unifolio-d-charts/frontend ;;
  h) SRC=/mnt/d/unifolio-h-tutorial/frontend ;;
  l) SRC=/mnt/d/unifolio-l-audit/frontend ;;
  m1) SRC=/mnt/d/unifolio-m1/frontend ;;   # the merged M1 candidate (a throwaway worktree)
  dp) SRC=/mnt/d/unifolio-d-popup/frontend ;;   # D-9 and D-10 (pop-up tests and component)
  do) SRC=/mnt/d/unifolio-d-overview/frontend ;;   # D-7 (Overview graph)
  m2) SRC=/mnt/d/unifolio-m2/frontend ;;   # the merged M2 candidate (branch m2-candidate)
  ag-*) SRC="/mnt/c/Users/Ayush/${lane}/frontend" ;;
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
