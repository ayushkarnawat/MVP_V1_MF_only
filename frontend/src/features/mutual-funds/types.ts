// Contract types for the Mutual Funds page front end (packet MF-A). Orchestrator-owned: never edit.
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
}
export interface FundVsBenchmarkSummary {
  funds: FundBenchmarkRow[];
  overall_portfolio_xirr: string | null;
  overall_broad_market_xirr: string | null;
}
export interface InvestmentWithdrawalResult {
  total_invested: string;
  total_withdrawn: string;
  net_invested: string;
  current_value: string;
  absolute_gain: string;
  sip_summary: { active_count: number; total_monthly_amount: string; missed_count: number };
  gifts_net: string;
}

/** What useMfAnalytics(name) returns as `data`. Sections the later bundles use are typed loosely until then. */
export interface SectionPayloads {
  benchmark_funds: FundVsBenchmarkSummary;
  investment_withdrawal: InvestmentWithdrawalResult;
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
