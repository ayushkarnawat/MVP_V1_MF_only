"""Deep check of everything the dashboard derives from an import, against an
independent truth computed straight from the CAS rows (casparser). Run one
scenario per process: SEQ=a.pdf,b.pdf OUT=x.json [SNAP=1] [DELETE_FIRST=1 | DELETE_LAST=1]."""
import asyncio, json, os, time, uuid
from collections import defaultdict
from datetime import date, timedelta
from decimal import Decimal as D

import casparser
from api.import_helpers import _authed_headers_and_member, PAN_DISCLAIMER_VERSION, _test_db

from pathlib import Path
SYN = str(Path(__file__).resolve().parent.parent) + "/"
TRUTH = json.load(open(SYN + "truth.json"))
SEQ = os.environ["SEQ"].split(",")
OUT = os.environ["OUT"]
SNAP = os.environ.get("SNAP") == "1"
DELETE_FIRST = os.environ.get("DELETE_FIRST") == "1"
DELETE_LAST = os.environ.get("DELETE_LAST") == "1"   # Phase 4: delete the last upload
T = lambda t: str(t.type).split(".")[-1]


def xirr(flows):
    flows = sorted(flows)
    if not flows or all(a >= 0 for _, a in flows) or all(a <= 0 for _, a in flows):
        return None
    t0 = flows[0][0]
    f = lambda r: sum(float(a) / (1 + r) ** ((d - t0).days / 365.0) for d, a in flows)
    lo, hi = -0.99, 10.0
    for _ in range(200):
        mid = (lo + hi) / 2
        if f(mid) > 0: lo = mid
        else: hi = mid
    return round(mid, 4)


def cas_truth(fn):
    """Truth from the CAS rows themselves (valid when every opening balance is 0)."""
    r = casparser.read_cas_pdf(SYN + fn, "MF@123")
    funds = {}
    for fo in r.folios:
        for s in fo.schemes:
            lots, realized, flows_fund = [], D(0), []
            bal_series = []
            sip_series = defaultdict(list)
            payouts = 0
            for t in s.transactions:
                ty = T(t)
                if t.units is not None and t.balance is not None:
                    bal_series.append((t.date, D(str(t.balance))))
                u = D(str(t.units)) if t.units is not None else None
                amt = D(str(t.amount)) if t.amount is not None else D(0)
                nav = D(str(t.nav)) if t.nav is not None else None
                if ty in ("PURCHASE", "PURCHASE_SIP", "SWITCH_IN", "SWITCH_IN_MERGER", "DIVIDEND_REINVEST", "GIFT_IN", "SEGREGATION"):
                    lots.append([u, (amt / u) if u else D(0)])
                    if ty == "PURCHASE_SIP":
                        key = t.description.split(" - Instalment")[0]
                        sip_series[key].append((t.date, amt))
                elif ty == "REVERSAL":
                    for lot in reversed(lots):
                        if lot[0] == -u: lot[0] = D(0); break
                elif ty in ("REDEMPTION", "SWITCH_OUT", "SWITCH_OUT_MERGER", "GIFT_OUT"):
                    rem = -u
                    for lot in lots:
                        if rem <= 0: break
                        take = min(lot[0], rem)
                        if ty != "GIFT_OUT" and nav is not None: realized += take * (nav - lot[1])  # no price = unit conversion, not a sale
                        lot[0] -= take; rem -= take
                elif ty == "DIVIDEND_PAYOUT":
                    payouts += 1
                # fund-level flows (switches count) for current-holdings XIRR
                if ty in ("PURCHASE", "PURCHASE_SIP", "SWITCH_IN", "SWITCH_IN_MERGER", "GIFT_IN"):
                    flows_fund.append((t.date, -amt))
                elif ty in ("REDEMPTION", "SWITCH_OUT", "SWITCH_OUT_MERGER", "REVERSAL", "DIVIDEND_PAYOUT"):
                    flows_fund.append((t.date, abs(amt)))
            key = (fo.folio, s.isin or s.scheme)
            funds[key] = dict(fund=s.scheme, isin=s.isin, close=D(str(s.close)), open=D(str(s.open)),
                              cost=D(str(s.valuation.cost or 0)), realized=realized, flows=flows_fund,
                              bal_series=bal_series, sip_series=sip_series, payouts=payouts)
    return funds, r


def upload(client, headers, mid, fn, log, timing):
    t0 = time.time()
    r = client.post("/imports/parse", files={"file": (fn, open(SYN + fn, "rb").read(), "application/pdf")},
                    data={"password": "MF@123", "household_member_id": mid, "pan_disclaimer_version": PAN_DISCLAIMER_VERSION},
                    headers=headers)
    timing.append((fn, "parse", round(time.time() - t0, 1)))
    if r.status_code == 409 and (r.json().get("detail") or {}).get("code") == "member_not_in_file":
        # A family member's own statement uploaded from this account: the user
        # picks "Import for these people" (MemberNotInFileDialog).
        sid = r.json()["detail"]["session_id"]
        log.append(f"prompt {fn}: member_not_in_file -> import for these people")
        r = client.post(f"/imports/sessions/{sid}/acknowledge", json={"code": "member_not_in_file"}, headers=headers)
    if r.status_code != 200:
        log.append(f"PARSE {fn} -> {r.status_code} {r.text[:400]}"); return None
    p = r.json()
    log.append({"file": fn, "people": [(x["name"], x["status"], x["fund_count"], bool(x.get("needs_name"))) for x in p["people"]],
                "needs_review": p.get("needs_review"),
                "review": [(s["name"][:50], s["match_status"], s["plan_type"]) for s in p["schemes"]
                           if s["match_status"] != "confirmed" or s["plan_type"] == "unclassified"]})
    confs = [{"temp_id": s["temp_id"], "amfi_code": s["suggested_amfi_code"]} for s in p["schemes"]
             if s["match_status"] != "confirmed" and s["suggested_amfi_code"]]
    if p["people"]:
        # The same body the app sends (MemberRibbonReview.handleConfirmImports):
        # one entry per person, a typed name where the popup asks for one (U9),
        # and each fund's code override on its own person.
        confs_by = defaultdict(list)
        for s_ in p["schemes"]:
            if s_["match_status"] != "confirmed" and s_["suggested_amfi_code"]:
                confs_by[s_.get("person_key")].append({"temp_id": s_["temp_id"], "amfi_code": s_["suggested_amfi_code"]})
        people_body = []
        for x in p["people"]:
            e = {"person_key": x["person_key"], "scheme_confirmations": confs_by.get(x["person_key"], [])}
            if x.get("needs_name"):
                e["name"] = "Meera Typed " + "ABCDEFGH"[int(x["person_key"][1:]) % 8]
            people_body.append(e)
        body = {"session_id": p["session_id"], "people": people_body}
    else:
        body = {"session_id": p["session_id"], "household_member_id": mid, "scheme_confirmations": confs}
    t0 = time.time()
    c = client.post("/imports/confirm", json=body, headers=headers)
    timing.append((fn, "confirm", round(time.time() - t0, 1)))
    if c.status_code != 200:
        log.append(f"CONFIRM {fn} -> {c.status_code} {c.text[:400]}"); return None
    j = c.json()
    log.append(f"confirm {fn}: added={j['added']} skipped={j['skipped']} warnings={j.get('warnings')}")
    return j


def test_deep(client, monkeypatch):
    # Snapshot background work must use the same isolated database as the routes.
    from sqlalchemy.orm import sessionmaker
    from app.services.dashboard import snapshots
    with _test_db() as db:
        monkeypatch.setattr(snapshots, "SessionLocal", sessionmaker(bind=db.get_bind()))
        import app.api.imports as imports_api  # background tasks: never the .env database
        monkeypatch.setattr(imports_api, "SessionLocal", sessionmaker(bind=db.get_bind()))
    if os.environ.get("MASTER_FILE"):
        from app.services.analytics.scheme_master import refresh_scheme_master
        text = Path(os.environ["MASTER_FILE"]).read_text(encoding="utf-8")
        asyncio.run(refresh_scheme_master(_test_db(), text))
    last = SEQ[-1]
    tr = TRUTH[last]
    headers, mid = _authed_headers_and_member(client, "+919811122299", name=tr["investor"])
    log, timing, snaps_after = [], [], []
    for fn in SEQ:
        upload(client, headers, mid, fn, log, timing)
        if SNAP:
            t0 = time.time()
            s = client.get(f"/household-members/{mid}/snapshots", headers=headers).json()
            timing.append((fn, "snapshots", round(time.time() - t0, 1)))
            snaps_after.append({"after": fn, "months": len(s), "sample": {x["snapshot_month"]: x["total_value"] for x in s
                                if x["snapshot_month"] in ("2016-12-31", "2020-12-31", "2026-04-30", "2026-08-31")}})
    members = client.get("/household-members", headers=headers).json()
    out = {"seq": SEQ, "log": log, "timing": timing, "snaps_after": snaps_after, "members": [(m["name"], m["id"]) for m in members]}

    if DELETE_FIRST or DELETE_LAST:
        hist = client.get("/imports/history", headers=headers).json()
        ordered = sorted(hist, key=lambda h: h.get("uploaded_at") or "")
        target = ordered[0] if DELETE_FIRST else ordered[-1]
        d = client.delete(f"/imports/{target['import_id']}", headers=headers)
        out["delete"] = {"status": d.status_code, "which": "first" if DELETE_FIRST else "last", "body": d.text[:300]}

    db = _test_db()
    from app.services.import_.reconciliation import reconcile_members
    out["reconcile"] = [{"folio": row.folio_number, "scheme": row.scheme_name,
                         "status": row.status, "diff_units": str(row.diff_units) if row.diff_units is not None else None}
                        for row in reconcile_members(db, [uuid.UUID(m["id"]) for m in members])]
    if os.environ.get("MASTER_FILE"):
        out["reconcile_all_match"] = bool(out["reconcile"]) and all(row["status"] == "match" for row in out["reconcile"])
    from app.models.reference import Scheme, NavHistory
    sch = {str(s.id): s for s in db.query(Scheme).all()}
    per_member = {}
    for m in members:
        m_id = m["id"]
        h = client.get(f"/household-members/{m_id}/holdings", headers=headers).json()
        sips = client.get(f"/household-members/{m_id}/sips", headers=headers).json()
        cf = client.get(f"/household-members/{m_id}/cash-flow", headers=headers).json()
        alloc = client.get(f"/household-members/{m_id}/allocation", headers=headers)
        gaps = client.get(f"/household-members/{m_id}/coverage-gaps", headers=headers).json()
        per_member[m["name"]] = {"holdings": h, "sips": sips, "cashflow_types": dict(
            (k, sum(1 for x in cf if x["type"] == k)) for k in {x["type"] for x in cf}),
            "alloc_status": alloc.status_code, "gaps": gaps}
    out["aggregate_status"] = client.get("/household/aggregate/holdings", headers=headers).status_code

    # analytics
    if os.environ.get("ANALYTICS") != "1":
        pass
    else:
      try:
        from app.services.analytics.recompute import recompute_household_analytics
        from app.models.user import User
        user = db.query(User).first()
        asyncio.run(recompute_household_analytics(db, user.id))
        a = client.get("/analytics/combined", headers=headers)
        out["analytics"] = {"status": a.status_code, "body": a.json() if a.status_code == 200 else a.text[:2000]}
      except Exception as e:
        import traceback
        out["analytics"] = f"EXC {type(e).__name__}: {str(e)[:300]} " + traceback.format_exc()[-800:]

    # ---- truth comparison (single-member, full-history files) ----
    funds, raw = cas_truth(last)
    me = per_member.get(tr["investor"]) or next(iter(per_member.values()))
    rows = me["holdings"].get("holdings", [])
    by_isin = defaultdict(lambda: {"units": D(0), "invested": D(0), "realized": D(0), "nav": None, "value": D(0), "plan": set()})
    for r in rows:
        s = sch[r["scheme_id"]]; b = by_isin[s.isin]
        b["units"] += D(r["units_held"]); b["invested"] += D(r["amount_invested"]); b["realized"] += D(r["realized_gain"])
        b["nav"] = D(r["current_nav"]) if r["current_nav"] else None; b["plan"].add(r["plan_type"])
        b["value"] += D(r["current_value"] or 0)
    comp = []
    t_by_isin = defaultdict(lambda: {"close": D(0), "cost": D(0), "realized": D(0), "name": ""})
    for k, f in funds.items():
        t = t_by_isin[f["isin"]]; t["close"] += f["close"]; t["cost"] += f["cost"]; t["realized"] += f["realized"]; t["name"] = f["fund"]
    for isin, t in t_by_isin.items():
        b = by_isin.get(isin, {"units": D(0), "invested": D(0), "realized": D(0), "plan": set()})
        comp.append({"fund": t["name"][:50], "units_cas": str(t["close"]), "units_app": str(b["units"]),
                     "cost_cas": str(t["cost"]), "invested_app": str(round(b["invested"], 2)),
                     "realized_truth": str(round(t["realized"], 2)), "realized_app": str(round(b["realized"], 2)),
                     "plan": sorted(b["plan"])})
    out["funds"] = comp

    # XIRR truth: terminal = CAS units x app's current NAV (isolates row errors from NAV source)
    navs = {isin: b["nav"] for isin, b in by_isin.items()}
    # A CAS can print a scheme's reinvestment ISIN (AMFI master column 3) while
    # the app stores the scheme under its primary ISIN (column 2). Without this
    # the truth finds no NAV for that fund and drops it from the terminal value
    # (Phase 6 Task 12, carry-over 16: p20/p10 HDFC BAF IDCW, INF179K01822).
    if os.environ.get("MASTER_FILE"):
        alias = {}
        for line in Path(os.environ["MASTER_FILE"]).read_text(encoding="utf-8").splitlines():
            parts = line.split(";")
            if len(parts) > 3 and parts[1].startswith("INF") and parts[2].startswith("INF"):
                alias[parts[2]] = parts[1]
        for f_ in funds.values():
            if f_["isin"] not in navs and alias.get(f_["isin"]) in navs:
                navs[f_["isin"]] = navs[alias[f_["isin"]]]
    today = date.today()
    life, cur = [], []
    terminal = D(0)
    for k, f in funds.items():
        nav = navs.get(f["isin"]) or D(0)
        if f["close"] > 0 and nav:
            terminal += f["close"] * nav
            cur += f["flows"]
        life += [x for x in f["flows"]]
    # lifetime: external flows only (switch legs cancel across funds at portfolio level)
    life_ext = []
    for k, f in funds.items():
        for d_, a in f["flows"]:
            life_ext.append((d_, a))
    out["xirr"] = {"lifetime_app": me["holdings"].get("lifetime_xirr"), "current_app": me["holdings"].get("current_holdings_xirr"),
                   "lifetime_truth_incl_switch_legs": xirr(life_ext + [(today, terminal)]),
                   "current_truth": xirr(cur + [(today, terminal)])}

    # SIP truth: series with an instalment in the last 40 days of the statement
    end = date(2026, 10, 5)
    active = []
    for k, f in funds.items():
        for label, inst in f["sip_series"].items():
            if inst and inst[-1][0] >= end - timedelta(days=40):
                active.append((f["fund"][:40], label[:30], str(inst[-1][1])))
    stopped_but_held = []
    for k, f in funds.items():
        for label, inst in f["sip_series"].items():
            if inst and inst[-1][0] < end - timedelta(days=40) and f["close"] > 0:
                stopped_but_held.append((f["fund"][:40], label[:30], str(inst[-1][0])))
    out["sips"] = {"truth_active": active, "truth_stopped_but_units_held": stopped_but_held,
                   "app": [(x["scheme_name"][:40], x["sip_amount"], x["sip_date"], x["next_due_date"],
                            x.get("series_count"), x.get("status")) for x in me["sips"]]}
    out["realized_summary"] = me["holdings"].get("realized_summary")
    mid_ = next(m["id"] for m in members if m["name"] == tr["investor"]) if any(m["name"] == tr["investor"] for m in members) else members[0]["id"]
    out["sips_all"] = [(x["scheme_name"][:40], x["sip_amount"], x["sip_date"], x.get("series_count"), x.get("status"))
                       for x in client.get(f"/household-members/{mid_}/sips?include_stopped=true", headers=headers).json()]
    out["payout_rows_in_cas"] = sum(f["payouts"] for f in funds.values())
    out["cashflow_types_app"] = me["cashflow_types"]
    out["gaps_app"] = me["gaps"]
    out["per_member_values"] = {name: str(sum(D(r["current_value"] or 0) for r in pm["holdings"].get("holdings", [])))
                                for name, pm in per_member.items()}

    # Snapshot truth at a few month-ends: CAS balance on that date x app's own NAV history
    if SNAP:
        snaps = client.get(f"/household-members/{mid}/snapshots", headers=headers).json()
        app_snap = {x["snapshot_month"]: D(x["total_value"]) for x in snaps}
        out["snap_months"] = [(x["snapshot_month"], bool(x.get("is_partial"))) for x in snaps]
        isin_scheme = {s.isin: s for s in sch.values()}
        chk = {}
        for me_ in ("2016-12-31", "2020-12-31", "2023-12-31", "2026-04-30", "2026-08-31"):
            dd = date.fromisoformat(me_)
            tot = D(0); missing = False
            for k, f in funds.items():
                units = D(0)
                for d_, b in f["bal_series"]:
                    if d_ <= dd: units = b
                if units == 0: continue
                s = isin_scheme.get(f["isin"])
                if s is None: missing = True; continue
                nh = db.query(NavHistory).filter(NavHistory.scheme_id == s.id, NavHistory.date <= dd).order_by(NavHistory.date.desc()).first()
                if nh is None: missing = True; continue
                tot += units * nh.nav
            chk[me_] = {"app": str(app_snap.get(me_)), "truth": str(round(tot, 2)), "truth_incomplete": missing}
        out["snapshot_check"] = chk
    json.dump(out, open(OUT, "w"), indent=1, default=str)
    # Asserted after the dump, so a failing scenario still leaves its output.
    if os.environ.get("MASTER_FILE"):
        assert out["reconcile_all_match"], out["reconcile"]
