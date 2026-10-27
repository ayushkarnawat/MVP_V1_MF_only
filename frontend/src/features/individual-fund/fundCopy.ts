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

export type RiskKey = "volatility" | "max_drawdown" | "sharpe" | "beta";

export interface RiskRowInfo {
  key: RiskKey;
  label: string;
  definition: string;
}

export const RISK_ROWS: readonly RiskRowInfo[] = [
  {
    key: "volatility",
    label: "Volatility",
    definition: "How much the fund's daily returns vary, annualised.",
  },
  {
    key: "max_drawdown",
    label: "Maximum drawdown",
    definition: "The largest fall from a peak to a low in the window.",
  },
  {
    key: "sharpe",
    label: "Sharpe ratio",
    definition: "Return above the risk-free rate for each unit of volatility.",
  },
  {
    key: "beta",
    label: "Beta (vs benchmark)",
    definition: "How far the fund moves with its benchmark: 1.0 moves with it.",
  },
];

export const RISK_NO_HISTORY_TEXT =
  "Not enough history to show risk figures yet. About a year of prices is needed.";
export const RISK_LIFE_WINDOW_NOTE =
  "This fund is younger than 3 years, so its whole history is used.";
export const BETA_DASH_NOTE =
  "Not enough overlapping history with the benchmark.";
export const COPY_FOLIO_FAILED = "Couldn't copy the folio number.";

export function riskUnavailableText(reason: string | null | undefined): string {
  if (reason === "no_history") {
    return RISK_NO_HISTORY_TEXT;
  }
  return unavailableText(reason);
}

export function ageTagText(tag: string | null | undefined): string | null {
  if (tag === "older_than_60_days") {
    return "This disclosure is more than 60 days older than the latest price, so the holdings may have changed.";
  }
  return null;
}

export function stockCountText(count: number): string {
  return count === 1 ? `${count} stock` : `${count} stocks`;
}

export type AllocationTab = "market_cap" | "sector" | "asset_type";

export const ALLOCATION_TABS: readonly { value: AllocationTab; label: string }[] =
  [
    { value: "market_cap", label: "Market Cap" },
    { value: "sector", label: "Sector" },
    { value: "asset_type", label: "Asset Type" },
  ];

export const SLICE_SHARE_LABEL: Record<AllocationTab, string> = {
  market_cap: "Share of classified equity",
  sector: "Share of the fund",
  asset_type: "Share of the fund",
};

export function marketCapLabel(label: string): string {
  if (/\sCap$/i.test(label)) {
    return label;
  }
  return `${label} Cap`;
}

export function allocationNote(
  tab: AllocationTab,
  asOf: string,
  unclassified: string | null
): string {
  if (tab === "market_cap") {
    if (unclassified !== null) {
      return `Share of the classified equity part. Not shown: ${unclassified} of the fund (cash, debt, unlisted). Disclosure as of ${asOf}.`;
    }
    return `Share of the classified equity part. Disclosure as of ${asOf}.`;
  }
  if (tab === "sector") {
    return `Sector from the fund's disclosure, as of ${asOf}.`;
  }
  return `Share of the fund's portfolio, as of ${asOf}.`;
}

