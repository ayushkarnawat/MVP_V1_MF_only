import { useMemo, useState } from "react";
import { formatPercent } from "../../../lib/format";
import type { AnalyticsCardProps } from "../allocation/allocationLogic";
import { SectionCard } from "../common/SectionCard";
import { memberInitials } from "../mfCopy";
import type { StockHoldingsSummary } from "../types";
import {
  equityRows,
  fundChips,
  medalFor,
  relativeWidth,
  topStocksForFund,
} from "./holdingsLogic";

export function TopHoldingsByFund({
  state,
  data,
  onRetry,
}: AnalyticsCardProps<StockHoldingsSummary>) {
  const rows = useMemo(() => equityRows(data), [data]);
  const chips = useMemo(() => fundChips(rows), [rows]);

  const [selectedSchemeId, setSelectedSchemeId] = useState<string | null>(null);

  const pickedSchemeId =
    selectedSchemeId && chips.some(c => c.schemeId === selectedSchemeId)
      ? selectedSchemeId
      : chips[0]?.schemeId ?? null;

  const pickedChip = chips.find(c => c.schemeId === pickedSchemeId) ?? null;

  const top = useMemo(() => {
    return pickedSchemeId ? topStocksForFund(rows, pickedSchemeId) : { stocks: [], total: "0" };
  }, [rows, pickedSchemeId]);

  return (
    <SectionCard
      title="Top Holdings by Fund"
      info="Each fund's top 10 stock positions by weight — re-sorted on your device from the same per-fund breakdown used in the portfolio-wide table below, not a separate computation."
      state={state}
      onRetry={onRetry}
    >
      {!data || chips.length === 0 || !pickedChip ? (
        <p className="text-xs text-[var(--ui-text-muted)]">
          No stock holdings to show yet
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-xs text-[var(--ui-text-muted)]">
            Pick a fund to see its 10 largest stock positions.
          </p>

          {/* Fund chips */}
          <div role="group" aria-label="Funds" className="flex flex-wrap items-center gap-2">
            {chips.map(chip => {
              const isSelected = chip.schemeId === pickedSchemeId;
              return (
                <button
                  key={chip.schemeId}
                  type="button"
                  aria-pressed={isSelected}
                  data-testid={`chip-${chip.schemeId}`}
                  data-color={chip.color}
                  data-clickable=""
                  data-effect="select"
                  title={chip.name}
                  onClick={() => setSelectedSchemeId(chip.schemeId)}
                  style={{
                    backgroundColor: isSelected ? chip.color : undefined,
                    borderColor: chip.color,
                  }}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    isSelected
                      ? "text-white shadow-sm"
                      : "bg-[var(--ui-card)] text-[var(--ui-text)] hover:bg-[var(--ui-row-hover)]"
                  }`}
                >
                  <span className="truncate max-w-[200px] inline-block">{chip.name}</span>
                </button>
              );
            })}
          </div>

          {/* Heading strip */}
          <div
            data-testid="fund-strip"
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-card)] p-3 text-xs"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span
                data-testid="strip-dot"
                aria-hidden="true"
                style={{ backgroundColor: pickedChip.color }}
                className="h-2.5 w-2.5 rounded-full shrink-0"
              />
              <span className="font-semibold text-[var(--ui-text)] truncate">
                {pickedChip.name}
              </span>
            </div>
            <span data-testid="strip-total" className="shrink-0 font-medium text-[var(--ui-text-muted)]">
              {formatPercent(top.total, { digits: 1 })} in these {top.stocks.length} names
            </span>
          </div>

          {/* Top stocks list */}
          <ol aria-label="Top holdings" className="flex flex-col gap-2">
            {top.stocks.map(stock => {
              const medal = medalFor(stock.rank);
              const medalAttr = medal !== null ? { "data-medal": medal } : {};

              return (
                <li
                  key={stock.key}
                  data-testid={`top-row-${stock.rank}`}
                  className="flex flex-col gap-1.5 rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-card)] p-3 text-xs"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        data-testid={`rank-${stock.rank}`}
                        {...medalAttr}
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                          medal
                            ? "bg-[var(--warn-bg)] text-[var(--warn-text)]"
                            : "bg-[var(--ui-elevated)] text-[var(--ui-text-muted)]"
                        }`}
                      >
                        {stock.rank}
                      </span>

                      <span
                        data-testid={`avatar-${stock.rank}`}
                        aria-hidden="true"
                        style={{ backgroundColor: pickedChip.color }}
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                      >
                        {memberInitials(stock.name)}
                      </span>

                      <span
                        title={stock.name}
                        className="truncate font-medium text-[var(--ui-text)]"
                      >
                        {stock.name}
                      </span>
                    </div>

                    <span className="shrink-0 font-semibold text-[var(--ui-text)]">
                      {formatPercent(stock.weight, { digits: 2 })}
                    </span>
                  </div>

                  {/* Relative bar */}
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--ui-divider)]">
                    <span
                      data-testid={`top-bar-${stock.rank}`}
                      style={{
                        width: `${relativeWidth(stock.weight, top.stocks)}%`,
                        backgroundColor: pickedChip.color,
                      }}
                      className="block h-full rounded-full transition-all"
                    />
                  </div>
                </li>
              );
            })}
          </ol>

          {data.truncated && (
            <p data-testid="top-note" className="text-xs text-[var(--ui-text-muted)]">
              Based on the largest {rows.length} of {data.total_stock_count} stocks held across your portfolio.
            </p>
          )}
        </div>
      )}
    </SectionCard>
  );
}
