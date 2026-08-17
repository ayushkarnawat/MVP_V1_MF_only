import { useState, useEffect } from "react";
import { formatIndianCurrency } from "@/lib/decimal";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, TrendingUp } from "lucide-react";
import {
  getMemberAllocation,
  getAggregateAllocation,
  getMemberTer,
  getAggregateTer,
  getMemberDirectRegularTer,
  getAggregateDirectRegularTer,
  getMemberCategoryRanking,
  getAggregateCategoryRanking,
  getMemberScore,
  getAggregateScore,
  getMemberBenchmark,
  getAggregateBenchmark,
  getMemberFundBenchmark,
  getAggregateFundBenchmark,
} from "./api";
import { AllocationSection } from "./AllocationSection";
import { TerSection } from "./TerSection";
import { CategoryRankingSection } from "./CategoryRankingSection";
import { ScorerSection } from "./ScorerSection";
import { BenchmarkSection } from "./BenchmarkSection";
import { FundScoreDetailModal } from "./FundScoreDetailModal";
import type {
  AnalyticsAllocationSummary,
  WeightedTerSummary,
  DirectRegularTerComparison,
  CategoryRankingSummary,
  PortfolioScoreSummary,
  PortfolioBenchmarkSummary,
  FundVsBenchmarkSummary,
  MemberStatus,
} from "./types";

export interface AnalyticsViewProps {
  viewMode: "aggregate" | "member";
  memberId: string | null;
  onAddDataForMember?: (memberId?: string) => void;
}

export function AnalyticsView({
  viewMode,
  memberId,
  onAddDataForMember,
}: AnalyticsViewProps) {
  const [allocation, setAllocation] = useState<AnalyticsAllocationSummary | null>(null);
  const [ter, setTer] = useState<WeightedTerSummary | null>(null);
  const [terComparison, setTerComparison] = useState<DirectRegularTerComparison | null>(null);
  const [ranking, setRanking] = useState<CategoryRankingSummary | null>(null);
  const [scoreSummary, setScoreSummary] = useState<PortfolioScoreSummary | null>(null);
  const [portfolioBenchmark, setPortfolioBenchmark] = useState<PortfolioBenchmarkSummary | null>(null);
  const [fundBenchmark, setFundBenchmark] = useState<FundVsBenchmarkSummary | null>(null);
  const [members, setMembers] = useState<MemberStatus[]>([]);

  // S20 Modal State
  const [selectedSchemeId, setSelectedSchemeId] = useState<string | null>(null);
  const [selectedSchemeName, setSelectedSchemeName] = useState<string | undefined>(undefined);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Each section fetches and loads independently — allocation/TER/benchmark
  // typically resolve in well under a second, while category-ranking/score
  // (which each scan a full SEBI-category peer universe, live-verified
  // 2026-08-14 to take much longer on first load) must never block them.
  const [allocationLoading, setAllocationLoading] = useState(true);
  const [terLoading, setTerLoading] = useState(true);
  const [rankingLoading, setRankingLoading] = useState(true);
  const [scoreLoading, setScoreLoading] = useState(true);
  const [benchmarkLoading, setBenchmarkLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();
    const { signal } = controller;
    setAllocationLoading(true);
    setTerLoading(true);
    setRankingLoading(true);
    setScoreLoading(true);
    setBenchmarkLoading(true);
    setError(null);

    const isAggregate = viewMode === "aggregate";
    if (!isAggregate && !memberId) {
      setAllocationLoading(false);
      setTerLoading(false);
      setRankingLoading(false);
      setScoreLoading(false);
      setBenchmarkLoading(false);
      return;
    }

    // Allocation drives the hero "Total Portfolio Value" and is the one
    // section every other section's data is meaningless without — its
    // failure surfaces as the full-page error. A slow/failing
    // category-ranking or score call must not take the rest of the
    // dashboard down with it, so those log rather than blank the page;
    // each section already renders a graceful empty state for null data.
    const logSectionError = (section: string) => (err: any) => {
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.error(`Analytics: failed to load ${section}`, err);
    };

    (isAggregate ? getAggregateAllocation(signal) : getMemberAllocation(memberId!, signal))
      .then((res: any) => {
        if (!isMounted) return;
        if (isAggregate) {
          setAllocation(res.allocation);
          setMembers(res.members);
        } else {
          setAllocation(res);
          setMembers([]);
        }
      })
      .catch((err: any) => {
        if (!isMounted) return;
        setError(err.message || "Failed to load analytics data");
      })
      .finally(() => {
        if (isMounted) setAllocationLoading(false);
      });

    Promise.all(
      isAggregate
        ? [getAggregateTer(signal), getAggregateDirectRegularTer(signal)]
        : [getMemberTer(memberId!, signal), getMemberDirectRegularTer(memberId!, signal)]
    )
      .then(([terRes, dirRegRes]: any) => {
        if (!isMounted) return;
        setTer(isAggregate ? terRes.ter : terRes);
        setTerComparison(isAggregate ? dirRegRes.ter : dirRegRes);
      })
      .catch(logSectionError("TER"))
      .finally(() => {
        if (isMounted) setTerLoading(false);
      });

    (isAggregate ? getAggregateCategoryRanking(signal) : getMemberCategoryRanking(memberId!, signal))
      .then((res: any) => {
        if (!isMounted) return;
        setRanking(isAggregate ? res.ranking : res);
      })
      .catch(logSectionError("category ranking"))
      .finally(() => {
        if (isMounted) setRankingLoading(false);
      });

    (isAggregate ? getAggregateScore(signal) : getMemberScore(memberId!, signal))
      .then((res: any) => {
        if (!isMounted) return;
        setScoreSummary(isAggregate ? res.score : res);
      })
      .catch(logSectionError("score"))
      .finally(() => {
        if (isMounted) setScoreLoading(false);
      });

    Promise.all(
      isAggregate
        ? [getAggregateBenchmark(signal), getAggregateFundBenchmark(signal)]
        : [getMemberBenchmark(memberId!, signal), getMemberFundBenchmark(memberId!, signal)]
    )
      .then(([benchRes, fundBenchRes]: any) => {
        if (!isMounted) return;
        setPortfolioBenchmark(isAggregate ? benchRes.benchmark : benchRes);
        setFundBenchmark(isAggregate ? fundBenchRes.comparison : fundBenchRes);
      })
      .catch(logSectionError("benchmark"))
      .finally(() => {
        if (isMounted) setBenchmarkLoading(false);
      });

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [viewMode, memberId]);

  const handleOpenScoreModal = (schemeId: string, schemeName: string) => {
    setSelectedSchemeId(schemeId);
    setSelectedSchemeName(schemeName);
    setIsModalOpen(true);
  };

  const targetMemberPlaceholder =
    viewMode === "aggregate"
      ? members.find((m) => !m.has_data)
      : null;

  if (error) {
    return (
      <div className="rounded-xl border border-[var(--color-negative)]/30 bg-[var(--color-negative)]/5 p-6 text-center space-y-3">
        <AlertCircle className="h-8 w-8 text-[var(--color-negative)] mx-auto" />
        <h2 className="font-display text-base font-bold text-[var(--color-ink)]">
          Unable to load Analytics Dashboard
        </h2>
        <p className="text-xs text-[var(--color-text-secondary)] max-w-md mx-auto">
          {error}
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
              <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-accent)]">
                {viewMode === "aggregate" ? "Family Aggregate Analytics" : "Member Analytics"}
              </span>
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
          </div>
        </div>
      </Card>

      {/* Aggregate Placeholder Notice */}
      {viewMode === "aggregate" && targetMemberPlaceholder && (
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
