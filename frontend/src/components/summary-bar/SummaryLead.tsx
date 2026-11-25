import type { JSX, ReactNode } from "react";
import styles from "./summaryBar.module.css";

export interface SummaryLeadProps {
  label: ReactNode;
  info?: ReactNode;
  icon?: ReactNode;
  figure: ReactNode;
  trend?: ReactNode;
  caption?: ReactNode;
  footer?: ReactNode;
  testId: string;
  ariaLabel?: string;
}

export function SummaryLead({
  label,
  info,
  icon,
  figure,
  trend,
  caption,
  footer,
  testId,
  ariaLabel,
}: SummaryLeadProps): JSX.Element {
  return (
    <div
      role="group"
      aria-label={ariaLabel ?? (typeof label === "string" ? label : undefined)}
      data-testid={testId}
      className={styles.lead}
    >
      <div className={styles.leadHead}>
        {icon !== undefined && icon !== null && (
          <span className={styles.iconTile}>{icon}</span>
        )}
        <span className={styles.label}>{label}</span>
        {info}
      </div>
      <div className={styles.fig}>
        {figure}
        {trend}
      </div>
      {caption !== undefined && caption !== null && (
        <div className={styles.caption}>{caption}</div>
      )}
      <div className={styles.leadFoot}>{footer}</div>
    </div>
  );
}
