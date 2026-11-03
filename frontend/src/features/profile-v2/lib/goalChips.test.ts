import { describe, expect, it } from "vitest";
import { goalChips, mergeGoals } from "./goalChips";

describe("goalChips (spec section 2, Financial Details)", () => {
  it("gives no chips for null, undefined or an empty list", () => {
    expect(goalChips(null)).toEqual([]);
    expect(goalChips(undefined)).toEqual([]);
    expect(goalChips([])).toEqual([]);
  });

  it("shows a chip per known code with its onboarding title, in onboarding order, not stored order", () => {
    expect(goalChips(["childrens_education", "wealth_creation"])).toEqual([
      { label: "Build my wealth", unknown: false },
      { label: "Fund my children's education", unknown: false },
    ]);
    expect(goalChips(["buy_home", "retirement", "childrens_education"]).map(chip => chip.label)).toEqual([
      "Plan for retirement", "Fund my children's education", "Buy a home",
    ]);
  });

  it("collapses all six known codes into one 'All of it' chip, whatever the stored order", () => {
    const expected = [{ label: "All of it", unknown: false }];
    expect(goalChips(["wealth_creation", "retirement", "childrens_education", "buy_home", "financial_freedom", "tax_planning"])).toEqual(expected);
    expect(goalChips(["tax_planning", "financial_freedom", "buy_home", "childrens_education", "retirement", "wealth_creation"])).toEqual(expected);
  });

  it("does not collapse five of six", () => {
    expect(goalChips(["wealth_creation", "retirement", "childrens_education", "buy_home", "financial_freedom"])).toHaveLength(5);
  });

  it("keeps a code it does not know, humanised and flagged, after the known chips", () => {
    expect(goalChips(["retirement_planning", "wealth_creation"])).toEqual([
      { label: "Build my wealth", unknown: false },
      { label: "Retirement planning", unknown: true },
    ]);
  });

  it("still shows 'All of it' when all six known codes plus an unknown one are stored", () => {
    expect(goalChips(["wealth_creation", "retirement", "childrens_education", "buy_home", "financial_freedom", "tax_planning", "retirement_planning"])).toEqual([
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
    expect(goalChips(["wealth_creation", "wealth_creation"])).toEqual([{ label: "Build my wealth", unknown: false }]);
    expect(goalChips(["tax_saving", "tax_saving"])).toEqual([{ label: "Tax saving", unknown: true }]);
    expect(goalChips([""])).toEqual([]);
  });

  it("does not change its input", () => {
    const input = ["childrens_education", "wealth_creation"];
    goalChips(input);
    expect(input).toEqual(["childrens_education", "wealth_creation"]);
  });
});

describe("mergeGoals (the Goals dialog save: stored codes this build does not know must survive)", () => {
  it("returns the selection followed by the stored unknown codes", () => {
    expect(mergeGoals(["x_y", "wealth_creation"], ["childrens_education"])).toEqual(["childrens_education", "x_y"]);
  });

  it("puts the selected known codes in onboarding order and drops repeats", () => {
    expect(mergeGoals(null, ["childrens_education", "wealth_creation", "childrens_education"])).toEqual(["wealth_creation", "childrens_education"]);
  });

  it("keeps stored unknown codes in stored order, once each", () => {
    expect(mergeGoals(["b_new", "a_new", "b_new", "childrens_education"], ["wealth_creation"])).toEqual(["wealth_creation", "b_new", "a_new"]);
  });

  it("drops a stored known code the user unselected", () => {
    expect(mergeGoals(["wealth_creation", "childrens_education"], ["childrens_education"])).toEqual(["childrens_education"]);
  });

  it("works with no stored value", () => {
    expect(mergeGoals(undefined, ["retirement"])).toEqual(["retirement"]);
    expect(mergeGoals([], [])).toEqual([]);
  });

  it("ignores empty stored codes", () => {
    expect(mergeGoals(["", "x_y"], ["wealth_creation"])).toEqual(["wealth_creation", "x_y"]);
  });
});
