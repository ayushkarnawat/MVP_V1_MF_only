import { createElement, type ReactNode } from "react";
import type { MfTabId } from "../lib/pageSections";
import { PrintPlaceholder } from "./PrintPlaceholder";
import { allocationPrintSections } from "./groups/allocationPrint";
import { analyticsPrintSections } from "./groups/analyticsPrint";
import { holdingsPrintSections } from "./groups/holdingsPrint";
import { overlapPrintSections } from "./groups/overlapPrint";
import { overviewPrintSections } from "./groups/overviewPrint";
import { performancePrintSections } from "./groups/performancePrint";
import { transactionsPrintSections } from "./groups/transactionsPrint";

interface PrintSection { tab: MfTabId; title: string; render: () => ReactNode }
function entry(tab: MfTabId, id: string, title: string): PrintSection {
  return { tab, title, render: () => createElement(PrintPlaceholder, { id, title }) };
}

export const PRINT_SECTIONS: Record<string, PrintSection> = {
  "overview-value-over-time": entry("overview", "overview-value-over-time", "Value over time"),
  "overview-sips": entry("overview", "overview-sips", "SIPs"),
  "overview-mutual-funds": entry("overview", "overview-mutual-funds", "Mutual Funds"),
  "overview-amc-allocation": entry("overview", "overview-amc-allocation", "AMC Allocation"),
  "overview-family-members": entry("overview", "overview-family-members", "Family Members"),
  "overview-quick-insights": entry("overview", "overview-quick-insights", "Quick Insights"),
  "performance-returns": entry("performance", "performance-returns", "Returns"),
  "performance-portfolio-history": entry("performance", "performance-portfolio-history", "Portfolio History"),
  "performance-benchmark-comparison": entry("performance", "performance-benchmark-comparison", "Benchmark Comparison (XIRR)"),
  "allocation-asset-class": entry("allocation", "allocation-asset-class", "Look-Through Asset Allocation"),
  "allocation-market-cap": entry("allocation", "allocation-market-cap", "Market-Cap Allocation"),
  "allocation-category-amc": entry("allocation", "allocation-category-amc", "Portfolio Allocation"),
  "allocation-fund-manager": entry("allocation", "allocation-fund-manager", "Fund Manager Allocation"),
  "holdings-top-by-fund": entry("holdings", "holdings-top-by-fund", "Top Holdings by Fund"),
  "holdings-all-stocks": entry("holdings", "holdings-all-stocks", "All Holdings Across Your Portfolio"),
  "transactions-cash-flow": entry("transactions", "transactions-cash-flow", "Cash Flow Over Time"),
  "transactions-ledger": entry("transactions", "transactions-ledger", "All Transactions"),
  "overlap-common-holdings": entry("overlap", "overlap-common-holdings", "Common Holdings"),
  "overlap-heatmap": entry("overlap", "overlap-heatmap", "Overlap Heatmap"),
  "overlap-top-pairs": entry("overlap", "overlap-top-pairs", "Top Overlapping Fund Pairs"),
  "overlap-impact": entry("overlap", "overlap-impact", "Overlap Impact"),
  "analytics-cost": entry("analytics", "analytics-cost", "Cost & Valuation"),
  "analytics-category": entry("analytics", "analytics-category", "Category Average Comparison"),
  "analytics-ranking": entry("analytics", "analytics-ranking", "Performance Ranking"),
};

// Each group file replaces the placeholder of its own sections. An id a group names that is not in the list is a mistake.
for (const group of [overviewPrintSections, performancePrintSections, allocationPrintSections, holdingsPrintSections,
  transactionsPrintSections, overlapPrintSections, analyticsPrintSections]) {
  for (const [id, render] of Object.entries(group)) {
    if (!PRINT_SECTIONS[id]) throw new Error(`Print group names an unknown section id: ${id}`);
    PRINT_SECTIONS[id] = { ...PRINT_SECTIONS[id], render };
  }
}
