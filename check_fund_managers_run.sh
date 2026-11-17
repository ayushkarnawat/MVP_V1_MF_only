#!/usr/bin/env bash
# check_fund_managers_run.sh -- READ-ONLY health check for the monthly
# fund-managers job (fund-managers-monthly, cron: 06:00 IST on the 10th).
#
# Run on the staging VM:   bash check_fund_managers_run.sh [YYYY-MM-01]
# With no argument it checks the CURRENT month's period (the job stamps rows
# with the first day of the month it ran in, e.g. 2026-11-01 for 10 Nov 2026).
#
# It only reads: crontab, the cron log, and SELECTs on the database.
# It never runs the job, never writes, never edits anything.

set -u
REPO="${REPO:-/opt/unifolio}"
COMPOSE_DIR="$REPO/deploy/leapswitch"
PERIOD="${1:-$(date +%Y-%m-01)}"
PREV="$(date -d "$PERIOD -1 month" +%Y-%m-01 2>/dev/null)"
RUN_DAY="${PERIOD%-01}-10"

FAILS=0; WARNS=0
ok()   { printf '  [ OK ]  %s\n' "$*"; }
warn() { printf '  [WARN]  %s\n' "$*"; WARNS=$((WARNS+1)); }
bad()  { printf '  [FAIL]  %s\n' "$*"; FAILS=$((FAILS+1)); }
hdr()  { printf '\n== %s ==\n' "$*"; }

[ -n "$PREV" ] || { echo "Could not work out the previous month (needs GNU date)."; exit 2; }
cd "$COMPOSE_DIR" 2>/dev/null || { echo "Cannot find $COMPOSE_DIR (set REPO=... if the repo is elsewhere)."; exit 2; }

psql_q() {  # reads SQL on stdin, prints pipe-separated rows, no headers
  docker compose exec -T postgres sh -c \
    'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -A -t -F "|" -v ON_ERROR_STOP=1'
}

echo "Fund-managers monthly job check"
echo "  Period checked : $PERIOD   (compared with $PREV)"
echo "  Job day        : $RUN_DAY 06:00 IST"
echo "  Checked at     : $(date '+%F %T %Z')"

# ---------------------------------------------------------------- 1. cron
hdr "1. Is the job scheduled?"
LINE="$(crontab -l 2>/dev/null | grep 'fund-managers-monthly' | grep -v '^#')"
if [ -n "$LINE" ]; then ok "crontab entry found:"; echo "         $LINE"
else bad "no fund-managers-monthly line in this user's crontab (run as the user that installed it, usually root)"; fi
crontab -l 2>/dev/null | grep -q '^CRON_TZ=Asia/Kolkata' \
  && ok "CRON_TZ=Asia/Kolkata is set (06:00 means IST)" \
  || warn "CRON_TZ=Asia/Kolkata not seen; the job may fire at 06:00 server time instead"

# ------------------------------------------------------- 2. did cron fire
hdr "2. Did cron start it on the 10th?"
CRONLOG=""
if command -v journalctl >/dev/null 2>&1; then
  CRONLOG="$(journalctl --no-pager --since "$RUN_DAY 00:00" --until "$RUN_DAY 23:59" 2>/dev/null | grep -i 'CRON' | grep 'fund-managers-monthly')"
fi
if [ -z "$CRONLOG" ] && [ -r /var/log/syslog ]; then
  MON="$(date -d "$RUN_DAY" '+%b')"; DAY="$(date -d "$RUN_DAY" '+%e')"
  CRONLOG="$(grep -h "^$MON *$DAY " /var/log/syslog* 2>/dev/null | grep 'CRON' | grep 'fund-managers-monthly')"
fi
if [ -n "$CRONLOG" ]; then ok "cron log shows it started:"; echo "$CRONLOG" | head -3 | sed 's/^/         /'
else warn "no cron log line found for $RUN_DAY (log may have rotated, or cron did not fire; section 3 is the real proof)"; fi

# ------------------------------------------------- 3. what it wrote to DB
hdr "3. Did it write data for $PERIOD?"
read -r ROWS SCHEMES AMCS < <(psql_q <<SQL | tr '|' ' '
SELECT count(*), count(DISTINCT f.scheme_id), count(DISTINCT s.amc_name)
FROM scheme_fund_managers f JOIN schemes s ON s.id = f.scheme_id
WHERE f.reference_period = DATE '$PERIOD';
SQL
)
ROWS="${ROWS:-0}"; SCHEMES="${SCHEMES:-0}"; AMCS="${AMCS:-0}"
echo "  Rows: $ROWS   Funds: $SCHEMES   Fund houses: $AMCS"
if [ "$ROWS" -eq 0 ]; then bad "NOTHING was written for $PERIOD: the job did not run, or every fund house failed"
else ok "data exists for $PERIOD"; fi

read -r PROWS PSCHEMES < <(psql_q <<SQL | tr '|' ' '
SELECT count(*), count(DISTINCT scheme_id) FROM scheme_fund_managers WHERE reference_period = DATE '$PREV';
SQL
)
echo "  Previous month ($PREV): rows ${PROWS:-0}, funds ${PSCHEMES:-0}"
if [ "${PSCHEMES:-0}" -gt 0 ] && [ "$SCHEMES" -gt 0 ] && [ $((SCHEMES*2)) -lt "$PSCHEMES" ]; then
  bad "this month has less than half of last month's funds ($SCHEMES vs $PSCHEMES)"
fi

echo; echo "  How the rows were matched (ISIN/EXACT/FUZZY = automatic job, MANUAL = hand import):"
psql_q <<SQL | awk -F'|' '{printf "         %-8s %s rows, %s funds\n",$1,$2,$3}'
SELECT match_method, count(*), count(DISTINCT scheme_id)
FROM scheme_fund_managers WHERE reference_period = DATE '$PERIOD' GROUP BY 1 ORDER BY 1;
SQL
AUTO="$(psql_q <<SQL
SELECT count(DISTINCT scheme_id) FROM scheme_fund_managers
WHERE reference_period = DATE '$PERIOD' AND match_method <> 'MANUAL';
SQL
)"
[ "${AUTO:-0}" -gt 0 ] && ok "automatic rows exist (${AUTO} funds) -> the scheduled job itself wrote data" \
                       || bad "no automatic (non-MANUAL) rows: the scheduled job wrote nothing, only hand imports exist"

# --------------------------------------------------- 4. per fund house
hdr "4. Fund house by fund house ($PERIOD vs $PREV)"
printf '  %-46s %6s %6s  %-16s %s\n' "FUND HOUSE" "NOW" "LAST" "LAST METHODS" "STATUS"
psql_q <<SQL | awk -F'|' '
{ now=$2; last=$3; st="ok";
  if (last>0 && now==0) { st=($4=="MANUAL") ? "WAITING (hand import)" : "MISSING"; }
  else if (last>0 && now*2<last) st="COLLAPSED";
  else if (last==0 && now>0) st="new";
  printf "  %-46s %6d %6d  %-16s %s\n", substr($1,1,46), now, last, $4, st }'
SELECT s.amc_name,
  count(DISTINCT CASE WHEN f.reference_period = DATE '$PERIOD' THEN f.scheme_id END),
  count(DISTINCT CASE WHEN f.reference_period = DATE '$PREV'   THEN f.scheme_id END),
  coalesce(string_agg(DISTINCT CASE WHEN f.reference_period = DATE '$PREV' THEN f.match_method END, ','), '-')
FROM scheme_fund_managers f JOIN schemes s ON s.id = f.scheme_id
WHERE f.reference_period IN (DATE '$PERIOD', DATE '$PREV')
GROUP BY s.amc_name ORDER BY 1;
SQL
MISSING="$(psql_q <<SQL
SELECT count(*) FROM (
  SELECT s.amc_name FROM scheme_fund_managers f JOIN schemes s ON s.id=f.scheme_id
  WHERE f.reference_period IN (DATE '$PERIOD', DATE '$PREV') GROUP BY s.amc_name
  HAVING count(DISTINCT CASE WHEN f.reference_period=DATE '$PERIOD' THEN f.scheme_id END)=0
     AND bool_or(f.match_method <> 'MANUAL' AND f.reference_period=DATE '$PREV')
) x;
SQL
)"
if [ "${MISSING:-0}" -gt 0 ]; then warn "${MISSING} fund house(s) that were automatic last month have no data this month (marked MISSING above: blocked site, changed page, or failed)"
else ok "every automatic fund house from last month has data this month"; fi
echo "  Note: WAITING = a hand-import house with no file loaded yet this month (expected until someone imports it)."

# ------------------------------------------ 5. the other data the job loads
hdr "5. Other data loaded by the same run"
psql_q <<SQL | awk -F'|' '{printf "  %-28s %s rows for %s\n",$1,$2,$3}'
SELECT 'reported valuation (P/E, P/B)', count(*), DATE '$PERIOD' FROM scheme_reported_valuation WHERE reference_period = DATE '$PERIOD';
SQL

# --------------------------------------------------------------- verdict
hdr "Result"
if   [ "$FAILS" -gt 0 ]; then echo "  FAIL: $FAILS failure(s), $WARNS warning(s). The run did not complete properly."; RC=1
elif [ "$WARNS" -gt 0 ]; then echo "  PASS WITH WARNINGS: $WARNS warning(s). The run worked; read the WARN/MISSING lines above."; RC=0
else echo "  PASS: the job ran and wrote data for every automatic fund house."; RC=0; fi
echo "  (Read-only check: nothing was changed.)"
exit "$RC"
