import { describe, expect, it } from "vitest";
import type { OverlapCommonStock, OverlapPair } from "../types";
import { filterCommonStocks, filterOverlapPairs } from "./overlapSearch";

const stocks: OverlapCommonStock[] = [
  { isin: "INE000000001", instrument_name: "Example Motors", weight_a: "5.00", weight_b: "4.00" },
  { isin: "INE000000002", instrument_name: "Orchid Bank", weight_a: "3.00", weight_b: "2.00" },
];
const growth = { scheme_id: "growth", scheme_name: "Example Growth Fund", current_value: "1000.00" };
const income = { scheme_id: "income", scheme_name: "Example Income Fund", current_value: "2000.00" };
const reserve = { scheme_id: "reserve", scheme_name: "Example Reserve Fund", current_value: "3000.00" };
const pairs: OverlapPair[] = [
  { fund_a: growth, fund_b: income, overlap_pct: "60.00", common_stocks: stocks, common_total: 2 },
  { fund_a: income, fund_b: reserve, overlap_pct: "40.00", common_stocks: [stocks[1]], common_total: 1 },
];

describe("Overlap search", () => {
  it("empty text returns pairs and stocks untouched", () => {
    expect(filterOverlapPairs(pairs, "")).toBe(pairs);
    expect(filterCommonStocks(stocks, "")).toBe(stocks);
  });

  it("a fund name finds its pairs", () => {
    expect(filterOverlapPairs(pairs, "growth")).toEqual([pairs[0]]);
    expect(filterOverlapPairs(pairs, "reserve")).toEqual([pairs[1]]);
  });

  it("a stock name finds the pairs that share it", () => {
    expect(filterOverlapPairs(pairs, "motors")).toEqual([pairs[0]]);
    expect(filterOverlapPairs(pairs, "orchid")).toEqual(pairs);
  });

  it("every word must match", () => {
    expect(filterOverlapPairs(pairs, "income motors growth")).toEqual([pairs[0]]);
    expect(filterOverlapPairs(pairs, "growth motors income")).toEqual([pairs[0]]);
    expect(filterOverlapPairs(pairs, "reserve motors")).toEqual([]);
    expect(filterCommonStocks(stocks, "motors example")).toEqual([stocks[0]]);
    expect(filterCommonStocks(stocks, "example motors")).toEqual([stocks[0]]);
    expect(filterCommonStocks(stocks, "motors orchid")).toEqual([]);
  });

  it("common stocks match name or ISIN prefix", () => {
    expect(filterCommonStocks(stocks, "orchid")).toEqual([stocks[1]]);
    expect(filterCommonStocks(stocks, "ine00000000")).toEqual(stocks);
    expect(filterCommonStocks(stocks, "INE000000002")).toEqual([stocks[1]]);
    expect(filterCommonStocks(stocks, "000000002")).toEqual([]);
  });
});
