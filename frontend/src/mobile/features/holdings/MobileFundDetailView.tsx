import { useState, useMemo, useRef, useLayoutEffect, useEffect } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import { Badge } from "@/components/Badge";
import { FundSignal } from "@/components/FundSignal";
import { Skeleton } from "@/components/Skeleton";
import { cn, toTitleCase } from "@/lib/utils";
import {
  ChevronLeft,
  ArrowDownRight,
  ArrowUpRight,
  Info,
} from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { getFundNavHistory } from "@/features/dashboard/api";
import type {
  HoldingRow,
  NavHistoryPeriod,
  SchemeNavHistoryResponse,
} from "@/features/dashboard/types";
import { motion, useReducedMotion } from "motion/react";
import { pageTransition, isTestEnv } from "@/lib/motion";

export interface MobileFundDetailViewProps {
  holding: HoldingRow;
  onBack: () => void;
}

interface ChartPoint {
  date: string;
  value: number;
  label: string;
}

// Compute SVG viewBox dimensions (module-level: shared by layout and the pointer-to-index inversion below)
const SVG_WIDTH = 320;
const SVG_HEIGHT = 140;
const PADDING_X = 16;
const PADDING_Y = 16;

// Maps a pointer's screen X back to the nearest plotted index. Points are laid out
// linearly by index (see the x calc below), so this is a closed-form inverse rather
// than a distance scan — cheap even at the backend's 400-point downsample cap.
// Mirrors FundSignal.tsx's `indexFromClientX` (web), scaled to this chart's viewBox.
function indexFromClientX(clientX: number, rect: { left: number; width: number }, pointCount: number): number {
  if (pointCount <= 1) return 0;
  const ratio = rect.width === 0 ? 0 : Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
  const viewBoxX = ratio * SVG_WIDTH;
  const plotWidth = SVG_WIDTH - PADDING_X * 2;
  const relative = (viewBoxX - PADDING_X) / plotWidth;
  return Math.min(Math.max(Math.round(relative * (pointCount - 1)), 0), pointCount - 1);
}

export function MobileFundDetailView({
  holding,
  onBack,
}: MobileFundDetailViewProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const resetScroll = () => {
      if (rootRef.current) {
        rootRef.current.scrollTop = 0;
        let parent: HTMLElement | null = rootRef.current.parentElement;
        while (parent) {
          parent.scrollTop = 0;
          parent = parent.parentElement;
        }
      }
      if (typeof window !== "undefined") {
        window.scrollTo(0, 0);
      }
      if (typeof document !== "undefined") {
        if (document.documentElement) {
          document.documentElement.scrollTop = 0;
        }
        if (document.body) {
          document.body.scrollTop = 0;
        }
      }
    };

    resetScroll();
    const rafId = requestAnimationFrame(resetScroll);
    return () => cancelAnimationFrame(rafId);
  }, [holding]);
  const [selectedTimeframe, setSelectedTimeframe] = useState<NavHistoryPeriod>("1Y");
  const [history, setHistory] = useState<SchemeNavHistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const shouldReduceMotion = useReducedMotion() || isTestEnv;

  // Reset display state during render, not in the effect below. A `useEffect` reset
  // only runs after React has already committed and painted the previous timeframe's/
  // holding's stale data for one frame; calling setState here, while `fetchKey` still
  // differs from the last-committed value, makes React discard this render and restart
  // immediately with the reset state — so the stale value is never painted at all.
  const fetchKey = `${holding.scheme_id}|${selectedTimeframe}`;
  const [committedFetchKey, setCommittedFetchKey] = useState(fetchKey);
  if (fetchKey !== committedFetchKey) {
    setCommittedFetchKey(fetchKey);
    setHistory(null);
    setLoading(true);
    setError(null);
    setActiveIndex(null);
  }

  const invested = parseFloat(holding.amount_invested || "0");
  const currentValue = parseFloat(holding.current_value || "0");
  const profit = parseFloat(
    holding.unrealized_gain || holding.current_profit_total || "0"
  );
  const isPositive = profit >= 0;
  const totalReturnPct = invested > 0 ? (profit / invested) * 100 : 0;
  useEffect(() => {
    const controller = new AbortController();

    getFundNavHistory(holding.scheme_id, selectedTimeframe, controller.signal)
      .then((data) => {
        // Guard on the controller's own abort flag, not just AbortError — a resolved
        // (e.g. cached) response can still arrive after this request was superseded
        // by a scheme/timeframe change, without ever rejecting.
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
  }, [holding.scheme_id, selectedTimeframe]);

  const chartData = useMemo<ChartPoint[]>(() => {
    return (history?.points ?? []).map((point) => ({
        date: new Date(`${point.date}T00:00:00Z`).toLocaleDateString("en-IN", {
          month: "short",
          day: "numeric",
          timeZone: "UTC",
        }),
        value: Number(point.return_pct),
        label: `${point.return_pct}%`,
      }));
  }, [history]);

  const minVal = Math.min(...chartData.map((d) => d.value));
  const maxVal = Math.max(...chartData.map((d) => d.value));
  const valRange = maxVal - minVal || 1;

  const coords = chartData.map((d, index) => ({
    x:
      PADDING_X +
      (chartData.length === 1 ? 0.5 : index / (chartData.length - 1)) * (SVG_WIDTH - PADDING_X * 2),
    y:
      SVG_HEIGHT -
      PADDING_Y -
      ((d.value - minVal) / valRange) * (SVG_HEIGHT - PADDING_Y * 2),
  }));

  const pointsString = coords.map(({ x, y }) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");

  const areaPathString = chartData.length === 0 ? "" : `M ${PADDING_X},${SVG_HEIGHT} L ${pointsString
    .split(" ")
    .join(" L ")} L ${SVG_WIDTH - PADDING_X},${SVG_HEIGHT} Z`;

  const displayedIndex = activeIndex ?? chartData.length - 1;
  const activePoint = chartData[displayedIndex];
  const displayedCoord = coords[displayedIndex];

  function handleScrubberPointerMove(event: PointerEvent<SVGRectElement>) {
    if (chartData.length === 0) return;
    setActiveIndex(indexFromClientX(event.clientX, event.currentTarget.getBoundingClientRect(), chartData.length));
  }

  function handleScrubberKeyDown(event: KeyboardEvent<SVGRectElement>) {
    if (chartData.length === 0) return;
    const current = activeIndex ?? chartData.length - 1;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      setActiveIndex(Math.max(0, current - 1));
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      setActiveIndex(Math.min(chartData.length - 1, current + 1));
    } else if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setActiveIndex(chartData.length - 1);
    }
  }

  return (
    <motion.div
      ref={rootRef}
      initial={shouldReduceMotion ? false : { opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={shouldReduceMotion ? undefined : { opacity: 0, x: -20 }}
      transition={pageTransition}
      className="flex flex-col min-h-dvh bg-[var(--color-bg)] pb-12"
    >
      {/* Top Header with Back Navigation */}
      <header className="sticky top-0 z-30 w-full h-14 bg-[var(--color-surface)]/85 backdrop-blur-md border-b border-[var(--color-border)] px-4 grid grid-cols-3 items-center transition-colors duration-200 select-none">
        {/* Left: Back button with only back arrow icon */}
        <div className="flex items-center justify-start">
          <button
            onClick={onBack}
            className="h-11 w-11 -ml-2 rounded-full flex items-center justify-center text-[var(--color-ink)] hover:bg-[var(--color-bg)] active:scale-90 transition-all duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
            type="button"
            aria-label="Back to holdings"
          >
            <ChevronLeft className="h-6 w-6 stroke-[2.2]" />
          </button>
        </div>

        {/* Center: FUND DETAILS (Centered precisely) */}
        <div className="flex items-center justify-center text-center">
          <h1 className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-secondary)] truncate">
            FUND DETAILS
          </h1>
        </div>

        {/* Right: Theme Toggle */}
        <div className="flex items-center justify-end">
          <ThemeToggle className="h-9 w-9 rounded-xl" />
        </div>
      </header>

      {/* Main Content View */}
      <div className="p-4 space-y-5">
        {/* Hero Section: FundSignal + Title + Member + Current Value + Return */}
        <section className="p-4 sm:p-5 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-xs space-y-4">
          <div className="flex items-start gap-3.5">
            <div className="flex-shrink-0 pt-0.5">
              <FundSignal
                returnPercentage={totalReturnPct}
                schemeName={holding.scheme_name}
                size="md"
              />
            </div>
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <Badge
                  variant={holding.plan_type === "DIRECT" ? "positive" : "neutral"}
                >
                  {toTitleCase(holding.plan_type || "UNKNOWN")}
                </Badge>
                {holding.household_member_name && (
                  <span className="text-[11px] font-medium text-[var(--color-text-secondary)] px-2 py-0.5 rounded-md bg-[var(--color-bg)] border border-[var(--color-border)]">
                    {holding.household_member_name}
                  </span>
                )}
              </div>
              <h1 className="font-display font-bold text-base text-[var(--color-ink)] mt-1.5 leading-snug">
                {holding.scheme_name}
              </h1>
              {holding.amc_name && (
                <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
                  {holding.amc_name}
                </p>
              )}
            </div>
          </div>

          <div className="pt-3 border-t border-[var(--color-border)]/60 flex items-end justify-between gap-3">
            <div>
              <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--color-text-secondary)] block">
                Current Value
              </span>
              <span className="font-display text-2xl font-bold text-[var(--color-ink)] tabular-nums mt-0.5 block">
                ₹{formatCurrency(currentValue)}
              </span>
            </div>

            <div className="flex flex-col items-end">
              <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--color-text-secondary)] block">
                Gain / Loss
              </span>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span
                  className={cn(
                    "font-display text-sm font-bold tabular-nums inline-flex items-center",
                    isPositive
                      ? "text-[var(--color-positive)]"
                      : "text-[var(--color-negative)]"
                  )}
                >
                  {isPositive ? (
                    <ArrowUpRight className="h-4 w-4 mr-0.5" />
                  ) : (
                    <ArrowDownRight className="h-4 w-4 mr-0.5" />
                  )}
                  ₹{formatCurrency(Math.abs(profit))}
                </span>
                <span
                  className={cn(
                    "text-[10px] font-semibold px-1.5 py-0.2 rounded-full tabular-nums",
                    isPositive
                      ? "bg-[color-mix(in_srgb,var(--color-positive)_12%,transparent)] text-[var(--color-positive)]"
                      : "bg-[color-mix(in_srgb,var(--color-negative)_12%,transparent)] text-[var(--color-negative)]"
                  )}
                >
                  {isPositive ? "+" : ""}
                  {totalReturnPct.toFixed(1)}%
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Performance Chart Section */}
        <section className="p-4 sm:p-5 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <span className="font-display text-sm font-bold text-[var(--color-ink)] block">
                Performance
              </span>
              {activePoint && (
                <span className="text-[11px] text-[var(--color-text-secondary)] mt-0.5">
                  {activePoint.date}: <strong className="text-[var(--color-ink)]">{activePoint.label}</strong>
                </span>
              )}
            </div>

            {/* Timeframe Selector Pills */}
            <div className="inline-flex items-center p-0.5 rounded-lg bg-[var(--color-bg)] border border-[var(--color-border)] shadow-2xs">
              {(["1M", "1Y", "3Y", "5Y", "MAX"] as NavHistoryPeriod[]).map((tf) => (
                <button
                  key={tf}
                  onClick={() => setSelectedTimeframe(tf)}
                  className={cn(
                    "px-2 py-1 text-[10px] font-medium rounded-md transition-colors cursor-pointer",
                    selectedTimeframe === tf
                      ? "bg-[var(--color-surface)] text-[var(--color-ink)] font-bold shadow-xs"
                      : "text-[var(--color-text-secondary)] hover:text-[var(--color-ink)]"
                  )}
                  type="button"
                >
                  {tf}
                </button>
              ))}
            </div>
          </div>

          {/* Interactive Chart Container */}
          {loading ? (
            <Skeleton height="150px" width="100%" />
          ) : error ? (
            <div className="flex items-center gap-1.5 p-2.5 rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] text-[11px] text-[var(--color-text-secondary)]">
              <Info className="h-3.5 w-3.5 flex-shrink-0 text-[var(--color-negative)]" />
              <span>{error}</span>
            </div>
          ) : chartData.length === 0 ? (
            <p className="text-[11px] text-[var(--color-text-secondary)]">No performance history available yet.</p>
          ) : (
          <div className="relative w-full h-[150px] select-none">
            <svg
              viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
              className="w-full h-full overflow-visible"
            >
              <defs>
                <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor="var(--color-accent, #22c55e)"
                    stopOpacity="0.28"
                  />
                  <stop
                    offset="100%"
                    stopColor="var(--color-accent, #22c55e)"
                    stopOpacity="0.0"
                  />
                </linearGradient>
              </defs>

              {/* Gradient Area */}
              <path d={areaPathString} fill="url(#chartGradient)" />

              {/* Trend Line */}
              <polyline
                fill="none"
                stroke="var(--color-accent, #22c55e)"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={pointsString}
              />

              {displayedCoord && (
                <>
                  <line
                    x1={displayedCoord.x}
                    y1={PADDING_Y}
                    x2={displayedCoord.x}
                    y2={SVG_HEIGHT}
                    stroke="var(--color-border)"
                    strokeDasharray="3,3"
                    strokeWidth="1"
                  />
                  <circle
                    cx={displayedCoord.x}
                    cy={displayedCoord.y}
                    r="5"
                    fill="var(--color-accent, #22c55e)"
                    stroke="var(--color-surface)"
                    strokeWidth="2"
                  />
                </>
              )}

              {/* Single continuous hit region rather than one circle per point: at the
                  backend's 400-point downsample cap, adjacent points sit well under a
                  pixel apart, so per-point targets would overlap and most points would
                  be unreachable. `role="slider"` + arrow-key support also gives
                  keyboard/screen-reader users the same point-by-point access that
                  pointer scrubbing gets. Mirrors FundSignal.tsx's web implementation. */}
              <rect
                x={0}
                y={0}
                width={SVG_WIDTH}
                height={SVG_HEIGHT}
                fill="transparent"
                className="cursor-pointer touch-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-accent)]"
                style={{ touchAction: "none" }}
                tabIndex={0}
                role="slider"
                aria-label="Fund performance history. Use arrow keys to inspect points."
                aria-valuemin={0}
                aria-valuemax={Math.max(chartData.length - 1, 0)}
                aria-valuenow={displayedIndex}
                aria-valuetext={activePoint ? `${activePoint.date}: ${activePoint.label}` : undefined}
                onPointerDown={handleScrubberPointerMove}
                onPointerMove={handleScrubberPointerMove}
                onPointerLeave={() => setActiveIndex(null)}
                onKeyDown={handleScrubberKeyDown}
              />
            </svg>
          </div>
          )}

          {!loading && !error && history?.clamped && (
            <div className="flex items-center gap-1.5 p-2.5 rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] text-[11px] text-[var(--color-text-secondary)]">
              <Info className="h-3.5 w-3.5 flex-shrink-0 text-[var(--color-accent)]" />
              <span>Showing full history since inception — not enough data for {history.requested_period}</span>
            </div>
          )}
        </section>

        {/* Detailed Scheme Breakdown List */}
        <section className="p-4 sm:p-5 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-xs space-y-3">
          <span className="font-display text-sm font-bold text-[var(--color-ink)] block">
            Holding Details
          </span>

          <div className="divide-y divide-[var(--color-border)]/60 text-xs">
            <div className="flex items-center justify-between py-2.5">
              <span className="text-[var(--color-text-secondary)]">AMC</span>
              <span className="font-semibold text-[var(--color-ink)] text-right">
                {holding.amc_name || "—"}
              </span>
            </div>

            <div className="flex items-center justify-between py-2.5">
              <span className="text-[var(--color-text-secondary)]">Plan</span>
              <Badge
                variant={holding.plan_type === "DIRECT" ? "positive" : "neutral"}
              >
                {toTitleCase(holding.plan_type)}
              </Badge>
            </div>

            <div className="flex items-center justify-between py-2.5">
              <span className="text-[var(--color-text-secondary)]">Category</span>
              <span className="font-semibold text-[var(--color-ink)]">
                {holding.category || "Equity / Mutual Fund"}
              </span>
            </div>

            <div className="flex items-center justify-between py-2.5">
              <span className="text-[var(--color-text-secondary)]">Units</span>
              <span className="font-semibold text-[var(--color-ink)] tabular-nums">
                {formatNumber(holding.units_held, 3)}
              </span>
            </div>

            <div className="flex items-center justify-between py-2.5">
              <span className="text-[var(--color-text-secondary)]">Avg NAV</span>
              <span className="font-semibold text-[var(--color-ink)] tabular-nums">
                ₹{formatNumber(holding.average_nav, 2)}
              </span>
            </div>

            <div className="flex items-center justify-between py-2.5">
              <span className="text-[var(--color-text-secondary)]">Current NAV</span>
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-[var(--color-ink)] tabular-nums">
                  ₹{formatNumber(holding.current_nav, 2)}
                </span>
                {holding.stale_nav && (
                  <Badge variant="warning">stale</Badge>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between py-2.5">
              <span className="text-[var(--color-text-secondary)]">Invested</span>
              <span className="font-semibold text-[var(--color-ink)] tabular-nums">
                ₹{formatCurrency(invested)}
              </span>
            </div>

            <div className="flex items-center justify-between py-2.5">
              <span className="text-[var(--color-text-secondary)]">Current Value</span>
              <span className="font-semibold text-[var(--color-ink)] tabular-nums">
                ₹{formatCurrency(currentValue)}
              </span>
            </div>
          </div>
        </section>
      </div>

    </motion.div>
  );
}

function formatCurrency(val: number): string {
  if (isNaN(val)) return "0";
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 0,
  }).format(val);
}

function formatNumber(valStr: string | number, decimals: number): string {
  const num = typeof valStr === "string" ? parseFloat(valStr) : valStr;
  if (isNaN(num)) return "0";
  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num);
}
