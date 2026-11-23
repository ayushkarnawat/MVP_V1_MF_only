import { describe, expect, it } from "vitest";
import type { OverlapCommonStock, OverlapPair } from "../types";
import { filterCommonStocks, filterOverlapPairs } from "./overlapSearch";

const fund = (scheme_name: string) => ({ scheme_id: scheme_name, scheme_name, current_value: "1" });
const pair = (a: string, b: string): OverlapPair =>
  ({ fund_a: fund(a), fund_b: fund(b), overlap_pct: "10", common_stocks: [], common_total: 0 });

describe("Overlap search keeps numbers", () => {
  it("a number in a fund name finds that fund's pairs only", () => {
    const pairs = [pair("Example Nifty 500 Index Fund", "Example Growth Fund"), pair("Example Nifty 50 Index Fund", "Example Growth Fund")];
    expect(filterOverlapPairs(pairs, "500")).toEqual([pairs[0]]);
  });
  it("a number in a stock name matches that stock", () => {
    const stocks = [
      { isin: "INE000000001", instrument_name: "Example 3M Industries", weight_a: "1", weight_b: "1" },
      { isin: "INE000000002", instrument_name: "Orchid Ltd", weight_a: "1", weight_b: "1" },
    ] as OverlapCommonStock[];
    expect(filterCommonStocks(stocks, "3m")).toEqual([stocks[0]]);
    expect(filterCommonStocks(stocks, "000000002")).toEqual([]);
  });
});
