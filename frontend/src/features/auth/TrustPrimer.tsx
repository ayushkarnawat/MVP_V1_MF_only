import { Button } from "../../components/Button";
import styles from "./onboarding.module.css";

interface TrustPrimerProps {
  onContinue: () => void;
}

export function TrustPrimer({ onContinue }: TrustPrimerProps) {
  return (
    <div className={styles.container}>
      <div className={styles.iconHeader}>🛡️</div>
      <h1 className={styles.title}>Your privacy & data safety come first</h1>
      <p className={styles.subtitle}>
        Unifolio is built with strict read-only financial privacy by design.
      </p>

      <div className={styles.trustCardGroup}>
        <div className={styles.trustPoint}>
          <span className={styles.trustCheck}>✓</span>
          <div>
            <strong className={styles.trustPointTitle}>Read-only portfolio access</strong>
            <p className={styles.trustPointDesc}>
              Unifolio only parses holdings and transactions to show analytics. Nothing is ever bought, sold, or transferred.
            </p>
          </div>
        </div>

        <div className={styles.trustPoint}>
          <span className={styles.trustCheck}>✓</span>
          <div>
            <strong className={styles.trustPointTitle}>No raw CAS PDF storage</strong>
            <p className={styles.trustPointDesc}>
              Statements are processed in-memory. Your raw CAS PDF and PAN are never permanently stored.
            </p>
          </div>
        </div>
      </div>

      <div className={styles.actionsRight}>
        <Button variant="primary" size="lg" onClick={onContinue}>
          Continue
        </Button>
      </div>
    </div>
  );
}
