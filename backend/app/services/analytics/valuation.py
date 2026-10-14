"""Attribute 15: harmonic portfolio ratios, with independent equity-value coverage."""
from __future__ import annotations

import uuid
from decimal import Decimal, ROUND_HALF_UP

from sqlalchemy.orm import Session

from app.models.enums import AssetType, BenchmarkIndex, BenchmarkReturnType
from app.models.reference import BenchmarkIndexHistory, StockMaster
from app.services.analytics.lookthrough import get_lookthrough_table
from app.services.analytics.schemas import (
    ValuationMissingHolding, ValuationMetric, ValuationIndex, ValuationSummary,
)

VALUATION_MIN_COVERAGE = Decimal("0.70")
_EQUITY = {AssetType.EQUITY_DOMESTIC, AssetType.EQUITY_INTERNATIONAL}
_ZERO = Decimal(0)
_PRECISION = Decimal("0.000001")


async def compute_valuation(db: Session, household_member_ids: list[uuid.UUID]) -> ValuationSummary:
    table = await get_lookthrough_table(db, household_member_ids)
    equity = [r for r in table.rows if r.asset_type in _EQUITY]
    total_equity = sum((r.exposure_value for r in equity), _ZERO)
    isins = {r.isin for r in equity if r.isin is not None}
    master = {s.isin: s for s in db.query(StockMaster).filter(StockMaster.isin.in_(isins)).all()} if isins else {}

    def metric(field):
        covered, inverse, dates, missing = _ZERO, _ZERO, [], []
        for row in equity:
            stock = master.get(row.isin)
            ratio = getattr(stock, field) if stock else None
            valid = ratio is not None and ratio.is_finite() and ratio > 0
            if valid:
                covered += row.exposure_value
                inverse += row.exposure_value / ratio
                dates.append(stock.as_of_date)
            else:
                reason = ("No ISIN disclosed" if row.isin is None else "No fundamentals available for this ISIN" if stock is None
                          else stock.footnote
                          or ("P/E excluded: loss-making or unavailable earnings" if field == "pe_ratio" else "P/B unavailable"))
                missing.append(ValuationMissingHolding(
                    isin=row.isin, instrument_name=row.instrument_name, exposure_value=row.exposure_value,
                    percentage_equity=row.exposure_value / total_equity * 100 if total_equity else _ZERO, reason=reason,
                ))
        fraction = covered / total_equity if total_equity else _ZERO
        enough = bool(total_equity and fraction >= VALUATION_MIN_COVERAGE and inverse > 0)
        ratio = (covered / inverse).quantize(_PRECISION, rounding=ROUND_HALF_UP) if enough and not table.hide_headlines else None
        return ValuationMetric(ratio=ratio, coverage_pct=fraction*100, enough_data=enough,
                               as_of_date=min(dates, default=None), missing=missing)

    pe, pb = metric("pe_ratio"), metric("pb_ratio")
    rows = db.query(BenchmarkIndexHistory).filter(
        BenchmarkIndexHistory.index_name.in_((BenchmarkIndex.NIFTY_50, BenchmarkIndex.NIFTY_500)),
        BenchmarkIndexHistory.return_type.in_((BenchmarkReturnType.PE, BenchmarkReturnType.PB)),
        BenchmarkIndexHistory.date <= table.nav_as_of,
    ).order_by(BenchmarkIndexHistory.date.desc()).all() if table.nav_as_of else []
    latest = {}
    for row in rows:
        latest.setdefault((row.index_name, row.return_type), row)
    indices = []
    for index in (BenchmarkIndex.NIFTY_50, BenchmarkIndex.NIFTY_500):
        index_pe, index_pb = latest.get((index, BenchmarkReturnType.PE)), latest.get((index, BenchmarkReturnType.PB))
        def delta(portfolio, benchmark):
            return ((portfolio / benchmark.value - 1)*100).quantize(_PRECISION, rounding=ROUND_HALF_UP) if portfolio is not None and benchmark and benchmark.value > 0 else None
        indices.append(ValuationIndex(
            index_name=index, pe_ratio=index_pe.value if index_pe else None, pb_ratio=index_pb.value if index_pb else None,
            pe_as_of=index_pe.date if index_pe else None, pb_as_of=index_pb.date if index_pb else None,
            pe_delta_pct=delta(pe.ratio, index_pe), pb_delta_pct=delta(pb.ratio, index_pb),
        ))
    notes = {s.footnote for s in master.values() if s.footnote}
    if any(s.pb_source == "SCREENER" for s in master.values()):
        notes.add("Some P/B values use screener.in fallback (current price / book value).")
    return ValuationSummary(
        pe=pe, pb=pb, indices=indices, total_equity_value=total_equity,
        total_portfolio_value=table.total_portfolio_value, nav_as_of=table.nav_as_of, holdings_as_of=table.holdings_as_of,
        coverage=table.coverage, hide_headlines=table.hide_headlines, excluded_share=table.excluded_share,
        footnotes=sorted(notes),
    )
