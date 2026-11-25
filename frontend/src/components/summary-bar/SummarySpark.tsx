import { useId, type JSX } from "react";
import styles from "./summaryBar.module.css";

export interface SummarySparkProps {
  points: string;
  trend: "up" | "down" | "flat";
  testId?: string;
  ariaLabel?: string;
}

export function SummarySpark({
  points,
  trend,
  testId,
  ariaLabel,
}: SummarySparkProps): JSX.Element {
  const gradId = useId();
  const stroke =
    trend === "up"
      ? "var(--pos)"
      : trend === "down"
        ? "var(--neg)"
        : "var(--ui-text-muted)";

  const lastPair = points.trim().split(/\s+/).at(-1)?.split(",") ?? [];
  const lastX = lastPair[0];
  const lastY = lastPair[1];

  return (
    <svg
      data-testid={testId ?? "sparkline"}
      viewBox="0 0 72 26"
      preserveAspectRatio="none"
      role="img"
      aria-label={ariaLabel}
      className={`h-[22px] w-[60px] shrink-0 overflow-visible ${styles.spark}`}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.22" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon
        data-deco="area"
        points={`${points} 72,26 0,26`}
        fill={`url(#${gradId})`}
        stroke="none"
      />
      <polyline
        points={points}
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        stroke={stroke}
      />
      {lastX !== undefined && lastY !== undefined && (
        <circle
          data-deco="dot"
          cx={lastX}
          cy={lastY}
          r="2.4"
          fill={stroke}
        />
      )}
    </svg>
  );
}
