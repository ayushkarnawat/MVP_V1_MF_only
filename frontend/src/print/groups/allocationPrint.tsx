import type { ReactNode } from "react";
import { AllocationSectionPrint } from "./allocation/AllocationSections";

export const allocationPrintSections: Record<string, () => ReactNode> = {
  "allocation-asset-class": () => <AllocationSectionPrint id="allocation-asset-class" />,
  "allocation-market-cap": () => <AllocationSectionPrint id="allocation-market-cap" />,
  "allocation-category-amc": () => <AllocationSectionPrint id="allocation-category-amc" />,
  "allocation-fund-manager": () => <AllocationSectionPrint id="allocation-fund-manager" />,
};
