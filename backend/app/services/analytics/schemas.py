from __future__ import annotations

from datetime import date

from pydantic import BaseModel

from app.models.enums import BenchmarkIndex
from app.services.dashboard.schemas import AllocationBucket, MemberStatus


class AnalyticsAllocationSummary(BaseModel):
    by_category: list[AllocationBucket]
    by_amc: list[AllocationBucket]
    total_value: str


class AggregateAnalyticsAllocationResponse(BaseModel):
    members: list[MemberStatus]
    allocation: AnalyticsAllocationSummary


class WeightedTerSummary(BaseModel):
    """PRD-04 FR-10 — weighted by the user's own holding value, not the
    fund's platform-wide AAUM (see amfi_aaum_client.py's docstring)."""

    weighted_ter: str | None
    covered_value: str
    total_value: str
    reference_period: date | None
    uncovered_schemes: list[str]


class DirectRegularTerComparison(BaseModel):
    """PRD-04 FR-11 — same weighting method as WeightedTerSummary, split
    by PlanType.DIRECT vs. PlanType.REGULAR."""

    direct: WeightedTerSummary
    regular: WeightedTerSummary


class AggregateWeightedTerResponse(BaseModel):
    members: list[MemberStatus]
    ter: WeightedTerSummary


class AggregateDirectRegularTerResponse(BaseModel):
    members: list[MemberStatus]
    ter: DirectRegularTerComparison


class IndexXirrRow(BaseModel):
    index: BenchmarkIndex
    xirr: str | None


class PortfolioBenchmarkSummary(BaseModel):
    """PRD-04 FR-8 — portfolio XIRR from the full transaction history,
    alongside XIRR for all 4 Nifty indices computed via the same
    cash-flow-timing method (see xirr.py, benchmark.py)."""

    portfolio_xirr: str | None
    benchmarks: list[IndexXirrRow]


class AggregatePortfolioBenchmarkResponse(BaseModel):
    members: list[MemberStatus]
    benchmark: PortfolioBenchmarkSummary


class FundBenchmarkRow(BaseModel):
    """PRD-04 FR-9 — per-fund-appropriate benchmark, not the same index
    for every fund (e.g. a large-cap fund vs. Nifty 50, a midcap fund vs.
    Nifty Midcap 150)."""

    scheme_id: str
    scheme_name: str
    benchmark_index: BenchmarkIndex
    fund_xirr: str | None
    benchmark_xirr: str | None


class FundVsBenchmarkSummary(BaseModel):
    funds: list[FundBenchmarkRow]
    overall_portfolio_xirr: str | None
    overall_broad_market_xirr: str | None


class AggregateFundVsBenchmarkResponse(BaseModel):
    members: list[MemberStatus]
    comparison: FundVsBenchmarkSummary


class CategoryRankRow(BaseModel):
    """PRD-04 FR-3/FR-4 — one held scheme's blended-CAGR rank within its
    full SEBI-category peer universe, plus that category's AUM-weighted
    average return (see category_ranking.py's module docstring for the
    blend-weight judgment call)."""

    scheme_id: str
    scheme_name: str
    sebi_category: str | None
    category_unavailable: bool
    insufficient_history: bool
    scheme_return: str | None
    category_rank: int | None
    category_size: int
    percentile: str | None
    category_avg_return: str | None
    thin_category: bool


class CategoryRankingSummary(BaseModel):
    funds: list[CategoryRankRow]


class AggregateCategoryRankingResponse(BaseModel):
    members: list[MemberStatus]
    ranking: CategoryRankingSummary
