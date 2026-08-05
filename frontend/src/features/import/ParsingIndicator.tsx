import styles from "./ParsingIndicator.module.css";

export function ParsingIndicator() {
  return (
    <div className={styles.container} role="status">
      <div className={styles.spinner} />
      <p>Parsing your CAS...</p>
    </div>
  );
}
