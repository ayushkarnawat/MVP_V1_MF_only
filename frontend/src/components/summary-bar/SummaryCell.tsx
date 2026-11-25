import type { JSX, ReactNode } from "react";
import styles from "./summaryBar.module.css";

export interface SummaryCellProps {
  label: ReactNode;
  info?: ReactNode;
  control?: ReactNode;
  figure?: ReactNode;
  chip?: ReactNode;
  caption?: ReactNode;
  testId: string;
  wash?: "pos" | "neg";
  ariaLabel?: string;
  children?: ReactNode;
}

export function SummaryCell({
  label,
  info,
  control,
  figure,
  chip,
  caption,
  testId,
  wash,
  ariaLabel,
  children,
}: SummaryCellProps): JSX.Element {
  const washClass =
    wash === "pos" ? styles.washPos : wash === "neg" ? styles.washNeg : "";

  return (
    <div
      role="group"
      aria-label={ariaLabel ?? (typeof label === "string" ? label : undefined)}
      data-testid={testId}
      className={washClass ? `${styles.cell} ${washClass}` : styles.cell}
    >
      {children !== undefined ? (
        children
      ) : (
        <>
          <div className={styles.head}>
            <span className={styles.label}>
              {label}
              {info}
            </span>
            {control}
          </div>
          <div className={styles.fig}>
            {figure}
            {chip}
          </div>
          {caption !== undefined && caption !== null && (
            <div className={styles.caption}>{caption}</div>
          )}
        </>
      )}
    </div>
  );
}
