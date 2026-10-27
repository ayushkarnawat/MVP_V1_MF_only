// Contract types for the Mutual Funds page front end (packets MF-A and MF-B). Orchestrator-owned: never edit.
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
export type AssetClassKey = "equity" | "debt" | "gold" | "cash_like";
export interface AssetAllocationClass { key: AssetClassKey; value: string; percentage: string }
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
  sip_summary: { active_count: number; total_monthly_amount: string; missed_count: number };
  gifts_net: string;
  total_switched_in?: string;
  total_switched_out?: string;
  switch_count?: number;
  opening_holdings?: string;
}

/** What useMfAnalytics(name) returns as `data`. Sections the later bundles use are typed loosely until then. */
export interface SectionPayloads {
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
