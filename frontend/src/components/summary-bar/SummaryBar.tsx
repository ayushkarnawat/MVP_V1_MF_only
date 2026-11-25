import type { JSX, ReactNode } from "react";
import styles from "./summaryBar.module.css";

export interface SummaryBarProps {
  ariaLabel: string;
  lead: ReactNode;
  cells: [ReactNode, ReactNode, ReactNode, ReactNode];
  footerLeft?: ReactNode;
  footerRight?: ReactNode;
  className?: string;
}

export function SummaryBar({
  ariaLabel,
  lead,
  cells,
  footerLeft,
  footerRight,
  className,
}: SummaryBarProps): JSX.Element {
  return (
    <section
      aria-label={ariaLabel}
      data-testid="summary-bar"
      className={className ? `${styles.bar} ${className}` : styles.bar}
    >
      {lead}
      <div className={styles.panel}>
        <div className={styles.cells}>{cells}</div>
        <div className={styles.foot}>
          <div className={styles.footLeft}>{footerLeft}</div>
          <div className={styles.footRight}>{footerRight}</div>
        </div>
      </div>
    </section>
  );
}
