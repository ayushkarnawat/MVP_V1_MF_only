"""Attribute 10: raw fund weights for pairs, portfolio weights for concentration."""
from __future__ import annotations

import uuid
from collections import defaultdict
from decimal import Decimal
from itertools import combinations

from sqlalchemy.orm import Session

from app.models.enums import AssetType
from app.services.analytics.lookthrough import get_disclosure_scope, get_lookthrough_table, LookthroughTable
from app.services.analytics.equity_universe import (
    _is_debt_or_arbitrage, is_equity_fund, net_domestic_equity_pct,
)
from app.services.analytics.schemas import (
    ExcludedFund, ConcentrationPoint, OverlapBands, OverlapCommonStock, OverlapDriver, OverlapFund, OverlapImpactPair,
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
    eligible, excluded = set(), []
    for sid in scope.values:
        scheme = scope.schemes[sid]
        net_equity = net_domestic_equity_pct(db, sid)
        if net_equity is None or sid not in scope.selected:
            reason = "We don't have this fund's holdings yet, so it isn't counted here."
        elif _is_debt_or_arbitrage(scheme.sebi_category or ""):
            reason = "This is a debt fund, so it isn't counted in an equity overlap."
        elif not is_equity_fund(scheme.sebi_category, net_equity):
            # A type that fails even at 100% domestic equity is left out by its category, not by the 65% rule.
            reason = ("This type of fund isn't counted in an equity overlap."
                      if not is_equity_fund(scheme.sebi_category, Decimal("100"))
                      else "Less than 65% of this fund is in Indian shares, so it isn't counted.")
        else:
            eligible.add(sid)
            continue
        excluded.append(ExcludedFund(name=scheme.name, reason=reason))
    funds = [OverlapFund(scheme_id=sid, scheme_name=scope.schemes[sid].name, current_value=scope.values[sid]) for sid in scope.selected if sid in eligible]
    funds.sort(key=lambda f: (-f.current_value, str(f.scheme_id)))
    weights = {fund.scheme_id: _stock_weights(rows[fund.scheme_id]) for fund in funds}
    # Calculate every eligible pair once, before applying any matrix cap.
    pairs = []
    for fund_a, fund_b in combinations(funds, 2):
        result = _pair_result(weights[fund_a.scheme_id], weights[fund_b.scheme_id])
        pairs.append(OverlapPair(fund_a=fund_a, fund_b=fund_b, **result.model_dump()))
    shared = dict(
        common_stock_limit=COMMON_STOCK_LIMIT,
        bands=OverlapBands(low=OVERLAP_BAND_LOW, high=OVERLAP_BAND_HIGH),
        concentration=compute_concentration(table),
        total_stock_count=sum(r.asset_type in _EQUITY for r in table.rows),
        nav_as_of=table.nav_as_of, holdings_as_of=table.holdings_as_of,
        total_portfolio_value=table.total_portfolio_value, coverage=table.coverage,
        hide_headlines=table.hide_headlines, excluded_share=table.excluded_share,
    )

    def summary(selected_funds, selected_pairs):
        top_ids = {f.scheme_id for f in selected_funds[:OVERLAP_MAX_FUNDS]}
        matrix = [p for p in selected_pairs if p.fund_a.scheme_id in top_ids and p.fund_b.scheme_id in top_ids]
        order = lambda p: (-p.overlap_pct, str(p.fund_a.scheme_id), str(p.fund_b.scheme_id))
        above = sorted((p for p in selected_pairs if p.overlap_pct > OVERLAP_BAND_LOW), key=order)
        at_low = sorted((p for p in selected_pairs if p.overlap_pct == OVERLAP_BAND_LOW), key=order)
        return OverlapSummary(
            equity_funds=selected_funds,
            matrix_funds=selected_funds[:OVERLAP_MAX_FUNDS], matrix=matrix,
            pairs_above_low=above, pairs_at_low_boundary=at_low,
            impact_pairs=[_impact(pair) for pair in above[:IMPACT_PAIRS]],
            matrix_truncated=len(selected_funds) > OVERLAP_MAX_FUNDS,
            total_fund_count=len(selected_funds), **shared,
        )

    result = summary(funds, pairs)
    result.excluded_funds = excluded
    for category in ("Large Cap", "Mid Cap", "Small Cap", "Flexi Cap"):
        # Exact category suffix: Large & Mid Cap and Multi Cap belong only in All funds.
        category_funds = [f for f in funds if
            scope.schemes[f.scheme_id].sebi_category.casefold().split(" - ")[-1] == f"{category.casefold()} fund"]
        ids = {f.scheme_id for f in category_funds}
        category_pairs = [p for p in pairs if p.fund_a.scheme_id in ids and p.fund_b.scheme_id in ids]
        child = summary(category_funds, category_pairs)
        if len(category_funds) < 2:
            child.message = "No funds in this category." if not category_funds else "Overlap needs at least two funds with published holdings."
        result.by_category[category] = child
    return result
