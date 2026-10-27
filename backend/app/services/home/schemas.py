from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, PlainSerializer


PlainDecimal = Annotated[
    Decimal,
    PlainSerializer(lambda value: format(value, "f"), return_type=str, when_used="json"),
]


class HomeModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class MissingFund(HomeModel):
    scheme_id: str
    name: str


class Envelope(HomeModel):
    scope: Literal["aggregate", "member"]
    member_id: str | None
    nav_as_of: date | None
    partial: bool
    missing_funds: list[MissingFund]
    computed_at: datetime


class MemberOut(HomeModel):
    id: str
    name: str
    has_data: bool


class SummaryResponse(Envelope):
    display_name: str
    greeting: Literal["morning", "afternoon", "evening"]
    scope_label: str
    change_amount: PlainDecimal
    change_pct: PlainDecimal | None
    direction: Literal["up", "down", "flat"]
    status_phrase: str
    since_label: str
    since_date: date | None
    top_contributor: str | None
    top_contributor_scheme_id: str | None = None
    members_connected: int
    members_total: int
    data_line: str | None
    has_holdings: bool
    total_value: PlainDecimal
    members: list[MemberOut]


class PointOut(HomeModel):
    date: date
    value: PlainDecimal


class BenchmarkPointOut(HomeModel):
    date: date
    pct: PlainDecimal


class BenchmarkSeriesOut(HomeModel):
    index: str
    label: str
    available: bool
    pct: PlainDecimal | None
    effective_start: date | None
    clipped: bool
    points: list[BenchmarkPointOut]


class WealthSeriesResponse(Envelope):
    period: Literal["1D", "1W", "1M", "1Y", "custom"]
    start: date
    end: date
    clamped: bool
    empty: bool
    points: list[PointOut]
    start_value: PlainDecimal
    end_value: PlainDecimal
    net_contributions: PlainDecimal
    change_amount: PlainDecimal
    change_pct: PlainDecimal | None
    change_method: Literal["price_only", "modified_dietz"]
    benchmark: BenchmarkSeriesOut | None


class ClassRowOut(HomeModel):
    key: str
    label: str
    status: Literal["live", "coming_soon"]
    value: PlainDecimal | None
    percentage: PlainDecimal | None


class MemberShareOut(HomeModel):
    id: str
    name: str
    value: PlainDecimal
    percentage: PlainDecimal


class AllocationResponse(Envelope):
    source: Literal["analytics", "dashboard_buckets"]
    approximate: bool
    total_value: PlainDecimal
    classes: list[ClassRowOut]
    covered_pct: PlainDecimal | None
    mix_as_of: date | None
    members: list[MemberShareOut] | None


class MoverFundOut(HomeModel):
    scheme_id: str
    name: str
    change: PlainDecimal | None


class MoverBarOut(HomeModel):
    key: str
    label: str
    change: PlainDecimal
    funds: list[MoverFundOut]


class MoversResponse(Envelope):
    requested_view: Literal["fund", "category", "sector"]
    view: Literal["fund", "category", "sector"]
    fell_back: bool
    estimated: bool
    coverage_pct: PlainDecimal | None
    net_change: PlainDecimal
    net_pct: PlainDecimal | None
    previous_value: PlainDecimal
    previous_nav_date: date | None
    gains: list[MoverBarOut]
    losses: list[MoverBarOut]
    others_count: int
    others_change: PlainDecimal


class WorthCardOut(HomeModel):
    kind: Literal["weak_fund", "underperforming", "high_expense", "concentration"]
    rank: int
    scheme_id: str | None
    scheme_name: str | None
    evidence: dict[str, Any]


class WorthResponse(Envelope):
    cards: list[WorthCardOut]
    unavailable: list[str]
    state: Literal["cards", "nothing_flagged", "unavailable"]


class BenchmarkOptionOut(HomeModel):
    index: str
    label: str
    recommended: bool


class BenchmarksResponse(Envelope):
    options: list[BenchmarkOptionOut]
    recommended_index: str
    reason: str
