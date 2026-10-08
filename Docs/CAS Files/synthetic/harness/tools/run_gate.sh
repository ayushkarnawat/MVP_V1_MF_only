#!/usr/bin/env bash
# Runs the synthetic gate in WSL (orchestrator). Usage: bash run_gate.sh [OUTDIR]
# Every scenario runs twice: normal, then MFAPI_BLOCKED=1. Prints PASS/FAIL per run
# and a final count. JSON + log per run go to OUTDIR (default /tmp/gate).
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"; H="$(dirname "$HERE")"
REPO="$(cd "$H/../../../.." && pwd)"; OUT="${1:-/tmp/gate}"; mkdir -p "$OUT"
MASTER="$REPO/Docs/CAS Files/synthetic/navall_2026-10-06.txt"
cd "$REPO/backend"
pass=0; fail=0
while read -r seq flags; do
  [[ -z "$seq" || "$seq" == \#* ]] && continue
  pdfs=$(echo "$seq" | sed 's/\([^,]*\)/\1.pdf/g')
  for blocked in 0 1; do
    name="$(echo "$seq" | tr ',' '+')${flags:+_$(echo $flags | tr ' =' '__')}_b$blocked"
    if env $flags MFAPI_BLOCKED=$blocked SEQ="$pdfs" MASTER_FILE="$MASTER" OUT="$OUT/$name.json" PYTHONWARNINGS=ignore \
        timeout 1800 python3 -m pytest "$H/test_deep.py" -q -p no:cacheprovider -p no:warnings --rootdir "$H" >"$OUT/$name.log" 2>&1; then
      echo "PASS $name"; pass=$((pass+1)); else echo "FAIL $name"; fail=$((fail+1)); fi
  done
done < "$HERE/gate_scenarios.txt"
echo "GATE: $pass passed, $fail failed"
