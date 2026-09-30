import { useEffect, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { Modal } from "../../components/Modal";
import { getHouseholdMembers } from "../auth/api";
import type { HouseholdMember } from "../auth/types";
import { deleteHouseholdImport, getHouseholdImportHistory } from "../import/api";
import type { DeleteImportResponse, HouseholdImportHistoryItem } from "../import/types";
import { DeleteImportDialog, type DeleteScope } from "./DeleteImportDialog";
import { groupKey, removalNames } from "./historyGroups";

interface ImportHistorySectionProps {
  loadImportHistory?: () => Promise<HouseholdImportHistoryItem[]>;
  deleteImport?: (importId: string, scope?: DeleteScope) => Promise<DeleteImportResponse>;
  /** Used only to tell which people a delete would remove (locked ones with nothing left). */
  loadMembers?: () => Promise<HouseholdMember[]>;
  /** Called after a delete, so the page can refresh anything that shows members or funds. */
  onChanged?: () => void;
}

export const formatDate = (value: string) => new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
}).format(new Date(value)).replace("Sept", "Sep");

export function ImportHistorySection({
  loadImportHistory = getHouseholdImportHistory,
  deleteImport = deleteHouseholdImport,
  loadMembers = getHouseholdMembers,
  onChanged,
}: ImportHistorySectionProps) {
  const [imports, setImports] = useState<HouseholdImportHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<HouseholdImportHistoryItem | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [members, setMembers] = useState<HouseholdMember[]>([]);

  useEffect(() => {
    let active = true;
    loadMembers().then((rows) => active && setMembers(rows)).catch(() => undefined);
    return () => { active = false; };
  }, [loadMembers]);

  const groups = useMemo(() => {
    const byKey = new Map<string, HouseholdImportHistoryItem[]>();
    for (const item of imports) byKey.set(groupKey(item), [...(byKey.get(groupKey(item)) ?? []), item]);
    return [...byKey.values()];
  }, [imports]);

  const runDelete = async (item: HouseholdImportHistoryItem, scope: DeleteScope) => {
    setDeletePending(true);
    setDeleteError(null);
    try {
      await deleteImport(item.import_id, scope);
      setImports((rows) => {
        if (scope === "group") return rows.filter((r) => groupKey(r) !== groupKey(item));
        return rows
          .filter((r) => r.import_id !== item.import_id)
          .map((r) => (groupKey(r) === groupKey(item) ? { ...r, group_people_count: Math.max(1, r.group_people_count - 1) } : r));
      });
      setSelected(null);
      onChanged?.();
    } catch {
      setDeleteError("Could not delete this import. Please try again.");
    } finally {
      setDeletePending(false);
    }
  };

  useEffect(() => {
    let active = true;
    loadImportHistory()
      .then((rows) => active && setImports(rows))
      .catch(() => active && setError("Could not load import history."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [loadImportHistory]);

  return (
    <section className="space-y-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-xs sm:p-6">
      <h2 className="font-display text-lg font-semibold">Import History</h2>
      {loading ? <p className="text-sm text-[var(--color-text-secondary)]">Loading imports…</p> : null}
      {error ? <p className="text-sm text-[var(--color-negative)]">{error}</p> : null}
      {!loading && !error && imports.length === 0 ? (
        <p className="text-sm text-[var(--color-text-secondary)]">No imports yet.</p>
      ) : null}
      <div className="divide-y divide-[var(--color-border)]">
        {groups.map((group) => {
          const first = group[0];
          const multi = group.length > 1;
          const transactionCount = group.reduce((sum, r) => sum + (r.new_transactions_count ?? 0), 0);
          return (
            <div key={groupKey(first)} className="py-4 first:pt-1 last:pb-1">
              <div className="flex items-start gap-4">
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-sm font-semibold">
                    {first.statement_from_date && first.statement_to_date
                      ? `${formatDate(first.statement_from_date)} – ${formatDate(first.statement_to_date)}`
                      : "Statement period unavailable"}
                  </p>
                  <p className="text-xs text-[var(--color-text-secondary)]">
                    Imported {formatDate(first.uploaded_at)} · {first.status.replaceAll("_", " ")} · <span>{transactionCount} transaction{transactionCount === 1 ? "" : "s"}</span>
                  </p>
                </div>
                {!multi && (
                  <button
                    type="button"
                    aria-label={`Delete import from ${formatDate(first.uploaded_at)}`}
                    onClick={() => {
                      setDeleteError(null);
                      setSelected(first);
                    }}
                    className="rounded-lg p-2 text-[var(--color-negative)] hover:bg-[color-mix(in_srgb,var(--color-negative)_10%,transparent)]"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
              {multi && (
                <ul className="mt-2 space-y-1">
                  {group.map((item) => (
                    <li key={item.import_id} className="flex items-center gap-3 pl-3 text-xs">
                      <span className="min-w-0 flex-1 truncate font-medium">{item.member_name}</span>
                      <span className="text-[var(--color-text-secondary)]">{item.new_transactions_count ?? 0} txns</span>
                      <button
                        type="button"
                        aria-label={`Delete ${item.member_name}’s funds from the ${formatDate(item.uploaded_at)} import`}
                        onClick={() => {
                          setDeleteError(null);
                          setSelected(item);
                        }}
                        className="rounded-lg p-1.5 text-[var(--color-negative)] hover:bg-[color-mix(in_srgb,var(--color-negative)_10%,transparent)]"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
      {selected && imports.filter((r) => groupKey(r) === groupKey(selected)).length > 1 ? (
        <DeleteImportDialog
          key={selected.import_id}
          item={selected}
          willRemove={removalNames(selected, imports, members)}
          pending={deletePending}
          error={deleteError}
          onKeep={() => {
            setSelected(null);
            setDeleteError(null);
          }}
          onDelete={(scope) => void runDelete(selected, scope)}
        />
      ) : (
        <Modal isOpen={selected !== null} onClose={() => {
          setSelected(null);
          setDeleteError(null);
        }} title="Delete import">
          {selected ? (
            <div className="space-y-4">
              <p className="text-sm">This removes {selected.new_transactions_count ?? 0} transactions tied to this import from your holdings.</p>
              <p className="text-sm text-[var(--color-text-secondary)]">
                Dashboard updates on your next refresh after deletion. Analytics will recompute in the background and may take tens of seconds to a couple of minutes.
              </p>
              <button
                type="button"
                disabled={deletePending}
                onClick={() => void runDelete(selected, "person")}
                className="rounded-lg bg-[var(--color-negative)] px-4 py-2 text-sm font-semibold text-white"
              >
                {deletePending ? "Deleting…" : "Delete import"}
              </button>
              {deleteError ? <p role="alert" className="text-sm text-[var(--color-negative)]">{deleteError}</p> : null}
            </div>
          ) : null}
        </Modal>
      )}
    </section>
  );
}
