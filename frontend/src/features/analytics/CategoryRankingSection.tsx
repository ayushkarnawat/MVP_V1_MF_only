import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { diffDecimalStrings, toPercentString } from "@/lib/decimal";
import { cn } from "@/lib/utils";
import { Award, HelpCircle, Info, TrendingUp } from "lucide-react";
import type { CategoryRankingSummary } from "./types";

export interface CategoryRankingSectionProps {
  ranking: CategoryRankingSummary | null;
  isLoading?: boolean;
  className?: string;
}

function parsePercent(val: string | null): number | null {
  if (val === null || val === undefined) return null;
  const num = parseFloat(val);
  return isNaN(num) ? null : num;
}

function formatPercentString(val: string | null): string {
  const num = parsePercent(val);
  if (num === null) return "N/A";
  const sign = num > 0 ? "+" : "";
  return `${sign}${num.toFixed(2)}%`;
}

function formatRawFractionPercent(val: string | null): string {
  return val === null ? "N/A" : formatPercentString(toPercentString(val));
}

export function CategoryRankingSection({
  ranking,
  isLoading = false,
  className,
}: CategoryRankingSectionProps) {
  if (isLoading) {
    return (
      <div className={cn("rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 sm:p-6 shadow-2xs space-y-4", className)}>
        <Skeleton className="h-6 w-56" />
        <div className="space-y-3">
          <Skeleton className="h-16 w-full rounded-lg" />
          <Skeleton className="h-16 w-full rounded-lg" />
          <Skeleton className="h-16 w-full rounded-lg" />
        </div>
      </div>
    );
  }

  const funds = ranking?.funds ?? [];
  const hasFunds = funds.length > 0;

  return (
    <section className={cn("rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 sm:p-6 shadow-2xs space-y-6 transition-colors duration-200", className)}>
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-display text-lg font-bold tracking-tight text-[var(--color-ink)]">
              SEBI Category Ranking & Peer Comparison
            </h2>
            <Award className="h-4 w-4 text-[var(--color-accent)]" />
          </div>
          <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
            How your held funds perform relative to peers in their respective SEBI categories
          </p>
        </div>
      </div>

      {!hasFunds ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-sm font-medium text-[var(--color-text-secondary)]">
            No category ranking data available
          </p>
          <p className="text-xs text-[var(--color-text-secondary)]/70 mt-1 max-w-sm">
            Import holdings to see how your funds compare against category peer averages and percentile rankings.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {funds.map((fund) => {
            const percentileNum = parsePercent(fund.percentile);
            const schemeReturnNum = parsePercent(fund.scheme_return);
            const categoryAvgNum = parsePercent(fund.category_avg_return);

            const isUnavailable = fund.category_unavailable;
            const isInsufficient = fund.insufficient_history;
            const isThin = fund.thin_category;

            // Outperformance difference — exact decimal subtraction on the raw
            // strings, not the already-parsed floats, per the money/percentage
            // Decimal-discipline rule (see lib/decimal.ts).
            const diff =
              fund.scheme_return !== null && fund.category_avg_return !== null
                ? Number(toPercentString(diffDecimalStrings(fund.scheme_return, fund.category_avg_return)))
                : null;

            return (
              <div
                key={fund.scheme_id}
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]/40 p-4 sm:p-5 transition-all hover:bg-[var(--color-bg)]/80"
              >
                {/* Fund Name & Category Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                  <div>
                    <h3 className="font-display text-sm font-bold text-[var(--color-ink)]">
                      {fund.scheme_name}
                    </h3>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="text-xs text-[var(--color-text-secondary)] font-medium">
                        {fund.sebi_category || "Unclassified Category"}
                      </span>

                      {/* Status Badges */}
                      {isUnavailable && (
                        <Badge variant="warning" className="text-[10px] font-semibold px-2 py-0">
                          Category Unavailable
                        </Badge>
                      )}

                      {isInsufficient && (
                        <Badge variant="warning" className="text-[10px] font-semibold px-2 py-0">
                          Insufficient History
                        </Badge>
                      )}

                      {isThin && !isUnavailable && !isInsufficient && (
                        <Badge variant="outline" className="text-[10px] border-[var(--color-warning)] text-[var(--color-warning)] px-2 py-0">
                          Thin Category ({fund.category_size} peers)
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Scheme Return vs Category Avg summary pill */}
                  {!isUnavailable && !isInsufficient && schemeReturnNum !== null && (
                    <div className="flex items-center gap-3 self-start sm:self-auto bg-[var(--color-surface)] px-3 py-1.5 rounded-lg border border-[var(--color-border)]">
                      <div className="text-right">
                        <span className="text-[10px] text-[var(--color-text-secondary)] uppercase block font-semibold">
                          Fund Return
                        </span>
                        <span className={cn(
                          "text-xs font-bold tabular-nums type-data",
                          schemeReturnNum >= 0 ? "text-[var(--color-positive)]" : "text-[var(--color-negative)]"
                        )}>
                          {formatRawFractionPercent(fund.scheme_return)}
                        </span>
                      </div>

                      {categoryAvgNum !== null && (
                        <>
                          <div className="h-6 w-px bg-[var(--color-border)]" />
                          <div className="text-right">
                            <span className="text-[10px] text-[var(--color-text-secondary)] uppercase block font-semibold">
                              Category Avg
                            </span>
                            <span className="text-xs font-semibold text-[var(--color-ink)] tabular-nums type-data">
                              {formatRawFractionPercent(fund.category_avg_return)}
                            </span>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Edge State Callouts vs Active Percentile Gauge */}
                {isUnavailable ? (
                  <div className="mt-3 text-xs text-[var(--color-text-secondary)] bg-[var(--color-surface)] p-3 rounded-lg border border-[var(--color-border)] flex items-center gap-2">
                    <HelpCircle className="h-4 w-4 text-[var(--color-warning)] flex-shrink-0" />
                    <span>SEBI category data is not available for this fund scheme to compute rank positioning.</span>
                  </div>
                ) : isInsufficient ? (
                  <div className="mt-3 text-xs text-[var(--color-text-secondary)] bg-[var(--color-surface)] p-3 rounded-lg border border-[var(--color-border)] flex items-center gap-2">
                    <Info className="h-4 w-4 text-[var(--color-warning)] flex-shrink-0" />
                    <span>Fund has insufficient historical NAV records to meet category ranking requirements.</span>
                  </div>
                ) : (
                  <div className="mt-4 pt-3 border-t border-[var(--color-border)]/60 space-y-2">
                    {/* Percentile Rank Header & Numbers */}
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-[var(--color-ink)] flex items-center gap-1.5">
                        <span>Category Rank:</span>
                        <span className="text-[var(--color-accent)] font-bold tabular-nums">
                          #{fund.category_rank ?? "N/A"} of {fund.category_size} funds
                        </span>
                      </span>

                      {percentileNum !== null && (
                        <span className="text-xs font-bold text-[var(--color-ink)] tabular-nums">
                          Top {(100 - percentileNum).toFixed(0)}% ({percentileNum.toFixed(1)} percentile)
                        </span>
                      )}
                    </div>

                    {/* Percentile Position Gauge Bar */}
                    {percentileNum !== null && (
                      <div className="relative h-2.5 w-full bg-[var(--color-surface)] rounded-full overflow-hidden border border-[var(--color-border)]">
                        <div
                          className="h-full bg-gradient-to-r from-[var(--color-accent)] to-[var(--color-positive)] transition-all duration-500 rounded-full"
                          style={{ width: `${Math.min(100, Math.max(2, percentileNum))}%` }}
                        />
                      </div>
                    )}

                    {/* Outperformance / Underperformance Indicator */}
                    {diff !== null && (
                      <div className="flex items-center gap-1.5 text-xs text-[var(--color-text-secondary)] pt-1">
                        <TrendingUp className={cn(
                          "h-3.5 w-3.5",
                          diff >= 0 ? "text-[var(--color-positive)]" : "text-[var(--color-negative)]"
                        )} />
                        <span>
                          {diff >= 0 ? (
                            <>Outperforming category average by <strong className="text-[var(--color-positive)] font-semibold tabular-nums">+{diff.toFixed(2)}%</strong></>
                          ) : (
                            <>Trailing category average by <strong className="text-[var(--color-negative)] font-semibold tabular-nums">{diff.toFixed(2)}%</strong></>
                          )}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
