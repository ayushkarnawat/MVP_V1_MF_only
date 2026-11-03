import { describe, expect, it } from "vitest";
import { categoryLabel } from "./categoryLabel";

describe("categoryLabel", () => {
  it("strips Equity Scheme", () => {
    expect(categoryLabel("Equity Scheme - Flexi Cap Fund")).toBe("Flexi Cap Fund");
  });
  it("strips Equity Schemes (the data is not spelled the same on every row)", () => {
    expect(categoryLabel("Equity Schemes - Mid Cap Fund")).toBe("Mid Cap Fund");
  });
  it("strips Debt Scheme and Hybrid Scheme", () => {
    expect(categoryLabel("Debt Scheme - Liquid Fund")).toBe("Liquid Fund");
    expect(categoryLabel("Hybrid Scheme - Aggressive Hybrid Fund")).toBe("Aggressive Hybrid Fund");
  });
  it("keeps everything after the first dash", () => {
    expect(categoryLabel("Equity Scheme - Large & Mid Cap Fund")).toBe("Large & Mid Cap Fund");
    expect(categoryLabel("Other Scheme - Index Funds - Nifty")).toBe("Index Funds - Nifty");
  });
  it("returns the trimmed text when there is no dash", () => {
    expect(categoryLabel("Flexi Cap Fund")).toBe("Flexi Cap Fund");
    expect(categoryLabel("  Mid Cap Fund  ")).toBe("Mid Cap Fund");
  });
  it("does not split on a dash without spaces around it", () => {
    expect(categoryLabel("Fixed-Maturity Fund")).toBe("Fixed-Maturity Fund");
  });
  it("returns a dash for empty, blank and null values", () => {
    expect(categoryLabel("")).toBe("—");
    expect(categoryLabel("   ")).toBe("—");
    expect(categoryLabel(null)).toBe("—");
    expect(categoryLabel(undefined)).toBe("—");
  });
});
