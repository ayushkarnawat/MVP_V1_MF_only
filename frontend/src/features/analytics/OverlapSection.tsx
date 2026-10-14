import { useEffect, useId, useRef, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { compareDecimalStrings } from "@/lib/decimal";
import { cn } from "@/lib/utils";
import { CoverageBanner } from "./CoverageBanner";
import { formatPercent, holdingsDate, percentageProduct } from "./lookthroughDisplay";
import type { OverlapPair, OverlapSummary } from "./types";

const CARD = "rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 sm:p-6 shadow-2xs";
const BUTTON = "min-h-11 rounded-lg px-3 py-2 text-xs border border-[var(--color-border)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]";
const pairKey = (a: string, b: string) => [a, b].sort().join(":");
const compare = (a: string, b: string) => compareDecimalStrings(percentageProduct(a, "100"), percentageProduct(b, "100"));

/** Activate attribute 06's existing full-table control within this view.
 * The -all aria-controls contract avoids changing the stock section or copying it.
 */
export function openStockHoldings(root: HTMLElement | null) {
  const button = root?.querySelector<HTMLButtonElement>('button[aria-controls$="-all"]');
  if (!button) return;
  if (button.getAttribute("aria-expanded") !== "true") button.click();
  button.focus();
  button.closest("section")?.scrollIntoView?.({ block: "start" });
}

function CommonStocks({ pair, limit }: { pair: OverlapPair; limit: number }) {
  return <div className="space-y-3">
    <h3 className="text-sm font-semibold text-[var(--color-ink)]">{pair.fund_a.scheme_name} and {pair.fund_b.scheme_name}: {formatPercent(pair.overlap_pct)}% overlap</h3>
    {pair.common_total > pair.common_stocks.length && <p className="text-xs text-[var(--color-text-secondary)]">Showing {pair.common_stocks.length} of {pair.common_total} common stocks, ranked by the smaller fund weight; lists are limited to {limit} stocks. Overlap uses every common stock.</p>}
    {pair.common_total === 0 ? <p className="text-sm text-[var(--color-text-secondary)]">No common equity stocks with an ISIN</p> : <div className="overflow-x-auto" tabIndex={0}>
      <table aria-label={`Common stocks for ${pair.fund_a.scheme_name} and ${pair.fund_b.scheme_name}`} className="w-full text-xs text-[var(--color-text-secondary)]">
        <thead><tr className="border-b border-[var(--color-border)]"><th scope="col" className="p-3 text-left">Stock / ISIN</th><th scope="col" className="p-3 text-right">{pair.fund_a.scheme_name} weight</th><th scope="col" className="p-3 text-right">{pair.fund_b.scheme_name} weight</th></tr></thead>
        <tbody>{pair.common_stocks.map(stock => <tr key={stock.isin} className="border-b last:border-0 border-[var(--color-border)]"><th scope="row" className="p-3 text-left font-medium break-words">{stock.instrument_name}<span className="block font-normal">{stock.isin}</span></th><td className="p-3 text-right tabular-nums whitespace-nowrap">{formatPercent(stock.weight_a)}%</td><td className="p-3 text-right tabular-nums whitespace-nowrap">{formatPercent(stock.weight_b)}%</td></tr>)}</tbody>
      </table>
    </div>}
  </div>;
}

export function OverlapSection({ data, isLoading = false, onOpenStocks, className }: {
  data: OverlapSummary | null; isLoading?: boolean; onOpenStocks?: () => void; className?: string;
}) {
  const id = useId();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const details = useRef<HTMLDivElement>(null);
  useEffect(() => {
    details.current?.focus({ preventScroll: true });
    details.current?.scrollIntoView?.({ block: "nearest" });
  }, [selectedKey]);
  if (isLoading) return <div aria-label="Loading fund overlap" aria-busy="true" className={cn(CARD, "space-y-4", className)}><Skeleton className="h-6 w-48" /><Skeleton className="h-52 w-full" /></div>;
  const pairs = new Map((data ? [...data.matrix, ...data.pairs_above_low] : []).map(p => [pairKey(p.fund_a.scheme_id, p.fund_b.scheme_id), p]));
  const selected = selectedKey ? pairs.get(selectedKey) : undefined;
  const select = (pair: OverlapPair) => setSelectedKey(prev => { const key = pairKey(pair.fund_a.scheme_id, pair.fund_b.scheme_id); return prev === key ? null : key; });
  const band = (value: string) => !data ? "low" : compare(value, data.bands.high) >= 0 ? "high" : compare(value, data.bands.low) >= 0 ? "moderate" : "low";
  const color = (value: string) => band(value) === "high" ? "var(--color-ink)" : band(value) === "moderate" ? "color-mix(in srgb, var(--color-warning) 55%, var(--color-surface))" : "color-mix(in srgb, var(--color-positive) 20%, var(--color-surface))";
  const headline = data?.concentration.filter(p => p.stock_count <= 10).at(-1);
  // Numeric conversions below are only SVG coordinates; labels and bands are exact.
  const maxCount = data?.concentration.at(-1)?.stock_count ?? 1;
  const maxPct = Math.max(100, ...(data?.concentration.map(p => Number(p.exposure_pct)) ?? []));
  const points = data?.concentration.map(p => `${20 + p.stock_count / maxCount * 280},${110 - Number(p.exposure_pct) / maxPct * 90}`).join(" ");
  return <section id="overlap" aria-labelledby={`${id}-heading`} className={cn(CARD, "space-y-5", className)}>
    <h2 id={`${id}-heading`} className="font-display text-lg font-bold tracking-tight text-[var(--color-ink)]">Fund overlap</h2>
    {!data ? <p className="py-12 text-center text-sm text-[var(--color-text-secondary)]">No fund overlap data available</p> : <>
      <p className="text-xs text-[var(--color-text-secondary)]">Values as on {holdingsDate(data.nav_as_of)} · Holdings as on {holdingsDate(data.holdings_as_of)}</p>
      <CoverageBanner coverage={data.coverage} excludedShare={data.excluded_share} />
      <p className="text-xs text-[var(--color-text-secondary)]">Overlap counts common equity stocks as a share of each fund’s net assets. A 70%-equity fund can overlap by at most 70%; debt, cash, gold, REITs and derivatives add nothing.</p>
      {data.total_fund_count < 2 ? <p className="text-sm text-[var(--color-text-secondary)]">Overlap needs at least two funds with published holdings.</p> : <>
        <p className="text-xs text-[var(--color-text-secondary)]">{data.matrix_truncated ? `Top 12 funds by value, out of ${data.total_fund_count} covered funds. The pair list below includes all covered funds.` : "Covered funds, largest portfolio value first."}</p>
        <div className="overflow-x-auto rounded-lg border border-[var(--color-border)]" role="region" aria-label="Scrollable overlap matrix" tabIndex={0}>
          <table aria-label="Fund overlap heatmap" className="w-full text-xs text-[var(--color-text-secondary)]"><thead><tr><th scope="col" className="p-2">Fund</th>{data.matrix_funds.map(f => <th scope="col" key={f.scheme_id} className="p-2 min-w-24 max-w-40 break-words">{f.scheme_name}</th>)}</tr></thead>
            <tbody>{data.matrix_funds.map(a => <tr key={a.scheme_id}><th scope="row" className="p-2 text-left min-w-32 max-w-48 break-words">{a.scheme_name}</th>{data.matrix_funds.map(b => {
              const pair = a.scheme_id === b.scheme_id ? undefined : pairs.get(pairKey(a.scheme_id, b.scheme_id));
              return <td key={b.scheme_id} className="p-1 text-center">{pair ? <button type="button" data-band={band(pair.overlap_pct)} aria-label={`${pair.fund_a.scheme_name} and ${pair.fund_b.scheme_name}: ${formatPercent(pair.overlap_pct)}% overlap (${band(pair.overlap_pct)})`} aria-expanded={selectedKey === pairKey(a.scheme_id, b.scheme_id)} aria-controls={`${id}-common`} onClick={() => select(pair)} className={cn(BUTTON, "w-full tabular-nums", band(pair.overlap_pct) === "high" && "font-bold")} style={{ backgroundColor: color(pair.overlap_pct), color: band(pair.overlap_pct) === "high" ? "var(--color-surface)" : "var(--color-ink)" }}>{formatPercent(pair.overlap_pct)}%</button> : <span aria-label={a.scheme_id === b.scheme_id ? "Same fund" : "Pair unavailable"}>—</span>}</td>;
            })}</tr>)}</tbody>
          </table>
        </div>
        <ul aria-label="Overlap bands" className="flex flex-wrap gap-3 text-xs text-[var(--color-text-secondary)]"><li>Low: below {formatPercent(data.bands.low, 0)}%</li><li>Moderate: {formatPercent(data.bands.low, 0)}% to below {formatPercent(data.bands.high, 0)}%</li><li className="font-bold">High: {formatPercent(data.bands.high, 0)}% and above</li></ul>
        {selected && <div ref={details} tabIndex={-1} id={`${id}-common`} role="region" aria-label="Common stock breakdown" className="border-t border-[var(--color-border)] pt-4 focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"><CommonStocks pair={selected} limit={data.common_stock_limit} /></div>}
        <div role="region" aria-label={`Pairs above ${formatPercent(data.bands.low, 0)}%`} className="space-y-3">
          <h3 className="text-sm font-semibold text-[var(--color-ink)]">Pairs above {formatPercent(data.bands.low, 0)}%</h3>
          {!data.pairs_above_low.length ? <p className="text-xs text-[var(--color-text-secondary)]">No pairs above this threshold</p> : <ul className="space-y-2">{data.pairs_above_low.map(pair => <li key={pairKey(pair.fund_a.scheme_id, pair.fund_b.scheme_id)}><button type="button" onClick={() => select(pair)} aria-expanded={selectedKey === pairKey(pair.fund_a.scheme_id, pair.fund_b.scheme_id)} aria-controls={`${id}-common`} className={cn(BUTTON, "w-full text-left flex justify-between gap-3 text-[var(--color-ink)]")}><span className="break-words">{pair.fund_a.scheme_name} and {pair.fund_b.scheme_name}</span><span className="tabular-nums shrink-0">{formatPercent(pair.overlap_pct)}%</span></button></li>)}</ul>}
        </div>
      </>}
      <div className="border-t border-[var(--color-border)] pt-4 space-y-3">
        <h3 className="text-sm font-semibold text-[var(--color-ink)]">Stock concentration</h3>
        {!data.concentration.length ? <p className="text-xs text-[var(--color-text-secondary)]">No equity stocks disclosed for this selection</p> : <>
          {!data.hide_headlines && headline && <button type="button" onClick={onOpenStocks} disabled={!onOpenStocks} className={cn(BUTTON, "text-left font-semibold text-[var(--color-ink)]")}>Top {headline.stock_count} stocks represent {formatPercent(headline.exposure_pct)}% of your total MF portfolio — view all stocks</button>}
          <button type="button" onClick={onOpenStocks} disabled={!onOpenStocks} aria-label="View concentration in full stock table" className="block w-full max-w-md rounded-lg focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"><svg viewBox="0 0 320 130" role="img" aria-label="Cumulative stock exposure curve" className="w-full max-w-md h-40"><polyline points={points} fill="none" stroke="var(--color-accent)" strokeWidth="3" /><line x1="20" x2="300" y1="110" y2="110" stroke="var(--color-border)" /></svg></button>
          <ul aria-label="Concentration points" className="flex flex-wrap gap-2">{data.concentration.map(p => <li key={p.stock_count}><button type="button" onClick={onOpenStocks} disabled={!onOpenStocks} className={cn(BUTTON, "text-[var(--color-ink)] tabular-nums")}>{p.stock_count} stocks: {formatPercent(p.exposure_pct)}%</button></li>)}</ul>
        </>}
      </div>
    </>}
  </section>;
}
