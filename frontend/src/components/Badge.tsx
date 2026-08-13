import type { ReactNode } from "react";
import styles from "./Badge.module.css";

export type BadgeVariant = "positive" | "neutral" | "warning";

interface BadgeProps {
  variant: BadgeVariant;
  children: ReactNode;
}

export function Badge({ variant, children }: BadgeProps) {
  return <span className={`${styles.badge} ${styles[variant]}`}>{children}</span>;
}
