import { useEffect, useId, useMemo, useState } from "react";
import { area as d3Area, curveMonotoneX, line as d3Line } from "d3-shape";
import { Info } from "lucide-react";
import { getFundNavHistory } from "../features/dashboard/api";
import type {
  NavHistoryPeriod,
  NavHistoryPoint,
  SchemeNavHistoryResponse,
} from "../features/dashboard/types";
import { Skeleton } from "./Skeleton";
import styles from "./FundSignal.module.css";

export interface FundSignalProps {
  returnPercentage: number | string;
  period?: string;
  size?: "sm" | "md" | "lg";
  schemeName?: string;
}

export function FundSignal({
  returnPercentage,
  period = "1Y",
  size = "sm",
  schemeName,
}: FundSignalProps) {
  const numericReturn = typeof returnPercentage === "string" ? parseFloat(returnPercentage) : returnPercentage;
  const isPositive = !isNaN(numericReturn) && numericReturn >= 0;
  const absReturn = isNaN(numericReturn) ? 0 : Math.abs(numericReturn);
  const fillRatio = Math.min(Math.max(absReturn / 30, 0.15), 1);
  const colorClass = isPositive ? styles.positive : styles.negative;
  const ariaLabel = `${schemeName ? schemeName + " " : ""}Fund Signal: ${
    isPositive ? "gain" : "loss"
  } of ${absReturn.toFixed(1)}% over ${period}`;

  return (
    <div className={`${styles.container} ${styles[size]}`} role="img" aria-label={ariaLabel}>
      <div className={styles.arcWrapper}>
        <svg viewBox="0 0 36 36" className={`${styles.arcSvg} ${colorClass}`} aria-hidden="true">
          <path className={styles.arcTrack} d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" strokeDasharray="75, 100" strokeDashoffset="-12.5" />
          <path className={styles.arcFill} d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" strokeDasharray={`${100 * 0.75 * fillRatio}, 100`} strokeDashoffset="-12.5" />
        </svg>
        <span className={`${styles.signalIcon} ${colorClass}`} aria-hidden="true">{isPositive ? "↑" : "↓"}</span>
      </div>
    </div>
  );
}

export interface FundSignalGraphProps {
  schemeId: string;
  period?: NavHistoryPeriod;
}

const PERIODS: NavHistoryPeriod[] = ["1M", "1Y", "3Y", "5Y", "MAX"];
const CHART_WIDTH = 100;
const CHART_HEIGHT = 44;
const CHART_PAD_X = 2;
const CHART_PAD_Y = 4;

function isNegativeDecimal(value: string): boolean {
  return value.trim().startsWith("-") && !/^-(?:0+(?:\.0*)?|\.0+)$/.test(value.trim());
}

function formatPercent(value: string): string {
  const negative = isNegativeDecimal(value);
  const unsigned = value.trim().replace(/^[+-]/, "") || "0";
  const [whole = "0", fraction = ""] = unsigned.split(".");
  return `${negative ? "-" : Number(value) > 0 ? "+" : ""}${whole || "0"}.${fraction.padEnd(2, "0").slice(0, 2)}%`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${value}T00:00:00Z`),
  );
}

export function FundSignalGraph({ schemeId, period = "1Y" }: FundSignalGraphProps) {
  const [selectedPeriod, setSelectedPeriod] = useState<NavHistoryPeriod>(period);
  const [history, setHistory] = useState<SchemeNavHistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const gradientId = useId();

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setActiveIndex(null);

    getFundNavHistory(schemeId, selectedPeriod, controller.signal)
      .then((data) => {
        setHistory(data);
        setLoading(false);
      })
      .catch((err) => {
        if (err?.name === "AbortError") return;
        setError(err?.message || "Failed to load performance history");
        setLoading(false);
      });

    return () => controller.abort();
  }, [schemeId, selectedPeriod]);

  const points = history?.points ?? [];
  const values = useMemo(() => points.map((point) => Number(point.return_pct)), [points]);
  const coords = useMemo(() => {
    if (values.length === 0) return [];
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);
    const range = maxVal - minVal || 1;
    const plotHeight = CHART_HEIGHT - CHART_PAD_Y * 2;
    const baselineY = CHART_HEIGHT - CHART_PAD_Y;
    return values.map((value, index) => ({
      x: values.length === 1 ? CHART_WIDTH / 2 : CHART_PAD_X + (index / (values.length - 1)) * (CHART_WIDTH - CHART_PAD_X * 2),
      y: baselineY - ((value - minVal) / range) * plotHeight,
    }));
  }, [values]);

  const { linePath, areaPath } = useMemo(() => {
    const baselineY = CHART_HEIGHT - CHART_PAD_Y;
    const lineGenerator = d3Line<{ x: number; y: number }>().x((d) => d.x).y((d) => d.y).curve(curveMonotoneX);
    const areaGenerator = d3Area<{ x: number; y: number }>().x((d) => d.x).y0(baselineY).y1((d) => d.y).curve(curveMonotoneX);
    return { linePath: lineGenerator(coords) ?? "", areaPath: areaGenerator(coords) ?? "" };
  }, [coords]);

  const displayedIndex = activeIndex ?? points.length - 1;
  const displayedPoint: NavHistoryPoint | undefined = points[displayedIndex];
  const overallReturn = history?.overall_return_pct;
  const isPositive = overallReturn !== null && overallReturn !== undefined && !isNegativeDecimal(overallReturn);
  const colorClass = isPositive ? styles.positive : styles.negative;

  return (
    <div className={styles.inlineGraph}>
      <div className={styles.popoutHeader}>
        <div>
          <span className={styles.popoutTitle}>Trend ({selectedPeriod})</span>
          {displayedPoint && <p className={styles.pointReadout}>{formatDate(displayedPoint.date)}: {formatPercent(displayedPoint.return_pct)}</p>}
        </div>
        <div className={styles.periodToggles}>
          {PERIODS.map((item) => (
            <button key={item} className={`${styles.periodBtn} ${selectedPeriod === item ? styles.periodActive : ""}`} onClick={() => setSelectedPeriod(item)} type="button">
              {item}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className={styles.sparklineWrapper}><Skeleton height="96px" width="100%" /></div>
      ) : error ? (
        <div className={styles.errorBox}><p className="type-body">{error}</p></div>
      ) : points.length === 0 ? (
        <p className="type-body">No performance history available yet.</p>
      ) : (
        <>
          <div className={styles.sparklineWrapper}>
            <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} className={`${styles.sparklineSvg} ${colorClass}`} preserveAspectRatio="none">
              <defs><linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="currentColor" stopOpacity="0.22" /><stop offset="100%" stopColor="currentColor" stopOpacity="0" /></linearGradient></defs>
              <path d={areaPath} fill={`url(#${gradientId})`} stroke="none" />
              <path d={linePath} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              {coords.map((coord, index) => {
                const active = displayedIndex === index;
                const point = points[index];
                return <g key={`${point.date}-${index}`}>
                  {active && <><line className={styles.guideLine} x1={coord.x} y1={CHART_PAD_Y} x2={coord.x} y2={CHART_HEIGHT} /><circle className={styles.activePoint} cx={coord.x} cy={coord.y} r="2.2" /></>}
                  <circle className={styles.pointTarget} cx={coord.x} cy={coord.y} r="8" aria-label={`${formatDate(point.date)}: ${formatPercent(point.return_pct)}`} onMouseEnter={() => setActiveIndex(index)} onTouchStart={() => setActiveIndex(index)} />
                </g>;
              })}
            </svg>
          </div>
          {history?.clamped && <div className={styles.infoNote}><Info aria-hidden="true" size={14} /><span>Showing full history since inception — not enough data for {history.requested_period}</span></div>}
          {overallReturn !== null && overallReturn !== undefined && <div className={`${styles.returnBadge} ${colorClass}`}><span>{isPositive ? "▲" : "▼"}</span><span className="type-data">{formatPercent(overallReturn)}</span></div>}
        </>
      )}
    </div>
  );
}
