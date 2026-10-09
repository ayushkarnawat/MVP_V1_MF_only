export interface AllocationBucket {
  label: string;
  current_value: string;
  percentage: string;
}

export interface AnalyticsAllocationSummary {
  by_category: AllocationBucket[];
  by_amc: AllocationBucket[];
  total_value: string;
}

export interface MemberStatus {
  id: string;
  name: string;
  has_data: boolean;
}

export interface AggregateAnalyticsAllocationResponse {
  members: MemberStatus[];
  allocation: AnalyticsAllocationSummary;
}

export interface WeightedTerSummary {
  weighted_ter: string | null;
  covered_value: string;
  total_value: string;
  reference_period: string | null;
  uncovered_schemes: string[];
}

export interface DirectRegularTerComparison {
  direct: WeightedTerSummary;
  regular: WeightedTerSummary;
}

export interface AggregateWeightedTerResponse {
  members: MemberStatus[];
  ter: WeightedTerSummary;
}

export interface AggregateDirectRegularTerResponse {
  members: MemberStatus[];
  ter: DirectRegularTerComparison;
}

export interface CategoryRankRow {
  scheme_id: string;
  scheme_name: string;
  sebi_category: string | null;
  category_unavailable: boolean;
  insufficient_history: boolean;
  scheme_return: string | null;
  category_rank: number | null;
  category_size: number;
  percentile: string | null;
  category_avg_return: string | null;
  thin_category: boolean;
}

export interface CategoryRankingSummary {
  funds: CategoryRankRow[];
}

export interface AggregateCategoryRankingResponse {
  members: MemberStatus[];
  ranking: CategoryRankingSummary;
}

/* Phase 2: Scorer Types (FR-5/FR-6/FR-7) */
export interface FundScoreRow {
  scheme_id: string;
  scheme_name: string;
  category_unavailable: boolean;
  insufficient_history: boolean;
  thin_category: boolean;
  risk_adjusted_tier: number | null;
  cost_adjustment: string | null;
  final_score: string | null;
  return_percentile: string | null;
  risk_percentile: string | null;
  consistency_hit_rate: string | null;
  // Optional (not just nullable): a score row cached before this field
  // existed has these keys absent from the payload entirely, not null.
  scheme_return?: string | null;
  category_avg_return?: string | null;
  downside_deviation?: string | null;
  category_avg_downside_deviation?: string | null;
  consistency_hits?: number | null;
  consistency_total_windows?: number | null;
}

export interface PortfolioScoreSummary {
  funds: FundScoreRow[];
  weighted_score: string | null;
  covered_value: string;
  total_value: string;
  uncovered_schemes: string[];
}

export interface AggregatePortfolioScoreResponse {
  members: MemberStatus[];
  score: PortfolioScoreSummary;
}

/* Phase 2: Benchmark Comparison Types (FR-8/FR-9) */
export type BenchmarkIndex =
  | "nifty_50"
  | "nifty_500"
  | "nifty_largemidcap_250"
  | "nifty_midcap_150";

export interface IndexXirrRow {
  index: BenchmarkIndex;
  xirr: string | null;
}

export interface PortfolioBenchmarkSummary {
  portfolio_xirr: string | null;
  benchmarks: IndexXirrRow[];
}

export interface AggregatePortfolioBenchmarkResponse {
  members: MemberStatus[];
  benchmark: PortfolioBenchmarkSummary;
}

export interface FundBenchmarkRow {
  scheme_id: string;
  scheme_name: string;
  benchmark_index: BenchmarkIndex;
  fund_xirr: string | null;
  benchmark_xirr: string | null;
}

export interface FundVsBenchmarkSummary {
  funds: FundBenchmarkRow[];
  overall_portfolio_xirr: string | null;
  overall_broad_market_xirr: string | null;
}

export interface AggregateFundVsBenchmarkResponse {
  members: MemberStatus[];
  comparison: FundVsBenchmarkSummary;
}

export interface AnalyticsExportPayload {
  scopeName: string;
  allocation: AnalyticsAllocationSummary | null;
  ter: WeightedTerSummary | null;
  terComparison: DirectRegularTerComparison | null;
  ranking: CategoryRankingSummary | null;
  // Optional: exports saved before attribute 09 have no fund ranking.
  fundRanking?: FundRankingSummary | null;
  // Optional: exports saved before attribute 04 have no fund managers.
  fundManager?: FundManagerAllocationSummary | null;
  scoreSummary: PortfolioScoreSummary | null;
  portfolioBenchmark: PortfolioBenchmarkSummary | null;
  fundBenchmark: FundVsBenchmarkSummary | null;
}

/* Consolidated precompute contract (backend/app/services/analytics/schemas.py) */
export const ANALYTICS_SECTION_NAMES = [
  "allocation",
  "ter",
  "ter_direct_regular",
  "benchmark",
  "benchmark_funds",
  "category_ranking",
  "ranking",
  "score",
  "investment_withdrawal",
  "fund_manager",
] as const;

export type AnalyticsSectionName = (typeof ANALYTICS_SECTION_NAMES)[number];

export interface AnalyticsSectionState {
  payload: Record<string, unknown> | null;
  computed_at: string | null;
  failed_at: string | null;
}

export interface AnalyticsScopeResponse {
  scope: string;
  recomputing: boolean;
  sections: Partial<Record<AnalyticsSectionName, AnalyticsSectionState>>;
}

export interface AnalyticsRetryResponse {
  dispatched: boolean;
}

export interface InvestmentWithdrawalEntry {
  transaction_id: string;
  date: string;
  type: string;
  amount: string;
  direction: "invested" | "withdrawn" | "reversal";
  scheme_name: string;
  household_member_id: string;
  household_member_name: string;
}

export interface InvestmentWithdrawalBucket {
  period: string;
  invested: string;
  withdrawn: string;
  entries: InvestmentWithdrawalEntry[];
}

export interface InvestmentWithdrawalSipSummary {
  active_count: number;
  total_monthly_amount: string;
  missed_count: number;
}

export interface InvestmentWithdrawalResult {
  total_invested: string;
  total_withdrawn: string;
  net_invested: string;
  current_value: string;
  absolute_gain: string;
  monthly: InvestmentWithdrawalBucket[];
  yearly: InvestmentWithdrawalBucket[];
  sip_summary: InvestmentWithdrawalSipSummary;
  gifts_net: string; // value of gifts received minus given, at transfer value (ruling 9 Oct)
}


export interface FundRankingNeighbor {
  scheme_id: string;
  scheme_name: string;
  category_rank: number;
  composite_score: string;
}

export interface FundRankingComponent {
  percentile: string | null;
  raw: string | null;
}

export interface FundRankingComponents {
  return_3y: FundRankingComponent;
  return_5y: FundRankingComponent;
  category_relative: FundRankingComponent;
  low_volatility: FundRankingComponent;
  low_ter: FundRankingComponent;
}

export interface FundRankingRow {
  scheme_id: string;
  scheme_name: string;
  category_name: string | null;
  category_unavailable: boolean;
  insufficient_history: boolean;
  thin_category: boolean;
  too_few_peers: boolean;
  composite_score: string | null;
  category_rank: number | null;
  category_size: number;
  category_universe_size: number;
  percentile: string | null;
  return_1y: string | null;
  ranked_as: string | null;
  neighbors: FundRankingNeighbor[];
  components: FundRankingComponents;
}

export interface FundRankingSummary {
  funds: FundRankingRow[];
}

export interface AggregateFundRankingResponse {
  members: MemberStatus[];
  ranking: FundRankingSummary;
}

export interface ManagerFundRow {
  scheme_id: string;
  scheme_name: string;
  household_value: string;
  sequence_order: number;
  role: string | null;
}

export interface ManagerGroup {
  manager_name: string;
  role: string | null;
  total_household_value: string;
  funds: ManagerFundRow[];
}

export interface UnavailableScheme {
  scheme_id: string;
  scheme_name: string;
  amc_name: string;
}

export interface FundManagerAllocationSummary {
  manager_groups: ManagerGroup[];
  unavailable_schemes: UnavailableScheme[];
}

export interface AggregateFundManagerAllocationResponse {
  members: MemberStatus[];
  fund_manager: FundManagerAllocationSummary;
}
