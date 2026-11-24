import { createContext, useContext } from "react";
import type { PrintOptions } from "./printFragment";

export const PrintOptionsContext = createContext<PrintOptions | null>(null);

export function usePrintOptions(): PrintOptions | null {
  return useContext(PrintOptionsContext);
}
