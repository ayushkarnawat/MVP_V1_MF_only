"""Sub-project 2 (look-through) value checks: truth rebuilt independently from the
same DB tables the app reads (scheme_holdings/disclosure_batches/market_cap_
classifications/stock_master/benchmark_index_history), not from calling the app's
own compute functions. Mirrors the shape of test_deep.py's a04/a09/a14 checks.

Business rules replicated here are read straight from the five compute modules
(lookthrough.py, cap_allocation.py, asset_allocation_lookthrough.py, overlap.py,
valuation.py) as of 2026-10-15 -- if those modules change, re-check this file too.
"""
from __future__ import annotations

import uuid
from collections import defaultdict
from datetime import date
from decimal import Decimal as D
from itertools import combinations

TOL = D("0.05")  # rounding tolerance: Decimal division order differs truth vs app
PCT_TOL = D("0.05")


def _close(a, b, tol=TOL):
    return abs(D(a) - D(b)) <= tol


def _close_sum(a, b, bps=D("2")):
    """For a sum of many independently-rounded rows (hundreds of thousands of
    scheme_holdings), a flat rupee tolerance is too strict -- cumulative Decimal
    rounding drift scales with row count. Use a relative tolerance instead:
    `bps` basis points of the larger side (default 2bps = 0.02%)."""
    a, b = D(a), D(b)
    return abs(a - b) <= max(a, b) * bps / D(10000)


def lookthrough_truth(db, per_member):
    """Independent rebuild of compute_disclosure_scope + build_lookthrough_table:
    for each held scheme, pick the newest WRITTEN batch no newer than that scheme's
    own current NAV date, then value = scheme_value * pct_to_nav / 100 per row,
    grouped by ISIN (or a per-row key when ISIN is NULL)."""
    from app.models.enums import AssetType, DisclosureBatchStatus
    from app.models.reference import DisclosureBatch, Scheme, SchemeHolding

    EXCLUDED = {AssetType.DERIVATIVE, AssetType.OTHER}
    EQUITY = {AssetType.EQUITY_DOMESTIC, AssetType.EQUITY_INTERNATIONAL}

    values, nav_dates = defaultdict(lambda: D(0)), {}
    for pm in per_member.values():
        for r in pm["holdings"].get("holdings", []):
            sid = r["scheme_id"]
            if r.get("current_value") is not None:
                values[sid] += D(r["current_value"])
                if r.get("current_nav_date"):
                    nd = date.fromisoformat(r["current_nav_date"])
                    nav_dates[sid] = min(nav_dates.get(sid, nd), nd)
    total = sum(values.values(), D(0))
    sch = {str(s.id): s for s in db.query(Scheme).filter(Scheme.id.in_([uuid.UUID(s) for s in values])).all()} if values else {}
    amcs = {s.amc_name for s in sch.values()}
    batches = db.query(DisclosureBatch).filter(
        DisclosureBatch.status == DisclosureBatchStatus.WRITTEN,
        DisclosureBatch.amc_name.in_(amcs),
    ).order_by(DisclosureBatch.as_of_date.desc()).all() if amcs else []
    selected = {}
    for b in batches:
        sid = str(b.scheme_id)
        cutoff = nav_dates.get(sid)
        if cutoff is not None and b.as_of_date <= cutoff and sid not in selected:
            selected[sid] = b
    by_batch = {b.id: sid for sid, b in selected.items()}
    raw_rows = db.query(SchemeHolding).filter(SchemeHolding.batch_id.in_(by_batch)).all() if by_batch else []

    rows = defaultdict(lambda: {"instrument_name": None, "sector_raw": None, "asset_type": None,
                                 "value": D(0), "by_scheme": defaultdict(lambda: D(0)), "_max": D(-1)})
    excluded_value, non_equity_value = D(0), D(0)
    per_scheme_rows = defaultdict(list)  # sid -> list of raw rows, for overlap truth
    for row in raw_rows:
        sid = by_batch[row.batch_id]
        value = values[sid] * row.pct_to_nav / D(100)
        per_scheme_rows[sid].append(row)
        if row.asset_type not in EQUITY and row.asset_type not in EXCLUDED:
            non_equity_value += value
        if row.asset_type in EXCLUDED:
            excluded_value += value
            continue
        key = row.isin if row.isin is not None else f"__row_{row.id}"
        g = rows[key]
        g["value"] += value
        g["by_scheme"][sid] += row.pct_to_nav
        if value > g["_max"]:
            g["instrument_name"], g["sector_raw"], g["asset_type"], g["_max"] = (
                row.instrument_name, row.sector_raw, row.asset_type, value)
    covered = sum((values[sid] for sid in selected), D(0))
    holdings_as_of = min((b.as_of_date for b in selected.values()), default=None)
    nav_as_of = min(nav_dates.values(), default=None)
    return {
        "values": dict(values), "total": total, "covered": covered, "sch": sch,
        "selected": selected, "by_batch": by_batch, "rows": dict(rows),
        "per_scheme_rows": dict(per_scheme_rows),
        "excluded_value": excluded_value, "non_equity_value": non_equity_value,
        "holdings_as_of": holdings_as_of, "nav_as_of": nav_as_of,
        "equity_types": EQUITY,
    }


def common_invariants_checks(body):
    """The banner numbers (excluded_share, nav_as_of, holdings_as_of, total_portfolio_value,
    coverage.covered_value_pct) must be identical across all 5 sections -- a real bug class
    already found and fixed once in the 2026-10-14 review (DEFERRED_FEATURES.md)."""
    mm = []
    sections = body.get("sections") or {}
    names = ("stock_holdings", "cap_allocation", "overlap", "valuation")  # asset_allocation excluded: own denominator note
    payloads = {}
    for name in names:
        p = ((sections.get(name) or {}).get("payload") or {}).get(name)
        if p is None:
            return {"mismatches": [f"{name} section missing or empty"]}
        payloads[name] = p
    for field in ("excluded_share", "total_portfolio_value", "nav_as_of", "holdings_as_of"):
        values = {name: p[field] for name, p in payloads.items()}
        if len(set(values.values())) > 1:
            mm.append(f"{field} differs across sections: {values}")
    cov = {name: p["coverage"]["covered_value_pct"] for name, p in payloads.items()}
    if len(set(cov.values())) > 1:
        mm.append(f"coverage.covered_value_pct differs across sections: {cov}")
    return {"mismatches": mm}


def a06_checks(body, truth):
    """Attribute 06 (stock holdings)."""
    mm = []
    payload = ((body.get("sections") or {}).get("stock_holdings") or {}).get("payload") or {}
    s = payload.get("stock_holdings")
    if not s:
        return {"mismatches": ["stock_holdings section missing or empty"]}
    equity_truth = {k: v for k, v in truth["rows"].items() if v["asset_type"] in truth["equity_types"]}
    if s["total_stock_count"] != len(equity_truth):
        mm.append(f"total_stock_count {s['total_stock_count']} != truth {len(equity_truth)}")
    total = truth["total"]
    if total and not _close(s["excluded_share"], truth["excluded_value"] / total * 100, PCT_TOL):
        mm.append(f"excluded_share {s['excluded_share']} != truth {truth['excluded_value'] / total * 100}")
    if total and not _close(s["non_equity_share"], truth["non_equity_value"] / total * 100, PCT_TOL):
        mm.append(f"non_equity_share {s['non_equity_share']} != truth {truth['non_equity_value'] / total * 100}")
    rows = s["rows"]
    pcts = [D(r["exposure_pct"]) for r in rows]
    if pcts != sorted(pcts, reverse=True):
        mm.append("rows not sorted by exposure_pct desc")
    for r in rows:
        if r["isin"] is None:
            continue
        t = equity_truth.get(r["isin"])
        if t is None:
            mm.append(f"{r['isin']}: row in payload but not in truth (non-equity in truth or missing batch)")
            continue
        if not _close(r["exposure_value"], t["value"]):
            mm.append(f"{r['isin']}: exposure_value {r['exposure_value']} != truth {t['value']}")
        if total and not _close(r["exposure_pct"], t["value"] / total * 100, PCT_TOL):
            mm.append(f"{r['isin']}: exposure_pct {r['exposure_pct']} != truth {t['value'] / total * 100}")
        got_by_scheme = {c["scheme_id"]: D(c["stock_weight_pct"]) for c in r["contributing_funds"]}
        want_by_scheme = {sid: w for sid, w in t["by_scheme"].items()}
        if set(got_by_scheme) != set(want_by_scheme):
            mm.append(f"{r['isin']}: contributing funds {sorted(got_by_scheme)} != truth {sorted(want_by_scheme)}")
        for sid, w in want_by_scheme.items():
            if sid in got_by_scheme and not _close(got_by_scheme[sid], w, PCT_TOL):
                mm.append(f"{r['isin']}/{sid[:8]}: stock_weight_pct {got_by_scheme[sid]} != truth {w}")
    return {"mismatches": mm, "rows_checked": sum(1 for r in rows if r["isin"]), "truth_equity_count": len(equity_truth)}


def a02_checks(db, body, truth):
    """Attribute 02 (cap allocation)."""
    from app.models.reference import MarketCapClassification
    mm = []
    payload = ((body.get("sections") or {}).get("cap_allocation") or {}).get("payload") or {}
    s = payload.get("cap_allocation")
    if not s:
        return {"mismatches": ["cap_allocation section missing or empty"]}
    equity_truth = {k: v for k, v in truth["rows"].items() if v["asset_type"] in truth["equity_types"]}
    non_equity_value = sum((v["value"] for v in truth["rows"].values() if v["asset_type"] not in truth["equity_types"]), D(0))
    equity_value = sum((v["value"] for v in equity_truth.values()), D(0))
    isins = {k for k in equity_truth if not str(k).startswith("__row_")}
    holdings_as_of = truth["holdings_as_of"]
    classes = db.query(MarketCapClassification).filter(
        MarketCapClassification.isin.in_(isins),
        MarketCapClassification.effective_date <= holdings_as_of,
    ).order_by(MarketCapClassification.effective_date.desc()).all() if isins and holdings_as_of else []
    by_isin = {}
    for c in classes:
        by_isin.setdefault(c.isin, c)
    bucket_values = defaultdict(lambda: D(0))
    for isin, row in equity_truth.items():
        c = by_isin.get(isin) if not str(isin).startswith("__row_") else None
        bucket_values[c.bucket.value if c else "OTHER"] += row["value"]
    total = truth["total"]
    if total and not _close(s["total_portfolio_value"], total):
        mm.append(f"total_portfolio_value {s['total_portfolio_value']} != truth {total}")
    if not _close(s["total_equity_value"], equity_value):
        mm.append(f"total_equity_value {s['total_equity_value']} != truth {equity_value}")
    for b in s["buckets"]:
        key = b["key"]
        expected = bucket_values.get(key, D(0)) + (non_equity_value if key == "OTHER" else D(0))
        if not _close(b["value"], expected):
            mm.append(f"bucket {key}: value {b['value']} != truth {expected}")
        if total and not _close(b["percentage_total"], expected / total * 100, PCT_TOL):
            mm.append(f"bucket {key}: percentage_total {b['percentage_total']} != truth {expected / total * 100}")
    # Derivative/other rows never enter table.rows (lookthrough.py excludes them before
    # grouping), so the buckets only ever sum to covered-minus-excluded, never to the
    # full total_portfolio_value.
    coverable = truth["covered"] - truth["excluded_value"]
    buckets_sum = sum(D(b["value"]) for b in s["buckets"])
    if not _close_sum(buckets_sum, coverable):
        mm.append(f"buckets don't sum to covered-minus-excluded: {buckets_sum} != {coverable}")
    return {"mismatches": mm, "isins_classified": len(by_isin), "isins_total": len(isins)}


def a13_checks(db, body, truth):
    """Attribute 13 (look-through asset allocation)."""
    mm = []
    payload = ((body.get("sections") or {}).get("asset_allocation") or {}).get("payload") or {}
    s = payload.get("asset_allocation")
    if not s:
        return {"mismatches": ["asset_allocation section missing or empty"]}
    from app.models.enums import AssetType
    class_map = {
        AssetType.EQUITY_DOMESTIC: "equity", AssetType.EQUITY_INTERNATIONAL: "equity",
        AssetType.REIT_INVIT: "equity", AssetType.DEBT: "debt",
        AssetType.GOLD_SILVER: "gold", AssetType.CASH_EQUIVALENT: "cash_like",
        AssetType.DERIVATIVE: None, AssetType.OTHER: None,
    }
    arbitrage_sids = {sid for sid, sch in truth["sch"].items()
                      if sid in truth["selected"] and sch.sebi_category == "Arbitrage Fund"}

    def variant_truth(as_cash):
        amounts = defaultdict(lambda: D(0))
        for sid, rows in truth["per_scheme_rows"].items():
            if as_cash and sid in arbitrage_sids:
                continue
            for row in rows:
                key = class_map.get(row.asset_type)
                if key:
                    amounts[key] += truth["values"][sid] * row.pct_to_nav / 100
        if as_cash:
            amounts["cash_like"] += sum((truth["values"][sid] for sid in arbitrage_sids), D(0))
        return amounts

    covered = truth["covered"]
    # Same exclusion as cap_allocation: ASSET_CLASS_MAP sends DERIVATIVE/OTHER to None,
    # so those rows' value never lands in any class -- classes sum to covered minus
    # whatever was excluded, not to covered itself. (Moot for the arbitrage_as_cash
    # variant on a household with no arbitrage funds, since the app just reuses
    # as_disclosed then -- the loop below already skips that variant in that case.)
    coverable = covered - truth["excluded_value"]
    for variant_name, as_cash in (("as_disclosed", False), ("arbitrage_as_cash", True)):
        if variant_name == "arbitrage_as_cash" and not arbitrage_sids:
            continue  # app reuses as_disclosed when no arbitrage funds held
        v = s[variant_name]
        want = variant_truth(as_cash)
        for c in v["classes"]:
            expected = want.get(c["key"], D(0))
            if not _close(c["value"], expected):
                mm.append(f"{variant_name}/{c['key']}: value {c['value']} != truth {expected}")
            if covered and not _close(c["percentage"], expected / covered * 100, PCT_TOL):
                mm.append(f"{variant_name}/{c['key']}: percentage {c['percentage']} != truth {expected / covered * 100}")
        classes_sum = sum(D(c["value"]) for c in v["classes"])
        if not _close_sum(classes_sum, coverable):
            mm.append(f"{variant_name}: classes sum {classes_sum} != covered-minus-excluded {coverable}")
    if bool(arbitrage_sids) != (len(s["arbitrage_funds"]) > 0):
        mm.append(f"arbitrage_funds reported {len(s['arbitrage_funds'])} but truth has {len(arbitrage_sids)}")
    return {"mismatches": mm, "arbitrage_funds_truth": len(arbitrage_sids)}


def a10_checks(body, truth):
    """Attribute 10 (fund overlap)."""
    mm = []
    payload = ((body.get("sections") or {}).get("overlap") or {}).get("payload") or {}
    s = payload.get("overlap")
    if not s:
        return {"mismatches": ["overlap section missing or empty"]}
    EQUITY = truth["equity_types"]

    def stock_weights(rows):
        w = {}
        for row in rows:
            if row.asset_type in EQUITY and row.isin is not None:
                _, weight = w.get(row.isin, (row.instrument_name, D(0)))
                w[row.isin] = (row.instrument_name, weight + row.pct_to_nav)
        return w

    weights = {sid: stock_weights(rows) for sid, rows in truth["per_scheme_rows"].items()}
    funds = sorted(truth["selected"].keys(), key=lambda sid: (-truth["values"][sid], sid))
    top = set(funds[:12])
    if s["total_fund_count"] != len(funds):
        mm.append(f"total_fund_count {s['total_fund_count']} != truth {len(funds)}")
    pair_truth = {}
    for a, b in combinations(funds, 2):
        wa, wb = weights.get(a, {}), weights.get(b, {})
        common = wa.keys() & wb.keys()
        overlap_pct = sum((min(wa[isin][1], wb[isin][1]) for isin in common), D(0))
        pair_truth[frozenset((a, b))] = (overlap_pct, len(common))
    for pair in s["matrix"]:
        key = frozenset((pair["fund_a"]["scheme_id"], pair["fund_b"]["scheme_id"]))
        t = pair_truth.get(key)
        if t is None:
            mm.append(f"matrix pair {key} not among truth's held-fund pairs")
            continue
        if not _close(pair["overlap_pct"], t[0], PCT_TOL):
            mm.append(f"pair {key}: overlap_pct {pair['overlap_pct']} != truth {t[0]}")
        if pair["common_total"] != t[1]:
            mm.append(f"pair {key}: common_total {pair['common_total']} != truth {t[1]}")
    for pair in s["pairs_above_low"]:
        key = frozenset((pair["fund_a"]["scheme_id"], pair["fund_b"]["scheme_id"]))
        t = pair_truth.get(key)
        if t is None or t[0] <= D(s["bands"]["low"]):
            mm.append(f"pair {key} listed above_low but truth overlap {t[0] if t else 'missing'} <= {s['bands']['low']}")
    above_count_truth = sum(1 for pct, _ in pair_truth.values() if pct > D(s["bands"]["low"]))
    if len(s["pairs_above_low"]) != above_count_truth:
        mm.append(f"pairs_above_low count {len(s['pairs_above_low'])} != truth {above_count_truth}")
    return {"mismatches": mm, "pairs_checked": len(s["matrix"]), "funds": len(funds)}


def a15_checks(db, body, truth):
    """Attribute 15 (valuation: portfolio P/E, P/B vs Nifty 50/500)."""
    from app.models.enums import BenchmarkIndex, BenchmarkReturnType
    from app.models.reference import BenchmarkIndexHistory, StockMaster
    mm = []
    payload = ((body.get("sections") or {}).get("valuation") or {}).get("payload") or {}
    s = payload.get("valuation")
    if not s:
        return {"mismatches": ["valuation section missing or empty"]}
    equity_truth = {k: v for k, v in truth["rows"].items() if v["asset_type"] in truth["equity_types"]}
    total_equity = sum((v["value"] for v in equity_truth.values()), D(0))
    isins = {k for k in equity_truth if not str(k).startswith("__row_")}
    master = {m.isin: m for m in db.query(StockMaster).filter(StockMaster.isin.in_(isins)).all()} if isins else {}

    def metric_truth(field):
        covered, inverse = D(0), D(0)
        for isin, row in equity_truth.items():
            m = master.get(isin) if not str(isin).startswith("__row_") else None
            ratio = getattr(m, field, None) if m else None
            if ratio is not None and ratio.is_finite() and ratio > 0:
                covered += row["value"]
                inverse += row["value"] / ratio
        fraction = covered / total_equity if total_equity else D(0)
        enough = bool(total_equity and fraction >= D("0.70") and inverse > 0)
        ratio = (covered / inverse) if enough else None
        return fraction * 100, enough, ratio

    for field, key in (("pe_ratio", "pe"), ("pb_ratio", "pb")):
        fraction, enough, ratio = metric_truth(field)
        m = s[key]
        if not _close(m["coverage_pct"], fraction, PCT_TOL):
            mm.append(f"{key}.coverage_pct {m['coverage_pct']} != truth {fraction}")
        if m["enough_data"] != enough:
            mm.append(f"{key}.enough_data {m['enough_data']} != truth {enough}")
        if enough:
            if m["ratio"] is None or not _close(m["ratio"], ratio, D("0.01")):
                mm.append(f"{key}.ratio {m['ratio']} != truth {ratio}")
        elif m["ratio"] is not None:
            mm.append(f"{key}.ratio {m['ratio']} but truth says not enough data")
    nav_as_of = truth["nav_as_of"]
    rows = db.query(BenchmarkIndexHistory).filter(
        BenchmarkIndexHistory.index_name.in_((BenchmarkIndex.NIFTY_50, BenchmarkIndex.NIFTY_500)),
        BenchmarkIndexHistory.return_type.in_((BenchmarkReturnType.PE, BenchmarkReturnType.PB)),
        BenchmarkIndexHistory.date <= nav_as_of,
    ).order_by(BenchmarkIndexHistory.date.desc()).all() if nav_as_of else []
    latest = {}
    for row in rows:
        latest.setdefault((row.index_name.value, row.return_type.value), row)
    for idx in s["indices"]:
        pe_row, pb_row = latest.get((idx["index_name"], "pe")), latest.get((idx["index_name"], "pb"))
        if (idx["pe_ratio"] is None) != (pe_row is None):
            mm.append(f"{idx['index_name']}: pe_ratio presence mismatch (app {idx['pe_ratio']}, truth row {pe_row})")
        elif pe_row and not _close(idx["pe_ratio"], pe_row.value, D("0.01")):
            mm.append(f"{idx['index_name']}: pe_ratio {idx['pe_ratio']} != truth {pe_row.value}")
        if (idx["pb_ratio"] is None) != (pb_row is None):
            mm.append(f"{idx['index_name']}: pb_ratio presence mismatch (app {idx['pb_ratio']}, truth row {pb_row})")
        elif pb_row and not _close(idx["pb_ratio"], pb_row.value, D("0.01")):
            mm.append(f"{idx['index_name']}: pb_ratio {idx['pb_ratio']} != truth {pb_row.value}")
    return {"mismatches": mm, "stock_master_matched": len(master), "isins_total": len(isins)}
