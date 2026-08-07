import { useState } from "react";
import styles from "./FundSignal.module.css";

export interface FundSignalProps {
  /** Return value percentage as a number or string e.g. 14.5 or "-3.2" */
  returnPercentage: number | string;
  /** Period e.g. "1Y", "30D", "90D" */
  period?: string;
  /** Optional sparkline data points array */
  sparklineData?: number[];
  /** Size variant */
  size?: "sm" | "md" | "lg";
  /** Optional scheme name for accessibility */
  schemeName?: string;
}

export function FundSignal({
  returnPercentage,
  period = "1Y",
  sparklineData = [],
  size = "sm",
  schemeName,
}: FundSignalProps) {
  const [expanded, setExpanded] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState(period);

  const numericReturn =
    typeof returnPercentage === "string"
      ? parseFloat(returnPercentage)
      : returnPercentage;

  const isPositive = !isNaN(numericReturn) && numericReturn >= 0;
  const absReturn = isNaN(numericReturn) ? 0 : Math.abs(numericReturn);

  // Arc calculation: radial arc in top 270 deg (0.75 of full circle)
  // Fill fraction capped between 10% and 100% for clear legibility
  const fillRatio = Math.min(Math.max(absReturn / 30, 0.15), 1);
  const strokeDasharray = 100;
  const strokeDashoffset = strokeDasharray * (1 - fillRatio);

  // Fallback sparkline if none provided
  const points = sparklineData.length >= 2
    ? sparklineData
    : isPositive
    ? [10, 12, 11, 15, 14, 18, 20]
    : [20, 18, 16, 17, 13, 12, 10];

  const minVal = Math.min(...points);
  const maxVal = Math.max(...points);
  const range = maxVal - minVal || 1;

  const sparklineSVGPoints = points
    .map((val, idx) => {
      const x = (idx / (points.length - 1)) * 100;
      const y = 35 - ((val - minVal) / range) * 30;
      return `${x},${y}`;
    })
    .join(" ");

  const colorClass = isPositive ? styles.positive : styles.negative;
  const ariaLabel = `${schemeName ? schemeName + " " : ""}Fund Signal: ${
    isPositive ? "gain" : "loss"
  } of ${absReturn.toFixed(1)}% over ${selectedPeriod}`;

  return (
    <div
      className={`${styles.container} ${styles[size]} ${expanded ? styles.isExpanded : ""}`}
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      onClick={() => setExpanded(!expanded)}
      tabIndex={0}
      role="region"
      aria-label={ariaLabel}
    >
      <div className={styles.arcWrapper}>
        <svg
          viewBox="0 0 36 36"
          className={`${styles.arcSvg} ${colorClass}`}
          aria-hidden="true"
        >
          {/* Track arc */}
          <path
            className={styles.arcTrack}
            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            strokeDasharray="75, 100"
            strokeDashoffset="-12.5"
          />
          {/* Filled arc using signature arc geometry */}
          <path
            className={styles.arcFill}
            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            strokeDasharray={`${strokeDasharray * 0.75 * fillRatio}, 100`}
            strokeDashoffset="-12.5"
          />
        </svg>
        <span className={`${styles.signalIcon} ${colorClass}`} aria-hidden="true">
          {isPositive ? "↑" : "↓"}
        </span>
      </div>

      {expanded && (
        <div className={styles.expandedPopout}>
          <div className={styles.popoutHeader}>
            <span className={styles.popoutTitle}>Trend ({selectedPeriod})</span>
            <div className={styles.periodToggles}>
              {["30D", "90D", "1Y"].map((p) => (
                <button
                  key={p}
                  className={`${styles.periodBtn} ${
                    selectedPeriod === p ? styles.periodActive : ""
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedPeriod(p);
                  }}
                  type="button"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
          <div className={styles.sparklineWrapper}>
            <svg viewBox="0 0 100 40" className={styles.sparklineSvg}>
              <polyline
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={sparklineSVGPoints}
                className={colorClass}
              />
            </svg>
          </div>
          <div className={`${styles.returnBadge} ${colorClass}`}>
            <span>{isPositive ? "▲" : "▼"}</span>
            <span className="type-data">{isPositive ? "+" : ""}{numericReturn.toFixed(2)}%</span>
          </div>
        </div>
      )}
    </div>
  );
}
