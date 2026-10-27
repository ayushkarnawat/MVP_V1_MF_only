import { describe, expect, it } from "vitest";
import { NIFTY_CAVEAT } from "./planningCopy";
import { buildTiles } from "./tiles";
import type { TileSpec } from "./tiles";
import { FIVE_BENCHMARKS, multiPhaseResult, noFundDataResult, noHoldingsResult, standardResult } from "./testData";

const byKey = (tiles: TileSpec[], key: TileSpec["key"]) => tiles.find(tile => tile.key === key);

describe("buildTiles: a standard result", () => {
  it("gives four tiles in the fixed order", () => {
    expect(buildTiles(standardResult()).map(tile => tile.key)).toEqual(["return", "rupees", "benchmark", "coverage"]);
  });

  it("states the return, tone and line", () => {
    expect(byKey(buildTiles(standardResult()), "return")).toEqual({
      key: "return", caption: "Your portfolio return", value: "−12.6%", tone: "loss",
      line: "Over the scenario dates", lineTone: "neutral", note: null,
    });
  });

  it("states the rupee impact in whole rupees with the real minus sign", () => {
    expect(byKey(buildTiles(standardResult()), "rupees")).toMatchObject({
      caption: "Rupee impact", value: "−₹656", tone: "loss", line: "Current value times each fund's move",
    });
  });

  it("compares with the Nifty 50 and carries the caveat", () => {
    expect(byKey(buildTiles(standardResult()), "benchmark")).toEqual({
      key: "benchmark", caption: "Nifty 50 return", value: "+0.4%", tone: "gain",
      line: "Behind by 13.0 percentage points", lineTone: "loss", note: NIFTY_CAVEAT,
    });
  });

  it("says Outperformed, in the gain tone, when the portfolio beat the index", () => {
    const result = standardResult();
    result.portfolio_impact_pct = "-17.09";
    result.benchmarks = [{ name: "nifty_50", pct: "-30.20" }];
    expect(byKey(buildTiles(result), "benchmark")).toMatchObject({
      value: "−30.2%", tone: "loss", line: "Outperformed by 13.1 percentage points", lineTone: "gain",
    });
  });

  it("states what the result is based on", () => {
    expect(byKey(buildTiles(standardResult()), "coverage")).toEqual({
      key: "coverage", caption: "Coverage", value: "Based on ₹5,212", tone: "neutral",
      line: "of your ₹5,212", lineTone: "neutral", note: null,
    });
  });

  it("uses a gain tone for a positive return and a neutral one for zero", () => {
    const up = standardResult();
    up.portfolio_impact_pct = "8.00"; up.rupee_impact = "416.96";
    expect(byKey(buildTiles(up), "return")).toMatchObject({ value: "+8.0%", tone: "gain" });
    expect(byKey(buildTiles(up), "rupees")).toMatchObject({ value: "+₹417", tone: "gain" });
    const flat = standardResult();
    flat.portfolio_impact_pct = "0.00"; flat.rupee_impact = "0.00";
    expect(byKey(buildTiles(flat), "return")).toMatchObject({ value: "0.0%", tone: "neutral" });
    expect(byKey(buildTiles(flat), "rupees")).toMatchObject({ value: "₹0", tone: "neutral" });
  });
});

describe("buildTiles: coverage line", () => {
  it("adds how many funds have no data, singular and plural, after a dot", () => {
    const one = standardResult(); one.no_data_funds = 1; one.covered_value = "4000.00";
    expect(byKey(buildTiles(one), "coverage")).toMatchObject({ value: "Based on ₹4,000", line: "of your ₹5,212 · 1 fund has no data for this period" });
    const many = standardResult(); many.no_data_funds = 3;
    expect(byKey(buildTiles(many), "coverage")?.line).toBe("of your ₹5,212 · 3 funds have no data for this period");
  });

  it("is left out when the coverage is unknown", () => {
    const result = standardResult(); result.covered_value = null;
    expect(byKey(buildTiles(result), "coverage")).toBeUndefined();
    const other = standardResult(); other.total_value = null;
    expect(byKey(buildTiles(other), "coverage")).toBeUndefined();
  });
});

describe("buildTiles: other result shapes", () => {
  it("multi-phase has no benchmark tile and a cumulative return line", () => {
    const tiles = buildTiles(multiPhaseResult());
    expect(tiles.map(tile => tile.key)).toEqual(["return", "rupees", "coverage"]);
    expect(byKey(tiles, "return")).toMatchObject({ value: "−5.0%", line: "Cumulative over all phases" });
  });

  it("a standard result with an empty benchmark list has no benchmark tile", () => {
    const result = standardResult(); result.benchmarks = [];
    expect(buildTiles(result).map(tile => tile.key)).toEqual(["return", "rupees", "coverage"]);
  });

  it("uses the nifty_50 entry even when it is not the first benchmark", () => {
    const result = standardResult();
    result.benchmarks = [...FIVE_BENCHMARKS].reverse();
    expect(byKey(buildTiles(result), "benchmark")?.value).toBe("−30.2%");
    const withoutNifty = standardResult();
    withoutNifty.benchmarks = FIVE_BENCHMARKS.slice(1);
    expect(byKey(buildTiles(withoutNifty), "benchmark")).toBeUndefined();
  });

  it("with no portfolio return but an index, shows the index alone: no return, rupee, gap or caveat", () => {
    const result = standardResult();
    result.portfolio_impact_pct = null; result.benchmarks = [{ name: "nifty_50", pct: "-36.00" }];
    const tiles = buildTiles(result);
    expect(tiles.map(tile => tile.key)).toEqual(["benchmark", "coverage"]);
    expect(byKey(tiles, "benchmark")).toEqual({
      key: "benchmark", caption: "Nifty 50 return", value: "−36.0%", tone: "loss",
      line: "Total return index, same dates", lineTone: "neutral", note: null,
    });
  });

  it("a pre-2006 result (no fund data) is the benchmark tile only", () => {
    const result = noFundDataResult();
    result.benchmarks = [{ name: "nifty_50", pct: "-36.00" }, { name: "nifty_500", pct: "-35.00" }];
    expect(buildTiles(result).map(tile => tile.key)).toEqual(["benchmark"]);
    result.benchmarks = [];
    expect(buildTiles(result)).toEqual([]);
  });

  it("never prints null, NaN or undefined in any tile", () => {
    const sick = standardResult();
    sick.portfolio_impact_pct = null; sick.rupee_impact = null; sick.no_data_funds = null;
    for (const result of [sick, noFundDataResult(), noHoldingsResult(), multiPhaseResult(), standardResult()]) {
      for (const tile of buildTiles(result)) {
        const text = [tile.caption, tile.value, tile.line ?? "", tile.note ?? ""].join(" ");
        expect(text).not.toMatch(/null|NaN|undefined/);
      }
    }
  });

  it("does not change the result it is given", () => {
    const result = standardResult();
    const copy = structuredClone(result);
    buildTiles(result);
    expect(result).toEqual(copy);
  });
});
