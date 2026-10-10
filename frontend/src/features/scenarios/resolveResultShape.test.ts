import { describe, expect, it } from "vitest";
import { resolveResultShape } from "./resolveResultShape";
import type { ScenarioSummary } from "./types";

const base: ScenarioSummary = {
  scenario_id: "s1", name: "Franklin US-Iran hypothetical", scenario_type: "CRASH",
  start_date: "2020-01-01", end_date: "2020-03-31", is_ongoing: false,
  display_rank: null, parent_scenario_id: null, has_phases: false,
  had_redemption_freeze_schemes: null, quick_market_pct: null,
  quick_equity_pct: null, quick_debt_pct: null, quick_weight_quarter: null,
};

describe("resolveResultShape", () => {
  it("uses the hypothetical flag first", () => {
    expect(resolveResultShape({ ...base, scenario_type: "HYPOTHETICAL", has_phases: true, had_redemption_freeze_schemes: ["X"] })).toBe("hypothetical");
  });
  it("uses freeze flags before phases", () => {
    expect(resolveResultShape({ ...base, had_redemption_freeze_schemes: ["X"], has_phases: true })).toBe("redemption_freeze");
  });
  it("uses group phases", () => {
    expect(resolveResultShape({ ...base, has_phases: true })).toBe("multi_phase");
  });
  it("does not render an individual phase as a group", () => {
    expect(resolveResultShape({ ...base, has_phases: true, parent_scenario_id: "parent" })).toBe("standard");
  });
  it("does not infer a shape from names or an empty freeze list", () => {
    expect(resolveResultShape({ ...base, had_redemption_freeze_schemes: [] })).toBe("standard");
  });
});
