from __future__ import annotations

from datetime import date, datetime
from decimal import ROUND_HALF_UP, Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict

from app.services.analytics.schemas import FundScoreRow


class FundModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Unavailable(FundModel):
    status: Literal["unavailable"] = "unavailable"
    reason: str


def plain(value: Decimal, places: int) -> str:
    """Quantize to `places` decimals, HALF_UP, string form -- never a
    negative-zero string (`-0.0000`/`-0.00`)."""
    quantized = value.quantize(Decimal(1).scaleb(-places), rounding=ROUND_HALF_UP)
    if quantized == 0:
        quantized = abs(quantized)
    return format(quantized, "f")


# Every money/unit/NAV/percent field below is `str`, not Home's `PlainDecimal`:
# `plain()` already does the quantization + negative-zero normalisation (the
# T2 guard test locks its return type to `str`), so a `PlainDecimal` field
# here would just reformat an already-formatted value for no benefit.


class ExpenseRatioOut(FundModel):
    value: str
    reference_period: date
    plan: str | None


class TilesOut(FundModel):
    current_value: str | None
    share_of_portfolio_pct: str | None
    invested: str | None
    total_gain: str | None
    total_gain_pct: str | None
    xirr: str | None
    expense_ratio: ExpenseRatioOut | None


class OpeningLotOut(FundModel):
    units: str
    since: date
    cost_source: Literal["cas_cost", "nav_on_start", "manual"]


class FolioOut(FundModel):
    folio_id: str
    member_id: str
    member_name: str
    folio_masked: str


class DetailsOut(FundModel):
    units: str | None
    average_nav: str | None
    current_nav: str | None
    invested: str | None
    current_value: str | None
    gain: str | None
    gain_pct: str | None
    xirr: str | None
    first_investment: date | None
    last_investment: date | None
    opening_lot: OpeningLotOut | None
    folios: list[FolioOut]


class SchemeInfoOut(FundModel):
    id: str
    name: str
    plan: str | None
    category: str
    amc_name: str


class OtherMemberOut(FundModel):
    id: str
    name: str


class SummaryResponse(FundModel):
    status: Literal["ready"] = "ready"
    scope: str
    held: bool
    held_by_other_members: list[OtherMemberOut]
    nav_as_of: date | None
    nav_stale: bool
    has_history: bool
    scheme: SchemeInfoOut
    tiles: TilesOut
    details: DetailsOut


class FolioNumberResponse(FundModel):
    status: Literal["ready"] = "ready"
    folio_id: str
    folio_number: str


class PerformancePoint(FundModel):
    date: date
    pct: str


class PeriodReturnsOut(FundModel):
    fund: str
    benchmark: str | None


class PerformanceResponse(FundModel):
    status: Literal["ready"] = "ready"
    scheme_id: str
    period: str
    start: date
    end: date
    clamped: bool
    since_launch: bool
    fund: list[PerformancePoint]
    benchmark_index: str | None
    benchmark_label: str | None
    benchmark: list[PerformancePoint] | None
    benchmark_reason: Literal["no_benchmark", "no_history"] | None
    period_returns: PeriodReturnsOut


class ReturnsResponse(FundModel):
    status: Literal["ready"] = "ready"
    mode: Literal["inception", "current"]
    columns: list[str]
    rows: dict[str, dict[str, str | None] | None]
    benchmark_reason: Literal["no_benchmark", "no_history"] | None


class RiskMetricOut(FundModel):
    value: str | None
    band: str | None
    tone: str | None


class RiskResponse(FundModel):
    status: Literal["ready"] = "ready"
    scheme_id: str
    window_start: date
    window_end: date
    points: int
    life_window: bool
    risk_free_rate: str
    volatility: RiskMetricOut
    max_drawdown: RiskMetricOut
    sharpe: RiskMetricOut
    beta: RiskMetricOut
    beta_reason: Literal["insufficient_shared_dates", "no_benchmark"] | None


class CompositionHoldingOut(FundModel):
    name: str
    isin: str | None
    sector: str
    weight: str


class AllocationBucketOut(FundModel):
    label: str
    pct: str


class AssetAllocationBucketOut(FundModel):
    key: str
    label: str
    pct: str


class CompositionAllocationOut(FundModel):
    market_cap: list[AllocationBucketOut]
    sector: list[AllocationBucketOut]
    asset_type: list[AssetAllocationBucketOut]


class CompositionResponse(FundModel):
    status: Literal["ready"] = "ready"
    scheme_id: str
    holdings_as_of: date
    age_tag: Literal["older_than_60_days"] | None
    stock_count: int
    top10: list[CompositionHoldingOut]
    allocation: CompositionAllocationOut
    unclassified_pct: str


class HoldingRowOut(CompositionHoldingOut):
    asset_type: str


class HoldingsListResponse(FundModel):
    status: Literal["ready"] = "ready"
    scheme_id: str
    holdings_as_of: date
    age_tag: Literal["older_than_60_days"] | None
    count: int
    rows: list[HoldingRowOut]


class ManagerOut(FundModel):
    name: str
    role: str | None
    managing_since: date | None
    tenure_years: str | None


class ManagerResponse(FundModel):
    status: Literal["ready"] = "ready"
    scheme_id: str
    reference_period: date
    details_available: Literal[False] = False
    managers: list[ManagerOut]


class ScoreResponse(FundScoreRow):
    status: Literal["ready"] = "ready"
    source: Literal["stored", "computed"]
    computed_at: datetime


class CategorySeriesResponse(FundModel):
    status: Literal["ready"] = "ready"
    period: str
    granularity: Literal["daily", "month_end"]
    category: str
    peers_used: int
    peers_total: int
    thin_category: bool
    points: list[PerformancePoint]


class CategoryReturnsResponse(FundModel):
    status: Literal["ready"] = "ready"
    columns: list[str]
    category: dict[str, str | None]
    peers_used: dict[str, int]
    thin_category: bool


class RollingPoint(FundModel):
    date: date
    fund: str
    benchmark: str | None
    category: str | None


class RollingResponse(FundModel):
    status: Literal["ready"] = "ready"
    window_years: int
    points: list[RollingPoint]


class PeriodReturnBucket(FundModel):
    label: str
    start: date
    end: date
    fund: str | None
    benchmark: str | None
    category: str | None


class PeerPeriodReturnsResponse(FundModel):
    status: Literal["ready"] = "ready"
    period: str
    bucket: Literal["week", "month", "quarter", "year"]
    buckets: list[PeriodReturnBucket]


class CalendarYearReturn(FundModel):
    year: int
    fund: str | None
    benchmark: str | None
    category: str | None


class ScatterPoint(FundModel):
    scheme_id: str
    name: str
    return_pct: str
    volatility_pct: str
    is_fund: bool


class ScatterResponse(FundModel):
    status: Literal["ready"] = "ready"
    window_start: date
    window_end: date
    thin_category: bool
    peer_volatility_median: str | None
    points: list[ScatterPoint]


class InsightEvidenceOut(FundModel):
    label: str
    value: str


class InsightFactOut(FundModel):
    id: str
    list: Literal["key", "strength", "consideration"]
    tone: Literal["pos", "warn", "neg", "info", "neu"]
    text: str
    evidence: list[InsightEvidenceOut]
    priority: int


class InsightsResponse(FundModel):
    status: Literal["ready"] = "ready"
    key: list[InsightFactOut]
    strengths: list[InsightFactOut]
    considerations: list[InsightFactOut]
    top_three: list[InsightFactOut]


class OverlapDistribution(FundModel):
    unique_to_fund_count: int
    common_count: int
    unique_to_others_count: int
    unique_to_fund_pct: str
    common_pct: str
    unique_to_others_pct: str


class HeldInFundOut(FundModel):
    scheme_id: str
    scheme_name: str


class CommonHoldingOut(FundModel):
    isin: str
    name: str
    sector: str
    fund_weight: str
    portfolio_weight: str
    held_in_funds: list[HeldInFundOut]


class SectorStockOut(FundModel):
    isin: str
    name: str
    weight: str


class OverlapSectorOut(FundModel):
    sector: str
    pct: str
    stocks: list[SectorStockOut]


class TopOverlapFundOut(FundModel):
    scheme_id: str
    scheme_name: str
    overlap_pct: str
    common_stock_count: int


class MissingDisclosureFundOut(FundModel):
    scheme_id: str
    scheme_name: str


class FundOverlapCoverage(FundModel):
    covered_value_pct: str
    funds_without_disclosure: list[MissingDisclosureFundOut]


class FundOverlapResponse(FundModel):
    status: Literal["ready"] = "ready"
    scheme_id: str
    holdings_as_of: date
    overlap_pct: str
    common_stock_count: int
    total_stock_count: int
    distribution: OverlapDistribution
    common_holdings: list[CommonHoldingOut]
    by_sector: list[OverlapSectorOut]
    top_overlap_funds: list[TopOverlapFundOut]
    coverage: FundOverlapCoverage


class ComparisonFundOut(FundModel):
    scheme_id: str
    scheme_name: str
    holdings_as_of: date
    current_value: str


class ComparisonCounts(FundModel):
    unique_a: int
    common: int
    unique_b: int


class AmountPctOut(FundModel):
    amount: str
    pct: str


class ComparisonImpact(FundModel):
    common_both: AmountPctOut
    unique_a: AmountPctOut
    unique_b: AmountPctOut
    other_funds: AmountPctOut


class SectorComparisonOut(FundModel):
    sector: str
    common: str
    a: str
    b: str


class ComparisonCommonHoldingOut(FundModel):
    isin: str
    name: str
    sector: str
    weight_a: str
    weight_b: str
    combined: str


class UniqueHoldingOut(FundModel):
    isin: str
    name: str
    sector: str
    weight: str


class UniqueHoldingsOut(FundModel):
    a: list[UniqueHoldingOut]
    b: list[UniqueHoldingOut]


class MarketCapFundOut(FundModel):
    large: str
    mid: str
    small: str
    other: str


class ComparisonMarketCap(FundModel):
    a: MarketCapFundOut
    b: MarketCapFundOut


class FundComparisonResponse(FundModel):
    status: Literal["ready"] = "ready"
    fund_a: ComparisonFundOut
    fund_b: ComparisonFundOut
    overlap_pct: str
    counts: ComparisonCounts
    impact: ComparisonImpact
    sector_comparison: list[SectorComparisonOut]
    common_holdings: list[ComparisonCommonHoldingOut]
    unique_holdings: UniqueHoldingsOut
    market_cap: ComparisonMarketCap
