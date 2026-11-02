# NSE Integrated Filing probe (T2.12 Step B source check, run 2 Nov 2026 from the VM). Read-only, standard library only.
# Usage (copy probe_nse_xbrl.py and this file into /tmp/o3 on an Indian-IP machine): python3 probe_nse_integrated_filing.py TCS HDFCBANK
# List: GET /api/integrated-filing-results?index=equities&symbol=<SYM>&type=Integrated%20Filing-%20Financials after a handshake GET of /companies-listing/corporate-integrated-filing.
# Row fields: qe_Date (quarter end), consolidated, audited, xbrl (bare XML URL on nsearchives), ixbrl, pdf_attach. Balance-sheet facts appear in the March and September filings.
# Bounded probe 2: do the newest half-year/annual Integrated Filing XBRL files carry equity, reserves and shares? Read-only.
import json, re, sys, urllib.parse
sys.path.insert(0, "/tmp/o3")
import probe_nse_xbrl as p
BASE = p.BASE
p.PAGE = BASE + "/companies-listing/corporate-integrated-filing"
net = p.Network()
net.get(p.PAGE, "handshake")
KEEP = re.compile(r"Equity|Reserve|PaidUp|NumberOf|FaceValue|Shares|Capital", re.I)
for symbol in sys.argv[1:]:
    url = BASE + "/api/integrated-filing-results?" + urllib.parse.urlencode({"index": "equities", "symbol": symbol, "type": "Integrated Filing- Financials"})
    st, body = net.get(url, "list")
    rows = p.records(json.loads(body.decode("utf-8-sig")))
    print(json.dumps({"symbol": symbol, "rows": len(rows), "table": [(r.get("qe_Date"), r.get("consolidated"), r.get("audited"), r.get("type_Sub"), "xbrl" if r.get("xbrl") else "-") for r in rows[:10]]}))
    cand = [r for r in rows if r.get("xbrl") and str(r.get("qe_Date", "")).upper()[3:6] in ("MAR", "SEP")]
    cand.sort(key=lambda r: (r.get("consolidated") == "Consolidated", p.parse_date(r.get("qe_Date")) or p.parse_date("01-01-2000")), reverse=True)
    cand.sort(key=lambda r: p.parse_date(r.get("qe_Date")) or p.parse_date("01-01-2000"), reverse=True)
    if not cand:
        print(json.dumps({"symbol": symbol, "no_half_year_row_with_xbrl": True})); continue
    r = next((x for x in cand if x.get("consolidated") == "Consolidated"), cand[0])
    print(json.dumps({"chosen": [r.get("qe_Date"), r.get("consolidated"), r.get("audited")]}))
    st, xml = net.get(r["xbrl"], "attachment")
    if not xml.lstrip().startswith(b"<"):
        print(json.dumps({"not_xml": True, "bytes": len(xml)})); continue
    out = []
    orig = p.emit
    p.emit = lambda kind, **v: out.append(v) if kind == "fact" else None
    try:
        p.inspect_xml("f.xml", xml)
    finally:
        p.emit = orig
    seen = set(); shown = 0
    print(json.dumps({"attachment_status": st, "bytes": len(xml), "equity_like_facts_total": len(out)}))
    for v in out:
        t = v["tag"].split(":")[-1]
        if not KEEP.search(t): continue
        key = (t, v["value"], str(v["context"])[:60])
        if key in seen: continue
        seen.add(key); shown += 1
        if shown > 26: break
        print(json.dumps({"tag": t, "value": v["value"][:24], "scale": v["scale"], "unit": v["unit_ref"], "context": str(v["context"])[:90]}))
