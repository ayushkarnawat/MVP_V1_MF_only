import { describe, expect, it } from "vitest";
import type { HoldingRowOut } from "@/features/individual-fund/types";
import { filterHoldingRows } from "@/features/individual-fund/overview/holdingsSearch";

const rows: HoldingRowOut[] = [
  { name: "Example Solar", isin: "INE111000001", sector: "Energy", asset_type: "equity", weight: "20.00" },
  { name: "Example Bank", isin: "INE222000002", sector: "Financial Services", asset_type: "equity", weight: "30.00" },
  { name: "Government Bond", isin: null, sector: "Sovereign", asset_type: "debt", weight: "10.00" },
];

describe("fund holdings search", () => {
  it("empty text returns rows untouched", () => {
    expect(filterHoldingRows(rows, "")).toBe(rows);
  });
  it("matches name, ISIN prefix and sector", () => {
    expect(filterHoldingRows(rows, "solar")).toEqual([rows[0]]);
    expect(filterHoldingRows(rows, "INE222")).toEqual([rows[1]]);
    expect(filterHoldingRows(rows, "sovereign")).toEqual([rows[2]]);
    expect(filterHoldingRows(rows, "222000002")).toEqual([]);
  });
  it("every word must match", () => {
    expect(filterHoldingRows(rows, "energy solar")).toEqual([rows[0]]);
    expect(filterHoldingRows(rows, "solar energy")).toEqual([rows[0]]);
    expect(filterHoldingRows(rows, "solar sovereign")).toEqual([]);
  });
  it("no match gives an empty list", () => {
    expect(filterHoldingRows(rows, "x")).toEqual([]);
  });
});
