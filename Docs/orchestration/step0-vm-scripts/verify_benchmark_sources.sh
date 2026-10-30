#!/bin/bash
# Read-only. Tests, from the staging VM, every benchmark source that is not yet verified:
#   A. the niftyindices price and total-return endpoints for the debt, hybrid, arbitrage and
#      extra equity index names (these are the names the factsheets print); prints rows + newest date
#   B. reachability (HTTP status only) of the CRISIL, BSE, gold and silver pages
# Writes nothing to the database or the repo. Output: /home/deploy/step0/out/bench_verify_<date>.log
# Run:  bash /home/deploy/step0/verify_benchmark_sources.sh
set -u
OUT=/home/deploy/step0/out; mkdir -p "$OUT"
LOG="$OUT/bench_verify_$(date +%F).log"
UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
PRICE=https://www.niftyindices.com/BackPage/getHistoricaldatatabletoString
TRI=https://www.niftyindices.com/BackPage/getTotalReturnIndexString
END=$(date +%d-%b-%Y); START=$(date -d '-400 days' +%d-%b-%Y)

probe() { # $1 endpoint url, $2 index name -> "rows=N newest=<date> sample=<first row keys>"
  local body
  body=$(python3 - "$2" "$START" "$END" <<'PY'
import json,sys
n,s,e=sys.argv[1:4]
print(json.dumps({"cinfo": json.dumps({"name":n,"startDate":s,"endDate":e,"indexName":n}).replace('"',"'")}))
PY
)
  curl -s -m 40 -A "$UA" -H 'Content-Type: application/json; charset=UTF-8' \
       -H 'Origin: https://www.niftyindices.com' -H 'Referer: https://www.niftyindices.com/reports/historical-data' \
       -d "$body" "$1" | python3 -c '
import sys,json
raw=sys.stdin.read()
try:
    d=json.loads(raw)
    if isinstance(d,dict) and "d" in d: d=json.loads(d["d"])
    keys=sorted(d[0].keys()) if d else []
    last=d[0] if d else {}
    print("rows=%d first_row=%s keys=%s" % (len(d), json.dumps(last)[:160], ",".join(keys)))
except Exception as ex:
    print("not-json len=%d head=%r" % (len(raw), raw[:80]))
'
}

{
echo "== A. niftyindices endpoints, window $START .. $END =="
NAMES=(
 "Nifty 50 Arbitrage" "NIFTY 50 ARBITRAGE" "Nifty 50 Arbitrage Index"
 "Nifty 1D Rate Index" "NIFTY 1D Rate Index"
 "Nifty Liquid Index A-I" "Nifty Low Duration Debt Index A-I" "Nifty Ultra Short Duration Debt Index A-I"
 "Nifty Short Duration Debt Index A-II" "Nifty Medium Duration Debt Index A-III" "Nifty Composite Debt Index A-III"
 "Nifty Banking & PSU Debt Index A-II" "Nifty Corporate Bond Index A-II" "Nifty Money Market Index A-I"
 "Nifty 8-13 yr G-Sec Index" "Nifty All Duration G-Sec Index"
 "Nifty 50 Hybrid Composite Debt 50:50 Index" "Nifty 50 Hybrid Composite Debt 65:35 Index" "Nifty 50 Hybrid Composite Debt 15:85 Index"
 "Nifty Equity Savings Index"
 "Nifty 500 Multicap 50:25:25 Index" "Nifty Bank" "Nifty IT" "Nifty Financial Services" "Nifty India Consumption"
 "Nifty India Manufacturing" "Nifty Healthcare Index" "Nifty Energy" "Nifty 100 ESG" "Nifty Total Market"
 "Nifty 200 Quality 30" "Nifty 500 Value 50" "Nifty Private Bank" "Nifty Infrastructure"
)
for n in "${NAMES[@]}"; do
  echo "--- $n"
  echo "  price: $(probe "$PRICE" "$n")"
  echo "  tri  : $(probe "$TRI" "$n")"
done

echo; echo "== A2. Nifty 50 Arbitrage: last 6 closes from each endpoint (S9, compare with a factsheet figure) =="
for ep in "$PRICE" "$TRI"; do
  echo "$ep"
  body=$(python3 -c "import json;print(json.dumps({'cinfo': json.dumps({'name':'Nifty 50 Arbitrage','startDate':'$(date -d '-12 days' +%d-%b-%Y)','endDate':'$END','indexName':'Nifty 50 Arbitrage'}).replace('\"',\"'\")}))")
  curl -s -m 40 -A "$UA" -H 'Content-Type: application/json; charset=UTF-8' -H 'Origin: https://www.niftyindices.com' -H 'Referer: https://www.niftyindices.com/reports/historical-data' -d "$body" "$ep" | head -c 900; echo
done

echo; echo "== B. reachability (HTTP status, 25 s limit) =="
for u in \
 https://www.niftyindices.com/reports/historical-data \
 https://www.niftyindices.com/terms-of-use https://www.niftyindices.com/disclaimer \
 https://www.bseindia.com/indices/IndexArchiveData.html https://www.bseindices.com/ https://www.asiaindex.co.in/ \
 https://www.crisil.com/content/crisil/en/home/what-we-do/financial-products/indices.html https://www.crisilindices.com/ \
 https://www.ibjarates.com/ https://www.lbma.org.uk/prices-and-data/precious-metal-prices \
 https://www.rbi.org.in/scripts/ReferenceRateArchive.aspx https://www.mcxindia.com/market-data/spot-market-price ; do
  printf '%s  ' "$(curl -s -o /dev/null -m 25 -A "$UA" -L -w '%{http_code} %{size_download}B' "$u")"; echo "$u"
done
} 2>&1 | tee "$LOG"
echo "log: $LOG"
