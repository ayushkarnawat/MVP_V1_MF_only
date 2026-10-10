import type { ScenarioResultShape, ScenarioSummary } from "./types";

export function resolveResultShape(scenario: ScenarioSummary): ScenarioResultShape {
  if (scenario.scenario_type === "HYPOTHETICAL") return "hypothetical";
  if (scenario.had_redemption_freeze_schemes?.length) return "redemption_freeze";
  if (scenario.parent_scenario_id === null && scenario.has_phases) return "multi_phase";
  return "standard";
}
