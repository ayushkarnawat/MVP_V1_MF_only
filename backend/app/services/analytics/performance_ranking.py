"""Return ranks within one category and plan type, independently per period."""
from __future__ import annotations

import re
import uuid
from datetime import date

from sqlalchemy.orm import Session

from app.models.reference import Scheme
from app.services.analytics.category_ranking import _category_returns_detailed
from app.services.analytics.schemas import PeriodRank, PerformanceRankingFund, PerformanceRankingResult
from app.services.analytics.scheme_universe import canonical_category, get_category_peers
from app.services.dashboard.holdings import compute_holdings

_PERIODS = (("1Y", 0), ("3Y", 1), ("5Y", 2))
INDEX_FUND_DISCLAIMER_KEY = "index_fund_not_ranked"


def _is_index(scheme: Scheme) -> bool:
    # No dedicated model flag exists. Use explicit index/ETF words in the
    # scheme name or SEBI category; never infer this from its return level.
    return bool(re.search(r"\b(?:index|etfs?)\b", f"{scheme.name} {scheme.sebi_category}", re.I))


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
        index = _is_index(scheme)
        row = PerformanceRankingFund(
            scheme_id=sid, scheme_name=scheme.name, sebi_category=scheme.sebi_category or None,
            plan_type=scheme.plan_type.value if scheme.plan_type is not None else None,
            periods={period: PeriodRank(status="not_ranked_index_fund" if index else "not_enough_history")
                     for period, _ in _PERIODS},
            disclaimer_key=INDEX_FUND_DISCLAIMER_KEY if index else None,
        )
        rows[sid] = row
        # An unknown plan cannot be compared to an arbitrary Direct/Regular
        # universe. Leave its rank empty rather than silently mixing plans.
        if not index and scheme.sebi_category and scheme.plan_type is not None:
            groups.setdefault((canonical_category(scheme.sebi_category), scheme.plan_type), []).append(scheme)
    today = date.today()
    for key, held in groups.items():
        peers = await get_category_peers(db, held[0].sebi_category, key[1])
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
        names = {s.id: s.name for s in peers.schemes}
        for scheme in held:
            row = rows[str(scheme.id)]
            representative = peers.representative_of.get(scheme.id) if scheme.is_active else None
            if representative is not None and representative != scheme.id:
                row.ranked_as = names.get(representative)
            for period, _ in _PERIODS:
                pool = pools[period]
                own = pool.get(representative)
                # Standard competition rank: 1, 2, 2, 4. Missing returns do
                # not enter the period's denominator; zero returns do.
                row.periods[period] = PeriodRank(
                    rank=1 + sum(value > own for value in pool.values()) if own is not None else None,
                    total=len(pool), status="ranked" if own is not None else "not_enough_history",
                )
    return PerformanceRankingResult(funds=[rows[sid] for sid in ids if sid in rows])
