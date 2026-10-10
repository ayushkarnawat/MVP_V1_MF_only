import { useState } from "react";
import { compareDecimalStrings, formatDecimal } from "@/lib/decimal";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { ScenarioFund, ScenarioResult } from "./types";

export const NO_DATA = "Not enough historical data to estimate";
export const COMPLIANCE_COPY = "Here's what this portfolio would have captured during this period, based on actual historical fund performance — not a prediction of future returns.";

export function rupees(value: string | null): string {
  if (value === null) return NO_DATA;
  // Round the backend value to the rupee once; rounding to paise first moved 1234.496 up to ₹1,235.
  const match = value.trim().match(/^([+-]?)(\d+)(?:\.(\d*))?$/);
  if (!match) return NO_DATA;
  const negative = match[1] === "-";
  const rounded = BigInt(match[2]) + ((match[3] ?? "0")[0] >= "5" ? 1n : 0n);
  return `₹${negative && rounded !== 0n ? "-" : ""}${new Intl.NumberFormat("en-IN").format(rounded)}`;
}

function estimatePercent(value: string): string {
  const fixed = formatDecimal(value);
  const negative = fixed.startsWith("-");
  const cents = BigInt(fixed.replace(/[-.]/g, ""));
  const nearest = ((cents + 250n) / 500n) * 5n;
  return `${negative && nearest !== 0n ? "-" : ""}${nearest}.00`;
}

export function Compliance({ ongoing }: { ongoing: boolean }) {
  return <p className="text-xs italic leading-relaxed text-[var(--color-text-secondary)]">{COMPLIANCE_COPY}{ongoing && " Numbers will update as the event continues."}</p>;
}

export function Hero({ result, cumulative = false }: { result: ScenarioResult; cumulative?: boolean }) {
  const title = cumulative ? "Cumulative portfolio impact" : "Portfolio impact";
  return <>
    <div className="grid gap-6 sm:grid-cols-2">
      <div aria-label={title}><p className="text-sm text-[var(--color-text-secondary)]">{title}</p><p className="font-display text-3xl font-bold tabular-nums">{result.portfolio_impact_pct === null ? NO_DATA : `${result.portfolio_impact_pct}%`}</p></div>
      <div aria-label="Rupee impact"><p className="text-sm text-[var(--color-text-secondary)]">Rupee impact</p><p className="font-display text-3xl font-bold tabular-nums">{rupees(result.rupee_impact)}</p></div>
    </div>
    {result.covered_value !== null && result.total_value !== null && <p className="text-xs text-[var(--color-text-secondary)]">Based on {rupees(result.covered_value)} of your {rupees(result.total_value)}{result.no_data_funds !== null && result.no_data_funds > 0 && ` · ${result.no_data_funds} ${result.no_data_funds === 1 ? "fund has" : "funds have"} no data for this period`}</p>}
  </>;
}

export function FundRow({ fund, freeze = false }: { fund: ScenarioFund; freeze?: boolean }) {
  const basis = fund.proxy_basis ?? "Historical fund average";
  const label = basis.startsWith("sebi_category_average:") ? "Category average estimate" : "Asset-class average estimate";
  return <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-border)] py-3 text-sm">
    <span className="min-w-0 break-words font-medium">{fund.scheme_name}</span>
    <div className="flex flex-wrap items-center gap-2">
      {fund.is_frozen ? <span className="font-semibold text-[var(--color-freeze)]">Redemptions frozen ~20mo</span> : <>
        {fund.pct === null ? <span className="text-[var(--color-text-secondary)]">{NO_DATA}</span> : fund.is_proxied ? <>
          <TooltipProvider><Tooltip><TooltipTrigger asChild><button type="button" title={basis} className="min-h-11 font-semibold tabular-nums underline decoration-dotted underline-offset-4">~{estimatePercent(fund.pct)}%</button></TooltipTrigger><TooltipContent>{basis}</TooltipContent></Tooltip></TooltipProvider>
          <span className="rounded-md border border-dashed border-[var(--color-border)] px-2 py-1 text-xs text-[var(--color-text-secondary)]">{label}</span>
        </> : <span className="font-semibold tabular-nums">{fund.pct}%</span>}
        {freeze && <span className="text-xs text-[var(--color-text-secondary)]">Not frozen</span>}
      </>}
    </div>
  </div>;
}

export function Funds({ result, currentPhase = false, freeze = false }: { result: ScenarioResult; currentPhase?: boolean; freeze?: boolean }) {
  return <section className="space-y-2"><div className="flex flex-wrap items-center gap-3"><h2 className="font-display text-lg font-semibold">By fund</h2>{currentPhase && <span className="rounded-md border border-[var(--color-border)] px-2 py-1 text-xs font-semibold">Current phase</span>}</div>{result.by_fund.length ? result.by_fund.map(fund => <FundRow key={fund.scheme_id} fund={fund} freeze={freeze} />) : <p className="text-sm text-[var(--color-text-secondary)]">No held funds to show.</p>}</section>;
}

export function Members({ result }: { result: ScenarioResult }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const losses = result.by_member.some(member => compareDecimalStrings(member.rupee_impact, "0") < 0);
  const members = [...result.by_member].sort((a, b) => losses ? compareDecimalStrings(a.rupee_impact, b.rupee_impact) : compareDecimalStrings(b.rupee_impact, a.rupee_impact));
  return <section className="space-y-3"><h2 className="font-display text-lg font-semibold">By family member</h2>{members.map((member, index) => <div key={member.household_member_id} className="rounded-xl border border-[var(--color-border)]">
    <button type="button" aria-expanded={expanded === member.household_member_id} onClick={() => setExpanded(previous => previous === member.household_member_id ? null : member.household_member_id)} className="flex min-h-12 w-full flex-wrap items-center justify-between gap-2 p-3 text-left text-sm">
      <span>{member.member_name}{index === 0 && compareDecimalStrings(member.rupee_impact, "0") !== 0 && <span className="ml-2 text-xs text-[var(--color-text-secondary)]">Biggest contributor</span>}</span>
      <span className="font-semibold tabular-nums">{rupees(member.rupee_impact)}{member.pct !== null && ` (${member.pct}%)`}</span>
    </button>
    {expanded === member.household_member_id && <div className="space-y-2 px-3 pb-3">{member.funds.length ? member.funds.map(fund => <div key={fund.scheme_id} className="flex flex-wrap justify-between gap-2 text-xs text-[var(--color-text-secondary)]"><span>{fund.scheme_name}</span><span className="tabular-nums">{rupees(fund.rupee_impact)}</span></div>) : <p className="text-xs text-[var(--color-text-secondary)]">No holdings for this member.</p>}</div>}
  </div>)}</section>;
}

export function Benchmarks({ result }: { result: ScenarioResult }) {
  if (!result.benchmarks.length) return null;
  const labels: Record<string, string> = { nifty_50: "Nifty 50", nifty_500: "Nifty 500", nifty_midcap_150: "Nifty Midcap 150", nifty_smallcap_250: "Nifty Smallcap 250" };
  const rows = [...(result.portfolio_impact_pct === null ? [] : [{ name: "Your portfolio", pct: result.portfolio_impact_pct }]), ...result.benchmarks];
  const absoluteCents = (pct: string) => BigInt(formatDecimal(pct).replace(/[-.]/g, ""));
  const maximum = rows.reduce((max, row) => absoluteCents(row.pct) > max ? absoluteCents(row.pct) : max, 1n);
  return <section className="space-y-3"><h2 className="font-display text-lg font-semibold">Benchmark comparison</h2>{rows.map(row => <div key={row.name} className="space-y-1"><div className="flex justify-between gap-2 text-sm"><span>{labels[row.name] ?? row.name}</span><span className="tabular-nums">{row.pct}%</span></div><div aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-[var(--color-bg)]"><div className="h-full rounded-full" style={{ width: `${absoluteCents(row.pct) * 100n / maximum}%`, backgroundColor: row.name === "Your portfolio" ? `var(--color-${row.pct.startsWith("-") ? "negative" : "positive"})` : "var(--color-text-secondary)" }} /></div></div>)}</section>;
}
