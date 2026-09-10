import { useState } from "react";
import { formatIndianCurrency } from "@/lib/decimal";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, RefreshCw } from "lucide-react";
import { isSectionSettled, useAnalyticsScope } from "@/features/analytics/useAnalyticsScope";
import { AllocationSection } from "@/features/analytics/AllocationSection";
import { TerSection } from "@/features/analytics/TerSection";
import { CategoryRankingSection } from "@/features/analytics/CategoryRankingSection";
import { ScorerSection } from "@/features/analytics/ScorerSection";
import { BenchmarkSection } from "@/features/analytics/BenchmarkSection";
import { FundScoreDetailModal } from "@/features/analytics/FundScoreDetailModal";
import type {
  AnalyticsAllocationSummary,
  AnalyticsSectionName,
  CategoryRankingSummary,
  DirectRegularTerComparison,
  FundVsBenchmarkSummary,
  PortfolioBenchmarkSummary,
  PortfolioScoreSummary,
  WeightedTerSummary,
} from "@/features/analytics/types";

export interface MobileAnalyticsViewProps {
  memberId?: string | null;
}

const AGGREGATE_FIELD: Record<AnalyticsSectionName, string> = {
  allocation: "allocation",
  ter: "ter",
  ter_direct_regular: "ter",
  benchmark: "benchmark",
  benchmark_funds: "comparison",
  category_ranking: "ranking",
  score: "score",
};

export function MobileAnalyticsView({ memberId = null }: MobileAnalyticsViewProps) {
  const isAggregate = !memberId;
  const scope = memberId || "combined";
  const { sections, fetchError, hasFailedSection, isRetrying, retry } = useAnalyticsScope(scope);

  function unwrap<T>(name: AnalyticsSectionName): T | null {
    const payload = sections[name]?.payload;
    if (!payload) return null;
    return (isAggregate ? (payload as Record<string, unknown>)[AGGREGATE_FIELD[name]] : payload) as T;
  }

  const allocation = unwrap<AnalyticsAllocationSummary>("allocation");
  const ter = unwrap<WeightedTerSummary>("ter");
  const terComparison = unwrap<DirectRegularTerComparison>("ter_direct_regular");
  const ranking = unwrap<CategoryRankingSummary>("category_ranking");
  const scoreSummary = unwrap<PortfolioScoreSummary>("score");
  const portfolioBenchmark = unwrap<PortfolioBenchmarkSummary>("benchmark");
  const fundBenchmark = unwrap<FundVsBenchmarkSummary>("benchmark_funds");

  const allocationLoading = !isSectionSettled(sections.allocation);
  const terLoading = !isSectionSettled(sections.ter) || !isSectionSettled(sections.ter_direct_regular);
  const rankingLoading = !isSectionSettled(sections.category_ranking);
  const scoreLoading = !isSectionSettled(sections.score);
  const benchmarkLoading =
    !isSectionSettled(sections.benchmark) || !isSectionSettled(sections.benchmark_funds);

  // S20 Modal State
  const [selectedSchemeId, setSelectedSchemeId] = useState<string | null>(null);
  const [selectedSchemeName, setSelectedSchemeName] = useState<string | undefined>(undefined);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleOpenScoreModal = (schemeId: string, schemeName: string) => {
    setSelectedSchemeId(schemeId);
    setSelectedSchemeName(schemeName);
    setIsModalOpen(true);
  };

  if (fetchError) {
    return (
      <div className="p-4 space-y-4 text-center">
        <div className="rounded-2xl border border-[var(--color-negative)]/30 bg-[var(--color-negative)]/5 p-5 space-y-2">
          <AlertCircle className="h-6 w-6 text-[var(--color-negative)] mx-auto" />
          <p className="text-xs font-bold text-[var(--color-ink)]">Analytics Load Error</p>
          <p className="text-[11px] text-[var(--color-text-secondary)]">{fetchError}</p>
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
          {allocationLoading ? (
            <Skeleton className="h-7 w-32 mt-1" />
          ) : (
            <span className="font-display text-2xl font-bold text-[var(--color-ink)] tabular-nums type-display">
              ₹{formatIndianCurrency(totalValStr)}
            </span>
          )}
        </div>
      </div>

      {hasFailedSection && (
        <div className="rounded-2xl border border-[var(--color-negative)]/30 bg-[var(--color-negative)]/5 p-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-[var(--color-negative)] flex-shrink-0" />
            <p className="text-[11px] text-[var(--color-text-secondary)]">
              Some sections failed to compute.
            </p>
          </div>
          <button
            type="button"
            onClick={retry}
            disabled={isRetrying}
            className="text-xs font-semibold text-[var(--color-accent)] disabled:opacity-40 inline-flex items-center gap-1.5"
          >
            <RefreshCw className="h-3 w-3" />
            {isRetrying ? "Retrying…" : "Retry"}
          </button>
        </div>
      )}

      {/* Section 1: Allocation */}
      <AllocationSection summary={allocation} isLoading={allocationLoading} />

      {/* Section 2: TER & Cost */}
      <TerSection ter={ter} comparison={terComparison} isLoading={terLoading} />

      {/* Section 3: Category Ranking */}
      <CategoryRankingSection ranking={ranking} isLoading={rankingLoading} />

      {/* Section 4: Scorer */}
      <ScorerSection
        scoreSummary={scoreSummary}
        isLoading={scoreLoading}
        onSelectFundScore={handleOpenScoreModal}
      />

      {/* Section 5: Benchmark Comparison */}
      <BenchmarkSection
        portfolioBenchmark={portfolioBenchmark}
        fundBenchmark={fundBenchmark}
        isLoading={benchmarkLoading}
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
