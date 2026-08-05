import styles from "./Badge.module.css";

export type BadgeVariant = "positive" | "neutral" | "warning";

interface BadgeProps {
  variant: BadgeVariant;
  children: string;
}

export function Badge({ variant, children }: BadgeProps) {
  return <span className={`${styles.badge} ${styles[variant]}`}>{children}</span>;
}
