"""Scorer (FR-5, FR-7) — PRD-04. Composite fund score combining Return
(45%), Risk/downside-deviation (30%, inverted — lower deviation ranks
higher), and Consistency (25%, Unifolio's own differentiating ingredient —
see the Phase 4 design doc §6), plus the already-resolved TER-based cost
overlay (±0.25, 0.05pp dead zone). Computed on-demand; persists one history
row to `fund_scores` per scheme per day (see this task's design note in the
plan for why the FR-7 breakdown itself is never persisted).
"""

from __future__ import annotations

import threading
import time
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.reference import FundScore, Scheme
from app.services.analytics.category_ranking import (
    _THIN_CATEGORY_THRESHOLD,
    _aum_weighted_average,
    _category_returns,
    _latest_aaum_by_scheme,
    _rank_and_percentile,
)
from app.services.analytics.risk_metrics import (
    build_monthly_series,
    category_medians,
    compute_consistency_hit_rate,
    compute_downside_deviation,
    month_end_dates,
    monthly_returns,
    rolling_12m_returns,
    years_ago,
)
from app.services.analytics.schemas import FundScoreRow
from app.services.analytics.scheme_universe import get_category_universe
from app.services.analytics.ter import _ensure_ter_fresh, _latest_ter_for_scheme

_RETURN_WEIGHT = Decimal("0.45")
_RISK_WEIGHT = Decimal("0.30")
_CONSISTENCY_WEIGHT = Decimal("0.25")
_TER_DEAD_ZONE = Decimal("0.05")
_TER_NUDGE = Decimal("0.25")
_HISTORY_YEARS = 5

# Mirrors nav.py's warm-cache posture (`_NAV_WARM_TTL_SECONDS`): this
# category-wide computation (Return/Risk/Consistency across an entire SEBI
# peer universe, 30-150+ schemes) was BUG-001's other dominant Scorer cost
# -- a portfolio holding several categories, or repeat requests within a
# session, recomputed every category from scratch every single call. Cache
# value also carries the calendar day it was computed for, since the
# composite score is inherently day-dependent (`month_end_dates` anchors
# off `today`) -- a TTL alone could otherwise serve a stale day's score
# across a midnight rollover even though the TTL window hasn't elapsed.
_CATEGORY_SCORE_CACHE_TTL_SECONDS = 15 * 60
_category_score_clock = time.monotonic
_category_score_cache: dict[str, tuple[float, date, dict[uuid.UUID, dict[str, Decimal | None]]]] = {}
_category_score_cache_lock = threading.Lock()


def _tier_from_percentile(percentile: Decimal) -> int:
    if percentile >= Decimal("80"):
        return 5
    if percentile >= Decimal("60"):
        return 4
    if percentile >= Decimal("40"):
        return 3
    if percentile >= Decimal("20"):
        return 2
    return 1


async def _category_component_scores(
    db: Session, universe: list[Scheme], sebi_category: str, today: date
) -> dict[uuid.UUID, dict[str, Decimal | None]]:
    now = _category_score_clock()
    with _category_score_cache_lock:
        cached = _category_score_cache.get(sebi_category)
    if cached is not None:
        cached_at, cached_today, scores = cached
        if cached_today == today and now - cached_at <= _CATEGORY_SCORE_CACHE_TTL_SECONDS:
            return scores

    scores = await _compute_category_component_scores(db, universe, today)

    with _category_score_cache_lock:
        _category_score_cache[sebi_category] = (now, today, scores)
    return scores


async def _compute_category_component_scores(
    db: Session, universe: list[Scheme], today: date
) -> dict[uuid.UUID, dict[str, Decimal | None]]:
    returns = await _category_returns(db, universe, today)
    if not returns:
        return {}

    month_ends = month_end_dates(years_ago(today, _HISTORY_YEARS), today)
    series_by_scheme = {
        scheme_id: build_monthly_series(db, scheme_id, month_ends) for scheme_id in returns
    }
    rolling_by_scheme = {
        scheme_id: rolling_12m_returns(series) for scheme_id, series in series_by_scheme.items()
    }
    medians = category_medians(list(rolling_by_scheme.values()))

    downside_by_scheme: dict[uuid.UUID, Decimal] = {}
    for scheme_id, series in series_by_scheme.items():
        deviation = compute_downside_deviation(monthly_returns(series))
        if deviation is not None:
            # Lower deviation is safer -> negate so `_rank_and_percentile`'s
            # "higher value ranks better" ordering favors the lowest
            # deviation.
            downside_by_scheme[scheme_id] = -deviation

    consistency_by_scheme = {
        scheme_id: compute_consistency_hit_rate(rolling_by_scheme[scheme_id], medians)
        for scheme_id in returns
    }

    scores: dict[uuid.UUID, dict[str, Decimal | None]] = {}
    for scheme_id in returns:
        return_rank = _rank_and_percentile(returns, scheme_id)
        risk_rank = (
            _rank_and_percentile(downside_by_scheme, scheme_id)
            if scheme_id in downside_by_scheme
            else None
        )
        return_pct = return_rank[1] if return_rank else None
        risk_pct = risk_rank[1] if risk_rank else None
        consistency = consistency_by_scheme.get(scheme_id)

        composite = None
        if return_pct is not None and risk_pct is not None and consistency is not None:
            composite = (
                _RETURN_WEIGHT * return_pct + _RISK_WEIGHT * risk_pct + _CONSISTENCY_WEIGHT * consistency
            )

        scores[scheme_id] = {
            "return_percentile": return_pct,
            "risk_percentile": risk_pct,
            "consistency_hit_rate": consistency,
            "composite": composite,
        }
    return scores


async def _category_ter_context(
    db: Session, universe: list[Scheme]
) -> tuple[dict[uuid.UUID, Decimal], Decimal | None]:
    """TER-vs-category-average inputs, computed once per category so a
    portfolio holding several funds in the same category doesn't repeat
    the TER refresh + AUM-weighted average for every held scheme in it."""
    if not universe:
        return {}, None
    scheme_ids = {s.id for s in universe}
    await _ensure_ter_fresh(db, scheme_ids)
    ter_by_scheme = {
        s.id: info[0] for s in universe if (info := _latest_ter_for_scheme(db, s.id)) is not None
    }
    aaum_by_scheme = _latest_aaum_by_scheme(db, list(ter_by_scheme.keys()))
    category_avg = _aum_weighted_average(ter_by_scheme, aaum_by_scheme)
    return ter_by_scheme, category_avg


def _cost_adjustment_from_context(
    scheme: Scheme, ter_by_scheme: dict[uuid.UUID, Decimal], category_avg: Decimal | None
) -> Decimal | None:
    """`None` means "can't be computed" (own or category-average TER
    unavailable) -- distinct from `Decimal("0")`, a genuinely-computed
    result meaning "TER is within the dead zone of the category average,
    no nudge warranted". Collapsing both to 0 would make an unmatched
    scheme's TER (DATA-001) indistinguishable from a real no-adjustment
    verdict in the API response."""
    own_ter = ter_by_scheme.get(scheme.id)
    if own_ter is None or category_avg is None:
        return None
    diff = own_ter - category_avg
    if abs(diff) <= _TER_DEAD_ZONE:
        return Decimal("0")
    return _TER_NUDGE if diff < 0 else -_TER_NUDGE


def _empty_row(scheme: Scheme, *, category_unavailable: bool, insufficient_history: bool) -> FundScoreRow:
    return FundScoreRow(
        scheme_id=str(scheme.id),
        scheme_name=scheme.name,
        category_unavailable=category_unavailable,
        insufficient_history=insufficient_history,
        thin_category=False,
        risk_adjusted_tier=None,
        cost_adjustment=None,
        final_score=None,
        return_percentile=None,
        risk_percentile=None,
        consistency_hit_rate=None,
    )


def _finish_fund_score(
    db: Session,
    scheme: Scheme,
    universe: list[Scheme],
    scores: dict[uuid.UUID, dict[str, Decimal | None]],
    ter_by_scheme: dict[uuid.UUID, Decimal],
    category_avg: Decimal | None,
    today: date,
) -> FundScoreRow:
    """Everything below the category-wide computations (`_category_component_scores`,
    `_category_ter_context`) that's genuinely per-scheme: this scheme's own
    rank, tier, cost nudge, and its own `fund_scores` row. Callers that
    already hold the category-wide inputs for several schemes (a portfolio
    with multiple holdings in the same category) call this once per scheme
    without recomputing the category-wide work each time."""
    scheme_scores = scores.get(scheme.id)

    if scheme_scores is None or scheme_scores["composite"] is None:
        return _empty_row(scheme, category_unavailable=False, insufficient_history=True)

    composite_by_scheme = {
        sid: s["composite"] for sid, s in scores.items() if s["composite"] is not None
    }
    composite_rank = _rank_and_percentile(composite_by_scheme, scheme.id)
    if composite_rank is None:
        return _empty_row(scheme, category_unavailable=False, insufficient_history=True)

    tier = _tier_from_percentile(composite_rank[1])
    cost_adjustment = _cost_adjustment_from_context(scheme, ter_by_scheme, category_avg)
    # `None` (TER data unavailable) applies no nudge to the arithmetic --
    # same numeric effect as a computed zero -- but is reported to the API
    # caller as `None`, not "0", so "unavailable" and "no adjustment
    # needed" stay distinguishable downstream (DATA-001).
    applied_adjustment = cost_adjustment if cost_adjustment is not None else Decimal("0")
    final_score = (composite_rank[1] + applied_adjustment).quantize(Decimal("0.01"))
    final_score = max(Decimal("0.00"), min(Decimal("100.00"), final_score))

    # `computed_at` is pinned to day-start (not `now`) so the existing
    # (scheme_id, computed_at) primary key IS the one-row-per-day
    # invariant -- two concurrent requests racing past a check-then-insert
    # would otherwise both observe "no row today" and both insert. The
    # loser's IntegrityError just means another request already persisted
    # an equivalent row for today; its own freshly computed result is
    # still returned to its caller either way.
    today_start = datetime(today.year, today.month, today.day, tzinfo=timezone.utc)
    db.add(
        FundScore(
            scheme_id=scheme.id,
            computed_at=today_start,
            risk_adjusted_tier=tier,
            cost_adjustment=applied_adjustment,
            final_score=final_score,
        )
    )
    try:
        db.commit()
    except IntegrityError:
        db.rollback()

    return FundScoreRow(
        scheme_id=str(scheme.id),
        scheme_name=scheme.name,
        category_unavailable=False,
        insufficient_history=False,
        thin_category=len(universe) < _THIN_CATEGORY_THRESHOLD,
        risk_adjusted_tier=tier,
        cost_adjustment=str(cost_adjustment) if cost_adjustment is not None else None,
        final_score=str(final_score),
        return_percentile=str(scheme_scores["return_percentile"]),
        risk_percentile=str(scheme_scores["risk_percentile"]),
        consistency_hit_rate=str(scheme_scores["consistency_hit_rate"]),
    )


async def compute_fund_score(db: Session, scheme: Scheme) -> FundScoreRow:
    if not scheme.sebi_category:
        return _empty_row(scheme, category_unavailable=True, insufficient_history=False)

    today = datetime.now(timezone.utc).date()
    universe = await get_category_universe(db, scheme.sebi_category)
    scores = await _category_component_scores(db, universe, scheme.sebi_category, today)
    # Skip the TER fetch entirely when nobody in the category has return
    # data yet -- matches the original short-circuit: cost adjustment is
    # meaningless without a composite score to adjust.
    ter_by_scheme, category_avg = (
        await _category_ter_context(db, universe) if scores else ({}, None)
    )
    return _finish_fund_score(db, scheme, universe, scores, ter_by_scheme, category_avg, today)


from app.services.dashboard.aggregate import get_member_statuses
from app.services.dashboard.holdings import compute_holdings
from app.services.dashboard.household_members import list_household_members
from app.services.analytics.schemas import AggregatePortfolioScoreResponse, PortfolioScoreSummary

_EMPTY_PORTFOLIO_SCORE = PortfolioScoreSummary(
    funds=[], weighted_score=None, covered_value="0", total_value="0", uncovered_schemes=[]
)


async def compute_portfolio_score(db: Session, household_member_ids: list[uuid.UUID]) -> PortfolioScoreSummary:
    holdings = await compute_holdings(db, household_member_ids)
    if not holdings:
        return _EMPTY_PORTFOLIO_SCORE

    unique_scheme_ids = {h.scheme_id for h in holdings}
    schemes_by_id = {
        str(s.id): s
        for s in db.query(Scheme).filter(Scheme.id.in_([uuid.UUID(sid) for sid in unique_scheme_ids])).all()
    }

    # Group held schemes by category so a portfolio holding several funds
    # in the same category (common — e.g. two large-cap funds) computes
    # that category's universe/return/risk/consistency/TER work once,
    # instead of once per held scheme in it (each involves a DB query per
    # scheme in the whole category, not just the held ones).
    today = datetime.now(timezone.utc).date()
    schemes_by_category: dict[str, list[Scheme]] = {}
    row_by_scheme: dict[str, FundScoreRow] = {}
    for scheme_id_str, scheme in schemes_by_id.items():
        if not scheme.sebi_category:
            row_by_scheme[scheme_id_str] = _empty_row(
                scheme, category_unavailable=True, insufficient_history=False
            )
            continue
        schemes_by_category.setdefault(scheme.sebi_category, []).append(scheme)

    for sebi_category, category_schemes in schemes_by_category.items():
        universe = await get_category_universe(db, sebi_category)
        scores = await _category_component_scores(db, universe, sebi_category, today)
        ter_by_scheme, category_avg = (
            await _category_ter_context(db, universe) if scores else ({}, None)
        )
        for scheme in category_schemes:
            row_by_scheme[str(scheme.id)] = _finish_fund_score(
                db, scheme, universe, scores, ter_by_scheme, category_avg, today
            )

    rows = [row_by_scheme[sid] for sid in unique_scheme_ids]

    total_value = Decimal("0")
    covered_value = Decimal("0")
    weighted_sum = Decimal("0")
    uncovered: set[str] = set()

    for holding in holdings:
        value = Decimal(holding.current_value)
        total_value += value
        row = row_by_scheme[holding.scheme_id]
        if row.final_score is None:
            uncovered.add(holding.scheme_name)
            continue
        covered_value += value
        weighted_sum += value * Decimal(row.final_score)

    weighted_score = (weighted_sum / covered_value).quantize(Decimal("0.01")) if covered_value else None

    return PortfolioScoreSummary(
        funds=rows,
        weighted_score=str(weighted_score) if weighted_score is not None else None,
        covered_value=str(covered_value),
        total_value=str(total_value),
        uncovered_schemes=sorted(uncovered),
    )


async def get_aggregate_portfolio_score(db: Session, user_id: uuid.UUID) -> AggregatePortfolioScoreResponse:
    members = list_household_members(db, user_id)
    statuses = get_member_statuses(db, user_id)
    score = await compute_portfolio_score(db, [m.id for m in members])
    return AggregatePortfolioScoreResponse(members=statuses, score=score)
