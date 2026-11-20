#!/bin/sh
# Daily NAV digest: one email a day summarising today's nav-daily runs (06:00 full run, 10:30 and
# 14:00 held-only retries), read from the log those runs append to. Cron runs this at 14:10, after
# the last retry. The subject says OK or ATTENTION so a glance at the inbox is enough.
#
# ATTENTION when the LAST run of the day still logged a problem (a NAV_PROBLEM line or an AMFI /
# held-refresh failure), or when fewer than the 3 expected runs logged a summary (a missed run is
# exactly what was invisible before this log existed). A problem an earlier run logged but the last
# run cleared is reported as "OK (recovered)", with the lines still listed.
#
# Usage: nav-digest.sh            (reads /var/log/unifolio-nav.log, plus .1 so a rotation just
#        NAV_LOG=/path nav-digest.sh   after the 06:00 run cannot hide its summary)
set -u
cd "$(dirname "$0")/.." || exit 1

log="${NAV_LOG:-/var/log/unifolio-nav.log}"
expected_runs=3
today=$(TZ=Asia/Kolkata date +%F)

# NAV_PROBLEM / NAV_NOTE lines carry no date of their own, so take everything from today's first
# summary line onward (older days sit above it) and keep only the NAV_* lines.
# The 06:00 run prints its "PEER_HISTORY failed=<n> of <m>" line (peer price histories the price
# service refused or did not answer) just BEFORE its own summary, so the last one seen before today's
# first summary is carried in. Listed for a glance; it does not change the OK or ATTENTION verdict.
today_block=$(cat "$log.1" "$log" 2>/dev/null \
	| awk -v d="NAV_SUMMARY ts=${today}T" '/^PEER_HISTORY /{peer=$0} index($0,d)==1 && !on{on=1; if (peer != "") print peer} on' \
	| grep -E '^(NAV_SUMMARY |NAV_PROBLEM |NAV_NOTE |PEER_HISTORY )' || true)

runs=$(printf '%s\n' "$today_block" | grep -c '^NAV_SUMMARY ' || true)
any_problem=$(printf '%s\n' "$today_block" | grep -c -E '^NAV_PROBLEM |^NAV_SUMMARY .*(amfi|held_refresh)=FAILED' || true)
# Lines from the last summary onward = the last run's own result.
last_run=$(printf '%s\n' "$today_block" | awk '/^NAV_SUMMARY /{buf=""} {buf=buf $0 "\n"} END{printf "%s", buf}')
last_problem=$(printf '%s' "$last_run" | grep -c -E '^NAV_PROBLEM |^NAV_SUMMARY .*(amfi|held_refresh)=FAILED' || true)

status=OK
note=""
if [ "$last_problem" -gt 0 ]; then
	status=ATTENTION
	note="The last run of the day still logged a problem (NAV_PROBLEM lines below)."
elif [ "$runs" -lt "$expected_runs" ]; then
	status=ATTENTION
	note="Only $runs of $expected_runs expected runs logged a summary today."
elif [ "$any_problem" -gt 0 ]; then
	status="OK (recovered)"
	note="An earlier run logged a problem, but the last run cleared it."
fi

body=$(printf 'NAV daily digest for %s: %s\n%s\n\nRuns logged today: %s of %s\n\n%s\n\nLog on the VM: %s\n' \
	"$today" "$status" "$note" "$runs" "$expected_runs" "${today_block:-(no lines logged today)}" "$log")

printf '%s' "$body" | docker compose run --rm -T backend python scripts/send_job_digest.py \
	"[LeapSwitch staging] NAV daily digest ${today}: ${status}"
