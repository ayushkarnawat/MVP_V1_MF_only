import { DataDateLabel } from "../../../components/DataDateLabel";
import { CoverageBanner } from "../../../components/mf/CoverageBanner";
import { SectionCard } from "../../../features/mutual-funds/common/SectionCard";
import { useMfAnalytics } from "../../../features/mutual-funds/data/analyticsStore";
import { CommonHoldings } from "../../../features/mutual-funds/overlap/CommonHoldings";
import { TopPairs } from "../../../features/mutual-funds/overlap/TopPairs";
import { equityStockHoldings, highestPair } from "../../../features/mutual-funds/overlap/overlapLogic";
import { usePrintMode } from "../../../lib/printMode";
import { usePrintSettled } from "../../usePrintSettled";
import { HeatmapPrint } from "./HeatmapPrint";
import { OverlapImpactPrint } from "./OverlapImpactPrint";

const TITLES = {
  "overlap-common-holdings": "1. Common Holdings",
  "overlap-heatmap": "2. Overlap Heatmap",
  "overlap-top-pairs": "3. Top Overlapping Fund Pairs",
  "overlap-impact": "4. Overlap Impact",
};

export function OverlapSectionPrint({ id }: { id: keyof typeof TITLES }) {
  const overlap = useMfAnalytics("overlap");
  const stocks = useMfAnalytics("stock_holdings");
  const printMode = usePrintMode();
  const isCommon = id === "overlap-common-holdings";
  const settled = overlap.status !== "loading" && (!isCommon || stocks.status !== "loading");
  usePrintSettled(id, settled);
  if (!settled) return null;
  const data = overlap.data;
  const state = isCommon && stocks.status !== "ready" ? stocks.status : overlap.status;
  const common = equityStockHoldings(stocks.data, data);
  const fewerThanTwo = data && data.matrix_funds.length < 2;
  const dates = isCommon ? stocks.data : data;
  return <div data-overlap-print="">
    <style>{`
      [data-overlap-print] :is(h3,h4,h5) { break-after: avoid; }
      [data-overlap-print] thead { display: table-header-group; }
      [data-overlap-print] :is(tr,li) { break-inside: avoid; }
    `}</style>
    {data && <div className="mb-4 space-y-3">
      <p className="text-xs font-medium text-[var(--ui-text)]">All funds</p>
      {Boolean(data.excluded_funds?.length) && <aside role="note" aria-label="Funds not shown" className="rounded-xl border border-[var(--ui-divider)] p-4 text-xs text-[var(--ui-text-muted)]">
        <p className="mb-2 font-semibold">Funds not shown</p>
        <ul className="space-y-2">{data.excluded_funds!.map((fund, index) => <li key={`${fund.name}-${index}`}>{fund.name}: {fund.reason}</li>)}</ul>
      </aside>}
      <CoverageBanner coverage={data.coverage} excludedShare={data.excluded_share} />
    </div>}
    {fewerThanTwo || state !== "ready" ? <SectionCard title={TITLES[id]} state={state}>
      <p className="text-sm text-[var(--ui-text-muted)]">{data?.total_fund_count === 0 ? "No equity funds to compare." : "Overlap needs at least two funds with published holdings."}</p>
    </SectionCard>
      : isCommon ? <CommonHoldings state={state} data={common} onRetry={stocks.retry} />
        : id === "overlap-top-pairs" ? <TopPairs state={state} data={data} onRetry={overlap.retry} selectedKey={null} onSelect={() => {}} query="" />
          : <SectionCard title={TITLES[id]} state={state}>
            {data && (id === "overlap-heatmap" ? <div className="space-y-3">
              <p data-testid="heatmap-scope" className="text-xs text-[var(--ui-text-muted)]">{data.matrix_truncated ? `Top ${data.matrix_funds.length} funds by value, out of ${data.total_fund_count} covered funds` : "Covered funds, largest portfolio value first"}</p>
              <HeatmapPrint funds={data.matrix_funds} pairs={data.matrix} topPair={highestPair(data)} />
            </div> : <OverlapImpactPrint data={data} />)}
          </SectionCard>}
    {printMode?.dataDates && dates && <footer className="mt-4 flex flex-wrap gap-2 text-xs text-[var(--ui-text-muted)]">
      <DataDateLabel kind="prices" iso={dates.nav_as_of} /><DataDateLabel kind="holdings" iso={dates.holdings_as_of} />
    </footer>}
  </div>;
}
