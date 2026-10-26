// SPEC FIXTURES (packet MF-A). Orchestrator-owned: never edit.
// These are NOT real backend output. The routes they stand for exist today (GET /household/aggregate/holdings,
// /allocation, /sips, /sips/monthly, /snapshots, /snapshots/{month}, the member equivalents, /analytics/{scope}),
// but no golden-fixture generator exists for them yet (the Home and Portfolio fixtures came from
// backend/tests/fixtures/{home,portfolio}). Each builder returns a fresh object shaped by the legacy TypeScript types in
// ../types.ts and by backend/app/services/{dashboard,analytics}/schemas.py. Replace with real output when a generator exists.
import { ANALYTICS_SECTION_NAMES } from "../types";
import type {
  AggregateAllocationResponse, AggregateHoldingsResponse, AggregateSipsMonthlyResponse, AggregateSipsResponse,
  AggregateSnapshotsResponse, AnalyticsScopeResponse, CoverageGapItem, FamilyMemberStatus, HoldingRow,
  LookthroughCoverage, MemberHoldingsResponse, MonthDetail, SipRow,
} from "../types";

export const MEMBERS: FamilyMemberStatus[] = [
  { id: "m1", name: "Siddharth", has_data: true },
  { id: "m2", name: "Aarohi", has_data: true },
  { id: "m3", name: "Parents", has_data: true },
];

const base = { plan_verified: true, average_nav: "10.0000", units_held: "1000.000", asset_class: "equity" };

export function holdings(): HoldingRow[] {
  return [
    { ...base, scheme_id: "S-KOTAK", scheme_name: "Kotak Multi Cap Fund", amc_name: "Kotak Mahindra Mutual Fund", household_member_id: "m1", household_member_name: "Siddharth", plan_type: "direct", current_nav: "15.4000", amount_invested: "1200000.00", current_value: "1540000.00", current_profit_total: "340000.00", realized_gain: "0.00", unrealized_gain: "340000.00", today_gain: "4620.00", sebi_category: "Flexi Cap Fund" },
    { ...base, scheme_id: "S-JM", scheme_name: "JM Flexi Cap Fund", amc_name: "JM Financial Mutual Fund", household_member_id: "m2", household_member_name: "Aarohi", plan_type: "direct", current_nav: "9.8000", amount_invested: "800000.00", current_value: "980000.00", current_profit_total: "180000.00", realized_gain: "0.00", unrealized_gain: "180000.00", today_gain: "-1960.00", sebi_category: "Flexi Cap Fund" },
    { ...base, scheme_id: "S-HDFC", scheme_name: "HDFC Mid-Cap Opportunities Fund", amc_name: "HDFC Mutual Fund", household_member_id: "m3", household_member_name: "Parents", plan_type: "direct", current_nav: "13.1000", amount_invested: "950000.00", current_value: "1310000.00", current_profit_total: "360000.00", realized_gain: "0.00", unrealized_gain: "360000.00", today_gain: "6550.00", sebi_category: "Mid Cap Fund" },
    { ...base, scheme_id: "S-SBI", scheme_name: "SBI Bluechip Fund", amc_name: "SBI Mutual Fund", household_member_id: "m3", household_member_name: "Parents", plan_type: "regular", current_nav: "8.1934", amount_invested: "628000.00", current_value: "819340.00", current_profit_total: "191340.00", realized_gain: "0.00", unrealized_gain: "191340.00", today_gain: "-300.00", stale_nav: true, sebi_category: "Large Cap Fund" },
    { ...base, scheme_id: "S-AXIS", scheme_name: "Axis Midcap Fund", amc_name: "Axis Mutual Fund", household_member_id: "m1", household_member_name: "Siddharth", plan_type: "regular", current_nav: null, amount_invested: "400000.00", current_value: null, current_profit_total: null, realized_gain: "0.00", unrealized_gain: null, today_gain: null, nav_unavailable: true },
  ];
}
// Valued funds (no NAV-unavailable): value 4649340.00, invested 3578000.00, unrealised 1071340.00.
// Today's gain counts valued, non-stale funds: 4620.00 - 1960.00 + 6550.00 = 9210.00 on a previous value of 3820790.00.

export function aggregateHoldings(): AggregateHoldingsResponse {
  return {
    members: structuredClone(MEMBERS),
    holdings: holdings(),
    lifetime_xirr: "0.1612",
    current_holdings_xirr: "0.1480",
    lifetime_xirr_disclaimer: { alt_xirr: "0.1105", opening_cost_share: "0.3800" },
    current_holdings_xirr_disclaimer: null,
    realized_summary: { total: "210000.00", funds: [{ scheme_id: "S-OLD", scheme_name: "Old Fund", household_member_id: "m1", household_member_name: "Siddharth", plan_type: "direct", realized_gain: "210000.00", fully_sold: true }] },
  };
}

/** Member m1's holdings (Kotak and Axis). */
export function memberHoldings(): MemberHoldingsResponse {
  return {
    holdings: holdings().filter(row => row.household_member_id === "m1"),
    lifetime_xirr: "0.1420", current_holdings_xirr: "0.1420",
    lifetime_xirr_disclaimer: null, current_holdings_xirr_disclaimer: null,
    realized_summary: { total: "0.00", funds: [] },
  };
}

export function allocation(): AggregateAllocationResponse {
  return {
    members: structuredClone(MEMBERS),
    allocation: {
      by_asset_class: [],
      by_amc: [
        { label: "Kotak Mahindra Mutual Fund", current_value: "1540000.00", percentage: 33.12 },
        { label: "HDFC Mutual Fund", current_value: "1310000.00", percentage: 28.18 },
        { label: "JM Financial Mutual Fund", current_value: "980000.00", percentage: 21.08 },
        { label: "SBI Mutual Fund", current_value: "819340.00", percentage: 17.62 },
      ],
      total_value: "4649340.00",
    },
  };
}

const sip = (over: Partial<SipRow> & Pick<SipRow, "scheme_id" | "scheme_name" | "sip_amount" | "next_due_date" | "household_member_id" | "household_member_name">): SipRow => ({ sip_date: over.next_due_date.slice(8, 10), status: "active", ...over });
/** Active monthly total: 3336 + 5005 + 12995 x 2 (twin SIPs) + 16244 = 50575.00; one stopped SIP (4873) is not counted. */
export function sips(): AggregateSipsResponse {
  return {
    members: structuredClone(MEMBERS),
    sips: [
      sip({ scheme_id: "S-KOTAK", scheme_name: "Kotak Multi Cap Fund", sip_amount: "3336.00", next_due_date: "2026-10-24", household_member_id: "m1", household_member_name: "Siddharth" }),
      sip({ scheme_id: "S-JM", scheme_name: "JM Flexi Cap Fund", sip_amount: "5005.00", next_due_date: "2026-10-26", household_member_id: "m2", household_member_name: "Aarohi" }),
      sip({ scheme_id: "S-HDFC", scheme_name: "HDFC Mid-Cap Opportunities Fund", sip_amount: "12995.00", next_due_date: "2026-10-27", household_member_id: "m3", household_member_name: "Parents", series_count: 2 }),
      sip({ scheme_id: "S-PPFAS", scheme_name: "Parag Parikh Flexi Cap Fund", sip_amount: "16244.00", next_due_date: "2026-10-27", household_member_id: "m1", household_member_name: "Siddharth" }),
      sip({ scheme_id: "S-SBI", scheme_name: "SBI Bluechip Fund", sip_amount: "4873.00", next_due_date: "2026-11-05", household_member_id: "m3", household_member_name: "Parents", status: "stopped" }),
    ],
  };
}

export function sipsMonthly(): AggregateSipsMonthlyResponse {
  return {
    members: structuredClone(MEMBERS),
    sips: [
      { scheme_id: "S-KOTAK", scheme_name: "Kotak Multi Cap Fund", household_member_id: "m1", household_member_name: "Siddharth", date: "2026-10-24", amount: "3336.00" },
      { scheme_id: "S-JM", scheme_name: "JM Flexi Cap Fund", household_member_id: "m2", household_member_name: "Aarohi", date: "2026-10-26", amount: "5005.00" },
    ],
  };
}

/** Two members, five month-ends. 2026-08 is partial for member m1 (one fund had no price). */
export function snapshots(): AggregateSnapshotsResponse {
  const rows = (month: string, a: string, b: string, partial = false) => [
    { household_member_id: "m1", household_member_name: "Siddharth", snapshot_month: month, total_value: a, invested_value: "1000000.00", is_partial: partial, missing_scheme_names: partial ? ["HDFC Mid-Cap Opportunities Fund"] : [] },
    { household_member_id: "m2", household_member_name: "Aarohi", snapshot_month: month, total_value: b, invested_value: "500000.00", is_partial: false, missing_scheme_names: [] },
  ];
  return {
    members: structuredClone(MEMBERS),
    snapshots: [
      ...rows("2026-06-30", "1200000.00", "600000.00"), ...rows("2026-07-31", "1250000.00", "610000.00"),
      ...rows("2026-08-31", "1300000.00", "620000.00", true), ...rows("2026-09-30", "1350000.00", "640000.00"),
      ...rows("2026-10-31", "1400000.00", "660000.00"),
    ],
  };
}
// History points sum the members per month: 1800000, 1860000, 1920000 (partial), 1990000, 2060000.

export function monthDetail(): MonthDetail {
  return {
    month: "2026-08-31", previous_month: "2026-07-31", total_value: "1920000.00", previous_value: "1860000.00",
    change: null, new_money: "144874.00", market_movement: null, is_partial: true,
    missing_scheme_names: ["HDFC Mid-Cap Opportunities Fund"],
    funds: [
      { scheme_id: "S-KOTAK", scheme_name: "Kotak Multi Cap Fund", household_member_id: "m1", household_member_name: "Siddharth", units: "4218.332", nav: "58.2000", nav_date: "2026-08-31", value: "245507.00", cost: "210000.00", change_in_value: "8420.00", new_money: "0.00", market_movement: "7100.00", priced: true },
      { scheme_id: "S-HDFC", scheme_name: "HDFC Mid-Cap Opportunities Fund", household_member_id: "m3", household_member_name: "Parents", units: "6004.882", nav: null, nav_date: null, value: null, cost: "0.00", change_in_value: null, new_money: "0.00", market_movement: null, priced: false },
    ],
  };
}

export function coverageGaps(): CoverageGapItem[] {
  return [{ folio_id: "f1", folio_number: "1234", scheme_id: "S-KOTAK", scheme_name: "Kotak Multi Cap Fund", deficit_units: "10.000", first_deficit_date: "2024-01-05" }];
}

export function coverage(): LookthroughCoverage {
  return {
    covered_value_pct: "92.50",
    not_published_yet: [{ scheme_id: "S-A", scheme_name: "Fund A" }],
    not_available_from_amc: [{ scheme_id: "S-B", scheme_name: "Fund B" }, { scheme_id: "S-A", scheme_name: "Fund A" }],
    missing_value_schemes: [{ scheme_id: "S-C", scheme_name: "Fund C" }],
    funds: [],
  };
}

/** GET /analytics/combined with two settled sections. The combined wrapper uses the AGGREGATE_FIELD names
 * (benchmark_funds -> "comparison", investment_withdrawal -> "data"); a member payload is the bare section. */
export function analyticsCombined(): AnalyticsScopeResponse {
  return {
    scope: "combined", recomputing: false,
    sections: {
      // every section is settled (an empty payload) except the two this page reads, so polling stops
      ...Object.fromEntries(ANALYTICS_SECTION_NAMES.map(name => [name, { payload: {}, computed_at: "2026-10-26T01:00:00Z", failed_at: null }])),
      benchmark_funds: { payload: { members: [], comparison: { funds: [
        { scheme_id: "S-KOTAK", scheme_name: "Kotak Multi Cap Fund", benchmark_index: "nifty_500", fund_xirr: "0.1420", benchmark_xirr: "0.1690" },
        { scheme_id: "S-JM", scheme_name: "JM Flexi Cap Fund", benchmark_index: "nifty_500", fund_xirr: "0.1860", benchmark_xirr: "0.1280" },
        { scheme_id: "S-HDFC", scheme_name: "HDFC Mid-Cap Opportunities Fund", benchmark_index: "nifty_500", fund_xirr: "0.2130", benchmark_xirr: "0.2020" },
        { scheme_id: "S-NONE", scheme_name: "No Data Fund", benchmark_index: "nifty_500", fund_xirr: null, benchmark_xirr: null },
      ], overall_portfolio_xirr: "0.1069", overall_broad_market_xirr: "0.1102" } }, computed_at: "2026-10-26T01:00:00Z", failed_at: null },
      investment_withdrawal: { payload: { members: [], data: { total_invested: "3600000.00", total_withdrawn: "22000.00", net_invested: "3578000.00", current_value: "4649340.00", absolute_gain: "1071340.00", sip_summary: { active_count: 4, total_monthly_amount: "50575.00", missed_count: 0 }, gifts_net: "0.00" } }, computed_at: "2026-10-26T01:00:00Z", failed_at: null },
    },
  };
}
