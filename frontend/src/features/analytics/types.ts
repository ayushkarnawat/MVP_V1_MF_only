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
  scoreSummary: PortfolioScoreSummary | null;
  portfolioBenchmark: PortfolioBenchmarkSummary | null;
  fundBenchmark: FundVsBenchmarkSummary | null;
}
