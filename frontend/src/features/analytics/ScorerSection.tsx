import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatIndianCurrency } from "@/lib/decimal";
import { cn } from "@/lib/utils";
import { AlertCircle, ChevronRight, HelpCircle, Star } from "lucide-react";
import type { PortfolioScoreSummary } from "./types";

export interface ScorerSectionProps {
  scoreSummary: PortfolioScoreSummary | null;
  isLoading?: boolean;
  onSelectFundScore?: (schemeId: string, schemeName: string) => void;
  className?: string;
}

function parseScoreNum(val: string | null): number | null {
  if (val === null || val === undefined) return null;
  const num = parseFloat(val);
  return isNaN(num) ? null : num;
}

export function ScorerSection({
  scoreSummary,
  isLoading = false,
  onSelectFundScore,
  className,
}: ScorerSectionProps) {
  if (isLoading) {
    return (
      <div className={cn("rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 sm:p-6 shadow-2xs space-y-6", className)}>
        <div className="flex items-center justify-between">
          <Skeleton className="h-6 w-56" />
          <Skeleton className="h-8 w-24 rounded-lg" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
        </div>
        <div className="space-y-3">
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-20 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  const weightedScoreNum = parseScoreNum(scoreSummary?.weighted_score ?? null);
  const funds = scoreSummary?.funds ?? [];
  const hasFunds = funds.length > 0;
  const hasUncovered = scoreSummary?.uncovered_schemes && scoreSummary.uncovered_schemes.length > 0;

  return (
    <section className={cn("rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 sm:p-6 shadow-2xs space-y-6 transition-colors duration-200", className)}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-display text-lg font-bold tracking-tight text-[var(--color-ink)]">
              Fund Quality Scorer & Composite Ratings
            </h2>
            <Star className="h-4 w-4 text-[var(--color-accent)] fill-[var(--color-accent)]/20" />
          </div>
          <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
            Differentiated composite ratings evaluating 45% Return, 30% Downside Risk & 25% Consistency vs SEBI peers
          </p>
        </div>
      </div>

      {/* Hero Stat: Portfolio Weighted Score */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]/50 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-secondary)]">
              Portfolio Weighted Score
            </span>
            <Badge variant="outline" className="text-[10px] border-[var(--color-accent)]/30 text-[var(--color-accent)] font-semibold">
              AUM Weighted
            </Badge>
          </div>
          {weightedScoreNum !== null ? (
            <div className="flex items-baseline gap-2">
              <span className="font-display text-3xl font-bold text-[var(--color-ink)] tabular-nums type-display">
                {weightedScoreNum.toFixed(1)}
              </span>
              <span className="text-xs text-[var(--color-text-secondary)]">/ 100</span>
              <span className="text-xs font-semibold text-[var(--color-positive)] ml-2">
                {weightedScoreNum >= 70 ? "High Quality Portfolio" : weightedScoreNum >= 50 ? "Moderate Quality Portfolio" : "Needs Review"}
              </span>
            </div>
          ) : (
            <div className="py-1">
              <Badge variant="warning" className="text-xs font-semibold">
                Score Unavailable / Insufficient History
              </Badge>
            </div>
          )}
        </div>

        <div className="text-right text-xs text-[var(--color-text-secondary)] self-start sm:self-auto border-t sm:border-t-0 pt-2 sm:pt-0 border-[var(--color-border)]/60">
          <span>Scored Value Coverage:</span>
          <span className="font-semibold text-[var(--color-ink)] block tabular-nums">
            ₹{formatIndianCurrency(scoreSummary?.covered_value ?? "0")} / ₹{formatIndianCurrency(scoreSummary?.total_value ?? "0")}
          </span>
        </div>
      </div>

      {/* Uncovered Schemes Callout */}
      {hasUncovered && (
        <div className="rounded-xl border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/5 p-4 flex items-start gap-3">
          <AlertCircle className="h-4 w-4 text-[var(--color-warning)] flex-shrink-0 mt-0.5" />
          <div className="text-xs space-y-1">
            <p className="font-semibold text-[var(--color-ink)]">
              Unscored Funds ({scoreSummary!.uncovered_schemes.length} {scoreSummary!.uncovered_schemes.length === 1 ? "fund" : "funds"})
            </p>
            <p className="text-[var(--color-text-secondary)]">
              The following holdings could not be scored due to missing category benchmark data or short track record:
            </p>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {scoreSummary!.uncovered_schemes.map((scheme, idx) => (
                <Badge key={idx} variant="outline" className="text-[11px] bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-ink)]">
                  {scheme}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Held Fund Score Rows */}
      {!hasFunds ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-sm font-medium text-[var(--color-text-secondary)]">
            No fund score data available
          </p>
          <p className="text-xs text-[var(--color-text-secondary)]/70 mt-1 max-w-sm">
            Import holdings with sufficient history to calculate composite Return, Risk, and Consistency ratings.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {funds.map((fund) => {
            const finalScore = parseScoreNum(fund.final_score);
            const returnPct = parseScoreNum(fund.return_percentile);
            const riskPct = parseScoreNum(fund.risk_percentile);
            const consistencyPct = parseScoreNum(fund.consistency_hit_rate);
            const tier = fund.risk_adjusted_tier;

            const isUnavailable = fund.category_unavailable;
            const isInsufficient = fund.insufficient_history;

            return (
              <div
                key={fund.scheme_id}
                onClick={() => onSelectFundScore?.(fund.scheme_id, fund.scheme_name)}
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]/40 p-4 transition-all hover:bg-[var(--color-bg)]/80 hover:border-[var(--color-accent)]/40 cursor-pointer group space-y-3"
              >
                {/* Row Title Bar */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="h-8 w-8 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] flex items-center justify-center font-display font-bold text-xs text-[var(--color-accent)] shadow-2xs group-hover:scale-105 transition-transform">
                      {tier !== null ? `T${tier}` : "—"}
                    </div>
                    <div>
                      <h3 className="font-display text-sm font-bold text-[var(--color-ink)] group-hover:text-[var(--color-accent)] transition-colors">
                        {fund.scheme_name}
                      </h3>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {isUnavailable && (
                          <Badge variant="warning" className="text-[10px] px-1.5 py-0 font-semibold">
                            Category Unavailable
                          </Badge>
                        )}
                        {isInsufficient && (
                          <Badge variant="warning" className="text-[10px] px-1.5 py-0 font-semibold">
                            Insufficient History
                          </Badge>
                        )}
                        {fund.thin_category && !isUnavailable && !isInsufficient && (
                          <Badge variant="outline" className="text-[10px] text-[var(--color-warning)] border-[var(--color-warning)]/40 px-1.5 py-0">
                            Thin Category
                          </Badge>
                        )}
                        {!isUnavailable && !isInsufficient && (
                          <span className="text-[11px] text-[var(--color-text-secondary)]">
                            Tap for S20 Score Breakdown
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Headline Score & Tier Badge */}
                  {!isUnavailable && !isInsufficient && finalScore !== null ? (
                    <div className="flex items-center gap-3 self-end sm:self-auto">
                      <div className="text-right">
                        <span className="text-[10px] uppercase tracking-wider text-[var(--color-text-secondary)] font-bold block">
                          Unifolio Score
                        </span>
                        <div className="flex items-baseline gap-1 justify-end">
                          <span className="font-display text-lg font-bold text-[var(--color-ink)] tabular-nums type-data-large">
                            {finalScore.toFixed(1)}
                          </span>
                          <span className="text-[11px] font-medium text-[var(--color-text-secondary)]">/ 100</span>
                        </div>
                      </div>
                      <Badge className="bg-[var(--color-accent)] text-white font-bold text-xs px-2.5 py-1 shadow-2xs">
                        Tier {tier}
                      </Badge>
                      <ChevronRight className="h-4 w-4 text-[var(--color-text-secondary)] group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)]">
                      <HelpCircle className="h-4 w-4 text-[var(--color-warning)]" />
                      <span>Unscored</span>
                    </div>
                  )}
                </div>

                {/* Score Breakdown Bar Indicators (Rule: Never bare number alone!) */}
                {!isUnavailable && !isInsufficient && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 border-t border-[var(--color-border)]/60 text-xs">
                    {/* Return 45% */}
                    <div className="bg-[var(--color-surface)] p-2.5 rounded-lg border border-[var(--color-border)] flex items-center justify-between">
                      <span className="text-[11px] font-medium text-[var(--color-text-secondary)]">
                        Return (45%)
                      </span>
                      <span className="font-bold text-[var(--color-ink)] tabular-nums">
                        {returnPct !== null ? `${returnPct.toFixed(1)}%ile` : "N/A"}
                      </span>
                    </div>

                    {/* Risk 30% */}
                    <div className="bg-[var(--color-surface)] p-2.5 rounded-lg border border-[var(--color-border)] flex items-center justify-between">
                      <span className="text-[11px] font-medium text-[var(--color-text-secondary)]">
                        Downside Risk (30%)
                      </span>
                      <span className="font-bold text-[var(--color-positive)] tabular-nums">
                        {riskPct !== null ? `${riskPct.toFixed(1)}%ile` : "N/A"}
                      </span>
                    </div>

                    {/* Consistency 25% */}
                    <div className="bg-[var(--color-surface)] p-2.5 rounded-lg border border-[var(--color-border)] flex items-center justify-between">
                      <span className="text-[11px] font-medium text-[var(--color-text-secondary)]">
                        12M Consistency (25%)
                      </span>
                      <span className="font-bold text-[var(--color-accent)] tabular-nums">
                        {consistencyPct !== null ? `${consistencyPct.toFixed(1)}%` : "N/A"}
                      </span>
                    </div>
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
