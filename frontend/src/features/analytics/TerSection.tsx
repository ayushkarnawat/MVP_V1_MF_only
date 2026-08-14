import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { diffDecimalStrings, formatIndianCurrency } from "@/lib/decimal";
import { cn } from "@/lib/utils";
import { AlertCircle, ArrowDownRight, Layers, Percent, TrendingDown } from "lucide-react";
import type { DirectRegularTerComparison, WeightedTerSummary } from "./types";

export interface TerSectionProps {
  ter: WeightedTerSummary | null;
  comparison: DirectRegularTerComparison | null;
  isLoading?: boolean;
  className?: string;
}

function parseTerNumber(val: string | null): number | null {
  if (val === null || val === undefined) return null;
  const num = parseFloat(val);
  return isNaN(num) ? null : num;
}

function formatTerPercent(val: string | null): string {
  const num = parseTerNumber(val);
  if (num === null) return "N/A";
  return `${num.toFixed(2)}%`;
}

export function TerSection({
  ter,
  comparison,
  isLoading = false,
  className,
}: TerSectionProps) {
  if (isLoading) {
    return (
      <div className={cn("rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 sm:p-6 shadow-2xs space-y-6", className)}>
        <div className="flex items-center justify-between">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-6 w-24 rounded-full" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
        </div>
      </div>
    );
  }

  const weightedTerNum = parseTerNumber(ter?.weighted_ter ?? null);
  const directTerNum = parseTerNumber(comparison?.direct?.weighted_ter ?? null);
  const regularTerNum = parseTerNumber(comparison?.regular?.weighted_ter ?? null);

  const hasUncovered = ter?.uncovered_schemes && ter.uncovered_schemes.length > 0;

  // Max TER value for scaling bar visual
  const maxTerVal = Math.max(0.1, directTerNum || 0, regularTerNum || 0, weightedTerNum || 0, 2.5);

  return (
    <section className={cn("rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 sm:p-6 shadow-2xs space-y-6 transition-colors duration-200", className)}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-display text-lg font-bold tracking-tight text-[var(--color-ink)]">
              Total Expense Ratio (TER) & Cost Analysis
            </h2>
            {ter?.reference_period && (
              <Badge variant="outline" className="text-[10px] font-normal border-[var(--color-border)] text-[var(--color-text-secondary)]">
                Ref: {ter.reference_period}
              </Badge>
            )}
          </div>
          <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
            AUM-weighted annual management fee and cost breakdown across your portfolio
          </p>
        </div>
      </div>

      {/* Main Stat Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Weighted TER Card */}
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]/50 p-4.5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs font-semibold text-[var(--color-text-secondary)] mb-2">
              <span>AUM-Weighted TER</span>
              <Percent className="h-4 w-4 text-[var(--color-accent)]" />
            </div>
            {weightedTerNum !== null ? (
              <div className="flex items-baseline gap-2">
                <span className="font-display text-2xl sm:text-3xl font-bold text-[var(--color-ink)] tabular-nums type-data-large">
                  {formatTerPercent(ter?.weighted_ter ?? null)}
                </span>
                <span className="text-xs text-[var(--color-text-secondary)]">p.a.</span>
              </div>
            ) : (
              <div className="py-1">
                <Badge variant="warning" className="text-xs font-semibold">
                  TER Data Unavailable
                </Badge>
              </div>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-[var(--color-border)]/60 text-[11px] text-[var(--color-text-secondary)] flex items-center justify-between">
            <span>Portfolio Coverage</span>
            <span className="font-medium text-[var(--color-ink)] tabular-nums">
              ₹{formatIndianCurrency(ter?.covered_value || "0")} / ₹{formatIndianCurrency(ter?.total_value || "0")}
            </span>
          </div>
        </div>

        {/* Direct Plan TER Card */}
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]/50 p-4.5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs font-semibold text-[var(--color-text-secondary)] mb-2">
              <span className="flex items-center gap-1.5">
                <span>Direct Plans</span>
                <Badge variant="positive" className="text-[10px] bg-[var(--color-positive)]/10 text-[var(--color-positive)] font-bold px-1.5 py-0">
                  Lower Cost
                </Badge>
              </span>
              <TrendingDown className="h-4 w-4 text-[var(--color-positive)]" />
            </div>
            {directTerNum !== null ? (
              <div className="flex items-baseline gap-2">
                <span className="font-display text-2xl sm:text-3xl font-bold text-[var(--color-positive)] tabular-nums type-data-large">
                  {formatTerPercent(comparison?.direct?.weighted_ter ?? null)}
                </span>
                <span className="text-xs text-[var(--color-text-secondary)]">p.a.</span>
              </div>
            ) : (
              <div className="py-1">
                <span className="text-xs text-[var(--color-text-secondary)] font-medium">No Direct Holdings</span>
              </div>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-[var(--color-border)]/60 text-[11px] text-[var(--color-text-secondary)] flex items-center justify-between">
            <span>Direct Value</span>
            <span className="font-medium text-[var(--color-ink)] tabular-nums">
              ₹{formatIndianCurrency(comparison?.direct?.total_value || "0")}
            </span>
          </div>
        </div>

        {/* Regular Plan TER Card */}
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]/50 p-4.5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs font-semibold text-[var(--color-text-secondary)] mb-2">
              <span className="flex items-center gap-1.5">
                <span>Regular Plans</span>
                <Badge variant="outline" className="text-[10px] text-[var(--color-warning)] border-[var(--color-warning)]/40 font-medium px-1.5 py-0">
                  Includes Commissions
                </Badge>
              </span>
              <Layers className="h-4 w-4 text-[var(--color-warning)]" />
            </div>
            {regularTerNum !== null ? (
              <div className="flex items-baseline gap-2">
                <span className="font-display text-2xl sm:text-3xl font-bold text-[var(--color-warning)] tabular-nums type-data-large">
                  {formatTerPercent(comparison?.regular?.weighted_ter ?? null)}
                </span>
                <span className="text-xs text-[var(--color-text-secondary)]">p.a.</span>
              </div>
            ) : (
              <div className="py-1">
                <span className="text-xs text-[var(--color-text-secondary)] font-medium">No Regular Holdings</span>
              </div>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-[var(--color-border)]/60 text-[11px] text-[var(--color-text-secondary)] flex items-center justify-between">
            <span>Regular Value</span>
            <span className="font-medium text-[var(--color-ink)] tabular-nums">
              ₹{formatIndianCurrency(comparison?.regular?.total_value || "0")}
            </span>
          </div>
        </div>
      </div>

      {/* Direct vs Regular Comparative Bar Visual */}
      {comparison && (directTerNum !== null || regularTerNum !== null) && (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]/30 p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-secondary)]">
              Direct vs. Regular Fee Comparison
            </h3>
            {comparison?.direct?.weighted_ter && comparison?.regular?.weighted_ter && (
              <div className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-positive)]">
                <ArrowDownRight className="h-3.5 w-3.5" />
                <span>
                  Save ~{Number(
                    diffDecimalStrings(comparison.regular.weighted_ter, comparison.direct.weighted_ter)
                  ).toFixed(2)}% per year with Direct
                </span>
              </div>
            )}
          </div>

          {/* Comparative Bars */}
          <div className="space-y-3">
            {/* Direct Bar */}
            <div>
              <div className="flex items-center justify-between text-xs font-medium mb-1">
                <span className="text-[var(--color-ink)]">Direct Plans TER</span>
                <span className="text-[var(--color-positive)] font-bold tabular-nums">
                  {formatTerPercent(comparison.direct.weighted_ter)}
                </span>
              </div>
              <div className="h-3 w-full bg-[var(--color-bg)] rounded-full overflow-hidden border border-[var(--color-border)]/60">
                <div
                  className="h-full bg-[var(--color-positive)] transition-all duration-500 rounded-full"
                  style={{ width: `${Math.min(100, Math.max(4, ((directTerNum || 0) / maxTerVal) * 100))}%` }}
                />
              </div>
            </div>

            {/* Regular Bar */}
            <div>
              <div className="flex items-center justify-between text-xs font-medium mb-1">
                <span className="text-[var(--color-ink)]">Regular Plans TER</span>
                <span className="text-[var(--color-warning)] font-bold tabular-nums">
                  {formatTerPercent(comparison.regular.weighted_ter)}
                </span>
              </div>
              <div className="h-3 w-full bg-[var(--color-bg)] rounded-full overflow-hidden border border-[var(--color-border)]/60">
                <div
                  className="h-full bg-[var(--color-warning)] transition-all duration-500 rounded-full"
                  style={{ width: `${Math.min(100, Math.max(4, ((regularTerNum || 0) / maxTerVal) * 100))}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Uncovered Schemes Warning Callout */}
      {hasUncovered && (
        <div className="rounded-xl border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/5 p-4 flex items-start gap-3">
          <AlertCircle className="h-4 w-4 text-[var(--color-warning)] flex-shrink-0 mt-0.5" />
          <div className="text-xs space-y-1">
            <p className="font-semibold text-[var(--color-ink)]">
              TER Exclusions ({ter!.uncovered_schemes.length} {ter!.uncovered_schemes.length === 1 ? "fund" : "funds"} excluded)
            </p>
            <p className="text-[var(--color-text-secondary)]">
              The weighted TER calculation currently excludes the following funds due to missing AMFI disclosures:
            </p>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {ter!.uncovered_schemes.map((scheme, idx) => (
                <Badge key={idx} variant="outline" className="text-[11px] bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-ink)]">
                  {scheme}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
