export interface HoldingRow {
  scheme_id: string;
  scheme_name: string;
  amc_name?: string;
  household_member_id: string;
  household_member_name: string;
  plan_type: "DIRECT" | "REGULAR" | "UNKNOWN";
  units_held: string;
  average_nav: string;
  current_nav: string;
  current_nav_date?: string;
  amount_invested: string;
  current_value: string;
  current_profit_total: string;
  realized_gain: string;
  unrealized_gain: string;
  today_gain: string;
  category?: string;
  stale_nav?: boolean;
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
}

export interface SipRow {
  scheme_id: string;
  scheme_name: string;
  household_member_id: string;
  household_member_name: string;
  sip_date: string;
  sip_amount: string;
  next_due_date: string;
}

export interface SipMonthlyRow {
  scheme_id: string;
  scheme_name: string;
  household_member_id: string;
  household_member_name: string;
  date: string;
  amount: string;
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
}

export interface FamilyMemberStatus {
  id: string;
  name: string;
  has_data: boolean;
}

export interface AggregateHoldingsResponse {
  members: FamilyMemberStatus[];
  holdings: HoldingRow[];
}

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

