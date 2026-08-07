import { Button } from "../../components/Button";
import styles from "./onboarding.module.css";
import type { FamilyUpload } from "./FamilyCasUpload";

interface ParseQueueProps {
  queue: FamilyUpload[];
  onParseFiles: () => void;
}

export function ParseQueue({ queue, onParseFiles }: ParseQueueProps) {
  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Files ready to import</h1>
      <p className={styles.subtitle}>
        {queue.length} statement{queue.length === 1 ? "" : "s"} queued for batch processing.
      </p>

      <div className={styles.trustCardGroup}>
        {queue.map((item) => (
          <div key={item.memberId} className={styles.trustPoint}>
            <span className={styles.choiceIcon}>📄</span>
            <div className={styles.choiceText}>
              <strong className={styles.choiceTitle}>{item.file.name}</strong>
              <span className={styles.choiceDesc}>Owner: {item.memberName}</span>
            </div>
          </div>
        ))}
      </div>

      <div className={styles.actionsRight}>
        <Button
          variant="primary"
          size="lg"
          type="button"
          disabled={queue.length === 0}
          onClick={onParseFiles}
        >
          Parse Files
        </Button>
      </div>
    </div>
  );
}
