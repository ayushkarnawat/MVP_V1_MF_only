"""Shared value-weighted disclosure table for the look-through consumers.

All percentages here are percentage points (the parser already scales source
fractions). The memo belongs to the recompute Session, never to the process.
"""
from __future__ import annotations

import uuid
from collections import defaultdict
from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models.enums import AssetType, DisclosureBatchStatus
from app.models.reference import DisclosureBatch, Scheme, SchemeHolding
from app.services.analytics.portfolio_disclosure_resolvers import (
    AMC_DISCLOSURE_RESOLVERS,
    DisclosureResolverKind,
)
from app.services.analytics.schemas import (
    FundContribution,
    LookthroughCoverage,
    LookthroughFundAge,
    StockHoldingRow,
    StockHoldingsSummary,
)
from app.services.dashboard.holdings import compute_holdings
from app.services.dashboard.schemas import HoldingRow

HEADLINE_MIN_COVERAGE = Decimal("0.50")
LOOKTHROUGH_MAX_ROWS = 100
_EXCLUDED = {AssetType.DERIVATIVE, AssetType.OTHER}
_EQUITY = {AssetType.EQUITY_DOMESTIC, AssetType.EQUITY_INTERNATIONAL}
_ZERO = Decimal("0")
_HUNDRED = Decimal("100")


def scheme_values(
    holdings: list[HoldingRow],
) -> tuple[dict[uuid.UUID, Decimal], Decimal, list[uuid.UUID]]:
    """Sum valued folios; report every scheme with an unvalued folio."""
    values: dict[uuid.UUID, Decimal] = defaultdict(lambda: _ZERO)
    missing: dict[uuid.UUID, None] = {}
    for holding in holdings:
        scheme_id = uuid.UUID(holding.scheme_id)
        if holding.current_value is None:
            missing[scheme_id] = None
        else:
            values[scheme_id] += Decimal(holding.current_value)
    return dict(values), sum(values.values(), _ZERO), list(missing)


@dataclass(frozen=True)
class LookthroughStockRow:
    isin: str | None
    instrument_name: str
    sector_raw: str | None
    asset_type: AssetType
    exposure_pct: Decimal
    exposure_value: Decimal
    contributing_funds: list[FundContribution]


@dataclass(frozen=True)
class LookthroughTable:
    household_member_ids: list[uuid.UUID]
    rows: list[LookthroughStockRow]
    nav_as_of: date | None
    holdings_as_of: date | None
    total_portfolio_value: Decimal
    coverage: LookthroughCoverage
    truncated: bool
    total_stock_count: int
    hide_headlines: bool
    excluded_share: Decimal
    non_equity_share: Decimal


def _age_tag(as_of: date, nav_date: date, cadence: str) -> str | None:
    if (nav_date - as_of).days <= 60:
        return None
    if cadence == "half_yearly":
        # Latest completed reporting period, rather than a fixed day count
        # (half years differ in length). Missing a new period is stale.
        if nav_date >= date(nav_date.year, 9, 30):
            due = date(nav_date.year, 9, 30)
        elif nav_date >= date(nav_date.year, 3, 31):
            due = date(nav_date.year, 3, 31)
        else:
            due = date(nav_date.year - 1, 9, 30)
        if as_of >= due:
            return "on_cycle"
    return "older_than_60_days"


async def compute_lookthrough_table(
    db: Session, household_member_ids: list[uuid.UUID],
) -> LookthroughTable:
    holdings = await compute_holdings(db, household_member_ids)
    values, total, missing = scheme_values(holdings)
    # A stale NAV must not admit a disclosure from after its valuation date.
    # The table label is the oldest NAV used; selection is per scheme.
    nav_dates: dict[uuid.UUID, date] = {}
    for holding in holdings:
        if holding.current_value is not None and holding.current_nav_date is not None:
            sid = uuid.UUID(holding.scheme_id)
            nav_dates[sid] = min(nav_dates.get(sid, holding.current_nav_date), holding.current_nav_date)
    nav_as_of = min(nav_dates.values(), default=None)
    schemes = {s.id: s for s in db.query(Scheme).filter(Scheme.id.in_(values)).all()} if values else {}
    # Query all WRITTEN history once. Historical presence also determines
    # the registry's MANUAL-AMC reason, including other schemes at that AMC.
    amcs = {s.amc_name for s in schemes.values()}
    batches = db.query(DisclosureBatch).filter(
        DisclosureBatch.status == DisclosureBatchStatus.WRITTEN,
        DisclosureBatch.amc_name.in_(amcs),
    ).order_by(DisclosureBatch.as_of_date.desc()).all() if amcs else []
    published_amcs = {b.amc_name for b in batches}
    selected: dict[uuid.UUID, DisclosureBatch] = {}
    for batch in batches:
        cutoff = nav_dates.get(batch.scheme_id)
        if cutoff is not None and batch.as_of_date <= cutoff and batch.scheme_id not in selected:
            selected[batch.scheme_id] = batch

    ages: dict[uuid.UUID, LookthroughFundAge] = {}
    not_published, not_available = [], []
    for sid in values:
        scheme = schemes.get(sid)
        entry = AMC_DISCLOSURE_RESOLVERS.get(scheme.amc_name) if scheme else None
        if sid in selected:
            batch = selected[sid]
            cadence = entry.cadence if entry else "monthly"
            ages[sid] = LookthroughFundAge(
                scheme_id=sid, holdings_as_of=batch.as_of_date, cadence=cadence,
                age_tag=_age_tag(batch.as_of_date, nav_dates[sid], cadence),
            )
        elif entry is None or (entry.kind == DisclosureResolverKind.MANUAL and scheme.amc_name not in published_amcs):
            not_available.append(sid)
        else:
            not_published.append(sid)
    covered = sum((values[sid] for sid in selected), _ZERO)
    coverage_fraction = covered / total if total else _ZERO
    coverage = LookthroughCoverage(
        covered_value_pct=coverage_fraction * _HUNDRED,
        not_published_yet=not_published, not_available_from_amc=not_available,
        missing_value_schemes=missing, funds=list(ages.values()),
    )
    by_batch = {b.id: sid for sid, b in selected.items()}
    raw_rows = db.query(SchemeHolding).filter(SchemeHolding.batch_id.in_(by_batch)).order_by(
        SchemeHolding.id,
    ).all() if by_batch else []
    grouped: dict[str | uuid.UUID, list[tuple[SchemeHolding, uuid.UUID, Decimal]]] = defaultdict(list)
    excluded_value, non_equity_value = _ZERO, _ZERO
    for row in raw_rows:
        sid = by_batch[row.batch_id]
        value = values[sid] * row.pct_to_nav / _HUNDRED
        if row.asset_type not in _EQUITY:
            non_equity_value += value
        if row.asset_type in _EXCLUDED:
            excluded_value += value
            continue
        # NULL ISINs have no common instrument identity, even within a fund.
        grouped[row.isin if row.isin is not None else row.id].append((row, sid, value))
    rows = []
    for parts in grouped.values():
        largest, _, _ = max(parts, key=lambda part: part[2])
        exposure_value = sum((part[2] for part in parts), _ZERO)
        # Sum repeated lots/lines of the same instrument within a scheme so
        # the drill-down contains one segment per contributing fund.
        weights: dict[uuid.UUID, Decimal] = defaultdict(lambda: _ZERO)
        for row, sid, _ in parts:
            weights[sid] += row.pct_to_nav
        contributions = [FundContribution(
            scheme_id=sid, fund_weight_pct=values[sid] / total * _HUNDRED if total else _ZERO,
            stock_weight_pct=weight, holdings_as_of=ages[sid].holdings_as_of,
            cadence=ages[sid].cadence, age_tag=ages[sid].age_tag,
        ) for sid, weight in weights.items()]
        contributions.sort(key=lambda c: (-c.fund_weight_pct * c.stock_weight_pct, str(c.scheme_id)))
        rows.append(LookthroughStockRow(
            isin=largest.isin, instrument_name=largest.instrument_name, sector_raw=largest.sector_raw,
            asset_type=largest.asset_type, exposure_value=exposure_value,
            exposure_pct=exposure_value / total * _HUNDRED if total else _ZERO,
            contributing_funds=contributions,
        ))
    rows.sort(key=lambda row: (-row.exposure_pct, row.isin or "", row.instrument_name,
                               str(row.contributing_funds[0].scheme_id)))
    return LookthroughTable(
        household_member_ids=list(household_member_ids), rows=rows,
        nav_as_of=nav_as_of, holdings_as_of=min((b.as_of_date for b in selected.values()), default=None),
        total_portfolio_value=total, coverage=coverage,
        truncated=False, total_stock_count=sum(row.asset_type in _EQUITY for row in rows),
        hide_headlines=coverage_fraction < HEADLINE_MIN_COVERAGE,
        excluded_share=excluded_value / total * _HUNDRED if total else _ZERO,
        non_equity_share=non_equity_value / total * _HUNDRED if total else _ZERO,
    )


async def get_lookthrough_table(db: Session, household_member_ids: list[uuid.UUID]) -> LookthroughTable:
    memo = db.info.setdefault("lookthrough", {})
    key = tuple(sorted(household_member_ids))
    if key not in memo:
        memo[key] = await compute_lookthrough_table(db, household_member_ids)
    return memo[key]


async def compute_stock_holdings(db: Session, household_member_ids: list[uuid.UUID]) -> StockHoldingsSummary:
    table = await get_lookthrough_table(db, household_member_ids)
    equity_rows = sorted((row for row in table.rows if row.asset_type in _EQUITY),
                         key=lambda row: -row.exposure_pct)
    return StockHoldingsSummary(
        rows=[StockHoldingRow.model_validate(row, from_attributes=True)
              for row in equity_rows[:LOOKTHROUGH_MAX_ROWS]],
        nav_as_of=table.nav_as_of, holdings_as_of=table.holdings_as_of,
        total_portfolio_value=table.total_portfolio_value, coverage=table.coverage,
        truncated=len(equity_rows) > LOOKTHROUGH_MAX_ROWS, total_stock_count=len(equity_rows),
        hide_headlines=table.hide_headlines, excluded_share=table.excluded_share,
        non_equity_share=table.non_equity_share,
    )
