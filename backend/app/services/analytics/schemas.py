from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel

from app.models.enums import BenchmarkIndex, TransactionType
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


class FundScoreRow(BaseModel):
    """PRD-04 FR-5/FR-7 — one fund's composite score plus the full
    breakdown (return_percentile, risk_percentile, consistency_hit_rate)
    so it's never displayed as a bare number or a single-word label. The
    six `*_return`/`*_deviation`/`consistency_*` fields below are the raw
    numbers behind those percentiles — computed in `scorer.py` regardless,
    now also threaded through for the card's "See the evidence" section
    instead of being discarded after the percentile conversion."""

    scheme_id: str
    scheme_name: str
    category_unavailable: bool
    insufficient_history: bool
    thin_category: bool
    risk_adjusted_tier: int | None
    cost_adjustment: str | None
    final_score: str | None
    return_percentile: str | None
    risk_percentile: str | None
    consistency_hit_rate: str | None
    scheme_return: str | None
    category_avg_return: str | None
    downside_deviation: str | None
    category_avg_downside_deviation: str | None
    consistency_hits: int | None
    consistency_total_windows: int | None


class PortfolioScoreSummary(BaseModel):
    """PRD-04 FR-6 — AUM-weighted (by the member's own holding value, same
    convention as FR-10's weighted TER) roll-up of held funds' final_score,
    computed on-read, never stored."""

    funds: list[FundScoreRow]
    weighted_score: str | None
    covered_value: str
    total_value: str
    uncovered_schemes: list[str]


class AggregatePortfolioScoreResponse(BaseModel):
    members: list[MemberStatus]
    score: PortfolioScoreSummary


class CategoryRankingSummary(BaseModel):
    funds: list[CategoryRankRow]


class AggregateCategoryRankingResponse(BaseModel):
    members: list[MemberStatus]
    ranking: CategoryRankingSummary


class AnalyticsSectionState(BaseModel):
    payload: dict | None
    computed_at: datetime | None
    failed_at: datetime | None


class AnalyticsScopeResponse(BaseModel):
    scope: str
    recomputing: bool
    sections: dict[str, AnalyticsSectionState]


class AnalyticsRetryResponse(BaseModel):
    dispatched: bool


class InvestmentWithdrawalEntry(BaseModel):
    transaction_id: str
    date: date
    type: TransactionType
    amount: str
    direction: str
    scheme_name: str
    household_member_id: str
    household_member_name: str


class InvestmentWithdrawalBucket(BaseModel):
    period: str  # "YYYY-MM" for monthly buckets, "YYYY" for yearly
    invested: str
    withdrawn: str
    entries: list[InvestmentWithdrawalEntry]


class InvestmentWithdrawalSipSummary(BaseModel):
    active_count: int
    total_monthly_amount: str
    missed_count: int


class InvestmentWithdrawalResult(BaseModel):
    total_invested: str
    total_withdrawn: str
    net_invested: str
    current_value: str
    absolute_gain: str
    monthly: list[InvestmentWithdrawalBucket]
    yearly: list[InvestmentWithdrawalBucket]
    sip_summary: InvestmentWithdrawalSipSummary
    # Value of units received as gifts minus units given away, at transfer
    # value. Not cash, so outside Invested/Withdrawn; absolute_gain excludes
    # it (decided 9 Oct). Non-zero drives the frontend's gift note.
    gifts_net: str = "0.00"


class AggregateInvestmentWithdrawalResponse(BaseModel):
    members: list[MemberStatus]
    data: InvestmentWithdrawalResult


class FundRankingNeighbor(BaseModel):
    scheme_id: str
    scheme_name: str
    category_rank: int
    composite_score: str


class FundRankingComponent(BaseModel):
    percentile: str | None
    raw: str | None


class FundRankingComponents(BaseModel):
    return_3y: FundRankingComponent
    return_5y: FundRankingComponent
    category_relative: FundRankingComponent
    low_volatility: FundRankingComponent
    low_ter: FundRankingComponent


class FundRankingRow(BaseModel):
    scheme_id: str
    scheme_name: str
    category_name: str | None
    category_unavailable: bool
    insufficient_history: bool
    thin_category: bool           # ranked funds < 5 (fix 3)
    too_few_peers: bool           # ranked funds < 3: no rank shown (D2)
    composite_score: str | None   # the 0-100 composite, never the percentile (fix 1)
    category_rank: int | None
    category_size: int            # ranked funds (3Y+ history), one per fund
    category_universe_size: int   # funds in the category, ranked or not (fix 3, option C)
    percentile: str | None
    return_1y: str | None
    ranked_as: str | None         # the series ranked when it isn't the held one (e.g. IDCW -> Growth)
    neighbors: list[FundRankingNeighbor]
    components: FundRankingComponents


class FundRankingSummary(BaseModel):
    funds: list[FundRankingRow]


class AggregateFundRankingResponse(BaseModel):
    members: list[MemberStatus]
    ranking: FundRankingSummary


class ManagerFundRow(BaseModel):
    scheme_id: str
    scheme_name: str
    household_value: str
    sequence_order: int
    role: str | None = None  # this manager's role on this fund, as printed ("Assistant Fund Manager")


class ManagerGroup(BaseModel):
    manager_name: str
    role: str | None
    total_household_value: str
    funds: list[ManagerFundRow]


class UnavailableScheme(BaseModel):
    scheme_id: str
    scheme_name: str
    amc_name: str


class FundManagerAllocationSummary(BaseModel):
    manager_groups: list[ManagerGroup]
    unavailable_schemes: list[UnavailableScheme]


class AggregateFundManagerAllocationResponse(BaseModel):
    members: list[MemberStatus]
    fund_manager: FundManagerAllocationSummary


class ScenarioSummaryRow(BaseModel):
    scenario_id: str
    name: str
    scenario_type: str
    start_date: str | None
    end_date: str | None
    is_ongoing: bool
    display_rank: int | None
    parent_scenario_id: str | None
    has_phases: bool
    had_redemption_freeze_schemes: list[str] | None
    quick_market_pct: str | None      # Nifty 50 TRI over the window (card 10)
    quick_equity_pct: str | None      # AUM-weighted equity funds
    quick_debt_pct: str | None        # AUM-weighted debt funds
    quick_weight_quarter: str | None  # the AUM quarter used as weights


class ScenarioPhaseResult(BaseModel):
    label: str
    order: int
    start_date: str
    end_date: str | None
    is_ongoing: bool
    pct: str | None


class ScenarioFundResult(BaseModel):
    scheme_id: str
    scheme_name: str
    pct: str | None
    is_proxied: bool
    proxy_basis: str | None
    is_frozen: bool


class ScenarioMemberFundResult(BaseModel):
    scheme_id: str
    scheme_name: str
    rupee_impact: str | None


class ScenarioMemberResult(BaseModel):
    household_member_id: str
    member_name: str
    rupee_impact: str
    pct: str | None                  # this member's own % (fix 6)
    funds: list[ScenarioMemberFundResult]


class ScenarioBenchmarkResult(BaseModel):
    name: str
    pct: str


class ScenarioHypotheticalAssumptionRow(BaseModel):
    asset_class: str
    assumed_pct_change: str
    assumption_note: str


class ScenarioResultRow(BaseModel):
    scenario: ScenarioSummaryRow
    portfolio_impact_pct: str | None   # Σ rupee impact ÷ covered_value (fix 6)
    rupee_impact: str | None
    covered_value: str | None          # absent when hypothetical assumptions are unset
    total_value: str | None
    no_data_funds: int | None
    benchmarks: list[ScenarioBenchmarkResult]
    phases: list[ScenarioPhaseResult]
    by_fund: list[ScenarioFundResult]
    by_member: list[ScenarioMemberResult]
    hypothetical_assumptions: list[ScenarioHypotheticalAssumptionRow]
    assumptions_not_set: bool
