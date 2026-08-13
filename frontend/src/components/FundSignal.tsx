import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  const containerRef = useRef<HTMLDivElement>(null);
  const popoutRef = useRef<HTMLDivElement>(null);
  const [popoutPosition, setPopoutPosition] = useState<{ top: number; left: number } | null>(null);
  const [popoutShift, setPopoutShift] = useState(0);

  // No Radix/shadcn Popover is used here (this is a bespoke SVG widget), so
  // there's no built-in collision detection to enable. The popout is
  // portaled to document.body — Holdings table ancestors use
  // overflow-hidden/overflow-x-auto for scroll/rounded-corner clipping,
  // which clips any in-place descendant regardless of its own position or
  // transform, no matter how that position is computed.
  useLayoutEffect(() => {
    if (!expanded || !containerRef.current) {
      setPopoutPosition(null);
      setPopoutShift(0);
      return;
    }
    setPopoutShift(0);
    const anchorRect = containerRef.current.getBoundingClientRect();
    setPopoutPosition({ top: anchorRect.bottom, left: anchorRect.left + anchorRect.width / 2 });
  }, [expanded]);

  // Once positioned relative to the anchor, measure the popout's actual
  // on-screen rect (now unaffected by the table's overflow, since it's in
  // document.body) and correct for viewport-edge overflow — computed from
  // real measured overflow, never a guessed fixed offset.
  useLayoutEffect(() => {
    if (!expanded || !popoutPosition || !popoutRef.current) return;

    const recalculate = () => {
      const popout = popoutRef.current;
      if (!popout) return;
      const rect = popout.getBoundingClientRect();
      const margin = 8;
      if (rect.left < margin) {
        setPopoutShift((prev) => prev + (margin - rect.left));
      } else if (rect.right > window.innerWidth - margin) {
        setPopoutShift((prev) => prev + (window.innerWidth - margin - rect.right));
      }
    };

    recalculate();
    window.addEventListener("resize", recalculate);
    return () => window.removeEventListener("resize", recalculate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, popoutPosition]);

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
      ref={containerRef}
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

      {expanded && popoutPosition && createPortal(
        <div
          ref={popoutRef}
          className={styles.expandedPopout}
          style={{
            top: popoutPosition.top,
            left: popoutPosition.left,
            "--popout-shift": `${popoutShift}px`,
          } as React.CSSProperties}
        >
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
        </div>,
        document.body
      )}
    </div>
  );
}
