"""Read-only source reachability probe (Sub-project 2, Task 0). GETs only; writes nothing.
Prints one line per source:  VERDICT | status | content-type | bytes | first-bytes | tag | url"""
import json, sys, datetime, concurrent.futures as cf
import httpx
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"}
URLS = json.loads(open(sys.argv[1]).read()) if len(sys.argv) > 1 else json.loads(__import__("os").environ["URLS_JSON"])
def d(n):
    t = datetime.date.today() - datetime.timedelta(days=n)
    return t.strftime("%d%m%y"), t.strftime("%d%m%Y")
def verdict(code, ctype, head, tag):
    if code >= 400: return "BLOCKED" if code in (401, 403, 429, 451) else f"HTTP{code}"
    if head[:4] in (b"PK\x03\x04", b"%PDF") or head[:4] == b"\xd0\xcf\x11\xe0": return "OK-FILE"
    if "html" in (ctype or "").lower() and tag not in ("a04-factsheet", "sp2-registry", "screener"): return "SOFT-404?"
    return "OK"
def probe(item):
    url, tag = item
    cands = [url]
    if "{D6}" in url:
        cands = [url.replace("{D6}", d(n)[0]) for n in (1, 2, 3, 4)]
    if "{D8}" in url:
        cands = [url.replace("{D8}", d(n)[1]) for n in (1, 2, 3, 4)]
    last = None
    for c in cands:
        try:
            with httpx.Client(headers=UA, timeout=25, follow_redirects=True) as cl:
                r = cl.get(c)
            head = r.content[:8]
            last = (verdict(r.status_code, r.headers.get("content-type", ""), head, tag), r.status_code,
                    r.headers.get("content-type", "")[:40], len(r.content), head.hex(), tag, c)
            if last[0] in ("OK", "OK-FILE"): break
        except Exception as e:
            last = ("ERROR", 0, type(e).__name__, 0, "", tag, c)
    return last
def yahoo():
    try:
        with httpx.Client(headers=UA, timeout=25, follow_redirects=True) as cl:
            cl.get("https://fc.yahoo.com/")
            crumb = cl.get("https://query1.finance.yahoo.com/v1/test/getcrumb").text
            r = cl.get("https://query1.finance.yahoo.com/v10/finance/quoteSummary/RELIANCE.NS",
                       params={"modules": "defaultKeyStatistics", "crumb": crumb})
            ok = r.status_code == 200 and "priceToBook" in r.text
            return ("OK" if ok else f"HTTP{r.status_code}", r.status_code, "yahoo-crumb+quoteSummary", len(r.content), "", "yahoo", "quoteSummary RELIANCE.NS")
    except Exception as e:
        return ("ERROR", 0, type(e).__name__, 0, "", "yahoo", "quoteSummary RELIANCE.NS")
if __name__ == "__main__":
    with cf.ThreadPoolExecutor(8) as ex:
        rows = list(ex.map(probe, URLS.items()))
    rows.append(yahoo())
    for r in sorted(rows, key=lambda x: (x[0], x[5])):
        print(" | ".join(str(x) for x in r), flush=True)
    bad = [r for r in rows if r[0] not in ("OK", "OK-FILE")]
    print(f"SUMMARY total={len(rows)} ok={len(rows)-len(bad)} not_ok={len(bad)}", flush=True)
