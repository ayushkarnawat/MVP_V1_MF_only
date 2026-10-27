from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.enums import AssetType, BenchmarkIndex, TransactionType
from app.services.dashboard.schemas import AllocationBucket, MemberStatus


class CoverageFund(BaseModel):
    scheme_id: UUID
    scheme_name: str


class LookthroughFundAge(CoverageFund):
    holdings_as_of: date
    cadence: str
    age_tag: Literal["older_than_60_days", "on_cycle"] | None


class FundContribution(LookthroughFundAge):
    fund_weight_pct: Decimal
    stock_weight_pct: Decimal


class LookthroughCoverage(BaseModel):
    covered_value_pct: Decimal
    not_published_yet: list[CoverageFund]
    not_available_from_amc: list[CoverageFund]
    missing_value_schemes: list[CoverageFund]
    funds: list[LookthroughFundAge]


class StockHoldingRow(BaseModel):
    isin: str | None
    instrument_name: str
    sector_raw: str | None
    asset_type: AssetType
    exposure_pct: Decimal
    exposure_value: Decimal
    contributing_funds: list[FundContribution]


class StockHoldingsSummary(BaseModel):
    rows: list[StockHoldingRow]
    nav_as_of: date | None
    holdings_as_of: date | None
    total_portfolio_value: Decimal
    coverage: LookthroughCoverage
    truncated: bool
    total_stock_count: int
    hide_headlines: bool
    excluded_share: Decimal
    non_equity_share: Decimal


class AggregateStockHoldingsResponse(BaseModel):
    members: list[MemberStatus]
    stock_holdings: StockHoldingsSummary


class CapAllocationBucket(BaseModel):
    key: Literal["LARGE", "MID", "SMALL", "OTHER"]
    value: Decimal
    percentage_total: Decimal
    percentage_equity: Decimal
    rows: list[StockHoldingRow]
    # rows is capped (CAP_ROWS_LIMIT, largest first); the value, percentages and this count cover every stock.
    row_count: int = 0


class CapAllocationOther(BaseModel):
    non_equity_value: Decimal
    unclassified_equity_value: Decimal
    non_equity_rows: list[StockHoldingRow]
    unclassified_equity_rows: list[StockHoldingRow]
    non_equity_count: int = 0
    unclassified_equity_count: int = 0


class CapAllocationSummary(BaseModel):
    buckets: list[CapAllocationBucket]
    other: CapAllocationOther
    total_portfolio_value: Decimal
    total_equity_value: Decimal
    nav_as_of: date | None
    holdings_as_of: date | None
    classification_as_of: date | None
    coverage: LookthroughCoverage
    hide_headlines: bool
    excluded_share: Decimal


class AggregateCapAllocationResponse(BaseModel):
    members: list[MemberStatus]
    cap_allocation: CapAllocationSummary


class AnalyticsAllocationSummary(BaseModel):
    by_category: list[AllocationBucket]
    by_amc: list[AllocationBucket]
    total_value: str


class AggregateAnalyticsAllocationResponse(BaseModel):
    members: list[MemberStatus]
    allocation: AnalyticsAllocationSummary


class FundTerRow(BaseModel):
    scheme_id: str
    scheme_name: str
    plan_type: str | None = None
    ter: str | None = None
    value: str
    cost_1y: str | None = None
    cost_3y: str | None = None
    cost_5y: str | None = None
    # Optional (MF-B ask C139): rupees a year a Direct holding saves against its own
    # Regular sibling, value x (Regular TER - Direct TER) / 100. None when not Direct,
    # no sibling or no TER on either side, or Direct is not cheaper.
    annual_ter_saving: str | None = None


class WeightedTerSummary(BaseModel):
    """PRD-04 FR-10 — weighted by the user's own holding value, not the
    fund's platform-wide AAUM (see amfi_aaum_client.py's docstring)."""

    weighted_ter: str | None
    covered_value: str
    total_value: str
    reference_period: date | None
    uncovered_schemes: list[str]
    cost_1y: str | None = None
    cost_3y: str | None = None
    cost_5y: str | None = None
    funds: list[FundTerRow] = Field(default_factory=list)


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


class BenchmarkWindowRow(BaseModel):
    """Portfolio XIRR and each index's hypothetical XIRR over one window.

    A "1Y", "3Y" or "5Y" window does not start exactly one, three or five years before today: it starts at
    the month end that many years before the last completed month end, because the opening value comes
    from the month-end snapshots. "1Y" therefore spans 12 to 13 months (366 to 397 days; 389 days on
    24 Oct 2026, starting 30 Sep 2025). `start_date` is that real start and the page must show it. "SI"
    starts at the first transaction. A window is unavailable (`available` false, every rate null) when the
    household has no complete snapshot at its start, or when a CAS opening balance falls inside it
    (`unavailable_reason == "opening_balance_in_window"`)."""

    window: Literal["1Y", "3Y", "5Y", "SI"]
    available: bool
    start_date: date | None = Field(
        description="The real first day of the window (the month-end snapshot date), not today minus N years. "
        "1Y spans 12 to 13 months. Null when the window is unavailable."
    )
    portfolio_xirr: str | None
    indices: list[IndexXirrRow]
    unavailable_reason: Literal["opening_balance_in_window"] | None = Field(
        default=None,
        description="Why a window with enough history is still unavailable: a CAS opening balance (dated at "
        "its statement start, not when the money was invested) falls inside it, so the money in and the "
        "start value cannot be told apart. Null otherwise, including when there is simply not enough history.",
    )


class FundWindowXirr(BaseModel):
    window: Literal["1Y", "3Y", "5Y", "SI"]
    fund_xirr: str | None
    benchmark_xirr: str | None


class PortfolioBenchmarkSummary(BaseModel):
    """PRD-04 FR-8 — portfolio XIRR from the full transaction history,
    alongside XIRR for all 4 Nifty indices computed via the same
    cash-flow-timing method (see xirr.py, benchmark.py)."""

    portfolio_xirr: str | None
    benchmarks: list[IndexXirrRow]
    windows: list[BenchmarkWindowRow] = []


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
    windows: list[FundWindowXirr] = []


class FundVsBenchmarkSummary(BaseModel):
    funds: list[FundBenchmarkRow]
    overall_portfolio_xirr: str | None
    overall_broad_market_xirr: str | None


class AggregateFundVsBenchmarkResponse(BaseModel):
    members: list[MemberStatus]
    comparison: FundVsBenchmarkSummary


class PeriodReturn(BaseModel):
    fund_return: str | None = None
    category_avg: str | None = None
    peers: int = 0


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
    periods: dict[str, PeriodReturn] = Field(default_factory=dict)
    plan_type: str | None = None


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
    # Optional ledger detail (MF-B ask C133); absent on payloads stored before it.
    units: str | None = None
    nav: str | None = None
    folio: str | None = None  # masked: "XXXX" + last four alphanumerics


class InvestmentWithdrawalBucket(BaseModel):
    period: str  # "YYYY-MM" for monthly buckets, "YYYY" for yearly
    invested: str
    withdrawn: str
    entries: list[InvestmentWithdrawalEntry]
    switched_in: str = "0.00"
    switched_out: str = "0.00"


class InvestmentWithdrawalSipSummary(BaseModel):
    active_count: int
    total_monthly_amount: str
    missed_count: int
    # Optional (MF-B ask C133): the SIP with the most missed instalments and the date
    # of the first one it missed; both None when nothing is missed.
    missed_sip_fund: str | None = None
    missed_sip_date: date | None = None


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
    total_switched_in: str = "0.00"
    total_switched_out: str = "0.00"
    switch_count: int = 0
    opening_holdings: str = "0.00"


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
    horizons: dict[str, PeriodReturn] = Field(default_factory=dict)
    plan_type: str | None = None


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
    amc_name: str = ""
    percentage: str = "0.00"
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
    portfolio_value: str = "0.00"
    covered_value: str = "0.00"
    covered_percentage: str = "0.00"


class AggregateFundManagerAllocationResponse(BaseModel):
    members: list[MemberStatus]
    fund_manager: FundManagerAllocationSummary


class ScenarioSummaryRow(BaseModel):
    scenario_id: str
    name: str
    description: str = ""
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
    is_proxied: bool = False
    proxy_basis: str | None = None
    is_frozen: bool = False


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


class ScenarioAssetClassRow(BaseModel):
    bucket: str
    rupee_impact: str
    covered_value: str
    pct: str | None


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
    by_asset_class: list[ScenarioAssetClassRow] = []
    funds_data_available: bool = True


class AssetAllocationClassFund(CoverageFund):
    value: Decimal
    percentage: Decimal  # percent of the asset class, not of the portfolio


class AssetAllocationClass(BaseModel):
    key: Literal["equity", "debt", "gold", "cash_like"]
    value: Decimal
    percentage: Decimal
    # Optional (MF-B ask C133, Asset Class drill): funds contributing to the class,
    # largest first; None on payloads stored before this field existed.
    funds: list[AssetAllocationClassFund] | None = None


class AssetAllocationOuter(BaseModel):
    key: Literal["LARGE", "MID", "SMALL", "OTHER"]
    value: Decimal
    percentage: Decimal


class AssetAllocationVariant(BaseModel):
    classes: list[AssetAllocationClass]
    equity_outer: list[AssetAllocationOuter]
    cap_allocation: CapAllocationSummary


class AssetAllocationSummary(BaseModel):
    as_disclosed: AssetAllocationVariant
    arbitrage_as_cash: AssetAllocationVariant
    total_portfolio_value: Decimal
    covered_value: Decimal
    nav_as_of: date | None
    holdings_as_of: date | None
    coverage: LookthroughCoverage
    hide_headlines: bool
    excluded_share: Decimal
    arbitrage_funds: list[CoverageFund]


class AggregateAssetAllocationResponse(BaseModel):
    members: list[MemberStatus]
    asset_allocation: AssetAllocationSummary


class OverlapBands(BaseModel):
    low: Decimal
    high: Decimal


class OverlapCommonStock(BaseModel):
    isin: str
    instrument_name: str
    weight_a: Decimal
    weight_b: Decimal


class OverlapResult(BaseModel):
    overlap_pct: Decimal
    common_stocks: list[OverlapCommonStock]
    common_total: int


class OverlapFund(CoverageFund):
    current_value: Decimal


class OverlapPair(OverlapResult):
    fund_a: OverlapFund
    fund_b: OverlapFund


class OverlapDriver(BaseModel):
    isin: str
    instrument_name: str
    contribution_pct: Decimal  # the smaller of the stock's two fund weights, percent of net assets
    share_of_pair_pct: Decimal  # contribution_pct as a percent of the pair's overlap_pct


class OverlapImpactPair(BaseModel):
    fund_a: OverlapFund
    fund_b: OverlapFund
    overlap_pct: Decimal
    drivers: list[OverlapDriver]


class ConcentrationPoint(BaseModel):
    stock_count: int
    exposure_pct: Decimal


class OverlapSummary(BaseModel):
    matrix_funds: list[OverlapFund]
    matrix: list[OverlapPair]  # unordered pairs; diagonal omitted
    pairs_above_low: list[OverlapPair]
    # Optional (MF-C ask C139), None on payloads stored before they existed.
    # Stock-level impact: the largest common stocks behind each of the top pairs above low.
    impact_pairs: list[OverlapImpactPair] | None = None
    # Pairs at exactly the low band, which the strict pairs_above_low leaves out; an
    # inclusive view is pairs_above_low + this, re-sorted by overlap.
    pairs_at_low_boundary: list[OverlapPair] | None = None
    matrix_truncated: bool
    total_fund_count: int
    common_stock_limit: int
    bands: OverlapBands
    concentration: list[ConcentrationPoint]
    total_stock_count: int
    nav_as_of: date | None
    holdings_as_of: date | None
    total_portfolio_value: Decimal
    coverage: LookthroughCoverage
    hide_headlines: bool
    excluded_share: Decimal


class AggregateOverlapResponse(BaseModel):
    members: list[MemberStatus]
    overlap: OverlapSummary


class ValuationMissingHolding(BaseModel):
    isin: str | None
    instrument_name: str
    exposure_value: Decimal
    percentage_equity: Decimal
    reason: str


class ValuationMetric(BaseModel):
    ratio: Decimal | None
    coverage_pct: Decimal
    enough_data: bool
    as_of_date: date | None
    missing: list[ValuationMissingHolding]


class ValuationIndex(BaseModel):
    index_name: BenchmarkIndex
    pe_ratio: Decimal | None
    pb_ratio: Decimal | None
    pe_as_of: date | None
    pb_as_of: date | None
    pe_delta_pct: Decimal | None
    pb_delta_pct: Decimal | None


class ValuationSummary(BaseModel):
    pe: ValuationMetric
    pb: ValuationMetric
    indices: list[ValuationIndex]
    total_equity_value: Decimal
    total_portfolio_value: Decimal
    nav_as_of: date | None
    holdings_as_of: date | None
    coverage: LookthroughCoverage
    hide_headlines: bool
    excluded_share: Decimal
    footnotes: list[str]


class AggregateValuationResponse(BaseModel):
    members: list[MemberStatus]
    valuation: ValuationSummary
