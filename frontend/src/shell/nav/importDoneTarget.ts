import { paths } from "./paths";

export function importDoneTarget(origin?: string): string {
  return origin === paths.portfolio() ? paths.portfolio() : paths.mutualFunds.root();
}

export function isImportDoneState(state: unknown): boolean {
  return typeof state === "object" && state !== null && "importNotice" in state;
}
