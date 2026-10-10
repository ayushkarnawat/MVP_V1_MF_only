// frontend/src/features/scenarios/types.ts
export type ScenarioType = "CRASH" | "BULL_RUN" | "POLICY_RATE" | "HYPOTHETICAL";
export type ScenarioResultShape = "standard" | "multi_phase" | "redemption_freeze" | "hypothetical";

export interface ScenarioSummary {
  scenario_id: string;
  name: string;
  scenario_type: ScenarioType;
  start_date: string | null;
  end_date: string | null;
  is_ongoing: boolean;
  display_rank: number | null;
  parent_scenario_id: string | null;
  has_phases: boolean;
  had_redemption_freeze_schemes: string[] | null;
  quick_market_pct: string | null;      // Nifty 50 TRI over the window
  quick_equity_pct: string | null;      // AUM-weighted equity funds
  quick_debt_pct: string | null;        // AUM-weighted debt funds
  quick_weight_quarter: string | null;  // AUM quarter used as weights
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
  rupee_impact: string | null;
}

export interface ScenarioMember {
  household_member_id: string;
  member_name: string;
  rupee_impact: string;
  pct: string | null;
  funds: ScenarioMemberFund[];
}

export interface ScenarioBenchmark {
  name: string;
  pct: string;
}

export interface ScenarioHypotheticalAssumption {
  asset_class: string;
  assumed_pct_change: string;
  assumption_note: string;
}

export interface ScenarioResult {
  scenario: ScenarioSummary;
  portfolio_impact_pct: string | null;  // Σ rupee impact ÷ covered_value (fix 6)
  rupee_impact: string | null;
  covered_value: string | null;
  total_value: string | null;
  no_data_funds: number | null;
  benchmarks: ScenarioBenchmark[];
  phases: ScenarioPhase[];
  by_fund: ScenarioFund[];
  by_member: ScenarioMember[];
  hypothetical_assumptions: ScenarioHypotheticalAssumption[];
  assumptions_not_set: boolean;
}
