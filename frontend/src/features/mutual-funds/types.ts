// Contract types for the Mutual Funds page front end (packets MF-A, MF-B and MF-C). Orchestrator-owned: never edit.
// MF-C adds the overlap, valuation, TER, category-ranking, scorer and fund-ranking sections (copies of the same schemas.py).
// MF-B adds (all copies of backend/app/services/analytics/schemas.py, which is authoritative): the benchmark windows,
// the look-through stock rows, the asset-class, market-cap, category/AMC and fund-manager allocations and the
// full investment-and-withdrawal ledger.
// Every type below is a COPY of a type the legacy screens already use (features/dashboard/types.ts,
// features/analytics/types.ts, features/import/types.ts, features/history/api.ts). They are copied, not imported,
// because the mutual-funds feature may not import another feature (see guards.test.ts). A change to a backend
// response must be made in both places until the legacy screens are deleted.

export type PlanType = "direct" | "regular" | "unclassified";

export interface HoldingRow {
  scheme_id: string;
  scheme_name: string;
  amc_name?: string;
  asset_class?: string;
  household_member_id: string;
  household_member_name: string;
  plan_type: PlanType;
  plan_verified?: boolean;
  units_held: string;
  average_nav: string;
  current_nav: string | null;
  current_nav_date?: string | null;
  amount_invested: string;
  current_value: string | null;
  current_profit_total: string | null;
  realized_gain: string;
  unrealized_gain: string | null;
  today_gain: string | null;
  nav_unavailable?: boolean;
  category?: string;
  // The backend change MB1 adds the SEBI category as `sebi_category`. A stored payload from before it has neither.
  sebi_category?: string | null;
  stale_nav?: boolean;
  price_from_statement?: boolean;
}

export interface AllocationItem { label: string; current_value: string; percentage: number }
export interface AllocationSummary {
  by_asset_class: AllocationItem[];
  by_amc: AllocationItem[];
  total_value: string;
  nav_unavailable_count?: number;
}

export interface SipRow {
  scheme_id: string;
  scheme_name: string;
  household_member_id: string;
  household_member_name: string;
  sip_date: string;
  sip_amount: string;
  next_due_date: string;
  series_count?: number; // parallel twin SIPs of this amount: the monthly total counts the amount this many times
  status?: "active" | "stopped";
}

export interface SipMonthlyRow {
  scheme_id: string;
  scheme_name: string;
  household_member_id: string;
  household_member_name: string;
  date: string;
  amount: string;
  instalment?: number;
}

export interface RealizedFund {
  scheme_id: string;
  scheme_name: string;
  household_member_id: string;
  household_member_name: string;
  plan_type: PlanType;
  realized_gain: string;
  fully_sold: boolean;
}
export interface RealizedSummary { total: string; funds: RealizedFund[] }
export interface FamilyMemberStatus { id: string; name: string; has_data: boolean }

/** Both fields are decimal-fraction strings ("0.3800" = 38%). */
export interface XirrDisclaimer { alt_xirr: string | null; opening_cost_share: string }

export interface AggregateHoldingsResponse {
  members: FamilyMemberStatus[];
  holdings: HoldingRow[];
  lifetime_xirr?: string | null;
  current_holdings_xirr?: string | null;
  lifetime_xirr_disclaimer?: XirrDisclaimer | null;
  current_holdings_xirr_disclaimer?: XirrDisclaimer | null;
  realized_summary?: RealizedSummary;
}
export interface MemberHoldingsResponse {
  holdings: HoldingRow[];
  lifetime_xirr: string | null;
  current_holdings_xirr: string | null;
  lifetime_xirr_disclaimer?: XirrDisclaimer | null;
  current_holdings_xirr_disclaimer?: XirrDisclaimer | null;
  realized_summary?: RealizedSummary;
}
export interface AggregateAllocationResponse { members: FamilyMemberStatus[]; allocation: AllocationSummary }
export interface AggregateSipsResponse { members: FamilyMemberStatus[]; sips: SipRow[] }
export interface AggregateSipsMonthlyResponse { members: FamilyMemberStatus[]; sips: SipMonthlyRow[] }

export interface SnapshotRow {
  household_member_id: string;
  household_member_name: string;
  snapshot_month: string;
  total_value: string;
  invested_value?: string | null;
  is_partial?: boolean;
  missing_scheme_names?: string[];
}
export interface AggregateSnapshotsResponse { members: FamilyMemberStatus[]; snapshots: SnapshotRow[] }

export interface MonthFundRow {
  scheme_id: string;
  scheme_name: string;
  household_member_id: string;
  household_member_name: string;
  units: string;
  nav: string | null;
  nav_date: string | null;
  value: string | null;
  cost: string;
  change_in_value: string | null;
  new_money: string;
  market_movement: string | null;
  priced: boolean;
}
export interface MonthDetail {
  month: string;
  previous_month: string | null;
  total_value: string;
  previous_value: string;
  change: string | null;
  new_money: string;
  market_movement: string | null;
  is_partial: boolean;
  missing_scheme_names: string[];
  funds: MonthFundRow[];
}

/** One month-end on the history chart. `value` and `invested` are geometry numbers; the *Text fields are exact. */
export interface HistoryPoint {
  month: string;
  value: number;
  invested: number | null;
  valueText: string;
  investedText: string | null;
  partial: boolean;
  missing: string[];
}

export interface CoverageGapItem {
  folio_id: string;
  folio_number: string;
  scheme_id: string;
  scheme_name: string;
  deficit_units: string;
  first_deficit_date: string;
}

// ---- analytics (GET /analytics/{scope}) ----
export const ANALYTICS_SECTION_NAMES = [
  "allocation", "ter", "ter_direct_regular", "benchmark", "benchmark_funds", "category_ranking", "ranking",
  "score", "investment_withdrawal", "fund_manager", "stock_holdings", "cap_allocation", "asset_allocation",
  "overlap", "valuation",
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

export interface CoverageFund { scheme_id: string; scheme_name: string }
export interface LookthroughCoverage {
  covered_value_pct: string;
  not_published_yet: CoverageFund[];
  not_available_from_amc: CoverageFund[];
  missing_value_schemes: CoverageFund[];
  funds: Array<CoverageFund & { holdings_as_of: string; cadence: string; age_tag: "older_than_60_days" | "on_cycle" | null }>;
}

export interface FundBenchmarkRow {
  scheme_id: string;
  scheme_name: string;
  benchmark_index: string;
  fund_xirr: string | null;
  benchmark_xirr: string | null;
  /** Added by the MB backend; a payload stored before it has none (the page then shows since-inception only). */
  windows?: FundWindowXirr[];
}
export interface FundVsBenchmarkSummary {
  funds: FundBenchmarkRow[];
  overall_portfolio_xirr: string | null;
  overall_broad_market_xirr: string | null;
}
// ---- benchmark windows (backend: PortfolioBenchmarkSummary, BenchmarkWindowRow, FundWindowXirr) ----
export type BenchmarkIndexKey =
  | "nifty_50" | "nifty_500" | "nifty_largemidcap_250" | "nifty_midcap_150"
  | "nifty_next_50" | "nifty_smallcap_250" | "nifty_100" | "nifty_200";
export type BenchmarkWindow = "1Y" | "3Y" | "5Y" | "SI";
export interface IndexXirrRow { index: BenchmarkIndexKey; xirr: string | null }
export interface BenchmarkWindowRow {
  window: BenchmarkWindow;
  available: boolean;
  /** The real first day of the window (a month end), null when unavailable. 1Y is 12 to 13 months, not exactly a year. */
  start_date: string | null;
  portfolio_xirr: string | null;
  indices: IndexXirrRow[];
  unavailable_reason?: "opening_balance_in_window" | null;
}
export interface FundWindowXirr { window: BenchmarkWindow; fund_xirr: string | null; benchmark_xirr: string | null }
export interface PortfolioBenchmarkSummary {
  portfolio_xirr: string | null;
  /** The four legacy indices, since inception. */
  benchmarks: IndexXirrRow[];
  /** Added by the MB backend; a payload stored before it has none. */
  windows?: BenchmarkWindowRow[];
}

// ---- look-through (backend: FundContribution, StockHoldingRow, StockHoldingsSummary, Cap*, AssetAllocation*) ----
export interface FundContribution {
  scheme_id: string;
  scheme_name: string;
  holdings_as_of: string;
  cadence: string;
  age_tag: "older_than_60_days" | "on_cycle" | null;
  /** The fund's weight in the household portfolio, percent. */
  fund_weight_pct: string;
  /** The stock's weight inside that fund, percent. */
  stock_weight_pct: string;
}
export interface StockHoldingRow {
  isin: string | null;
  instrument_name: string;
  sector_raw: string | null;
  asset_type: "equity_domestic" | "equity_international" | "debt" | "gold_silver" | "reit_invit" | "cash_equivalent" | "derivative" | "other";
  /** Percent of the household portfolio. */
  exposure_pct: string;
  exposure_value: string;
  contributing_funds: FundContribution[];
}
export interface StockHoldingsSummary {
  rows: StockHoldingRow[];
  nav_as_of: string | null;
  holdings_as_of: string | null;
  total_portfolio_value: string;
  coverage: LookthroughCoverage;
  truncated: boolean;
  total_stock_count: number;
  hide_headlines: boolean;
  excluded_share: string;
  non_equity_share: string;
}
export type CapKey = "LARGE" | "MID" | "SMALL" | "OTHER";
export interface CapAllocationBucket {
  key: CapKey;
  value: string;
  percentage_total: string;
  percentage_equity: string;
  /** Absent or empty until this stored section is recomputed. */
  percentage_classified?: string;
  /** Capped by the backend, largest first; value, percentages and row_count cover every stock. */
  rows: StockHoldingRow[];
  row_count: number;
}
export interface CapAllocationOther {
  non_equity_value: string;
  unclassified_equity_value: string;
  non_equity_rows: StockHoldingRow[];
  unclassified_equity_rows: StockHoldingRow[];
  non_equity_count: number;
  unclassified_equity_count: number;
}
export interface CapAllocationSummary {
  /** Absent or empty until this stored section is recomputed. */
  unclassified_share_pct?: string;
  buckets: CapAllocationBucket[];
  other: CapAllocationOther;
  total_portfolio_value: string;
  total_equity_value: string;
  nav_as_of: string | null;
  holdings_as_of: string | null;
  classification_as_of: string | null;
  coverage: LookthroughCoverage;
  hide_headlines: boolean;
  excluded_share: string;
}
export type AssetClassKey = "equity" | "debt" | "gold" | "cash_like" | "real_estate" | "others";
/** ASKS-FE-M (C160): a fund inside one asset class. `percentage` is the share of that class (positive parts only), not of the portfolio. */
export interface AssetAllocationClassFund { scheme_id: string; scheme_name: string; value: string; percentage: string }
export interface AssetAllocationClass {
  key: AssetClassKey;
  value: string;
  percentage: string;
  /** Optional (absent or null on payloads stored before the ask). Largest first; only funds with a positive part. */
  funds?: AssetAllocationClassFund[] | null;
}
export interface AssetAllocationOuter { key: CapKey; value: string; percentage: string }
export interface AssetAllocationVariant {
  classes: AssetAllocationClass[];
  equity_outer: AssetAllocationOuter[];
  cap_allocation: CapAllocationSummary;
}
export interface AssetAllocationSummary {
  as_disclosed: AssetAllocationVariant;
  arbitrage_as_cash: AssetAllocationVariant;
  total_portfolio_value: string;
  covered_value: string;
  nav_as_of: string | null;
  holdings_as_of: string | null;
  coverage: LookthroughCoverage;
  hide_headlines: boolean;
  excluded_share: string;
  arbitrage_funds: CoverageFund[];
}

// ---- category / AMC and fund manager ----
/** The analytics `allocation` section. `percentage` is a Decimal string here (it is a number in the dashboard allocation). */
export interface AnalyticsAllocationBucket { label: string; current_value: string; percentage: string }
export interface AnalyticsAllocationSummary {
  by_category: AnalyticsAllocationBucket[];
  by_amc: AnalyticsAllocationBucket[];
  total_value: string;
}
export interface ManagerFundRow {
  scheme_id: string;
  scheme_name: string;
  household_value: string;
  sequence_order: number;
  role?: string | null;
}
export interface ManagerGroup {
  manager_name: string;
  amc_name: string;
  /** Percent of the whole portfolio. */
  percentage: string;
  role: string | null;
  total_household_value: string;
  funds: ManagerFundRow[];
}
export interface UnavailableScheme { scheme_id: string; scheme_name: string; amc_name: string }
export interface FundManagerAllocationSummary {
  manager_groups: ManagerGroup[];
  unavailable_schemes: UnavailableScheme[];
  portfolio_value: string;
  covered_value: string;
  covered_percentage: string;
}

// ---- investment and withdrawal (the Transactions page and the Performance absolute return) ----
export interface InvestmentWithdrawalEntry {
  transaction_id: string;
  date: string;
  type: string;
  amount: string;
  direction: "invested" | "withdrawn" | "reversal" | "switched_in" | "switched_out" | "opening";
  scheme_name: string;
  household_member_id: string;
  household_member_name: string;
  /** ASKS-FE-M (backend C133/C160), optional: absent on payloads stored before the ask. Decimal strings. */
  units?: string | null;
  nav?: string | null;
  /** Masked by the backend: "XXXX" plus the last four letters or digits of the folio. */
  folio?: string | null;
  /** Fund link (IF-E BE1), optional: absent on payloads stored before it. */
  scheme_id?: string | null;
}
export interface InvestmentWithdrawalBucket {
  /** "YYYY-MM" for monthly buckets, "YYYY" for yearly. */
  period: string;
  invested: string;
  withdrawn: string;
  entries: InvestmentWithdrawalEntry[];
  switched_in?: string;
  switched_out?: string;
}
export interface InvestmentWithdrawalResult {
  total_invested: string;
  total_withdrawn: string;
  net_invested: string;
  current_value: string;
  absolute_gain: string;
  monthly: InvestmentWithdrawalBucket[];
  yearly: InvestmentWithdrawalBucket[];
  sip_summary: {
    active_count: number;
    total_monthly_amount: string;
    missed_count: number;
    /** ASKS-FE-M (C160), optional: the SIP with the most missed instalments and the date of the first one it missed ("YYYY-MM-DD"); null when none. */
    missed_sip_fund?: string | null;
    missed_sip_date?: string | null;
  };
  gifts_net: string;
  total_switched_in?: string;
  total_switched_out?: string;
  switch_count?: number;
  opening_holdings?: string;
}

// ---- MF-C: overlap (backend: OverlapSummary, OverlapPair, OverlapFund, OverlapCommonStock, ConcentrationPoint) ----
export interface OverlapFund { scheme_id: string; scheme_name: string; current_value: string }
export interface OverlapCommonStock {
  isin: string;
  instrument_name: string;
  /** The stock's weight inside fund A and fund B, percent of each fund's net assets. */
  weight_a: string;
  weight_b: string;
}
export interface OverlapPair {
  fund_a: OverlapFund;
  fund_b: OverlapFund;
  /** Percent: the sum over the shared stocks of the smaller of the two fund weights. */
  overlap_pct: string;
  /** At most `common_stock_limit` stocks, largest shared weight first; `common_total` counts every shared stock. */
  common_stocks: OverlapCommonStock[];
  common_total: number;
}
/** ASKS-FE-M (C160): one stock behind a pair's overlap. */
export interface OverlapDriver {
  isin: string;
  instrument_name: string;
  /** The smaller of the stock's two fund weights, percent of net assets. */
  contribution_pct: string;
  /** `contribution_pct` as a percent of the pair's `overlap_pct`. */
  share_of_pair_pct: string;
}
export interface OverlapImpactPair {
  fund_a: OverlapFund;
  fund_b: OverlapFund;
  overlap_pct: string;
  /** Up to 5 stocks, largest shared weight first. */
  drivers: OverlapDriver[];
}
export interface ConcentrationPoint { stock_count: number; exposure_pct: string }
export interface OverlapSummary {
  /** At most 12 funds, largest household value first. */
  matrix_funds: OverlapFund[];
  /** Every pair among `matrix_funds`, in `combinations(matrix_funds, 2)` order. */
  matrix: OverlapPair[];
  /** Every pair among ALL funds with overlap strictly above the low band, largest first. */
  pairs_above_low: OverlapPair[];
  /** ASKS-FE-M (C160), optional: the top 3 of `pairs_above_low` with their biggest shared stocks. */
  impact_pairs?: OverlapImpactPair[] | null;
  /** Optional: pairs at exactly the low band, which the strict `pairs_above_low` leaves out. The inclusive list is the two joined, re-sorted by overlap. */
  pairs_at_low_boundary?: OverlapPair[] | null;
  matrix_truncated: boolean;
  /** Funds with published holdings (not only the ones in the matrix). */
  total_fund_count: number;
  common_stock_limit: number;
  bands: { low: string; high: string };
  /** Cumulative portfolio exposure of the N largest equity stocks, for N in {5, 10, 20, 50} capped at the stock count. */
  concentration: ConcentrationPoint[];
  total_stock_count: number;
  nav_as_of: string | null;
  holdings_as_of: string | null;
  total_portfolio_value: string;
  coverage: LookthroughCoverage;
  hide_headlines: boolean;
  excluded_share: string;
}

// ---- MF-C: Other Analytics (backend: ValuationSummary, WeightedTerSummary, DirectRegularTerComparison, CategoryRankingSummary,
// PortfolioScoreSummary, FundRankingSummary) ----
export interface ValuationMissingStock { isin: string | null; instrument_name: string; exposure_value: string; percentage_equity: string; reason: string }
export interface ValuationMetric {
  ratio: string | null;
  coverage_pct: string;
  enough_data: boolean;
  as_of_date: string | null;
  missing: ValuationMissingStock[];
}
export interface ValuationIndex {
  index_name: "nifty_50" | "nifty_500";
  pe_ratio: string | null;
  pb_ratio: string | null;
  pe_as_of: string | null;
  pb_as_of: string | null;
  pe_delta_pct: string | null;
  pb_delta_pct: string | null;
}
export interface ValuationSummary {
  pe: ValuationMetric;
  pb: ValuationMetric;
  indices: ValuationIndex[];
  total_equity_value: string;
  total_portfolio_value: string;
  nav_as_of: string | null;
  holdings_as_of: string | null;
  coverage: LookthroughCoverage;
  hide_headlines: boolean;
  excluded_share: string;
  footnotes: string[];
}
export interface FundTerRow {
  scheme_id: string;
  scheme_name: string;
  plan_type: string | null;
  /** Percent a year ("0.9200" is 0.92%). */
  ter: string | null;
  /** The household's value in this fund, rupees. */
  value: string;
  /** Projected cost in rupees over 1, 3 and 5 years at today's value and TER (no return assumption). */
  cost_1y: string | null;
  cost_3y: string | null;
  cost_5y: string | null;
  /** ADDITIVE, NOT YET SENT BY THE BACKEND (backend ask): rupees a year this Direct holding saves against its own Regular sibling. */
  annual_ter_saving?: string | null;
}
export interface WeightedTerSummary {
  weighted_ter: string | null;
  covered_value: string;
  total_value: string;
  reference_period: string | null;
  uncovered_schemes: string[];
  cost_1y?: string | null;
  cost_3y?: string | null;
  cost_5y?: string | null;
  funds?: FundTerRow[];
}
export interface DirectRegularTerComparison { direct: WeightedTerSummary; regular: WeightedTerSummary }
export interface PeriodReturn { fund_return: string | null; category_avg: string | null; peers: number }
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
  periods?: Partial<Record<"1y" | "3y" | "5y", PeriodReturn>>;
  plan_type?: string | null;
}
export interface CategoryRankingSummary { funds: CategoryRankRow[] }
export interface FundScoreRow {
  scheme_id: string;
  scheme_name: string;
  category_unavailable: boolean;
  insufficient_history: boolean;
  thin_category: boolean;
  /** Backend convention: 5 is the best tier. The page shows 6 minus this, so Tier 1 is best. */
  risk_adjusted_tier: number | null;
  cost_adjustment: string | null;
  final_score: string | null;
  return_percentile: string | null;
  risk_percentile: string | null;
  consistency_hit_rate: string | null;
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
export interface FundRankingNeighbor { scheme_id: string; scheme_name: string; category_rank: number; composite_score: string }
export interface FundRankingComponent { percentile: string | null; raw: string | null }
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
  horizons?: Partial<Record<"1y" | "3y" | "5y", PeriodReturn>>;
  plan_type?: string | null;
}
export interface FundRankingSummary { funds: FundRankingRow[] }

/** What useMfAnalytics(name) returns as `data`. Sections the later bundles use are typed loosely until then. */
export interface SectionPayloads {
  overlap: OverlapSummary;
  valuation: ValuationSummary;
  ter: WeightedTerSummary;
  ter_direct_regular: DirectRegularTerComparison;
  category_ranking: CategoryRankingSummary;
  ranking: FundRankingSummary;
  score: PortfolioScoreSummary;
  benchmark: PortfolioBenchmarkSummary;
  benchmark_funds: FundVsBenchmarkSummary;
  investment_withdrawal: InvestmentWithdrawalResult;
  asset_allocation: AssetAllocationSummary;
  cap_allocation: CapAllocationSummary;
  allocation: AnalyticsAllocationSummary;
  fund_manager: FundManagerAllocationSummary;
  stock_holdings: StockHoldingsSummary;
}
export type SectionPayload<S extends AnalyticsSectionName> = S extends keyof SectionPayloads ? SectionPayloads[S] : Record<string, unknown>;

// ---- view types ----
export type MfTabId = "overview" | "performance" | "allocation" | "holdings" | "transactions" | "overlap" | "analytics";
export type MfScopeArg = { viewMode: "aggregate" | "member"; memberId: string | null };
export interface Load<T> { status: "loading" | "data" | "error"; data: T | null; retry: () => void }
export interface XirrBundle {
  lifetime: string | null;
  current: string | null;
  disclaimers: { lifetime: XirrDisclaimer | null; current: XirrDisclaimer | null };
}
export interface Slice { key: string; label: string; value: string; pct: string; color: string }
