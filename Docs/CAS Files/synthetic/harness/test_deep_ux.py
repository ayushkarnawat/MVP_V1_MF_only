"""UX-fixes value checks (Investment & Withdrawal): imports a synthetic household
and runs ux_checks.run_all per member and for the family aggregate.

From backend/:
    MASTER_FILE=../Docs/CAS\ Files/synthetic/navall_2026-10-06.txt UX_SEQ=r2_couple_rohan_priya_10yr.pdf \
      UX_OUT=/tmp/ux_out.json python -m pytest "../Docs/CAS Files/synthetic/harness/test_deep_ux.py" -q -s \
      --rootdir "../Docs/CAS Files/synthetic/harness"
"""
import asyncio
import json
import os
import sys
from pathlib import Path

# test_deep.py needs SEQ/OUT at import time (see test_deep_sp2.py).
os.environ.setdefault("SEQ", "_unused_for_ux_harness_.pdf")
os.environ.setdefault("OUT", "/tmp/_unused_test_deep_import_sentinel.json")
sys.path.insert(0, str(Path(__file__).resolve().parent))
from test_deep import upload, TRUTH  # noqa: E402
import ux_checks  # noqa: E402
from api.import_helpers import _authed_headers_and_member, _test_db  # noqa: E402

SEQ = os.environ.get("UX_SEQ", "r2_couple_rohan_priya_10yr.pdf").split(",")
OUT = os.environ.get("UX_OUT", "/tmp/ux_deep_out.json")


def test_deep_ux(client, monkeypatch):
    import uuid
    from sqlalchemy.orm import sessionmaker
    from app.services.dashboard import snapshots
    with _test_db() as db:
        monkeypatch.setattr(snapshots, "SessionLocal", sessionmaker(bind=db.get_bind()))
        import app.api.imports as imports_api
        monkeypatch.setattr(imports_api, "SessionLocal", sessionmaker(bind=db.get_bind()))
    assert os.environ.get("MASTER_FILE"), "MASTER_FILE must point at a saved AMFI NAVAll feed"
    from app.services.analytics.scheme_master import refresh_scheme_master
    asyncio.run(refresh_scheme_master(_test_db(), Path(os.environ["MASTER_FILE"]).read_text(encoding="utf-8")))

    db = _test_db()
    headers, mid = _authed_headers_and_member(client, "+919811122277", name=TRUTH[SEQ[-1]]["investor"])
    log = []
    for fn in SEQ:
        upload(client, headers, mid, fn, log, [])
    members = client.get("/household-members", headers=headers).json()
    assert members, f"no members after upload: {log}"

    from app.services.analytics.recompute import recompute_household_analytics
    from app.models.user import User
    asyncio.run(recompute_household_analytics(db, db.query(User).first().id))

    scopes = {}
    for scope, label, ids in [("combined", "family", [uuid.UUID(m["id"]) for m in members])] + \
            [(m["id"], m["name"], [uuid.UUID(m["id"])]) for m in members]:
        r = client.get(f"/analytics/{scope}", headers=headers)
        assert r.status_code == 200, r.text[:500]
        sec = (r.json().get("sections") or {}).get("investment_withdrawal") or {}
        pl = sec.get("payload") or {}
        # combined wraps the result as {members, data}; a member scope stores the bare result
        d = pl.get("data") if "data" in pl else (pl if "total_invested" in pl else None)
        assert d, f"{label}: investment_withdrawal section missing/failed: {sec.get('failed_at')}"
        scopes[label] = (ids, d)

    res = ux_checks.run_all(db, scopes, march_2023=any(fn.startswith("r2_") for fn in SEQ))
    total = sum(g["checked"] for g in res.values())
    bad = {k: g["mismatches"] for k, g in res.items() if g["mismatches"]}
    print(f"UX checks run={total} failed={sum(len(v) for v in bad.values())} scopes={list(scopes)}", flush=True)
    for k, g in res.items():
        print(f"  {k}: checked={g['checked']} mismatches={len(g['mismatches'])}", flush=True)
    Path(OUT).write_text(json.dumps({"seq": SEQ, "upload_log": log, "results": res}, indent=1, default=str), encoding="utf-8")
    assert not bad, json.dumps(bad, indent=1, default=str)
