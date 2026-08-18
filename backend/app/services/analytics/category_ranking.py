"""Category ranking (FR-3) and AUM-weighted category-average comparison
(FR-4) — PRD-04. Ranks each held scheme against its full SEBI-category
peer universe (`scheme_universe.py`) by a blended 3yr/5yr CAGR, and shows
the category's AUM-weighted average return alongside it.

**Blend-weight judgment call**, flagged per CLAUDE.md's "stop and say so":
the design doc's Resolved Open Questions only fixes the *inputs* ("3-year
minimum to qualify... 5-year blended in once available... no 10-year
window"), not the blend weights. Morningstar's published overall-rating
methodology weights 3/5/10yr periods 20/30/50 when all three exist; with
no 10yr window here, normalizing away that unused weight gives 3yr=40%,
5yr=60% — used here as the blend when both windows are available. A
scheme with only a 3yr history uses 100% 3yr.

FR-3's own wording ("rank... using a defined return window... CAGR") is a
plain return-based rank — not FR-5a's downside-weighted, risk-adjusted
Scorer tier (a separate, later build step, depends on this one). Category-
universe NAV lookups reuse `dashboard/nav.py`'s on-demand fetch-and-cache
(same production caveat as holdings: a real deployment pre-warms this via
a scheduled job, not a fetch-per-request) — `_category_returns` warms the
whole peer universe concurrently via `warm_nav_history` first (live-verified
2026-08-14: without this, a 100+ scheme category meant 100+ *sequential*
live network round-trips and a multi-minute hang on first load), then reads
NAVs from the now-local cache in its per-scheme loop.
"""

from __future__ import annotations

import bisect
import threading
import time
import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models.reference import NavHistory, Scheme, SchemeAaum
from app.services.analytics.schemas import (
    AggregateCategoryRankingResponse,
    CategoryRankingSummary,
    CategoryRankRow,
)
from app.services.analytics.risk_metrics import years_ago
from app.services.analytics.scheme_universe import get_category_universe
from app.services.dashboard.aggregate import get_member_statuses
from app.services.dashboard.holdings import compute_holdings
from app.services.dashboard.household_members import list_household_members
from app.services.dashboard.nav import warm_nav_history

# Same "at least 5" bar FR-5a's Scorer uses (PRD-04 FR-5a) — reused here
# for consistency, but never excludes a fund from ranking/comparison, only
# sets `thin_category=True` per the Edge Cases table ("still shown, but
# flagged based on small sample").
_THIN_CATEGORY_THRESHOLD = 5
_BLEND_WEIGHT_3YR = Decimal("0.4")
_BLEND_WEIGHT_5YR = Decimal("0.6")

# Mirrors scorer.py's `_category_score_cache` (BUG-001, same category-wide
# cost pattern: `_scheme_return`'s old per-scheme, two-lookups-each loop
# meant 100+ *sequential* ORM queries per category, on every request, with
# zero cross-request reuse). Cache key is derived from `universe[0].sebi_category`
# rather than an added parameter, so `scorer.py`'s call site (and its
# mocked `_category_returns` tests) stay untouched — every scheme in one
# `get_category_universe` result already shares the same category.
_CATEGORY_RETURNS_CACHE_TTL_SECONDS = 15 * 60
_category_returns_clock = time.monotonic
_category_returns_cache: dict[str, tuple[float, date, dict[uuid.UUID, Decimal]]] = {}
_category_returns_cache_lock = threading.Lock()


def _cagr(start_nav: Decimal, end_nav: Decimal, years: int) -> Decimal:
    return (end_nav / start_nav) ** (Decimal(1) / Decimal(years)) - Decimal(1)


def _blend_returns(r3: Decimal, r5: Decimal | None) -> Decimal:
    if r5 is None:
        return r3
    return _BLEND_WEIGHT_3YR * r3 + _BLEND_WEIGHT_5YR * r5


def _bulk_nav_on_or_before(
    db: Session, scheme_ids: list[uuid.UUID], target_dates: list[date]
) -> dict[uuid.UUID, dict[date, Decimal]]:
    """One query for the latest-NAV-on-or-before of every (scheme, target
    date) pair in the whole category universe, instead of one query per
    pair (the BUG-001 cost: 100+ schemes x 2 sequential lookups each).
    `warm_nav_history` has already ensured every row up to `today` is
    locally cached, so this reads straight from the local table."""
    if not scheme_ids:
        return {}
    latest_target = max(target_dates)
    rows = (
        db.query(NavHistory)
        .filter(NavHistory.scheme_id.in_(scheme_ids), NavHistory.date <= latest_target)
        .order_by(NavHistory.scheme_id, NavHistory.date)
        .all()
    )
    dates_by_scheme: dict[uuid.UUID, list[date]] = {}
    navs_by_scheme: dict[uuid.UUID, list[Decimal]] = {}
    for row in rows:
        dates_by_scheme.setdefault(row.scheme_id, []).append(row.date)
        navs_by_scheme.setdefault(row.scheme_id, []).append(row.nav)

    result: dict[uuid.UUID, dict[date, Decimal]] = {}
    for scheme_id, dates in dates_by_scheme.items():
        navs = navs_by_scheme[scheme_id]
        per_scheme: dict[date, Decimal] = {}
        for target in target_dates:
            idx = bisect.bisect_right(dates, target) - 1
            if idx >= 0:
                per_scheme[target] = navs[idx]
        result[scheme_id] = per_scheme
    return result


async def _compute_category_returns(db: Session, universe: list[Scheme], today: date) -> dict[uuid.UUID, Decimal]:
    await warm_nav_history(db, universe)
    start_3y = years_ago(today, 3)
    start_5y = years_ago(today, 5)
    navs = _bulk_nav_on_or_before(db, [s.id for s in universe], [start_3y, start_5y, today])

    returns: dict[uuid.UUID, Decimal] = {}
    for scheme in universe:
        per_scheme = navs.get(scheme.id, {})
        end = per_scheme.get(today)
        start3 = per_scheme.get(start_3y)
        if end is None or start3 is None:
            continue
        r3 = _cagr(start3, end, 3)
        start5 = per_scheme.get(start_5y)
        r5 = _cagr(start5, end, 5) if start5 is not None else None
        returns[scheme.id] = _blend_returns(r3, r5)
    return returns


async def _category_returns(db: Session, universe: list[Scheme], today: date) -> dict[uuid.UUID, Decimal]:
    if not universe:
        return {}
    sebi_category = universe[0].sebi_category
    now = _category_returns_clock()
    with _category_returns_cache_lock:
        cached = _category_returns_cache.get(sebi_category)
    if cached is not None:
        cached_at, cached_today, returns = cached
        if cached_today == today and now - cached_at <= _CATEGORY_RETURNS_CACHE_TTL_SECONDS:
            return returns

    returns = await _compute_category_returns(db, universe, today)

    with _category_returns_cache_lock:
        _category_returns_cache[sebi_category] = (now, today, returns)
    return returns


def _rank_and_percentile(returns: dict[uuid.UUID, Decimal], scheme_id: uuid.UUID) -> tuple[int, Decimal] | None:
    if scheme_id not in returns:
        return None
    ordered = sorted(returns, key=lambda k: returns[k], reverse=True)
    rank = ordered.index(scheme_id) + 1
    total = len(ordered)
    percentile = Decimal(total - rank) / Decimal(total) * Decimal(100)
    return rank, percentile


def _aum_weighted_average(
    returns: dict[uuid.UUID, Decimal], aaum_by_scheme: dict[uuid.UUID, Decimal]
) -> Decimal | None:
    numerator = Decimal("0")
    denominator = Decimal("0")
    for scheme_id, ret in returns.items():
        aaum = aaum_by_scheme.get(scheme_id)
        if aaum is None:
            continue
        numerator += ret * aaum
        denominator += aaum
    if denominator == 0:
        return None
    return numerator / denominator


def _latest_aaum_by_scheme(db: Session, scheme_ids: list[uuid.UUID]) -> dict[uuid.UUID, Decimal]:
    if not scheme_ids:
        return {}
    rows = db.query(SchemeAaum).filter(SchemeAaum.scheme_id.in_(scheme_ids)).all()
    latest: dict[uuid.UUID, tuple[date, Decimal]] = {}
    for row in rows:
        current = latest.get(row.scheme_id)
        if current is None or row.reference_period > current[0]:
            latest[row.scheme_id] = (row.reference_period, row.aaum_value)
    return {scheme_id: value for scheme_id, (_, value) in latest.items()}


async def compute_category_ranking(db: Session, household_member_ids: list[uuid.UUID]) -> CategoryRankingSummary:
    holdings = await compute_holdings(db, household_member_ids)
    if not holdings:
        return CategoryRankingSummary(funds=[])

    unique_scheme_ids = {h.scheme_id for h in holdings}
    schemes_by_id = {
        str(s.id): s
        for s in db.query(Scheme).filter(Scheme.id.in_([uuid.UUID(sid) for sid in unique_scheme_ids])).all()
    }

    today = date.today()
    returns_by_category: dict[str, dict[uuid.UUID, Decimal]] = {}
    rows: list[CategoryRankRow] = []

    for scheme_id_str in unique_scheme_ids:
        scheme = schemes_by_id[scheme_id_str]
        sebi_category = scheme.sebi_category
        if not sebi_category:
            rows.append(
                CategoryRankRow(
                    scheme_id=scheme_id_str,
                    scheme_name=scheme.name,
                    sebi_category=None,
                    category_unavailable=True,
                    insufficient_history=False,
                    scheme_return=None,
                    category_rank=None,
                    category_size=0,
                    percentile=None,
                    category_avg_return=None,
                    thin_category=False,
                )
            )
            continue

        if sebi_category not in returns_by_category:
            universe = await get_category_universe(db, sebi_category)
            returns_by_category[sebi_category] = await _category_returns(db, universe, today)
        returns = returns_by_category[sebi_category]

        scheme_return = returns.get(scheme.id)
        rank_info = _rank_and_percentile(returns, scheme.id)
        aaum_by_scheme = _latest_aaum_by_scheme(db, list(returns.keys()))
        category_avg = _aum_weighted_average(returns, aaum_by_scheme)

        rows.append(
            CategoryRankRow(
                scheme_id=scheme_id_str,
                scheme_name=scheme.name,
                sebi_category=sebi_category,
                category_unavailable=False,
                insufficient_history=scheme_return is None,
                scheme_return=str(scheme_return) if scheme_return is not None else None,
                category_rank=rank_info[0] if rank_info else None,
                category_size=len(returns),
                percentile=str(rank_info[1]) if rank_info else None,
                category_avg_return=str(category_avg) if category_avg is not None else None,
                thin_category=len(returns) < _THIN_CATEGORY_THRESHOLD,
            )
        )

    return CategoryRankingSummary(funds=rows)


async def get_aggregate_category_ranking(db: Session, user_id: uuid.UUID) -> AggregateCategoryRankingResponse:
    members = list_household_members(db, user_id)
    statuses = get_member_statuses(db, user_id)
    ranking = await compute_category_ranking(db, [m.id for m in members])
    return AggregateCategoryRankingResponse(members=statuses, ranking=ranking)
