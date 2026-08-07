import { useState } from "react";
import styles from "./AllocationDonut.module.css";

export interface AllocationItem {
  label: string;
  current_value: string;
  percentage: number;
}

export interface AllocationDonutProps {
  data: AllocationItem[];
  totalValue?: string;
  title?: string;
}

const PALETTE = [
  "#22C55E", // Accent green
  "#3B82F6", // Blue
  "#8B5CF6", // Purple
  "#F59E0B", // Amber
  "#06B6D4", // Cyan
  "#EC4899", // Pink
  "#64748B", // Slate
];

export function AllocationDonut({ data, totalValue, title }: AllocationDonutProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  if (!data || data.length === 0) {
    return (
      <div className={styles.emptyContainer}>
        <p className="type-caption">No allocation data available</p>
      </div>
    );
  }

  // Calculate cumulative percentages for SVG donut strokeDashoffset
  let cumulative = 0;
  const segments = data.map((item, idx) => {
    const startAngle = cumulative;
    const pct = Math.max(0, item.percentage || 0);
    cumulative += pct;
    const color = PALETTE[idx % PALETTE.length];
    return {
      ...item,
      color,
      pct,
      startAngle,
    };
  });

  const activeSegment = activeIndex !== null ? segments[activeIndex] : null;

  return (
    <div className={styles.container}>
      {title && <h3 className={`type-h2 ${styles.title}`}>{title}</h3>}
      <div className={styles.chartWrapper}>
        <div className={styles.svgWrapper}>
          <svg viewBox="0 0 100 100" className={styles.donutSvg}>
            <circle
              cx="50"
              cy="50"
              r="38"
              className={styles.bgCircle}
            />
            {segments.map((seg, idx) => {
              const strokeDasharray = `${seg.pct * 2.387} ${238.7 - seg.pct * 2.387}`;
              const strokeDashoffset = -seg.startAngle * 2.387;
              return (
                <circle
                  key={seg.label + idx}
                  cx="50"
                  cy="50"
                  r="38"
                  fill="none"
                  stroke={seg.color}
                  strokeWidth={activeIndex === idx ? "11" : "8"}
                  strokeDasharray={strokeDasharray}
                  strokeDashoffset={strokeDashoffset}
                  className={styles.segment}
                  onMouseEnter={() => setActiveIndex(idx)}
                  onMouseLeave={() => setActiveIndex(null)}
                />
              );
            })}
          </svg>
          <div className={styles.centerText}>
            <span className={styles.centerLabel}>
              {activeSegment ? activeSegment.label : "Total Value"}
            </span>
            <span className={`type-data-large ${styles.centerVal}`}>
              {activeSegment
                ? `₹${formatIndianCurrency(activeSegment.current_value)}`
                : totalValue
                ? `₹${formatIndianCurrency(totalValue)}`
                : "100%"}
            </span>
            {activeSegment && (
              <span className={`type-caption ${styles.centerPct}`}>
                {activeSegment.pct.toFixed(1)}%
              </span>
            )}
          </div>
        </div>

        <div className={styles.legend}>
          {segments.map((seg, idx) => (
            <div
              key={seg.label + idx}
              className={`${styles.legendItem} ${
                activeIndex === idx ? styles.legendActive : ""
              }`}
              onMouseEnter={() => setActiveIndex(idx)}
              onMouseLeave={() => setActiveIndex(null)}
            >
              <span
                className={styles.legendDot}
                style={{ backgroundColor: seg.color }}
              />
              <span className={`type-body-medium ${styles.legendLabel}`}>
                {seg.label}
              </span>
              <span className={`type-data ${styles.legendPct}`}>
                {seg.pct.toFixed(1)}%
              </span>
              <span className={`type-caption ${styles.legendAmt}`}>
                ₹{formatIndianCurrency(seg.current_value)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function formatIndianCurrency(valStr: string | number): string {
  const num = typeof valStr === "string" ? parseFloat(valStr) : valStr;
  if (isNaN(num)) return "0";
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 0,
  }).format(num);
}
