import { describe, expect, it } from "vitest";
import { plainWords } from "./queryParser";

// Pages that filter a list of funds or stocks by name must keep every word, numbers included: "500" finds Nifty 500,
// where the transaction parser would read it as an amount and "2026" as a year.
describe("plainWords", () => {
  it("keeps numbers, years and transaction words as ordinary words", () => {
    expect(plainWords("Nifty 500 index")).toEqual(["nifty", "500", "index"]);
    expect(plainWords("ELSS 2026 switch")).toEqual(["elss", "2026", "switch"]);
  });
  it("normalises case, symbols and spaces the way the matcher does", () => {
    expect(plainWords("  HDFC   Mid-Cap & Growth ")).toEqual(["hdfc", "mid", "cap", "growth"]);
  });
  it("returns no words for empty or blank text", () => {
    expect(plainWords("")).toEqual([]);
    expect(plainWords("   ")).toEqual([]);
  });
});
