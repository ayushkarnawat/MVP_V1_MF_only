import { useEffect, useState } from "react";
import { Badge } from "@/components/Badge";
import { getMemberImportHistory } from "./api";
import type { CASImportStatusResponse } from "./types";
import { FileText, AlertCircle } from "lucide-react";

interface ImportHistoryListProps {
  memberId: string;
}

export function ImportHistoryList({ memberId }: ImportHistoryListProps) {
  const [history, setHistory] = useState<CASImportStatusResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    setError(null);

    getMemberImportHistory(memberId)
      .then((items) => {
        if (isMounted) {
          setHistory(items);
          setIsLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (isMounted) {
          setError(err instanceof Error ? err.message : "Failed to load import history.");
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [memberId]);

  if (isLoading) {
    return (
      <div className="flex flex-col space-y-3 animate-pulse py-2">
        <div className="text-xs text-[var(--color-text-secondary)]">Loading import history...</div>
        <div className="h-16 w-full bg-[var(--color-bg)] rounded-xl border border-[var(--color-border)]" />
        <div className="h-16 w-full bg-[var(--color-bg)] rounded-xl border border-[var(--color-border)]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 p-3 rounded-xl bg-[color-mix(in_srgb,var(--color-negative)_12%,transparent)] text-xs text-[var(--color-negative)] font-medium">
        <AlertCircle className="h-4 w-4 flex-shrink-0" />
        <span>{error}</span>
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="p-8 rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)]/60 text-center space-y-2">
        <div className="h-10 w-10 mx-auto rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-secondary)] flex items-center justify-center shadow-2xs">
          <FileText className="h-5 w-5" />
        </div>
        <p className="text-xs sm:text-sm font-semibold text-[var(--color-ink)]">
          No previous imports found for this member.
        </p>
        <p className="text-[11px] text-[var(--color-text-secondary)]">
          Upload a statement or request one from CAMS to see your history here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {history.map((item) => {
        const isSuccess = item.status === "import_successful";
        const dateRange =
          item.statement_from_date && item.statement_to_date
            ? `${item.statement_from_date} to ${item.statement_to_date}`
            : `Uploaded ${new Date(item.uploaded_at).toLocaleDateString()}`;

        return (
          <div
            key={item.import_id}
            className="p-3.5 sm:p-4 rounded-xl border border-[var(--color-border)]/70 bg-[var(--color-bg)] hover:bg-[var(--color-surface)] transition-colors flex items-center justify-between gap-3 flex-wrap sm:flex-nowrap"
          >
            <div className="flex items-start gap-3 min-w-0">
              <div className="h-8 w-8 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-accent)] flex items-center justify-center flex-shrink-0 shadow-2xs mt-0.5">
                <FileText className="h-4 w-4" />
              </div>
              <div className="min-w-0 space-y-0.5">
                <div className="font-semibold text-xs sm:text-sm text-[var(--color-ink)] truncate">
                  {dateRange}
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-[var(--color-text-secondary)]">
                  <span className="font-semibold uppercase tracking-wider text-[9px] px-1.5 py-0.2 rounded bg-[var(--color-border)] text-[var(--color-text-secondary)]">
                    {item.source_cas_type ? item.source_cas_type.toUpperCase() : "CAS"}
                  </span>
                  <span>•</span>
                  <span>{new Date(item.uploaded_at).toLocaleDateString()}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 flex-shrink-0 ml-auto sm:ml-0">
              {isSuccess ? (
                <div className="text-right">
                  <Badge variant="positive">Imported</Badge>
                  <div className="text-[11px] text-[var(--color-text-secondary)] mt-0.5 tabular-nums">
                    {item.new_transactions_count ?? 0} new transactions
                    {item.duplicate_transactions_count ? `, ${item.duplicate_transactions_count} duplicates` : ""}
                  </div>
                </div>
              ) : (
                <Badge variant={item.status === "password_required" ? "warning" : "neutral"}>
                  {item.status.replace("_", " ")}
                </Badge>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
