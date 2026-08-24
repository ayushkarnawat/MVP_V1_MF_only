import { useState } from "react";
import { AllocationDonut } from "@/components/AllocationDonut";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { AnalyticsAllocationSummary } from "./types";

export interface AllocationSectionProps {
  summary: AnalyticsAllocationSummary | null;
  isLoading?: boolean;
  className?: string;
  /** Renders both Category and AMC breakdowns stacked, with no tab toggle,
   * for the static PDF export print route (mirrors BenchmarkSection's
   * printMode — a static document can't click a tab to reveal the other one). */
  printMode?: boolean;
}

export function AllocationSection({
  summary,
  isLoading = false,
  className,
  printMode = false,
}: AllocationSectionProps) {
  const [tab, setTab] = useState<"category" | "amc">("category");

  if (isLoading) {
    return (
      <div className={cn("rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 sm:p-6 shadow-2xs", className)}>
        <div className="flex items-center justify-between mb-6">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-8 w-40 rounded-lg" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
          <Skeleton className="h-56 w-56 rounded-full mx-auto" />
          <div className="space-y-3">
            <Skeleton className="h-8 w-full rounded-lg" />
            <Skeleton className="h-8 w-full rounded-lg" />
            <Skeleton className="h-8 w-full rounded-lg" />
          </div>
        </div>
      </div>
    );
  }

  const activeData = tab === "category" ? summary?.by_category : summary?.by_amc;
  const hasData = activeData && activeData.length > 0;

  return (
    <section className={cn("rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 sm:p-6 shadow-2xs transition-colors duration-200", className)}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h2 className="font-display text-lg font-bold tracking-tight text-[var(--color-ink)]">
            Portfolio Allocation
          </h2>
          <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
            Asset distribution across SEBI categories and Fund Houses (AMCs)
          </p>
        </div>

        {/* Category vs AMC Segmented Toggle — not rendered in printMode,
            since a static document shows both breakdowns at once instead */}
        {!printMode && (
          <div className="inline-flex items-center p-1 rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] shadow-2xs self-start sm:self-auto">
            <button
              type="button"
              className={cn(
                "px-3 py-1 text-xs font-medium rounded-lg transition-all duration-150 cursor-pointer",
                tab === "category"
                  ? "bg-[var(--color-surface)] text-[var(--color-ink)] font-semibold shadow-xs"
                  : "text-[var(--color-text-secondary)] hover:text-[var(--color-ink)]"
              )}
              onClick={() => setTab("category")}
            >
              By Category
            </button>
            <button
              type="button"
              className={cn(
                "px-3 py-1 text-xs font-medium rounded-lg transition-all duration-150 cursor-pointer",
                tab === "amc"
                  ? "bg-[var(--color-surface)] text-[var(--color-ink)] font-semibold shadow-xs"
                  : "text-[var(--color-text-secondary)] hover:text-[var(--color-ink)]"
              )}
              onClick={() => setTab("amc")}
            >
              By AMC
            </button>
          </div>
        )}
      </div>

      {printMode ? (
        <div className="space-y-8">
          {summary?.by_category && summary.by_category.length > 0 && (
            <AllocationDonut
              data={summary.by_category}
              totalValue={summary?.total_value}
              title="SEBI Category Distribution"
              animate={false}
            />
          )}
          {summary?.by_amc && summary.by_amc.length > 0 && (
            <AllocationDonut
              data={summary.by_amc}
              totalValue={summary?.total_value}
              title="Fund House (AMC) Distribution"
              animate={false}
            />
          )}
        </div>
      ) : !hasData ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-sm font-medium text-[var(--color-text-secondary)]">
            No allocation data available for this selection
          </p>
          <p className="text-xs text-[var(--color-text-secondary)]/70 mt-1 max-w-sm">
            Import a CAS statement with valid mutual fund holdings to visualize category and AMC breakdown.
          </p>
        </div>
      ) : (
        <AllocationDonut
          data={activeData}
          totalValue={summary?.total_value}
          title={tab === "category" ? "SEBI Category Distribution" : "Fund House (AMC) Distribution"}
        />
      )}
    </section>
  );
}
