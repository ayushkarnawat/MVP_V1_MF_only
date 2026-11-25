import type { JSX } from "react";
import { AlertCircle } from "lucide-react";
import { SummaryBar } from "./SummaryBar";
import styles from "./summaryBar.module.css";

export interface SummaryBarSkeletonProps {
  ariaLabel: string;
}

export function SummaryBarSkeleton({
  ariaLabel,
}: SummaryBarSkeletonProps): JSX.Element {
  return <SummaryBar loading ariaLabel={ariaLabel} />;
}

export interface SummaryErrorCardProps {
  title: string;
  body: string;
  onRetry: () => void;
}

export function SummaryErrorCard({
  title,
  body,
  onRetry,
}: SummaryErrorCardProps): JSX.Element {
  return (
    <div className={styles.err}>
      <span className={styles.errIcon}>
        <AlertCircle aria-hidden="true" className="h-5 w-5" />
      </span>
      <div>
        <h4 className="text-base font-semibold text-[var(--ui-text)]">
          {title}
        </h4>
        <p className="mt-1 text-sm text-[var(--ui-text-muted)]">{body}</p>
        <button
          type="button"
          data-clickable=""
          data-effect="retry"
          onClick={onRetry}
          className="mt-4 inline-flex items-center justify-center rounded-full border border-[var(--ui-divider)] bg-[var(--ui-elevated)] px-4 py-1.5 text-sm font-semibold text-[var(--ui-text)] hover:bg-[var(--ui-card)] cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ui-focus)]"
        >
          Retry
        </button>
      </div>
    </div>
  );
}
