import { useEffect, useState } from "react";
import { getMemberImportHistory } from "@/features/import/api";
import type { CASImportStatusResponse } from "@/features/import/types";
import { FileText, AlertCircle, RefreshCw, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface MobileImportHistoryProps {
  memberId: string;
  onRefresh?: () => void;
}

export function MobileImportHistory({ memberId }: MobileImportHistoryProps) {
  const [history, setHistory] = useState<CASImportStatusResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      <div className="p-6 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] text-center space-y-2">
        <div className="h-10 w-10 mx-auto rounded-full bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-text-secondary)] flex items-center justify-center shadow-2xs">
          <FileText className="h-5 w-5" />
        </div>
        <h4 className="font-display font-semibold text-xs text-[var(--color-ink)]">
          No import history found
        </h4>
        <p className="text-[11px] text-[var(--color-text-secondary)]">
          Past CAS statement uploads and automated requests for this member will appear here.
        </p>
      </div>
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

      <div className="space-y-2.5">
        {history.map((item) => {
          const isSuccess = item.status === "import_successful";
          const dateRange =
            item.statement_from_date && item.statement_to_date
              ? `${item.statement_from_date} → ${item.statement_to_date}`
              : `Uploaded ${new Date(item.uploaded_at).toLocaleDateString()}`;

          return (
            <div
              key={item.import_id}
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
            </div>
          );
        })}
      </div>
    </div>
  );
}
