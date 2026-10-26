// The Planning (market scenarios) response contract. Orchestrator-owned: never edit.
// Source: Docs/orchestration/ui-redesign-PB-planning-backend-handoff.md, Appendix A (end state of
// GET /scenarios and GET /scenarios/{id}/results[?member_id=]). Money and percentages are decimal
// STRINGS, never numbers.

export type ScenarioType = "CRASH" | "BULL_RUN" | "POLICY_RATE" | "HYPOTHETICAL";
export type ResultShape = "standard" | "multi_phase" | "redemption_freeze" | "hypothetical";

export interface ScenarioSummary {
  scenario_id: string;
  name: string;
  description: string; // may be "": a card without a description line must render
  scenario_type: ScenarioType;
  start_date: string | null;
  end_date: string | null;
  is_ongoing: boolean;
  display_rank: number | null;
  parent_scenario_id: string | null;
  has_phases: boolean;
  had_redemption_freeze_schemes: string[] | null;
  quick_market_pct: string | null; // Nifty 50 over the window
  quick_equity_pct: string | null; // stored, never shown on cards
  quick_debt_pct: string | null; // stored, never shown on cards
  quick_weight_quarter: string | null;
}

export interface ScenarioPhase {
  label: string;
  order: number;
  start_date: string;
  end_date: string | null;
  is_ongoing: boolean;
  pct: string | null;
}

export interface ScenarioFund {
  scheme_id: string;
  scheme_name: string;
  pct: string | null;
  is_proxied: boolean;
  proxy_basis: string | null;
  is_frozen: boolean;
}

export interface ScenarioMemberFund {
  scheme_id: string;
  scheme_name: string;
  rupee_impact: string | null; // null for a frozen fund and for a fund with no data
  is_proxied: boolean;
  proxy_basis: string | null; // "sebi_category_average:<group>" | "asset_class_average:<bucket>" | "no_comparable_data" | null
  is_frozen: boolean;
}

export interface ScenarioMember {
  household_member_id: string;
  member_name: string; // may be ALL CAPITALS (from a statement)
  rupee_impact: string;
  pct: string | null;
  funds: ScenarioMemberFund[];
}

export interface ScenarioBenchmark {
  name: string; // nifty_50, nifty_500, nifty_largemidcap_250, nifty_midcap_150, nifty_smallcap_250
  pct: string;
}

export interface ScenarioHypotheticalAssumption {
  asset_class: string;
  assumed_pct_change: string;
  assumption_note: string;
}

export const ASSET_GROUPS = ["Equity", "Hybrid", "Debt", "Gold and Silver", "Overseas", "Other"] as const;

export interface ScenarioAssetClass {
  bucket: string; // one of ASSET_GROUPS, always in that order, groups with nothing valued omitted
  rupee_impact: string;
  covered_value: string;
  pct: string | null;
}

export interface ScenarioResult {
  scenario: ScenarioSummary;
  portfolio_impact_pct: string | null;
  rupee_impact: string | null;
  covered_value: string | null;
  total_value: string | null;
  no_data_funds: number | null;
  benchmarks: ScenarioBenchmark[]; // [] for multi-phase and freeze scenarios
  phases: ScenarioPhase[];
  by_fund: ScenarioFund[]; // still returned, the Planning page never renders it
  by_member: ScenarioMember[];
  hypothetical_assumptions: ScenarioHypotheticalAssumption[];
  assumptions_not_set: boolean;
  by_asset_class: ScenarioAssetClass[];
  funds_data_available: boolean; // false only for a pre-2006 style scenario
}

export type MemberChoice = "family" | string;
