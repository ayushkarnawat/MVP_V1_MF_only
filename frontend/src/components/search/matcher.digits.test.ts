import { describe, expect, it } from "vitest";
import { matchesItem } from "./matcher";

const item = (name: string) => ({ fields: [{ value: name, kind: "name" as const }] });

// Spelling forgiveness is for words: a number one digit away is a different fund (Target 2030 versus 2031, Nifty 50 versus 500).
describe("the matcher does not forgive a typo in a number", () => {
  it("2031 does not find a fund called 2030 or 2035", () => {
    expect(matchesItem(["2031"], item("Example Target Maturity 2030 Fund"))).toBe(0);
    expect(matchesItem(["2031"], item("Example Target Maturity 2035 Fund"))).toBe(0);
  });
  it("the exact number still finds its fund", () => {
    expect(matchesItem(["2030"], item("Example Target Maturity 2030 Fund"))).toBeGreaterThan(0);
  });
  it("a word with a typo is still forgiven (the old behaviour)", () => {
    expect(matchesItem(["groth"], item("Example Growth Fund"))).toBeGreaterThan(0);
  });
  it("a word with a digit inside is not forgiven either", () => {
    expect(matchesItem(["nifty5001"], item("Example Nifty 500 Fund"))).toBe(0);
  });
});
