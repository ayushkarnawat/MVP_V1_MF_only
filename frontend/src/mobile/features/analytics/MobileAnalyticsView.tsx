import { useState, useEffect } from "react";
import { formatIndianCurrency } from "@/lib/decimal";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, Sparkles } from "lucide-react";
import {
  getAggregateAllocation,
  getMemberAllocation,
  getAggregateTer,
  getMemberTer,
  getAggregateDirectRegularTer,
  getMemberDirectRegularTer,
  getAggregateCategoryRanking,
  getMemberCategoryRanking,
} from "@/features/analytics/api";
import { AllocationSection } from "@/features/analytics/AllocationSection";
import { TerSection } from "@/features/analytics/TerSection";
import { CategoryRankingSection } from "@/features/analytics/CategoryRankingSection";
import type {
  AnalyticsAllocationSummary,
  WeightedTerSummary,
  DirectRegularTerComparison,
  CategoryRankingSummary,
} from "@/features/analytics/types";

export interface MobileAnalyticsViewProps {
  memberId?: string | null;
}

export function MobileAnalyticsView({ memberId = null }: MobileAnalyticsViewProps) {
  const [allocation, setAllocation] = useState<AnalyticsAllocationSummary | null>(null);
  const [ter, setTer] = useState<WeightedTerSummary | null>(null);
  const [terComparison, setTerComparison] = useState<DirectRegularTerComparison | null>(null);
  const [ranking, setRanking] = useState<CategoryRankingSummary | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    async function fetchData() {
      try {
        if (!memberId) {
          const [allocRes, terRes, dirRegRes, rankRes] = await Promise.all([
            getAggregateAllocation(),
            getAggregateTer(),
            getAggregateDirectRegularTer(),
            getAggregateCategoryRanking(),
          ]);
          if (!isMounted) return;
          setAllocation(allocRes.allocation);
          setTer(terRes.ter);
          setTerComparison(dirRegRes.ter);
          setRanking(rankRes.ranking);
        } else {
          const [allocRes, terRes, dirRegRes, rankRes] = await Promise.all([
            getMemberAllocation(memberId),
            getMemberTer(memberId),
            getMemberDirectRegularTer(memberId),
            getMemberCategoryRanking(memberId),
          ]);
          if (!isMounted) return;
          setAllocation(allocRes);
          setTer(terRes);
          setTerComparison(dirRegRes);
          setRanking(rankRes);
        }
      } catch (err: any) {
        if (!isMounted) return;
        setError(err.message || "Failed to load mobile analytics");
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    fetchData();

    return () => {
      isMounted = false;
    };
  }, [memberId]);

  if (error) {
    return (
      <div className="p-4 space-y-4 text-center">
        <div className="rounded-2xl border border-[var(--color-negative)]/30 bg-[var(--color-negative)]/5 p-5 space-y-2">
          <AlertCircle className="h-6 w-6 text-[var(--color-negative)] mx-auto" />
          <p className="text-xs font-bold text-[var(--color-ink)]">Analytics Load Error</p>
          <p className="text-[11px] text-[var(--color-text-secondary)]">{error}</p>
        </div>
      </div>
    );
  }

  const totalValStr = allocation?.total_value || "0";

  return (
    <div className="space-y-6 pb-24 px-3 sm:px-4 pt-3 animate-in fade-in duration-200">
      {/* Mobile Header Card */}
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-2xs space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-accent)]">
            Mobile Analytics
          </span>
          <Badge variant="outline" className="text-[9px] px-1.5 py-0">
            Phase 1
          </Badge>
        </div>
        <div>
          <span className="text-[11px] text-[var(--color-text-secondary)] font-medium block">
            Portfolio Total Value
          </span>
          {loading ? (
            <Skeleton className="h-7 w-32 mt-1" />
          ) : (
            <span className="font-display text-2xl font-bold text-[var(--color-ink)] tabular-nums type-display">
              ₹{formatIndianCurrency(totalValStr)}
            </span>
          )}
        </div>
      </div>

      {/* Allocation */}
      <AllocationSection summary={allocation} isLoading={loading} />

      {/* TER & Cost */}
      <TerSection ter={ter} comparison={terComparison} isLoading={loading} />

      {/* Category Ranking */}
      <CategoryRankingSection ranking={ranking} isLoading={loading} />

      {/* Phase 2 Placeholder Banner */}
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg)] p-4 text-center space-y-2">
        <div className="inline-flex items-center justify-center h-8 w-8 rounded-full bg-[var(--color-accent)]/10 text-[var(--color-accent)]">
          <Sparkles className="h-4 w-4" />
        </div>
        <p className="text-xs font-bold text-[var(--color-ink)]">Phase 2 Fast-Follow</p>
        <p className="text-[11px] text-[var(--color-text-secondary)] leading-relaxed">
          Fund quality scorer & benchmark comparisons dispatched next in Phase 2.
        </p>
      </div>
    </div>
  );
}
