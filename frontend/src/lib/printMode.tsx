import { createContext, useContext, type ReactNode } from "react";

export interface PrintModeValue {
  folios: "full" | "masked" | "none";
  dataDates: boolean;
}

const PrintModeContext = createContext<PrintModeValue | null>(null);

export function PrintModeProvider({ value, children }: { value: PrintModeValue; children: ReactNode }) {
  return <PrintModeContext.Provider value={value}>{children}</PrintModeContext.Provider>;
}

export function usePrintMode(): PrintModeValue | null {
  return useContext(PrintModeContext);
}
