import { useState } from "react";
import {
  PieChart,
  PieSlice,
  PieCenter,
  type PieData,
} from "@/components/ui/charts";
import { cn } from "@/lib/utils";
import { formatIndianCurrency } from "@/lib/decimal";

export interface AllocationItem {
  label: string;
  current_value: string;
  percentage: number | string;
}

export interface AllocationDonutProps {
  data: AllocationItem[];
  totalValue?: string;
  title?: string;
  className?: string;
  /** Mobile-only: highlight/pop out a segment on tap instead of hover.
   * Reuses the same hoveredIndex + PieChart/PieSlice highlight this
   * component already does on hover — web's hover behavior is unchanged. */
  enableTapHighlight?: boolean;
}

const PALETTE = [
  "#22C55E", // Brand Accent Green
  "#3B82F6", // Primary Blue
  "#8B5CF6", // Purple
  "#F59E0B", // Amber
  "#06B6D4", // Cyan
  "#EC4899", // Pink
  "#64748B", // Slate
];

function parsePercentage(val: number | string | undefined | null): number {
  if (typeof val === "number") return isNaN(val) ? 0 : val;
  if (typeof val === "string") {
    const parsed = parseFloat(val);
    return isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

export function AllocationDonut({
  data,
  totalValue,
  title,
  className,
  enableTapHighlight = false,
}: AllocationDonutProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  // Separate, persistent state for tap mode — sharing hoveredIndex with
  // onMouseEnter/onMouseLeave broke on touch devices: the browser's
  // synthetic mouse-event emulation for taps fires a mouseleave right after
  // the click, clearing hoveredIndex immediately (highlight flashes then
  // disappears). This state is only ever set by onClick, never by hover.
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const activeIndex = enableTapHighlight ? selectedIndex : hoveredIndex;

  if (!data || data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-[var(--color-text-secondary)]">
        <p className="type-caption">No allocation data available</p>
      </div>
    );
  }

  const parsedTotal = totalValue
    ? parseFloat(totalValue)
    : data.reduce((sum, item) => sum + parseFloat(item.current_value || "0"), 0);

  const pieData: PieData[] = data.map((item, idx) => {
    const pct = parsePercentage(item.percentage);
    const val = parseFloat(item.current_value) || pct || 1;
    return {
      label: item.label,
      value: val,
      color: PALETTE[idx % PALETTE.length],
      formattedValue: item.current_value,
    };
  });

  const activeItem = activeIndex !== null ? data[activeIndex] : null;

  return (
    <div className={cn("w-full", className)}>
      {title && (
        <h3 className="font-display text-base font-semibold tracking-tight text-[var(--color-ink)] mb-4">
          {title}
        </h3>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
        {/* Donut Chart */}
        <div className="relative flex items-center justify-center min-h-[220px] max-w-[260px] mx-auto w-full aspect-square">
          <PieChart
            data={pieData}
            size={240}
            innerRadius={80}
            padAngle={0.03}
            cornerRadius={3}
            hoverOffset={4}
            hoveredIndex={activeIndex}
            onHoverChange={enableTapHighlight ? undefined : setHoveredIndex}
            className="w-full h-full"
          >
            {pieData.map((item, idx) => (
              <PieSlice
                key={item.label + idx}
                index={idx}
                hoverEffect="translate"
                hoverOffset={4}
              />
            ))}
            <PieCenter>
              {() => {
                const activePct = activeItem
                  ? parsePercentage(activeItem.percentage)
                  : 100;
                return (
                  <div className="flex flex-col items-center justify-center text-center px-2 select-none pointer-events-none">
                    <span className="text-[11px] font-medium tracking-wide text-[var(--color-text-secondary)] truncate max-w-[110px]">
                      {activeItem ? activeItem.label : "Total Value"}
                    </span>
                    <span className="font-display text-base font-bold text-[var(--color-ink)] tabular-nums type-data-large mt-0.5">
                      ₹{formatIndianCurrency(activeItem ? activeItem.current_value : parsedTotal)}
                    </span>
                    <span className="text-[11px] text-[var(--color-accent)] font-medium tabular-nums type-caption mt-0.5">
                      {activeItem ? `${activePct.toFixed(1)}%` : "100%"}
                    </span>
                  </div>
                );
              }}
            </PieCenter>
          </PieChart>
        </div>

        {/* Lightweight Breakdown Legend List */}
        <div className="flex flex-col space-y-1.5 w-full">
          {data.map((item, idx) => {
            const isActive = activeIndex === idx;
            const color = PALETTE[idx % PALETTE.length];
            const pct = parsePercentage(item.percentage);

            return (
              <div
                key={item.label + idx}
                className={cn(
                  "flex items-center justify-between px-3 py-2 rounded-lg transition-colors duration-150 cursor-pointer",
                  isActive
                    ? "bg-[var(--color-bg)] text-[var(--color-ink)]"
                    : "hover:bg-[var(--color-bg)]/60 text-[var(--color-ink)]"
                )}
                onMouseEnter={enableTapHighlight ? undefined : () => setHoveredIndex(idx)}
                onMouseLeave={enableTapHighlight ? undefined : () => setHoveredIndex(null)}
                onClick={
                  enableTapHighlight
                    ? () => setSelectedIndex((prev) => (prev === idx ? null : idx))
                    : undefined
                }
              >
                <div className="flex items-center space-x-2.5 min-w-0">
                  <span
                    className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: color }}
                    aria-hidden="true"
                  />
                  <span className="text-xs font-medium text-[var(--color-ink)] truncate">
                    {item.label}
                  </span>
                </div>

                <div className="flex items-center space-x-3 text-right flex-shrink-0">
                  <span className="text-xs font-semibold text-[var(--color-ink)] tabular-nums type-data">
                    {pct.toFixed(1)}%
                  </span>
                  <span className="text-xs text-[var(--color-text-secondary)] tabular-nums type-caption">
                    ₹{formatIndianCurrency(item.current_value)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
