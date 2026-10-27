import { describe, expect, it } from "vitest";
import { investorLabel } from "./investorLabel";

describe("investorLabel", () => {
  it.each([
    ["self_directed", "Mostly on my own"],
    ["advisor_assisted", "Through an advisor or distributor"],
    ["mixed", "A mix of both"],
    ["beginner", "Just getting started"],
  ])("%s shows the onboarding title %j", (code, expected) => {
    expect(investorLabel(code)).toBe(expected);
  });

  it("gives null when nothing is stored (the card then says 'Not answered')", () => {
    expect(investorLabel(null)).toBeNull();
    expect(investorLabel(undefined)).toBeNull();
    expect(investorLabel("")).toBeNull();
  });

  it("humanises a code it does not know instead of hiding it", () => {
    expect(investorLabel("x_y")).toBe("X y");
    expect(investorLabel("institutional_investor")).toBe("Institutional investor");
  });
});
