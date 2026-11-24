import type { ReactNode } from "react";
import { AnalyticsCategoryPrint, AnalyticsCostPrint, AnalyticsRankingPrint } from "./analytics/AnalyticsSections";

// Only this group's entries replace placeholders in the shared registry.
export const analyticsPrintSections: Record<string, () => ReactNode> = {
  "analytics-cost": () => <AnalyticsCostPrint />,
  "analytics-category": () => <AnalyticsCategoryPrint />,
  "analytics-ranking": () => <AnalyticsRankingPrint />,
};
