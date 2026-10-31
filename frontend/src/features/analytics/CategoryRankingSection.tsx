import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Award, HelpCircle, Info } from "lucide-react";
import type { CategoryRankingSummary } from "./types";
import { PeriodReturnsTable } from "./PeriodReturnsTable";

export interface CategoryRankingSectionProps {
  ranking: CategoryRankingSummary | null;
  isLoading?: boolean;
  className?: string;
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
            No category comparison data available
          </p>
          <p className="text-xs text-[var(--color-text-secondary)]/70 mt-1 max-w-sm">
            Import holdings to compare returns with category averages.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {funds.map((fund) => {
            const isUnavailable = fund.category_unavailable;
            const isInsufficient = fund.insufficient_history;
            const isThin = fund.thin_category;
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
                          Small comparison group
                        </Badge>
                      )}
                    </div>
                  </div>

                </div>

                {(fund.plan_type === "direct" || fund.plan_type === "regular") && <p className="mt-1 text-xs text-[var(--color-text-secondary)]">Compared with {fund.plan_type === "direct" ? "Direct" : "Regular"} plan peers</p>}
                <PeriodReturnsTable periods={fund.periods} />

                {/* Edge State Callouts vs Active Percentile Gauge */}
                {isUnavailable ? (
                  <div className="mt-3 text-xs text-[var(--color-text-secondary)] bg-[var(--color-surface)] p-3 rounded-lg border border-[var(--color-border)] flex items-center gap-2">
                    <HelpCircle className="h-4 w-4 text-[var(--color-warning)] flex-shrink-0" />
                    <span>Category data is not available for this fund.</span>
                  </div>
                ) : isInsufficient ? (
                  <div className="mt-3 text-xs text-[var(--color-text-secondary)] bg-[var(--color-surface)] p-3 rounded-lg border border-[var(--color-border)] flex items-center gap-2">
                    <Info className="h-4 w-4 text-[var(--color-warning)] flex-shrink-0" />
                    <span>Needs at least 3 years of history</span>
                  </div>
                ) : !fund.periods || Object.keys(fund.periods).length === 0 ? (
                  <p className="mt-3 text-xs text-[var(--color-text-secondary)]">Return comparisons are updating.</p>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
