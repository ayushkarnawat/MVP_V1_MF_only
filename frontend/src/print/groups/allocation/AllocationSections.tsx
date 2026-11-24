import { FundManagerCard } from "../../../features/mutual-funds/allocation/FundManagerCard";
import { SectionCard } from "../../../features/mutual-funds/common/SectionCard";
import { useMfAnalytics } from "../../../features/mutual-funds/data/analyticsStore";
import { stripEntriesForTab } from "../../../features/mutual-funds/frame/stripEntries";
import { formatDataDate, olderDataMarker } from "../../../lib/dataDates";
import { usePrintMode } from "../../../lib/printMode";
import { usePrintSettled } from "../../usePrintSettled";
import { AssetClassPrint, CategoryAmcPrint, MarketCapPrint } from "./AllocationBodies";

const TITLES = {
  "allocation-asset-class": "Look-Through Asset Allocation",
  "allocation-market-cap": "Market-Cap Allocation",
  "allocation-category-amc": "Portfolio Allocation",
  "allocation-fund-manager": "Fund Manager Allocation",
};
type AllocationPrintId = keyof typeof TITLES;

export function AllocationSectionPrint({ id }: { id: AllocationPrintId }) {
  const asset = useMfAnalytics("asset_allocation");
  const cap = useMfAnalytics("cap_allocation");
  const allocation = useMfAnalytics("allocation");
  const manager = useMfAnalytics("fund_manager");
  const benchmarkFunds = useMfAnalytics("benchmark_funds");
  const printMode = usePrintMode();
  const section = {
    "allocation-asset-class": asset,
    "allocation-market-cap": cap,
    "allocation-category-amc": allocation,
    "allocation-fund-manager": manager,
  }[id];
  const settled = section.status !== "loading"
    && (!printMode?.dataDates || (asset.status !== "loading" && cap.status !== "loading"))
    && (id !== "allocation-fund-manager" || benchmarkFunds.status !== "loading");
  usePrintSettled(id, settled);
  if (!settled) return null;
  const xirrByScheme: Record<string, string | null | undefined> = {};
  for (const fund of benchmarkFunds.data?.funds ?? []) xirrByScheme[fund.scheme_id] = fund.fund_xirr;
  const dates = stripEntriesForTab("allocation", {
    pricesIso: asset.data?.nav_as_of,
    holdingsIso: asset.data?.holdings_as_of,
    marketCapListIso: cap.data?.classification_as_of,
  });
  return <div data-allocation-print="">
    <style>{`
      [data-allocation-print] :is(h3,h4,h5) { break-after: avoid; }
      [data-allocation-print] thead { display: table-header-group; }
      [data-allocation-print] :is(tr,li) { break-inside: avoid; }
    `}</style>
    {id === "allocation-fund-manager" ? <FundManagerCard state={manager.status} data={manager.data} onRetry={manager.retry} xirrByScheme={xirrByScheme} />
      : <SectionCard title={TITLES[id]} state={section.status}>
        {id === "allocation-asset-class" && (asset.data ? <AssetClassPrint data={asset.data} /> : <p className="text-xs text-[var(--ui-text-muted)]">No look-through asset allocation data available</p>)}
        {id === "allocation-market-cap" && (cap.data ? <MarketCapPrint data={cap.data} /> : <p className="text-xs text-[var(--ui-text-muted)]">No market-cap allocation data available</p>)}
        {id === "allocation-category-amc" && (allocation.data ? <CategoryAmcPrint data={allocation.data} /> : <p className="text-xs text-[var(--ui-text-muted)]">No allocation data available for this selection</p>)}
      </SectionCard>}
    {printMode?.dataDates && dates.length > 0 && <footer data-testid="allocation-print-dates" className="mt-4 flex flex-wrap gap-2 text-xs text-[var(--ui-text-muted)]">
      {dates.map(entry => {
        const text = formatDataDate(entry.kind, entry.iso);
        const marker = olderDataMarker(entry.kind, entry.iso, new Date());
        return text ? <span key={entry.kind}>{text}{marker.older && <span className="ml-1 text-[var(--warn-text)]">{marker.label}</span>}</span> : null;
      })}
    </footer>}
  </div>;
}
