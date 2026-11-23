import { describe, expect, it } from "vitest";
import { filterFundRows, type SearchableFundRow } from "./otherSearch";

const rows: SearchableFundRow[] = [
  { scheme_name: "Example Growth Fund", category_name: "Flexi Cap", plan_type: "direct" },
  { scheme_name: "Example Income Fund", category: "Debt", plan_type: "regular" },
  { scheme_name: "Orchid Equity Fund", sebi_category: "Mid Cap", plan_type: null },
];

describe("filterFundRows", () => {
  it("empty text returns rows untouched", () => {
    expect(filterFundRows(rows, "")).toBe(rows);
  });

  it("matches name", () => {
    expect(filterFundRows(rows, "growth")).toEqual([rows[0]]);
    expect(filterFundRows(rows, "unrelated")).toEqual([]);
  });

  it("matches category and plan type", () => {
    expect(filterFundRows(rows, "flexi")).toEqual([rows[0]]);
    expect(filterFundRows(rows, "debt")).toEqual([rows[1]]);
    expect(filterFundRows(rows, "mid")).toEqual([rows[2]]);
    expect(filterFundRows(rows, "direct")).toEqual([rows[0]]);
    expect(filterFundRows(rows, "regular")).toEqual([rows[1]]);
  });

  it("every word must match", () => {
    expect(filterFundRows(rows, "direct growth flexi")).toEqual([rows[0]]);
    expect(filterFundRows(rows, "flexi growth direct")).toEqual([rows[0]]);
    expect(filterFundRows(rows, "growth regular")).toEqual([]);
  });
});
