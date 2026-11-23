import { describe, expect, it } from "vitest";
import { parseQuery } from "./queryParser";

describe("parseQuery", () => {
  it("returns empty words for empty or whitespace query", () => {
    expect(parseQuery("")).toEqual({ words: [] });
    expect(parseQuery("   ")).toEqual({ words: [] });
  });

  it("extracts type words (singular and plural) and removes them from words", () => {
    expect(parseQuery("purchase")).toEqual({ words: [], typeWord: "purchase" });
    expect(parseQuery("redemptions")).toEqual({ words: [], typeWord: "redemption" });
    expect(parseQuery("switches")).toEqual({ words: [], typeWord: "switch" });
  });

  it("extracts 4-digit year between 1990 and 2100", () => {
    expect(parseQuery("2025")).toEqual({ words: [], year: 2025 });
    expect(parseQuery("1989")).toEqual({ words: [], amount: "1989" });
  });

  it("extracts month name plus year as 3-letter lower-case month and numeric year", () => {
    expect(parseQuery("Mar 2025")).toEqual({ words: [], month: "mar", year: 2025 });
    expect(parseQuery("December 2024")).toEqual({ words: [], month: "dec", year: 2024 });
    // month without year stays in words
    expect(parseQuery("march")).toEqual({ words: ["march"] });
  });

  it("extracts amount (with ₹ and commas removed) as string", () => {
    expect(parseQuery("₹10,000")).toEqual({ words: [], amount: "10000" });
    expect(parseQuery("5000")).toEqual({ words: [], amount: "5000" });
  });

  it("handles mixed queries like 'hdfc redemption 2025'", () => {
    expect(parseQuery("hdfc redemption 2025")).toEqual({
      words: ["hdfc"],
      typeWord: "redemption",
      year: 2025,
    });
  });
});
