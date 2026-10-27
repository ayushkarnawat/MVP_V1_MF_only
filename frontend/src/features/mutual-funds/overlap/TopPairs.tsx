import { useState } from "react";
import { formatPercent } from "../../../lib/format";
import type { AnalyticsCardProps } from "../allocation/allocationLogic";
import { SectionCard } from "../common/SectionCard";
import type { OverlapSummary } from "../types";
import {
  bandOf,
  buildOverlapInsights,
  combinedWeight,
  fundInitials,
  PAIR_LIMIT,
  pairKeyOf,
  sortedPairs,
} from "./overlapLogic";

export interface TopPairsProps extends AnalyticsCardProps<OverlapSummary> {
  selectedKey: string | null;
  onSelect: (key: string) => void;
}

export function TopPairs({
  state,
  data,
  onRetry,
  selectedKey,
  onSelect,
}: TopPairsProps) {
  const [showAll, setShowAll] = useState(false);

  const pairs = data ? sortedPairs(data.pairs_above_low) : [];
  const displayed = showAll ? pairs : pairs.slice(0, PAIR_LIMIT);
  const insights = data ? buildOverlapInsights(data) : [];

  return (
    <SectionCard
      title="3. Top Overlapping Fund Pairs"
      info="The pairs of your funds that share the most stock holdings, largest first. Click a pair to see its shared stocks beside the heatmap."
      state={state}
      onRetry={onRetry}
    >
      {data && (
        <div className="space-y-4">
          {pairs.length === 0 ? (
            <p data-testid="pairs-empty" className="text-sm text-[var(--ui-text-muted)]">
              No pairs above this threshold.
            </p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table aria-label="Top overlapping fund pairs" className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-[var(--ui-divider)] text-xs text-[var(--ui-text-muted)]">
                      <th scope="col" className="py-2.5 pl-2 pr-3 font-medium">
                        #
                      </th>
                      <th scope="col" className="py-2.5 px-3 font-medium">
                        Fund 1
                      </th>
                      <th scope="col" className="py-2.5 px-3 font-medium">
                        Fund 2
                      </th>
                      <th scope="col" className="py-2.5 px-3 font-medium">
                        Overlap
                      </th>
                      <th scope="col" className="py-2.5 px-3 font-medium">
                        Shared Stocks
                      </th>
                      <th scope="col" className="py-2.5 pl-3 pr-2 font-medium">
                        Combined Weight
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayed.map((pair, index) => {
                      const key = pairKeyOf(pair);
                      const isSelected = selectedKey === key;
                      const band = bandOf(pair.overlap_pct, data.bands);
                      const cw = combinedWeight(pair, data.total_portfolio_value);
                      const barColor =
                        band === "low"
                          ? "var(--pos)"
                          : band === "moderate"
                            ? "var(--warn-text)"
                            : "var(--neg)";

                      return (
                        <tr
                          key={key}
                          data-testid={`pair-row-${key}`}
                          data-selected={isSelected}
                          className={`border-b border-[var(--ui-divider)] transition-colors hover:bg-[var(--ui-row-hover)] ${
                            isSelected ? "bg-[var(--ui-card)] font-medium" : ""
                          }`}
                        >
                          <td className="py-3 pl-2 pr-3 text-xs text-[var(--ui-text-muted)]">
                            {index + 1}
                          </td>
                          <td className="py-3 px-3">
                            <button
                              type="button"
                              aria-pressed={isSelected}
                              aria-label={`${pair.fund_a.scheme_name} × ${pair.fund_b.scheme_name}`}
                              data-testid={`pair-button-${key}`}
                              data-clickable=""
                              data-effect="select"
                              onClick={() => onSelect(key)}
                              className="inline-flex items-center gap-2 text-left text-[var(--ui-text)] hover:underline"
                            >
                              <span
                                aria-hidden="true"
                                className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--ui-card)] text-[10px] font-semibold border border-[var(--ui-divider)]"
                              >
                                {fundInitials(pair.fund_a.scheme_name)}
                              </span>
                              <span className="truncate max-w-[200px]">{pair.fund_a.scheme_name}</span>
                            </button>
                          </td>
                          <td className="py-3 px-3">
                            <div className="inline-flex items-center gap-2 text-[var(--ui-text)]">
                              <span
                                aria-hidden="true"
                                className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--ui-card)] text-[10px] font-semibold border border-[var(--ui-divider)]"
                              >
                                {fundInitials(pair.fund_b.scheme_name)}
                              </span>
                              <span className="truncate max-w-[200px]">{pair.fund_b.scheme_name}</span>
                            </div>
                          </td>
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 w-20 rounded-full bg-[var(--ui-divider)] overflow-hidden">
                                <span
                                  data-testid={`pair-bar-${key}`}
                                  data-band={band}
                                  style={{
                                    width: `${Math.min(100, Number(pair.overlap_pct))}%`,
                                    backgroundColor: barColor,
                                  }}
                                  className="block h-full"
                                />
                              </div>
                              <span data-testid={`pair-overlap-${key}`} className="text-xs font-semibold text-[var(--ui-text)]">
                                {formatPercent(pair.overlap_pct, { digits: 0 })}
                              </span>
                            </div>
                          </td>
                          <td data-testid={`pair-shared-${key}`} className="py-3 px-3 text-xs text-[var(--ui-text-muted)]">
                            {pair.common_total}
                          </td>
                          <td data-testid={`pair-combined-${key}`} className="py-3 pl-3 pr-2 text-xs text-[var(--ui-text)]">
                            {cw ? formatPercent(cw, { digits: 1 }) : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {pairs.length > PAIR_LIMIT && (
                <div className="pt-1">
                  <button
                    type="button"
                    aria-expanded={showAll}
                    data-clickable=""
                    data-effect="expand"
                    onClick={() => setShowAll(!showAll)}
                    className="text-xs font-semibold text-[var(--pos-text)] hover:underline inline-flex items-center gap-1"
                  >
                    {showAll ? "Show fewer" : "View all fund overlaps →"}
                  </button>
                </div>
              )}

              {insights.length > 0 && (
                <aside
                  data-testid="key-insights"
                  aria-label="Key insights"
                  className="rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-card)] p-4 space-y-2 mt-4"
                >
                  <h4 className="text-xs font-semibold text-[var(--ui-text)]">Key insights:</h4>
                  <ul className="list-disc pl-4 space-y-1 text-xs text-[var(--ui-text-muted)]">
                    {insights.map((sentence, idx) => (
                      <li key={idx}>{sentence}</li>
                    ))}
                  </ul>
                </aside>
              )}
            </>
          )}
        </div>
      )}
    </SectionCard>
  );
}
