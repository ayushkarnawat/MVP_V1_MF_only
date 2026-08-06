import styles from "./onboarding.module.css";
import type { FamilyUpload } from "./FamilyCasUpload";

interface ParseQueueProps {
  queue: FamilyUpload[];
  onParseFiles: () => void;
}

export function ParseQueue({ queue, onParseFiles }: ParseQueueProps) {
  return (
    <div className={styles.container}>
      <h1>Files ready to import</h1>
      <ul>
        {queue.map((item) => (
          <li key={item.memberId}>{`${item.file.name} (${item.memberName})`}</li>
        ))}
      </ul>
      <button type="button" disabled={queue.length === 0} onClick={onParseFiles}>
        Parse Files
      </button>
    </div>
  );
}
