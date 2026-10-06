"""Phase 7 gate, real statements: runs the user's own CAS files through the
same parse -> confirm -> reconcile path as test_deep.py, on a throwaway
in-memory database, and prints COUNTS ONLY. Nothing from the statement (names,
PANs, folios, fund names, amounts) is printed or logged; the copy confirm
stores goes to a temp folder deleted at the end; any error prints its type
only. So the output can be pasted into the baseline doc as is.

From backend/ (password is read from the environment, never an argument):

    PYTHONWARNINGS=ignore CAS_FILES="/path/a.pdf|/path/b.pdf" CAS_PASSWORD=... \\
    MASTER_FILE="../Docs/CAS Files/synthetic/navall_2026-10-06.txt" \\
    python -m pytest "../Docs/CAS Files/synthetic/harness/test_real_check.py" -q -s --tb=no -p no:warnings -p no:cacheprovider \\
        --rootdir "../Docs/CAS Files/synthetic/harness"

Files listed in CAS_FILES are uploaded in that order into one account, like
test_deep.py's SEQ. Different passwords: CAS_PASSWORDS="pw1|pw2" (same order). Set MFAPI_BLOCKED=1 for the outage variant.
"""
import asyncio
import os
import shutil
import tempfile
import warnings
from collections import Counter
from decimal import Decimal as D
from pathlib import Path

import pytest

from api.import_helpers import PAN_DISCLAIMER_VERSION, _authed_headers_and_member, _test_db


def _say(line: str) -> None:
    print("REALCHECK " + line)


def test_real_check(client, monkeypatch):
    from sqlalchemy.orm import sessionmaker
    import app.api.imports as imports_api
    from app.services.dashboard import snapshots
    from app.services.import_ import file_storage
    maker = sessionmaker(bind=_test_db().get_bind())
    monkeypatch.setattr(snapshots, "SessionLocal", maker)
    monkeypatch.setattr(imports_api, "SessionLocal", maker)  # background tasks: never the .env database
    # A warning (e.g. pydantic's serializer warning) can quote a field's value,
    # so none may print (re-review); the command also sets PYTHONWARNINGS.
    warnings.simplefilter("ignore")
    stored = tempfile.mkdtemp(prefix="realcheck_")
    monkeypatch.setattr(file_storage, "default_file_storage", file_storage.LocalFileStorage(stored))
    try:
        failed = _run(client)
    except Exception as exc:  # its message could carry statement text: type only
        _say(f"ERROR {type(exc).__name__}")
        failed = True
    finally:
        shutil.rmtree(stored, ignore_errors=True)
    if failed:
        pytest.fail("real check did not pass", pytrace=False)


def _run(client) -> bool:
    if os.environ.get("MASTER_FILE"):
        from app.services.analytics.scheme_master import refresh_scheme_master
        asyncio.run(refresh_scheme_master(_test_db(), Path(os.environ["MASTER_FILE"]).read_text(encoding="utf-8")))
    files = [f for f in os.environ["CAS_FILES"].split("|") if f]
    # One password for all files (CAS_PASSWORD), or one per file in the same
    # order (CAS_PASSWORDS="pw1|pw2").
    passwords = os.environ["CAS_PASSWORDS"].split("|") if os.environ.get("CAS_PASSWORDS") else [os.environ["CAS_PASSWORD"]] * len(files)
    password = passwords[0]
    # The account holder is the first statement's investor (read in memory,
    # never printed), as when a user signs up and uploads their own CAS.
    from app.services.import_.parser import parse_cas_pdf_bytes
    holder = parse_cas_pdf_bytes(Path(files[0]).read_bytes(), password).investor.name or "Account Holder"
    headers, mid = _authed_headers_and_member(client, "+919811100099", name=holder)
    failures = 0
    for n, path in enumerate(files, start=1):
        label = f"file {n}"
        password = passwords[n - 1]
        r = client.post("/imports/parse", files={"file": ("statement.pdf", Path(path).read_bytes(), "application/pdf")},
                        data={"password": password, "household_member_id": mid,
                              "pan_disclaimer_version": PAN_DISCLAIMER_VERSION}, headers=headers)
        if r.status_code == 409 and (r.json().get("detail") or {}).get("code") == "member_not_in_file":
            # A family member's own statement: "Import for these people".
            _say(f"{label}: prompt member_not_in_file -> import for these people")
            r = client.post(f"/imports/sessions/{r.json()['detail']['session_id']}/acknowledge",
                            json={"code": "member_not_in_file"}, headers=headers)
        if r.status_code != 200:
            code = (r.json().get("detail") or {}).get("code") if r.headers.get("content-type", "").startswith("application/json") else None
            _say(f"{label}: parse HTTP {r.status_code} code={code}")
            failures += 1
            continue
        p = r.json()
        ident = Counter(s["identification"] for s in p["schemes"])
        plans = Counter(s["plan_type"] for s in p["schemes"])
        held_ask = sum(1 for s in p["schemes"] if s["identification"] == "ask")
        _say(f"{label}: funds={len(p['schemes'])} identification={dict(ident)} plan={dict(plans)} "
             f"needs_review={p.get('needs_review')} ask={held_ask} people={len(p['people'])} "
             f"needs_name={sum(1 for x in p['people'] if x.get('needs_name'))} "
             f"statuses={dict(Counter(x['status'] for x in p['people']))} warnings={len(p['parse_warnings'])} "
             f"rows={p['transaction_count']}")
        confs = {}
        for s in p["schemes"]:
            if s["match_status"] != "confirmed" and s["suggested_amfi_code"]:
                confs.setdefault(s.get("person_key"), []).append({"temp_id": s["temp_id"], "amfi_code": s["suggested_amfi_code"]})
        if p["people"]:
            people = []
            for x in p["people"]:
                e = {"person_key": x["person_key"], "scheme_confirmations": confs.get(x["person_key"], [])}
                if x.get("needs_name"):
                    e["name"] = "Typed Name"
                people.append(e)
            body = {"session_id": p["session_id"], "people": people}
        else:
            body = {"session_id": p["session_id"], "household_member_id": mid, "scheme_confirmations": confs.get(None, [])}
        c = client.post("/imports/confirm", json=body, headers=headers)
        if c.status_code != 200:
            detail = c.json().get("detail") if c.headers.get("content-type", "").startswith("application/json") else None
            code = detail.get("code") if isinstance(detail, dict) else "override_required" if "override" in str(detail) else None
            _say(f"{label}: confirm HTTP {c.status_code} code={code}")
            if c.status_code != 409 or code != "already_imported":
                failures += 1
            continue
        j = c.json()
        _say(f"{label}: confirm added={j['added']} skipped={j['skipped']} warnings={len(j.get('warnings') or [])}")

    db = _test_db()
    from app.services.import_.reconciliation import reconcile_members
    members = client.get("/household-members", headers=headers).json()
    rows = reconcile_members(db, [__import__("uuid").UUID(m["id"]) for m in members])
    status = Counter(r.status for r in rows)
    differs = any(abs(D(r.diff_units)) > D("0.001") for r in rows if r.diff_units is not None)
    _say(f"reconciliation: {dict(status)} any_unit_difference={differs}")
    for m in members:
        snaps = client.get(f"/household-members/{m['id']}/snapshots", headers=headers).json()
        months = [x["snapshot_month"] for x in snaps]
        partial = sum(1 for x in snaps if x.get("is_partial"))
        gaps = 0
        for a, b in zip(months, months[1:]):
            ya, ma = int(a[:4]), int(a[5:7])
            yb, mb = int(b[:4]), int(b[5:7])
            gaps += (yb * 12 + mb) - (ya * 12 + ma) - 1
        _say(f"member {members.index(m) + 1}: history months={len(months)} partial={partial} gaps={gaps}")
    if any(s != "match" for s in status) or failures:
        failures += 1
    _say("RESULT " + ("PASS" if not failures else "NOT PASS"))
    return bool(failures)
