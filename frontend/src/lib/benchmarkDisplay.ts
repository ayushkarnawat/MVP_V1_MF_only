/** Shared display words; explanatory note text always comes from the backend. */
export const BENCHMARK_SOURCE_LABELS = {
  factsheet: "From the fund's factsheet",
  closest: "Closest index we hold",
  category: "Chosen by the fund's category",
  none: "No benchmark",
} as const;
export type BenchmarkSource = keyof typeof BENCHMARK_SOURCE_LABELS;
export const BENCHMARK_FLOW_METHOD = "We compare the fund and index using the same cash flows on the same dates.";
export const BENCHMARK_PERIOD_METHOD = "We compare the fund and index over the same dates.";
export function benchmarkSourceLabel(source: string): string {
  return BENCHMARK_SOURCE_LABELS[source as BenchmarkSource] ?? BENCHMARK_SOURCE_LABELS.none;
}
export function benchmarkDisplayName(name: string): string {
  return name.replace(/\bTRI\b/gi, "Total Return");
}

/** Turn a payload key into readable words without choosing a different index. */
export function benchmarkKeyName(key: string): string {
  return key.replace(/50_25_25$/, "50:25:25").split("_").map(word =>
    word === "it" ? "IT" : word === "1d" ? "1D" : word.charAt(0).toUpperCase() + word.slice(1)
  ).join(" ");
}
