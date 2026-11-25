import type { JSX } from "react";
import styles from "./summaryBar.module.css";

export interface SummarySwitchProps {
  ariaLabel: string;
  options: readonly string[];
  value: string;
  onChange: (v: string) => void;
}

export function SummarySwitch({
  ariaLabel,
  options,
  value,
  onChange,
}: SummarySwitchProps): JSX.Element {
  return (
    <div role="group" aria-label={ariaLabel} className={styles.switch}>
      {options.map((o) => (
        <button
          key={o}
          type="button"
          data-clickable=""
          aria-pressed={value === o}
          onClick={() => onChange(o)}
          className={
            value === o
              ? `${styles.switchBtn} ${styles.switchOn}`
              : styles.switchBtn
          }
        >
          {o}
        </button>
      ))}
    </div>
  );
}
