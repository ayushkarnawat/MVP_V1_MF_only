"""Read-only: for every automatic fund house, list the newest factsheet links its page offers,
with the (year, month) found in each link. No download, no database, no writes.

Answers: has the house already published its October file? If the newest listed link is
September, the house has not (as of the run). If an October link is listed but the job took
September, the October file failed the job's check: that is our problem and is flagged.

Run (mounted into the backend container):
  sudo docker compose run --rm -T -v /home/deploy/step0:/s0:ro backend python /s0/check_publication.py
"""
import asyncio, sys, csv, io
sys.path.insert(0, "/app")
import httpx
from app.services.analytics import amfi_factsheet_client as c
from app.services.analytics.fund_manager_resolvers import AMC_RESOLVERS, ResolverKind

WANT = (2026, 10)


async def candidates_for(client, entry, directory):
    if entry.kind is ResolverKind.JSON_API:
        found = await c._json_api_candidates(client, entry)
        pats = entry.documents or (None,)
        groups = [[u for u in found if (p is None or c.re.search(p, u, c.re.I))] for p in pats]
    else:
        landing = entry.landing_url or directory.get(entry.directory_name or "")
        if not landing:
            return [], "no_landing_url"
        pats = entry.documents or (entry.link_pattern,)
        groups = [await c._static_link_candidates(client, landing, p) for p in pats]
    flat = [u for g in groups for u in g]
    return flat, "ok"


async def main():
    directory = await c._fetch_amfi_directory()
    out = csv.writer(sys.stdout)
    out.writerow(["amc", "status", "n_links", "newest_year_month", "october_listed", "top3_links"])
    async with httpx.AsyncClient(timeout=c._HTTP_TIMEOUT, headers=c._HEADERS, follow_redirects=True) as client:
        for name, entry in AMC_RESOLVERS.items():
            if entry.kind is ResolverKind.MANUAL or entry.layout is None:
                continue
            try:
                links, status = await candidates_for(client, entry, directory)
            except Exception as exc:  # one house failing never stops the rest
                out.writerow([name, f"error:{type(exc).__name__}", 0, "", "", str(exc)[:120]])
                continue
            dated = sorted(((c._link_date(u), u) for u in links), key=lambda t: t[0], reverse=True)
            newest = dated[0][0] if dated else (0, 0)
            octo = any(d == WANT for d, _ in dated)
            top = " | ".join(f"{d[0]}-{d[1]:02d} {u}" for d, u in dated[:3])
            out.writerow([name, status, len(links), f"{newest[0]}-{newest[1]:02d}", "YES" if octo else "no", top])


asyncio.run(main())
