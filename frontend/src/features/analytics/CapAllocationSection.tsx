import { useId, useState } from "react";
import { PieChart, PieCenter, PieSlice } from "@/components/ui/charts";
import { defaultPieColors } from "@/components/ui/charts/pie-context";
import { Skeleton } from "@/components/ui/skeleton";
import { compareDecimalStrings, formatIndianCurrency } from "@/lib/decimal";
import { cn } from "@/lib/utils";
import { CoverageBanner, fundAgeText } from "./CoverageBanner";
import { formatPercent, holdingsDate, percentageProduct } from "./lookthroughDisplay";
import type { CapAllocationBucket, CapAllocationSummary, StockHoldingRow } from "./types";

const CARD = "rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 sm:p-6 shadow-2xs";
const LABELS = { LARGE: "Large Cap", MID: "Mid Cap", SMALL: "Small Cap", OTHER: "Other / Unclassified" };
const BUTTON = "min-h-11 rounded-lg p-3 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]";

function Stocks({ rows }: { rows: StockHoldingRow[] }) {
  const id = useId();
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  if (!rows.length) return <p className="text-xs text-[var(--color-text-secondary)]">No holdings in this group</p>;
  return <ul className="space-y-2">{rows.map((row, index) => <li key={row.isin ?? `${row.instrument_name}-${index}`} className="border-b last:border-0 border-[var(--color-border)] pb-2">
    <button type="button" aria-expanded={!!expanded[index]} aria-controls={`${id}-${index}`} onClick={() => setExpanded((prev) => ({ ...prev, [index]: !prev[index] }))}
      className={cn(BUTTON, "w-full flex justify-between gap-3 text-left text-[var(--color-ink)] border border-[var(--color-border)]")}>
      <span className="min-w-0 break-words">{row.instrument_name}</span><span className="shrink-0 tabular-nums">₹{formatIndianCurrency(row.exposure_value)}</span>
    </button>
    {expanded[index] && <ul id={`${id}-${index}`} className="mt-2 space-y-1 text-xs text-[var(--color-text-secondary)]">{row.contributing_funds.map((fund) => <li key={fund.scheme_id} className="break-words">
      <span className="font-semibold">{fund.scheme_name}</span> · {formatPercent(percentageProduct(fund.fund_weight_pct, fund.stock_weight_pct))}% of portfolio
      {fundAgeText(fund) ? ` · ${fundAgeText(fund)}` : ""}
    </li>)}</ul>}
  </li>)}</ul>;
}

export interface CapAllocationSectionProps {
  data: CapAllocationSummary | null;
  isLoading?: boolean;
  className?: string;
}

export function CapAllocationSection({ data, isLoading = false, className }: CapAllocationSectionProps) {
  const id = useId();
  const [equityOnly, setEquityOnly] = useState(false);
  const [selected, setSelected] = useState<CapAllocationBucket["key"] | null>(null);
  if (isLoading) return <div aria-label="Loading market-cap allocation" aria-busy="true" className={cn(CARD, "space-y-4", className)}>
    <Skeleton className="h-6 w-48" /><Skeleton className="h-52 w-52 rounded-full mx-auto" />
  </div>;
  const percent = (bucket: CapAllocationBucket) => equityOnly ? bucket.percentage_equity : bucket.percentage_total;
  const compare = (a: string, b: string) => compareDecimalStrings(percentageProduct(a, "100"), percentageProduct(b, "100"));
  const buckets = data?.buckets ?? [];
  const largest = [...buckets].sort((a, b) => compare(percent(b), percent(a)))[0];
  const active = buckets.find((bucket) => bucket.key === selected);
  const noEquity = equityOnly && compare(data?.total_equity_value ?? "0", "0") === 0;
  const empty = compare(data?.total_portfolio_value ?? "0", "0") === 0;
  // Only chart geometry uses numbers. All text comes from backend Decimal strings.
  const pieData = buckets.map((bucket, index) => ({ label: LABELS[bucket.key], value: Math.max(0, Number(percent(bucket))), color: defaultPieColors[index], formattedValue: percent(bucket) }));
  return <section id="cap-allocation" aria-labelledby={`${id}-heading`} className={cn(CARD, "space-y-5", className)}>
    <h2 id={`${id}-heading`} className="font-display text-lg font-bold tracking-tight text-[var(--color-ink)]">Market-cap allocation</h2>
    {!data ? <p className="py-12 text-center text-sm text-[var(--color-text-secondary)]">No market-cap allocation data available</p> : <>
      <p className="text-xs text-[var(--color-text-secondary)]">Values as on {holdingsDate(data.nav_as_of)} · Holdings as on {holdingsDate(data.holdings_as_of)}</p>
      <p className="text-xs text-[var(--color-text-secondary)]">{data.classification_as_of ? `AMFI classification effective from ${holdingsDate(data.classification_as_of)}` : "No applicable AMFI classifications for these holdings"}</p>
      <CoverageBanner coverage={data.coverage} excludedShare={data.excluded_share} />
      <div role="group" aria-label="Allocation denominator" className="flex flex-wrap gap-2">
        {([false, true] as const).map((only) => <button key={String(only)} type="button" aria-pressed={equityOnly === only}
          onClick={() => setEquityOnly(only)} className={cn(BUTTON, "border border-[var(--color-border)]", equityOnly === only ? "bg-[var(--color-ink)] text-[var(--color-surface)]" : "text-[var(--color-text-secondary)]")}>
          {only ? "% of equity only" : "% of total portfolio"}
        </button>)}
      </div>
      {noEquity ? <p className="text-sm text-[var(--color-text-secondary)]">No equity holdings for this selection</p> : empty ? <p className="text-sm text-[var(--color-text-secondary)]">No holdings for this selection</p> : <>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
          <div role="group" aria-label="Market-cap allocation chart" className="w-full max-w-[240px] mx-auto">
            <PieChart data={pieData} size={220} innerRadius={72} padAngle={0.03} cornerRadius={3}>
              {pieData.map((slice, index) => <PieSlice key={slice.label} index={index} />)}
              <PieCenter>{() => <span className="text-xs text-[var(--color-text-secondary)]">{equityOnly ? "Equity only" : "Total portfolio"}</span>}</PieCenter>
            </PieChart>
          </div>
          <ul aria-label="Market-cap breakdown" className="space-y-2">{buckets.map((bucket, index) => <li key={bucket.key}>
            <button type="button" aria-expanded={selected === bucket.key} aria-controls={`${id}-drill`} onClick={() => setSelected((prev) => prev === bucket.key ? null : bucket.key)}
              className={cn(BUTTON, "w-full border border-[var(--color-border)] text-[var(--color-ink)] text-left")}>
              <span className="flex justify-between gap-3"><span>{LABELS[bucket.key]}</span><span className="tabular-nums shrink-0">{formatPercent(percent(bucket))}%</span></span>
              <span aria-hidden="true" className="block h-1.5 rounded-full bg-[var(--color-border)] mt-2 overflow-hidden"><span className="block h-full rounded-full" style={{ backgroundColor: defaultPieColors[index], width: `${Math.max(0, Math.min(100, Number(percent(bucket))))}%` }} /></span>
            </button>
          </li>)}</ul>
        </div>
        {!data.hide_headlines && largest && <p className="text-sm font-semibold text-[var(--color-ink)]">Largest allocation: {LABELS[largest.key]} ({formatPercent(percent(largest))}%)</p>}
        {buckets.some((bucket) => compare(percent(bucket), "0") < 0) && <p className="text-xs text-[var(--color-text-secondary)]">Negative net positions are listed with their signed percentages; the donut shows positive exposures.</p>}
        {active && <div id={`${id}-drill`} role="region" aria-label={`${LABELS[active.key]} breakdown`} className="space-y-4 border-t border-[var(--color-border)] pt-4">
          {active.key === "OTHER" ? <>
            <div className="space-y-2"><h3 className="text-sm font-semibold text-[var(--color-ink)]">Not equity (debt, cash, gold, REITs)</h3>
              {equityOnly ? <p className="text-xs text-[var(--color-text-secondary)]">Excluded from the equity-only view</p> : <><p className="text-sm tabular-nums">₹{formatIndianCurrency(data.other.non_equity_value)}</p><Stocks rows={data.other.non_equity_rows} /></>}
            </div>
            <div className="space-y-2"><h3 className="text-sm font-semibold text-[var(--color-ink)]">Equity not in AMFI list</h3>
              <p className="text-sm tabular-nums">₹{formatIndianCurrency(data.other.unclassified_equity_value)}</p><Stocks rows={data.other.unclassified_equity_rows} />
            </div>
          </> : <Stocks rows={active.rows} />}
        </div>}
      </>}
    </>}
  </section>;
}
