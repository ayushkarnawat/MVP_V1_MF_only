#!/usr/bin/env bash
# Real CAS statements, counts only (test_real_check.py prints no names/PANs/folios/amounts).
# Passwords are NEVER written here: export them first (ask the user):
#   export PW_MAIN=...   # "CAS 10 Yr", "CAS 2025-26 FY", "CAS Last 2 years", family_cas_1/2
#   export PW_CP225=...  # CAS_01042016-23092026_CP225296748_*.pdf
#   export PW_CP219=...  # CAS_01042025-31032026_CP219252880_* and _CP219255789_*
# Files live outside the repo: /mnt/c/Users/Dell/Desktop/Unifolio/CAS Files/
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"; H="$(dirname "$HERE")"; REPO="$(cd "$H/../../../.." && pwd)"
R="/mnt/c/Users/Dell/Desktop/Unifolio/CAS Files"
CP="$R/CAS_01042016-23092026_CP225296748_23092026061510511.pdf"
E1="$R/CAS_01042025-31032026_CP219252880_30072026035507197.pdf"; E2="$R/CAS_01042025-31032026_CP219255789_30072026042615915.pdf"
TEN="$R/CAS 10 Yr.pdf"; FY="$R/CAS 2025-26 FY.pdf"; L2="$R/CAS Last 2 years.pdf"; F1="$R/family_cas_1.pdf"; F2="$R/family_cas_2.pdf"
Y="$R/synthetic"; M="$REPO/Docs/CAS Files/synthetic/navall_2026-10-06.txt"
cd "$REPO/backend"
run() { echo "=== $1 (mfapi blocked=$2)"
  PYTHONWARNINGS=ignore MFAPI_BLOCKED=$2 CAS_FILES="$3" CAS_PASSWORDS="$4" MASTER_FILE="$M" \
    timeout 1500 python3 -m pytest "$H/test_real_check.py" -q -s --tb=no -p no:warnings -p no:cacheprovider --rootdir "$H" 2>&1 | grep -E "REALCHECK|passed|failed"; }
for b in 0 1; do
  run "CP225296748 alone" $b "$CP" "$PW_CP225"
  run "10 Yr alone" $b "$TEN" "$PW_MAIN"
  run "2025-26 FY alone" $b "$FY" "$PW_MAIN"
  run "Last 2 years alone" $b "$L2" "$PW_MAIN"
  run "family_cas_1 alone" $b "$F1" "$PW_MAIN"
  run "family_cas_2 alone" $b "$F2" "$PW_MAIN"
  run "CP219252880 alone (known: empty statement, fails)" $b "$E1" "$PW_CP219"
  run "CP219255789 alone" $b "$E2" "$PW_CP219"
done
run "FY then 10 Yr" 0 "$FY|$TEN" "$PW_MAIN|$PW_MAIN"
run "10 Yr then FY" 0 "$TEN|$FY" "$PW_MAIN|$PW_MAIN"
run "Last 2 years then 10 Yr" 0 "$L2|$TEN" "$PW_MAIN|$PW_MAIN"
run "10 Yr then Last 2 years" 0 "$TEN|$L2" "$PW_MAIN|$PW_MAIN"
run "FY then Last 2 then 10 Yr" 0 "$FY|$L2|$TEN" "$PW_MAIN|$PW_MAIN|$PW_MAIN"
run "10 Yr then Last 2 then FY" 0 "$TEN|$L2|$FY" "$PW_MAIN|$PW_MAIN|$PW_MAIN"
run "10 Yr twice (repeat)" 0 "$TEN|$TEN" "$PW_MAIN|$PW_MAIN"
run "CP225296748 then 10 Yr" 0 "$CP|$TEN" "$PW_CP225|$PW_MAIN"
run "10 Yr then CP225296748" 0 "$TEN|$CP" "$PW_MAIN|$PW_CP225"
run "family_cas_1 then family_cas_2" 0 "$F1|$F2" "$PW_MAIN|$PW_MAIN"
for f in p20_20yr p3_FY p7_1yr p7_7yr p7_FY px_14yr fam_10yr kfin_pk_10yr; do run "synthetic $f" 0 "$Y/$f.pdf" "$PW_MAIN"; done
echo "ALL REAL RUNS DONE"
