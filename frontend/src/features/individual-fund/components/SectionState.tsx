import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import type { FundSectionStatus } from "../useFundSection";
import { unavailableText } from "../fundCopy";

export interface SectionStateProps {
  status: FundSectionStatus;
  label: string;
  reason?: string | null;
  onRetry?: () => void;
  skeleton?: ReactNode;
  children: ReactNode;
}

export function SectionState({
  status,
  label,
  reason,
  onRetry,
  skeleton,
  children,
}: SectionStateProps) {
  if (status === "loading") {
    return (
      <div role="status" aria-label={`Loading ${label}`}>
        {skeleton ?? (
          <div className="space-y-3">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-32 w-full" />
          </div>
        )}
      </div>
    );
  }

  if (status === "unavailable") {
    return (
      <p data-testid="section-unavailable" className="text-sm text-[var(--ui-text-muted)]">
        {unavailableText(reason)}
      </p>
    );
  }

  if (status === "error") {
    return (
      <div
        role="alert"
        className="rounded-xl border border-[var(--neg-border)] bg-[var(--neg-surface)] p-4 text-sm text-[var(--neg-text)] space-y-2"
      >
        <p className="font-medium">{`Couldn't load ${label}.`}</p>
        <p className="text-[var(--ui-text-muted)]">
          This section failed to load, but the rest of the page is unaffected.
        </p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="rounded px-2.5 py-1 text-xs font-semibold bg-[var(--ui-card)] text-[var(--ui-text)] hover:opacity-90 transition-opacity"
          >
            Retry
          </button>
        )}
      </div>
    );
  }

  return <>{children}</>;
}
