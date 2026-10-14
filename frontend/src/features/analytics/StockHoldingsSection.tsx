import { Fragment, useId, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Group } from "@visx/group";
import { Bar } from "@visx/shape";
import { defaultPieColors } from "@/components/ui/charts/pie-context";
import { Skeleton } from "@/components/ui/skeleton";
import { compareDecimalStrings, formatIndianCurrency, sumDecimalStrings } from "@/lib/decimal";
import { cn } from "@/lib/utils";
import { CoverageBanner, fundAgeText } from "./CoverageBanner";
import { formatPercent, holdingsDate, percentageProduct } from "./lookthroughDisplay";
import type { StockHoldingRow, StockHoldingsSummary } from "./types";

const CARD = "rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 sm:p-6 shadow-2xs";
const BUTTON = "min-h-11 rounded-lg px-3 py-2 text-xs font-semibold text-[var(--color-ink)] border border-[var(--color-border)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]";

function FundBreakdown({ row, id }: { row: StockHoldingRow; id: string }) {
  return <ul id={id} aria-label={`Funds holding ${row.instrument_name}`} className="mt-3 space-y-2 text-xs text-[var(--color-text-secondary)]">
    {row.contributing_funds.map((fund) => <li key={fund.scheme_id}>
      <p className="font-semibold break-words">{fund.scheme_name}{fundAgeText(fund) ? ` — ${fundAgeText(fund)}` : ""}</p>
      <p className="tabular-nums">{formatPercent(fund.stock_weight_pct)}% of fund · {formatPercent(percentageProduct(fund.fund_weight_pct, fund.stock_weight_pct))}% of portfolio · Holdings as on {holdingsDate(fund.holdings_as_of)}</p>
    </li>)}
  </ul>;
}

export interface StockHoldingsSectionProps {
  data: StockHoldingsSummary | null;
  isLoading?: boolean;
  className?: string;
}

export function StockHoldingsSection({ data, isLoading = false, className }: StockHoldingsSectionProps) {
  const sectionId = useId();
  const [showAll, setShowAll] = useState(false);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  if (isLoading) return (
    <div aria-label="Loading overall stock holdings" aria-busy="true" className={cn(CARD, "space-y-4", className)}>
      <Skeleton className="h-6 w-56 max-w-full" />
      <Skeleton className="h-16 w-full rounded-lg" />
      <Skeleton className="h-40 w-full rounded-lg" />
    </div>
  );
  // The stored section is equity-only; guard the boundary too, without
  // changing backend-provided summary percentages or the coverage denominator.
  const rows = (data?.rows ?? []).filter((row) => row.asset_type === "equity_domestic" || row.asset_type === "equity_international")
    .sort((a, b) => compareDecimalStrings(percentageProduct(b.exposure_pct, "100"), percentageProduct(a.exposure_pct, "100")));
  const top = rows.slice(0, 10);
  const funds = new Map(top.flatMap((row) => row.contributing_funds).map((fund) => [fund.scheme_id, fund]));
  const colors = new Map([...funds.keys()].map((id, i) => [id, defaultPieColors[i % defaultPieColors.length]]));
  const matches = rows.filter((row) => [row.instrument_name, row.isin, row.sector_raw, ...row.contributing_funds.map((fund) => fund.scheme_name)]
    .some((text) => text?.toLowerCase().includes(search.trim().toLowerCase())));
  // Floats below are SVG coordinates only. All displayed sums/products use strings + BigInt.
  const maxExposure = Math.max(1, ...top.map((row) => Number(row.exposure_pct)));
  return (
    <section className={cn(CARD, "space-y-5", className)} aria-labelledby={`${sectionId}-heading`}>
      <div>
        <h2 id={`${sectionId}-heading`} className="font-display text-lg font-bold tracking-tight text-[var(--color-ink)]">Overall stock holdings</h2>
        <p className="text-xs text-[var(--color-text-secondary)] mt-1">The stocks you hold through your mutual funds, weighted by your portfolio</p>
      </div>
      {!data ? <p className="py-12 text-center text-sm text-[var(--color-text-secondary)]">No stock holdings data available</p> : <>
        <p className="text-xs text-[var(--color-text-secondary)]">Values as on {holdingsDate(data.nav_as_of)} · Holdings as on {holdingsDate(data.holdings_as_of)}</p>
        <CoverageBanner coverage={data.coverage} excludedShare={data.excluded_share} />
        {rows.length === 0 ? <p className="py-8 text-center text-sm text-[var(--color-text-secondary)]">No equity stocks disclosed for this selection</p> : <>
          {!data.hide_headlines && <p className="text-sm font-semibold text-[var(--color-ink)]">Top 10 stocks represent {formatPercent(sumDecimalStrings(top.map((row) => percentageProduct(row.exposure_pct, "100"))))}% of your portfolio</p>}
          <ol aria-label="Top stock holdings" className="space-y-3">
            {top.map((row, index) => {
              const key = row.isin ?? `${row.instrument_name}-${index}`;
              const detailId = `${sectionId}-stock-${index}`;
              const segments = row.contributing_funds.map((fund) => ({ fund, pct: percentageProduct(fund.fund_weight_pct, fund.stock_weight_pct) }));
              let x = 0;
              return <li key={key} className="rounded-lg border border-[var(--color-border)] p-3">
                <button type="button" className="min-h-11 w-full block text-left rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
                  aria-label={`${row.instrument_name}: ${formatPercent(row.exposure_pct)}%`}
                  aria-expanded={!!expanded[key]} aria-controls={detailId} onClick={() => setExpanded((prev) => ({ ...prev, [key]: !prev[key] }))}>
                  <span className="flex min-h-11 items-center justify-between gap-3">
                  <span className="text-sm font-medium text-[var(--color-ink)] min-w-0 break-words">{row.instrument_name}</span>
                  <span className="text-sm font-semibold text-[var(--color-ink)] tabular-nums shrink-0 flex items-center gap-2">{formatPercent(row.exposure_pct)}%{expanded[key] ? <ChevronUp aria-hidden="true" className="h-4 w-4" /> : <ChevronDown aria-hidden="true" className="h-4 w-4" />}</span>
                  </span>
                <svg viewBox="0 0 100 8" width="100%" className="h-5" preserveAspectRatio="none" role="img"
                  aria-label={`${row.instrument_name}: ${segments.map(({ fund, pct }) => `${fund.scheme_name}: ${formatPercent(pct)}%`).join(", ")}`}>
                  <Group>{segments.map(({ fund, pct }) => {
                    const width = Math.max(0, Number(pct) / maxExposure * 100);
                    const start = x;
                    x += width;
                    return <Bar key={fund.scheme_id} x={start} y={0} width={width} height={8} fill={colors.get(fund.scheme_id)} />;
                  })}</Group>
                </svg>
                </button>
                {expanded[key] && <FundBreakdown row={row} id={detailId} />}
              </li>;
            })}
          </ol>
          <ul aria-label="Fund legend" className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-[var(--color-text-secondary)]">
            {[...funds.values()].map((fund) => <li key={fund.scheme_id} className="flex items-center gap-2 min-w-0"><span aria-hidden="true" className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: colors.get(fund.scheme_id) }} /><span className="min-w-0 break-words">{fund.scheme_name}</span></li>)}
          </ul>
          <button type="button" className={BUTTON} aria-expanded={showAll} aria-controls={`${sectionId}-all`} onClick={() => setShowAll((prev) => !prev)}>{showAll ? "Hide all" : "View all"}</button>
          {showAll && <div id={`${sectionId}-all`} className="space-y-3">
            <label htmlFor={`${sectionId}-search`} className="block text-xs font-medium text-[var(--color-text-secondary)]">Search stocks</label>
            <input id={`${sectionId}-search`} type="search" value={search} onChange={(event) => setSearch(event.target.value)}
              className="w-full min-h-11 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 text-sm text-[var(--color-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]" />
            <div role="region" aria-label="Stock holdings table" tabIndex={0} className="overflow-x-auto rounded-lg border border-[var(--color-border)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]">
              <table aria-label="All stored stock holdings" className="w-full text-xs text-[var(--color-text-secondary)]">
                <thead><tr className="bg-[var(--color-bg)] border-b border-[var(--color-border)] text-left">
                  <th scope="col" className="p-3">Stock</th><th scope="col" className="p-3">Sector</th><th scope="col" className="p-3 text-right">Exposure</th><th scope="col" className="p-3 text-right">Value</th>
                </tr></thead>
                <tbody>{matches.map((row, index) => {
                  const key = row.isin ?? `${row.instrument_name}-${index}`;
                  const detailId = `${sectionId}-table-stock-${index}`;
                  return <Fragment key={key}><tr className="border-b last:border-0 border-[var(--color-border)]">
                  <th scope="row" className="p-3 text-left font-medium min-w-32 break-words"><button type="button" aria-expanded={!!expanded[key]} aria-controls={detailId}
                    onClick={() => setExpanded((prev) => ({ ...prev, [key]: !prev[key] }))}
                    className="min-h-11 text-left underline underline-offset-4 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]">{row.instrument_name}</button><span className="block font-normal mt-1">{row.isin ?? "—"}</span></th>
                  <td className="p-3 break-words min-w-24">{row.sector_raw ?? "—"}</td>
                  <td className="p-3 text-right tabular-nums whitespace-nowrap">{formatPercent(row.exposure_pct)}%</td>
                  <td className="p-3 text-right tabular-nums whitespace-nowrap">₹{formatIndianCurrency(row.exposure_value)}</td>
                </tr>{expanded[key] && <tr><td colSpan={4} className="px-3 pb-3"><FundBreakdown row={row} id={detailId} /></td></tr>}</Fragment>;
                })}</tbody>
              </table>
            </div>
            {matches.length === 0 && <p role="status" className="text-sm text-[var(--color-text-secondary)]">No stocks match your search</p>}
          </div>}
        </>}
        <p className="text-xs text-[var(--color-text-secondary)]"><a href="#asset-allocation" className="underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]">{formatPercent(data.non_equity_share)}% in non-equity positions — debt, gold, cash and other holdings</a></p>
        {data.truncated && <p className="text-xs text-[var(--color-text-secondary)]">Showing the top {rows.length} of {data.total_stock_count} stocks; your full portfolio is longer</p>}
      </>}
    </section>
  );
}
