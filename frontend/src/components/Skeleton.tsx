import styles from "./Skeleton.module.css";

export interface SkeletonProps {
  width?: string;
  height?: string;
  borderRadius?: string;
  className?: string;
}

export function Skeleton({
  width = "100%",
  height = "20px",
  borderRadius = "var(--radius-sm)",
  className = "",
}: SkeletonProps) {
  return (
    <div
      className={`${styles.skeleton} ${className}`}
      style={{ width, height, borderRadius }}
    />
  );
}

export function HoldingsTableSkeleton() {
  return (
    <div className={styles.tableSkeleton}>
      {[1, 2, 3, 4, 5].map((idx) => (
        <div key={idx} className={styles.rowSkeleton}>
          <Skeleton width="32px" height="32px" borderRadius="50%" />
          <div className={styles.schemeSkeleton}>
            <Skeleton width="60%" height="16px" />
            <Skeleton width="30%" height="12px" />
          </div>
          <Skeleton width="80px" height="24px" />
          <Skeleton width="100px" height="16px" />
        </div>
      ))}
    </div>
  );
}
