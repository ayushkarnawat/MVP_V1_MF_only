import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { CLICK_ROW } from "@/lib/clickable";
import { formatPercent, formatRupees } from "@/lib/format";
import { useScope } from "@/shell/scope/ScopeContext";
import type { SummaryResponse, ScoreResponse } from "../types";
import type { FundSection } from "../useFundSection";
import { TILE_TITLES, type TileId } from "../fundCopy";
import {
  changeDirection,
  formatSignedPercent,
  formatSignedRupees,
  formatXirr,
  planPill,
  shareLine,
} from "../fundFormat";
import { ScoreCard } from "./ScoreCard";
import { TileDialog } from "./TileDialog";

export interface StatBandProps {
  summary: SummaryResponse;
  score: FundSection<ScoreResponse>;
  refreshing?: boolean;
}

export function StatBand({ summary, score, refreshing }: StatBandProps) {
  const { selectedMember, setAggregate } = useScope();
  const [tile, setTile] = useState<TileId | null>(null);

  const { tiles } = summary;

  const renderFigures = () => {
    if (refreshing) {
      return (
        <div
          role="status"
          aria-label="Loading figures"
          className="grid grid-cols-2 gap-4 md:grid-cols-5 p-2"
        >
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      );
    }

    if (!summary.held) {
      return (
        <div role="status" data-testid="not-held" className="p-4 space-y-2">
          <p className="text-sm font-medium text-[var(--ui-text)]">
            {`Not held by ${selectedMember?.name ?? "this member"}`}
          </p>
          {summary.held_by_other_members &&
            summary.held_by_other_members.length > 0 && (
              <p className="text-xs text-[var(--ui-text-muted)]">
                {`Held by ${summary.held_by_other_members
                  .map((m) => m.name)
                  .join(", ")}.`}
              </p>
            )}
          <button
            type="button"
            onClick={setAggregate}
            className="text-xs font-semibold text-[var(--c2)] hover:underline"
          >
            View Family Combined
          </button>
        </div>
      );
    }

    const gainDir = changeDirection(tiles.total_gain);
    const gainDirColor =
      gainDir === "up"
        ? "text-[var(--pos-text)]"
        : gainDir === "down"
          ? "text-[var(--neg-text)]"
          : "text-[var(--ui-text)]";

    const valueSub = shareLine(tiles.share_of_portfolio_pct);
    const gainSub =
      tiles.total_gain_pct != null
        ? formatSignedPercent(tiles.total_gain_pct, 1)
        : "";
    const terFigure = tiles.expense_ratio?.value
      ? formatPercent(tiles.expense_ratio.value, { digits: 2 })
      : "—";
    const terSub = tiles.expense_ratio
      ? planPill(tiles.expense_ratio.plan)
      : "";

    const handleTileKeyDown = (e: React.KeyboardEvent, id: TileId) => {
      if (e.key === "Enter") {
        setTile(id);
      } else if (e.key === " ") {
        e.preventDefault();
        setTile(id);
      }
    };

    return (
      <div
        role="group"
        aria-label="Key figures"
        className="grid grid-cols-2 divide-y divide-[var(--ui-divider)] md:grid-cols-5 md:divide-y-0 md:divide-x md:divide-[var(--ui-divider)]"
      >
        {/* 1. Value */}
        <div
          role="button"
          tabIndex={0}
          aria-haspopup="dialog"
          data-testid="tile-value"
          className={`p-3 group ${CLICK_ROW}`}
          onClick={() => setTile("value")}
          onKeyDown={(e) => handleTileKeyDown(e, "value")}
        >
          <div className="flex items-center justify-between text-xs text-[var(--ui-text-muted)]">
            <span>{TILE_TITLES.value}</span>
            <ChevronRight
              className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 group-focus:opacity-100 transition-opacity shrink-0"
              aria-hidden="true"
            />
          </div>
          <span
            data-testid="tile-value-figure"
            className="block text-[19px] font-bold font-display tabular-nums mt-1 text-[var(--ui-text)]"
          >
            {formatRupees(tiles.current_value)}
          </span>
          {valueSub ? (
            <span
              data-testid="tile-value-sub"
              className="block text-xs mt-0.5 text-[var(--ui-text-muted)]"
            >
              {valueSub}
            </span>
          ) : null}
        </div>

        {/* 2. Invested */}
        <div
          role="button"
          tabIndex={0}
          aria-haspopup="dialog"
          data-testid="tile-invested"
          className={`p-3 group ${CLICK_ROW}`}
          onClick={() => setTile("invested")}
          onKeyDown={(e) => handleTileKeyDown(e, "invested")}
        >
          <div className="flex items-center justify-between text-xs text-[var(--ui-text-muted)]">
            <span>{TILE_TITLES.invested}</span>
            <ChevronRight
              className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 group-focus:opacity-100 transition-opacity shrink-0"
              aria-hidden="true"
            />
          </div>
          <span
            data-testid="tile-invested-figure"
            className="block text-[19px] font-bold font-display tabular-nums mt-1 text-[var(--ui-text)]"
          >
            {formatRupees(tiles.invested)}
          </span>
        </div>

        {/* 3. Gain */}
        <div
          role="button"
          tabIndex={0}
          aria-haspopup="dialog"
          data-testid="tile-gain"
          className={`p-3 group ${CLICK_ROW}`}
          onClick={() => setTile("gain")}
          onKeyDown={(e) => handleTileKeyDown(e, "gain")}
        >
          <div className="flex items-center justify-between text-xs text-[var(--ui-text-muted)]">
            <span>{TILE_TITLES.gain}</span>
            <ChevronRight
              className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 group-focus:opacity-100 transition-opacity shrink-0"
              aria-hidden="true"
            />
          </div>
          <span
            data-testid="tile-gain-figure"
            data-direction={gainDir}
            className={`block text-[19px] font-bold font-display tabular-nums mt-1 ${gainDirColor}`}
          >
            {formatSignedRupees(tiles.total_gain)}
          </span>
          {gainSub ? (
            <span
              data-testid="tile-gain-sub"
              className={`block text-xs mt-0.5 ${gainDirColor}`}
            >
              {gainSub}
            </span>
          ) : null}
        </div>

        {/* 4. XIRR */}
        <div
          role="button"
          tabIndex={0}
          aria-haspopup="dialog"
          data-testid="tile-xirr"
          className={`p-3 group ${CLICK_ROW}`}
          onClick={() => setTile("xirr")}
          onKeyDown={(e) => handleTileKeyDown(e, "xirr")}
        >
          <div className="flex items-center justify-between text-xs text-[var(--ui-text-muted)]">
            <span>{TILE_TITLES.xirr}</span>
            <ChevronRight
              className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 group-focus:opacity-100 transition-opacity shrink-0"
              aria-hidden="true"
            />
          </div>
          <span
            data-testid="tile-xirr-figure"
            className="block text-[19px] font-bold font-display tabular-nums mt-1 text-[var(--ui-text)]"
          >
            {formatXirr(tiles.xirr)}
          </span>
        </div>

        {/* 5. TER */}
        <div
          role="button"
          tabIndex={0}
          aria-haspopup="dialog"
          data-testid="tile-ter"
          className={`p-3 group ${CLICK_ROW}`}
          onClick={() => setTile("ter")}
          onKeyDown={(e) => handleTileKeyDown(e, "ter")}
        >
          <div className="flex items-center justify-between text-xs text-[var(--ui-text-muted)]">
            <span>{TILE_TITLES.ter}</span>
            <ChevronRight
              className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 group-focus:opacity-100 transition-opacity shrink-0"
              aria-hidden="true"
            />
          </div>
          <span
            data-testid="tile-ter-figure"
            className="block text-[19px] font-bold font-display tabular-nums mt-1 text-[var(--ui-text)]"
          >
            {terFigure}
          </span>
          {terSub ? (
            <span
              data-testid="tile-ter-sub"
              className="block text-xs mt-0.5 text-[var(--ui-text-muted)]"
            >
              {terSub}
            </span>
          ) : null}
        </div>
      </div>
    );
  };

  return (
    <section
      aria-label="Fund summary"
      className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]"
    >
      <div className="rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-4">
        {renderFigures()}
      </div>
      <ScoreCard score={score} />
      <TileDialog
        tile={tile}
        summary={summary}
        onClose={() => setTile(null)}
      />
    </section>
  );
}
