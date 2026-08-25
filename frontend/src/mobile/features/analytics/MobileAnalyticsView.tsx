import { useState, useEffect } from "react";
import { formatIndianCurrency } from "@/lib/decimal";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle } from "lucide-react";
import {
  getAggregateAllocation,
  getMemberAllocation,
  getAggregateTer,
  getMemberTer,
  getAggregateDirectRegularTer,
  getMemberDirectRegularTer,
  getAggregateCategoryRanking,
  getMemberCategoryRanking,
  getAggregateScore,
  getMemberScore,
  getAggregateBenchmark,
  getMemberBenchmark,
  getAggregateFundBenchmark,
  getMemberFundBenchmark,
} from "@/features/analytics/api";
import { AllocationSection } from "@/features/analytics/AllocationSection";
import { TerSection } from "@/features/analytics/TerSection";
import { CategoryRankingSection } from "@/features/analytics/CategoryRankingSection";
import { ScorerSection } from "@/features/analytics/ScorerSection";
import { BenchmarkSection } from "@/features/analytics/BenchmarkSection";
import { FundScoreDetailModal } from "@/features/analytics/FundScoreDetailModal";
import type {
  AnalyticsAllocationSummary,
  WeightedTerSummary,
  DirectRegularTerComparison,
  CategoryRankingSummary,
  PortfolioScoreSummary,
  PortfolioBenchmarkSummary,
  FundVsBenchmarkSummary,
} from "@/features/analytics/types";

export interface MobileAnalyticsViewProps {
  memberId?: string | null;
}

export function MobileAnalyticsView({ memberId = null }: MobileAnalyticsViewProps) {
  const [allocation, setAllocation] = useState<AnalyticsAllocationSummary | null>(null);
  const [ter, setTer] = useState<WeightedTerSummary | null>(null);
  const [terComparison, setTerComparison] = useState<DirectRegularTerComparison | null>(null);
  const [ranking, setRanking] = useState<CategoryRankingSummary | null>(null);
  const [scoreSummary, setScoreSummary] = useState<PortfolioScoreSummary | null>(null);
  const [portfolioBenchmark, setPortfolioBenchmark] = useState<PortfolioBenchmarkSummary | null>(null);
  const [fundBenchmark, setFundBenchmark] = useState<FundVsBenchmarkSummary | null>(null);

  // S20 Modal State
  const [selectedSchemeId, setSelectedSchemeId] = useState<string | null>(null);
  const [selectedSchemeName, setSelectedSchemeName] = useState<string | undefined>(undefined);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();
    const { signal } = controller;
    setLoading(true);

    async function fetchData() {
      try {
        if (!memberId) {
          const [allocRes, terRes, dirRegRes, rankRes, scoreRes, benchRes, fundBenchRes] =
            await Promise.all([
              getAggregateAllocation(signal),
              getAggregateTer(signal),
              getAggregateDirectRegularTer(signal),
              getAggregateCategoryRanking(signal),
              getAggregateScore(signal),
              getAggregateBenchmark(signal),
              getAggregateFundBenchmark(signal),
            ]);
          if (!isMounted) return;
          setAllocation(allocRes.allocation);
          setTer(terRes.ter);
          setTerComparison(dirRegRes.ter);
          setRanking(rankRes.ranking);
          setScoreSummary(scoreRes.score);
          setPortfolioBenchmark(benchRes.benchmark);
          setFundBenchmark(fundBenchRes.comparison);
        } else {
          const [allocRes, terRes, dirRegRes, rankRes, scoreRes, benchRes, fundBenchRes] =
            await Promise.all([
              getMemberAllocation(memberId, signal),
              getMemberTer(memberId, signal),
              getMemberDirectRegularTer(memberId, signal),
              getMemberCategoryRanking(memberId, signal),
              getMemberScore(memberId, signal),
              getMemberBenchmark(memberId, signal),
              getMemberFundBenchmark(memberId, signal),
            ]);
          if (!isMounted) return;
          setAllocation(allocRes);
          setTer(terRes);
          setTerComparison(dirRegRes);
          setRanking(rankRes);
          setScoreSummary(scoreRes);
          setPortfolioBenchmark(benchRes);
          setFundBenchmark(fundBenchRes);
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
      controller.abort();
    };
  }, [memberId]);

  const handleOpenScoreModal = (schemeId: string, schemeName: string) => {
    setSelectedSchemeId(schemeId);
    setSelectedSchemeName(schemeName);
    setIsModalOpen(true);
  };

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
        <div className="flex items-center justify-end">
          <Badge variant="outline" className="text-[9px] px-1.5 py-0">
            Phase 1 & 2 Complete
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

      {/* Section 1: Allocation */}
      <AllocationSection summary={allocation} isLoading={loading} />

      {/* Section 2: TER & Cost */}
      <TerSection ter={ter} comparison={terComparison} isLoading={loading} />

      {/* Section 3: Category Ranking */}
      <CategoryRankingSection ranking={ranking} isLoading={loading} />

      {/* Section 4: Scorer */}
      <ScorerSection
        scoreSummary={scoreSummary}
        isLoading={loading}
        onSelectFundScore={handleOpenScoreModal}
      />

      {/* Section 5: Benchmark Comparison */}
      <BenchmarkSection
        portfolioBenchmark={portfolioBenchmark}
        fundBenchmark={fundBenchmark}
        isLoading={loading}
      />

      {/* S20 Modal */}
      <FundScoreDetailModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        schemeId={selectedSchemeId}
        schemeName={selectedSchemeName}
        initialData={scoreSummary?.funds.find((f) => f.scheme_id === selectedSchemeId) ?? null}
      />
    </div>
  );
}
