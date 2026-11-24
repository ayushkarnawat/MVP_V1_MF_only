import type { ReactNode } from "react";
import { HoldingsSectionPrint } from "./holdings/HoldingsSections";

// Only this group's entries replace placeholders in the shared registry.
export const holdingsPrintSections: Record<string, () => ReactNode> = {
  "holdings-top-by-fund": () => <HoldingsSectionPrint id="holdings-top-by-fund" />,
  "holdings-all-stocks": () => <HoldingsSectionPrint id="holdings-all-stocks" />,
};
