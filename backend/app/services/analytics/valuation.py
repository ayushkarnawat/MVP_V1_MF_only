"""Attribute 15: harmonic portfolio ratios, with independent equity-value coverage."""
from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal, ROUND_DOWN, ROUND_HALF_UP
from typing import NamedTuple

from sqlalchemy.orm import Session

from app.models.enums import AssetType, BenchmarkIndex, BenchmarkReturnType
from app.models.reference import BenchmarkIndexHistory, StockMaster, SchemeReportedValuation
from app.services.analytics.lookthrough import get_lookthrough_table, get_disclosure_scope, HEADLINE_MIN_COVERAGE
from app.services.analytics.schemas import (
    ValuationMissingHolding, ValuationMetric, ValuationIndex, ValuationSummary, ValuationValue, ValuationFund,
)

# Owner decision, 2 Nov 2026: a P/E or P/B is shown when at least 60% of the equity (by value) has a usable ratio.
# This is the only place the number lives; every sentence that names it is built from it.
VALUATION_MIN_COVERAGE = Decimal("0.60")
_EQUITY = {AssetType.EQUITY_DOMESTIC, AssetType.EQUITY_INTERNATIONAL}
_ZERO = Decimal(0)
_PRECISION = Decimal("0.000001")
_HUNDRED = Decimal(100)


def _whole_percent(value: Decimal) -> int:
    # Rounded down on purpose: a withheld value must never read "60% available, 60% needed" because 59.6 rounded up.
    return int(value.quantize(Decimal(1), rounding=ROUND_DOWN))


def _rule_percent() -> int:
    return int(VALUATION_MIN_COVERAGE * _HUNDRED)


def _label(field: str) -> str:
    return "P/E" if field == "pe_ratio" else "P/B"


def _withheld_reason(subject: str, field: str, share: Decimal, metric: ValuationMetric, losses: list[str]) -> str:
    """Plain reason a P/E or P/B is withheld because of the ratio data itself. `subject` is 'portfolio' or 'fund';
    `share` is the percentage of its shares that has a usable figure."""
    label = _label(field)
    if not metric.missing and not metric.overseas and not losses and metric.coverage_pct == 0 and share == 0:
        # Every stock row is either covered, missing or overseas, so none of those means no shares at all.
        return f"Not available: this {subject} holds no shares, so there is no {label} to show."
    if (losses and share == 0 and not metric.overseas and len(losses) == len(metric.missing)
            and metric.coverage_pct == 0):
        return (f"Not available: every share in this {subject} with an earnings figure is loss-making, "
                f"so a {label} cannot be worked out.")
    if subject == "portfolio":
        # For the portfolio `share` is the part of the equity held in funds that HAVE a figure, not a share of
        # stocks: two funds each 55% covered are both withheld, so this is 0% although 55% of the stocks have one.
        return (f"Not enough data: {label} is available for funds holding {_whole_percent(share)}% of your equity, "
                f"and we need at least {_rule_percent()}%.")
    return (f"Not enough data: {label} is available for {_whole_percent(share)}% of this {subject}'s shares, "
            f"and we need at least {_rule_percent()}%.")


def resolve_fund_ratio(
    reported: SchemeReportedValuation | None, computed: ValuationValue, nav_date: date,
) -> ValuationValue:
    """Caller supplies the latest scheme/metric record on or before this NAV date."""
    if (reported is not None and 0 <= (nav_date - reported.reference_period).days <= 75
            and reported.value.is_finite() and reported.value > 0):
        return ValuationValue(value=str(reported.value), source="factsheet", as_of=reported.reference_period,
                              basis=reported.basis, method=reported.method)
    return computed


def _stock_metric(entries, field, master):
    covered, inverse, total, dates, missing, overseas, losses = _ZERO, _ZERO, _ZERO, [], [], [], []
    for row, value in entries:
        total += value
        stock = master.get(row.isin)
        ratio = getattr(stock, field) if stock else None
        valid = ratio is not None and ratio.is_finite() and ratio > 0
        if valid:
            covered += value
            inverse += value / ratio
            dates.append(getattr(stock, "pe_as_of" if field == "pe_ratio" else "pb_as_of") or stock.as_of_date)
        else:
            loss = field == "pe_ratio" and ratio is not None and ratio.is_finite() and ratio <= 0
            if loss:
                losses.append(row.instrument_name)
            reason = ("Loss-making stock: negative or zero earnings" if loss else
                      "No ISIN disclosed" if row.isin is None else
                      "No fundamentals available for this ISIN" if stock is None else
                      stock.footnote or ("Earnings are unavailable or not positive" if field == "pe_ratio" else "P/B unavailable"))
            if row.asset_type == AssetType.EQUITY_INTERNATIONAL:
                reason = "Overseas stock; a ratio is not available yet."
            target = overseas if row.asset_type == AssetType.EQUITY_INTERNATIONAL else missing
            target.append(ValuationMissingHolding(
                isin=row.isin, instrument_name=row.instrument_name, exposure_value=value,
                percentage_equity=_ZERO, reason=reason,
            ))
    fraction = covered / total if total else _ZERO
    enough = bool(total and fraction >= VALUATION_MIN_COVERAGE and inverse > 0)
    for holding in missing + overseas:
        holding.percentage_equity = holding.exposure_value / total * 100 if total else _ZERO
    return ValuationMetric(
        ratio=(covered / inverse).quantize(_PRECISION, rounding=ROUND_HALF_UP) if enough else None,
        coverage_pct=fraction * 100, enough_data=enough, as_of_date=min(dates, default=None),
        missing=missing, overseas=overseas,
    ), losses


def _fund_computed(metric: ValuationMetric, losses: list[str], field: str, nav_date: date) -> ValuationValue:
    notes = []
    if not metric.enough_data:
        notes.append(f"Less than {_rule_percent()}% of this fund's equity has a usable {_label(field)} value.")
    if losses:
        notes.append("Loss-making stocks: " + ", ".join(sorted(set(losses))) + ".")
    if metric.overseas:
        notes.append("Overseas stocks without ratios: " + ", ".join(sorted({r.instrument_name for r in metric.overseas})) + ".")
    return ValuationValue(
        value=str(metric.ratio) if metric.ratio is not None else None,
        source="computed" if metric.ratio is not None else "none", as_of=metric.as_of_date or nav_date,
        basis="trailing", method="harmonic", coverage_pct=str(metric.coverage_pct), reason=" ".join(notes) or None,
        unavailable_reason=(None if metric.ratio is not None
                            else _withheld_reason("fund", field, metric.coverage_pct, metric, losses)),
    )


class FundValuationParts(NamedTuple):
    """One fund's P/E and P/B, keyed "pe" / "pb": the stock-by-stock figure (`computed`), what the screens
    show (`resolved`: a fresh factsheet figure when there is one, otherwise `computed`) and the ratio details
    behind `computed` (coverage, stocks left out)."""

    computed: dict[str, ValuationValue]
    resolved: dict[str, ValuationValue]
    details: dict[str, ValuationMetric]


def fund_valuation(
    stocks, master: dict[str, StockMaster], reported: dict[str, SchemeReportedValuation | None], nav_date: date,
) -> FundValuationParts:
    """The per-fund core of `compute_valuation`, shared with the CA export script so there is one formula.

    `stocks` is [(holding row, weight)] over the fund's equity rows; the weight may be rupees or a percentage
    of NAV because the ratio and its coverage depend only on the relative weights. `reported` holds the latest
    factsheet reading on or before `nav_date` for each metric, or None."""
    computed, resolved, details = {}, {}, {}
    for metric, field in (("pe", "pe_ratio"), ("pb", "pb_ratio")):
        detail, losses = _stock_metric(stocks, field, master)
        details[metric] = detail
        computed[metric] = _fund_computed(detail, losses, field, nav_date)
        resolved[metric] = resolve_fund_ratio(reported.get(metric), computed[metric], nav_date)
    return FundValuationParts(computed, resolved, details)


def latest_reported_valuations(
    db: Session, scheme_ids, nav_date: date,
) -> dict[tuple[uuid.UUID, str], SchemeReportedValuation]:
    """{(scheme_id, metric): newest factsheet reading with reference_period on or before `nav_date`}."""
    latest: dict[tuple[uuid.UUID, str], SchemeReportedValuation] = {}
    reported = db.query(SchemeReportedValuation).filter(
        SchemeReportedValuation.scheme_id.in_(scheme_ids),
        SchemeReportedValuation.reference_period <= nav_date,
    ).order_by(SchemeReportedValuation.reference_period.desc()).all()
    for reading in reported:
        latest.setdefault((reading.scheme_id, reading.metric), reading)
    return latest


async def compute_valuation(db: Session, household_member_ids: list[uuid.UUID]) -> ValuationSummary:
    table = await get_lookthrough_table(db, household_member_ids)
    scope = await get_disclosure_scope(db, household_member_ids)
    equity = [r for r in table.rows if r.asset_type in _EQUITY]
    total_equity = sum((r.exposure_value for r in equity), _ZERO)
    isins = {r.isin for r in scope.raw_rows if r.asset_type in _EQUITY and r.isin is not None}
    master = {s.isin: s for s in db.query(StockMaster).filter(StockMaster.isin.in_(isins)).all()} if isins else {}
    pe, pe_losses = _stock_metric([(r, r.exposure_value) for r in equity], "pe_ratio", master)
    pb, pb_losses = _stock_metric([(r, r.exposure_value) for r in equity], "pb_ratio", master)
    stock_losses = {"pe": pe_losses, "pb": pb_losses}
    if table.hide_headlines:
        pe.ratio = pb.ratio = None

    # Reuse the same session memo and raw disclosure slices: shared ISINs must
    # retain each fund's own stock weights, including funds with debt or cash.
    by_batch = {batch.id: sid for sid, batch in scope.selected.items()}
    entries = {sid: [] for sid in scope.values if sid in scope.schemes}
    for row in scope.raw_rows:
        if row.asset_type in _EQUITY:
            sid = by_batch[row.batch_id]
            entries[sid].append((row, scope.values[sid] * row.pct_to_nav / 100))
    latest = {}
    if table.nav_as_of is not None and entries:
        latest = latest_reported_valuations(db, list(entries), table.nav_as_of)
    funds, portfolio_values = [], {"pe": [], "pb": []}
    if table.nav_as_of is not None:
        for sid, stocks in entries.items():
            parts = fund_valuation(
                stocks, master, {metric: latest.get((sid, metric)) for metric in ("pe", "pb")}, table.nav_as_of,
            )
            computed, resolved = parts.computed, parts.resolved
            for metric in ("pe", "pb"):
                total_value = computed[metric] if metric == "pe" and resolved[metric].basis == "forward" else resolved[metric]
                equity_value = sum((value for _, value in stocks), _ZERO)
                # Weight by the fund's equity rupees: its P/E or P/B describes only its shares (owner, 31 Oct).
                portfolio_values[metric].append((equity_value, total_value, equity_value))
            funds.append(ValuationFund(scheme_id=sid, scheme_name=scope.schemes[sid].name, **resolved))

    # Stock coverage retains its original meaning. Portfolio availability is
    # separately measured by the equity value in funds with usable figures.
    # Forward P/E counts only when the computed trailing replacement is usable.
    # Missing figures contribute neither weight nor inverse value, never zero.
    for metric, summary in (("pe", pe), ("pb", pb)):
        available = [(weight, value, equity_value) for weight, value, equity_value in portfolio_values[metric]
                     if value.value is not None and weight > 0]
        covered_equity = sum((equity_value for _, _, equity_value in available), _ZERO)
        summary.fund_coverage_pct = covered_equity / total_equity * 100 if total_equity else _ZERO
        weight = sum((weight for weight, _, _ in available), _ZERO)
        inverse = sum((weight / Decimal(value.value) for weight, value, _ in available), _ZERO)
        enough_funds = summary.fund_coverage_pct >= VALUATION_MIN_COVERAGE * 100 and inverse > 0
        summary.ratio = ((weight / inverse).quantize(_PRECISION, rounding=ROUND_HALF_UP)
                         if enough_funds and not table.hide_headlines else None)
        if not enough_funds:
            summary.reason = f"We could not get a {'P/E' if metric == 'pe' else 'P/B'} for enough of your funds yet."
        elif table.hide_headlines:
            summary.reason = "Not enough portfolio holdings are available yet."
        if available:
            summary.as_of_date = min(value.as_of for _, value, _ in available)
        field = "pe_ratio" if metric == "pe" else "pb_ratio"
        if summary.ratio is not None:
            summary.unavailable_reason = None
        elif total_equity == 0 and (not table.hide_headlines or table.total_portfolio_value == 0):
            summary.unavailable_reason = _withheld_reason("portfolio", field, _ZERO, summary, stock_losses[metric])
        elif table.hide_headlines:
            # hide_headlines means too little of the portfolio's value has a holdings list yet (not a share of
            # excluded lines such as derivatives); explain it as missing holdings data.
            summary.unavailable_reason = (
                f"Not enough data: we have the latest holdings for only "
                f"{_whole_percent(table.coverage.covered_value_pct)}% of your portfolio's value, "
                f"and we need at least {int(HEADLINE_MIN_COVERAGE * _HUNDRED)}% to work out {_label(field)}.")
        else:
            summary.unavailable_reason = _withheld_reason(
                "portfolio", field, summary.fund_coverage_pct, summary, stock_losses[metric])

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
    overseas_isins = {r.isin for r in equity if r.asset_type == AssetType.EQUITY_INTERNATIONAL}
    notes = {
        "Overseas stocks without domestic exchange figures are reported separately."
        if s.isin in overseas_isins and s.footnote.startswith("ISIN absent from NSE EQ security master:")
        else s.footnote
        for s in master.values() if s.footnote
    }
    if any(s.pb_source == "SCREENER" and s.source != "BSE" for s in master.values()):
        notes.add("Some P/B values use screener.in fallback (current price / book value).")
    if any(s.pb_source == "SCREENER" and s.source == "BSE" for s in master.values()):
        notes.add("Some P/B values use screener.in (current price / book value).")
    return ValuationSummary(
        pe=pe, pb=pb, indices=indices, funds=funds, total_equity_value=total_equity,
        total_portfolio_value=table.total_portfolio_value, nav_as_of=table.nav_as_of, holdings_as_of=table.holdings_as_of,
        coverage=table.coverage, hide_headlines=table.hide_headlines, excluded_share=table.excluded_share,
        footnotes=sorted(notes),
    )
