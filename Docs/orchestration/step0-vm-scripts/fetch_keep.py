"""Run the real monthly factsheet fetch for the ~40 automatic fund houses AND keep every PDF it downloads.

The stock job (scripts/jobs/refresh_fund_managers_monthly.py) keeps nothing: PDFs live in memory only.
This wrapper replaces the download function with one that saves each PDF, then runs the same
refresh_fund_managers(db). It therefore ALSO writes scheme_fund_managers for the current month,
exactly like the cron job (an upsert, safe to repeat).

Run inside the backend container, with an output folder mounted at /out:
  sudo docker compose run --rm -T -v /home/deploy/step0/factsheets/auto:/out backend python - < fetch_keep.py

Writes /out/<fund_house>__<sha8>.pdf and /out/manifest.csv (fund house, url, bytes, sha, file, utc).
"""
import asyncio, csv, datetime, hashlib, logging, os, re

import app.services.analytics.amfi_factsheet_client as c
from app.db.session import SessionLocal

logging.basicConfig(level=logging.INFO)  # show the job's own log lines (alerts, unmatched pages)
OUT = os.environ.get("FS_OUT", "/out")
os.makedirs(OUT, exist_ok=True)
current = {"amc": "unknown"}
manifest = open(os.path.join(OUT, "manifest.csv"), "a", newline="", encoding="utf-8")
writer = csv.writer(manifest)
orig_download, orig_resolve = c._download_pdf, c._resolve_and_read


async def download(client, url):
    data = await orig_download(client, url)
    if data:
        sha = hashlib.sha256(data).hexdigest()[:8]
        name = re.sub(r"[^A-Za-z0-9]+", "_", current["amc"])[:40] + "__" + sha + ".pdf"
        with open(os.path.join(OUT, name), "wb") as fh:
            fh.write(data)
        writer.writerow([current["amc"], url, len(data), sha, name, datetime.datetime.utcnow().isoformat()])
        manifest.flush()
    return data


async def resolve(client, entry, *args, **kwargs):
    current["amc"] = entry.directory_name or "unknown"
    return await orig_resolve(client, entry, *args, **kwargs)


c._download_pdf = download          # module-level lookups, so the patch is picked up
c._resolve_and_read = resolve


async def main():
    with SessionLocal() as db:
        print(await c.refresh_fund_managers(db))


asyncio.run(main())
