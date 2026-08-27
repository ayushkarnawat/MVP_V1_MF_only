import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
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
// Real pixels, matching .sparklineWrapper's CSS height exactly — the viewBox width
// is measured at render time (see chartWidth below) so the SVG's internal coordinate
// system always maps 1:1 to actual screen pixels, whatever the wrapper's fluid width
// ends up being. Without that 1:1 match, `preserveAspectRatio="none"` stretches a
// fixed-aspect viewBox non-uniformly to fill the box, turning the round active-point
// marker into an ellipse and warping the line's curve at its steepest points.
const CHART_HEIGHT = 96;
const CHART_PAD_X = 4;
const CHART_PAD_Y = 10;
const CHART_FALLBACK_WIDTH = 300;

function isNegativeDecimal(value: string): boolean {
  return value.trim().startsWith("-") && !/^-(?:0+(?:\.0*)?|\.0+)$/.test(value.trim());
}

function formatPercent(value: string): string {
  const negative = isNegativeDecimal(value);
  const unsigned = value.trim().replace(/^[+-]/, "") || "0";
  const [whole = "0", fraction = ""] = unsigned.split(".");
  // String-only sign check (no Number()) so a Decimal-string boundary case never flips
  // the displayed +/- via float coercion — mirrors isNegativeDecimal's own approach.
  const isNonZero = /[1-9]/.test(unsigned);
  return `${negative ? "-" : isNonZero ? "+" : ""}${whole || "0"}.${fraction.padEnd(2, "0").slice(0, 2)}%`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${value}T00:00:00Z`),
  );
}

// Maps a pointer's screen X back to the nearest plotted index. Points are laid out
// linearly by index (see `coords` below), so this is a closed-form inverse rather
// than a distance scan — cheap even at the 400-point downsample cap.
function indexFromClientX(
  clientX: number,
  rect: { left: number; width: number },
  pointCount: number,
  chartWidth: number,
): number {
  if (pointCount <= 1) return 0;
  const ratio = rect.width === 0 ? 0 : Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
  const viewBoxX = ratio * chartWidth;
  const plotWidth = chartWidth - CHART_PAD_X * 2;
  const relative = (viewBoxX - CHART_PAD_X) / plotWidth;
  return Math.min(Math.max(Math.round(relative * (pointCount - 1)), 0), pointCount - 1);
}

export function FundSignalGraph({ schemeId, period = "1Y" }: FundSignalGraphProps) {
  const [selectedPeriod, setSelectedPeriod] = useState<NavHistoryPeriod>(period);
  const [history, setHistory] = useState<SchemeNavHistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [chartWidth, setChartWidth] = useState(CHART_FALLBACK_WIDTH);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const gradientId = useId();

  // Track the wrapper's actual rendered width so the SVG viewBox can match it 1:1 —
  // see the CHART_HEIGHT comment above for why this matters.
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width) setChartWidth(width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Reset during render (not in the effect) so React discards the stale-history
  // frame before it ever paints, instead of showing the old scheme/period's data
  // for one frame while the effect's setState calls are still pending.
  const fetchKey = `${schemeId}|${selectedPeriod}`;
  const [committedFetchKey, setCommittedFetchKey] = useState(fetchKey);
  if (fetchKey !== committedFetchKey) {
    setCommittedFetchKey(fetchKey);
    setHistory(null);
    setLoading(true);
    setError(null);
    setActiveIndex(null);
  }

  useEffect(() => {
    const controller = new AbortController();

    getFundNavHistory(schemeId, selectedPeriod, controller.signal)
      .then((data) => {
        // A resolved cached response can arrive after this request was superseded
        // (period/scheme changed) without ever rejecting — guard on the controller's
        // own abort flag, not just AbortError, so a stale response can't overwrite
        // a newer one.
        if (controller.signal.aborted) return;
        setHistory(data);
        setLoading(false);
      })
      .catch((err) => {
        if (controller.signal.aborted || err?.name === "AbortError") return;
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
      x: values.length === 1 ? chartWidth / 2 : CHART_PAD_X + (index / (values.length - 1)) * (chartWidth - CHART_PAD_X * 2),
      y: baselineY - ((value - minVal) / range) * plotHeight,
    }));
  }, [values, chartWidth]);

  const { linePath, areaPath } = useMemo(() => {
    const baselineY = CHART_HEIGHT - CHART_PAD_Y;
    const lineGenerator = d3Line<{ x: number; y: number }>().x((d) => d.x).y((d) => d.y).curve(curveMonotoneX);
    const areaGenerator = d3Area<{ x: number; y: number }>().x((d) => d.x).y0(baselineY).y1((d) => d.y).curve(curveMonotoneX);
    return { linePath: lineGenerator(coords) ?? "", areaPath: areaGenerator(coords) ?? "" };
  }, [coords]);

  const displayedIndex = activeIndex ?? points.length - 1;
  const displayedPoint: NavHistoryPoint | undefined = points[displayedIndex];
  const displayedCoord = coords[displayedIndex];
  const overallReturn = history?.overall_return_pct;
  const isPositive = overallReturn !== null && overallReturn !== undefined && !isNegativeDecimal(overallReturn);
  const colorClass = isPositive ? styles.positive : styles.negative;

  function handleScrubberPointerMove(event: PointerEvent<SVGRectElement>) {
    if (points.length === 0) return;
    setActiveIndex(indexFromClientX(event.clientX, event.currentTarget.getBoundingClientRect(), points.length, chartWidth));
  }

  function handleScrubberKeyDown(event: KeyboardEvent<SVGRectElement>) {
    if (points.length === 0) return;
    const current = activeIndex ?? points.length - 1;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      setActiveIndex(Math.max(0, current - 1));
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      setActiveIndex(Math.min(points.length - 1, current + 1));
    } else if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setActiveIndex(points.length - 1);
    }
  }

  return (
    <div className={styles.inlineGraph}>
      <div className={styles.popoutHeader}>
        <div>
          <span className={styles.popoutTitle}>Trend ({selectedPeriod})</span>
          {displayedPoint && <p className={styles.pointReadout} aria-live="polite">{formatDate(displayedPoint.date)}: {formatPercent(displayedPoint.return_pct)}</p>}
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
          <div className={styles.sparklineWrapper} ref={wrapperRef}>
            <svg viewBox={`0 0 ${chartWidth} ${CHART_HEIGHT}`} className={`${styles.sparklineSvg} ${colorClass}`}>
              <defs><linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="currentColor" stopOpacity="0.22" /><stop offset="100%" stopColor="currentColor" stopOpacity="0" /></linearGradient></defs>
              <path d={areaPath} fill={`url(#${gradientId})`} stroke="none" />
              <path d={linePath} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              {displayedCoord && (
                <>
                  <line className={styles.guideLine} x1={displayedCoord.x} y1={CHART_PAD_Y} x2={displayedCoord.x} y2={CHART_HEIGHT} />
                  <circle className={styles.activePoint} cx={displayedCoord.x} cy={displayedCoord.y} r="4" />
                </>
              )}
              {/* Single continuous hit region rather than one circle per point: at the
                  400-point downsample cap, adjacent points sit well under a pixel apart,
                  so per-point targets would overlap. `role="slider"` + arrow-key support
                  also gives keyboard/screen-reader users the same point-by-point access
                  mouse/touch scrubbing gets via pointer move. */}
              <rect
                className={styles.scrubberOverlay}
                x={0}
                y={0}
                width={chartWidth}
                height={CHART_HEIGHT}
                tabIndex={0}
                role="slider"
                aria-label="Fund performance history. Use arrow keys to inspect points."
                aria-valuemin={0}
                aria-valuemax={Math.max(points.length - 1, 0)}
                aria-valuenow={displayedIndex}
                aria-valuetext={
                  displayedPoint ? `${formatDate(displayedPoint.date)}: ${formatPercent(displayedPoint.return_pct)}` : undefined
                }
                onPointerDown={handleScrubberPointerMove}
                onPointerMove={handleScrubberPointerMove}
                onPointerLeave={() => setActiveIndex(null)}
                onKeyDown={handleScrubberKeyDown}
              />
            </svg>
          </div>
          {history?.clamped && <div className={styles.infoNote}><Info aria-hidden="true" size={14} /><span>Showing full history since inception — not enough data for {history.requested_period}</span></div>}
          {overallReturn !== null && overallReturn !== undefined && <div className={`${styles.returnBadge} ${colorClass}`}><span>{isPositive ? "▲" : "▼"}</span><span className="type-data">{formatPercent(overallReturn)}</span></div>}
        </>
      )}
    </div>
  );
}
