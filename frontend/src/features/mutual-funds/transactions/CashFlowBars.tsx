import { useMemo } from "react";
import { formatRupees } from "../../../lib/format";
import type { InvestmentWithdrawalBucket } from "../types";
import {
  barHeights,
  type Granularity,
  outflow,
  periodTitle,
  shortPeriod,
} from "./transactionsLogic";

export interface CashFlowBarsProps {
  buckets: InvestmentWithdrawalBucket[];
  granularity: Granularity;
  onGranularity: (g: Granularity) => void;
  selectedPeriod: string | null;
  onSelect: (period: string) => void;
}

export function CashFlowBars({
  buckets,
  granularity,
  onGranularity,
  selectedPeriod,
  onSelect,
}: CashFlowBarsProps) {
  const heights = useMemo(() => barHeights(buckets), [buckets]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-[var(--ui-text-muted)]">
          Click any period to see its dated, per-fund transactions below.
        </p>

        {/* Period toggle */}
        <div
          role="group"
          aria-label="Period"
          className="inline-flex rounded-lg border border-[var(--ui-divider)] p-0.5"
        >
          <button
            type="button"
            aria-pressed={granularity === "monthly"}
            data-clickable=""
            data-effect="switch"
            onClick={() => onGranularity("monthly")}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              granularity === "monthly"
                ? "bg-[var(--ui-card)] text-[var(--ui-text)] shadow-sm"
                : "text-[var(--ui-text-muted)] hover:text-[var(--ui-text)]"
            }`}
          >
            Monthly
          </button>
          <button
            type="button"
            aria-pressed={granularity === "yearly"}
            data-clickable=""
            data-effect="switch"
            onClick={() => onGranularity("yearly")}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              granularity === "yearly"
                ? "bg-[var(--ui-card)] text-[var(--ui-text)] shadow-sm"
                : "text-[var(--ui-text-muted)] hover:text-[var(--ui-text)]"
            }`}
          >
            Yearly
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-[var(--ui-text-muted)]">
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-[var(--pos)]" />
          <span>Invested</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-[var(--neg)]" />
          <span>Withdrawn + switched out</span>
        </div>
      </div>

      {/* Bars container */}
      <div
        role="group"
        aria-label="Cash flow by period"
        data-testid="cash-bars"
        className="flex items-end gap-3 overflow-x-auto pb-2 pt-8"
      >
        {buckets.map((b, index) => {
          const isSelected = selectedPeriod === b.period;
          const h = heights[index] ?? { invested: 0, outflow: 0 };
          const outVal = outflow(b);

          return (
            <button
              key={b.period}
              type="button"
              data-testid={`period-${b.period}`}
              aria-pressed={isSelected}
              data-selected={isSelected ? "true" : "false"}
              aria-label={`${periodTitle(b.period)}: invested ${formatRupees(
                b.invested
              )}, withdrawn and switched out ${formatRupees(outVal)}`}
              data-clickable=""
              data-effect="select"
              onClick={() => onSelect(b.period)}
              className={`flex flex-col items-center gap-2 group transition-all shrink-0 ${
                isSelected
                  ? "opacity-100"
                  : "opacity-80 hover:opacity-100"
              }`}
            >
              <div className="flex h-36 items-end gap-1 px-1">
                {/* Invested bar */}
                <div className="flex h-full w-3.5 items-end rounded-t bg-[var(--ui-divider)] overflow-hidden">
                  <span
                    data-testid={`bar-invested-${b.period}`}
                    style={{ height: `${h.invested}%` }}
                    className="w-full bg-[var(--pos)] rounded-t transition-all"
                  />
                </div>

                {/* Outflow bar */}
                <div className="flex h-full w-3.5 items-end rounded-t bg-[var(--ui-divider)] overflow-hidden">
                  <span
                    data-testid={`bar-out-${b.period}`}
                    style={{ height: `${h.outflow}%` }}
                    className="w-full bg-[var(--neg)] rounded-t transition-all"
                  />
                </div>
              </div>

              <span
                className={`text-[11px] transition-colors ${
                  isSelected
                    ? "font-bold text-[var(--pos-text)]"
                    : "text-[var(--ui-text-muted)] group-hover:text-[var(--ui-text)]"
                }`}
              >
                {shortPeriod(b.period)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
