import type { ReactNode } from "react";
import { LedgerSectionPrint } from "./transactions/LedgerSection";

// Cash flow keeps its placeholder until the yearly print chart is available.
export const transactionsPrintSections: Record<string, () => ReactNode> = {
  "transactions-ledger": () => <LedgerSectionPrint />,
};
