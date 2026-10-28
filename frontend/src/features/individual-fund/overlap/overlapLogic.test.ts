import { describe, expect, it } from "vitest";
import { fixture } from "../fixtures";
import type { OverlapCompareResponse, OverlapResponse } from "../types";
import {
  COMPARISON_TABS, barWidth, commonStocksCaption, comparisonCaption, distributionSegments, fundStockTotals, keyTakeaway, maxDecimal,
  quickInsight, stocks, topCommonSector,
} from "./overlapLogic";

const overlap = () => fixture<OverlapResponse>("overlap_fund");
const compare = () => fixture<OverlapCompareResponse>("overlap_compare");

describe("overlapLogic", () => {
  it("has the six comparison sub-tabs in the mockup order with their exact labels", () => {
    expect(COMPARISON_TABS.map(tab => [tab.id, tab.label])).toEqual([
      ["overview", "Overview"], ["common", "Common Holdings"], ["unique", "Unique Holdings"],
      ["sector", "Sector Comparison"], ["market_cap", "Market Cap Comparison"], ["performance", "Performance Comparison"],
    ]);
  });

  it("stocks() and the two captions pluralise", () => {
    expect([stocks(0), stocks(1), stocks(12)]).toEqual(["0 stocks", "1 stock", "12 stocks"]);
    expect(commonStocksCaption(3, 12)).toBe("3 common stocks out of 12 total holdings");
    expect(commonStocksCaption(1, 1)).toBe("1 common stock out of 1 total holding");
    expect(commonStocksCaption(0, 5)).toBe("0 common stocks out of 5 total holdings");
    expect(comparisonCaption(3, 12, 3)).toBe("3 common stocks out of 12 and 3 total holdings respectively");
    expect(comparisonCaption(1, 5, 7)).toBe("1 common stock out of 5 and 7 total holdings respectively");
  });

  it("fundStockTotals adds the common stocks to each fund's unique ones", () => {
    expect(fundStockTotals({ unique_a: 9, common: 3, unique_b: 0 })).toEqual({ a: 12, b: 3 });
    expect(fundStockTotals({ unique_a: 0, common: 0, unique_b: 0 })).toEqual({ a: 0, b: 0 });
  });

  it("barWidth is a share of the widest value, clamped to 0 to 100, and 0 for anything unusable", () => {
    expect(barWidth("7.0000", "7.0000")).toBe(100);
    expect(barWidth("3.5", "7")).toBe(50);
    expect(barWidth("1", "3")).toBe(33.33);
    expect(barWidth("2", "3")).toBe(66.67);
    expect(barWidth("8", "7")).toBe(100);
    expect(barWidth("0.0000", "7")).toBe(0);
    expect(barWidth("-4", "7")).toBe(0);
    expect(barWidth("5", "0")).toBe(0);
    expect(barWidth("abc", "7")).toBe(0);
    expect(barWidth(null, "7")).toBe(0);
    expect(barWidth("5", undefined)).toBe(0);
  });

  it("maxDecimal compares Decimal strings by value, not as text", () => {
    expect(maxDecimal(["6.0000", "10.5", "7"])).toBe("10.5");
    expect(maxDecimal(["9.9", "10.0"])).toBe("10.0");
    expect(maxDecimal([])).toBe("0");
    expect(maxDecimal(["0.0000"])).toBe("0");
  });

  it("distributionSegments keeps the backend's strings, in the order only-this-fund, common, only-others", () => {
    expect(distributionSegments(overlap().distribution)).toEqual([
      { key: "unique_to_fund", label: "Unique to this fund", count: 9, pct: "75.0000" },
      { key: "common", label: "Common to your other funds", count: 3, pct: "25.0000" },
      { key: "unique_to_others", label: "Unique to your other funds", count: 0, pct: "0.0000" },
    ]);
  });

  it("quickInsight on the golden names the counts, the share and the biggest sector", () => {
    expect(quickInsight(overlap())).toBe(
      "3 of this fund's 12 stocks are also held by other funds in your portfolio, together 18.0% of this fund. The most overlap is in Industrials (7.0%).",
    );
  });

  it("quickInsight edge cases: nothing in common, no stocks at all, no sector rows, a single stock", () => {
    const none = { ...overlap(), common_stock_count: 0, overlap_pct: "0.0000", by_sector: [] };
    expect(quickInsight(none)).toBe("None of this fund's 12 stocks are held by your other funds.");
    expect(quickInsight({ ...none, total_stock_count: 1 })).toBe("None of this fund's 1 stock is held by your other funds.");
    expect(quickInsight({ ...none, total_stock_count: 0 })).toBe("No stock holdings are published for this fund yet.");
    expect(quickInsight({ ...overlap(), by_sector: [] })).toBe(
      "3 of this fund's 12 stocks are also held by other funds in your portfolio, together 18.0% of this fund.",
    );
    expect(quickInsight({ ...overlap(), common_stock_count: 1, total_stock_count: 1, overlap_pct: "100.0000", by_sector: [] })).toBe(
      "1 of this fund's 1 stock is also held by other funds in your portfolio, together 100.0% of this fund.",
    );
  });

  it("topCommonSector picks the largest common weight by value (first on a tie) and is null when nothing is shared", () => {
    expect(topCommonSector(compare().sector_comparison)).toBe("Industrials");
    expect(topCommonSector([{ sector: "A", common: "9.5", a: "1", b: "1" }, { sector: "B", common: "10.0", a: "1", b: "1" }])).toBe("B");
    expect(topCommonSector([{ sector: "A", common: "5.0", a: "1", b: "1" }, { sector: "B", common: "5.0000", a: "1", b: "1" }])).toBe("A");
    expect(topCommonSector([{ sector: "A", common: "0.0000", a: "1", b: "0" }])).toBeNull();
    expect(topCommonSector([])).toBeNull();
  });

  it("keyTakeaway on the golden, and its edge cases", () => {
    expect(keyTakeaway(compare())).toBe("These two funds share 3 stocks worth a combined 18.6% of your portfolio. They overlap most in Industrials.");
    const one = compare();
    one.counts = { unique_a: 4, common: 1, unique_b: 2 };
    expect(keyTakeaway(one)).toContain("share 1 stock worth");
    const noSector = { ...compare(), sector_comparison: [] };
    expect(keyTakeaway(noSector)).toBe("These two funds share 3 stocks worth a combined 18.6% of your portfolio.");
    const nothing = compare();
    nothing.counts = { unique_a: 9, common: 0, unique_b: 2 };
    expect(keyTakeaway(nothing)).toBe("These two funds hold no stock in common.");
  });
});
