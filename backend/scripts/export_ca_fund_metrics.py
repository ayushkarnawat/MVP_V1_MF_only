"""Read-only export of five figures per mutual fund, for the chartered accountant's check (CA Excel, Phase 3).

    python scripts/export_ca_fund_metrics.py --scheme-id <uuid> [--scheme-id <uuid> ...]
        [--name "<exact scheme name>" ...] [--holdings-as-of 2026-09-30] [--export-date YYYY-MM-DD]

On the staging VM (read-only, inside the backend container):

    docker compose run --rm -T backend python scripts/export_ca_fund_metrics.py --scheme-id <uuid> ...

Prints ONE JSON object on stdout: {"export_date", "holdings_as_of_requested", "notes", "funds": [...]}.
Per fund: identity; the disclosure batch used; large/mid/small allocation; top 10 holdings; P/E and P/B;
category average comparison (1, 3, 5 years); performance ranking.

There is no formula in this file. Every figure comes from the function the product screen uses:
  allocation, top 10   app/services/fund_page/composition.py (_market_cap_allocation, _sorted, sector_for)
  P/E and P/B          app/services/analytics/valuation.py (fund_valuation, the per-fund core of compute_valuation)
  category comparison  app/services/analytics/category_ranking.py (load_category_pool, category_rank_row)
  ranking              app/services/analytics/performance_ranking.py (load_ranking_pools, apply_ranks)
The only difference from the screens is which disclosure batch is read: the one whose as-of date equals
--holdings-as-of (default 2026-09-30), never "the latest". If a fund has no written batch for that date the
output says so and no other date is tried.

Everything numeric is a string with the Decimal's natural precision (counts and ranks are integers); dates are
ISO strings. Returns are fractions per year (0.10 means 10% a year). No user, household, folio, account or
member data is read or printed.

Read-only: any INSERT/UPDATE/DELETE/DDL statement and any ORM flush aborts the run (exit code 2) and nothing is
committed. Two things differ from the live screens so that this holds: the "warm NAV history" step that
downloads missing NAVs is switched off (the NAVs the daily job already stored are used, which is what the screens
use when the daily job is current), and a category peer that is not yet a row in `schemes` aborts the run rather
than being created. The peer list itself comes from AMFI's NAVAll file exactly as the screens read it (a public
download, cached on disk), so the VM needs network access to amfiindia.com unless the cache is fresh.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import re
import sys
import uuid
from datetime import date
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import event, func
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.reference import DisclosureBatch, NavHistory, Scheme, StockMaster
from app.models.enums import DisclosureBatchStatus
from app.services.analytics import category_ranking
from app.services.analytics.cap_allocation import classify_isins
from app.services.analytics.category_ranking import category_rank_row, load_category_pool
from app.services.analytics.performance_ranking import (
    INDEX_FUND_DISCLAIMER_KEY, apply_ranks, is_rankable, load_ranking_pools, new_ranking_row,
)
from app.services.analytics.scheme_universe import canonical_category, is_index_fund
from app.services.analytics.valuation import (
    VALUATION_MIN_COVERAGE, fund_valuation, latest_reported_valuations,
)
from app.services.fund_page.composition import (
    _EQUITY, _market_cap_allocation, _rows, _sorted, _stock_sectors, sector_for,
)
from app.services.fund_page.schemas import plain

DEFAULT_HOLDINGS_AS_OF = date(2026, 9, 30)
NO_BATCH = "no_disclosure_batch_for_this_date"
NOT_WRITTEN = "batch_not_written"

# The screen's own sentence (frontend PerformanceRankingGroup.tsx), repeated here so the Excel can show it.
INDEX_FUND_DISCLAIMER = (
    "Index funds are not ranked here. Their comparison with the index they track is shown in the "
    "benchmark comparison."
)
_RETURN_UNIT = "Compound annual return as a fraction (0.10 means 10% a year), windows ending on the export date's latest NAV."
_AVERAGE_RULE = (
    "Average of the funds in the same category and plan type that have a return for the period, weighted by "
    "each fund's average assets under management (a fund with no size on record is left out of the weighted "
    "figure and counted; if no fund has a size the plain mean is used and the weighting says 'equal')."
)
_FLOOR_RULE = (
    "A fund needs a 3-year return to be compared at all: a fund younger than 3 years is shown without any "
    "period, and only funds with a 3-year return enter the 1, 3 and 5 year averages."
)
_RANK_RULE = (
    "Rank within the category and plan type, separately for each period; ties share a rank (1, 2, 2, 4); "
    "index funds and funds without enough history are not ranked."
)
_ALLOCATION_RULE = (
    "Large, mid and small are percentages of the stocks that have an AMFI market-cap class (they add to 100); "
    "the unclassified share is shown separately, as a percentage of the fund's NAV: the debt, cash and other "
    "lines plus any stock without a class."
)
_VALUATION_METHOD = (
    "Weighted harmonic mean of each stock's ratio, weighted by the stock's share of the fund's equity; stocks "
    "without a usable ratio are left out, and the figure is withheld when they are more than the allowed share."
)


class WriteAttempted(RuntimeError):
    pass


class SelectionError(RuntimeError):
    pass


# ---------------------------------------------------------------------------------------------------------
# Read-only guard
# ---------------------------------------------------------------------------------------------------------

_WRITE_WORDS = re.compile(r"\b(insert|update|delete|merge|drop|alter|create|truncate|grant|revoke|copy)\b", re.I)


def _is_read_only(statement: str) -> bool:
    head = statement.lstrip().upper()
    if head.startswith(("SELECT", "SHOW", "PRAGMA")):
        return True
    # A WITH may carry a data-modifying statement (WITH d AS (DELETE ... RETURNING ...)).
    return head.startswith("WITH") and not _WRITE_WORDS.search(statement)


def install_read_only_guard(db: Session) -> None:
    """Aborts any ORM flush with pending changes and any SQL statement that is not a read."""
    @event.listens_for(db, "before_flush")
    def _no_flush(session, flush_context, instances):
        pending = list(session.new) + list(session.deleted) + [o for o in session.dirty if session.is_modified(o)]
        if pending:
            raise WriteAttempted("a database write (an ORM flush) was about to happen; nothing was committed.")

    @event.listens_for(db.get_bind(), "before_cursor_execute")
    def _no_write_sql(conn, cursor, statement, parameters, context, executemany):
        if not _is_read_only(statement):
            raise WriteAttempted(
                f"a non-read statement ({statement.lstrip()[:12]}...) was about to run; nothing was committed.",
            )


def disable_live_nav_warming() -> None:
    """The comparison and ranking normally top up missing NAVs from the network first (and write them).
    This export reads only the NAVs already stored."""
    async def _no_warm(db, schemes):
        return None

    category_ranking.warm_nav_history = _no_warm


# ---------------------------------------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------------------------------------

def _s(value: Decimal | None) -> str | None:
    return None if value is None else format(value, "f")


def _iso(value: date | None) -> str | None:
    return None if value is None else value.isoformat()


def _plan(scheme: Scheme) -> str | None:
    return scheme.plan_type.value.capitalize() if scheme.plan_type is not None else None


def resolve_schemes(db: Session, scheme_ids: list[uuid.UUID], names: list[str]) -> list[Scheme]:
    """Ids first, then names (exact match), each fund once. Anything unknown or ambiguous is an error."""
    found: list[Scheme] = []
    for sid in scheme_ids:
        scheme = db.get(Scheme, sid)
        if scheme is None:
            raise SelectionError(f"No scheme has the id {sid}.")
        found.append(scheme)
    for name in names:
        matches = db.query(Scheme).filter(Scheme.name == name).order_by(Scheme.id).all()
        if not matches:
            raise SelectionError(f"No scheme is named exactly {name!r}.")
        if len(matches) > 1:
            ids = ", ".join(str(s.id) for s in matches)
            raise SelectionError(f"More than one scheme is named exactly {name!r}; use --scheme-id with one of: {ids}")
        found.append(matches[0])
    unique: dict[uuid.UUID, Scheme] = {}
    for scheme in found:
        unique.setdefault(scheme.id, scheme)
    return list(unique.values())


# ---------------------------------------------------------------------------------------------------------
# Per-fund blocks
# ---------------------------------------------------------------------------------------------------------

def _identity(scheme: Scheme) -> dict:
    return {
        "scheme_id": str(scheme.id), "name": scheme.name, "amc": scheme.amc_name,
        "sebi_category": scheme.sebi_category or None, "plan_type": _plan(scheme),
        "is_index_fund": is_index_fund(scheme.name, scheme.sebi_category),
    }


def _holdings_batch(db: Session, scheme: Scheme, as_of: date) -> tuple[dict, DisclosureBatch | None]:
    """The batch dated exactly `as_of` (a scheme has at most one per date). Never another date."""
    batch = db.query(DisclosureBatch).filter(
        DisclosureBatch.scheme_id == scheme.id, DisclosureBatch.as_of_date == as_of,
    ).first()
    info = {"requested_as_of": as_of.isoformat(), "found": False, "batch_as_of": None, "status": None,
            "reason": NO_BATCH}
    if batch is None:
        return info, None
    info.update(batch_as_of=_iso(batch.as_of_date), status=batch.status.value)
    if batch.status != DisclosureBatchStatus.WRITTEN:
        info["reason"] = NOT_WRITTEN
        return info, None
    info.update(found=True, reason=None)
    return info, batch


def _market_cap_block(db: Session, rows: list, batch: DisclosureBatch) -> dict:
    buckets, unclassified = _market_cap_allocation(db, rows, batch.as_of_date)
    by_label = {bucket.label: bucket.pct for bucket in buckets}
    isins = {row.isin for row in rows if row.asset_type in _EQUITY and row.isin}
    classified = classify_isins(db, isins, batch.as_of_date)
    effective = min(classified.effective_dates.values(), default=None)
    return {
        "rule": _ALLOCATION_RULE,
        "large_pct": by_label.get("Large", "0.0000"),
        "mid_pct": by_label.get("Mid", "0.0000"),
        "small_pct": by_label.get("Small", "0.0000"),
        "unclassified_pct": plain(unclassified, 4),  # same rounding as the fund page's unclassified_pct
        "buckets": [{"label": b.label, "pct": b.pct} for b in buckets],
        "amfi_list_effective_date": _iso(effective),
    }


def _top10_block(db: Session, rows: list) -> dict:
    equity = _sorted([row for row in rows if row.asset_type in _EQUITY])
    sectors = _stock_sectors(db, rows)
    top = equity[:10]
    zero = Decimal("0")
    return {
        "rows": [{"rank": position, "name": row.instrument_name, "sector": sector_for(row, sectors),
                  "isin": row.isin, "pct_to_nav": _s(row.pct_to_nav)}
                 for position, row in enumerate(top, 1)],
        "top10_total_pct": _s(sum((row.pct_to_nav for row in top), zero)),
        "equity_total_pct": _s(sum((row.pct_to_nav for row in equity), zero)),
        "equity_holdings_count": len(equity),
    }


def _valuation_block(
    db: Session, scheme: Scheme, rows: list | None, export_date: date, reason: str | None,
) -> dict:
    block: dict = {"method": _VALUATION_METHOD, "min_coverage_pct": str(int(VALUATION_MIN_COVERAGE * 100))}
    if rows is None:
        empty = {"value": None, "method": None, "basis": None, "coverage_pct": None, "as_of": None,
                 "unavailable_reason": reason, "notes": None, "excluded": [], "screen_value": None,
                 "screen_source": None, "screen_as_of": None, "screen_basis": None, "screen_method": None}
        return {**block, "nav_date_used": None, "pe": dict(empty), "pb": dict(empty)}
    equity = [row for row in rows if row.asset_type in _EQUITY]
    isins = {row.isin for row in equity if row.isin is not None}
    master = {s.isin: s for s in db.query(StockMaster).filter(StockMaster.isin.in_(isins)).all()} if isins else {}
    # Same date the household screen passes: the fund's newest NAV (here: on or before the export date).
    nav_date = db.query(func.max(NavHistory.date)).filter(
        NavHistory.scheme_id == scheme.id, NavHistory.date <= export_date).scalar() or export_date
    latest = latest_reported_valuations(db, [scheme.id], nav_date)
    # Weights are each stock's % of NAV: the harmonic mean and the coverage depend only on relative weights.
    parts = fund_valuation(
        [(row, row.pct_to_nav) for row in equity], master,
        {metric: latest.get((scheme.id, metric)) for metric in ("pe", "pb")}, nav_date,
    )
    block["nav_date_used"] = nav_date.isoformat()
    for metric in ("pe", "pb"):
        computed, shown, detail = parts.computed[metric], parts.resolved[metric], parts.details[metric]
        block[metric] = {
            "value": computed.value, "method": computed.method, "basis": computed.basis,
            "coverage_pct": _s(Decimal(computed.coverage_pct)), "as_of": _iso(computed.as_of),
            "unavailable_reason": computed.unavailable_reason, "notes": computed.reason,
            "excluded": [{"name": h.instrument_name, "isin": h.isin, "pct_of_equity": _s(h.percentage_equity),
                          "reason": h.reason, "overseas": h in detail.overseas}
                         for h in detail.missing + detail.overseas],
            # What the product screens show for this fund: a fresh factsheet figure when one exists.
            "screen_value": shown.value, "screen_source": shown.source, "screen_as_of": _iso(shown.as_of),
            "screen_basis": shown.basis, "screen_method": shown.method,
        }
    return block


def _category_block(scheme: Scheme, pool) -> dict:
    row = category_rank_row(scheme, pool)
    ranked_as = None
    if pool is not None:
        representative = pool.peers.representative_of.get(scheme.id)
        if representative is not None and representative != scheme.id:
            ranked_as = next((s.name for s in pool.peers.schemes if s.id == representative), None)
    return {
        "category": row.sebi_category,
        "category_canonical": canonical_category(row.sebi_category) if row.sebi_category else None,
        "plan_type": _plan(scheme),
        "category_unavailable": row.category_unavailable,
        "insufficient_history": row.insufficient_history,
        "thin_category": row.thin_category,
        "compared_using": ranked_as,
        "return_unit": _RETURN_UNIT,
        "average_method": _AVERAGE_RULE,
        "three_year_floor": {
            "applies": True, "rule": _FLOOR_RULE,
            "fund_meets_floor": None if row.category_unavailable else not row.insufficient_history,
        },
        "periods": {
            period: {"fund_return": shown.fund_return, "category_avg": shown.category_avg,
                     "funds_in_average": shown.peers, "weighting": shown.weighting,
                     "funds_without_size": shown.funds_without_size}
            for period, shown in row.periods.items()
        },
    }


def _ranking_block(scheme: Scheme, pools) -> dict:
    row = new_ranking_row(scheme)
    if pools is not None:
        apply_ranks(row, scheme, pools)
    index = row.disclaimer_key == INDEX_FUND_DISCLAIMER_KEY
    if index:
        status = "not_ranked_index_fund"
    elif not is_rankable(scheme):
        status = "not_rankable_no_category_or_plan"
    else:
        status = "ranked" if any(p.status == "ranked" for p in row.periods.values()) else "not_enough_history"
    return {
        "status": status, "rule": _RANK_RULE, "disclaimer_key": row.disclaimer_key,
        "disclaimer": INDEX_FUND_DISCLAIMER if index else None, "ranked_as": row.ranked_as,
        "periods": {period: {"rank": value.rank, "total": value.total, "status": value.status}
                    for period, value in row.periods.items()},
    }


# ---------------------------------------------------------------------------------------------------------
# The export
# ---------------------------------------------------------------------------------------------------------

async def build_export(db: Session, schemes: list[Scheme], holdings_as_of: date, export_date: date) -> dict:
    category_pools: dict[tuple, object] = {}
    ranking_pools: dict[tuple, object] = {}
    funds = []
    for scheme in schemes:
        info, batch = _holdings_batch(db, scheme, holdings_as_of)
        rows = _rows(db, batch) if batch is not None else None
        fund = {
            "identity": _identity(scheme),
            "holdings_batch": info,
            "market_cap_allocation": _market_cap_block(db, rows, batch) if rows is not None else None,
            "top_10_holdings": _top10_block(db, rows) if rows is not None else None,
            "valuation": _valuation_block(db, scheme, rows, export_date, info["reason"]),
        }
        key = (canonical_category(scheme.sebi_category), scheme.plan_type) if scheme.sebi_category else None
        pool = None
        if key is not None:
            if key not in category_pools:
                category_pools[key] = await load_category_pool(db, scheme, export_date)
            pool = category_pools[key]
        fund["category_comparison"] = _category_block(scheme, pool)
        pools = None
        if is_rankable(scheme):
            if key not in ranking_pools:
                ranking_pools[key] = await load_ranking_pools(db, scheme, export_date)
            pools = ranking_pools[key]
        fund["performance_ranking"] = _ranking_block(scheme, pools)
        funds.append(fund)
    return {
        "export_date": export_date.isoformat(),
        "holdings_as_of_requested": holdings_as_of.isoformat(),
        "notes": {
            "holdings": "Allocation, top 10 and the stock list behind P/E and P/B come from the disclosure batch "
                        "dated exactly holdings_as_of_requested; a fund without a written batch for that date "
                        "has no such figures.",
            "ratios": "Each stock's P/E and P/B is the latest stored value (see each ratio's as_of), applied to "
                      "the requested holdings.",
            "returns": _RETURN_UNIT,
        },
        "funds": funds,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--scheme-id", action="append", default=[], type=uuid.UUID, help="repeatable")
    parser.add_argument("--name", action="append", default=[], help="exact scheme name; repeatable")
    parser.add_argument("--holdings-as-of", type=date.fromisoformat, default=DEFAULT_HOLDINGS_AS_OF)
    parser.add_argument("--export-date", type=date.fromisoformat, default=None,
                        help="end date of the return windows; default today")
    args = parser.parse_args(argv)
    if not args.scheme_id and not args.name:
        print("error: give at least one --scheme-id or --name", file=sys.stderr)
        return 2
    export_date = args.export_date or date.today()
    db = SessionLocal()
    try:
        install_read_only_guard(db)
        disable_live_nav_warming()
        schemes = resolve_schemes(db, args.scheme_id, args.name)
        result = asyncio.run(build_export(db, schemes, args.holdings_as_of, export_date))
        print(json.dumps(result, indent=2, ensure_ascii=False))
        return 0
    except SelectionError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    except WriteAttempted as exc:
        print(f"FAIL read-only guard: {exc}", file=sys.stderr)
        return 2
    finally:
        db.rollback()
        db.close()


if __name__ == "__main__":
    sys.exit(main())
