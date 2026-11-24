import { DataDateLabel } from "../../../components/DataDateLabel";
import { useMfAnalytics } from "../../../features/mutual-funds/data/analyticsStore";
import { AllStocksTable } from "../../../features/mutual-funds/holdings/AllStocksTable";
import { TopHoldingsByFund } from "../../../features/mutual-funds/holdings/TopHoldingsByFund";
import { usePrintMode } from "../../../lib/printMode";
import { usePrintSettled } from "../../usePrintSettled";

export function HoldingsSectionPrint({ id }: { id: "holdings-top-by-fund" | "holdings-all-stocks" }) {
  const stocks = useMfAnalytics("stock_holdings");
  const printMode = usePrintMode();
  const settled = stocks.status !== "loading";
  usePrintSettled(id, settled);
  if (!settled) return null;
  return <div data-holdings-print="">
    <style>{`
      [data-holdings-print] :is(h3,h4) { break-after: avoid; }
      [data-holdings-print] thead { display: table-header-group; }
      [data-holdings-print] :is(tr,li) { break-inside: avoid; }
    `}</style>
    {id === "holdings-top-by-fund"
      ? <TopHoldingsByFund state={stocks.status} data={stocks.data} onRetry={stocks.retry} />
      : <AllStocksTable state={stocks.status} data={stocks.data} onRetry={stocks.retry} query="" />}
    {printMode?.dataDates && stocks.data && <footer className="mt-4 flex flex-wrap gap-2 text-xs text-[var(--ui-text-muted)]">
      <DataDateLabel kind="prices" iso={stocks.data.nav_as_of} />
      <DataDateLabel kind="holdings" iso={stocks.data.holdings_as_of} />
    </footer>}
  </div>;
}
