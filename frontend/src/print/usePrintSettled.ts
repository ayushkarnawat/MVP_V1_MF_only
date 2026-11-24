import { createContext, useContext, useEffect } from "react";

export const PrintSettledContext = createContext<((id: string, settled: boolean) => void) | null>(null);

export function usePrintSettled(id: string, settled: boolean): void {
  const report = useContext(PrintSettledContext);
  useEffect(() => {
    report?.(id, settled);
    return () => report?.(id, false);
  }, [report, id, settled]);
}
