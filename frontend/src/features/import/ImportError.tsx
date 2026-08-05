import type { ParseErrorPayload } from "./types";
import styles from "./ImportError.module.css";

interface ImportErrorProps {
  error: ParseErrorPayload;
  onRetry: () => void;
}

export function ImportError({ error, onRetry }: ImportErrorProps) {
  return (
    <div className={styles.container}>
      <h1>Import failed</h1>
      <p>{error.message}</p>
      <button type="button" onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}
