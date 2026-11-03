"""Return ranks within one category and plan type, independently per period."""
from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal
from typing import NamedTuple

from sqlalchemy.orm import Session

from app.models.reference import Scheme
from app.services.analytics.category_ranking import _category_returns_detailed
from app.services.analytics.schemas import PeriodRank, PerformanceRankingFund, PerformanceRankingResult
from app.services.analytics.scheme_universe import (
    CategoryPeers, canonical_category, get_category_peers, is_index_fund,
)
from app.services.dashboard.holdings import compute_holdings

_PERIODS = (("1Y", 0), ("3Y", 1), ("5Y", 2))
INDEX_FUND_DISCLAIMER_KEY = "index_fund_not_ranked"


def _is_index(scheme: Scheme) -> bool:
    # The rule (name words or an index/ETF regulator category) lives in one place.
    return is_index_fund(scheme.name, scheme.sebi_category)


class RankingPools(NamedTuple):
    """The ranked pool of one category and plan, per period, plus the peers behind it."""

    peers: CategoryPeers
    pools: dict[str, dict[uuid.UUID, Decimal]]   # period -> {fund series id: return}
    names: dict[uuid.UUID, str]


def new_ranking_row(scheme: Scheme) -> PerformanceRankingFund:
    """A fund's row before any rank is filled in (an index fund stays like this, with its disclaimer)."""
    index = _is_index(scheme)
    return PerformanceRankingFund(
        scheme_id=str(scheme.id), scheme_name=scheme.name, sebi_category=scheme.sebi_category or None,
        plan_type=scheme.plan_type.value if scheme.plan_type is not None else None,
        periods={period: PeriodRank(status="not_ranked_index_fund" if index else "not_enough_history")
                 for period, _ in _PERIODS},
        disclaimer_key=INDEX_FUND_DISCLAIMER_KEY if index else None,
    )


def is_rankable(scheme: Scheme) -> bool:
    # An unknown plan cannot be compared to an arbitrary Direct/Regular
    # universe. Leave its rank empty rather than silently mixing plans.
    return bool(not _is_index(scheme) and scheme.sebi_category and scheme.plan_type is not None)


async def load_ranking_pools(db: Session, scheme: Scheme, today: date) -> RankingPools:
    """The per-period pools a rankable fund is ranked in. Shared by the household ranking below and the CA
    export script."""
    key = (canonical_category(scheme.sebi_category), scheme.plan_type)
    peers = await get_category_peers(db, scheme.sebi_category, key[1])
    # Same shared key/universe as Category Ranking; the extra history view
    # reuses its bounded NAV lookup and 15-minute cache in either call order.
    detailed = await _category_returns_detailed(
        db, peers.schemes, today, cache_key=("peers", *key), include_short_history=True,
    )
    eligible = {s.id for s in peers.schemes if s.is_active and not _is_index(s)
                and canonical_category(s.sebi_category) == key[0] and s.plan_type == key[1]}
    pools = {period: {sid: values[position] for sid, values in detailed.items()
                      if sid in eligible and values[position] is not None}
             for period, position in _PERIODS}
    return RankingPools(peers, pools, {s.id: s.name for s in peers.schemes})


def apply_ranks(row: PerformanceRankingFund, scheme: Scheme, ranking: RankingPools) -> None:
    representative = ranking.peers.representative_of.get(scheme.id) if scheme.is_active else None
    if representative is not None and representative != scheme.id:
        row.ranked_as = ranking.names.get(representative)
    for period, _ in _PERIODS:
        pool = ranking.pools[period]
        own = pool.get(representative)
        # Standard competition rank: 1, 2, 2, 4. Missing returns do
        # not enter the period's denominator; zero returns do.
        row.periods[period] = PeriodRank(
            rank=1 + sum(value > own for value in pool.values()) if own is not None else None,
            total=len(pool), status="ranked" if own is not None else "not_enough_history",
        )


async def compute_performance_ranking(db: Session, scope: list[uuid.UUID]) -> PerformanceRankingResult:
    holdings = await compute_holdings(db, scope)
    ids = list(dict.fromkeys(str(holding.scheme_id) for holding in holdings))
    schemes = {str(s.id): s for s in db.query(Scheme).filter(Scheme.id.in_([uuid.UUID(sid) for sid in ids])).all()} if ids else {}
    groups = {}
    rows = {}
    for sid in ids:
        scheme = schemes.get(sid)
        if scheme is None:
            continue
        rows[sid] = new_ranking_row(scheme)
        if is_rankable(scheme):
            groups.setdefault((canonical_category(scheme.sebi_category), scheme.plan_type), []).append(scheme)
    today = date.today()
    for held in groups.values():
        ranking = await load_ranking_pools(db, held[0], today)
        for scheme in held:
            apply_ranks(rows[str(scheme.id)], scheme, ranking)
    return PerformanceRankingResult(funds=[rows[sid] for sid in ids if sid in rows])
