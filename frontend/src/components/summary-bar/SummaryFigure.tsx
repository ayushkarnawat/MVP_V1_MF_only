import type { JSX } from "react";
import { splitCurrency } from "@/lib/summaryFigure";
import styles from "./summaryBar.module.css";

export interface SummaryFigureProps {
  text: string;
  tone?: "default" | "pos" | "neg";
  testId: string;
  direction?: "up" | "down" | "flat";
}

export function SummaryFigure({
  text,
  tone = "default",
  testId,
  direction,
}: SummaryFigureProps): JSX.Element {
  const { sign, currency, digits } = splitCurrency(text);
  const toneClass =
    tone === "pos" ? styles.pos : tone === "neg" ? styles.neg : "";

  return (
    <span
      data-testid={testId}
      data-row="figure"
      data-direction={direction}
      className={toneClass ? `${styles.figure} ${toneClass}` : styles.figure}
    >
      {sign}
      {currency !== "" && <span className={styles.currency}>{currency}</span>}
      {digits}
    </span>
  );
}
