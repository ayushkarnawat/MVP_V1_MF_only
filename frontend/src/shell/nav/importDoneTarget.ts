import { paths } from "./paths";

export function importDoneTarget(origin?: string): string {
  return origin === paths.portfolio() ? paths.portfolio() : paths.mutualFunds.root();
}
