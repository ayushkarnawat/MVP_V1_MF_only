"""Scorer (FR-5, FR-7) — PRD-04. Composite fund score combining Return
(45%), Risk/downside-deviation (30%, inverted — lower deviation ranks
higher), and Consistency (25%, Unifolio's own differentiating ingredient —
see the Phase 4 design doc §6), plus the already-resolved TER-based cost
overlay (±0.25, 0.05pp dead zone). Computed on-demand; persists one history
row to `fund_scores` per scheme per day (see this task's design note in the
plan for why the FR-7 breakdown itself is never persisted).
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

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
    db: Session, universe: list[Scheme], today: date
) -> dict[uuid.UUID, dict[str, Decimal | None]]:
    returns = await _category_returns(db, universe, today)
    if not returns:
        return {}

    month_ends = month_end_dates(today.replace(year=today.year - _HISTORY_YEARS), today)
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


async def _cost_adjustment(db: Session, scheme: Scheme, universe: list[Scheme]) -> Decimal:
    scheme_ids = {s.id for s in universe}
    await _ensure_ter_fresh(db, scheme_ids)
    ter_by_scheme = {
        s.id: info[0] for s in universe if (info := _latest_ter_for_scheme(db, s.id)) is not None
    }
    own_ter = ter_by_scheme.get(scheme.id)
    if own_ter is None:
        return Decimal("0")
    aaum_by_scheme = _latest_aaum_by_scheme(db, list(ter_by_scheme.keys()))
    category_avg = _aum_weighted_average(ter_by_scheme, aaum_by_scheme)
    if category_avg is None:
        return Decimal("0")
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


async def compute_fund_score(db: Session, scheme: Scheme) -> FundScoreRow:
    if not scheme.sebi_category:
        return _empty_row(scheme, category_unavailable=True, insufficient_history=False)

    now = datetime.now(timezone.utc)
    today = now.date()
    universe = await get_category_universe(db, scheme.sebi_category)
    scores = await _category_component_scores(db, universe, today)
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
    cost_adjustment = await _cost_adjustment(db, scheme, universe)
    final_score = (composite_rank[1] + cost_adjustment).quantize(Decimal("0.01"))

    today_start = datetime(today.year, today.month, today.day, tzinfo=timezone.utc)
    existing_today = (
        db.query(FundScore)
        .filter(FundScore.scheme_id == scheme.id, FundScore.computed_at >= today_start)
        .first()
    )
    if existing_today is None:
        db.add(
            FundScore(
                scheme_id=scheme.id,
                computed_at=now,
                risk_adjusted_tier=tier,
                cost_adjustment=cost_adjustment,
                final_score=final_score,
            )
        )
        db.commit()

    return FundScoreRow(
        scheme_id=str(scheme.id),
        scheme_name=scheme.name,
        category_unavailable=False,
        insufficient_history=False,
        thin_category=len(universe) < _THIN_CATEGORY_THRESHOLD,
        risk_adjusted_tier=tier,
        cost_adjustment=str(cost_adjustment),
        final_score=str(final_score),
        return_percentile=str(scheme_scores["return_percentile"]),
        risk_percentile=str(scheme_scores["risk_percentile"]),
        consistency_hit_rate=str(scheme_scores["consistency_hit_rate"]),
    )
