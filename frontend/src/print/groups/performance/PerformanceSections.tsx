import type { ReactNode } from "react";
import { useMfAnalytics } from "../../../features/mutual-funds/data/analyticsStore";
import { useMfHistory, useMfHoldings } from "../../../features/mutual-funds/data/useMfDashboard";
import { ReturnsBlock } from "../../../features/mutual-funds/performance/PerformancePage";
import { usePrintSettled } from "../../usePrintSettled";
import { BenchmarkComparisonPrint } from "./BenchmarkComparisonPrint";
import { HistoryChartPrint } from "./HistoryChartPrint";
import { YearByYearTable } from "./YearByYearTable";

function PrintLayout({ children }: { children: ReactNode }) {
  return <div data-performance-print=""><style>{`
    [data-performance-print] :is(h3,h4,h5) { break-after: avoid; }
    [data-performance-print] thead { display: table-header-group; }
    [data-performance-print] :is(tr,li) { break-inside: avoid; }
  `}</style>{children}</div>;
}
export function ReturnsSectionPrint() {
  const holdings = useMfHoldings();
  const money = useMfAnalytics("investment_withdrawal");
  const funds = useMfAnalytics("benchmark_funds");
  const settled = holdings.xirr.status !== "loading" && money.status !== "loading" && funds.status !== "loading";
  usePrintSettled("performance-returns", settled);
  if (!settled) return null;
  return <PrintLayout><ReturnsBlock holdings={holdings} money={money} funds={funds} /></PrintLayout>;
}
export function BenchmarkSectionPrint() {
  const bench = useMfAnalytics("benchmark");
  const funds = useMfAnalytics("benchmark_funds");
  const settled = bench.status !== "loading" && funds.status !== "loading";
  usePrintSettled("performance-benchmark-comparison", settled);
  if (!settled) return null;
  return <PrintLayout><BenchmarkComparisonPrint bench={bench} funds={funds} /></PrintLayout>;
}
export function HistorySectionPrint() {
  const history = useMfHistory();
  const holdings = useMfHoldings();
  const settled = history.status !== "loading" && holdings.holdings.status !== "loading";
  usePrintSettled("performance-portfolio-history", settled);
  if (!settled) return null;
  const asOf = (holdings.holdings.data ?? []).reduce<string | null>((latest, row) => row.current_nav_date && (!latest || row.current_nav_date > latest) ? row.current_nav_date : latest, null);
  return <PrintLayout>{history.status === "error" ? <p role="alert">History couldn't be loaded. Please try again.</p> : <>
    {holdings.holdings.status === "error" && <p role="alert">Couldn't load your performance data</p>}
    <HistoryChartPrint points={history.data ?? []} title="Value over time" />
    <YearByYearTable points={history.data ?? []} asOf={asOf} />
  </>}</PrintLayout>;
}
