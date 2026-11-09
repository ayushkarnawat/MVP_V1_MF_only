import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getHouseholdImportHistory } from "@/features/import/api";
import { isCompletedImport } from "@/features/import/importStatus";
import type { HouseholdImportHistoryItem } from "@/features/import/types";
import { groupKey } from "@/features/profile/historyGroups";
import { formatDate } from "@/features/profile/ImportHistorySection";

export function ImportDetailsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [items, setItems] = useState<HouseholdImportHistoryItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!open) {
      setItems(null);
      setLoading(false);
      setError(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(false);
    getHouseholdImportHistory()
      .then((data) => {
        if (!cancelled) {
          setItems(data);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError(true);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const groups = useMemo(() => {
    if (!items) return [];
    const map = new Map<string, HouseholdImportHistoryItem[]>();
    for (const item of items) {
      const key = groupKey(item);
      const existing = map.get(key);
      if (existing) existing.push(item);
      else map.set(key, [item]);
    }
    return Array.from(map.values());
  }, [items]);

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Import details</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-[13px] text-[var(--ui-text-muted)]">Your imported statements</p>
          {loading && <p className="text-sm text-[var(--ui-text-muted)]">Loading…</p>}
          {error && <p className="text-sm text-[var(--ui-text-muted)]">Could not load import details.</p>}
          {!loading && !error && items && items.length === 0 && (
            <p className="text-sm text-[var(--ui-text-muted)]">No imports yet.</p>
          )}
          {!loading && !error && groups.map((group) => {
            const first = group[0];
            const period =
              first.statement_from_date && first.statement_to_date
                ? `${formatDate(first.statement_from_date)} – ${formatDate(first.statement_to_date)}`
                : "Statement period unavailable";
            const txCount = group.reduce((sum, item) => sum + (item.new_transactions_count ?? 0), 0);
            const txText = `${txCount} ${txCount === 1 ? "transaction" : "transactions"}`;
            const rawStatus = first.status.replace(/_/g, " ");
            const status = isCompletedImport(first.status)
              ? "Imported"
              : rawStatus.charAt(0).toUpperCase() + rawStatus.slice(1);

            return (
              <div
                key={groupKey(first)}
                data-testid="import-details-row"
                className="flex items-start justify-between gap-3 border-t border-[var(--ui-divider)] py-2"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[var(--ui-text)]">
                    Mutual Funds · CAS statement
                  </p>
                  <p className="text-xs text-[var(--ui-text-muted)]">{period}</p>
                  {group.length > 1 && (
                    <p className="text-xs text-[var(--ui-text-muted)]">
                      {group.map((item) => item.member_name).join(", ")}
                    </p>
                  )}
                </div>
                <span className="shrink-0 text-xs text-[var(--ui-text-muted)]">
                  {txText} · {status}
                </span>
              </div>
            );
          })}
        </div>
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            ← Back
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
