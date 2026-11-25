import type { JSX } from "react";
import { AlertCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import styles from "./summaryBar.module.css";

export interface SummaryBarSkeletonProps {
  ariaLabel: string;
}

export function SummaryBarSkeleton({
  ariaLabel,
}: SummaryBarSkeletonProps): JSX.Element {
  return (
    <section role="status" aria-label={ariaLabel} className={styles.bar}>
      <div className={styles.lead}>
        <div className={styles.leadHead}>
          <Skeleton className="h-4 w-28" />
        </div>
        <div className={styles.fig}>
          <Skeleton data-row="figure" className="h-8 w-36" />
        </div>
        <div className={styles.caption}>
          <Skeleton className="h-4 w-24" />
        </div>
        <div className={styles.leadFoot} />
      </div>
      <div className={styles.panel}>
        <div className={styles.cells}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={styles.cell}>
              <div className={styles.head}>
                <Skeleton className="h-4 w-24" />
              </div>
              <div className={styles.fig}>
                <Skeleton data-row="figure" className="h-8 w-28" />
              </div>
              <div className={styles.caption} />
            </div>
          ))}
        </div>
        <div className={styles.foot} />
      </div>
    </section>
  );
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
