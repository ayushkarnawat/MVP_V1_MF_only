import { memo } from "react";
import type { KeyboardEvent } from "react";
import { cn } from "@/lib/utils";
import { formatLegendPercent } from "../allocationCopy";

export interface AllocationDonutRow {
  key: string;
  label: string;
  value: string;
  percentage: string;
  color: string;
}

export interface AllocationDonutProps {
  rows: AllocationDonutRow[];
  centerValue: string;
  centerLabel?: string;
  onSliceClick?: (key: string) => void;
  activeKey?: string | null;
  onActiveChange?: (key: string | null) => void;
  selectedKey?: string | null;
  ariaLabel?: string;
}

const R = 58;
const C = 2 * Math.PI * R;
const round2 = (x: number) => Math.round(x * 100) / 100;

export const AllocationDonut = memo(function AllocationDonut({
  rows,
  centerValue,
  centerLabel = "Total value",
  onSliceClick,
  activeKey = null,
  onActiveChange,
  selectedKey = null,
  ariaLabel = "Asset allocation",
}: AllocationDonutProps) {
  const nonZeroRows = rows.filter((r) => Number(r.percentage) > 0);

  let offset = 0;
  const slices = nonZeroRows.map((row) => {
    const length = (C * Number(row.percentage)) / 100;
    const currentOffset = offset;
    offset += length;

    const dashArray = `${round2(length)} ${round2(C - length)}`;
    const dashOffset = -round2(currentOffset) || 0;
    const labelText = `${row.label} ${formatLegendPercent(row.percentage)}`;

    return { row, dashArray, dashOffset, labelText };
  });

  return (
    <svg
      viewBox="0 0 160 160"
      width="160"
      height="160"
      role="img"
      aria-label={ariaLabel}
    >
      {onSliceClick &&
        slices.map(({ row, dashArray, dashOffset }) => (
          <circle
            key={`hit-${row.key}`}
            data-testid={`hit-${row.key}`}
            aria-hidden="true"
            r="58"
            cx="80"
            cy="80"
            fill="none"
            stroke="transparent"
            strokeWidth="28"
            strokeDasharray={dashArray}
            strokeDashoffset={dashOffset}
            transform="rotate(-90 80 80)"
            pointerEvents="stroke"
            style={{ cursor: "pointer" }}
            onMouseEnter={() => onActiveChange?.(row.key)}
            onMouseLeave={() => onActiveChange?.(null)}
            onClick={() => onSliceClick(row.key)}
          />
        ))}
      {slices.map(({ row, dashArray, dashOffset, labelText }) => {
        const dimmed = activeKey !== null && activeKey !== row.key;
        const isActive = activeKey === row.key;

        return (
          <circle
            key={row.key}
            data-testid={`slice-${row.key}`}
            className={cn(
              "transition-[opacity,stroke-width] duration-150 ease-out motion-reduce:transition-none",
              dimmed && "opacity-[0.38]"
            )}
            r="58"
            cx="80"
            cy="80"
            fill="none"
            stroke={row.color}
            strokeWidth={isActive ? 25 : 22}
            strokeDasharray={dashArray}
            strokeDashoffset={dashOffset}
            transform="rotate(-90 80 80)"
            data-dim={dimmed ? "true" : "false"}
            {...(onSliceClick
              ? {
                  role: "button",
                  tabIndex: 0,
                  "aria-label": labelText,
                  "aria-pressed": selectedKey === row.key,
                  style: { cursor: "pointer" },
                  onMouseEnter: () => onActiveChange?.(row.key),
                  onMouseLeave: () => onActiveChange?.(null),
                  onFocus: () => onActiveChange?.(row.key),
                  onBlur: () => onActiveChange?.(null),
                  onClick: () => onSliceClick(row.key),
                  onKeyDown: (e: KeyboardEvent) => {
                    if (e.key === "Enter") {
                      onSliceClick(row.key);
                    } else if (e.key === " " || e.key === "Spacebar") {
                      e.preventDefault();
                      onSliceClick(row.key);
                    }
                  },
                }
              : {})}
          >
            <title>{labelText}</title>
          </circle>
        );
      })}
      <text
        data-testid="donut-center-value"
        x="80"
        y="76"
        textAnchor="middle"
        fill="var(--ui-text)"
        style={{
          fill: "var(--ui-text)",
          fontSize: "14px",
          fontWeight: 700,
        }}
      >
        {centerValue}
      </text>
      <text
        data-testid="donut-center-label"
        x="80"
        y="94"
        textAnchor="middle"
        fill="var(--ui-text-muted)"
        style={{
          fill: "var(--ui-text-muted)",
          fontSize: "11px",
        }}
      >
        {centerLabel}
      </text>
    </svg>
  );
});
