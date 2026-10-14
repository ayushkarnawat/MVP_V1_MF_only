import { useId, useState } from "react";
import { PieChart, PieCenter, PieSlice } from "@/components/ui/charts";
import { defaultPieColors } from "@/components/ui/charts/pie-context";
import { Skeleton } from "@/components/ui/skeleton";
import { compareDecimalStrings } from "@/lib/decimal";
import { cn } from "@/lib/utils";
import { CoverageBanner } from "./CoverageBanner";
import { CapAllocationSection } from "./CapAllocationSection";
import { formatPercent, holdingsDate, percentageProduct } from "./lookthroughDisplay";
import type { AssetAllocationSummary } from "./types";

const LABELS = { equity: "Equity", debt: "Debt", gold: "Gold", cash_like: "Cash-like" };
const CAPS = { LARGE: "Large Cap", MID: "Mid Cap", SMALL: "Small Cap", OTHER: "Other / Unclassified" };
const CARD = "rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 sm:p-6 shadow-2xs";
const compare = (a: string, b: string) => compareDecimalStrings(percentageProduct(a, "100"), percentageProduct(b, "100"));

export function AssetAllocationSection({ data, isLoading = false, className, printMode = false }: { data: AssetAllocationSummary | null; isLoading?: boolean; className?: string; printMode?: boolean }) {
  const id = useId();
  const [asCash, setAsCash] = useState(false);
  const [equityOpen, setEquityOpen] = useState(false);
  if (isLoading) return <div aria-label="Loading look-through asset allocation" aria-busy="true" className={cn(CARD, "space-y-4", className)}><Skeleton className="h-6 w-48" /><Skeleton className="h-52 w-52 rounded-full mx-auto" /></div>;
  const variant = data && (asCash ? data.arbitrage_as_cash : data.as_disclosed);
  const classes = variant?.classes ?? [];
  const largest = [...classes].sort((a, b) => compare(b.percentage, a.percentage))[0];
  // The two rings share amounts and order, so equity's four sub-slices align
  // with its inner arc. Numeric conversion is only for SVG geometry.
  const inner = classes.map((c, i) => ({ label: LABELS[c.key], value: Math.max(0, Number(c.value)), color: defaultPieColors[i] }));
  const outer = classes.flatMap((c, i) => c.key === "equity" ? (variant?.equity_outer ?? []).map((b, j) => ({ label: CAPS[b.key], value: Math.max(0, Number(b.value)), color: defaultPieColors[j + 3] })) : [{ label: LABELS[c.key], value: Math.max(0, Number(c.value)), color: defaultPieColors[i] }]);
  return <section id="asset-allocation" aria-labelledby={`${id}-heading`} className={cn(CARD, "space-y-5", className)}>
    <h2 id={`${id}-heading`} className="font-display text-lg font-bold tracking-tight text-[var(--color-ink)]">Look-through asset allocation</h2>
    {!data || !variant ? <p className="py-12 text-center text-sm text-[var(--color-text-secondary)]">No look-through asset allocation data available</p> : <>
      <p className="text-xs text-[var(--color-text-secondary)]">Values as on {holdingsDate(data.nav_as_of)} · Holdings as on {holdingsDate(data.holdings_as_of)}</p>
      <p className="text-xs text-[var(--color-text-secondary)]">Percentages of covered portfolio value, so they differ from the market-cap section, which uses your total portfolio or equity only. Equity’s outer ring shows Large, Mid, Small and Other; debt, gold and cash-like stay undivided.</p>
      <CoverageBanner coverage={data.coverage} excludedShare={data.excluded_share} />
      {!printMode && <label className="flex gap-3 items-center min-h-11 text-sm text-[var(--color-ink)]"><input type="checkbox" checked={asCash} onChange={e => { setAsCash(e.target.checked); setEquityOpen(false); }} className="size-4 accent-[var(--color-accent)]" />Treat arbitrage funds as cash-like</label>}
      <p className="text-xs text-[var(--color-text-secondary)]">{data.arbitrage_funds.length ? `Applies to ${data.arbitrage_funds.map(f => f.scheme_name).join(", ")}. Entire fund value moves to cash-like; Equity Savings is unchanged.` : "No covered Arbitrage Fund holdings for this selection."}</p>
      {compare(data.covered_value, "0") === 0 ? <p className="text-sm text-[var(--color-text-secondary)]">No covered holdings for this selection</p> : <>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
          <div className="relative w-[280px] h-[280px] max-w-full mx-auto">
            <div aria-label="Equity size and other asset classes ring" role="group"><PieChart data={outer} size={280} innerRadius={110} hoverOffset={0}>{outer.map((c, i) => <PieSlice key={c.label} index={i} />)}</PieChart></div>
            <div aria-label="Asset classes ring" role="group" className="absolute inset-[30px]"><PieChart data={inner} size={220} innerRadius={62} hoverOffset={0}>{inner.map((c, i) => <PieSlice key={c.label} index={i} />)}<PieCenter>{() => <span className="text-xs text-[var(--color-text-secondary)]">Covered value</span>}</PieCenter></PieChart></div>
          </div>
          <ul aria-label="Look-through asset breakdown" className="space-y-2">{classes.map((c, i) => <li key={c.key}><button type="button" aria-expanded={c.key === "equity" ? equityOpen : undefined} aria-controls={c.key === "equity" ? `${id}-equity` : undefined} onClick={() => c.key === "equity" && setEquityOpen(v => !v)} className="min-h-11 p-3 rounded-lg border border-[var(--color-border)] w-full flex justify-between gap-3 text-xs font-semibold text-[var(--color-ink)] focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"><span className="flex items-center gap-2"><span aria-hidden="true" className="size-2 rounded-full" style={{ backgroundColor: defaultPieColors[i] }} />{LABELS[c.key]}</span><span className="tabular-nums">{formatPercent(c.percentage)}%</span></button></li>)}</ul>
        </div>
        <ul aria-label="Equity outer breakdown" className="flex flex-wrap gap-3 text-xs text-[var(--color-text-secondary)]">{variant.equity_outer.map((b, i) => <li key={b.key} className="flex items-center gap-2"><span aria-hidden="true" className="size-2 rounded-full" style={{ backgroundColor: defaultPieColors[i + 3] }} />{CAPS[b.key]}: {formatPercent(b.percentage)}%</li>)}</ul>
        {!data.hide_headlines && largest && <p className="text-sm font-semibold text-[var(--color-ink)]">Largest asset class: {LABELS[largest.key]} ({formatPercent(largest.percentage)}%)</p>}
        {(classes.some(c => compare(c.percentage, "0") < 0) || variant.equity_outer.some(b => compare(b.percentage, "0") < 0)) && <p className="text-xs text-[var(--color-text-secondary)]">Negative net positions are listed with their signed percentages; the donut shows positive exposures.</p>}
        {printMode && data.arbitrage_funds.length > 0 && <p className="text-xs text-[var(--color-text-secondary)]">If arbitrage funds were treated as cash-like: {data.arbitrage_as_cash.classes.map((c) => `${LABELS[c.key]} ${formatPercent(c.percentage)}%`).join(" · ")}. Equity by size: {data.arbitrage_as_cash.equity_outer.map((b) => `${CAPS[b.key]} ${formatPercent(b.percentage)}%`).join(" · ")}.</p>}
        {equityOpen && <div id={`${id}-equity`} role="region" aria-label="Equity market-cap drill-down"><CapAllocationSection data={variant.cap_allocation} embedded /></div>}
      </>}
    </>}
  </section>;
}
