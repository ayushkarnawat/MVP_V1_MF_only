import { describe, expect, it } from "vitest";
import type { FundBenchmarkRow } from "../types";
import { filterBenchmarkFunds } from "./performanceSearch";

const row = (scheme_name: string, benchmark_index: string): FundBenchmarkRow =>
  ({ scheme_id: scheme_name, scheme_name, benchmark_index, fund_xirr: null, benchmark_xirr: null });
const rows = [row("Example Nifty 500 Index Fund", "Nifty 500 TRI"), row("Example Nifty 50 Index Fund", "Nifty 50 TRI"), row("Example Growth Fund", "Nifty 100 TRI")];

describe("Performance search keeps numbers", () => {
  it("500 finds the Nifty 500 fund only", () => {
    expect(filterBenchmarkFunds(rows, "500").map(r => r.scheme_name)).toEqual(["Example Nifty 500 Index Fund"]);
  });
  it("a number can match the benchmark index name", () => {
    expect(filterBenchmarkFunds(rows, "growth 100").map(r => r.scheme_name)).toEqual(["Example Growth Fund"]);
  });
});
