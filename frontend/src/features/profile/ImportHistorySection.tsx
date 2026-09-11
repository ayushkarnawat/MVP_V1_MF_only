import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { Modal } from "../../components/Modal";
import { deleteHouseholdImport, getHouseholdImportHistory } from "../import/api";
import type { DeleteImportResponse, HouseholdImportHistoryItem } from "../import/types";

interface ImportHistorySectionProps {
  loadImportHistory?: () => Promise<HouseholdImportHistoryItem[]>;
  deleteImport?: (importId: string) => Promise<DeleteImportResponse>;
}

const formatDate = (value: string) => new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
}).format(new Date(value)).replace("Sept", "Sep");

export function ImportHistorySection({
  loadImportHistory = getHouseholdImportHistory,
  deleteImport = deleteHouseholdImport,
}: ImportHistorySectionProps) {
  const [imports, setImports] = useState<HouseholdImportHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<HouseholdImportHistoryItem | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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
        {imports.map((item) => {
          const transactionCount = item.new_transactions_count ?? 0;
          return (
            <div key={item.import_id} className="flex items-start gap-4 py-4 first:pt-1 last:pb-1">
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-sm font-semibold">
                  {item.statement_from_date && item.statement_to_date
                    ? `${formatDate(item.statement_from_date)} – ${formatDate(item.statement_to_date)}`
                    : "Statement period unavailable"}
                </p>
                <p className="text-xs text-[var(--color-text-secondary)]">
                  Imported {formatDate(item.uploaded_at)} · {item.status.replaceAll("_", " ")} · <span>{transactionCount} transaction{transactionCount === 1 ? "" : "s"}</span>
                </p>
              </div>
              <button
                type="button"
                aria-label={`Delete import from ${formatDate(item.uploaded_at)}`}
                onClick={() => {
                  setDeleteError(null);
                  setSelected(item);
                }}
                className="rounded-lg p-2 text-[var(--color-negative)] hover:bg-[color-mix(in_srgb,var(--color-negative)_10%,transparent)]"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
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
              onClick={async () => {
                setDeletePending(true);
                setDeleteError(null);
                try {
                  await deleteImport(selected.import_id);
                  setImports((rows) => rows.filter((row) => row.import_id !== selected.import_id));
                  setSelected(null);
                } catch {
                  setDeleteError("Could not delete this import. Please try again.");
                } finally {
                  setDeletePending(false);
                }
              }}
              className="rounded-lg bg-[var(--color-negative)] px-4 py-2 text-sm font-semibold text-white"
            >
              {deletePending ? "Deleting…" : "Delete import"}
            </button>
            {deleteError ? <p role="alert" className="text-sm text-[var(--color-negative)]">{deleteError}</p> : null}
          </div>
        ) : null}
      </Modal>
    </section>
  );
}
