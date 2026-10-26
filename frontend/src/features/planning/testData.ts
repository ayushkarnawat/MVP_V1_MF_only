// Test-only helpers: edge cases are built from the (spec) fixtures, never typed out whole, so the tests
// keep working when the real backend fixtures replace the hand-written ones. Orchestrator-owned.
import { ASHA_ID, DEV_ID, fixture } from "./fixtures";
import type { ScenarioBenchmark, ScenarioResult, ScenarioSummary } from "./types";

export { ASHA_ID, DEV_ID };

export const standardResult = () => fixture<ScenarioResult>("results_family_standard");
export const memberDevResult = () => fixture<ScenarioResult>("results_member_dev");
export const multiPhaseResult = () => fixture<ScenarioResult>("results_family_multi_phase");
export const freezeResult = () => fixture<ScenarioResult>("results_family_freeze");
export const noFundDataResult = () => fixture<ScenarioResult>("results_family_no_fund_data");
export const noHoldingsResult = () => fixture<ScenarioResult>("results_family_no_holdings");
export const curatedList = () => fixture<ScenarioSummary[]>("scenarios_list_curated");

/** The five indices the real route returns for a standard event (mockup numbers). */
export const FIVE_BENCHMARKS: ScenarioBenchmark[] = [
  { name: "nifty_50", pct: "-30.20" },
  { name: "nifty_500", pct: "-31.40" },
  { name: "nifty_largemidcap_250", pct: "-32.10" },
  { name: "nifty_midcap_150", pct: "-33.90" },
  { name: "nifty_smallcap_250", pct: "-36.20" },
];

export function makeSummary(over: Partial<ScenarioSummary> = {}): ScenarioSummary {
  return {
    scenario_id: "s-x", name: "Scenario X", description: "A description.", scenario_type: "CRASH",
    start_date: "2020-01-01", end_date: "2020-12-31", is_ongoing: false, display_rank: null,
    parent_scenario_id: null, has_phases: false, had_redemption_freeze_schemes: null,
    quick_market_pct: "-30.20", quick_equity_pct: null, quick_debt_pct: null, quick_weight_quarter: null,
    ...over,
  };
}
