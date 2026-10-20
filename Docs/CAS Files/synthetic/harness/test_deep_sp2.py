"""Sub-project 2 (look-through) value checks, end to end:

1. Seeds real look-through reference data by running the ACTUAL production job
   scripts live (real network -- AMC sites, AMFI, NSE, Yahoo) against the
   harness's own isolated test DB: refresh_market_cap_half_yearly,
   refresh_portfolio_disclosures_daily, refresh_stock_fundamentals_daily.
   This is the same mechanism the staging deploy guide's Step 12 uses, just
   aimed at a throwaway DB instead of staging's real one.
2. Imports a real-life synthetic household (default: big_family_ayush_anand_7yr.pdf,
   46 holdings across many real AMCs -- the widest real-fixture coverage).
3. Recomputes analytics and fetches /analytics/combined.
4. Rebuilds truth independently from the DB (sp2_checks.lookthrough_truth) and
   checks all 5 new sections plus the cross-section invariants.
5. Best-effort: times a PDF export of the same household (skipped, not failed,
   if no frontend dev server is reachable -- see test_pdf_export_integration.py
   for the same skip pattern).

Expect 20-90 minutes for the first run (live disclosure + stock-fundamentals
jobs); a re-run against a fresh DB pays the same cost again, since nothing is
cached between harness runs.

Run from backend/, with a saved AMFI NAVAll feed:
    MASTER_FILE=<path to navall file> SP2_SEQ=big_family_ayush_anand_7yr.pdf \
      SP2_OUT=/tmp/sp2_deep_out.json \
      python -m pytest "<path>/harness/test_deep_sp2.py" -q -s \
      --rootdir "<path>/harness"
"""
import asyncio
import importlib.util
import json
import os
import sys
import time
from pathlib import Path

# test_deep.py's own module-level code requires SEQ/OUT env vars to exist at
# import time (it is itself a pytest file, so importing it runs that code) --
# this file uses its own SP2_SEQ/SP2_OUT names instead, so give test_deep a
# harmless placeholder rather than colliding with or depending on this file's
# own env vars.
os.environ.setdefault("SEQ", "_unused_for_sp2_harness_.pdf")
os.environ.setdefault("OUT", "/tmp/_unused_test_deep_import_sentinel.json")

sys.path.insert(0, str(Path(__file__).resolve().parent))
from test_deep import upload  # noqa: E402  reuse the exact confirm-flow the app's own UI uses
from sp2_checks import (  # noqa: E402
    a02_checks, a06_checks, a10_checks, a13_checks, a15_checks,
    common_invariants_checks, lookthrough_truth,
)

from api.import_helpers import _authed_headers_and_member, PAN_DISCLAIMER_VERSION, _test_db  # noqa: E402

_HERE = Path(__file__).resolve().parent.parent  # .../Docs/CAS Files/synthetic
REPO_ROOT = _HERE.parents[2]
JOBS_DIR = REPO_ROOT / "backend" / "scripts" / "jobs"

SEQ = os.environ.get("SP2_SEQ", "big_family_ayush_anand_7yr.pdf").split(",")
OUT = os.environ.get("SP2_OUT", "/tmp/sp2_deep_out.json")
# truth.json's investor field for the chosen persona, needed so the upload's
# self-attribution matches the CAS owner (same requirement as test_deep.py).
_INVESTOR_BY_SEQ = {"big_family_ayush_anand_7yr.pdf": "AYUSH KARNAWAT"}


def _load_job(name):
    path = JOBS_DIR / f"{name}.py"
    assert path.is_file(), f"job entrypoint missing: {path}"
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_deep_sp2(client, monkeypatch):
    from sqlalchemy.orm import sessionmaker
    from app.services.dashboard import snapshots
    with _test_db() as db:
        monkeypatch.setattr(snapshots, "SessionLocal", sessionmaker(bind=db.get_bind()))
        import app.api.imports as imports_api
        monkeypatch.setattr(imports_api, "SessionLocal", sessionmaker(bind=db.get_bind()))

    assert os.environ.get("MASTER_FILE"), "MASTER_FILE must point at a saved AMFI NAVAll feed"
    from app.services.analytics.scheme_master import refresh_scheme_master
    master_text = Path(os.environ["MASTER_FILE"]).read_text(encoding="utf-8")
    asyncio.run(refresh_scheme_master(_test_db(), master_text))

    db = _test_db()
    out = {"seq": SEQ, "job_seconds": {}}

    # --- Step 1: seed real look-through reference data via the real jobs ---
    print("Seeding market cap (fast)...", flush=True)
    t0 = time.time()
    market_cap_job = _load_job("refresh_market_cap_half_yearly")
    mc_rc = asyncio.run(market_cap_job.main_async(db))
    db.commit()
    out["job_seconds"]["market_cap"] = round(time.time() - t0, 1)
    out["market_cap_job_rc"] = mc_rc

    print("Seeding portfolio disclosures (live network, ~20-60 min)...", flush=True)
    t0 = time.time()
    disclosures_job = _load_job("refresh_portfolio_disclosures_daily")
    asyncio.run(disclosures_job.main_async(db))
    db.commit()
    out["job_seconds"]["portfolio_disclosures"] = round(time.time() - t0, 1)

    print("Seeding stock fundamentals (live network, ~15-40 min)...", flush=True)
    t0 = time.time()
    stock_job = _load_job("refresh_stock_fundamentals_daily")
    sf_rc = asyncio.run(stock_job.main_async(db))
    db.commit()
    out["job_seconds"]["stock_fundamentals"] = round(time.time() - t0, 1)
    out["stock_fundamentals_job_rc"] = sf_rc

    from app.models.enums import DisclosureBatchStatus
    from app.models.reference import DisclosureBatch, MarketCapClassification, SchemeHolding, StockMaster
    out["seed_counts"] = {
        "disclosure_batches_written": db.query(DisclosureBatch).filter_by(status=DisclosureBatchStatus.WRITTEN).count(),
        "scheme_holdings": db.query(SchemeHolding).count(),
        "market_cap_rows": db.query(MarketCapClassification).count(),
        "stock_master_rows": db.query(StockMaster).count(),
    }
    print("Seed counts:", out["seed_counts"], flush=True)

    # --- Step 2: import the household ---
    investor = _INVESTOR_BY_SEQ.get(SEQ[-1], "AYUSH KARNAWAT")
    headers, mid = _authed_headers_and_member(client, "+919822233399", name=investor)
    log = []
    for fn in SEQ:
        upload(client, headers, mid, fn, log, [])
    out["upload_log"] = log
    members = client.get("/household-members", headers=headers).json()
    out["members"] = [(m["name"], m["id"]) for m in members]
    assert members, "no household members after upload"

    per_member = {}
    for m in members:
        h = client.get(f"/household-members/{m['id']}/holdings", headers=headers).json()
        per_member[m["name"]] = {"holdings": h}

    # --- Step 3: recompute analytics (NAV must be fresh first, same as test_deep.py) ---
    nav_job = _load_job("refresh_nav_daily")
    asyncio.run(nav_job.main_async(db))

    from app.services.analytics.recompute import recompute_household_analytics
    from app.models.user import User
    user = db.query(User).first()
    t0 = time.time()
    asyncio.run(recompute_household_analytics(db, user.id))
    out["analytics_seconds"] = round(time.time() - t0, 1)

    a = client.get("/analytics/combined", headers=headers)
    out["analytics_status"] = a.status_code
    assert a.status_code == 200, a.text[:2000]
    body = a.json()
    out["sections_present"] = sorted(body.get("sections") or {})

    # --- Step 4: truth + checks ---
    truth = lookthrough_truth(db, per_member)
    out["truth_summary"] = {
        "total": str(truth["total"]), "covered": str(truth["covered"]),
        "schemes_held": len(truth["values"]), "schemes_selected": len(truth["selected"]),
        "excluded_value": str(truth["excluded_value"]), "non_equity_value": str(truth["non_equity_value"]),
        "equity_rows": sum(1 for v in truth["rows"].values() if v["asset_type"] in truth["equity_types"]),
    }
    print("Truth summary:", out["truth_summary"], flush=True)

    out["invariants"] = common_invariants_checks(body)
    out["a06_stock_holdings"] = a06_checks(body, truth)
    out["a02_cap_allocation"] = a02_checks(db, body, truth)
    out["a13_asset_allocation"] = a13_checks(db, body, truth)
    out["a10_overlap"] = a10_checks(body, truth)
    out["a15_valuation"] = a15_checks(db, body, truth)

    # --- Step 5 (best-effort, non-blocking): PDF export print-time check ---
    out["pdf_export"] = _try_pdf_export(client, headers, mid, body)

    Path(OUT).write_text(json.dumps(out, indent=1, default=str), encoding="utf-8", newline="\n")
    print(f"Full output written to {OUT}", flush=True)

    checks = {
        "invariants": out["invariants"], "a06_stock_holdings": out["a06_stock_holdings"],
        "a02_cap_allocation": out["a02_cap_allocation"], "a13_asset_allocation": out["a13_asset_allocation"],
        "a10_overlap": out["a10_overlap"], "a15_valuation": out["a15_valuation"],
    }
    failures = {name: r["mismatches"] for name, r in checks.items() if r.get("mismatches")}
    assert not failures, json.dumps(failures, indent=1, default=str)


def _try_pdf_export(client, headers, mid, analytics_body):
    """Best-effort PDF-export timing: skipped (not failed) if the frontend dev
    server isn't reachable, matching test_pdf_export_integration.py's own
    frontend_reachable skip pattern -- this is a bonus measurement, not a
    correctness check (the 5 new sections' correctness is already covered
    above via the API body)."""
    try:
        import httpx as _httpx
        from app.config import settings
        _httpx.get(settings.frontend_base_url, timeout=1.0)
    except Exception as e:
        return {"skipped": True, "reason": f"frontend not reachable: {e}"}

    try:
        from app.services.analytics.pdf_export import render_analytics_pdf, start_browser, stop_browser, store_export_payload
    except Exception as e:
        return {"skipped": True, "reason": f"pdf_export module unavailable: {e}"}

    sections = analytics_body.get("sections") or {}
    payload = {"scope": "aggregate", "scopeName": "Test Household"}
    for name, section in sections.items():
        payload[name] = (section.get("payload") or {}).get(name)

    async def run():
        await start_browser()
        try:
            token = store_export_payload(payload)
            t0 = time.time()
            pdf_bytes = await render_analytics_pdf(token)
            return round(time.time() - t0, 1), pdf_bytes
        finally:
            await stop_browser()

    try:
        seconds, pdf_bytes = asyncio.run(run())
    except Exception as e:
        return {"skipped": False, "failed": True, "reason": str(e)[:500]}
    return {
        "skipped": False, "seconds": seconds, "pdf_bytes": len(pdf_bytes),
        "looks_like_pdf": pdf_bytes.startswith(b"%PDF"),
    }
