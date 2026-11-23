import { describe, expect, it } from "vitest";
import type { StockHoldingRow } from "../types";
import { filterStockRows, stockSearchNote } from "./stockSearch";

const rows: StockHoldingRow[] = [
  { isin: "INE000000001", instrument_name: "Example Motors", sector_raw: "Automobiles",
    asset_type: "equity_domestic", exposure_pct: "5.00", exposure_value: "5000.00",
    contributing_funds: [{ scheme_id: "growth", scheme_name: "Example Growth Fund",
      holdings_as_of: "2026-10-31", cadence: "monthly", age_tag: null,
      fund_weight_pct: "50.00", stock_weight_pct: "10.00" }] },
  { isin: "INE000000002", instrument_name: "Orchid Bank", sector_raw: "Banking",
    asset_type: "equity_domestic", exposure_pct: "3.00", exposure_value: "3000.00",
    contributing_funds: [{ scheme_id: "income", scheme_name: "Example Income Fund",
      holdings_as_of: "2026-10-31", cadence: "monthly", age_tag: null,
      fund_weight_pct: "50.00", stock_weight_pct: "6.00" }] },
];

describe("stock search", () => {
  it("empty text returns the rows unchanged", () => {
    expect(filterStockRows(rows, "")).toBe(rows);
  });

  it("matches name, ISIN prefix and contributing fund names", () => {
    expect(filterStockRows(rows, "motors")).toEqual([rows[0]]);
    expect(filterStockRows(rows, "ine00000000")).toEqual(rows);
    expect(filterStockRows(rows, "INE000000002")).toEqual([rows[1]]);
    expect(filterStockRows(rows, "growth")).toEqual([rows[0]]);
    expect(filterStockRows(rows, "000000002")).toEqual([]);
  });

  it("every word must match", () => {
    expect(filterStockRows(rows, "growth motors")).toEqual([rows[0]]);
    expect(filterStockRows(rows, "motors growth")).toEqual([rows[0]]);
    expect(filterStockRows(rows, "motors income")).toEqual([]);
  });

  it("the note appears only when the list is truncated and names both numbers", () => {
    expect(stockSearchNote({ truncated: true, total_stock_count: 240 }, 100))
      .toBe("Searching the largest 100 of 240 stocks");
    expect(stockSearchNote({ truncated: false, total_stock_count: 2 }, 2)).toBeNull();
  });
});
