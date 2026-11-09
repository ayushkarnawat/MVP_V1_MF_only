import { memo } from "react";
import type { KeyboardEvent } from "react";
import { ChevronRight } from "lucide-react";
import { CLICK_ROW } from "@/lib/clickable";
import { compareDecimalStrings, formatLegendPercent, type liveRows } from "../allocationCopy";

export type LiveClassRow = ReturnType<typeof liveRows>[number];

export interface AllocationLegendRowProps {
  row: LiveClassRow;
  isActive: boolean;
  onOpen: (key: string) => void;
  onEnter: (key: string) => void;
  onLeave: () => void;
}

export const AllocationLegendRow = memo(function AllocationLegendRow({
  row,
  isActive,
  onOpen,
  onEnter,
  onLeave,
}: AllocationLegendRowProps) {
  const isClickable = compareDecimalStrings(row.value, "0") !== 0;
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      onOpen(row.key);
    } else if (e.key === " " || e.key === "Spacebar") {
      e.preventDefault();
      onOpen(row.key);
    }
  };

  return (
    <div
      data-testid={`legend-${row.key}`}
      data-color={row.color}
      data-active={isActive ? "true" : "false"}
      {...(isClickable
        ? {
            role: "button",
            tabIndex: 0,
            className: `flex items-center justify-between p-1.5 rounded-lg text-sm text-[var(--ui-text)] ${CLICK_ROW}`,
            onClick: () => onOpen(row.key),
            onKeyDown: handleKeyDown,
            onMouseEnter: () => onEnter(row.key),
            onMouseLeave: () => onLeave(),
            onFocus: () => onEnter(row.key),
            onBlur: () => onLeave(),
          }
        : {
            className:
              "flex items-center justify-between p-1.5 rounded-lg text-sm text-[var(--ui-text)]",
          })}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span
          style={{ backgroundColor: row.color }}
          className="h-2.5 w-2.5 rounded-sm shrink-0"
        />
        <span className="truncate">{row.label}</span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="font-semibold text-sm">
          {formatLegendPercent(row.percentage)}
        </span>
        <ChevronRight
          className="h-4 w-4 text-[var(--ui-text-muted)]"
          aria-hidden="true"
        />
      </div>
    </div>
  );
});
