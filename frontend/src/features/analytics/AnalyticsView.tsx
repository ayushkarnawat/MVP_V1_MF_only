import { useState } from "react";
import { formatIndianCurrency } from "@/lib/decimal";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, RefreshCw, TrendingUp } from "lucide-react";
import { postExportPdf } from "./api";
import { isSectionSettled, useAnalyticsScope } from "./useAnalyticsScope";
import { AllocationSection } from "./AllocationSection";
import { TerSection } from "./TerSection";
import { CategoryRankingSection } from "./CategoryRankingSection";
import { ScorerSection } from "./ScorerSection";
import { BenchmarkSection } from "./BenchmarkSection";
import { FundScoreDetailModal } from "./FundScoreDetailModal";
import { ANALYTICS_SECTION_NAMES } from "./types";
import type {
  AnalyticsAllocationSummary,
  AnalyticsExportPayload,
  AnalyticsSectionName,
  CategoryRankingSummary,
  DirectRegularTerComparison,
  FundVsBenchmarkSummary,
  MemberStatus,
  PortfolioBenchmarkSummary,
  PortfolioScoreSummary,
  WeightedTerSummary,
} from "./types";

export interface AnalyticsViewProps {
  viewMode: "aggregate" | "member";
  memberId: string | null;
  onAddDataForMember?: (memberId?: string) => void;
  activeMemberName?: string;
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

export function AnalyticsView({
  viewMode,
  memberId,
  onAddDataForMember,
  activeMemberName,
}: AnalyticsViewProps) {
  const isAggregate = viewMode === "aggregate";
  const scope = isAggregate ? "combined" : memberId;
  const { sections, recomputing, fetchError, hasFailedSection, isRetrying, retry } = useAnalyticsScope(scope);

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
  const members: MemberStatus[] = isAggregate
    ? (((sections.allocation?.payload as Record<string, unknown> | undefined)?.members as MemberStatus[]) ?? [])
    : [];

  const allocationLoading = !!scope && !isSectionSettled(sections.allocation);
  const terLoading =
    !!scope && (!isSectionSettled(sections.ter) || !isSectionSettled(sections.ter_direct_regular));
  const rankingLoading = !!scope && !isSectionSettled(sections.category_ranking);
  const scoreLoading = !!scope && !isSectionSettled(sections.score);
  const benchmarkLoading =
    !!scope && (!isSectionSettled(sections.benchmark) || !isSectionSettled(sections.benchmark_funds));

  const allSectionsLoaded =
    !scope || (!recomputing && ANALYTICS_SECTION_NAMES.every((name) => isSectionSettled(sections[name])));

  // S20 Modal State
  const [selectedSchemeId, setSelectedSchemeId] = useState<string | null>(null);
  const [selectedSchemeName, setSelectedSchemeName] = useState<string | undefined>(undefined);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const handleDownloadPdf = async () => {
    setIsExporting(true);
    setExportError(null);
    try {
      const payload: AnalyticsExportPayload = {
        scopeName: isAggregate ? "Family Aggregate" : activeMemberName ?? "Member",
        allocation,
        ter,
        terComparison,
        ranking,
        scoreSummary,
        portfolioBenchmark,
        fundBenchmark,
      };
      const blob = await postExportPdf({ scope: viewMode, memberId, payload });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `unifolio-analytics-${isAggregate ? "family" : memberId}.pdf`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setExportError(err.message || "Failed to generate PDF");
    } finally {
      setIsExporting(false);
    }
  };

  const handleOpenScoreModal = (schemeId: string, schemeName: string) => {
    setSelectedSchemeId(schemeId);
    setSelectedSchemeName(schemeName);
    setIsModalOpen(true);
  };

  const targetMemberPlaceholder = isAggregate ? members.find((m) => !m.has_data) : null;

  if (fetchError) {
    return (
      <div className="rounded-xl border border-[var(--color-negative)]/30 bg-[var(--color-negative)]/5 p-6 text-center space-y-3">
        <AlertCircle className="h-8 w-8 text-[var(--color-negative)] mx-auto" />
        <h2 className="font-display text-base font-bold text-[var(--color-ink)]">
          Unable to load Analytics Dashboard
        </h2>
        <p className="text-xs text-[var(--color-text-secondary)] max-w-md mx-auto">
          {fetchError}
        </p>
      </div>
    );
  }

  const totalValStr = allocation?.total_value || "0";

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Hero Summary Header */}
      <Card className="p-6 sm:p-7 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xs relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[10px] border-[var(--color-border)] text-[var(--color-text-secondary)]">
                Phase 1 & 2 Active
              </Badge>
            </div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[var(--color-ink)] mt-1">
              Analytics & Portfolio Performance Dashboard
            </h1>
            <p className="text-xs sm:text-sm text-[var(--color-text-secondary)] mt-1">
              Full 5-part depth: Allocation, TER Costs, SEBI Category Ranks, Quality Scorer & Benchmark Comparisons.
            </p>
          </div>

          <div className="flex items-center gap-4 bg-[var(--color-bg)]/80 p-4 rounded-xl border border-[var(--color-border)] self-start md:self-auto">
            <div>
              <span className="text-[11px] font-medium text-[var(--color-text-secondary)] block">
                Total Portfolio Value
              </span>
              {allocationLoading ? (
                <Skeleton className="h-7 w-32 mt-1" />
              ) : (
                <span className="font-display text-xl sm:text-2xl font-bold text-[var(--color-ink)] tabular-nums type-display">
                  ₹{formatIndianCurrency(totalValStr)}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={!allSectionsLoaded || isExporting}
              className="text-xs font-semibold px-4 py-2 rounded-lg bg-[var(--color-accent)] text-white disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isExporting ? "Generating…" : "Download PDF"}
            </button>
          </div>
        </div>
        {exportError && (
          <p className="text-xs text-[var(--color-negative)] mt-3 relative z-10">{exportError}</p>
        )}
      </Card>

      {/* Aggregate Placeholder Notice */}
      {isAggregate && targetMemberPlaceholder && (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <TrendingUp className="h-4 w-4 text-[var(--color-accent)] flex-shrink-0" />
            <p className="text-xs text-[var(--color-text-secondary)]">
              Family member <strong className="text-[var(--color-ink)]">{targetMemberPlaceholder.name}</strong> has no CAS holdings imported yet.
            </p>
          </div>
          {onAddDataForMember && (
            <button
              type="button"
              onClick={() => onAddDataForMember(targetMemberPlaceholder.id)}
              className="text-xs font-semibold text-[var(--color-accent)] hover:underline cursor-pointer self-start sm:self-auto"
            >
              + Add CAS for {targetMemberPlaceholder.name}
            </button>
          )}
        </div>
      )}

      {hasFailedSection && (
        <div className="rounded-xl border border-[var(--color-negative)]/30 bg-[var(--color-negative)]/5 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="h-4 w-4 text-[var(--color-negative)] flex-shrink-0" />
            <p className="text-xs text-[var(--color-text-secondary)]">
              Some sections failed to compute.
            </p>
          </div>
          <button
            type="button"
            onClick={retry}
            disabled={isRetrying}
            className="text-xs font-semibold text-[var(--color-accent)] hover:underline cursor-pointer self-start sm:self-auto disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
          >
            <RefreshCw className="h-3 w-3" />
            {isRetrying ? "Retrying…" : "Retry"}
          </button>
        </div>
      )}

      {/* Section 1: Allocation */}
      <AllocationSection summary={allocation} isLoading={allocationLoading} />

      {/* Section 2: Cost / TER */}
      <TerSection ter={ter} comparison={terComparison} isLoading={terLoading} />

      {/* Section 3: Category Ranking */}
      <CategoryRankingSection ranking={ranking} isLoading={rankingLoading} />

      {/* Section 4: Fund & Portfolio Scorer (FR-5/FR-6/FR-7) */}
      <ScorerSection
        scoreSummary={scoreSummary}
        isLoading={scoreLoading}
        onSelectFundScore={handleOpenScoreModal}
      />

      {/* Section 5: Benchmark Comparison (FR-8/FR-9) */}
      <BenchmarkSection
        portfolioBenchmark={portfolioBenchmark}
        fundBenchmark={fundBenchmark}
        isLoading={benchmarkLoading}
      />

      {/* S20 Fund Score Detail Modal */}
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
