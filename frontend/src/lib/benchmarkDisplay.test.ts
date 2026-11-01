import { describe, expect, it } from "vitest";
import { BENCHMARK_SOURCE_LABELS, BENCHMARK_FLOW_METHOD, BENCHMARK_PERIOD_METHOD, benchmarkDisplayName } from "./benchmarkDisplay";
describe("benchmark display words", () => {
  it("uses the owner's four source labels and scans every new fixed string for plain words", () => {
    expect(Object.values(BENCHMARK_SOURCE_LABELS)).toEqual(["From the fund's factsheet", "Closest index we hold", "Chosen by the fund's category", "No benchmark"]);
    expect([...Object.values(BENCHMARK_SOURCE_LABELS), BENCHMARK_FLOW_METHOD, BENCHMARK_PERIOD_METHOD].join(" ")).not.toMatch(/\b(?:TRI|proxy|fallback)\b/i);
  });
  it("spells out the return label in a declared name", () => {
    expect(benchmarkDisplayName("NIFTY 500 TRI")).toBe("NIFTY 500 Total Return");
  });
});
