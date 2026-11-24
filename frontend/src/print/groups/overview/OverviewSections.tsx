import { useCallback, type ReactNode } from "react";
import { SoldFundsSection } from "../../../components/mf/SoldFundsSection";
import { getAllocation, getSips } from "../../../features/mutual-funds/api";
import { useMfAnalytics } from "../../../features/mutual-funds/data/analyticsStore";
import { useMfHistory, useMfHoldings, useMfSection } from "../../../features/mutual-funds/data/useMfDashboard";
import { HoldingsTable, type SchemeXirrMeta } from "../../../features/mutual-funds/overview/HoldingsTable";
import { AmcAllocationCard, FamilyMembersCard, QuickInsightsCard } from "../../../features/mutual-funds/overview/OverviewCards";
import { soldFundsScope } from "../../../features/mutual-funds/overview/legacyLogic";
import { buildOverviewInsights, monthlySipTotal, slugify } from "../../../features/mutual-funds/mfCopy";
import { formatCompactRupees, formatRupees } from "../../../lib/format";
import { useScope } from "../../../shell/scope/ScopeContext";
import { usePrintSettled } from "../../usePrintSettled";
import { HistoryChartPrint } from "../performance/HistoryChartPrint";
import { DonutLegendPrint } from "../shared/DonutLegendPrint";
import { SipsPrintTable } from "./SipsPrintTable";

const noop = () => {};
function PrintLayout({ children }: { children: ReactNode }) {
  return <div data-overview-print=""><style>{`
    [data-overview-print] :is(h3,h4) { break-after: avoid; }
    [data-overview-print] thead { display: table-header-group; }
    [data-overview-print] :is(tr,li) { break-inside: avoid; }
    [data-overview-print] #overview-mutual-funds :is(th,td) { padding-left: 4px; padding-right: 4px; overflow-wrap: anywhere; }
  `}</style>{children}</div>;
}
function useOverviewAllocation() {
  const { viewMode, memberId } = useScope();
  return useMfSection(useCallback((signal: AbortSignal) => getAllocation({ viewMode, memberId }, signal), [viewMode, memberId]), [viewMode, memberId]);
}
function useOverviewSips() {
  const { viewMode, memberId } = useScope();
  return useMfSection(useCallback((signal: AbortSignal) => getSips({ viewMode, memberId }, true, signal), [viewMode, memberId]), [viewMode, memberId]);
}
export function MutualFundsSectionPrint() {
  const { viewMode, memberId } = useScope();
  const holdings = useMfHoldings();
  const bench = useMfAnalytics("benchmark_funds");
  const settled = holdings.holdings.status !== "loading" && bench.status !== "loading";
  usePrintSettled("overview-mutual-funds", settled);
  if (!settled) return null;
  const rates: Record<string, string | null | undefined> = {};
  const meta: Partial<Record<string, SchemeXirrMeta>> = {};
  for (const fund of bench.data?.funds ?? []) {
    rates[fund.scheme_id] = fund.fund_xirr;
    meta[fund.scheme_id] = { xirr_as_of: fund.xirr_as_of, xirr_basis: fund.xirr_basis, since_purchase_return: fund.since_purchase_return, xirr_caution: fund.xirr_caution };
  }
  return <PrintLayout>
    <HoldingsTable holdings={holdings.holdings} consolidated={viewMode === "aggregate" ? holdings.consolidated.data : null} xirrByScheme={rates} xirrMetaByScheme={meta} sort={null} onSort={noop} query="" chips={[]} onAnalyse={noop} onCompareDistributors={noop} />
    <SoldFundsSection summary={holdings.realized.data} memberId={soldFundsScope(viewMode, memberId)} />
  </PrintLayout>;
}
export function AmcSectionPrint() {
  const allocation = useOverviewAllocation();
  const holdings = useMfHoldings();
  const settled = allocation.status !== "loading" && holdings.holdings.status !== "loading";
  usePrintSettled("overview-amc-allocation", settled);
  if (!settled) return null;
  const slices = (allocation.data?.by_amc ?? []).map(item => ({ key: slugify(item.label), label: item.label, value: item.current_value, percent: String(item.percentage) }));
  return <PrintLayout><AmcAllocationCard allocation={allocation} holdings={holdings.holdings} printChart={<DonutLegendPrint slices={slices} centreLabel="Total" centreValue={formatCompactRupees(allocation.data?.total_value)} />} /></PrintLayout>;
}
function EmptyFamilyPrint() { usePrintSettled("overview-family-members", true); return null; }
function FamilyMembersPrint() {
  const holdings = useMfHoldings();
  const settled = holdings.holdings.status !== "loading";
  usePrintSettled("overview-family-members", settled);
  if (!settled) return null;
  return <PrintLayout><FamilyMembersCard holdings={holdings.holdings} members={holdings.members} /></PrintLayout>;
}
export function FamilySectionPrint() {
  const { viewMode } = useScope();
  return viewMode === "member" ? <EmptyFamilyPrint /> : <FamilyMembersPrint />;
}
export function InsightsSectionPrint() {
  const holdings = useMfHoldings();
  const allocation = useOverviewAllocation();
  const sips = useOverviewSips();
  const settled = holdings.holdings.status !== "loading" && allocation.status !== "loading" && sips.status !== "loading";
  usePrintSettled("overview-quick-insights", settled);
  if (!settled) return null;
  const lines = holdings.holdings.data && allocation.data ? buildOverviewInsights(allocation.data, holdings.holdings.data, sips.data ? monthlySipTotal(sips.data) : null) : null;
  return <PrintLayout>{lines ? <QuickInsightsCard lines={lines} /> : <section><h3>Quick Insights</h3><p>This section failed to load, but the rest of the page is unaffected.</p></section>}</PrintLayout>;
}
export function SipsSectionPrint() {
  const load = useOverviewSips();
  const settled = load.status !== "loading";
  usePrintSettled("overview-sips", settled);
  if (!settled) return null;
  const rows = load.data ?? [];
  const active = rows.filter(row => (row.status ?? "active") === "active");
  const monthlyTotal = monthlySipTotal(rows);
  return <PrintLayout>{load.status === "error" ? <section><h3>Couldn't load your SIPs</h3><p>This section failed to load, but the rest of the page is unaffected.</p></section> : <section><h3 className="mb-4 text-base font-semibold text-[var(--ui-text)]">SIPs</h3>
    {active.length === 0 && <p className="mb-3 text-sm text-[var(--ui-text)]">Monthly SIP total {formatRupees(monthlyTotal)}</p>}
    <SipsPrintTable sips={active} stopped={rows.filter(row => row.status === "stopped")} monthlyTotal={monthlyTotal} />
  </section>}</PrintLayout>;
}
export function HistorySectionPrint() {
  const history = useMfHistory();
  const settled = history.status !== "loading";
  usePrintSettled("overview-value-over-time", settled);
  if (!settled) return null;
  const points = history.data ?? [];
  const title = points.length ? `Value and money invested (net of withdrawals), ${points[0].month.slice(0, 4)} to ${points[points.length - 1].month.slice(0, 4)}` : "Value over time";
  return <PrintLayout>{history.status === "error" ? <p>History couldn't be loaded. Please try again.</p> : <HistoryChartPrint points={points} title={title} />}</PrintLayout>;
}
