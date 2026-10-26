import { createContext, useContext } from "react";
import type { ImportValue, ScopeValue } from "./scopeTypes";

export const ScopeContext = createContext<ScopeValue | undefined>(undefined);
export const ImportContext = createContext<ImportValue | undefined>(undefined);

export function useScope(): ScopeValue {
  const scope = useContext(ScopeContext);
  if (!scope) throw new Error("useScope must be used within a ScopeContext provider");
  return scope;
}

export function useImport(): ImportValue {
  const imports = useContext(ImportContext);
  if (!imports) throw new Error("useImport must be used within an ImportContext provider");
  return imports;
}
