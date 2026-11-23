import { describe, expect, it } from "vitest";
import type { FundBenchmarkRow } from "../types";
import { filterBenchmarkFunds } from "./performanceSearch";

const rows: FundBenchmarkRow[] = [
  { scheme_id: "growth", scheme_name: "Example Growth Fund", benchmark_index: "nifty_500",
    fund_xirr: "0.12", benchmark_xirr: "0.10" },
  { scheme_id: "income", scheme_name: "Example Income Fund", benchmark_index: "nifty_50",
    fund_xirr: "0.08", benchmark_xirr: "0.09" },
];

describe("filterBenchmarkFunds", () => {
  it("empty text returns the rows untouched", () => {
    expect(filterBenchmarkFunds(rows, "")).toBe(rows);
  });

  it("every word must match, in any order", () => {
    expect(filterBenchmarkFunds(rows, "growth example")).toEqual([rows[0]]);
    expect(filterBenchmarkFunds(rows, "example growth")).toEqual([rows[0]]);
    expect(filterBenchmarkFunds(rows, "growth income")).toEqual([]);
  });

  it("matches the fund name and the benchmark index name", () => {
    expect(filterBenchmarkFunds(rows, "income")).toEqual([rows[1]]);
    expect(filterBenchmarkFunds(rows, "nifty_500")).toEqual([rows[0]]);
    expect(filterBenchmarkFunds(rows, "growth nifty_500")).toEqual([rows[0]]);
  });

  it("no match gives an empty list", () => {
    expect(filterBenchmarkFunds(rows, "unrelated")).toEqual([]);
  });
});
