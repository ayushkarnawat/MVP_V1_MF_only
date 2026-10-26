import { formatRupees } from "@/lib/format";
import { NIFTY_CAVEAT, noDataFunds, outperformText } from "./planningCopy";
import {
  outperformedBy,
  resolveShape,
  signedPct,
  signedRupees,
  toneOf,
  type Tone,
} from "./scenarioFormat";
import type { ScenarioResult } from "./types";

export interface TileSpec {
  key: "return" | "rupees" | "benchmark" | "coverage";
  caption: string;
  value: string;
  tone: Tone;
  line: string | null;
  lineTone: Tone;
  note: string | null;
}

function buildBenchmarkTile(result: ScenarioResult): TileSpec | null {
  const nifty = result.benchmarks.find(b => b.name === "nifty_50");
  if (!nifty) return null;

  const gap = outperformedBy(result.portfolio_impact_pct, nifty.pct);
  if (gap === null) {
    return {
      key: "benchmark",
      caption: "Nifty 50 return",
      value: signedPct(nifty.pct),
      tone: toneOf(nifty.pct),
      line: "Total return index, same dates",
      lineTone: "neutral",
      note: null,
    };
  }

  return {
    key: "benchmark",
    caption: "Nifty 50 return",
    value: signedPct(nifty.pct),
    tone: toneOf(nifty.pct),
    line: outperformText(gap),
    lineTone: toneOf(gap),
    note: NIFTY_CAVEAT,
  };
}

export function buildTiles(result: ScenarioResult): TileSpec[] {
  const benchmarkTile = buildBenchmarkTile(result);

  if (result.funds_data_available === false) {
    return benchmarkTile ? [benchmarkTile] : [];
  }

  const tiles: TileSpec[] = [];

  // 1. Return
  if (result.portfolio_impact_pct !== null) {
    const cumulative = resolveShape(result.scenario) === "multi_phase";
    tiles.push({
      key: "return",
      caption: "Your portfolio return",
      value: signedPct(result.portfolio_impact_pct),
      tone: toneOf(result.portfolio_impact_pct),
      line: cumulative ? "Cumulative over all phases" : "Over the scenario dates",
      lineTone: "neutral",
      note: null,
    });
  }

  // 2. Rupees
  if (result.portfolio_impact_pct !== null && result.rupee_impact !== null) {
    tiles.push({
      key: "rupees",
      caption: "Rupee impact",
      value: signedRupees(result.rupee_impact),
      tone: toneOf(result.rupee_impact),
      line: "Current value times each fund's move",
      lineTone: "neutral",
      note: null,
    });
  }

  // 3. Benchmark
  if (benchmarkTile) {
    tiles.push(benchmarkTile);
  }

  // 4. Coverage
  if (result.covered_value !== null && result.total_value !== null) {
    let line = `of your ${formatRupees(result.total_value)}`;
    if (typeof result.no_data_funds === "number" && result.no_data_funds > 0) {
      line += ` · ${noDataFunds(result.no_data_funds)}`;
    }
    tiles.push({
      key: "coverage",
      caption: "Coverage",
      value: `Based on ${formatRupees(result.covered_value)}`,
      tone: "neutral",
      line,
      lineTone: "neutral",
      note: null,
    });
  }

  return tiles;
}
