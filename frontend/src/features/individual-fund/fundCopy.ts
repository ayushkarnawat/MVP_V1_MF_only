import type { PerformancePeriod, ScoreResponse } from "./types";

export const COMING_SOON = "Coming soon";

export type TileId = "value" | "invested" | "gain" | "xirr" | "ter";

export const TILE_TITLES: Record<TileId, string> = {
  value: "Current value",
  invested: "Invested",
  gain: "Total gain",
  xirr: "XIRR",
  ter: "Expense ratio",
};

export const PERFORMANCE_PERIODS: readonly PerformancePeriod[] = [
  "1M",
  "3M",
  "6M",
  "1Y",
  "3Y",
  "5Y",
  "All",
];

export const DEFAULT_PERIOD: PerformancePeriod = "1Y";

export function unavailableText(reason: string | null | undefined): string {
  switch (reason) {
    case "no_history":
      return "No price history yet for this fund.";
    case "no_benchmark":
      return "No benchmark applies to this fund.";
    case "no_disclosure":
      return "Holdings not available yet for this fund house.";
    case "no_manager_data":
      return "Manager details not available for this fund house.";
    case "peers_unavailable":
      return "Category comparison is not available for this fund yet.";
    case "not_held":
      return "You don't hold this fund in this view.";
    default:
      return "Not available right now.";
  }
}

export const SINCE_LAUNCH_NOTE =
  "This fund is younger than the selected period, so the chart starts at its launch date.";

export function benchmarkNote(reason: string | null | undefined): string | null {
  if (reason === "no_benchmark") {
    return "No benchmark applies to this fund type, so only the fund line is shown.";
  }
  if (reason === "no_history") {
    return "Benchmark history is not available yet, so only the fund line is shown.";
  }
  return null;
}

export function columnHeader(column: string): string {
  if (column === "since_inception") return "Since inception";
  if (column === "since_first_investment") return "Since first investment";
  return column;
}

export function scoreSentence(word: string): string {
  switch (word) {
    case "Excellent":
      return "Outstanding returns for the risk taken, at a low cost.";
    case "Strong":
      return "Consistent performance, reasonable costs and strong portfolio quality.";
    case "Good":
      return "Solid returns with a few areas that could be better.";
    case "Average":
      return "Returns and risk are close to what similar funds offer.";
    case "Weak":
      return "Returns have trailed similar funds for the risk taken.";
    case "Poor":
      return "Returns and risk compare poorly with similar funds.";
    default:
      return "";
  }
}

export function scoreNoRingText(score: ScoreResponse): string | null {
  if (score.insufficient_history) {
    return "Not enough history to score this fund yet.";
  }
  if (score.category_unavailable) {
    return "This fund has no category to compare it with.";
  }
  if (score.thin_category) {
    return "Too few funds in this category for a reliable score.";
  }
  if (score.final_score === null) {
    return "No score available yet.";
  }
  return null;
}
