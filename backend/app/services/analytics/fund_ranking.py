# backend/app/services/analytics/fund_ranking.py
"""Fund ranking (attribute 09) — a 5-factor composite score (3Y return 25%,
5Y return 25%, category-relative return 20%, low-volatility 15%, low-TER
15%, every component a percentile within the SEBI category, never a raw
number) per the source PDF's own formula. Structural sibling of scorer.py:
reuses category_ranking.py's returns/AUM-average/percentile-rank helpers,
risk_metrics.py's downside-deviation computation, and ter.py's per-scheme
TER lookup verbatim — zero new data source, zero new scheduled job. Unlike
Scorer, TER here gets a full 0.15-weighted percentile share rather than
Scorer's small ±0.25 dead-zone nudge — a deliberate difference, not an
inconsistency (decisions.md 2026-10-06: a different formula from Scorer).
"""

from __future__ import annotations

import logging
import threading
import time
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.session import commit_off_loop
from app.models.reference import RankingWeight, Scheme, SchemeRanking
from app.services.analytics.category_ranking import (
    _THIN_CATEGORY_THRESHOLD,
    _aum_weighted_average,
    _compute_category_returns_detailed,
    _latest_aaum_by_scheme,
    _rank_and_percentile,
)
from app.services.analytics.risk_metrics import (
    build_monthly_series_bulk,
    compute_downside_deviation,
    month_end_dates,
    monthly_returns,
    years_ago,
)
from app.services.analytics.schemas import (
    FundRankingComponent,
    FundRankingComponents,
    FundRankingNeighbor,
    FundRankingRow,
    FundRankingSummary,
)
from app.services.analytics.scheme_universe import CategoryPeers, canonical_category, get_category_peers
from app.services.analytics.ter import _latest_ter_for_scheme
from app.services.dashboard.aggregate import get_member_statuses
from app.services.dashboard.holdings import compute_holdings
from app.services.dashboard.household_members import list_household_members

logger = logging.getLogger(__name__)

_DEFAULT_WEIGHTS: dict[str, Decimal] = {
    "return_3y": Decimal("0.25"),
    "return_5y": Decimal("0.25"),
    "category_relative": Decimal("0.20"),
    "low_volatility": Decimal("0.15"),
    "low_ter": Decimal("0.15"),
}
_HISTORY_YEARS = 5

# Same per-category cost pattern scorer.py's `_category_score_cache` and
# category_ranking.py's `_category_returns_cache` already solve BUG-001
# for: this category-wide computation (returns, downside deviation, TER,
# percentile ranks across the whole SEBI peer universe) must not repeat per
# held scheme in the same category within one request or a short window.
_CATEGORY_RANKING_CACHE_TTL_SECONDS = 15 * 60
_category_ranking_clock = time.monotonic
_category_ranking_cache: dict[tuple, tuple[float, date, dict[uuid.UUID, dict]]] = {}
_MIN_RANKED_PEERS = 3  # D2: below this a rank says nothing ("#1 of 1")
_category_ranking_cache_lock = threading.Lock()


def _get_ranking_weights(db: Session) -> dict[str, Decimal]:
    row = db.query(RankingWeight).first()
    if row is None:
        return dict(_DEFAULT_WEIGHTS)
    return {
        "return_3y": row.weight_return_3y,
        "return_5y": row.weight_return_5y,
        "category_relative": row.weight_category_relative,
        "low_volatility": row.weight_low_volatility,
        "low_ter": row.weight_low_ter,
    }


def _renormalized_composite(
    percentiles: dict[str, Decimal | None], weights: dict[str, Decimal]
) -> Decimal | None:
    available = {k: v for k, v in percentiles.items() if v is not None}
    if not available:
        return None
    weight_sum = sum((weights[k] for k in available), Decimal("0"))
    if weight_sum == 0:
        return None
    return sum((weights[k] / weight_sum * v for k, v in available.items()), Decimal("0"))


async def _compute_category_ranking_scores(
    db: Session, universe: list[Scheme], today: date
) -> dict[uuid.UUID, dict]:
    detailed = await _compute_category_returns_detailed(db, universe, today)
    if not detailed:
        return {}

    r1_by_scheme = {sid: r1 for sid, (r1, _r3, _r5, _b) in detailed.items() if r1 is not None}
    r3_by_scheme = {sid: r3 for sid, (_r1, r3, _r5, _b) in detailed.items()}
    r5_by_scheme = {sid: r5 for sid, (_r1, _r3, r5, _b) in detailed.items() if r5 is not None}
    blended_by_scheme = {sid: b for sid, (_r1, _r3, _r5, b) in detailed.items()}

    aaum_by_scheme = _latest_aaum_by_scheme(db, list(blended_by_scheme.keys()))
    category_avg_blended = _aum_weighted_average(blended_by_scheme, aaum_by_scheme)
    category_relative_by_scheme = (
        {sid: b - category_avg_blended for sid, b in blended_by_scheme.items()}
        if category_avg_blended is not None
        else {}
    )

    month_ends = month_end_dates(years_ago(today, _HISTORY_YEARS), today)
    series_by_scheme = build_monthly_series_bulk(db, list(detailed.keys()), month_ends)
    downside_by_scheme: dict[uuid.UUID, Decimal] = {}
    for scheme_id, series in series_by_scheme.items():
        deviation = compute_downside_deviation(monthly_returns(series))
        if deviation is not None:
            downside_by_scheme[scheme_id] = -deviation  # lower deviation ranks better

    ter_raw_by_scheme = {
        s.id: info[0] for s in universe if s.id in detailed and (info := _latest_ter_for_scheme(db, s.id)) is not None
    }
    negated_ter_by_scheme = {sid: -value for sid, value in ter_raw_by_scheme.items()}  # lower TER ranks better

    scores: dict[uuid.UUID, dict] = {}
    weights = _get_ranking_weights(db)
    for scheme_id in detailed:
        r1, r3, r5, blended = detailed[scheme_id]
        return_3y_rank = _rank_and_percentile(r3_by_scheme, scheme_id)
        return_5y_rank = _rank_and_percentile(r5_by_scheme, scheme_id) if scheme_id in r5_by_scheme else None
        category_relative_rank = (
            _rank_and_percentile(category_relative_by_scheme, scheme_id)
            if scheme_id in category_relative_by_scheme
            else None
        )
        volatility_rank = (
            _rank_and_percentile(downside_by_scheme, scheme_id) if scheme_id in downside_by_scheme else None
        )
        ter_rank = (
            _rank_and_percentile(negated_ter_by_scheme, scheme_id) if scheme_id in negated_ter_by_scheme else None
        )

        percentiles = {
            "return_3y": return_3y_rank[1] if return_3y_rank else None,
            "return_5y": return_5y_rank[1] if return_5y_rank else None,
            "category_relative": category_relative_rank[1] if category_relative_rank else None,
            "low_volatility": volatility_rank[1] if volatility_rank else None,
            "low_ter": ter_rank[1] if ter_rank else None,
        }
        composite = _renormalized_composite(percentiles, weights)

        scores[scheme_id] = {
            "composite": composite,
            "return_1y": r1,
            "return_3y": r3,
            "return_5y": r5,
            "category_relative": category_relative_by_scheme.get(scheme_id),
            "downside_deviation": -downside_by_scheme[scheme_id] if scheme_id in downside_by_scheme else None,
            "ter_value": ter_raw_by_scheme.get(scheme_id),
            "percentiles": percentiles,
        }
    return scores


async def _category_ranking_scores(
    db: Session, peers: CategoryPeers, cache_key: tuple, today: date
) -> dict[uuid.UUID, dict]:
    # Keyed by (canonical category, plan type): Direct and Regular holdings in one
    # category rank against different peer sets (Task 2a).
    now = _category_ranking_clock()
    with _category_ranking_cache_lock:
        cached = _category_ranking_cache.get(cache_key)
    if cached is not None:
        cached_at, cached_today, scores = cached
        if cached_today == today and now - cached_at <= _CATEGORY_RANKING_CACHE_TTL_SECONDS:
            return scores

    scores = await _compute_category_ranking_scores(db, peers.schemes, today)

    # Empty peers usually mean AMFI was unreachable; don't hold that for 15 minutes.
    if peers.schemes:
        with _category_ranking_cache_lock:
            _category_ranking_cache[cache_key] = (now, today, scores)
    return scores


def _empty_ranking_row(
    scheme: Scheme, *, category_unavailable: bool, insufficient_history: bool, category_universe_size: int = 0
) -> FundRankingRow:
    empty_component = FundRankingComponent(percentile=None, raw=None)
    return FundRankingRow(
        scheme_id=str(scheme.id),
        scheme_name=scheme.name,
        category_name=scheme.sebi_category or None,
        category_unavailable=category_unavailable,
        insufficient_history=insufficient_history,
        thin_category=False,
        too_few_peers=False,
        composite_score=None,
        category_rank=None,
        category_size=0,
        category_universe_size=category_universe_size,
        percentile=None,
        return_1y=None,
        ranked_as=None,
        neighbors=[],
        components=FundRankingComponents(
            return_3y=empty_component, return_5y=empty_component, category_relative=empty_component,
            low_volatility=empty_component, low_ter=empty_component,
        ),
    )


def _decimal_or_none_str(value: Decimal | None) -> str | None:
    return str(value) if value is not None else None


def _components(scheme_scores: dict, *, with_percentiles: bool) -> FundRankingComponents:
    # D2: with fewer than _MIN_RANKED_PEERS ranked funds a percentile only restates the
    # rank, so only the fund's own numbers are returned.
    p = scheme_scores["percentiles"] if with_percentiles else {}

    def comp(key: str, raw_key: str) -> FundRankingComponent:
        return FundRankingComponent(percentile=_decimal_or_none_str(p.get(key)), raw=_decimal_or_none_str(scheme_scores[raw_key]))

    return FundRankingComponents(
        return_3y=comp("return_3y", "return_3y"), return_5y=comp("return_5y", "return_5y"),
        category_relative=comp("category_relative", "category_relative"),
        low_volatility=comp("low_volatility", "downside_deviation"), low_ter=comp("low_ter", "ter_value"),
    )


def _compute_neighbors(
    composite_by_scheme: dict[uuid.UUID, Decimal], scheme_names: dict[uuid.UUID, str], scheme_id: uuid.UUID
) -> list[FundRankingNeighbor]:
    ordered = sorted(composite_by_scheme, key=lambda sid: composite_by_scheme[sid], reverse=True)
    idx = ordered.index(scheme_id)
    above = ordered[max(0, idx - 2):idx]
    below = ordered[idx + 1:idx + 3]
    return [
        FundRankingNeighbor(
            scheme_id=str(sid), scheme_name=scheme_names[sid], category_rank=ordered.index(sid) + 1,
            composite_score=str(composite_by_scheme[sid].quantize(Decimal("0.01"))),
        )
        for sid in above + below
    ]


async def _finish_fund_ranking(
    db: Session, scheme: Scheme, peers: CategoryPeers, scores: dict[uuid.UUID, dict], today: date
) -> FundRankingRow:
    series_id = peers.representative_of.get(scheme.id)
    if series_id is None:
        # Not in AMFI's current file (closed or merged): no peer set to rank against.
        return _empty_ranking_row(scheme, category_unavailable=True, insufficient_history=False)
    scheme_scores = scores.get(series_id)
    if scheme_scores is None or scheme_scores["composite"] is None:
        return _empty_ranking_row(
            scheme, category_unavailable=False, insufficient_history=True, category_universe_size=peers.fund_count
        )

    composite_by_scheme = {sid: s["composite"] for sid, s in scores.items() if s["composite"] is not None}
    ranked = len(composite_by_scheme)
    names = {s.id: s.name for s in peers.schemes}
    # A held IDCW (or other-option) plan is ranked on its fund's Growth series; say so.
    ranked_as = names[series_id] if series_id != scheme.id else None

    if ranked < _MIN_RANKED_PEERS:
        # D2: "#1 of 1" says nothing. No rank, no percentiles, no scheme_rankings row.
        return FundRankingRow(
            scheme_id=str(scheme.id), scheme_name=scheme.name, category_name=scheme.sebi_category,
            category_unavailable=False, insufficient_history=False, thin_category=True, too_few_peers=True,
            composite_score=None, category_rank=None, category_size=ranked,
            category_universe_size=peers.fund_count, percentile=None,
            return_1y=_decimal_or_none_str(scheme_scores["return_1y"]), ranked_as=ranked_as, neighbors=[],
            components=_components(scheme_scores, with_percentiles=False),
        )

    rank, percentile = _rank_and_percentile(composite_by_scheme, series_id)
    composite = scheme_scores["composite"].quantize(Decimal("0.01"))  # fix 1: the score, not the percentile
    percentile = percentile.quantize(Decimal("0.01"))
    neighbors = _compute_neighbors(composite_by_scheme, names, series_id)
    percentiles = scheme_scores["percentiles"]

    today_start = datetime(today.year, today.month, today.day, tzinfo=timezone.utc)
    db.add(SchemeRanking(
        scheme_id=scheme.id, computed_at=today_start, composite_score=composite,
        category_rank=rank, category_size=ranked, percentile=percentile,
        return_1y=scheme_scores["return_1y"], return_3y=scheme_scores["return_3y"], return_5y=scheme_scores["return_5y"],
        category_relative=scheme_scores["category_relative"], downside_deviation=scheme_scores["downside_deviation"],
        ter_value=scheme_scores["ter_value"], return_3y_percentile=percentiles["return_3y"],
        return_5y_percentile=percentiles["return_5y"], category_relative_percentile=percentiles["category_relative"],
        volatility_percentile=percentiles["low_volatility"], ter_percentile=percentiles["low_ter"],
    ))
    try:
        await commit_off_loop(db)
    except IntegrityError:
        # Routine, not rare: recompute runs the combined scope and then each member,
        # so the same fund is written twice a day (Review Focus #4). Only this insert
        # is pending here; earlier sections and funds are already committed.
        db.rollback()

    return FundRankingRow(
        scheme_id=str(scheme.id), scheme_name=scheme.name, category_name=scheme.sebi_category,
        category_unavailable=False, insufficient_history=False,
        thin_category=ranked < _THIN_CATEGORY_THRESHOLD, too_few_peers=False,  # fix 3: ranked count
        composite_score=str(composite), category_rank=rank, category_size=ranked,
        category_universe_size=peers.fund_count, percentile=str(percentile),
        return_1y=_decimal_or_none_str(scheme_scores["return_1y"]), ranked_as=ranked_as, neighbors=neighbors,
        components=_components(scheme_scores, with_percentiles=True),
    )


async def compute_fund_ranking(db: Session, scheme: Scheme) -> FundRankingRow:
    if not scheme.sebi_category:
        return _empty_ranking_row(scheme, category_unavailable=True, insufficient_history=False)

    today = datetime.now(timezone.utc).date()
    peers = await get_category_peers(db, scheme.sebi_category, scheme.plan_type)
    cache_key = (canonical_category(scheme.sebi_category), scheme.plan_type)
    scores = await _category_ranking_scores(db, peers, cache_key, today)
    return await _finish_fund_ranking(db, scheme, peers, scores, today)


async def compute_portfolio_ranking(db: Session, household_member_ids: list[uuid.UUID]) -> FundRankingSummary:
    holdings = await compute_holdings(db, household_member_ids)
    if not holdings:
        return FundRankingSummary(funds=[])

    unique_scheme_ids = {h.scheme_id for h in holdings}
    schemes_by_id = {
        str(s.id): s
        for s in db.query(Scheme).filter(Scheme.id.in_([uuid.UUID(sid) for sid in unique_scheme_ids])).all()
    }

    today = datetime.now(timezone.utc).date()
    groups: dict[tuple, list[Scheme]] = {}
    row_by_scheme: dict[str, FundRankingRow] = {}
    for scheme_id_str, scheme in schemes_by_id.items():
        if not scheme.sebi_category:
            row_by_scheme[scheme_id_str] = _empty_ranking_row(scheme, category_unavailable=True, insufficient_history=False)
            continue
        groups.setdefault((canonical_category(scheme.sebi_category), scheme.plan_type), []).append(scheme)

    for cache_key, group_schemes in groups.items():
        peers = await get_category_peers(db, group_schemes[0].sebi_category, cache_key[1])
        scores = await _category_ranking_scores(db, peers, cache_key, today)
        for scheme in group_schemes:
            row_by_scheme[str(scheme.id)] = await _finish_fund_ranking(db, scheme, peers, scores, today)

    return FundRankingSummary(funds=[row_by_scheme[sid] for sid in unique_scheme_ids])


async def get_aggregate_fund_ranking(db: Session, user_id: uuid.UUID):
    from app.services.analytics.schemas import AggregateFundRankingResponse
    members = list_household_members(db, user_id)
    statuses = get_member_statuses(db, user_id)
    ranking = await compute_portfolio_ranking(db, [m.id for m in members])
    return AggregateFundRankingResponse(members=statuses, ranking=ranking)
