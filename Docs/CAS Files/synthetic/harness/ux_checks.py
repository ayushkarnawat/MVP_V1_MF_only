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


# --------------------------------------------------------------------------
# History month-detail reconciliation. Truth is rebuilt from transaction rows,
# stored PortfolioSnapshot rows and NavHistory; the detail function's own sums are
# only the thing under test. `direction_for` (the app's classifier) is the one
# shared piece of app code, as agreed.
# --------------------------------------------------------------------------
_HIST_CACHE = {}
_ADD_TYPES = {"PURCHASE", "PURCHASE_SIP", "SWITCH_IN", "DIVIDEND_REINVEST", "OPENING_BALANCE",
              "GIFT_IN", "BONUS", "SEGREGATION"}
_SUB_TYPES = {"REDEMPTION", "SWITCH_OUT", "GIFT_OUT", "REVERSAL"}


def _paid(t):
    return D(t.amount) + D(t.stamp_duty or 0)


def _snapshots(db, ids):
    from app.models.snapshot import PortfolioSnapshot
    return db.query(PortfolioSnapshot).filter(PortfolioSnapshot.household_member_id.in_(ids)).all()


def _history_details(db, ids):
    """[(month, MonthDetail)] for every snapshot month of the scope, memoised."""
    import asyncio
    from app.services.dashboard.snapshots import get_month_detail
    key = tuple(sorted(str(i) for i in ids))
    if key not in _HIST_CACHE:
        months = sorted({r.snapshot_month for r in _snapshots(db, ids)})
        _HIST_CACHE[key] = [(m, asyncio.run(get_month_detail(db, list(ids), m))) for m in months]
    return _HIST_CACHE[key]


def history_identity(label, ids, d, db):
    """(1) change = new_money + opening + switches + gifts + market movement; None when partial."""
    mm, n = [], 0
    dets = _history_details(db, ids)
    for m, det in dets:
        n += 1
        if det is None:
            mm.append(f"[{label}] {m}: get_month_detail returned None for a snapshot month"); continue
        if det.is_partial:
            if det.change is not None or det.market_movement is not None:
                mm.append(f"[{label}] {m}: partial but change={det.change} market_movement={det.market_movement}")
            continue
        if det.change is None or det.market_movement is None:
            mm.append(f"[{label}] {m}: not partial but change={det.change} market_movement={det.market_movement}"); continue
        rhs = D(det.new_money) + D(det.opening_holdings) + D(det.switches_net) + D(det.gifts_net) + D(det.market_movement)
        if not _close(det.change, rhs):
            mm.append(f"[{label}] {m}: change {det.change} != new {det.new_money} + opening {det.opening_holdings} "
                      f"+ switches {det.switches_net} + gifts {det.gifts_net} + market {det.market_movement} = {rhs}")
    return {"checked": n, "mismatches": mm, "months": len(dets),
            "partial_months": [str(m) for m, x in dets if x is not None and x.is_partial]}


def history_values(label, ids, d, db):
    """(2) sum of priced fund-row values == stored snapshot total (summed over members)."""
    mm, n = [], 0
    snap = {}
    for r in _snapshots(db, ids):
        snap[r.snapshot_month] = snap.get(r.snapshot_month, D(0)) + D(r.total_value)
    for m, det in _history_details(db, ids):
        n += 1
        if det is None:
            continue
        rows = sum((D(f.value) for f in det.funds if f.priced and f.value is not None), D(0))
        if not _close(rows, snap.get(m, D(0))):
            mm.append(f"[{label}] {m}: sum fund values {rows} != stored snapshot total {snap.get(m, D(0))}")
        n += 1
        if not _close(det.total_value, snap.get(m, D(0))):
            mm.append(f"[{label}] {m}: detail total_value {det.total_value} != stored snapshot total {snap.get(m, D(0))}")
    return {"checked": n, "mismatches": mm}


def history_switch_totals(label, ids, d, db):
    """(3) over all months sum(switches_net) == sum(in) - sum(out); 0.00 when every switch leg is matched."""
    from app.services.analytics.investment_withdrawal import direction_for
    from app.services.dashboard.snapshots import last_completed_month_end
    mm, n = [], 0
    dets = [(m, x) for m, x in _history_details(db, ids) if x is not None]
    net = sum((D(x.switches_net) for _, x in dets), D(0))
    s_in = sum((D(x.switched_in) for _, x in dets), D(0))
    s_out = sum((D(x.switched_out) for _, x in dets), D(0))
    n += 1
    if not _close(net, s_in - s_out):
        mm.append(f"[{label}] sum(switches_net) {net} != sum(in) {s_in} - sum(out) {s_out}")
    end = last_completed_month_end()
    by_date = {}
    row_in = row_out = D(0)
    for t in _txns(db, ids):
        if t.date > end:
            continue
        dr = direction_for(t)
        if dr not in ("switched_in", "switched_out"):
            continue
        slot = by_date.setdefault(t.date, ([], []))
        (slot[0] if dr == "switched_in" else slot[1]).append(_paid(t))
        if dr == "switched_in":
            row_in += _paid(t)
        else:
            row_out += _paid(t)
    n += 2
    if not _close(s_in, row_in):
        mm.append(f"[{label}] sum(switched_in) {s_in} != switch-in rows {row_in}")
    if not _close(s_out, row_out):
        mm.append(f"[{label}] sum(switched_out) {s_out} != switch-out rows {row_out}")
    unmatched = [str(day) for day, (a, b) in by_date.items() if sorted(a) != sorted(b)]
    n += 1
    if not unmatched and not _close(net, 0):
        mm.append(f"[{label}] every switch leg matched but sum(switches_net) = {net}, expected 0.00")
    return {"checked": n, "mismatches": mm, "switch_net_total": str(net), "switch_in": str(s_in), "switch_out": str(s_out),
            "unmatched_dates": unmatched, "switch_dates": len(by_date)}


def history_net_invested(label, ids, d, db):
    """(4) sum(new_money) + sum(opening_holdings) == the I&W section's net_invested. Exact gap is reported."""
    dets = [x for _, x in _history_details(db, ids) if x is not None]
    new = sum((D(x.new_money) for x in dets), D(0))
    op = sum((D(x.opening_holdings) for x in dets), D(0))
    net = D(d["net_invested"])
    gap = new + op - net
    mm = [] if _close(new + op, net) else [
        f"[{label}] sum(new_money) {new} + sum(opening) {op} = {new + op} != net_invested {net} (gap {gap})"]
    return {"checked": 1, "mismatches": mm, "sum_new_money": str(new), "sum_opening": str(op), "net_invested": str(net), "gap": str(gap)}


def history_components(label, ids, d, db):
    """Extra: per-month new_money / opening / gifts / switches rebuilt from rows == the detail's totals."""
    from app.services.analytics.investment_withdrawal import direction_for
    mm, n = [], 0
    per = {}
    for t in _txns(db, ids):
        m = _month_end(t.date)
        c = per.setdefault(m, dict(new=D(0), op=D(0), gift=D(0), sin=D(0), sout=D(0)))
        dr, tn, p = direction_for(t), _tname(t), _paid(t)
        if dr == "invested":
            c["new"] += p
        elif dr in ("withdrawn", "reversal"):
            c["new"] -= p
        elif dr == "opening":
            c["op"] += p
        elif dr == "switched_in":
            c["sin"] += p
        elif dr == "switched_out":
            c["sout"] += p
        elif tn == "GIFT_IN":
            c["gift"] += p
        elif tn == "GIFT_OUT":
            c["gift"] -= p
    zero = dict(new=D(0), op=D(0), gift=D(0), sin=D(0), sout=D(0))
    for m, det in _history_details(db, ids):
        if det is None:
            continue
        c = per.get(m, zero)
        for name, got, exp in (("new_money", det.new_money, c["new"]), ("opening", det.opening_holdings, c["op"]),
                               ("gifts", det.gifts_net, c["gift"]), ("switched_in", det.switched_in, c["sin"]),
                               ("switched_out", det.switched_out, c["sout"])):
            n += 1
            if not _close(got, exp):
                mm.append(f"[{label}] {m}: {name} {got} != rows {exp}")
    return {"checked": n, "mismatches": mm}


def history_unpriced(label, ids, d, db):
    """(5) Contract: `priced=false` funds == funds held at month-end with no NAV on or before it; and
    `missing_scheme_names` == those PLUS funds held at the previous month-end that had no price there
    (no comparable change: priced now, or sold out in the month). `is_partial` == (that set is non-empty).
    Truth: NavHistory + row-built units, not the function under test."""
    from app.models.folio import Folio
    from app.models.reference import NavHistory, Scheme
    folios = {f.id: f for f in db.query(Folio).filter(Folio.household_member_id.in_(ids)).all()}
    deltas = {}
    for t in _txns(db, ids):
        tn = _tname(t)
        sign = 1 if tn in _ADD_TYPES else -1 if tn in _SUB_TYPES else 0
        if sign:
            deltas.setdefault(t.folio_id, []).append((t.date, sign * D(t.units)))
    sids = {f.scheme_id for f in folios.values()}
    names = {s.id: s.name for s in db.query(Scheme).filter(Scheme.id.in_(sids)).all()} if sids else {}
    first_nav = {}
    for sid, dt in db.query(NavHistory.scheme_id, NavHistory.date).filter(NavHistory.scheme_id.in_(sids), NavHistory.nav >= 0).order_by(NavHistory.date).all():
        first_nav.setdefault(sid, dt)

    def held(m):
        units = {}
        for fid, items in deltas.items():
            u = sum((x for dt, x in items if dt <= m), D(0))
            if u > 0:
                units[folios[fid].scheme_id] = units.get(folios[fid].scheme_id, D(0)) + u
        return units

    def unpriced(s, m):
        return first_nav.get(s) is None or first_nav[s] > m

    mm, n = [], 0
    previous_units, previous_month = {}, None
    for m, det in _history_details(db, ids):
        if det is None:
            continue
        units = held(m)
        expected = {names[s] for s in units if unpriced(s, m)}
        # A fund held at the previous month-end without a price has no comparable change this month,
        # whether it is still held, priced now, or was sold out in the month.
        uncomparable = {names[s] for s in previous_units if previous_month is not None and unpriced(s, previous_month)} - expected
        expected_missing = expected | uncomparable
        n += 3
        priced_false = {f.scheme_name for f in det.funds if not f.priced}
        if priced_false != expected:
            mm.append(f"[{label}] {m}: priced=false funds {sorted(priced_false)} != expected unpriced {sorted(expected)}")
        if set(det.missing_scheme_names) != expected_missing:
            mm.append(f"[{label}] {m}: missing_scheme_names {sorted(det.missing_scheme_names)} != expected {sorted(expected_missing)} (unpriced now {sorted(expected)} + no comparable previous price {sorted(uncomparable)})")
        if bool(det.is_partial) != bool(expected_missing):
            mm.append(f"[{label}] {m}: is_partial={det.is_partial} but expected {bool(expected_missing)}")
        previous_units, previous_month = units, m
    return {"checked": n, "mismatches": mm}


def history_previous(label, ids, d, db):
    """(6) first month: previous None / 0.00; later: previous_month is the preceding month-end (and value matches the stored snapshots)."""
    mm, n = [], 0
    snap = {}
    for r in _snapshots(db, ids):
        snap[r.snapshot_month] = snap.get(r.snapshot_month, D(0)) + D(r.total_value)
    dets = [(m, x) for m, x in _history_details(db, ids) if x is not None]
    for i, (m, det) in enumerate(dets):
        n += 1
        if i == 0:
            if det.previous_month is not None or D(det.previous_value) != 0:
                mm.append(f"[{label}] first month {m}: previous_month {det.previous_month} previous_value {det.previous_value}")
            continue
        prev = dets[i - 1][0]
        if det.previous_month != prev:
            mm.append(f"[{label}] {m}: previous_month {det.previous_month} != preceding month-end {prev}")
        n += 1
        if not _close(det.previous_value, snap.get(prev, D(0))):
            mm.append(f"[{label}] {m}: previous_value {det.previous_value} != stored snapshot total of {prev} = {snap.get(prev, D(0))}")
    return {"checked": n, "mismatches": mm}


def _month_end(day):
    import calendar
    return day.replace(day=calendar.monthrange(day.year, day.month)[1])


GROUPS = {
    "totals": reconcile_totals,
    "no_conversion_switches": no_conversion_switches,
    "switch_count": switch_count_check,
    "independent_totals": independent_totals,
    "history_identity": history_identity,
    "history_values": history_values,
    "history_switch_totals": history_switch_totals,
    "history_net_invested": history_net_invested,
    "history_components": history_components,
    "history_unpriced": history_unpriced,
    "history_previous": history_previous,
}


def run_all(db, scopes, march_2023=False, history=False):
    """scopes: {label: (member_ids, section_data)}. Returns {group: {checked, mismatches, detail}}.
    History groups (name starts "history_") only run when history=True, and only those run then."""
    out = {}
    groups = {g: fn for g, fn in GROUPS.items() if g.startswith("history_") == bool(history)}
    if march_2023 and not history:
        groups["march_2023_withdrawn"] = march_2023_withdrawn
    _HIST_CACHE.clear()
    for g, fn in groups.items():
        res = {"checked": 0, "mismatches": [], "detail": {}}
        for label, (ids, d) in scopes.items():
            r = fn(label, ids, d, db)
            res["checked"] += r["checked"]
            res["mismatches"] += r["mismatches"]
            res["detail"][label] = {k: v for k, v in r.items() if k not in ("checked", "mismatches")}
        out[g] = res
    return out
