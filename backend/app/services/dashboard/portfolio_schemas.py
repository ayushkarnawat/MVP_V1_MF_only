from __future__ import annotations

from datetime import date
from typing import Literal

from app.services.dashboard.schemas import XirrDisclaimerOut
from app.services.home.schemas import Envelope, HomeModel, MemberOut, PlainDecimal, PointOut


class InstrumentBucketOut(HomeModel):
    label: str
    status: Literal["live", "coming_soon"]
    current_value: PlainDecimal | None
    percentage: PlainDecimal | None
    invested: PlainDecimal | None
    gain_loss: PlainDecimal | None
    xirr: str | None


class PortfolioAllocationResponse(Envelope):
    members: list[MemberOut] | None
    buckets: list[InstrumentBucketOut]


class PortfolioSummaryResponse(Envelope):
    members: list[MemberOut] | None
    total_value: PlainDecimal
    total_invested: PlainDecimal
    unrealized_gain: PlainDecimal
    unrealized_pct: PlainDecimal | None
    realized_gain: PlainDecimal
    today_gain: PlainDecimal
    today_pct: PlainDecimal | None
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
