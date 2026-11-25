import type { JSX, ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import styles from "./summaryBar.module.css";

export type SummaryBarProps =
  | {
      ariaLabel: string;
      loading: true;
      lead?: ReactNode;
      cells?: [ReactNode, ReactNode, ReactNode, ReactNode];
      footerLeft?: ReactNode;
      footerRight?: ReactNode;
      className?: string;
    }
  | {
      ariaLabel: string;
      loading?: false;
      lead: ReactNode;
      cells: [ReactNode, ReactNode, ReactNode, ReactNode];
      footerLeft?: ReactNode;
      footerRight?: ReactNode;
      className?: string;
    };

export function SummaryBar({
  ariaLabel,
  loading = false,
  lead,
  cells,
  footerLeft,
  footerRight,
  className,
}: SummaryBarProps): JSX.Element {
  return (
    <section
      role={loading ? "status" : undefined}
      aria-label={ariaLabel}
      data-testid={loading ? undefined : "summary-bar"}
      className={className ? `${styles.bar} ${className}` : styles.bar}
    >
      {loading ? (
        <>
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
        </>
      ) : (
        <>
          {lead}
          <div className={styles.panel}>
            <div className={styles.cells}>{cells}</div>
            <div className={styles.foot}>
              <div className={styles.footLeft}>{footerLeft}</div>
              <div className={styles.footRight}>{footerRight}</div>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
