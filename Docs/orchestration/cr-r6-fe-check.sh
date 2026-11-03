#!/usr/bin/env bash
# Run the frontend checks for Run 6 on WSL's own disk (fast), against the Windows clone's files.
#
#   wsl.exe -d Ubuntu -- bash /mnt/d/Unifolio\ code/Docs/orchestration/cr-r6-fe-check.sh test src/features/profile-v2
#   wsl.exe -d Ubuntu -- bash /mnt/d/Unifolio\ code/Docs/orchestration/cr-r6-fe-check.sh types
#   wsl.exe -d Ubuntu -- bash /mnt/d/Unifolio\ code/Docs/orchestration/cr-r6-fe-check.sh lint
#   wsl.exe -d Ubuntu -- bash /mnt/d/Unifolio\ code/Docs/orchestration/cr-r6-fe-check.sh build
#
# Why a copy: the Windows clone has no node_modules (the installed ones have Linux binaries), and
# running from /mnt/c is about ten times slower. The copy is ~/cr6-fe (node_modules is copied once).
# Edits are always made in the Windows clone; this script only mirrors them and runs the tool.
# A second tree can be checked at the same time: CR6_SRC=<its frontend folder> CR6_DST=$HOME/cr6-fe-<name> (node_modules copied once into that folder).
set -euo pipefail

SRC="${CR6_SRC:-/mnt/c/Users/Ayush/cr-run-1/frontend}"
DST="${CR6_DST:-$HOME/cr6-fe}"
mode="${1:-test}"
shift || true

if [ ! -d "$DST/node_modules" ]; then
  echo "Missing $DST/node_modules. Copy it once: rsync -a '/mnt/d/Unifolio code/frontend/node_modules' $DST/" >&2
  exit 2
fi

mkdir -p "$DST"
rsync -a --delete --exclude node_modules --exclude dist "$SRC/" "$DST/"
cd "$DST"
export PATH="$HOME/.nvm/versions/node/v20.20.2/bin:/usr/bin:/bin"  # node comes from nvm on this machine

case "$mode" in
  test)  exec npx --no-install vitest run "$@" --maxWorkers=2 ;;
  types) exec npx --no-install tsc -b ;;
  lint)  exec npx --no-install oxlint ;;
  build) exec npx --no-install vite build ;;
  *) echo "mode must be test, types, lint or build" >&2; exit 2 ;;
esac
