import type { KeyboardEvent } from "react";
import { Briefcase, ChevronRight, Factory, Layers } from "lucide-react";
import { CLICK_ROW } from "@/lib/clickable";
import { changeDirection, formatSignedRupees } from "../homeFormat";
import { barHalfWidth, barSubtitle } from "../moversCopy";
import type { MoverBarOut, MoversView } from "../types";
import { FundLink } from "./FundLink";

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

  // Only a row that is exactly one fund can name that fund's page; a sector or category row, or a row that
  // stands for several funds, is plain text. The id comes from the fund, not from the row key.
  const fundId = (view === "fund" && bar.funds.length === 1 ? bar.funds[0].scheme_id : null) || null;
  // A row that holds a link must not itself be a button (a link inside a button is invalid and confuses screen
  // readers). That row is a plain container: a click anywhere on it opens the popup, and the chevron is a real
  // button next to the link (its Enter or Space press arrives as a click on the row, so no key code is needed).
  const linked = fundId !== null;

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

  const rowProps = linked
    ? {}
    : { role: "button", tabIndex: 0, onKeyDown: handleKeyDown };

  return (
    <div
      {...rowProps}
      data-testid={`mover-${bar.key}`}
      className={`${CLICK_ROW} flex flex-col gap-2 rounded-lg p-2`}
      onClick={() => onOpen(bar)}
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
            <FundLink schemeId={fundId} inClickableRow>{bar.label}</FundLink>
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
        {linked ? (
          <button
            type="button"
            aria-label={`Show the funds in ${bar.label}`}
            className="shrink-0 rounded text-[var(--ui-text-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ui-focus)]"
          >
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        ) : (
          <ChevronRight
            size={16}
            className="shrink-0 text-[var(--ui-text-muted)]"
            aria-hidden="true"
          />
        )}
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
