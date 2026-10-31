import { useId } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { PerformanceRankingContent } from "../mutual-funds/other/PerformanceRankingGroup";
import { isPerformanceRanking } from "../mutual-funds/other/otherLogic";

export interface FundRankingSectionProps { data: unknown; isLoading?: boolean; className?: string }

export function FundRankingSection({ data, isLoading = false, className }: FundRankingSectionProps) {
  const id = useId();
  if (isLoading) return <div aria-label="Loading Performance Ranking" aria-busy="true" className={className}><Skeleton className="h-40 w-full" /></div>;
  return <section id="fund-ranking" aria-labelledby={id} className={cn("rounded-lg border border-[var(--color-border)] p-4 space-y-4", className)}>
    <h2 id={id} className="font-display text-lg font-bold">Performance Ranking</h2>
    {data === null || data === undefined ? <p>No performance ranking data available.</p>
      : isPerformanceRanking(data) ? <PerformanceRankingContent data={data} />
        : <p role="status" aria-label="Updating Performance Ranking">Performance rankings are updating.</p>}
  </section>;
}
