import styles from "./EmptyState.module.css";
import { Button } from "./Button";

export interface EmptyStateProps {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: string;
}

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
  icon = "📈",
}: EmptyStateProps) {
  return (
    <div className={styles.container}>
      <div className={styles.iconWrapper}>{icon}</div>
      <h3 className={`type-h2 ${styles.title}`}>{title}</h3>
      <p className={`type-body ${styles.description}`}>{description}</p>
      {actionLabel && onAction && (
        <div className={styles.actionWrapper}>
          <Button variant="primary" onClick={onAction}>
            {actionLabel}
          </Button>
        </div>
      )}
    </div>
  );
}
