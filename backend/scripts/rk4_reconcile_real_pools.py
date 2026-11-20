"""RK-4 (real data, read-only): reconcile the app's category pools with the independent AMFI recount.

Run inside the backend container, from the backend folder:
    python scripts/rk4_reconcile_real_pools.py

For every category and plan that a household holds it compares, from the same AMFI NAVAll text, the app's peer
set and its 1Y, 3Y and 5Y ranked pools with the recount's pool, and prints the funds that differ with the
recount's reason. Everything runs in a transaction that is always rolled back (the app writes public NAV history
while it computes a pool; none of it is kept). Output: counts and public scheme names only.
"""
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from recount_category_pool import parse_navall, recount_pool  # noqa: E402

# ---- RK-4 driver (read-only; same AMFI text feeds the app and the recount) ----
import asyncio, sys
from datetime import datetime, timezone, timedelta
from sqlalchemy import distinct, func, text as sqltext
from app.db.session import SessionLocal
from app.models.enums import SchemePlanType
from app.models.folio import Folio
from app.models.reference import NavHistory, Scheme
from app.services.analytics import scheme_universe as su
from app.services.analytics.scheme_universe import SchemeUniverseClient, _parse_nav_all, canonical_category, get_category_peers
from app.services.analytics.performance_ranking import load_ranking_pools

from sqlalchemy.orm import Session
from app.db.session import engine
_conn = engine.connect(); _outer = _conn.begin()
db = Session(bind=_conn, join_transaction_mode="create_savepoint", autoflush=False)  # every commit inside the app code only releases a savepoint; the outer transaction is always rolled back
IST = timezone(timedelta(hours=5, minutes=30))
BAD = re.compile(r"idcw|dividend|payout|reinvest", re.I)

def reason_of(rec, code):
    for st in rec.steps:
        for e in st.set_aside:
            if e.scheme_code == code: return st.name
    return "in_pool"

async def main():
    now = datetime.now(IST); today = now.date()
    text_ = await SchemeUniverseClient()._fetch_nav_all_text()
    su.scheme_universe_client._rows = _parse_nav_all(text_)
    rows = parse_navall(text_)
    held = db.query(Scheme).join(Folio, Folio.scheme_id == Scheme.id).filter(Scheme.id.in_(db.query(distinct(Folio.scheme_id)))).all()
    amfi_newest = max((r.nav_date for r in rows if r.nav_date), default=None)
    latest = dict(db.query(NavHistory.scheme_id, func.max(NavHistory.date)).filter(NavHistory.scheme_id.in_([s.id for s in held])).group_by(NavHistory.scheme_id).all())
    priced = sum(1 for s in held if latest.get(s.id) == amfi_newest)
    print(f"LABEL: run {now:%Y-%m-%d %H:%M} IST | AMFI newest date {amfi_newest} | held funds {len(held)}, with that day's price {priced} | AMFI rows parsed {len(rows)}")
    groups = {}
    for s in held:
        if s.sebi_category and s.amfi_code and s.plan_type in (SchemePlanType.DIRECT, SchemePlanType.REGULAR):
            groups.setdefault((canonical_category(s.sebi_category), s.plan_type), s)
    print(f"held category+plan groups: {len(groups)}\n")
    tot = {"peers_equal": 0, "peers_diff": 0, "period_equal": 0, "period_diff": 0, "bad_in_pool": 0, "errors": 0}
    for (cat, plan_type), rep in sorted(groups.items(), key=lambda kv: kv[0][0]):
        plan = "direct" if plan_type == SchemePlanType.DIRECT else "regular"
        try:
            peers = await get_category_peers(db, rep.sebi_category, plan_type)
            app_codes = {x.amfi_code for x in peers.schemes}
            names = {x.amfi_code: x.name for x in peers.schemes}
            rec0 = recount_pool(rows, cat, plan, today, None, 3)
            rec_codes = set(rec0.final_pool)
            codes_all = list(app_codes | rec_codes)
            mn = dict(db.query(Scheme.amfi_code, func.min(NavHistory.date)).join(NavHistory, NavHistory.scheme_id == Scheme.id).filter(Scheme.amfi_code.in_(codes_all)).group_by(Scheme.amfi_code).all())
            hist = {c: (today - d).days for c, d in mn.items()}
            rp = await load_ranking_pools(db, rep, today)
            id2code = {x.id: x.amfi_code for x in rp.peers.schemes}
            line = f"{cat[:48]:48s} {plan[:3]} | peers app={len(app_codes):3d} recount={len(rec_codes):3d}"
            oa, orr = sorted(app_codes - rec_codes), sorted(rec_codes - app_codes)
            tot["peers_equal" if not oa and not orr else "peers_diff"] += 1
            per = []
            for label, yrs in (("1Y", 1), ("3Y", 3), ("5Y", 5)):
                rec = recount_pool(rows, cat, plan, today, hist, yrs)
                a = {id2code[i] for i in rp.pools[label] if i in id2code}
                r = set(rec.final_pool)
                per.append((label, len(a), len(r), sorted(a - r), sorted(r - a), rec))
                tot["period_equal" if a == r else "period_diff"] += 1
                bad=[rp.names.get(i, "")[:60] for i in rp.pools[label] if BAD.search(rp.names.get(i, ""))]
                if bad: tot["bad_in_pool"] += 1; print(f"   BAD-NAME in {cat[:30]} {label} pool:", bad[:3])
            print(line + " | " + " ".join(f"{l}:{na}/{nr}" for l, na, nr, *_ in per))
            if oa or orr:
                print("   peers: only in app:", [(c, names.get(c, "?")[:40], reason_of(rec0, c)) for c in oa[:5]], "| only in recount:", [(c, next((r.name[:40] for r in rows if r.scheme_code==c), '?')) for c in orr[:5]], f"(counts {len(oa)}/{len(orr)})")
            for l, na, nr, ao, ro, rec in per:
                if ao or ro: print(f"   {l}: only in app {len(ao)} {[(c, names.get(c,'?')[:34]) for c in ao[:4]]} | only in recount {len(ro)} {[(c, next((r.name[:34] for r in rows if r.scheme_code==c), '?')) for c in ro[:4]]} | mixed_end_dates flags {sum(1 for f in rec.flags if f.flag=='mixed_end_dates')}")
        except Exception as e:
            tot["errors"] += 1
            print(f"{cat[:48]:48s} {plan[:3]} | ERROR {type(e).__name__}: {str(e)[:150]}")
    print("\nTOTALS", tot)
try:
    asyncio.run(main())
finally:
    db.close(); _outer.rollback(); _conn.close(); print('(outer transaction rolled back; nothing persisted)')
