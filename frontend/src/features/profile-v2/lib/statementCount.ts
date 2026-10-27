export interface StatementRow {
  import_id: string;
  household_member_id: string;
  upload_group_id: string | null;
}

// The rows of one upload group are one statement; a row without a group is its own statement.
export function statementCount(memberId: string, history: readonly StatementRow[]): number {
  const statementIds = new Set<string>();
  for (const row of history) {
    if (row.household_member_id === memberId) {
      statementIds.add(row.upload_group_id ?? row.import_id);
    }
  }
  return statementIds.size;
}
