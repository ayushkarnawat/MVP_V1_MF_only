"""Attribute 02, using the complete shared table and holdings-dated AMFI lists."""
from __future__ import annotations

import uuid
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models.enums import AssetType
from app.models.reference import MarketCapClassification
from app.services.analytics.lookthrough import LookthroughTable, get_lookthrough_table
from app.services.analytics.schemas import (
    CapAllocationBucket, CapAllocationOther, CapAllocationSummary, StockHoldingRow,
)

_EQUITY = {AssetType.EQUITY_DOMESTIC, AssetType.EQUITY_INTERNATIONAL}
_ZERO = Decimal("0")


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
    classifications = db.query(MarketCapClassification).filter(
        MarketCapClassification.isin.in_(isins),
        MarketCapClassification.effective_date <= table.holdings_as_of,
    ).order_by(MarketCapClassification.effective_date.desc()).all() if isins and table.holdings_as_of else []
    by_isin = {}
    for classification in classifications:
        by_isin.setdefault(classification.isin, classification)
    grouped = {key: [] for key in ("LARGE", "MID", "SMALL", "OTHER")}
    used_dates = []
    for row in equity:
        classification = by_isin.get(row.isin) if row.asset_type in _EQUITY else None
        grouped[classification.bucket.value if classification else "OTHER"].append(row)
        if classification:
            used_dates.append(classification.effective_date)
    missing = grouped["OTHER"]
    non_equity_value = sum((row.exposure_value for row in non_equity), _ZERO)
    missing_value = sum((row.exposure_value for row in missing), _ZERO)

    def payload(rows):
        return [StockHoldingRow.model_validate(row, from_attributes=True) for row in rows]

    buckets = []
    for key, rows in grouped.items():
        equity_part = sum((row.exposure_value for row in rows), _ZERO)
        value = equity_part + (non_equity_value if key == "OTHER" else _ZERO)
        buckets.append(CapAllocationBucket(
            key=key, value=value,
            percentage_total=value / table.total_portfolio_value * 100 if table.total_portfolio_value else _ZERO,
            percentage_equity=equity_part / equity_value * 100 if equity_value else _ZERO,
            rows=payload(rows) if key != "OTHER" else [],
        ))
    return CapAllocationSummary(
        buckets=buckets, other=CapAllocationOther(
            non_equity_value=non_equity_value, unclassified_equity_value=missing_value,
            non_equity_rows=payload(non_equity), unclassified_equity_rows=payload(missing),
        ), total_portfolio_value=table.total_portfolio_value, total_equity_value=equity_value,
        nav_as_of=table.nav_as_of, holdings_as_of=table.holdings_as_of,
        classification_as_of=min(used_dates, default=None), coverage=table.coverage,
        hide_headlines=table.hide_headlines, excluded_share=table.excluded_share,
    )
