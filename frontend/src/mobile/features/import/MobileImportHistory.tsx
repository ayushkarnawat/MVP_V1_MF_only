import { useEffect, useState } from "react";
import {
  deleteHouseholdImport,
  deleteMemberPortfolio,
  getHouseholdImportHistory,
  getMemberImportHistory,
} from "@/features/import/api";
import { listHouseholdMembers } from "@/features/auth/api";
import type { HouseholdMember } from "@/features/auth/types";
import type { CASImportStatusResponse, HouseholdImportHistoryItem } from "@/features/import/types";
import { DeleteImportDialog, type DeleteScope } from "@/features/profile/DeleteImportDialog";
import { DeletePortfolioDialog } from "@/features/profile/DeletePortfolioDialog";
import { statementsFor } from "@/features/profile/HouseholdMembersSection";
import { formatDate } from "@/features/profile/ImportHistorySection";
import { groupKey, removalNames } from "@/features/profile/historyGroups";
import { PromptDialog } from "@/features/import/prompts/PromptDialog";
import { PRIMARY_BTN, SECONDARY_BTN } from "@/features/import/prompts/copy";
import { FileText, AlertCircle, RefreshCw, Layers, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { motion, useReducedMotion } from "motion/react";
import { listContainerVariants, listItemVariants, isTestEnv } from "@/lib/motion";

export interface MobileImportHistoryProps {
  memberId: string;
  onRefresh?: () => void;
  /** After a delete: members may have been removed. `removedMemberIds` lists who is gone. */
  onMembersChanged?: (removedMemberIds: string[]) => void;
}

export function MobileImportHistory({ memberId, onMembersChanged }: MobileImportHistoryProps) {
  const [history, setHistory] = useState<CASImportStatusResponse[]>([]);
  // The household-wide list carries the statement grouping (F26) that the per-member list lacks.
  const [household, setHousehold] = useState<HouseholdImportHistoryItem[]>([]);
  const [members, setMembers] = useState<HouseholdMember[]>([]);
  const [deleting, setDeleting] = useState<CASImportStatusResponse | null>(null);
  const [portfolioOpen, setPortfolioOpen] = useState(false);
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const shouldReduceMotion = useReducedMotion() || isTestEnv;

  const fetchHistory = () => {
    setIsLoading(true);
    setError(null);
    getMemberImportHistory(memberId)
      .then((items) => {
        setHistory(items);
        setIsLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load import history.");
        setIsLoading(false);
      });
  };

  useEffect(() => {
    fetchHistory();
  }, [memberId]);

  // Best effort: without the grouping every import is deleted on its own (person scope).
  useEffect(() => {
    let active = true;
    getHouseholdImportHistory().then((rows) => active && setHousehold(rows)).catch(() => undefined);
    listHouseholdMembers().then((rows) => active && setMembers(rows)).catch(() => undefined);
    return () => { active = false; };
  }, [memberId]);

  const householdRow = (importId: string) => household.find((h) => h.import_id === importId);
  const closeDialogs = () => {
    setDeleting(null);
    setPortfolioOpen(false);
    setDeleteError(null);
  };

  const runDelete = async (item: CASImportStatusResponse, scope: DeleteScope) => {
    setDeletePending(true);
    setDeleteError(null);
    try {
      const res = await deleteHouseholdImport(item.import_id, scope);
      const row = householdRow(item.import_id);
      const gone = new Set(
        scope === "group" && row ? household.filter((h) => groupKey(h) === groupKey(row)).map((h) => h.import_id) : [item.import_id],
      );
      setHistory((rows) => rows.filter((r) => !gone.has(r.import_id)));
      setHousehold((rows) => rows.filter((r) => !gone.has(r.import_id)));
      closeDialogs();
      onMembersChanged?.(res.removed_member_ids);
    } catch {
      setDeleteError("Could not delete this import. Please try again.");
    } finally {
      setDeletePending(false);
    }
  };

  const runDeletePortfolio = async (removeMember: boolean) => {
    setDeletePending(true);
    setDeleteError(null);
    try {
      const res = await deleteMemberPortfolio(memberId, removeMember);
      setHistory([]);
      setHousehold((rows) => rows.filter((r) => r.household_member_id !== memberId));
      closeDialogs();
      onMembersChanged?.(res.removed_member_ids);
    } catch {
      setDeleteError("Could not delete these funds. Please try again.");
    } finally {
      setDeletePending(false);
    }
  };

  const deletingRow = deleting ? householdRow(deleting.import_id) : undefined;
  const thisMember = members.find((m) => m.id === memberId);

  if (isLoading) {
    return (
      <div className="space-y-3 animate-pulse py-2 text-left">
        <div className="h-4 w-32 bg-[var(--color-border)] rounded" />
        <div className="h-20 w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl" />
        <div className="h-20 w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 rounded-2xl bg-[color-mix(in_srgb,var(--color-negative)_12%,transparent)] border border-[color-mix(in_srgb,var(--color-negative)_30%,transparent)] text-xs text-[var(--color-negative)] space-y-3 text-left">
        <div className="flex items-center gap-2 font-medium">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={fetchHistory}
          className="h-9 px-3 text-xs gap-1.5 rounded-xl min-h-[36px]"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          <span>Retry</span>
        </Button>
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <motion.div
        initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        className="p-6 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] text-center space-y-2.5 shadow-2xs"
      >
        <div className="h-12 w-12 mx-auto rounded-full bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-accent)] flex items-center justify-center shadow-xs">
          <FileText className="h-5 w-5" />
        </div>
        <h4 className="font-display font-semibold text-xs text-[var(--color-ink)]">
          No import history found
        </h4>
        <p className="text-[11px] text-[var(--color-text-secondary)] max-w-xs mx-auto">
          Past CAS statement uploads and automated requests for this member will appear here.
        </p>
      </motion.div>
    );
  }

  return (
    <div className="space-y-3 text-left">
      <div className="flex items-center justify-between text-xs px-1">
        <span className="font-bold text-[var(--color-ink)] font-display">
          Past Statement Imports
        </span>
        <span className="text-[11px] text-[var(--color-text-secondary)] tabular-nums">
          {history.length} record{history.length !== 1 ? "s" : ""}
        </span>
      </div>
      {thisMember && (
        <button
          type="button"
          onClick={() => {
            setDeleteError(null);
            setPortfolioOpen(true);
          }}
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-semibold text-[var(--color-negative)] min-h-[32px]"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          Delete all funds
        </button>
      )}

      <motion.div
        variants={listContainerVariants}
        initial="hidden"
        animate="visible"
        className="space-y-2.5"
      >
        {history.map((item) => {
          const isSuccess = item.status === "import_successful";
          const dateRange =
            item.statement_from_date && item.statement_to_date
              ? `${formatDate(item.statement_from_date)} – ${formatDate(item.statement_to_date)}`
              : `Uploaded ${new Date(item.uploaded_at).toLocaleDateString()}`;

          return (
            <motion.div
              key={item.import_id}
              variants={listItemVariants}
              className="p-3.5 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-xs space-y-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-0.5 min-w-0">
                  <div className="font-semibold text-xs text-[var(--color-ink)] truncate">
                    {dateRange}
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] text-[var(--color-text-secondary)]">
                    <span className="font-semibold uppercase tracking-wider px-1.5 py-0.2 rounded bg-[var(--color-bg)] border border-[var(--color-border)]">
                      {item.source_cas_type ? item.source_cas_type.toUpperCase() : "CAS"}
                    </span>
                    <span>•</span>
                    <span>{new Date(item.uploaded_at).toLocaleDateString()}</span>
                  </div>
                </div>

                <button
                  type="button"
                  aria-label={`Delete import from ${new Date(item.uploaded_at).toLocaleDateString()}`}
                  onClick={() => {
                    setDeleteError(null);
                    setDeleting(item);
                  }}
                  className="rounded-lg p-1.5 text-[var(--color-negative)] flex-shrink-0 min-h-[32px] min-w-[32px] flex items-center justify-center"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
                <span
                  className={cn(
                    "text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize flex-shrink-0",
                    isSuccess
                      ? "bg-[color-mix(in_srgb,var(--color-positive)_15%,transparent)] text-[var(--color-positive)]"
                      : item.status === "import_failed" || item.status === "validation_failed"
                      ? "bg-[color-mix(in_srgb,var(--color-negative)_15%,transparent)] text-[var(--color-negative)]"
                      : "bg-[var(--color-border)] text-[var(--color-text-secondary)]"
                  )}
                >
                  {item.status.replace(/_/g, " ")}
                </span>
              </div>

              {/* Transactions count if available */}
              {isSuccess && item.new_transactions_count !== undefined && (
                <div className="pt-2 border-t border-[var(--color-border)]/60 flex items-center justify-between text-[11px] text-[var(--color-text-secondary)]">
                  <span className="flex items-center gap-1">
                    <Layers className="h-3 w-3 text-[var(--color-accent)]" /> New Transactions
                  </span>
                  <span className="font-bold text-[var(--color-ink)] tabular-nums">
                    +{item.new_transactions_count}
                    {item.duplicate_transactions_count ? ` (${item.duplicate_transactions_count} dupes skipped)` : ""}
                  </span>
                </div>
              )}

              {item.error_message && (
                <p className="text-[10px] text-[var(--color-negative)] pt-1">
                  {item.error_message}
                </p>
              )}
            </motion.div>
          );
        })}
      </motion.div>
      {deleting && deletingRow && deletingRow.group_people_count > 1 && (
        <DeleteImportDialog
          key={deleting.import_id}
          item={deletingRow}
          willRemove={removalNames(deletingRow, household, members)}
          pending={deletePending}
          error={deleteError}
          onKeep={closeDialogs}
          onDelete={(scope) => void runDelete(deleting, scope)}
        />
      )}
      {deleting && !(deletingRow && deletingRow.group_people_count > 1) && (
        <PromptDialog
          isOpen
          title="Delete this import?"
          body={`This removes ${deleting.new_transactions_count ?? 0} transactions tied to this import from your holdings.`}
          onClose={closeDialogs}
          footer={
            <>
              <button type="button" onClick={closeDialogs} disabled={deletePending} className={SECONDARY_BTN}>
                Keep
              </button>
              <button type="button" onClick={() => void runDelete(deleting, "person")} disabled={deletePending} className={PRIMARY_BTN}>
                Delete
              </button>
            </>
          }
        >
          {deleteError && <p role="alert" className="text-sm text-[var(--color-negative)]">{deleteError}</p>}
        </PromptDialog>
      )}
      {portfolioOpen && thisMember && (
        <DeletePortfolioDialog
          member={thisMember}
          statementsCount={statementsFor(memberId, household)}
          pending={deletePending}
          error={deleteError}
          onKeep={closeDialogs}
          onDelete={(removeMember) => void runDeletePortfolio(removeMember)}
        />
      )}
    </div>
  );
}
