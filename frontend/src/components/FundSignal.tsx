import { useId, useMemo, useState } from "react";
import { area as d3Area, curveMonotoneX, line as d3Line } from "d3-shape";
import styles from "./FundSignal.module.css";

export interface FundSignalProps {
  /** Return value percentage as a number or string e.g. 14.5 or "-3.2" */
  returnPercentage: number | string;
  /** Period label used only for the accessible description, e.g. "1Y" */
  period?: string;
  /** Size variant */
  size?: "sm" | "md" | "lg";
  /** Optional scheme name for accessibility */
  schemeName?: string;
}

/** Static gain/loss arc + direction icon — no hover/expand behavior. The
 * interactive 30D/90D/1Y trend graph this used to expand into on hover now
 * lives in the Fund Details modal instead; see FundSignalGraph below. */
export function FundSignal({
  returnPercentage,
  period = "1Y",
  size = "sm",
  schemeName,
}: FundSignalProps) {
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

  const colorClass = isPositive ? styles.positive : styles.negative;
  const ariaLabel = `${schemeName ? schemeName + " " : ""}Fund Signal: ${
    isPositive ? "gain" : "loss"
  } of ${absReturn.toFixed(1)}% over ${period}`;

  return (
    <div
      className={`${styles.container} ${styles[size]}`}
      role="img"
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
    </div>
  );
}

export interface FundSignalGraphProps {
  /** Return value percentage as a number or string e.g. 14.5 or "-3.2" */
  returnPercentage: number | string;
  /** Initially-selected period e.g. "1Y", "30D", "90D" */
  period?: string;
  /** Optional sparkline data points array */
  sparklineData?: number[];
}

const CHART_WIDTH = 100;
const CHART_HEIGHT = 44;
const CHART_PAD_X = 2;
const CHART_PAD_Y = 4;

/** The 30D/90D/1Y trend graph that used to live inside FundSignal's hover
 * popout — same data source and toggle behavior, now rendered inline
 * (e.g. inside the Fund Details modal) instead of on hover. */
export function FundSignalGraph({
  returnPercentage,
  period = "1Y",
  sparklineData = [],
}: FundSignalGraphProps) {
  const [selectedPeriod, setSelectedPeriod] = useState(period);
  const gradientId = useId();

  const numericReturn =
    typeof returnPercentage === "string"
      ? parseFloat(returnPercentage)
      : returnPercentage;

  const isPositive = !isNaN(numericReturn) && numericReturn >= 0;

  // Fallback sparkline if none provided
  const points = sparklineData.length >= 2
    ? sparklineData
    : isPositive
    ? [10, 12, 11, 15, 14, 18, 20]
    : [20, 18, 16, 17, 13, 12, 10];

  const colorClass = isPositive ? styles.positive : styles.negative;

  // Same points, smoothed with a monotone curve (no straight-segment
  // polyline) and an area fill beneath — built with d3-shape, already a
  // project dependency (same one the Bklit-derived pie chart uses), rather
  // than adding a new chart library.
  const { linePath, areaPath } = useMemo(() => {
    const minVal = Math.min(...points);
    const maxVal = Math.max(...points);
    const range = maxVal - minVal || 1;
    const plotHeight = CHART_HEIGHT - CHART_PAD_Y * 2;
    const baselineY = CHART_HEIGHT - CHART_PAD_Y;

    const coords = points.map((val, idx) => ({
      x: CHART_PAD_X + (idx / (points.length - 1)) * (CHART_WIDTH - CHART_PAD_X * 2),
      y: baselineY - ((val - minVal) / range) * plotHeight,
    }));

    const lineGenerator = d3Line<{ x: number; y: number }>()
      .x((d) => d.x)
      .y((d) => d.y)
      .curve(curveMonotoneX);

    const areaGenerator = d3Area<{ x: number; y: number }>()
      .x((d) => d.x)
      .y0(baselineY)
      .y1((d) => d.y)
      .curve(curveMonotoneX);

    return {
      linePath: lineGenerator(coords) ?? "",
      areaPath: areaGenerator(coords) ?? "",
    };
  }, [points]);

  return (
    <div className={styles.inlineGraph}>
      <div className={styles.popoutHeader}>
        <span className={styles.popoutTitle}>Trend ({selectedPeriod})</span>
        <div className={styles.periodToggles}>
          {["30D", "90D", "1Y"].map((p) => (
            <button
              key={p}
              className={`${styles.periodBtn} ${
                selectedPeriod === p ? styles.periodActive : ""
              }`}
              onClick={() => setSelectedPeriod(p)}
              type="button"
            >
              {p}
            </button>
          ))}
        </div>
      </div>
      <div className={styles.sparklineWrapper}>
        <svg
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          className={`${styles.sparklineSvg} ${colorClass}`}
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.22" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={areaPath} fill={`url(#${gradientId})`} stroke="none" />
          <path
            d={linePath}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <div className={`${styles.returnBadge} ${colorClass}`}>
        <span>{isPositive ? "▲" : "▼"}</span>
        <span className="type-data">{isPositive ? "+" : ""}{numericReturn.toFixed(2)}%</span>
      </div>
    </div>
  );
}
