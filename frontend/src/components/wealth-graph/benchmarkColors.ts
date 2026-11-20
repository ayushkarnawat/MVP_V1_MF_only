// One fixed colour per benchmark, from the always-loaded palette tokens (src/styles/palette-tokens.css).
// Green stays the portfolio's line. Colour is never the only cue: the line has a text label and the tooltip
// names the benchmark. The ids are the Home benchmark ids; this file lives in components/ so it does not import
// from a feature.
export type BenchmarkId =
  | "nifty_50"
  | "nifty_500"
  | "nifty_largemidcap_250"
  | "nifty_midcap_150"
  | "nifty_smallcap_250";

export const BENCHMARK_COLORS: Record<BenchmarkId, string> = {
  nifty_50: "var(--c3)", // blue
  nifty_500: "var(--c5)", // violet
  nifty_largemidcap_250: "var(--c6)", // amber
  nifty_midcap_150: "var(--c4)", // indigo
  nifty_smallcap_250: "var(--c2)", // teal
};

/** The colour for a benchmark id; an id this map does not know falls back to the first colour, never to nothing. */
export function benchmarkColor(index: string): string {
  return (BENCHMARK_COLORS as Record<string, string>)[index] ?? BENCHMARK_COLORS.nifty_50;
}
