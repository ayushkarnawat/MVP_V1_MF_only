from __future__ import annotations

from collections import defaultdict
from datetime import date
from decimal import Decimal

from sqlalchemy.orm import Session

from app.core.decimal_utils import quantize_amount
from app.models.enums import MarketCapBucket
from app.models.reference import Scheme, StockMaster
from app.services.analytics.cap_allocation import classify_isins
from app.services.analytics.lookthrough import compute_disclosure_scope
from app.services.analytics.overlap import _stock_weights, compute_fund_pair_overlap
from app.services.dashboard.holdings import compute_holdings
from app.services.fund_page.composition import sector_for
from app.services.fund_page.schemas import (
    AmountPctOut,
    CommonHoldingOut,
    ComparisonCommonHoldingOut,
    ComparisonCounts,
    ComparisonFundOut,
    ComparisonImpact,
    ComparisonMarketCap,
    FundComparisonResponse,
    FundOverlapCoverage,
    FundOverlapResponse,
    HeldInFundOut,
    MarketCapFundOut,
    MissingDisclosureFundOut,
    OverlapDistribution,
    OverlapSectorOut,
    SectorComparisonOut,
    SectorStockOut,
    TopOverlapFundOut,
    Unavailable,
    UniqueHoldingOut,
    UniqueHoldingsOut,
    plain,
)
from app.services.fund_page.scope import ScopeContext


_ZERO = Decimal("0")
_HUNDRED = Decimal("100")


async def _scope(db: Session, ctx: ScopeContext):
    holdings = await compute_holdings(
        db, ctx.member_ids, allow_stale_today=True, stored_only=True,
    )
    return await compute_disclosure_scope(db, ctx.member_ids, holdings=holdings)


def _rows_by_scheme(scope):
    by_batch = {batch.id: scheme_id for scheme_id, batch in scope.selected.items()}
    result = defaultdict(list)
    for row in scope.raw_rows:
        result[by_batch[row.batch_id]].append(row)
    return result


def _sectors(db: Session, rows) -> dict[str, str | None]:
    isins = {row.isin for row in rows if row.isin}
    if not isins:
        return {}
    return {
        stock.isin: stock.sector
        for stock in db.query(StockMaster).filter(StockMaster.isin.in_(isins)).all()
    }


def _sector(row, stock_sectors) -> str:
    value = sector_for(row, stock_sectors)
    return "Other" if value == "Unclassified" else value


def _missing_disclosures(scope) -> list[MissingDisclosureFundOut]:
    funds = [
        *scope.coverage.not_published_yet,
        *scope.coverage.not_available_from_amc,
        *scope.coverage.missing_value_schemes,
    ]
    unique = {fund.scheme_id: fund for fund in funds}
    return [
        MissingDisclosureFundOut(scheme_id=str(fund.scheme_id), scheme_name=fund.scheme_name)
        for fund in sorted(unique.values(), key=lambda item: str(item.scheme_id))
    ]


def _distribution(target: set[str], others: set[str]) -> OverlapDistribution:
    common = target & others
    only_target = target - others
    only_others = others - target
    union_count = len(target | others)

    def pct(count: int) -> str:
        value = Decimal(count) / Decimal(union_count) * _HUNDRED if union_count else _ZERO
        return plain(value, 4)

    return OverlapDistribution(
        unique_to_fund_count=len(only_target), common_count=len(common),
        unique_to_others_count=len(only_others), unique_to_fund_pct=pct(len(only_target)),
        common_pct=pct(len(common)), unique_to_others_pct=pct(len(only_others)),
    )


async def build_fund_overlap(
    db: Session, scheme: Scheme, ctx: ScopeContext, today: date,
) -> FundOverlapResponse | Unavailable:
    del today
    scope = await _scope(db, ctx)
    if scheme.id not in scope.values:
        return Unavailable(reason="not_held")
    if scheme.id not in scope.selected:
        return Unavailable(reason="no_disclosure")
    rows_by_scheme = _rows_by_scheme(scope)
    target_rows = rows_by_scheme[scheme.id]
    target_weights = _stock_weights(target_rows)
    other_weights = {
        scheme_id: _stock_weights(rows)
        for scheme_id, rows in rows_by_scheme.items() if scheme_id != scheme.id
    }
    others_union = set().union(*(weights for weights in other_weights.values())) if other_weights else set()
    common_isins = set(target_weights) & others_union
    all_rows = [row for rows in rows_by_scheme.values() for row in rows]
    stock_sectors = _sectors(db, all_rows)
    row_by_isin = {row.isin: row for row in target_rows if row.isin}

    common_holdings = []
    for isin in common_isins:
        name, fund_weight = target_weights[isin]
        portfolio_weight = sum((
            weights.get(isin, ("", _ZERO))[1] * scope.values[scheme_id] / scope.total
            for scheme_id, weights in {scheme.id: target_weights, **other_weights}.items()
        ), _ZERO) if scope.total else _ZERO
        held_in = [
            HeldInFundOut(scheme_id=str(scheme_id), scheme_name=scope.schemes[scheme_id].name)
            for scheme_id, weights in other_weights.items() if isin in weights
        ]
        held_in.sort(key=lambda item: item.scheme_id)
        common_holdings.append(CommonHoldingOut(
            isin=isin, name=name, sector=_sector(row_by_isin[isin], stock_sectors),
            fund_weight=plain(fund_weight, 4), portfolio_weight=plain(portfolio_weight, 4),
            held_in_funds=held_in,
        ))
    common_holdings.sort(key=lambda row: (-Decimal(row.fund_weight), row.isin))

    sector_rows = defaultdict(list)
    for row in common_holdings:
        sector_rows[row.sector].append(row)
    by_sector = []
    for sector, rows in sector_rows.items():
        weight = sum((Decimal(row.fund_weight) for row in rows), _ZERO)
        by_sector.append(OverlapSectorOut(
            sector=sector, pct=plain(weight, 4),
            stocks=[SectorStockOut(isin=row.isin, name=row.name, weight=row.fund_weight) for row in rows],
        ))
    by_sector.sort(key=lambda row: (-Decimal(row.pct), row.sector))

    top = []
    for scheme_id, rows in rows_by_scheme.items():
        if scheme_id == scheme.id:
            continue
        pair = compute_fund_pair_overlap(target_rows, rows)
        top.append(TopOverlapFundOut(
            scheme_id=str(scheme_id), scheme_name=scope.schemes[scheme_id].name,
            overlap_pct=plain(pair.overlap_pct, 4), common_stock_count=pair.common_total,
        ))
    top.sort(key=lambda row: (-Decimal(row.overlap_pct), row.scheme_id))

    overlap_pct = sum((target_weights[isin][1] for isin in common_isins), _ZERO)
    return FundOverlapResponse(
        scheme_id=str(scheme.id), holdings_as_of=scope.selected[scheme.id].as_of_date,
        overlap_pct=plain(overlap_pct, 4), common_stock_count=len(common_isins),
        total_stock_count=len(target_weights), distribution=_distribution(set(target_weights), others_union),
        common_holdings=common_holdings, by_sector=by_sector, top_overlap_funds=top,
        coverage=FundOverlapCoverage(
            covered_value_pct=plain(scope.coverage.covered_value_pct, 4),
            funds_without_disclosure=_missing_disclosures(scope),
        ),
    )


def _amount_pct(amount: Decimal, total: Decimal) -> AmountPctOut:
    return AmountPctOut(
        amount=plain(quantize_amount(amount), 2),
        pct=plain(amount / total * _HUNDRED if total else _ZERO, 4),
    )


def _market_cap(db: Session, rows, as_of: date) -> MarketCapFundOut:
    weights = _stock_weights(rows)
    classifications = classify_isins(db, set(weights), as_of)
    totals = {bucket: _ZERO for bucket in MarketCapBucket}
    other = _ZERO
    for isin, (_name, weight) in weights.items():
        bucket = classifications.get(isin)
        if bucket is None:
            other += weight
        else:
            totals[bucket] += weight
    total = sum(totals.values(), other)

    def share(value: Decimal) -> str:
        return plain(value / total * _HUNDRED if total else _ZERO, 4)

    return MarketCapFundOut(
        large=share(totals[MarketCapBucket.LARGE]),
        mid=share(totals[MarketCapBucket.MID]),
        small=share(totals[MarketCapBucket.SMALL]), other=share(other),
    )


async def build_fund_comparison(
    db: Session, scheme_a: Scheme, scheme_b: Scheme, ctx: ScopeContext, today: date,
) -> FundComparisonResponse | Unavailable:
    del today
    scope = await _scope(db, ctx)
    if scheme_a.id not in scope.values or scheme_b.id not in scope.values:
        return Unavailable(reason="not_held")
    if scheme_a.id not in scope.selected or scheme_b.id not in scope.selected:
        return Unavailable(reason="no_disclosure")
    rows_by_scheme = _rows_by_scheme(scope)
    rows_a, rows_b = rows_by_scheme[scheme_a.id], rows_by_scheme[scheme_b.id]
    weights_a, weights_b = _stock_weights(rows_a), _stock_weights(rows_b)
    common = set(weights_a) & set(weights_b)
    unique_a, unique_b = set(weights_a) - common, set(weights_b) - common
    pair = compute_fund_pair_overlap(rows_a, rows_b)
    value_a, value_b = scope.values[scheme_a.id], scope.values[scheme_b.id]
    common_amount = sum((
        weights_a[isin][1] * value_a / _HUNDRED + weights_b[isin][1] * value_b / _HUNDRED
        for isin in common
    ), _ZERO)
    unique_a_amount = sum((weights_a[isin][1] * value_a / _HUNDRED for isin in unique_a), _ZERO)
    unique_b_amount = sum((weights_b[isin][1] * value_b / _HUNDRED for isin in unique_b), _ZERO)
    other_amount = max(scope.total - common_amount - unique_a_amount - unique_b_amount, _ZERO)
    all_rows = [*rows_a, *rows_b]
    stock_sectors = _sectors(db, all_rows)
    row_by_isin = {row.isin: row for row in all_rows if row.isin}

    common_holdings = []
    sector_totals = defaultdict(lambda: [_ZERO, _ZERO, _ZERO])
    for isin in common:
        sector = _sector(row_by_isin[isin], stock_sectors)
        weight_a, weight_b = weights_a[isin][1], weights_b[isin][1]
        sector_totals[sector][0] += min(weight_a, weight_b)
        sector_totals[sector][1] += weight_a
        sector_totals[sector][2] += weight_b
        common_holdings.append(ComparisonCommonHoldingOut(
            isin=isin, name=weights_a[isin][0], sector=sector,
            weight_a=plain(weight_a, 4), weight_b=plain(weight_b, 4),
            combined=plain(weight_a * value_a / _HUNDRED + weight_b * value_b / _HUNDRED, 2),
        ))
    common_holdings.sort(key=lambda row: (-Decimal(row.combined), row.isin))
    for isin in unique_a:
        sector_totals[_sector(row_by_isin[isin], stock_sectors)][1] += weights_a[isin][1]
    for isin in unique_b:
        sector_totals[_sector(row_by_isin[isin], stock_sectors)][2] += weights_b[isin][1]

    def unique_rows(isins, weights):
        rows = [UniqueHoldingOut(
            isin=isin, name=weights[isin][0], sector=_sector(row_by_isin[isin], stock_sectors),
            weight=plain(weights[isin][1], 4),
        ) for isin in isins]
        return sorted(rows, key=lambda row: (-Decimal(row.weight), row.isin))[:5]

    batch_a, batch_b = scope.selected[scheme_a.id], scope.selected[scheme_b.id]
    return FundComparisonResponse(
        fund_a=ComparisonFundOut(
            scheme_id=str(scheme_a.id), scheme_name=scheme_a.name,
            holdings_as_of=batch_a.as_of_date, current_value=plain(value_a, 2),
        ),
        fund_b=ComparisonFundOut(
            scheme_id=str(scheme_b.id), scheme_name=scheme_b.name,
            holdings_as_of=batch_b.as_of_date, current_value=plain(value_b, 2),
        ),
        overlap_pct=plain(pair.overlap_pct, 4),
        counts=ComparisonCounts(unique_a=len(unique_a), common=len(common), unique_b=len(unique_b)),
        impact=ComparisonImpact(
            common_both=_amount_pct(common_amount, scope.total),
            unique_a=_amount_pct(unique_a_amount, scope.total),
            unique_b=_amount_pct(unique_b_amount, scope.total),
            other_funds=_amount_pct(other_amount, scope.total),
        ),
        sector_comparison=[
            SectorComparisonOut(
                sector=sector, common=plain(values[0], 4),
                a=plain(values[1], 4), b=plain(values[2], 4),
            )
            for sector, values in sorted(
                sector_totals.items(), key=lambda item: (-item[1][0], item[0])
            )
        ],
        common_holdings=common_holdings,
        unique_holdings=UniqueHoldingsOut(
            a=unique_rows(unique_a, weights_a), b=unique_rows(unique_b, weights_b),
        ),
        market_cap=ComparisonMarketCap(
            a=_market_cap(db, rows_a, batch_a.as_of_date),
            b=_market_cap(db, rows_b, batch_b.as_of_date),
        ),
    )
