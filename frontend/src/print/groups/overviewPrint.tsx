import type { ReactNode } from "react";
import { AmcSectionPrint, FamilySectionPrint, HistorySectionPrint, InsightsSectionPrint, MutualFundsSectionPrint, SipsSectionPrint } from "./overview/OverviewSections";

export const overviewPrintSections: Record<string, () => ReactNode> = {
  "overview-value-over-time": () => <HistorySectionPrint />,
  "overview-sips": () => <SipsSectionPrint />,
  "overview-mutual-funds": () => <MutualFundsSectionPrint />,
  "overview-amc-allocation": () => <AmcSectionPrint />,
  "overview-family-members": () => <FamilySectionPrint />,
  "overview-quick-insights": () => <InsightsSectionPrint />,
};
