import { useId } from "react";
import { benchmarkLabel, signedPct, toneOf } from "../scenarioFormat";
import type { ScenarioBenchmark } from "../types";
import { DivergingBars, type BarRow } from "./DivergingBars";

export interface BenchmarkChartProps {
  portfolioPct: string | null;
  benchmarks: ScenarioBenchmark[];
}

export function BenchmarkChart({ portfolioPct, benchmarks }: BenchmarkChartProps) {
  const titleId = useId();

  if (benchmarks.length === 0) {
    return null;
  }

  const rows: BarRow[] = [];

  if (portfolioPct !== null) {
    const tone = toneOf(portfolioPct) === "loss" ? "loss" : "gain";
    rows.push({
      key: "portfolio",
      label: "Your portfolio",
      value: portfolioPct,
      text: signedPct(portfolioPct),
      tone,
    });
  }

  for (const benchmark of benchmarks) {
    rows.push({
      key: benchmark.name,
      label: benchmarkLabel(benchmark.name),
      value: benchmark.pct,
      text: signedPct(benchmark.pct),
      tone: "index",
    });
  }

  return (
    <section
      aria-labelledby={titleId}
      className="min-w-0 rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-card)] p-4"
    >
      <h3
        id={titleId}
        className="mb-3 font-heading text-sm font-semibold text-[var(--ui-text)]"
      >
        Benchmark comparison
      </h3>
      <DivergingBars rows={rows} ariaLabel="Benchmark comparison" />
      <p className="mt-2.5 text-[11.5px] text-[var(--ui-text-muted)]">
        Total return indices over the same dates.
      </p>
    </section>
  );
}
