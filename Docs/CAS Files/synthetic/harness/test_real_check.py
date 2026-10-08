"""Phase 7 gate, real statements: runs the user's own CAS files through the
same parse -> confirm -> reconcile path as test_deep.py, on a throwaway
in-memory database, and prints counts and aggregate cost differences only.
Names, PANs, folios and fund names are never printed or logged; the copy confirm
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
        # Answer "Is this the person you already have?" with Yes, as a user
        # would for the same person (a PAN-less member from an earlier
        # statement now printed with a PAN). Unanswered, the app adds them
        # as new and the folio lands under two members (8 Oct).
        same_yes = 0
        for q in p.get("same_person_prompts") or []:
            r = client.post(f"/imports/sessions/{p['session_id']}/resolve-same-person",
                            json={"person_key": q["person_key"], "member_id": q["member_id"], "same": True}, headers=headers)
            if r.status_code != 200:
                _say(f"{label}: same-person answer HTTP {r.status_code}")
                failures += 1
                break
            p = r.json()
            same_yes += 1
        # Only family_cas_2 after family_cas_1 should ask (a PAN-less member
        # from file 1 now printed with a PAN); any other prompt would mean the
        # app paired the wrong people (final review L3, 8 Oct).
        expected_yes = int(Path(path).name == "family_cas_2.pdf"
                           and any(Path(f).name == "family_cas_1.pdf" for f in files[: n - 1]))
        if same_yes != expected_yes:
            _say(f"{label}: same-person prompts answered={same_yes} expected={expected_yes}")
            failures += 1
        ident = Counter(s["identification"] for s in p["schemes"])
        plans = Counter(s["plan_type"] for s in p["schemes"])
        held_ask = sum(1 for s in p["schemes"] if s["identification"] == "ask")
        _say(f"{label}: funds={len(p['schemes'])} identification={dict(ident)} plan={dict(plans)} "
             f"needs_review={p.get('needs_review')} ask={held_ask} people={len(p['people'])} "
             f"needs_name={sum(1 for x in p['people'] if x.get('needs_name'))} "
             f"statuses={dict(Counter(x['status'] for x in p['people']))} warnings={len(p['parse_warnings'])} "
             f"rows={p['transaction_count']} same_person_yes={same_yes}")
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
    failures += _dashboard_checks(client, headers, members, files, passwords)
    if any(s != "match" for s in status) or failures:
        failures += 1
    _say("RESULT " + ("PASS" if not failures else "NOT PASS"))
    return bool(failures)


def _statement_value(files, passwords) -> D:
    """Sum of the statements' closing valuations, deduplicated by folio+ISIN
    (a later statement replaces an earlier one's figure). Read in memory."""
    import casparser
    vals = {}
    for path, pw in zip(files, passwords):
        d = casparser.read_cas_pdf(path, pw)
        for f in d.folios:
            for s in f.schemes:
                if s.valuation and s.valuation.value is not None:
                    vals[(f.folio, s.isin)] = D(str(s.valuation.value))
    return sum(vals.values(), D("0"))


def _statement_costs(files, passwords) -> dict:
    """Latest closing cost per folio/ISIN, read in memory without logging."""
    import casparser
    from datetime import date
    from app.services.import_.parser import parse_statement_date
    from app.services.import_.people import folio_key

    aliases = {}
    if os.environ.get("MASTER_FILE"):
        for line in Path(os.environ["MASTER_FILE"]).read_text(encoding="utf-8").splitlines():
            parts = line.split(";")
            if len(parts) > 3 and parts[1].startswith("INF") and parts[2].startswith("INF"):
                aliases[parts[2]] = parts[1]
    latest = {}
    for path, pw in zip(files, passwords):
        data = casparser.read_cas_pdf(path, pw)
        for folio in data.folios:
            for scheme in folio.schemes:
                if scheme.valuation is None:
                    continue
                is_open = D(str(scheme.close or 0)) > 0
                if is_open and scheme.valuation.cost is None:
                    continue
                on = parse_statement_date(scheme.valuation.date) or date.min
                key = (folio_key(folio.folio), aliases.get(scheme.isin, scheme.isin))
                cost = D(str(scheme.valuation.cost)) if is_open else D("0")
                if key not in latest or on >= latest[key][0]:
                    latest[key] = (on, cost)
    return {key: cost for key, (_on, cost) in latest.items()}


# Synthetic statements only: funds whose made-up opening cost the app
# rightly rejects against the real fund's NAV history (ICICI Bluechip and HSBC
# Value: synthetic prices below the real lowest NAV; Franklin's zero-cost
# segregated units). Same list as test_deep.py (8 Oct). Never applied to a
# real statement.
_SYNTHETIC_NAV_ON_START = {"INF109K01BL4", "INF917K01HD4", "INF090I01UD7"}


def _invested_vs_cas(rows, folios, schemes, costs, synthetic=False) -> tuple[D, int, int]:
    """Maximum absolute per-fund drift for one member's open holdings, and how
    many funds exceed ₹1 plus what a 4-decimal NAV can round on their units
    (opening balances and switch-ins are costed units × NAV to 4 dp; user
    decision, 8 Oct)."""
    from collections import defaultdict
    from app.services.import_.people import folio_key

    invested = defaultdict(lambda: D("0"))
    units = defaultdict(lambda: D("0"))
    expected = defaultdict(lambda: D("0"))
    for row in rows:
        if D(row["units_held"]) > 0:
            invested[schemes[row["scheme_id"]].isin] += D(row["amount_invested"])
            units[schemes[row["scheme_id"]].isin] += D(row["units_held"])
    for folio in folios:
        isin = schemes[str(folio.scheme_id)].isin
        if isin in invested:
            expected[isin] += costs.get((folio_key(folio.folio_number), isin), D("0"))
    skipped = {schemes[row["scheme_id"]].isin for row in rows
               if synthetic and (row.get("opening_lot") or {}).get("cost_source") == "nav_on_start"
               and schemes[row["scheme_id"]].isin in _SYNTHETIC_NAV_ON_START}
    diffs = {isin: abs(amount - expected[isin]) for isin, amount in invested.items() if isin not in skipped}
    over = sum(1 for isin, diff in diffs.items() if diff > D("1") + units[isin] * D("0.00005"))
    return max(diffs.values(), default=D("0")), over, len(skipped)


def _dashboard_checks(client, headers, members, files, passwords) -> int:
    """Artifact C2-C6/C12/D1, as invariants on the API the dashboard reads.
    Counts, aggregate cost differences and pass/fail only."""
    bad = 0
    total = D("0")
    # Blocked: a fresh test database has no cached NAVs, so every holding is
    # unpriced by design (production keeps the daily job's cache).
    blocked = os.environ.get("MFAPI_BLOCKED") == "1"
    from app.models.reference import Scheme
    from app.models.folio import Folio
    db = _test_db()
    schemes = {str(s.id): s for s in db.query(Scheme).all()}
    costs = _statement_costs(files, passwords)
    # family_cas_1/2 are hand-made test statements (staging QA, 30 Sep): they
    # print made-up NAVs and a cost without stamp duty that doesn't carry from
    # one file to the next, so their cost and value checks are skipped (user
    # decision, 8 Oct; baseline doc).
    hand_made = any(Path(f).name.startswith("family_cas_") for f in files)
    synthetic = all(Path(f).parent.name == "synthetic" for f in files)
    for i, m in enumerate(members, start=1):
        h = client.get(f"/household-members/{m['id']}/holdings", headers=headers).json()
        rows = h["holdings"]
        folios = db.query(Folio).filter(Folio.household_member_id == __import__("uuid").UUID(m["id"])).all()
        invested_vs_cas_max_diff, invested_over, nav_skipped = _invested_vs_cas(rows, folios, schemes, costs, synthetic)
        _say(f"member {i}: invested_vs_cas_max_diff=₹{invested_vs_cas_max_diff:.2f} funds_over_tolerance={invested_over}"
             f" synthetic_nav_on_start_skipped={nav_skipped}")
        bad += int(invested_over > 0 and not hand_made)
        valued = [r for r in rows if r["current_value"] is not None]
        value = sum((D(r["current_value"]) for r in valued), D("0"))
        invested = sum((D(r["amount_invested"]) for r in valued), D("0"))
        unreal = sum((D(r["unrealized_gain"]) for r in valued), D("0"))
        total += value
        if os.environ.get("COST_DIFF"):  # local investigation only: prints amounts, never paste into docs
            from app.models.reference import Scheme
            db = _test_db()
            for r in rows:
                sc = db.get(Scheme, __import__("uuid").UUID(r["scheme_id"]))
                _say(f"cost {sc.isin} invested={r['amount_invested']} avg={r['average_nav']} units={r['units_held']}")
        keys = Counter((r["scheme_id"], r["household_member_id"]) for r in rows)
        dupes = sum(1 for k, n in keys.items() if n > 1)                       # C4
        unreal_ok = abs(value - invested - unreal) <= D("1")                   # C2
        unverified = sum(1 for r in rows if not r.get("plan_verified", True))  # C3
        from_stmt = sum(1 for r in rows if r.get("price_from_statement"))
        al = client.get(f"/household-members/{m['id']}/allocation", headers=headers).json()
        buckets = {b["label"]: D(b["percentage"]) for b in al["by_asset_class"]}
        al_ok = abs(D(al["total_value"]) - value) <= D("1") and (not buckets or abs(sum(buckets.values()) - 100) <= D("0.1"))
        sips = client.get(f"/household-members/{m['id']}/sips", headers=headers).json()
        active = [x for x in sips if x["status"] == "active"]
        sip_split = sum(1 for k, n in Counter((x["scheme_id"], x["sip_date"][8:], x["sip_amount"]) for x in active).items() if n > 1)  # D1
        dc = client.get(f"/household-members/{m['id']}/distributor-comparison", headers=headers)
        dc_ok = dc.status_code == 200 and abs(sum((D(r["current_value"]) for r in dc.json()), D("0")) - value) <= D("1")  # C6
        _say(f"member {i} dashboard: holdings={len(rows)} unpriced={len(rows) - len(valued)} statement_priced={from_stmt} "
             f"duplicate_rows={dupes} unrealised_adds_up={unreal_ok} plan_unverified={unverified} "
             f"allocation_ok={al_ok} other_share={buckets.get('Other', D('0'))}% sips_active={len(active)} sip_splits={sip_split} "
             f"distributor_comparison_ok={dc_ok} xirr_present={h['lifetime_xirr'] is not None}")
        bad += int(bool(dupes) or not unreal_ok or not al_ok or bool(sip_split) or not dc_ok or (len(rows) != len(valued) and not blocked))
    stmt = _statement_value(files, passwords)
    drift = (total / stmt - 1) * 100 if stmt else D("0")
    _say(f"dashboard total vs statement total: {drift:+.2f}% (today's NAV vs statement date)")  # C2 / A1-A2
    bad += int(abs(drift) > 5 and not blocked and not hand_made)
    r = client.post("/imports/parse", files={"file": ("statement.pdf", Path(files[0]).read_bytes(), "application/pdf")},
                    data={"password": "wrong-password", "household_member_id": members[0]["id"],
                          "pan_disclaimer_version": PAN_DISCLAIMER_VERSION}, headers=headers)  # C12
    code = (r.json().get("detail") or {}).get("code") if r.headers.get("content-type", "").startswith("application/json") else None
    _say(f"wrong password: HTTP {r.status_code} code={code}")
    bad += int(r.status_code < 400 or r.status_code >= 500)
    return bad
