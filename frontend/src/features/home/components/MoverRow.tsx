import type { KeyboardEvent } from "react";
import { Briefcase, ChevronRight, Factory, Layers } from "lucide-react";
import { CLICK_ROW } from "@/lib/clickable";
import { changeDirection, formatSignedRupees } from "../homeFormat";
import { barHalfWidth, barSubtitle } from "../moversCopy";
import type { MoverBarOut, MoversView } from "../types";

export interface MoverRowProps {
  bar: MoverBarOut;
  view: MoversView;
  maxAbs: number;
  onOpen: (bar: MoverBarOut) => void;
}

export function MoverRow({ bar, view, maxAbs, onOpen }: MoverRowProps) {
  const isLoss = changeDirection(bar.change) === "down";
  const color = isLoss ? "var(--neg-text)" : "var(--pos-text)";
  const subtitle = barSubtitle(bar);
  const width = barHalfWidth(bar.change, maxAbs);

  const Icon =
    view === "sector" ? Factory : view === "category" ? Layers : Briefcase;

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter") {
      onOpen(bar);
    } else if (event.key === " ") {
      event.preventDefault();
      onOpen(bar);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      data-testid={`mover-${bar.key}`}
      className={`${CLICK_ROW} flex flex-col gap-2 rounded-lg p-2`}
      onClick={() => onOpen(bar)}
      onKeyDown={handleKeyDown}
    >
      <div className="flex items-center gap-3">
        <span
          data-testid={`mover-tile-${bar.key}`}
          data-view={view}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--ui-card)] text-[var(--ui-text-muted)]"
        >
          <Icon size={16} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium text-[var(--ui-text)]">
            {bar.label}
          </div>
          {subtitle ? (
            <div className="text-xs text-[var(--ui-text-muted)]">
              {subtitle}
            </div>
          ) : null}
        </div>
        <span className="font-semibold tabular-nums" style={{ color }}>
          {formatSignedRupees(bar.change)}
        </span>
        <ChevronRight
          size={16}
          className="shrink-0 text-[var(--ui-text-muted)]"
          aria-hidden="true"
        />
      </div>
      <div
        aria-hidden="true"
        className="relative h-2 w-full rounded bg-[var(--ui-divider)]"
      >
        <span className="absolute left-1/2 top-0 bottom-0 w-px -translate-x-1/2 bg-[var(--ui-border-hover)] opacity-40" />
        <i
          data-testid={`mover-bar-${bar.key}`}
          data-side={isLoss ? "loss" : "gain"}
          style={{
            width: `${width}%`,
            backgroundColor: color,
            ...(isLoss ? { right: "50%" } : { left: "50%" }),
          }}
          className="absolute top-0 bottom-0 rounded-sm"
        />
      </div>
    </div>
  );
}
