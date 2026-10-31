"""Domestic-equity eligibility, independent of household valuation dates."""
from __future__ import annotations

from decimal import Decimal
from uuid import UUID

from sqlalchemy.orm import Session

from app.models.enums import AssetType, DisclosureBatchStatus
from app.models.reference import DisclosureBatch, SchemeHolding

_EQUITY_NAMES = (
    "Contra Fund", "Dividend Yield Fund", "ELSS", "ELSS- Tax Saver Fund",
    "Flexi Cap Fund", "Focused Fund", "Large & Mid Cap Fund", "Large Cap Fund",
    "Mid Cap Fund", "Multi Cap Fund", "Sectoral/ Thematic", "Sectoral Fund",
    "Small Cap Fund", "Thematic Fund", "Value Fund",
)
EQUITY_CATEGORIES: tuple[str, ...] = tuple(
    f"{prefix} - {name}"
    for prefix in ("Equity Scheme", "Equity Schemes") for name in _EQUITY_NAMES
) + (
    "Equity", "ELSS", "Index Funds - Equity Funds",
    "Exchange Traded Funds (ETFs) - Equity ETF",
    "Hybrid Scheme - Aggressive Hybrid Fund", "Hybrid Schemes - Aggressive Hybrid Fund",
)
_ALLOWLIST = {category.casefold() for category in EQUITY_CATEGORIES}


def _is_debt_or_arbitrage(category: str) -> bool:
    value = category.casefold()
    return any(word in value for word in (
        "debt", "arbitrage", "liquid", "overnight", "low duration", "gilt",
        "money market", "income", "conservative hybrid",
    ))


def is_equity_fund(sebi_category: str, net_domestic_equity_pct: Decimal | None) -> bool:
    if net_domestic_equity_pct is None:
        return False
    category = " ".join((sebi_category or "").split()).casefold()
    if _is_debt_or_arbitrage(category) or any(word in category for word in (
        "gold", "silver", "overseas", "international",
    )):
        return False
    if category in _ALLOWLIST:
        return True
    # Unspecified index/ETF types and hybrid or children's allocations cannot
    # establish domestic-equity eligibility from their names alone.
    data_decided = any(word in category for word in (
        "index", "etf", "hybrid", "multi asset", "balanced advantage",
        "equity savings", "children",
    ))
    return data_decided and net_domestic_equity_pct >= Decimal("65")


def net_domestic_equity_pct(db: Session, scheme_id: UUID) -> Decimal | None:
    """Latest WRITTEN batch, with no member scope or NAV-date cutoff.

    Stored derivative weights are signed. Only their negative (short) lines
    reduce domestic equity; positive derivative lines do not add equity.
    """
    batch = db.query(DisclosureBatch.id).filter(
        DisclosureBatch.scheme_id == scheme_id,
        DisclosureBatch.status == DisclosureBatchStatus.WRITTEN,
    ).order_by(DisclosureBatch.as_of_date.desc()).first()
    if batch is None:
        return None
    rows = db.query(SchemeHolding).filter(SchemeHolding.batch_id == batch.id).all()
    return sum((row.pct_to_nav for row in rows if
        row.asset_type == AssetType.EQUITY_DOMESTIC or
        (row.asset_type == AssetType.DERIVATIVE and row.pct_to_nav < 0)
    ), Decimal("0"))
