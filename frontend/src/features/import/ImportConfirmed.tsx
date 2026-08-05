import type { ImportConfirmResponse } from "./types";
import styles from "./ImportConfirmed.module.css";

interface ImportConfirmedProps {
  result: ImportConfirmResponse;
  onImportAnother: () => void;
}

export function ImportConfirmed({ result, onImportAnother }: ImportConfirmedProps) {
  const addedText = `${result.added} new transaction${result.added === 1 ? "" : "s"} added`;
  const skippedText =
    result.skipped > 0 ? `, ${result.skipped} duplicate${result.skipped === 1 ? "" : "s"} skipped` : "";

  return (
    <div className={styles.container}>
      <h1>Import complete</h1>
      <p>{`${addedText}${skippedText}.`}</p>
      <button type="button" onClick={onImportAnother}>
        Import another CAS
      </button>
    </div>
  );
}
