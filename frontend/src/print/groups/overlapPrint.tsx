import type { ReactNode } from "react";
import { OverlapSectionPrint } from "./overlap/OverlapSections";

export const overlapPrintSections: Record<string, () => ReactNode> = {
  "overlap-common-holdings": () => <OverlapSectionPrint id="overlap-common-holdings" />,
  "overlap-heatmap": () => <OverlapSectionPrint id="overlap-heatmap" />,
  "overlap-top-pairs": () => <OverlapSectionPrint id="overlap-top-pairs" />,
  "overlap-impact": () => <OverlapSectionPrint id="overlap-impact" />,
};
