import type { ReactNode } from "react";
import { useMfAnalytics } from "../../../features/mutual-funds/data/analyticsStore";
import { olderHoldingsMarker, stripEntriesForTab } from "../../../features/mutual-funds/frame/stripEntries";
import { CategoryRankingGroup } from "../../../features/mutual-funds/other/CategoryRankingGroup";
import { CostValuationGroup } from "../../../features/mutual-funds/other/CostValuationGroup";
import { PerformanceRankingGroup } from "../../../features/mutual-funds/other/PerformanceRankingGroup";
import { formatDataDate } from "../../../lib/dataDates";
import { usePrintMode } from "../../../lib/printMode";
import { usePrintSettled } from "../../usePrintSettled";

function PrintSection({ children }: { children: ReactNode }) {
  return <div data-analytics-print="">
    <style>{`
      [data-analytics-print] :is(h2,h3,h4,h5) { break-after: avoid; }
      [data-analytics-print] thead { display: table-header-group; }
      [data-analytics-print] :is(tr,li) { break-inside: avoid; }
    `}</style>
    {children}
  </div>;
}

export function AnalyticsCostPrint() {
  const ter = useMfAnalytics("ter");
  const comparison = useMfAnalytics("ter_direct_regular");
  const category = useMfAnalytics("category_ranking");
  const valuation = useMfAnalytics("valuation");
  const printMode = usePrintMode();
  const settled = [ter, comparison, category, valuation].every(section => section.status !== "loading");
  usePrintSettled("analytics-cost", settled);
  if (!settled) return null;
  const dates = stripEntriesForTab("analytics", {
    pricesIso: valuation.data?.nav_as_of,
    holdingsIso: valuation.data?.holdings_as_of,
    ratiosIso: valuation.data?.pe.as_of_date ?? valuation.data?.pb.as_of_date,
    feesIso: ter.data?.reference_period,
  }).map(entry => formatDataDate(entry.kind, entry.iso)).filter(Boolean).join(" · ");
  const older = valuation.data ? olderHoldingsMarker(valuation.data.coverage.funds) : null;
  return <PrintSection>
    <CostValuationGroup query="" />
    {printMode?.dataDates && (dates || older) && <footer data-testid="analytics-cost-dates" className="mt-4 text-xs text-[var(--ui-text-muted)]">
      {dates}
      {older && <p>{older.label}: {older.items.join(", ")}</p>}
    </footer>}
  </PrintSection>;
}

export function AnalyticsCategoryPrint() {
  const category = useMfAnalytics("category_ranking");
  const settled = category.status !== "loading";
  usePrintSettled("analytics-category", settled);
  return settled ? <PrintSection><CategoryRankingGroup query="" /></PrintSection> : null;
}

export function AnalyticsRankingPrint() {
  const ranking = useMfAnalytics("ranking");
  const settled = ranking.status !== "loading";
  usePrintSettled("analytics-ranking", settled);
  return settled ? <PrintSection><PerformanceRankingGroup query="" /></PrintSection> : null;
}
