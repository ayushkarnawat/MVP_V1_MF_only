import { describe, expect, it } from "vitest";
import { goalChips, mergeGoals } from "./goalChips";

describe("goalChips (spec section 2, Financial Details)", () => {
  it("gives no chips for null, undefined or an empty list", () => {
    expect(goalChips(null)).toEqual([]);
    expect(goalChips(undefined)).toEqual([]);
    expect(goalChips([])).toEqual([]);
  });

  it("shows a chip per known code with its onboarding title, in onboarding order, not stored order", () => {
    expect(goalChips(["family_management", "consolidated_view"])).toEqual([
      { label: "Consolidated portfolio view", unknown: false },
      { label: "Family wealth tracking", unknown: false },
    ]);
    expect(goalChips(["performance_comparison", "understand_holdings", "family_management"]).map(chip => chip.label)).toEqual([
      "Understand true performance", "Family wealth tracking", "Compare distributor fees",
    ]);
  });

  it("collapses all four known codes into one 'All of it' chip, whatever the stored order", () => {
    const expected = [{ label: "All of it", unknown: false }];
    expect(goalChips(["consolidated_view", "understand_holdings", "family_management", "performance_comparison"])).toEqual(expected);
    expect(goalChips(["performance_comparison", "family_management", "understand_holdings", "consolidated_view"])).toEqual(expected);
  });

  it("does not collapse three of four", () => {
    expect(goalChips(["consolidated_view", "understand_holdings", "family_management"])).toHaveLength(3);
  });

  it("keeps a code it does not know, humanised and flagged, after the known chips", () => {
    expect(goalChips(["retirement_planning", "consolidated_view"])).toEqual([
      { label: "Consolidated portfolio view", unknown: false },
      { label: "Retirement planning", unknown: true },
    ]);
  });

  it("still shows 'All of it' when all four known codes plus an unknown one are stored", () => {
    expect(goalChips(["consolidated_view", "understand_holdings", "family_management", "performance_comparison", "retirement_planning"])).toEqual([
      { label: "All of it", unknown: false },
      { label: "Retirement planning", unknown: true },
    ]);
  });

  it("shows only unknown chips when no known code is stored", () => {
    expect(goalChips(["tax_saving", "wealth_goal_x"])).toEqual([
      { label: "Tax saving", unknown: true },
      { label: "Wealth goal x", unknown: true },
    ]);
  });

  it("collapses duplicates, known and unknown, and ignores empty codes", () => {
    expect(goalChips(["consolidated_view", "consolidated_view"])).toEqual([{ label: "Consolidated portfolio view", unknown: false }]);
    expect(goalChips(["tax_saving", "tax_saving"])).toEqual([{ label: "Tax saving", unknown: true }]);
    expect(goalChips([""])).toEqual([]);
  });

  it("does not change its input", () => {
    const input = ["family_management", "consolidated_view"];
    goalChips(input);
    expect(input).toEqual(["family_management", "consolidated_view"]);
  });
});

describe("mergeGoals (the Goals dialog save: stored codes this build does not know must survive)", () => {
  it("returns the selection followed by the stored unknown codes", () => {
    expect(mergeGoals(["x_y", "consolidated_view"], ["family_management"])).toEqual(["family_management", "x_y"]);
  });

  it("puts the selected known codes in onboarding order and drops repeats", () => {
    expect(mergeGoals(null, ["family_management", "consolidated_view", "family_management"])).toEqual(["consolidated_view", "family_management"]);
  });

  it("keeps stored unknown codes in stored order, once each", () => {
    expect(mergeGoals(["b_new", "a_new", "b_new", "family_management"], ["consolidated_view"])).toEqual(["consolidated_view", "b_new", "a_new"]);
  });

  it("drops a stored known code the user unselected", () => {
    expect(mergeGoals(["consolidated_view", "family_management"], ["family_management"])).toEqual(["family_management"]);
  });

  it("works with no stored value", () => {
    expect(mergeGoals(undefined, ["understand_holdings"])).toEqual(["understand_holdings"]);
    expect(mergeGoals([], [])).toEqual([]);
  });

  it("ignores empty stored codes", () => {
    expect(mergeGoals(["", "x_y"], ["consolidated_view"])).toEqual(["consolidated_view", "x_y"]);
  });
});
