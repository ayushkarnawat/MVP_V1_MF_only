"""Click-time gate (D6) for the History month-detail: imports a synthetic 46-fund
household and times get_month_detail per member and get_aggregate_month_detail.
SQLite temp DB -- PostgreSQL timing may differ.

From backend/:
    MASTER_FILE="../Docs/CAS Files/synthetic/navall_2026-10-06.txt" UX_SEQ=big_family_ayush_anand_7yr.pdf \
      UX_OUT=/tmp/md_timing.json .venv_wsl/bin/python -m pytest \
      "../Docs/CAS Files/synthetic/harness/test_month_detail_timing.py" -q -s -p no:cacheprovider \
      --rootdir "../Docs/CAS Files/synthetic/harness"
"""
import asyncio
import json
import os
import sys
import uuid
from pathlib import Path

os.environ.setdefault("SEQ", "_unused_for_timing_harness_.pdf")
os.environ.setdefault("OUT", "/tmp/_unused_test_deep_import_sentinel.json")
sys.path.insert(0, str(Path(__file__).resolve().parent))
from test_deep import upload  # noqa: E402
from api.import_helpers import _authed_headers_and_member, _test_db  # noqa: E402

BACKEND = Path(__file__).resolve().parents[4] / "backend"
sys.path.insert(0, str(BACKEND))
from scripts.measure_month_detail import WriteAttempted, forbid_writes, time_scope  # noqa: E402

SEQ = os.environ.get("UX_SEQ", "big_family_ayush_anand_7yr.pdf").split(",")
OUT = os.environ.get("UX_OUT", "/tmp/month_detail_timing.json")
LIMIT_MS = 1000.0
INVESTOR_BY_SEQ = {"big_family_ayush_anand_7yr.pdf": "AYUSH KARNAWAT"}


def test_month_detail_timing(client, monkeypatch):
    from sqlalchemy.orm import sessionmaker
    from app.services.dashboard import snapshots
    with _test_db() as db:
        monkeypatch.setattr(snapshots, "SessionLocal", sessionmaker(bind=db.get_bind()))
        import app.api.imports as imports_api
        monkeypatch.setattr(imports_api, "SessionLocal", sessionmaker(bind=db.get_bind()))
    assert os.environ.get("MASTER_FILE"), "MASTER_FILE must point at a saved AMFI NAVAll feed"
    from app.services.analytics.scheme_master import refresh_scheme_master
    asyncio.run(refresh_scheme_master(_test_db(), Path(os.environ["MASTER_FILE"]).read_text(encoding="utf-8")))

    headers, mid = _authed_headers_and_member(client, "+919811122288", name=INVESTOR_BY_SEQ.get(SEQ[-1], "AYUSH KARNAWAT"))
    log = []
    for fn in SEQ:
        upload(client, headers, mid, fn, log, [])
    members = client.get("/household-members", headers=headers).json()
    assert members, f"no members after upload: {log}"

    # Populate the snapshot cache the way the History page does (this is a write, and is
    # NOT timed); the timed calls below then run under a no-write guard.
    for m in members:
        r = client.get(f"/household-members/{m['id']}/snapshots", headers=headers)
        assert r.status_code == 200, r.text[:300]

    from app.models.user import User
    db = _test_db()
    user_id = db.query(User).first().id
    results = {}
    scopes = [(m["name"], [uuid.UUID(m["id"])], False) for m in members]
    scopes.append(("AGGREGATE", [uuid.UUID(m["id"]) for m in members], True))
    for label, ids, agg in scopes:
        guarded = forbid_writes(db)
        try:
            results[label] = time_scope(db, ids, user_id=user_id, aggregate=agg)
            results[label]["rebuilds_snapshots_each_call"] = False
        except WriteAttempted as e:
            # get_snapshots rewrites the cache on every call while any month is
            # is_partial (a fund with no NAV data), so the click-time cost INCLUDES a
            # full rebuild + commit. Measure that honestly, on this temp DB only.
            db.rollback()
            from app.models.snapshot import PortfolioSnapshot
            rows = db.query(PortfolioSnapshot).filter(PortfolioSnapshot.household_member_id.in_(ids)).all()
            print(f"  [{label}] guard tripped: {sum(r.is_partial for r in rows)} partial of {len(rows)} snapshot rows "
                  f"-> re-timing with writes allowed", flush=True)
            guarded()
            guarded = None
            results[label] = time_scope(db, ids, user_id=user_id, aggregate=agg)
            results[label]["rebuilds_snapshots_each_call"] = True
        except Exception as e:  # report, don't hide
            results[label] = {"error": f"{type(e).__name__}: {e}"}
        finally:
            if guarded:
                guarded()
    print("\nSQLite temp DB; PostgreSQL timing may differ.", flush=True)
    print(f"Imported: {SEQ}; members={len(members)}", flush=True)
    for label, r in results.items():
        if "error" in r:
            print(f"  {label}: ERROR {r['error']}", flush=True)
            continue
        print(f"  {label}: months={r['months_available']} funds={r['funds']} cold_first={r['cold_ms']:.0f} ms "
              f"rebuilds_each_call={r['rebuilds_snapshots_each_call']} median={r['median_ms']:.0f} ms worst={r['worst_ms']:.0f} ms "
              f"-> {'PASS' if r['median_ms'] < LIMIT_MS else 'FAIL'} (limit {LIMIT_MS:.0f} ms)", flush=True)
        print("     per-call ms: " + ", ".join(f"{t:.0f}" for _, t in r["timings"]), flush=True)
    Path(OUT).write_text(json.dumps(results, indent=1, default=str), encoding="utf-8")
    errors = {k: v["error"] for k, v in results.items() if "error" in v}
    assert not errors, errors
    slow = {k: round(v["median_ms"]) for k, v in results.items() if v["median_ms"] >= LIMIT_MS}
    assert not slow, f"median over {LIMIT_MS:.0f} ms: {slow}"
