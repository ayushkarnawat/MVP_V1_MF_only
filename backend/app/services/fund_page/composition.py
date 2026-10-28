from __future__ import annotations

from collections import defaultdict
from datetime import date
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models.enums import AssetType, DisclosureBatchStatus, MarketCapBucket
from app.models.reference import DisclosureBatch, NavHistory, Scheme, SchemeHolding, StockMaster
from app.services.analytics.cap_allocation import classify_isins
from app.services.fund_page.schemas import (
    AllocationBucketOut,
    AssetAllocationBucketOut,
    CompositionAllocationOut,
    CompositionHoldingOut,
    CompositionResponse,
    HoldingRowOut,
    HoldingsListResponse,
    Unavailable,
    plain,
)

_ZERO = Decimal("0")
_HUNDRED = Decimal("100")
_EQUITY = {AssetType.EQUITY_DOMESTIC, AssetType.EQUITY_INTERNATIONAL}
SECTOR_TOP_N = 6

_ASSET_GROUPS = {
    AssetType.EQUITY_DOMESTIC: ("equity", "Equity"),
    AssetType.EQUITY_INTERNATIONAL: ("equity", "Equity"),
    AssetType.DEBT: ("debt", "Debt"),
    AssetType.GOLD_SILVER: ("gold_silver", "Gold and silver"),
    AssetType.REIT_INVIT: ("reit_invit", "REIT and InvIT"),
    AssetType.CASH_EQUIVALENT: ("cash_equivalent", "Cash and equivalents"),
    AssetType.DERIVATIVE: ("derivative", "Derivative"),
    AssetType.OTHER: ("other", "Other"),
}


def sector_for(row: SchemeHolding, stock_sector_by_isin: dict[str, str | None]) -> str:
    master_sector = stock_sector_by_isin.get(row.isin) if row.isin else None
    return master_sector or row.sector_raw or "Unclassified"


def _latest_batch(
    db: Session, scheme: Scheme, today: date,
) -> DisclosureBatch | None:
    return db.query(DisclosureBatch).filter(
        DisclosureBatch.scheme_id == scheme.id,
        DisclosureBatch.status == DisclosureBatchStatus.WRITTEN,
        DisclosureBatch.as_of_date <= today,
    ).order_by(DisclosureBatch.as_of_date.desc()).first()


def _rows(db: Session, batch: DisclosureBatch) -> list[SchemeHolding]:
    return db.query(SchemeHolding).filter(
        SchemeHolding.batch_id == batch.id,
    ).all()


def _stock_sectors(db: Session, rows: list[SchemeHolding]) -> dict[str, str | None]:
    isins = {row.isin for row in rows if row.isin}
    if not isins:
        return {}
    return {
        row.isin: row.sector
        for row in db.query(StockMaster).filter(StockMaster.isin.in_(isins)).all()
    }


def _age_tag(db: Session, scheme: Scheme, batch: DisclosureBatch, today: date) -> str | None:
    newest_nav = db.query(NavHistory.date).filter(
        NavHistory.scheme_id == scheme.id,
        NavHistory.date <= today,
    ).order_by(NavHistory.date.desc()).limit(1).scalar()
    if newest_nav is not None and (newest_nav - batch.as_of_date).days > 60:
        return "older_than_60_days"
    return None


def _sorted(rows: list[SchemeHolding]) -> list[SchemeHolding]:
    return sorted(rows, key=lambda row: (-row.pct_to_nav, row.isin or "", row.instrument_name))


def _composition_row(
    row: SchemeHolding, stock_sectors: dict[str, str | None],
) -> CompositionHoldingOut:
    return CompositionHoldingOut(
        name=row.instrument_name, isin=row.isin,
        sector=sector_for(row, stock_sectors), weight=plain(row.pct_to_nav, 4),
    )


def _market_cap_allocation(
    db: Session, rows: list[SchemeHolding], as_of: date,
) -> tuple[list[AllocationBucketOut], Decimal]:
    equity = [row for row in rows if row.asset_type in _EQUITY]
    isins = {row.isin for row in equity if row.isin}
    classifications = classify_isins(db, isins, as_of)
    totals = {bucket: _ZERO for bucket in MarketCapBucket}
    unclassified = sum(
        (row.pct_to_nav for row in rows if row.asset_type not in _EQUITY), _ZERO,
    )
    for row in equity:
        bucket = classifications.get(row.isin) if row.isin else None
        if bucket is None:
            unclassified += row.pct_to_nav
        else:
            totals[bucket] += row.pct_to_nav
    classified_total = sum(totals.values(), _ZERO)
    output = []
    for bucket, label in (
        (MarketCapBucket.LARGE, "Large"),
        (MarketCapBucket.MID, "Mid"),
        (MarketCapBucket.SMALL, "Small"),
    ):
        if totals[bucket] != 0 and classified_total != 0:
            output.append(AllocationBucketOut(
                label=label, pct=plain(totals[bucket] / classified_total * _HUNDRED, 4),
            ))
    return output, unclassified


def _sector_allocation(
    rows: list[SchemeHolding], stock_sectors: dict[str, str | None],
) -> list[AllocationBucketOut]:
    totals: dict[str, Decimal] = defaultdict(lambda: _ZERO)
    for row in rows:
        if row.asset_type in _EQUITY:
            totals[sector_for(row, stock_sectors)] += row.pct_to_nav
    ordered = sorted(totals.items(), key=lambda item: (-item[1], item[0]))
    head = ordered[:SECTOR_TOP_N]
    remainder = sum((value for _label, value in ordered[SECTOR_TOP_N:]), _ZERO)
    if remainder != 0:
        head.append(("Others", remainder))
    return [AllocationBucketOut(label=label, pct=plain(value, 4)) for label, value in head]


def _asset_allocation(rows: list[SchemeHolding]) -> list[AssetAllocationBucketOut]:
    totals: dict[str, Decimal] = defaultdict(lambda: _ZERO)
    labels: dict[str, str] = {}
    order: list[str] = []
    for asset_type in AssetType:
        key, label = _ASSET_GROUPS[asset_type]
        if key not in order:
            order.append(key)
        labels[key] = label
    for row in rows:
        key, _label = _ASSET_GROUPS[row.asset_type]
        totals[key] += row.pct_to_nav
    return [
        AssetAllocationBucketOut(key=key, label=labels[key], pct=plain(totals[key], 4))
        for key in order if totals[key] != 0
    ]


def build_composition(
    db: Session, scheme: Scheme, today: date,
) -> CompositionResponse | Unavailable:
    batch = _latest_batch(db, scheme, today)
    if batch is None:
        return Unavailable(reason="no_disclosure")
    rows = _rows(db, batch)
    stock_sectors = _stock_sectors(db, rows)
    equity = _sorted([row for row in rows if row.asset_type in _EQUITY])
    market_cap, unclassified = _market_cap_allocation(db, rows, batch.as_of_date)
    return CompositionResponse(
        scheme_id=str(scheme.id), holdings_as_of=batch.as_of_date,
        age_tag=_age_tag(db, scheme, batch, today), stock_count=len(equity),
        top10=[_composition_row(row, stock_sectors) for row in equity[:10]],
        allocation=CompositionAllocationOut(
            market_cap=market_cap,
            sector=_sector_allocation(rows, stock_sectors),
            asset_type=_asset_allocation(rows),
        ),
        unclassified_pct=plain(unclassified, 4),
    )


def all_holdings(
    db: Session, scheme: Scheme, today: date,
) -> HoldingsListResponse | Unavailable:
    batch = _latest_batch(db, scheme, today)
    if batch is None:
        return Unavailable(reason="no_disclosure")
    rows = _sorted(_rows(db, batch))
    stock_sectors = _stock_sectors(db, rows)
    output = []
    for row in rows:
        base = _composition_row(row, stock_sectors)
        output.append(HoldingRowOut(
            **base.model_dump(), asset_type=_ASSET_GROUPS[row.asset_type][0],
        ))
    return HoldingsListResponse(
        scheme_id=str(scheme.id), holdings_as_of=batch.as_of_date,
        age_tag=_age_tag(db, scheme, batch, today), count=len(output), rows=output,
    )
