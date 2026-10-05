E=/tmp/claude-1000/-mnt-c-Users-Dell-Desktop-MVP-v1-MVP-V1-MF-only/d40d9ca5-07b2-48f5-ad26-1dc2b788734a/scratchpad/e2e
cd "/mnt/c/Users/Dell/Desktop/MVP v1/MVP_V1_MF_only/backend"
run(){ name=$1; shift; env "$@" OUT="$E/out/deep_$name.json" timeout 1800 python3 -m pytest "$E/test_deep.py" -q -p no:cacheprovider --rootdir "$E" >"$E/out/deep_$name.log" 2>&1; echo "$name done $?"; }
run kpk SEQ=kfin_pk_10yr.pdf SNAP=1
run kpk1 SEQ=kfin_pk_1yr.pdf
run kp7 SEQ=kfin_p7_7yr.pdf
run kp10fy SEQ=kfin_p10_FY.pdf
run old20 SEQ=oldcams_p20_20yr.pdf
run mixrta SEQ=p7_7yr.pdf,kfin_p7_7yr.pdf
