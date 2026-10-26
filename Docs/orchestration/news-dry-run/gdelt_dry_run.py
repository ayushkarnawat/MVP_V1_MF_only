"""NB1 T1: read-only GDELT reachability, time and memory check. Standard library only; writes nothing to disk.

Downloads the 15-minute GKG files for the last HOURS hours (newest file at least 1 hour old), reads each one in a
streaming way from memory, and prints per-file seconds, bytes and rows, the peak memory of this process, and a
GO / NO-GO line. Usage: python3 gdelt_dry_run.py [hours]   (default 6)
"""
import io
import resource
import sys
import time
import urllib.error
import urllib.request
import zipfile
from datetime import datetime, timedelta, timezone

BASE = "http://data.gdeltproject.org/gdeltv2/"
HOURS = int(sys.argv[1]) if len(sys.argv) > 1 else 6
SITES = (
    "moneycontrol.com", "livemint.com", "economictimes.indiatimes.com", "business-standard.com",
    "thehindubusinessline.com", "financialexpress.com", "ndtvprofit.com", "cnbctv18.com", "indianexpress.com",
    "thehindu.com", "hindustantimes.com", "timesofindia.indiatimes.com",
)


def fetch(url, tries=3):
    last = None
    for attempt in range(tries):
        try:
            with urllib.request.urlopen(url, timeout=60) as response:
                return response.read()
        except urllib.error.HTTPError as error:
            if error.code == 404:
                return None
            last = error
        except Exception as error:  # network trouble: retry
            last = error
        time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"{url}: {last}")


def main():
    started = time.time()
    print("python", sys.version.split()[0], "| hours", HOURS)
    last = fetch(BASE + "lastupdate.txt")
    print("lastupdate.txt reachable:", last.decode().splitlines()[-1][:120] if last else "NO")
    newest = datetime.now(timezone.utc) - timedelta(hours=1)
    newest = newest.replace(minute=newest.minute - newest.minute % 15, second=0, microsecond=0)
    totals = {"files": 0, "missing": 0, "bytes": 0, "rows": 0, "sites": 0, "english": 0, "titles": 0, "secs": 0.0}
    for step in range(HOURS * 4):
        stamp = (newest - timedelta(minutes=15 * step)).strftime("%Y%m%d%H%M%S")
        begun = time.time()
        raw = fetch(f"{BASE}{stamp}.gkg.csv.zip")
        if raw is None:
            totals["missing"] += 1
            print(stamp, "missing (404)")
            continue
        rows = sites = english = titles = 0
        with zipfile.ZipFile(io.BytesIO(raw)) as archive:
            with archive.open(archive.namelist()[0]) as handle:
                for line in io.TextIOWrapper(handle, encoding="utf-8", errors="replace", newline=""):
                    cols = line.rstrip("\n").split("\t")
                    rows += 1
                    if len(cols) < 27:
                        continue
                    domain = cols[3].lower()
                    sites += any(domain == site or domain.endswith("." + site) for site in SITES)
                    english += cols[25].strip() == ""
                    titles += "<PAGE_TITLE>" in cols[26]
        seconds = time.time() - begun
        totals["files"] += 1
        totals["bytes"] += len(raw)
        totals["rows"] += rows
        totals["sites"] += sites
        totals["english"] += english
        totals["titles"] += titles
        totals["secs"] += seconds
        print(f"{stamp} {len(raw) / 1e6:5.1f} MB zip, {rows:6d} rows, {sites:4d} allow-listed, {seconds:5.1f} s")
    peak_mb = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024
    print("-" * 60)
    print(f"files ok {totals['files']}, missing {totals['missing']}, zip {totals['bytes'] / 1e6:.1f} MB, "
          f"rows {totals['rows']}, allow-listed {totals['sites']}, English {totals['english']}, with title {totals['titles']}")
    print(f"download+parse {totals['secs']:.0f} s, wall {time.time() - started:.0f} s, peak memory {peak_mb:.0f} MB")
    ok = totals["files"] >= HOURS * 4 * 0.75
    print("GO" if ok else "NO-GO", "(reachable:", ok, ")")


main()
