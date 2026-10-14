import { useId } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { defaultPieColors } from "@/components/ui/charts/pie-context";
import { compareDecimalStrings } from "@/lib/decimal";
import { cn } from "@/lib/utils";
import { CoverageBanner } from "./CoverageBanner";
import { formatPercent, holdingsDate, percentageProduct } from "./lookthroughDisplay";
import type { ValuationSummary } from "./types";

const CARD = "rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 sm:p-6 shadow-2xs";
const INDEX_LABELS = { nifty_50: "Nifty 50", nifty_500: "Nifty 500" };
const compare = (a: string, b: string) => compareDecimalStrings(percentageProduct(a, "100"), percentageProduct(b, "100"));

function RatioComparison({ data, kind }: { data: ValuationSummary; kind: "pe" | "pb" }) {
  const metric = data[kind];
  const label = kind === "pe" ? "P/E" : "P/B";
  const basis = kind === "pe" ? "earnings" : "book value";
  const ratio = data.hide_headlines || !metric.enough_data ? null : metric.ratio;
  const rows = [{ label: "Your portfolio", ratio, date: metric.as_of_date }, ...data.indices.map(index => ({
    label: INDEX_LABELS[index.index_name], ratio: kind === "pe" ? index.pe_ratio : index.pb_ratio,
    date: kind === "pe" ? index.pe_as_of : index.pb_as_of,
  }))];
  // Numeric conversions are only bar geometry. All labels/deltas use exact strings.
  const maximum = Math.max(1, ...rows.map(row => Number(row.ratio ?? "0")));
  return <div role="group" aria-label={`${label} valuation`} className="rounded-lg border border-[var(--color-border)] p-4 space-y-4 min-w-0">
    <h3 className="font-display font-semibold text-[var(--color-ink)]">{label} · {basis}</h3>
    <p className="text-xs text-[var(--color-text-secondary)]">Ratio data cover {formatPercent(metric.coverage_pct, 1)}% of equity exposure · Fundamentals as on {holdingsDate(metric.as_of_date)}</p>
    {data.hide_headlines ? <p className="text-sm text-[var(--color-text-secondary)]">Portfolio ratio hidden while published holdings cover less than 50% of your portfolio.</p> : !metric.enough_data ? <p className="text-sm text-[var(--color-text-secondary)]">Not enough data for portfolio {label} — at least 70% of equity exposure needs a usable ratio.</p> : null}
    <ul aria-label={`${label} comparison bars`} className="space-y-4">{rows.map((row, i) => <li key={row.label}>
      <div className="flex justify-between gap-3 text-xs text-[var(--color-ink)]"><span className="font-medium">{row.label}</span><span className="tabular-nums shrink-0">{row.ratio === null ? "Unavailable" : `${formatPercent(row.ratio)}x`}</span></div>
      <div aria-hidden="true" className="mt-2 h-3 bg-[var(--color-border)] rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, Number(row.ratio ?? "0") / maximum * 100))}%`, backgroundColor: defaultPieColors[i] }} /></div>
      {row.date && <p className="mt-1 text-xs text-[var(--color-text-secondary)]">As on {holdingsDate(row.date)}</p>}
    </li>)}</ul>
    {ratio !== null && data.indices.map(index => {
      const delta = kind === "pe" ? index.pe_delta_pct : index.pb_delta_pct;
      if (delta === null) return null;
      const sign = compare(delta, "0");
      return <p key={index.index_name} className="text-xs text-[var(--color-ink)]">{sign === 0 ? `Your portfolio is in line with ${INDEX_LABELS[index.index_name]} on ${basis}.` : `Your portfolio is ${formatPercent(delta.replace(/^-/, ""))}% ${sign > 0 ? "more expensive" : "cheaper"} on ${basis} than ${INDEX_LABELS[index.index_name]}.`}</p>;
    })}
    {metric.missing.length > 0 && <div className="space-y-2"><h4 className="text-xs font-semibold text-[var(--color-ink)]">Equity holdings excluded from {label}</h4><ul className="space-y-2 text-xs text-[var(--color-text-secondary)]">{metric.missing.map((stock, i) => <li key={stock.isin ?? `${stock.instrument_name}-${i}`} className="break-words">{stock.instrument_name} · {formatPercent(stock.percentage_equity, 1)}% of equity — {stock.reason}</li>)}</ul></div>}
  </div>;
}

export function ValuationSection({ data, isLoading = false, className }: { data: ValuationSummary | null; isLoading?: boolean; className?: string }) {
  const id = useId();
  if (isLoading) return <div aria-label="Loading portfolio valuation" aria-busy="true" className={cn(CARD, "space-y-4", className)}><Skeleton className="h-6 w-48" /><Skeleton className="h-44 w-full" /></div>;
  return <section id="valuation" aria-labelledby={`${id}-heading`} className={cn(CARD, "space-y-5", className)}>
    <h2 id={`${id}-heading`} className="font-display text-lg font-bold tracking-tight text-[var(--color-ink)]">Portfolio valuation</h2>
    {!data ? <p className="py-12 text-center text-sm text-[var(--color-text-secondary)]">No portfolio valuation data available</p> : <>
      <p className="text-xs text-[var(--color-text-secondary)]">Values as on {holdingsDate(data.nav_as_of)} · Holdings as on {holdingsDate(data.holdings_as_of)}</p>
      <CoverageBanner coverage={data.coverage} excludedShare={data.excluded_share} />
      {compare(data.total_equity_value, "0") === 0 ? <p className="text-sm text-[var(--color-text-secondary)]">No equity holdings for this selection</p> : <div className="grid grid-cols-1 md:grid-cols-2 gap-4"><RatioComparison data={data} kind="pe" /><RatioComparison data={data} kind="pb" /></div>}
      <p className="text-xs text-[var(--color-text-secondary)]">P/E from NSE (SYMBOL P/E, reported trailing earnings); P/B from Yahoo Finance. Portfolio ratios use a weighted harmonic mean of the equity holdings with usable data.</p>
      {data.footnotes.length > 0 && <ul aria-label="Valuation footnotes" className="space-y-1 text-xs text-[var(--color-text-secondary)]">{data.footnotes.map(note => <li key={note}>{note}</li>)}</ul>}
    </>}
  </section>;
}
