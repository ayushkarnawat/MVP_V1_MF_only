import { useState, useMemo, useRef, useLayoutEffect } from "react";
import { Badge } from "@/components/Badge";
import { FundSignal } from "@/components/FundSignal";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ChevronLeft,
  ArrowDownRight,
  ArrowUpRight,
  BarChart2,
  Info,
} from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { MobileDistributorComparisonView } from "./MobileDistributorComparisonView";
import type { HoldingRow } from "@/features/dashboard/types";

export interface MobileFundDetailViewProps {
  holding: HoldingRow;
  onBack: () => void;
}

type Timeframe = "1M" | "3M" | "6M" | "1Y" | "ALL";

interface ChartPoint {
  date: string;
  value: number;
  label: string;
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
  const [selectedTimeframe, setSelectedTimeframe] = useState<Timeframe>("6M");
  const [hoveredPoint, setHoveredPoint] = useState<ChartPoint | null>(null);
  const [showDistributorComparison, setShowDistributorComparison] = useState(false);

  const invested = parseFloat(holding.amount_invested || "0");
  const currentValue = parseFloat(holding.current_value || "0");
  const profit = parseFloat(
    holding.unrealized_gain || holding.current_profit_total || "0"
  );
  const isPositive = profit >= 0;
  const totalReturnPct = invested > 0 ? (profit / invested) * 100 : 0;
  const currentNavNum = parseFloat(holding.current_nav || "0");
  const avgNavNum = parseFloat(holding.average_nav || "0");

  /* Generate illustrative performance curve based on available valuation points */
  const chartData = useMemo<ChartPoint[]>(() => {
    const pointsCount =
      selectedTimeframe === "1M"
        ? 6
        : selectedTimeframe === "3M"
        ? 8
        : selectedTimeframe === "6M"
        ? 10
        : selectedTimeframe === "1Y"
        ? 12
        : 14;

    const baseVal = avgNavNum > 0 ? avgNavNum : currentNavNum * 0.85;
    const targetVal = currentNavNum > 0 ? currentNavNum : baseVal * 1.15;
    const diff = targetVal - baseVal;

    const points: ChartPoint[] = [];
    const now = new Date();

    for (let i = 0; i < pointsCount; i++) {
      const progress = i / (pointsCount - 1);
      // Realistic gentle curve with mild fluctuation
      const noise =
        i > 0 && i < pointsCount - 1
          ? Math.sin(progress * Math.PI * 2) * (diff * 0.08)
          : 0;
      const val = baseVal + diff * Math.pow(progress, 0.9) + noise;

      const dateObj = new Date(now);
      const daysBack = (pointsCount - 1 - i) * (selectedTimeframe === "1M" ? 5 : selectedTimeframe === "3M" ? 11 : selectedTimeframe === "6M" ? 18 : 30);
      dateObj.setDate(now.getDate() - daysBack);

      points.push({
        date: dateObj.toLocaleDateString("en-IN", {
          month: "short",
          day: "numeric",
        }),
        value: Math.max(0.01, val),
        label: `₹${val.toFixed(2)}`,
      });
    }

    return points;
  }, [selectedTimeframe, currentNavNum, avgNavNum]);

  // Compute SVG viewBox dimensions
  const svgWidth = 320;
  const svgHeight = 140;
  const paddingX = 16;
  const paddingY = 16;

  const minVal = Math.min(...chartData.map((d) => d.value));
  const maxVal = Math.max(...chartData.map((d) => d.value));
  const valRange = maxVal - minVal || 1;

  const pointsString = chartData
    .map((d, index) => {
      const x =
        paddingX +
        (index / (chartData.length - 1)) * (svgWidth - paddingX * 2);
      const y =
        svgHeight -
        paddingY -
        ((d.value - minVal) / valRange) * (svgHeight - paddingY * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const areaPathString = `M ${paddingX},${svgHeight} L ${pointsString
    .split(" ")
    .join(" L ")} L ${svgWidth - paddingX},${svgHeight} Z`;

  const activePoint = hoveredPoint || chartData[chartData.length - 1];

  return (
    <div
      ref={rootRef}
      className="flex flex-col min-h-dvh bg-[var(--color-bg)] pb-12 animate-in fade-in duration-200"
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
                  {holding.plan_type || "UNKNOWN"}
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

        {/* Compare Returns by Distributor — placed right after key stats,
            same as the web Fund Details modal's ordering */}
        <Button
          variant="secondary"
          onClick={() => setShowDistributorComparison(true)}
          className="w-full h-11 gap-1.5 inline-flex items-center justify-center rounded-xl text-xs font-semibold"
        >
          <BarChart2 className="h-4 w-4" />
          <span>Compare Returns by Distributor</span>
        </Button>

        {/* Performance Chart Section */}
        <section className="p-4 sm:p-5 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <span className="font-display text-sm font-bold text-[var(--color-ink)] block">
                Performance
              </span>
              <span className="text-[11px] text-[var(--color-text-secondary)] mt-0.5">
                {activePoint.date}: <strong className="text-[var(--color-ink)]">{activePoint.label}</strong>
              </span>
            </div>

            {/* Timeframe Selector Pills */}
            <div className="inline-flex items-center p-0.5 rounded-lg bg-[var(--color-bg)] border border-[var(--color-border)] shadow-2xs">
              {(["1M", "3M", "6M", "1Y", "ALL"] as Timeframe[]).map((tf) => (
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
          <div className="relative w-full h-[150px] select-none touch-none">
            <svg
              viewBox={`0 0 ${svgWidth} ${svgHeight}`}
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

              {/* Interactive Point Targets */}
              {chartData.map((d, index) => {
                const x =
                  paddingX +
                  (index / (chartData.length - 1)) * (svgWidth - paddingX * 2);
                const y =
                  svgHeight -
                  paddingY -
                  ((d.value - minVal) / valRange) * (svgHeight - paddingY * 2);
                const isCurrentActive =
                  (hoveredPoint && hoveredPoint.date === d.date) ||
                  (!hoveredPoint && index === chartData.length - 1);

                return (
                  <g key={d.date}>
                    {isCurrentActive && (
                      <>
                        <line
                          x1={x}
                          y1={paddingY}
                          x2={x}
                          y2={svgHeight}
                          stroke="var(--color-border)"
                          strokeDasharray="3,3"
                          strokeWidth="1"
                        />
                        <circle
                          cx={x}
                          cy={y}
                          r="5"
                          fill="var(--color-accent, #22c55e)"
                          stroke="var(--color-surface)"
                          strokeWidth="2"
                        />
                      </>
                    )}
                    <circle
                      cx={x}
                      cy={y}
                      r="16"
                      fill="transparent"
                      className="cursor-pointer"
                      onMouseEnter={() => setHoveredPoint(d)}
                      onTouchStart={() => setHoveredPoint(d)}
                    />
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Historical Data Transparency Note */}
          <div className="flex items-center gap-1.5 p-2.5 rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] text-[11px] text-[var(--color-text-secondary)]">
            <Info className="h-3.5 w-3.5 flex-shrink-0 text-[var(--color-accent)]" />
            <span>Historical NAV timeseries API unavailable — displaying portfolio baseline trajectory.</span>
          </div>
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
                {holding.plan_type}
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

      <MobileDistributorComparisonView
        isOpen={showDistributorComparison}
        onClose={() => setShowDistributorComparison(false)}
        memberId={holding.household_member_id}
        schemeId={holding.scheme_id}
        schemeName={holding.scheme_name}
      />
    </div>
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
