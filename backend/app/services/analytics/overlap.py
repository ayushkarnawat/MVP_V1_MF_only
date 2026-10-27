"""Attribute 10: raw fund weights for pairs, portfolio weights for concentration."""
from __future__ import annotations

import uuid
from collections import defaultdict
from decimal import Decimal
from itertools import combinations

from sqlalchemy.orm import Session

from app.models.enums import AssetType
from app.services.analytics.lookthrough import get_disclosure_scope, get_lookthrough_table, LookthroughTable
from app.services.analytics.schemas import (
    ConcentrationPoint, OverlapBands, OverlapCommonStock, OverlapDriver, OverlapFund, OverlapImpactPair,
    OverlapPair, OverlapResult, OverlapSummary,
)

OVERLAP_BAND_LOW = Decimal("20")
OVERLAP_BAND_HIGH = Decimal("40")
OVERLAP_MAX_FUNDS = 12
COMMON_STOCK_LIMIT = 20
IMPACT_PAIRS = 3
IMPACT_DRIVERS = 5
_EQUITY = {AssetType.EQUITY_DOMESTIC, AssetType.EQUITY_INTERNATIONAL}
_ZERO = Decimal(0)


def _stock_weights(rows):
    weights = {}
    for row in rows:
        if row.asset_type in _EQUITY and row.isin is not None:
            name, weight = weights.get(row.isin, (row.instrument_name, _ZERO))
            weights[row.isin] = (name, weight + row.pct_to_nav)
    return weights


def _pair_result(a, b) -> OverlapResult:
    stocks = [OverlapCommonStock(isin=isin, instrument_name=a[isin][0],
              weight_a=a[isin][1], weight_b=b[isin][1]) for isin in a.keys() & b.keys()]
    stocks.sort(key=lambda stock: (-min(stock.weight_a, stock.weight_b), stock.isin))
    # Sum the complete intersection before limiting the drill-down payload.
    return OverlapResult(
        overlap_pct=sum((min(s.weight_a, s.weight_b) for s in stocks), _ZERO),
        common_total=len(stocks), common_stocks=stocks[:COMMON_STOCK_LIMIT],
    )


def compute_fund_pair_overlap(rows_a, rows_b) -> OverlapResult:
    """Stock-only share of net assets, independent of household fund values."""
    return _pair_result(_stock_weights(rows_a), _stock_weights(rows_b))


def compute_concentration(table: LookthroughTable) -> list[ConcentrationPoint]:
    equity = sorted((r for r in table.rows if r.asset_type in _EQUITY), key=lambda r: -r.exposure_pct)
    counts = sorted({min(n, len(equity)) for n in (5, 10, 20, 50)} - {0})
    return [ConcentrationPoint(stock_count=n, exposure_pct=sum((r.exposure_pct for r in equity[:n]), _ZERO)) for n in counts]


def _impact(pair: OverlapPair) -> OverlapImpactPair:
    # common_stocks is already largest shared weight first, so its head is the top drivers.
    return OverlapImpactPair(
        fund_a=pair.fund_a, fund_b=pair.fund_b, overlap_pct=pair.overlap_pct,
        drivers=[OverlapDriver(isin=s.isin, instrument_name=s.instrument_name,
                               contribution_pct=min(s.weight_a, s.weight_b),
                               share_of_pair_pct=min(s.weight_a, s.weight_b) / pair.overlap_pct * 100)
                 for s in pair.common_stocks[:IMPACT_DRIVERS]],
    )


async def compute_overlap(db: Session, household_member_ids: list[uuid.UUID]) -> OverlapSummary:
    scope = await get_disclosure_scope(db, household_member_ids)
    table = await get_lookthrough_table(db, household_member_ids)
    by_batch = {batch.id: sid for sid, batch in scope.selected.items()}
    rows = defaultdict(list)
    for row in scope.raw_rows:
        rows[by_batch[row.batch_id]].append(row)
    funds = [OverlapFund(scheme_id=sid, scheme_name=scope.schemes[sid].name, current_value=scope.values[sid]) for sid in scope.selected]
    funds.sort(key=lambda f: (-f.current_value, str(f.scheme_id)))
    weights = {fund.scheme_id: _stock_weights(rows[fund.scheme_id]) for fund in funds}
    top_ids = {f.scheme_id for f in funds[:OVERLAP_MAX_FUNDS]}
    matrix, above, at_low = [], [], []
    for fund_a, fund_b in combinations(funds, 2):
        result = _pair_result(weights[fund_a.scheme_id], weights[fund_b.scheme_id])
        pair = OverlapPair(fund_a=fund_a, fund_b=fund_b, **result.model_dump())
        if fund_a.scheme_id in top_ids and fund_b.scheme_id in top_ids:
            matrix.append(pair)
        if pair.overlap_pct > OVERLAP_BAND_LOW:
            above.append(pair)
        elif pair.overlap_pct == OVERLAP_BAND_LOW:
            at_low.append(pair)
    order = lambda p: (-p.overlap_pct, str(p.fund_a.scheme_id), str(p.fund_b.scheme_id))
    above.sort(key=order)
    at_low.sort(key=order)
    return OverlapSummary(
        matrix_funds=funds[:OVERLAP_MAX_FUNDS], matrix=matrix, pairs_above_low=above,
        impact_pairs=[_impact(pair) for pair in above[:IMPACT_PAIRS]], pairs_at_low_boundary=at_low,
        matrix_truncated=len(funds) > OVERLAP_MAX_FUNDS, total_fund_count=len(funds),
        common_stock_limit=COMMON_STOCK_LIMIT,
        bands=OverlapBands(low=OVERLAP_BAND_LOW, high=OVERLAP_BAND_HIGH),
        concentration=compute_concentration(table),
        total_stock_count=sum(r.asset_type in _EQUITY for r in table.rows),
        nav_as_of=table.nav_as_of, holdings_as_of=table.holdings_as_of,
        total_portfolio_value=table.total_portfolio_value, coverage=table.coverage,
        hide_headlines=table.hide_headlines, excluded_share=table.excluded_share,
    )
