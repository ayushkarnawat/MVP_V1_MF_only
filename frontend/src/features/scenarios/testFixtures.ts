import type { ScenarioResult, ScenarioSummary } from "./types";

export const historical: ScenarioSummary = {
  scenario_id: "c1", name: "COVID crash", scenario_type: "CRASH",
  start_date: "2020-01-20", end_date: "2020-03-31", is_ongoing: false,
  display_rank: 1, parent_scenario_id: null, has_phases: false,
  had_redemption_freeze_schemes: null, quick_market_pct: "-38.00",
  quick_equity_pct: "-35.20", quick_debt_pct: "1.10", quick_weight_quarter: "2019-12-31",
};

export const historicalResult: ScenarioResult = {
  scenario: historical, portfolio_impact_pct: "-32.50", rupee_impact: "-650000.00",
  covered_value: "2000000.00", total_value: "2100000.00", no_data_funds: 1,
  benchmarks: [{ name: "nifty_50", pct: "-38.00" }], phases: [],
  by_fund: [
    { scheme_id: "s1", scheme_name: "Real Fund", pct: "-30.00", is_proxied: false, proxy_basis: null, is_frozen: false },
    { scheme_id: "s2", scheme_name: "Estimated Fund", pct: "-20.00", is_proxied: true, proxy_basis: "sebi_category_average:Equity Scheme - Flexi Cap Fund|Equity", is_frozen: false },
    { scheme_id: "s3", scheme_name: "No Data Fund", pct: null, is_proxied: true, proxy_basis: "no_comparable_data", is_frozen: false },
  ],
  by_member: [{ household_member_id: "m1", member_name: "Ayush", rupee_impact: "-650000.00", pct: "-32.50", funds: [{ scheme_id: "s1", scheme_name: "Real Fund", rupee_impact: "-650000.00" }] }],
  hypothetical_assumptions: [], assumptions_not_set: false,
};
