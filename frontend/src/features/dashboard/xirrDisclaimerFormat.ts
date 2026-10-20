import { toPercentString } from "../../lib/decimal";

/** The opening-cost share is shown as a whole percent ("98%"), in the one-liner and the popup alike. */
export function openingSharePercent(share: string): string {
  return `${Math.round(parseFloat(toPercentString(share)))}%`;
}
