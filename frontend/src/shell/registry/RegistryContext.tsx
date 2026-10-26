import { createContext, useContext } from "react";
import type { ShellRoute } from "./types";
import { buildRegistry } from "./buildRegistry";

// A single registry is shared by the router, chrome and navigation guards.
// Tests can replace it without changing global modules or route files.
export const RegistryContext = createContext<ShellRoute[] | undefined>(undefined);
export function useRegistry(): ShellRoute[] {
  return useContext(RegistryContext) ?? buildRegistry();
}
