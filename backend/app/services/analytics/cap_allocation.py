"""Attribute 02, using the complete shared table and holdings-dated AMFI lists."""
from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models.enums import AssetType, MarketCapBucket
from app.models.reference import MarketCapClassification
from app.services.analytics.lookthrough import LookthroughTable, get_lookthrough_table
from app.services.analytics.schemas import (
    CapAllocationBucket, CapAllocationOther, CapAllocationSummary, StockHoldingRow,
)

_EQUITY = {AssetType.EQUITY_DOMESTIC, AssetType.EQUITY_INTERNATIONAL}
_ZERO = Decimal("0")
# The stored section payload must not grow with the household (it is saved as JSON,
# served on every dashboard load and posted back for the PDF). Totals and percentages
# always cover every stock; only the drill-down row lists are capped, largest first.
CAP_ROWS_LIMIT = 50


class _ClassificationMap(dict[str, MarketCapBucket]):
    """Dictionary result with dates retained for the analytics summary."""

    effective_dates: dict[str, date]


def classify_isins(
    db: Session, isins: set[str], as_of: date | None,
) -> dict[str, MarketCapBucket]:
    """Return the newest holdings-dated AMFI bucket for every known ISIN."""
    result = _ClassificationMap()
    result.effective_dates = {}
    if not isins or as_of is None:
        return result
    rows = db.query(MarketCapClassification).filter(
        MarketCapClassification.isin.in_(isins),
        MarketCapClassification.effective_date <= as_of,
    ).order_by(MarketCapClassification.effective_date.desc()).all()
    for row in rows:
        if row.isin not in result:
            result[row.isin] = row.bucket
            result.effective_dates[row.isin] = row.effective_date
    return result


async def compute_cap_allocation(db: Session, household_member_ids: list[uuid.UUID]) -> CapAllocationSummary:
    table = await get_lookthrough_table(db, household_member_ids)
    return build_cap_allocation(db, table)


def build_cap_allocation(
    db: Session, table: LookthroughTable, equity_types: set[AssetType] = _EQUITY,
) -> CapAllocationSummary:
    """Shared holdings-dated AMFI grouping; extra equity kinds remain Other."""
    equity = [row for row in table.rows if row.asset_type in equity_types]
    non_equity = [row for row in table.rows if row.asset_type not in equity_types]
    equity_value = sum((row.exposure_value for row in equity), _ZERO)
    isins = {row.isin for row in equity if row.isin is not None and row.asset_type in _EQUITY}
    by_isin = classify_isins(db, isins, table.holdings_as_of)
    grouped = {key: [] for key in ("LARGE", "MID", "SMALL", "OTHER")}
    used_dates = []
    for row in equity:
        classification = by_isin.get(row.isin) if row.asset_type in _EQUITY else None
        grouped[classification.value if classification else "OTHER"].append(row)
        if classification:
            used_dates.append(by_isin.effective_dates[row.isin])
    missing = grouped["OTHER"]
    non_equity_value = sum((row.exposure_value for row in non_equity), _ZERO)
    missing_value = sum((row.exposure_value for row in missing), _ZERO)

    def payload(rows):
        return [StockHoldingRow.model_validate(row, from_attributes=True)
                for row in sorted(rows, key=lambda r: -r.exposure_value)[:CAP_ROWS_LIMIT]]

    buckets = []
    for key, rows in grouped.items():
        equity_part = sum((row.exposure_value for row in rows), _ZERO)
        value = equity_part + (non_equity_value if key == "OTHER" else _ZERO)
        buckets.append(CapAllocationBucket(
            key=key, value=value,
            percentage_total=value / table.total_portfolio_value * 100 if table.total_portfolio_value else _ZERO,
            percentage_equity=equity_part / equity_value * 100 if equity_value else _ZERO,
            rows=payload(rows) if key != "OTHER" else [], row_count=len(rows) if key != "OTHER" else 0,
        ))
    return CapAllocationSummary(
        buckets=buckets, other=CapAllocationOther(
            non_equity_value=non_equity_value, unclassified_equity_value=missing_value,
            non_equity_rows=payload(non_equity), unclassified_equity_rows=payload(missing),
            non_equity_count=len(non_equity), unclassified_equity_count=len(missing),
        ), total_portfolio_value=table.total_portfolio_value, total_equity_value=equity_value,
        nav_as_of=table.nav_as_of, holdings_as_of=table.holdings_as_of,
        classification_as_of=min(used_dates, default=None), coverage=table.coverage,
        hide_headlines=table.hide_headlines, excluded_share=table.excluded_share,
    )
