/** Shared display words; explanatory note text always comes from the backend. */
export const BENCHMARK_SOURCE_LABELS = {
  factsheet: "From the fund's factsheet",
  closest: "Closest index we hold",
  category: "Chosen by the fund's category",
  none: "No benchmark",
} as const;

/** A fund whose benchmark we cannot build, but whose factsheet prints the returns. */
export const BENCHMARK_PRINTED_LABEL = "As printed in the fund house's factsheet";

export type BenchmarkSource = keyof typeof BENCHMARK_SOURCE_LABELS;

export const BENCHMARK_SOURCE_EXPLANATIONS = {
  factsheet: "This is the index named in the fund's own factsheet.",
  closest:
    "The fund's factsheet names an index we do not hold, so we show the closest index we do hold. Figures can differ a little from the fund's own comparison.",
  category:
    "The factsheet does not name an index we can use, so we show the standard index for funds in this category.",
  printed:
    "We cannot build this index ourselves. These returns are printed in the fund house's factsheet.",
  none: "We could not find a fair benchmark for this fund.",
} as const;

export type BenchmarkSourceCase = keyof typeof BENCHMARK_SOURCE_EXPLANATIONS;

export const BENCHMARK_FLOW_METHOD =
  "We compare the fund and index using the same cash flows on the same dates.";
export const BENCHMARK_PERIOD_METHOD =
  "We compare the fund and index over the same dates.";

export function benchmarkSourceLabel(source: string | null | undefined): string {
  if (!source) return BENCHMARK_SOURCE_LABELS.none;
  return BENCHMARK_SOURCE_LABELS[source as BenchmarkSource] ?? BENCHMARK_SOURCE_LABELS.none;
}

export function benchmarkSourceExplanation(
  sourceKey: BenchmarkSourceCase | string | null | undefined
): string {
  if (!sourceKey) return BENCHMARK_SOURCE_EXPLANATIONS.none;
  return (
    BENCHMARK_SOURCE_EXPLANATIONS[sourceKey as BenchmarkSourceCase] ??
    BENCHMARK_SOURCE_EXPLANATIONS.none
  );
}

export interface BenchmarkChoiceDetails {
  sourceKey: BenchmarkSourceCase;
  label: string;
  explanation: string;
  fullLine: string;
}

export function benchmarkChoiceDetails(
  source: string | null | undefined,
  hasDeclaredNameWhenNone?: boolean
): BenchmarkChoiceDetails {
  const isPrinted = source === "none" && Boolean(hasDeclaredNameWhenNone);
  const sourceKey: BenchmarkSourceCase = isPrinted
    ? "printed"
    : source && source in BENCHMARK_SOURCE_LABELS
    ? (source as BenchmarkSource)
    : "none";

  const label = isPrinted
    ? BENCHMARK_PRINTED_LABEL
    : BENCHMARK_SOURCE_LABELS[sourceKey as BenchmarkSource] ?? BENCHMARK_SOURCE_LABELS.none;

  const explanation = BENCHMARK_SOURCE_EXPLANATIONS[sourceKey];
  const fullLine = `How this benchmark was chosen: ${label}. ${explanation}`;

  return { sourceKey, label, explanation, fullLine };
}

export function benchmarkDisplayName(name: string): string {
  return name.replace(/\bTRI\b/gi, "Total Return");
}

/** Turn a payload key into readable words without choosing a different index. */
export function benchmarkKeyName(key: string): string {
  return key
    .replace(/50_25_25$/, "50:25:25")
    .split("_")
    .map((word) =>
      word === "it" ? "IT" : word === "1d" ? "1D" : word.charAt(0).toUpperCase() + word.slice(1)
    )
    .join(" ");
}
