import type { HouseholdMember } from "../auth/types";
import type { HouseholdImportHistoryItem } from "../import/types";
import type { DeleteScope } from "./DeleteImportDialog";

/** F26: the API list is flat; one statement = one upload_group_id (a lone import is its own group). */
export const groupKey = (item: HouseholdImportHistoryItem) => item.upload_group_id ?? item.import_id;

const removedWithLastImport = (m: HouseholdMember) => m.removed_with_last_import;

/**
 * D1 note: the untouched detected people (no relationship, phone, email or edited name) whose only data is in the rows being deleted. They are removed with it (M17).
 */
export function removalNames(
  item: HouseholdImportHistoryItem,
  all: HouseholdImportHistoryItem[],
  members: HouseholdMember[],
): Record<DeleteScope, string[]> {
  const removableIds = new Set(members.filter(removedWithLastImport).map((m) => m.id));
  const namesFor = (deleted: HouseholdImportHistoryItem[]) => {
    const gone = new Set(deleted.map((d) => d.import_id));
    const out = new Map<string, string>();
    for (const d of deleted) {
      const other = all.some((r) => r.household_member_id === d.household_member_id && !gone.has(r.import_id));
      if (removableIds.has(d.household_member_id) && !other) out.set(d.household_member_id, d.member_name);
    }
    return [...out.values()];
  };
  return {
    person: namesFor([item]),
    group: namesFor(all.filter((r) => groupKey(r) === groupKey(item))),
  };
}
