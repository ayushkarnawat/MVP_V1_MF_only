from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import Sequence

from app.core.decimal_utils import quantize_amount
from app.services.dashboard.portfolio_schemas import zero_unsigned
from app.services.dashboard.schemas import HoldingRow, RealizedSummary, XirrDisclaimerOut
from app.services.dashboard.xirr import DashboardXirrSummary
from app.services.home.movers import Movers


PCT = Decimal("0.0001")


@dataclass(frozen=True)
class PortfolioSummary:
    total_value: Decimal
    total_invested: Decimal
    unrealized_gain: Decimal
    unrealized_pct: Decimal | None
    realized_gain: Decimal
    today_gain: Decimal
    today_pct: Decimal | None
    previous_nav_date: date | None
    lifetime_xirr: str | None
    current_holdings_xirr: str | None
    lifetime_xirr_disclaimer: XirrDisclaimerOut | None
    current_holdings_xirr_disclaimer: XirrDisclaimerOut | None


def compute_portfolio_summary(
    holdings: Sequence[HoldingRow],
    xirr_summary: DashboardXirrSummary,
    realized_summary: RealizedSummary,
    movers: Movers,
) -> PortfolioSummary:
    valued = [
        row for row in holdings if not row.nav_unavailable and row.current_value is not None
    ]
    total_value = sum(
        (quantize_amount(Decimal(row.current_value)) for row in valued), Decimal("0.00")
    )
    total_invested = sum(
        (quantize_amount(Decimal(row.amount_invested)) for row in valued), Decimal("0.00")
    )
    unrealized_gain = zero_unsigned(total_value - total_invested)
    unrealized_pct = (
        zero_unsigned((unrealized_gain / total_invested * Decimal("100")).quantize(PCT))
        if total_invested != 0 else None
    )
    return PortfolioSummary(
        total_value=total_value,
        total_invested=total_invested,
        unrealized_gain=unrealized_gain,
        unrealized_pct=unrealized_pct,
        realized_gain=zero_unsigned(quantize_amount(Decimal(realized_summary.total))),
        today_gain=zero_unsigned(movers.net_change),
        today_pct=None if movers.net_pct is None else zero_unsigned(movers.net_pct),
        previous_nav_date=movers.previous_nav_date,
        lifetime_xirr=xirr_summary.lifetime_xirr,
        current_holdings_xirr=xirr_summary.current_holdings_xirr,
        lifetime_xirr_disclaimer=(
            xirr_summary.lifetime_xirr_disclaimer.to_schema()
            if xirr_summary.lifetime_xirr_disclaimer else None
        ),
        current_holdings_xirr_disclaimer=(
            xirr_summary.current_holdings_xirr_disclaimer.to_schema()
            if xirr_summary.current_holdings_xirr_disclaimer else None
        ),
    )
