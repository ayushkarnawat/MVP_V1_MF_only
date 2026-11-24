import type { ReactNode } from "react";
import { BenchmarkSectionPrint, HistorySectionPrint, ReturnsSectionPrint } from "./performance/PerformanceSections";

export const performancePrintSections: Record<string, () => ReactNode> = {
  "performance-returns": () => <ReturnsSectionPrint />,
  "performance-portfolio-history": () => <HistorySectionPrint />,
  "performance-benchmark-comparison": () => <BenchmarkSectionPrint />,
};
