export type MfTabId =
  | "overview"
  | "performance"
  | "allocation"
  | "holdings"
  | "transactions"
  | "overlap"
  | "analytics";

export interface PageSection {
  id: string;
  title: string;
  anchor: string;
  tier: "standard" | "pro";
}

export const MIN_SECTIONS_FOR_INDEX = 3;

function section(id: string, title: string): PageSection {
  return { id, title, anchor: id, tier: "standard" };
}

export const SECTION_LISTS: Record<MfTabId, PageSection[]> = {
  overview: [
    section("overview-value-over-time", "Value over time"),
    section("overview-sips", "SIPs"),
    section("overview-mutual-funds", "Mutual Funds"),
    section("overview-amc-allocation", "AMC Allocation"),
    section("overview-family-members", "Family Members"),
    section("overview-quick-insights", "Quick Insights"),
  ],
  performance: [
    section("performance-returns", "Returns"),
    section("performance-portfolio-history", "Portfolio History"),
    section("performance-benchmark-comparison", "Benchmark Comparison (XIRR)"),
  ],
  allocation: [
    section("allocation-asset-class", "Look-Through Asset Allocation"),
    section("allocation-market-cap", "Market-Cap Allocation"),
    section("allocation-category-amc", "Portfolio Allocation"),
    section("allocation-fund-manager", "Fund Manager Allocation"),
  ],
  holdings: [
    section("holdings-top-by-fund", "Top Holdings by Fund"),
    section("holdings-all-stocks", "All Holdings Across Your Portfolio"),
  ],
  transactions: [
    section("transactions-cash-flow", "Cash Flow Over Time"),
    section("transactions-ledger", "All Transactions"),
  ],
  overlap: [
    section("overlap-common-holdings", "Common Holdings"),
    section("overlap-heatmap", "Overlap Heatmap"),
    section("overlap-top-pairs", "Top Overlapping Fund Pairs"),
    section("overlap-impact", "Overlap Impact"),
  ],
  analytics: [
    section("analytics-cost", "Cost & Valuation"),
    section("analytics-category", "Category Average Comparison"),
    section("analytics-ranking", "Performance Ranking"),
  ],
};

export function sectionsForTab(tab: MfTabId): PageSection[] {
  return SECTION_LISTS[tab];
}

export function indexVisible(tab: MfTabId): boolean {
  return sectionsForTab(tab).length >= MIN_SECTIONS_FOR_INDEX;
}
