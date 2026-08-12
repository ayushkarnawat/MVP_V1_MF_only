import type { ImportConfirmResponse } from "./types";
import { Check } from "lucide-react";
import styles from "./ImportConfirmed.module.css";

interface ImportConfirmedProps {
  result: ImportConfirmResponse;
  onImportAnother: () => void;
  ctaLabel?: string;
}

export function ImportConfirmed({
  result,
  onImportAnother,
  ctaLabel = "Import another CAS",
}: ImportConfirmedProps) {
  const addedText = `${result.added} new transaction${result.added === 1 ? "" : "s"} added`;
  const skippedText =
    result.skipped > 0 ? `, ${result.skipped} duplicate${result.skipped === 1 ? "" : "s"} skipped` : "";

  return (
    <div className={styles.container}>
      <div className={styles.successBadge} aria-hidden="true">
        <Check className="h-7 w-7 stroke-[2.5]" />
      </div>
      <h1 className={styles.title}>Import complete</h1>
      <p className={`type-body ${styles.resultText}`}>{`${addedText}${skippedText}.`}</p>
      <button className={styles.actionBtn} type="button" onClick={onImportAnother}>
        {ctaLabel}
      </button>
    </div>
  );
}
