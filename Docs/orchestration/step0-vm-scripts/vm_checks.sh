#!/usr/bin/env bash
# Step 0 read-only checks, run ON THE VM: source reachability (S4, S5), four database counts (S7), health.
# Makes only single GET/POST requests and read-only SQL. Writes only a log file under ~/step0/out.
# Run:  bash ~/step0/vm_checks.sh
set -u
cd /opt/unifolio-redesign/deploy/leapswitch || { echo "wrong directory"; exit 1; }
mkdir -p ~/step0/out
LOG=~/step0/out/vm_checks_$(date +%F_%H%M).log
exec > >(tee -a "$LOG") 2>&1

echo "=== $(TZ=Asia/Kolkata date '+%Y-%m-%d %H:%M IST') | host $(hostname) | log $LOG"
echo "--- branch and image:"
git -C /opt/unifolio-redesign branch --show-current 2>/dev/null; git -C /opt/unifolio-redesign log -1 --format='%h %ad %s' --date=short 2>/dev/null
df -h / | tail -1

UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

echo; echo "=== S4a NSE per-stock P/E file (steps back up to 7 days, like the app's client)"
for i in 0 1 2 3 4 5 6 7; do
  d=$(date -d "-$i day" +%d%m%y)
  out=$(curl -m 30 -sA "$UA" -o /tmp/pe.csv -w "%{http_code} %{size_download}" "https://nsearchives.nseindia.com/content/equities/peDetail/PE_${d}.csv")
  echo "PE_${d}.csv -> $out"
  case "$out" in 200*) head -c 300 /tmp/pe.csv | head -3; break;; esac
  sleep 1
done

echo; echo "=== S4b NSE security master (DDMMYYYY, gzip)"
for i in 0 1 2 3 4 5 6 7; do
  d=$(date -d "-$i day" +%d%m%Y)
  out=$(curl -m 30 -sA "$UA" -o /tmp/sec.gz -w "%{http_code} %{size_download}" "https://nsearchives.nseindia.com/content/cm/NSE_CM_security_${d}.csv.gz")
  echo "NSE_CM_security_${d} -> $out"
  case "$out" in 200*) break;; esac
  sleep 1
done

echo; echo "=== S4c niftyindices total-return history (POST; last 30 days, Nifty 50)"
S=$(date -d "-30 day" +%d-%b-%Y); E=$(date +%d-%b-%Y)
curl -m 30 -sA "$UA" -X POST -H 'Content-Type: application/json' -w "\nHTTP %{http_code}\n" \
  https://www.niftyindices.com/BackPage/getTotalReturnIndexString \
  -d "{\"cinfo\":\"{\\\"name\\\":\\\"Nifty 50\\\",\\\"startDate\\\":\\\"$S\\\",\\\"endDate\\\":\\\"$E\\\",\\\"indexName\\\":\\\"Nifty 50\\\"}\"}" | tail -c 500
sleep 2
echo "--- price endpoint, Nifty 50 Arbitrage (S9 candidate)"
curl -m 30 -sA "$UA" -X POST -H 'Content-Type: application/json' -w "\nHTTP %{http_code}\n" \
  https://www.niftyindices.com/BackPage/getHistoricaldatatabletoString \
  -d "{\"cinfo\":\"{\\\"name\\\":\\\"Nifty 50 Arbitrage\\\",\\\"startDate\\\":\\\"$S\\\",\\\"endDate\\\":\\\"$E\\\",\\\"indexName\\\":\\\"Nifty 50 Arbitrage\\\"}\"}" | tail -c 400

echo; echo "=== S4d AMFI"
curl -m 30 -sIA "$UA" https://portal.amfiindia.com/spages/NAVAll.txt | head -1
curl -m 30 -sIA "$UA" https://www.amfiindia.com/online-center/download-factsheets | head -1

echo; echo "=== S5 BSE (expect: price file reachable, API blocked)"
echo "--- BSE data API root (403 or a redirect is the expected answer):"
curl -m 30 -sIA "$UA" https://api.bseindia.com/ | head -1
echo "--- BSE bhavcopy: URL pattern is NOT in the repo and this pattern is UNVERIFIED; a 200 with a few hundred KB means it works"
for i in 1 2 3 4 5 6 7; do
  d=$(date -d "-$i day" +%Y%m%d)
  out=$(curl -m 30 -sA "$UA" -H 'Referer: https://www.bseindia.com/' -o /tmp/bse.csv -w "%{http_code} %{size_download}" "https://www.bseindia.com/download/BhavCopy/Equity/BhavCopy_BSE_CM_0_0_0_${d}_F_0000.CSV")
  echo "bhavcopy ${d} -> $out"
  case "$out" in 200*) head -c 250 /tmp/bse.csv | head -2; break;; esac
  sleep 1
done

echo; echo "=== S7 database counts (read-only)"
set -a; . ./.env; set +a
q() { sudo docker compose exec -T postgres psql -U "$DB_USERNAME" "$DB_NAME" -c "$1"; }
echo "--- distinct managers (only needed when LinkedIn resumes)"
q "select count(*) from (select distinct lower(trim(m.manager_name)), s.amc_name from scheme_fund_managers m join schemes s on s.id = m.scheme_id) t"
echo "--- categories real households hold (settles the judgement rows of D14)"
q "select s.sebi_category, count(distinct s.id) as funds from folios f join schemes s on s.id = f.scheme_id group by 1 order by 2 desc"
echo "--- equity stocks held by funds with no P/E stored"
q "select count(distinct h.isin) as stocks_without_pe from scheme_holdings h left join stock_master sm on sm.isin = h.isin where h.asset_type::text ilike 'equity%' and h.isin is not null and sm.pe_ratio is null"
echo "--- equity stocks with no NSE symbol (BSE-only candidates)"
q "select count(distinct h.isin) as stocks_not_on_nse from scheme_holdings h left join stock_master sm on sm.isin = h.isin where h.asset_type::text ilike 'equity%' and h.isin is not null and sm.nse_symbol is null"
echo "--- manager coverage per fund house"
q "select s.amc_name, count(distinct s.id) as funds, count(distinct m.scheme_id) as with_manager from schemes s left join scheme_fund_managers m on m.scheme_id = s.id group by 1 order by 2 desc limit 70"
echo "--- users (copy one id for the recompute and timing steps)"
q "select id, email, created_at from users order by created_at desc limit 5"

echo; echo "=== health"
curl -s -o /dev/null -w "API /health -> %{http_code}\n" https://ls-staging-api.unifolio.in/health
sudo docker compose ps
sudo docker compose run --rm -T backend alembic current 2>&1 | tail -2
free -m | head -2
echo; echo "=== done. Log saved to $LOG"
