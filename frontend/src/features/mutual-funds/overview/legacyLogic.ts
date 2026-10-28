/** The member the sold-funds list is narrowed to: the selected member in a member view, nobody in the family view. */
export function soldFundsScope(viewMode: "aggregate" | "member", memberId: string | null): string | undefined {
  return viewMode === "member" && memberId ? memberId : undefined;
}
