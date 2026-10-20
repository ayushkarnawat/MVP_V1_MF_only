"""UX-fixes (Investment & Withdrawal section) reconciliation checks. Truth is
rebuilt from the transaction rows in the DB, not by calling the app's compute.
Each check group is one function returning {"checked": n, "mismatches": [...]};
run_all(db, scopes, ...) runs every group, so later tasks (History) can add a
function and register it in GROUPS.

`scopes` maps a label ("combined" or a member name) to
(household_member_ids, section_payload_data).
"""
from __future__ import annotations

import uuid
from decimal import Decimal as D

TOL = D("0.01")


def _is_conversion(desc):  # restated independently of lot_rules
    t = (desc or "").lower()
    return "merger" in t or "face value" in t


def _txns(db, member_ids):
    from app.models.folio import Folio
    from app.models.transaction import Transaction
    folio_ids = [f.id for f in db.query(Folio).filter(Folio.household_member_id.in_(member_ids)).all()]
    if not folio_ids:
        return []
    return db.query(Transaction).filter(Transaction.folio_id.in_(folio_ids)).all()


def _tname(t):
    return str(t.type).split(".")[-1]


def _close(a, b):
    return abs(D(a) - D(b)) <= TOL


def reconcile_totals(label, ids, d, db):
    """Checks 1-3: tiles vs buckets, net identity."""
    mm, n = [], 0
    opening = D(d.get("opening_holdings", "0"))
    inv, wd, net = D(d["total_invested"]), D(d["total_withdrawn"]), D(d["net_invested"])
    for name, buckets, extra in (("monthly", d["monthly"], opening), ("yearly", d["yearly"], opening)):
        n += 2
        s_inv = sum((D(b["invested"]) for b in buckets), D(0))
        s_wd = sum((D(b["withdrawn"]) for b in buckets), D(0))
        if not _close(inv, s_inv + extra):
            mm.append(f"[{label}] total_invested {inv} != sum({name}.invested) {s_inv} + opening {extra}")
        if not _close(wd, s_wd):
            mm.append(f"[{label}] total_withdrawn {wd} != sum({name}.withdrawn) {s_wd}")
    n += 1
    if not _close(net, inv - wd):
        mm.append(f"[{label}] net_invested {net} != invested {inv} - withdrawn {wd}")
    return {"checked": n, "mismatches": mm}


def no_conversion_switches(label, ids, d, db):
    """Check 4: no switched_in/out entry whose DB raw_description is a merger / face-value conversion."""
    from app.models.transaction import Transaction
    mm, n = [], 0
    tids = {e["transaction_id"] for b in d["monthly"] for e in b["entries"] if e["direction"] in ("switched_in", "switched_out")}
    rows = {str(t.id): t for t in db.query(Transaction).filter(Transaction.id.in_([uuid.UUID(x) for x in tids])).all()} if tids else {}
    for tid in tids:
        n += 1
        t = rows.get(tid)
        if t is None:
            mm.append(f"[{label}] switch entry {tid} has no transaction row"); continue
        low = (t.raw_description or "").lower()
        if "merger" in low or "face value" in low:
            mm.append(f"[{label}] switch entry {tid} ({_tname(t)}) is a conversion: {t.raw_description!r}")
    n += 1  # the aggregate-count identity: entries listed == switch legs in yearly too
    ym = sum(1 for b in d["yearly"] for e in b["entries"] if e["direction"] in ("switched_in", "switched_out"))
    if ym != len(tids):
        mm.append(f"[{label}] yearly switch entries {ym} != monthly {len(tids)}")
    return {"checked": n, "mismatches": mm, "switch_entries": len(tids)}


def march_2023_withdrawn(label, ids, d, db):
    """Check 5 (r2 only): the house down-payment redemptions land in 2023-03."""
    b = next((x for x in d["monthly"] if x["period"] == "2023-03"), None)
    if b is None:
        return {"checked": 1, "mismatches": [f"[{label}] no 2023-03 monthly bucket"]}
    ok = D(b["withdrawn"]) > 0
    return {"checked": 1, "mismatches": [] if ok else [f"[{label}] 2023-03 withdrawn is {b['withdrawn']}"],
            "march_2023_withdrawn": b["withdrawn"]}


def switch_count_check(label, ids, d, db):
    """Check 6: switch_count == max(SWITCH_IN legs, SWITCH_OUT legs), conversions excluded."""
    legs_in = legs_out = 0
    for t in _txns(db, ids):
        if _is_conversion(t.raw_description):
            continue
        tn = _tname(t)
        legs_in += tn == "SWITCH_IN"
        legs_out += tn == "SWITCH_OUT"
    exp = max(legs_in, legs_out)
    got = d.get("switch_count")
    mm = [] if got == exp else [f"[{label}] switch_count {got} != max(in {legs_in}, out {legs_out}) = {exp}"]
    return {"checked": 1, "mismatches": mm, "legs_in": legs_in, "legs_out": legs_out, "switch_count": got}


def independent_totals(label, ids, d, db):
    """Extra: rebuild invested/withdrawn straight from transaction rows."""
    inv = wd = op = D(0)
    for t in _txns(db, ids):
        tn = _tname(t)
        paid = D(t.amount) + D(t.stamp_duty or 0)
        if tn == "OPENING_BALANCE":
            op += paid
        elif tn in ("PURCHASE", "PURCHASE_SIP"):
            inv += paid
        elif tn == "REVERSAL":
            inv -= paid
        elif tn in ("REDEMPTION", "DIVIDEND_PAYOUT"):
            wd += paid
    mm = []
    if not _close(D(d["total_invested"]), inv + op):
        mm.append(f"[{label}] total_invested {d['total_invested']} != rows {inv + op}")
    if not _close(D(d["total_withdrawn"]), wd):
        mm.append(f"[{label}] total_withdrawn {d['total_withdrawn']} != rows {wd}")
    if not _close(D(d.get("opening_holdings", "0")), op):
        mm.append(f"[{label}] opening_holdings {d.get('opening_holdings')} != rows {op}")
    return {"checked": 3, "mismatches": mm}


GROUPS = {
    "totals": reconcile_totals,
    "no_conversion_switches": no_conversion_switches,
    "switch_count": switch_count_check,
    "independent_totals": independent_totals,
}


def run_all(db, scopes, march_2023=False):
    """scopes: {label: (member_ids, section_data)}. Returns {group: {checked, mismatches, detail}}."""
    out = {}
    groups = dict(GROUPS)
    if march_2023:
        groups["march_2023_withdrawn"] = march_2023_withdrawn
    for g, fn in groups.items():
        res = {"checked": 0, "mismatches": [], "detail": {}}
        for label, (ids, d) in scopes.items():
            r = fn(label, ids, d, db)
            res["checked"] += r["checked"]
            res["mismatches"] += r["mismatches"]
            res["detail"][label] = {k: v for k, v in r.items() if k not in ("checked", "mismatches")}
        out[g] = res
    return out
