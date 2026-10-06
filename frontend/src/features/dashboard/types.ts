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
  stale_nav?: boolean;
  /** A fund in no fund list, valued at the NAV its statement printed. */
  price_from_statement?: boolean;
  opening_lot?: {
    units: string;
    since: string;
    cost_source: "cas_cost" | "nav_on_start" | "manual";
  } | null;
}

export interface AllocationItem {
  label: string;
  current_value: string;
  percentage: number;
}

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
  /** Parallel SIPs of this amount in this folio (twin SIPs, #11). */
  series_count?: number;
  status?: "active" | "stopped";
}

export interface SipMonthlyRow {
  scheme_id: string;
  scheme_name: string;
  household_member_id: string;
  household_member_name: string;
  date: string;
  amount: string;
  /** 1..k among identical fund/member/date/amount rows (twin instalments). */
  instalment?: number;
}

export interface CashFlowEntry {
  date: string;
  type: string;
  amount: string;
  direction: "debit" | "credit";
  scheme_name: string;
  household_member_id: string;
  household_member_name: string;
}

export interface SnapshotRow {
  household_member_id: string;
  household_member_name: string;
  snapshot_month: string;
  total_value: string;
  invested_value?: string | null;
  is_partial?: boolean;
  missing_scheme_names?: string[];
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

/** Realised gains of every fund, including fully sold ones (#9). */
export interface RealizedSummary {
  total: string;
  funds: RealizedFund[];
}

export interface FamilyMemberStatus {
  id: string;
  name: string;
  has_data: boolean;
}

export interface AggregateHoldingsResponse {
  members: FamilyMemberStatus[];
  holdings: HoldingRow[];
  lifetime_xirr?: string | null;
  current_holdings_xirr?: string | null;
  realized_summary?: RealizedSummary;
}

export interface MemberHoldingsResponse {
  holdings: HoldingRow[];
  lifetime_xirr: string | null;
  current_holdings_xirr: string | null;
  realized_summary?: RealizedSummary;
}

export type MemberHoldingsRows = HoldingRow[] & {
  lifetime_xirr?: string | null;
  current_holdings_xirr?: string | null;
  realized_summary?: RealizedSummary;
};

export interface AggregateAllocationResponse {
  members: FamilyMemberStatus[];
  allocation: AllocationSummary;
}

export interface AggregateSipsResponse {
  members: FamilyMemberStatus[];
  sips: SipRow[];
}

export interface AggregateSipsMonthlyResponse {
  members: FamilyMemberStatus[];
  sips: SipMonthlyRow[];
}

export interface AggregateCashFlowResponse {
  members: FamilyMemberStatus[];
  cash_flow: CashFlowEntry[];
}

export interface AggregateSnapshotsResponse {
  members: FamilyMemberStatus[];
  snapshots: SnapshotRow[];
}

export interface DistributorSchemeBreakdown {
  scheme_id: string;
  scheme_name: string;
  household_member_id: string;
  household_member_name: string;
  units_held: string;
  average_nav: string | null;
  amount_invested: string;
  current_value: string;
  current_profit_total: string;
  realized_gain: string;
  unrealized_gain: string;
  /** Regular sibling TER − this Direct fund's TER, percentage points; null unless positive (#17). */
  annual_ter_saving?: string | null;
}

export interface DistributorPortfolioRow {
  arn_code: string | null;
  distributor_name: string | null;
  arn_status: "ACTIVE" | "SUSPENDED" | "INVALID" | "UNRESOLVED" | null;
  amount_invested: string;
  current_value: string;
  current_profit_total: string;
  realized_gain: string;
  unrealized_gain: string;
  schemes: DistributorSchemeBreakdown[];
  /** Splits the no-ARN bucket into Direct and Regular (#17). */
  plan_type?: PlanType | null;
  nav_unavailable_schemes?: string[];
}

export interface AggregateDistributorComparisonResponse {
  members: FamilyMemberStatus[];
  rows: DistributorPortfolioRow[];
}

export type NavHistoryPeriod = "1M" | "1Y" | "3Y" | "5Y" | "MAX";

export interface NavHistoryPoint {
  date: string;
  nav: string;
  return_pct: string;
}

export interface SchemeNavHistoryResponse {
  scheme_id: string;
  period: NavHistoryPeriod;
  requested_period: NavHistoryPeriod;
  clamped: boolean;
  points: NavHistoryPoint[];
  overall_return_pct: string | null;
}

