import type { HoldingRow } from "../types";

/** The row a click on the table meant. The key is the fund AND the member: two members can hold the same fund
 * with different units and values, and the popup must show the clicked row's own figures. */
export function findHolding(rows: HoldingRow[] | null, schemeId: string, memberId: string): HoldingRow | null {
  if (rows === null) return null;
  return rows.find(row => row.scheme_id === schemeId && row.household_member_id === memberId) ?? null;
}

/** The member the sold-funds list is narrowed to: the selected member in a member view, nobody in the family view. */
export function soldFundsScope(viewMode: "aggregate" | "member", memberId: string | null): string | undefined {
  return viewMode === "member" && memberId ? memberId : undefined;
}
