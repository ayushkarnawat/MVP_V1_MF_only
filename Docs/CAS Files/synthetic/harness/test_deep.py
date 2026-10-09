"""Deep check of everything the dashboard derives from an import, against an
independent truth computed straight from the CAS rows (casparser). Run one
scenario per process: SEQ=a.pdf,b.pdf OUT=x.json [SNAP=1] [DELETE_FIRST=1 | DELETE_LAST=1]."""
import sys
import asyncio, json, os, time, uuid
from collections import defaultdict
from datetime import date, timedelta
from decimal import Decimal as D

import casparser
from api.import_helpers import _authed_headers_and_member, PAN_DISCLAIMER_VERSION, _test_db

from pathlib import Path
_HERE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_HERE))
from pdf_dir import pdf_dir  # noqa: E402  PDFs live outside the repo
SYN = str(pdf_dir()) + "/"
TRUTH = json.loads((_HERE / "truth.json").read_text(encoding="utf-8"))
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
    stamp_unattached = 0
    for fo in r.folios:
        for s in fo.schemes:
            lots, realized, flows_fund = [], D(0), []
            lot_dates = []
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
                if ty == "STAMP_DUTY_TAX":
                    if amt > 0:
                        # Stamp duty belongs to that day's purchase cost and
                        # money paid out, exactly once (decided 7 Oct).
                        for lot, lot_date in reversed(list(zip(lots, lot_dates))):
                            if lot_date == t.date and lot[0]:
                                lot[1] += amt / lot[0]
                                flows_fund.append((t.date, -amt))
                                break
                        else:
                            stamp_unattached += 1
                    continue
                if ty in ("PURCHASE", "PURCHASE_SIP", "SWITCH_IN", "SWITCH_IN_MERGER", "DIVIDEND_REINVEST", "GIFT_IN", "SEGREGATION"):
                    lots.append([u, (amt / u) if u else D(0)])
                    lot_dates.append(t.date)
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
    return funds, r, stamp_unattached


def a14_checks(body, raw, per_member):
    """Attribute 14 (Investment & Withdrawal, added 9 Oct): the section's numbers
    against themselves, the dashboard, and the CAS rows. Returns the list of
    mismatches (empty = pass) plus what was compared."""
    mm = []
    payload = ((body.get("sections") or {}).get("investment_withdrawal") or {}).get("payload") or {}
    d = payload.get("data")
    if not d:
        return {"mismatches": ["investment_withdrawal section missing or empty"]}
    inv, wd, net, cv, gain, gifts = (D(d[k]) for k in (
        "total_invested", "total_withdrawn", "net_invested", "current_value", "absolute_gain", "gifts_net"))
    # 1. The tiles agree with each other (ruling 9 Oct: gain excludes gifts).
    if net != inv - wd:
        mm.append(f"net {net} != invested {inv} - withdrawn {wd}")
    if gain != cv + wd - inv - gifts:
        mm.append(f"gain {gain} != value {cv} + withdrawn {wd} - invested {inv} - gifts {gifts}")
    # 2. Buckets add up to the tiles, and each bucket to its own entries.
    for label, buckets in (("monthly", d["monthly"]), ("yearly", d["yearly"])):
        if sum((D(b["invested"]) for b in buckets), D(0)) != inv:
            mm.append(f"{label} invested sum != {inv}")
        if sum((D(b["withdrawn"]) for b in buckets), D(0)) != wd:
            mm.append(f"{label} withdrawn sum != {wd}")
        for b in buckets:
            e_inv = sum((D(e["amount"]) for e in b["entries"] if e["direction"] == "invested"), D(0)) \
                - sum((D(e["amount"]) for e in b["entries"] if e["direction"] == "reversal"), D(0))
            e_wd = sum((D(e["amount"]) for e in b["entries"] if e["direction"] == "withdrawn"), D(0))
            if (e_inv, e_wd) != (D(b["invested"]), D(b["withdrawn"])):
                mm.append(f"{label} {b['period']}: entries {e_inv}/{e_wd} != bucket {b['invested']}/{b['withdrawn']}")
    # 3. Months are continuous through the current month.
    months = [b["period"] for b in d["monthly"]]
    for a, b in zip(months, months[1:]):
        y, m = map(int, a.split("-"))
        if b != (f"{y + 1:04d}-01" if m == 12 else f"{y:04d}-{m + 1:02d}"):
            mm.append(f"monthly gap {a} -> {b}")
            break
    if months and months[-1] < f"{date.today():%Y-%m}":
        mm.append(f"monthly stops at {months[-1]}")
    # 4. Current value and SIPs match what the dashboard shows for the same people.
    cv_dash = sum((D(r["current_value"]) for pm in per_member.values()
                   for r in pm["holdings"].get("holdings", []) if r.get("current_value") is not None), D(0))
    # The section rounds the summed holdings to paise; the dashboard rows aren't rounded.
    if cv != cv_dash.quantize(D("0.01")):
        mm.append(f"current value {cv} != dashboard {cv_dash}")
    sips = [x for pm in per_member.values() for x in pm["sips"] if x.get("status", "active") == "active"]
    sip_count = sum(x.get("series_count") or 1 for x in sips)
    sip_total = sum((D(x["sip_amount"]) * (x.get("series_count") or 1) for x in sips), D(0))
    if d["sip_summary"]["active_count"] != sip_count:
        mm.append(f"active SIPs {d['sip_summary']['active_count']} != dashboard {sip_count}")
    if D(d["sip_summary"]["total_monthly_amount"]) != sip_total:
        mm.append(f"SIP monthly total {d['sip_summary']['total_monthly_amount']} != dashboard {sip_total}")
    # 5. Invested / withdrawn / gifts straight from the CAS rows of the last file.
    # Valid only when no fund opens with a balance (an opening balance is cost
    # the CAS rows don't itemise) and the run's files don't add other folios.
    truth = {"invested": D(0), "withdrawn": D(0), "gifts": D(0)}
    has_opening = False
    for fo in raw.folios:
        for s in fo.schemes:
            if D(str(s.open or 0)) != 0:
                has_opening = True
            for t in s.transactions:
                ty, amt = T(t), abs(D(str(t.amount))) if t.amount is not None else D(0)
                if ty in ("PURCHASE", "PURCHASE_SIP", "STAMP_DUTY_TAX"):
                    truth["invested"] += amt
                elif ty == "REVERSAL":
                    truth["invested"] -= amt
                elif ty in ("REDEMPTION", "DIVIDEND_PAYOUT"):
                    truth["withdrawn"] += amt
                elif ty == "GIFT_IN":
                    truth["gifts"] += amt
                elif ty == "GIFT_OUT":
                    truth["gifts"] -= amt
    compare_truth = not has_opening and os.environ.get("A14_TRUTH", "1") == "1"
    if compare_truth:
        for k, app in (("invested", inv), ("withdrawn", wd), ("gifts", gifts)):
            if app != truth[k]:
                mm.append(f"{k} {app} != CAS rows {truth[k]}")
    return {"mismatches": mm, "truth_compared": compare_truth, "has_opening_balance": has_opening,
            "tiles": {k: d[k] for k in ("total_invested", "total_withdrawn", "net_invested", "current_value",
                                         "absolute_gain", "gifts_net")},
            "truth": {k: str(v) for k, v in truth.items()}, "months": len(months),
            "sip_summary": d["sip_summary"]}


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
        import importlib.util, time as _time
        from app.services.analytics import amfi_ter_client
        job_path = Path(__file__).resolve().parents[4] / "backend" / "scripts" / "jobs" / "refresh_nav_daily.py"
        print(f"Morning NAV job: {job_path}", flush=True)
        spec = importlib.util.spec_from_file_location("refresh_nav_daily", job_path)
        nav_job = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(nav_job)
        asyncio.run(nav_job.main_async(db))  # held funds + category peers, before timing

        # Record any TER download instead of raising: Analytics swallows a
        # section's exception, so a raise could never fail the gate (final
        # review M1, 8 Oct). These are the fetchers every TER refresh calls.
        ter_calls = []

        async def _ter_fetch(*a, **_k):
            ter_calls.append(a)
            return None
        monkeypatch.setattr(amfi_ter_client, "_fetch_latest_ter_month", _ter_fetch)
        monkeypatch.setattr(amfi_ter_client, "_fetch_ter_rows", _ter_fetch)

        # Per-section time (summed over scopes), to see where analytics_seconds goes
        # (added 9 Oct with attribute 14). Wraps compute only; no app change.
        from app.services.analytics import recompute as _rcm
        section_seconds = defaultdict(float)
        for _spec in _rcm._SECTIONS:
            async def _timed(db_, ids, _orig=_spec.compute, _name=_spec.name):
                t0 = _time.perf_counter()
                try:
                    return await _orig(db_, ids)
                finally:
                    section_seconds[_name] += _time.perf_counter() - t0
            monkeypatch.setattr(_spec, "compute", _timed)

        started = _time.perf_counter()
        asyncio.run(recompute_household_analytics(db, user.id))
        out["analytics_seconds"] = round(_time.perf_counter() - started, 1)
        out["section_seconds"] = {k: round(v, 1) for k, v in sorted(section_seconds.items(), key=lambda kv: -kv[1])}
        a = client.get("/analytics/combined", headers=headers)
        out["analytics"] = {"status": a.status_code, "body": a.json() if a.status_code == 200 else a.text[:2000]}
        out["ter_fetches_during_analytics"] = len(ter_calls)
      except Exception as e:
        import traceback
        out["analytics"] = f"EXC {type(e).__name__}: {str(e)[:300]} " + traceback.format_exc()[-800:]

    # ---- truth comparison (single-member, full-history files) ----
    funds, raw, stamp_unattached = cas_truth(last)
    out["stamp_unattached"] = stamp_unattached
    me = per_member.get(tr["investor"]) or next(iter(per_member.values()))
    rows = me["holdings"].get("holdings", [])
    truth_isins = {f["isin"] for f in funds.values()}
    by_isin = defaultdict(lambda: {"units": D(0), "invested": D(0), "realized": D(0), "nav": None, "value": D(0), "plan": set()})
    for r in rows:
        s = sch[r["scheme_id"]]
        # An IDCW-reinvest fund is filed under its payout ISIN with the CAS's
        # reinvest ISIN in isin_reinvest (8 Oct): compare on the CAS's ISIN.
        b = by_isin[s.isin_reinvest if s.isin_reinvest in truth_isins and s.isin not in truth_isins else s.isin]
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
    # ₹1, plus what a 4-decimal NAV can round on these units: an opening
    # balance or switch-in is costed units × NAV to 4 dp, so a fund with lakhs
    # of units can differ by a few rupees (user decision, 8 Oct).
    # The statement covers every person in it, so compare against all
    # members' holdings, not just `me` (family files, 8 Oct).
    # A fund whose opening cost the app rejected as impossible against the
    # fund's real NAV history (opening_lot.cost_source "nav_on_start") is
    # skipped and listed: some synthetic price curves go below the real
    # fund's lowest NAV, so the statement's cost there is made up (8 Oct).
    invested_all = defaultdict(lambda: D(0))
    nav_on_start = set()
    for pm in per_member.values():
        for r in pm["holdings"].get("holdings", []):
            s = sch[r["scheme_id"]]
            k = s.isin_reinvest if s.isin_reinvest in truth_isins and s.isin not in truth_isins else s.isin
            invested_all[k] += D(r["amount_invested"])
            if (r.get("opening_lot") or {}).get("cost_source") == "nav_on_start":
                nav_on_start.add(k)
    out["invested_skipped_nav_on_start"] = sorted(t_by_isin[k]["name"][:50] for k in nav_on_start if k in t_by_isin)
    out["invested_mismatch"] = [dict(fund=t["name"][:50], units_cas=str(t["close"]), cost_cas=str(t["cost"]),
                                     invested_app=str(round(invested_all[isin], 2)))
                                for isin, t in t_by_isin.items() if t["close"] > 0 and isin not in nav_on_start
                                and abs(t["cost"] - invested_all[isin]) > D("1") + t["close"] * D("0.00005")]

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
        isin_scheme.update({s.isin_reinvest: s for s in sch.values() if s.isin_reinvest and s.isin_reinvest not in isin_scheme})
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
    if isinstance(out.get("analytics"), dict) and out["analytics"].get("status") == 200:
        out["a14"] = a14_checks(out["analytics"]["body"], raw, per_member)
    json.dump(out, open(OUT, "w", encoding="utf-8", newline="\n"), indent=1, default=str)
    # Asserted after the dump, so a failing scenario still leaves its output.
    if os.environ.get("MASTER_FILE"):
        assert out["reconcile_all_match"], out["reconcile"]
        assert not out["invested_mismatch"], out["invested_mismatch"]
        # Only funds known to have a statement cost the app rightly rejects:
        # a synthetic price curve below the real fund's lowest NAV (ICICI
        # Bluechip; HSBC Value, whose mfapi history starts Nov 2022 after the
        # L&T merger), and zero-cost segregated units (8 Oct). Anything new
        # must be looked at.
        known = {"ICICI Prudential Bluechip Fund - Growth", "HSBC Value Fund - Direct Plan - Growth",
                 "Franklin India Low Duration Fund-Direct- Segregate"}
        assert set(out["invested_skipped_nav_on_start"]) <= known, out["invested_skipped_nav_on_start"]
        assert out["stamp_unattached"] == 0, out["stamp_unattached"]
        if os.environ.get("ANALYTICS") == "1":
            limit = float(os.environ.get("ANALYTICS_MAX_SECONDS", "30"))
            an = out.get("analytics")
            assert isinstance(an, dict) and an["status"] == 200, an
            failed = [k for k, v in an["body"]["sections"].items() if v.get("failed_at")]
            # A section failing on a fresh database leaves no row at all
            # (recompute._mark_section_failed), so every section must be there.
            from app.services.analytics import recompute as _rc
            assert set(an["body"]["sections"]) == {sec.name for sec in _rc._SECTIONS}, sorted(an["body"]["sections"])
            assert not failed, failed
            assert not out["a14"]["mismatches"], out["a14"]["mismatches"]  # attribute 14 (9 Oct)
            assert out.get("ter_fetches_during_analytics") == 0, out.get("ter_fetches_during_analytics")
            assert "analytics_seconds" in out and out["analytics_seconds"] <= limit, out.get("analytics_seconds")
