from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import PlainSerializer

from app.services.dashboard.schemas import XirrDisclaimerOut
from app.services.home.schemas import Envelope, HomeModel, MemberOut, PointOut


def zero_unsigned(value: Decimal) -> Decimal:
    """A zero is never signed: "-0.00" / "-0.0000" is what Decimal prints for a tiny negative that rounds to zero
    (review L1). Same rule as Home's `_zero`."""
    return abs(value) if value.is_zero() else value


def _plain(value: Decimal) -> str:
    # Applied once more at serialisation so no Decimal can reach a response signed, whoever built it.
    return format(zero_unsigned(value), "f")


PortfolioDecimal = Annotated[
    Decimal, PlainSerializer(_plain, return_type=str, when_used="json"),
]


class InstrumentBucketOut(HomeModel):
    label: str
    status: Literal["live", "coming_soon"]
    current_value: PortfolioDecimal | None
    percentage: PortfolioDecimal | None
    invested: PortfolioDecimal | None
    gain_loss: PortfolioDecimal | None
    xirr: str | None


class PortfolioAllocationResponse(Envelope):
    members: list[MemberOut] | None
    buckets: list[InstrumentBucketOut]


class PortfolioSummaryResponse(Envelope):
    members: list[MemberOut] | None
    total_value: PortfolioDecimal
    total_invested: PortfolioDecimal
    unrealized_gain: PortfolioDecimal
    unrealized_pct: PortfolioDecimal | None
    realized_gain: PortfolioDecimal
    today_gain: PortfolioDecimal
    today_pct: PortfolioDecimal | None
    previous_nav_date: date | None
    lifetime_xirr: str | None
    current_holdings_xirr: str | None
    lifetime_xirr_disclaimer: XirrDisclaimerOut | None
    current_holdings_xirr_disclaimer: XirrDisclaimerOut | None


class PortfolioValueSeriesResponse(Envelope):
    members: list[MemberOut] | None
    days: int
    start: date
    end: date
    empty: bool
    points: list[PointOut]
