"""Category Average Comparison: averages within each category and plan, weighted
by fund size (average assets under management), the same as the fund page.

A fund with no size on record is left out of the weighted figure and counted;
if no fund in the pool has a size, the plain mean is shown and flagged.

The 3-year eligibility floor applies to every displayed period. Internal
return helpers also serve the Fund Quality Score: its blend remains 40% 3Y
and 60% 5Y when both exist, otherwise 100% 3Y. Performance Ranking opts into
short histories without changing this default or adding a second NAV pass.
"""

from __future__ import annotations

import logging
import threading
import time
import uuid
from datetime import date
from decimal import Decimal
from typing import NamedTuple

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.reference import NavHistory, Scheme, SchemeAaum
from app.services.analytics.schemas import (
    AggregateCategoryRankingResponse,
    CategoryRankingSummary,
    CategoryRankRow,
    PeriodReturn,
)
from app.services.analytics.risk_metrics import years_ago
from app.services.analytics.scheme_universe import CategoryPeers, canonical_category, get_category_peers
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
_category_returns_cache: dict[object, tuple[float, date, dict[uuid.UUID, tuple[Decimal | None, Decimal, Decimal | None, Decimal]]]] = {}
# Extra period rows from the very same bounded NAV lookup. The existing
# cache retains its original keys and legacy result dictionaries. Holding
# the legacy object also invalidates this view when tests/callers clear it.
_category_short_history_cache: dict[object, tuple[dict, dict]] = {}
_category_returns_cache_lock = threading.Lock()

logger = logging.getLogger(__name__)


def _cagr(start_nav: Decimal, end_nav: Decimal, years: int) -> Decimal:
    return (end_nav / start_nav) ** (Decimal(1) / Decimal(years)) - Decimal(1)


def _blend_returns(r3: Decimal, r5: Decimal | None) -> Decimal:
    if r5 is None:
        return r3
    return _BLEND_WEIGHT_3YR * r3 + _BLEND_WEIGHT_5YR * r5


def _bulk_nav_on_or_before(
    db: Session, scheme_ids: list[uuid.UUID], target_dates: list[date]
) -> dict[uuid.UUID, dict[date, Decimal]]:
    """One bounded query per target date across the whole category universe
    (not one query per (scheme, date) pair, the BUG-001 cost: 100+ schemes
    x 2 sequential lookups each) -- a `MAX(date)` join returns exactly one
    row per scheme, never materializing any intermediate history. Review
    finding against an earlier version of this function: it fetched every
    row from scheme-inception through `max(target_dates)` for every scheme
    (bounded only on the upper end), the same unbounded-scan defect
    `risk_metrics.build_monthly_series` was fixed for earlier in BUG-001."""
    if not scheme_ids:
        return {}
    result: dict[uuid.UUID, dict[date, Decimal]] = {sid: {} for sid in scheme_ids}
    for target in target_dates:
        latest_dates = (
            db.query(NavHistory.scheme_id, func.max(NavHistory.date).label("max_date"))
            .filter(NavHistory.scheme_id.in_(scheme_ids), NavHistory.date <= target)
            .group_by(NavHistory.scheme_id)
            .subquery()
        )
        rows = (
            db.query(NavHistory.scheme_id, NavHistory.nav)
            .join(
                latest_dates,
                (NavHistory.scheme_id == latest_dates.c.scheme_id) & (NavHistory.date == latest_dates.c.max_date),
            )
            .all()
        )
        for scheme_id, nav in rows:
            result[scheme_id][target] = nav
    return result


async def _compute_category_returns_detailed(
    db: Session, universe: list[Scheme], today: date, *, include_short_history: bool = False
) -> dict[uuid.UUID, tuple[Decimal | None, Decimal | None, Decimal | None, Decimal | None]]:
    """{scheme_id: (r1, r3, r5, blended)}. The default keeps the original
    3Y eligibility floor and blended figures. The opt-in view also retains
    shorter histories; r3/blended may then be None. Both use one NAV pass."""
    warm_start = time.perf_counter()
    await warm_nav_history(db, universe)
    warm_elapsed = time.perf_counter() - warm_start

    start_1y = years_ago(today, 1)
    start_3y = years_ago(today, 3)
    start_5y = years_ago(today, 5)
    lookup_start = time.perf_counter()
    navs = _bulk_nav_on_or_before(db, [s.id for s in universe], [start_1y, start_3y, start_5y, today])
    lookup_elapsed = time.perf_counter() - lookup_start

    detailed: dict[uuid.UUID, tuple[Decimal | None, Decimal | None, Decimal | None, Decimal | None]] = {}
    for scheme in universe:
        per_scheme = navs.get(scheme.id, {})
        end = per_scheme.get(today)
        start3 = per_scheme.get(start_3y)
        if include_short_history:
            if end is None or not end.is_finite() or end <= 0:
                continue
            starts = (per_scheme.get(start_1y), start3, per_scheme.get(start_5y))
            r1, r3, r5 = [
                _cagr(start, end, years) if start is not None and start.is_finite() and start > 0 else None
                for start, years in zip(starts, (1, 3, 5))
            ]
            if any(value is not None for value in (r1, r3, r5)):
                detailed[scheme.id] = (r1, r3, r5, _blend_returns(r3, r5) if r3 is not None else None)
            continue
        # Wound-up/segregated schemes carry NAV 0; invalid windows have no return.
        if end is None or start3 is None or end <= 0 or start3 <= 0:
            continue
        r3 = _cagr(start3, end, 3)
        start5 = per_scheme.get(start_5y)
        r5 = _cagr(start5, end, 5) if start5 is not None and start5 > 0 else None
        start1 = per_scheme.get(start_1y)
        r1 = _cagr(start1, end, 1) if start1 is not None and start1 > 0 else None
        detailed[scheme.id] = (r1, r3, r5, _blend_returns(r3, r5))

    logger.info(
        "_compute_category_returns_detailed[%s]: %d schemes, warm=%.2fs bulk_nav_lookup=%.2fs",
        universe[0].sebi_category if universe else "?", len(universe), warm_elapsed, lookup_elapsed,
    )
    return detailed


async def _compute_category_returns(db: Session, universe: list[Scheme], today: date) -> dict[uuid.UUID, Decimal]:
    detailed = await _compute_category_returns_detailed(db, universe, today)
    return {scheme_id: blended for scheme_id, (_, _, _, blended) in detailed.items()}


async def _category_returns(db: Session, universe: list[Scheme], today: date, *, cache_key=None) -> dict[uuid.UUID, Decimal]:
    detailed = await _category_returns_detailed(db, universe, today, cache_key=cache_key)
    return {scheme_id: values[3] for scheme_id, values in detailed.items()}


async def _category_returns_detailed(
    db: Session, universe: list[Scheme], today: date, *, cache_key=None, include_short_history: bool = False
) -> dict[uuid.UUID, tuple[Decimal | None, Decimal | None, Decimal | None, Decimal | None]]:
    if not universe:
        return {}
    sebi_category = cache_key or universe[0].sebi_category
    now = _category_returns_clock()
    with _category_returns_cache_lock:
        cached = _category_returns_cache.get(sebi_category)
    if cached is not None:
        cached_at, cached_today, returns = cached
        if cached_today == today and now - cached_at <= _CATEGORY_RETURNS_CACHE_TTL_SECONDS:
            if not include_short_history:
                return returns
            with _category_returns_cache_lock:
                short = _category_short_history_cache.get(sebi_category)
            if short is not None and short[0] is returns:
                return short[1]

    all_periods = await _compute_category_returns_detailed(db, universe, today, include_short_history=True)
    returns = {sid: values for sid, values in all_periods.items() if values[1] is not None}
    with _category_returns_cache_lock:
        _category_returns_cache[sebi_category] = (now, today, returns)
        _category_short_history_cache[sebi_category] = (returns, all_periods)
    return all_periods if include_short_history else returns


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


def _simple_average(values) -> Decimal | None:
    values = list(values)
    return sum(values, Decimal("0")) / Decimal(len(values)) if values else None


def category_period_averages(
    detailed: dict[uuid.UUID, tuple[Decimal | None, Decimal | None, Decimal | None, Decimal | None]],
) -> dict[str, tuple[Decimal | None, int]]:
    """Simple per-period means, always subject to the 3Y eligibility floor.

    Not used by the comparison itself any more (it is fund-size weighted, see
    `category_period_weighted_averages`); kept for the diff report script, which
    compares the two methods.
    """
    eligible = [values for values in detailed.values() if values[1] is not None]
    averages = {}
    for period, index in (("1y", 0), ("3y", 1), ("5y", 2)):
        pool = [values[index] for values in eligible if values[index] is not None]
        averages[period] = (_simple_average(pool), len(pool))
    return averages


class CategoryAverage(NamedTuple):
    """One category-and-plan average and how it was weighted."""

    value: Decimal | None
    peers: int                    # funds with a return in the period (the old count, unchanged)
    weighting: str | None         # "fund_size", "equal" (nobody has a size), None (no average)
    funds_without_size: int       # funds in the pool with no usable size on record


def _has_usable_size(size: Decimal | None) -> bool:
    return size is not None and size.is_finite() and size > 0


def _fund_size_average(returns: dict[uuid.UUID, Decimal], aaum_by_scheme: dict[uuid.UUID, Decimal]) -> CategoryAverage:
    """Mean of `returns` weighted by average assets under management, the same
    size figure and weighting helper the fund page uses. A fund with no usable
    size is left out of the weighted figure and counted. If no fund has a size,
    fall back to the plain mean for the category and say so (`weighting="equal"`)
    rather than showing nothing."""
    if not returns:
        return CategoryAverage(None, 0, None, 0)
    sized = {sid: value for sid, value in returns.items() if _has_usable_size(aaum_by_scheme.get(sid))}
    without_size = len(returns) - len(sized)
    weighted = _aum_weighted_average(sized, aaum_by_scheme)
    if weighted is None:
        return CategoryAverage(_simple_average(returns.values()), len(returns), "equal", without_size)
    return CategoryAverage(weighted, len(returns), "fund_size", without_size)


def category_period_weighted_averages(
    detailed: dict[uuid.UUID, tuple[Decimal | None, Decimal | None, Decimal | None, Decimal | None]],
    aaum_by_scheme: dict[uuid.UUID, Decimal],
) -> dict[str, CategoryAverage]:
    """Fund-size-weighted per-period averages, with the same 3Y eligibility floor
    and the same pools as `category_period_averages`."""
    eligible = {sid: values for sid, values in detailed.items() if values[1] is not None}
    return {
        period: _fund_size_average(
            {sid: values[index] for sid, values in eligible.items() if values[index] is not None}, aaum_by_scheme,
        )
        for period, index in (("1y", 0), ("3y", 1), ("5y", 2))
    }


def category_blended_weighted_average(
    detailed: dict[uuid.UUID, tuple[Decimal | None, Decimal | None, Decimal | None, Decimal | None]],
    aaum_by_scheme: dict[uuid.UUID, Decimal],
) -> CategoryAverage:
    """The legacy 40/60 blended average, weighted the same way (and over the same
    pool) as the period averages, so every screen shows one method."""
    return _fund_size_average(
        {sid: values[3] for sid, values in detailed.items() if values[1] is not None and values[3] is not None},
        aaum_by_scheme,
    )


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
    detailed_by_category: dict[tuple, dict] = {}
    peers_by_category: dict[tuple, CategoryPeers] = {}
    averages_by_category: dict[tuple, dict[str, CategoryAverage]] = {}
    legacy_average_by_category: dict[tuple, CategoryAverage] = {}
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
                    category_avg_return=None,
                    thin_category=False,
                    plan_type=scheme.plan_type.value if scheme.plan_type is not None else None,
                )
            )
            continue

        key = (canonical_category(sebi_category), scheme.plan_type)
        if key not in detailed_by_category:
            peers = await get_category_peers(db, sebi_category, scheme.plan_type)
            peers_by_category[key] = peers
            detailed_by_category[key] = await _category_returns_detailed(db, peers.schemes, today, cache_key=("peers", *key))
            # One size lookup per category and plan, for the funds that have a return.
            aaum = _latest_aaum_by_scheme(db, list(detailed_by_category[key]))
            averages_by_category[key] = category_period_weighted_averages(detailed_by_category[key], aaum)
            # Legacy: kept for desktop/print/phone views until the cleanup release.
            # Same eligible category-and-plan pool and the same weighting as the period averages.
            legacy_average_by_category[key] = category_blended_weighted_average(detailed_by_category[key], aaum)
        rep_id = peers_by_category[key].representative_of.get(scheme.id)
        own = detailed_by_category[key].get(rep_id)
        if own is not None and own[1] is None:
            own = None
        period_averages = averages_by_category[key]
        category_avg = legacy_average_by_category[key]
        periods = {
            period: PeriodReturn(
                fund_return=str(own[index]) if own[index] is not None else None,
                category_avg=str(period_averages[period].value) if period_averages[period].value is not None else None,
                peers=period_averages[period].peers,
                weighting=period_averages[period].weighting,
                funds_without_size=period_averages[period].funds_without_size,
            )
            for period, index in (("1y", 0), ("3y", 1), ("5y", 2))
        } if own is not None else {}

        rows.append(
            CategoryRankRow(
                scheme_id=scheme_id_str,
                scheme_name=scheme.name,
                sebi_category=sebi_category,
                category_unavailable=rep_id is None,
                insufficient_history=rep_id is not None and own is None,
                category_avg_return=str(category_avg.value) if category_avg.value is not None else None,
                thin_category=period_averages["3y"].peers < _THIN_CATEGORY_THRESHOLD,
                periods=periods,
                plan_type=scheme.plan_type.value if scheme.plan_type is not None else None,
                category_avg_weighting=category_avg.weighting,
                category_avg_funds_without_size=category_avg.funds_without_size,
            )
        )

    return CategoryRankingSummary(funds=rows)


async def get_aggregate_category_ranking(db: Session, user_id: uuid.UUID) -> AggregateCategoryRankingResponse:
    members = list_household_members(db, user_id)
    statuses = get_member_statuses(db, user_id)
    ranking = await compute_category_ranking(db, [m.id for m in members])
    return AggregateCategoryRankingResponse(members=statuses, ranking=ranking)
