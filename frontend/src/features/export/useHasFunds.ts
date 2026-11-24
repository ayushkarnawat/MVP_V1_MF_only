import { useScope } from "../../shell/scope/ScopeContext";
export function useHasFunds(): boolean | undefined {
  return useScope().members.length === 0 ? false : undefined;
}
