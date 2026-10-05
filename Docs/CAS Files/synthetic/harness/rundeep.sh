E=/tmp/claude-1000/-mnt-c-Users-Dell-Desktop-MVP-v1-MVP-V1-MF-only/d40d9ca5-07b2-48f5-ad26-1dc2b788734a/scratchpad/e2e
cd "/mnt/c/Users/Dell/Desktop/MVP v1/MVP_V1_MF_only/backend"
run(){ name=$1; shift; env "$@" OUT="$E/out/deep_$name.json" timeout 1800 python3 -m pytest "$E/test_deep.py" -q -p no:cacheprovider --rootdir "$E" >"$E/out/deep_$name.log" 2>&1; echo "$name done $?"; }
run p20 SEQ=p20_20yr.pdf SNAP=1 ANALYTICS=1
run p10 SEQ=p10_10yr.pdf SNAP=1
run p7 SEQ=p7_7yr.pdf SNAP=1
run stale SEQ=p20_FY.pdf,p20_20yr.pdf SNAP=1
run fam SEQ=fam_10yr.pdf
run alt SEQ=p20_10yr.pdf,p20_FY_altfolio.pdf
run del SEQ=p20_FY.pdf,p20_20yr.pdf DELETE_FIRST=1
run twice SEQ=p7_7yr.pdf,p7_7yr.pdf
