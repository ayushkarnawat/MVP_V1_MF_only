import type { KeyboardEvent } from "react";
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
  ariaLabel?: string;
}

const R = 58;
const C = 2 * Math.PI * R;
const round2 = (x: number) => Math.round(x * 100) / 100;

export function AllocationDonut({
  rows,
  centerValue,
  centerLabel = "Total value",
  onSliceClick,
  ariaLabel = "Asset allocation",
}: AllocationDonutProps) {
  const nonZeroRows = rows.filter((r) => Number(r.percentage) > 0);

  let offset = 0;

  return (
    <svg
      viewBox="0 0 160 160"
      width="160"
      height="160"
      role="img"
      aria-label={ariaLabel}
    >
      {nonZeroRows.map((row) => {
        const length = (C * Number(row.percentage)) / 100;
        const currentOffset = offset;
        offset += length;

        const dashArray = `${round2(length)} ${round2(C - length)}`;
        const dashOffset = -round2(currentOffset) || 0;
        const labelText = `${row.label} ${formatLegendPercent(row.percentage)}`;

        return (
          <circle
            key={row.key}
            data-testid={`slice-${row.key}`}
            r="58"
            cx="80"
            cy="80"
            fill="none"
            stroke={row.color}
            strokeWidth="22"
            strokeDasharray={dashArray}
            strokeDashoffset={dashOffset}
            transform="rotate(-90 80 80)"
            {...(onSliceClick
              ? {
                  role: "button",
                  tabIndex: 0,
                  "aria-label": labelText,
                  style: { cursor: "pointer" },
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
}
