import { rupees } from "./ResultParts";
import type { ScenarioResult } from "./types";

export function HypotheticalResultView({ result }: { result: ScenarioResult }) {
  if (result.assumptions_not_set) return <section className="rounded-xl border-2 border-dashed border-[var(--color-hypo)] p-6"><p className="font-semibold">We haven't set an assumption for this scenario yet — check back soon.</p></section>;
  return <section className="space-y-6">
    <div className="rounded-xl border-2 border-solid border-[var(--color-hypo)] p-4"><p className="font-semibold leading-relaxed">This is a hypothetical scenario based on a stated assumption, not a historical replay. No market event has happened — these numbers are Unifolio's own judgment call about a possible future, not fact.</p></div>
    <div><p className="text-sm text-[var(--color-text-secondary)]">Rupee impact if assumption held</p><p className="font-display text-3xl font-bold tabular-nums">{rupees(result.rupee_impact)}</p></div>
    <section className="space-y-4"><h2 className="font-display text-lg font-semibold">Per-asset-class assumption</h2>{result.hypothetical_assumptions.map(assumption => <div key={assumption.asset_class} className="space-y-2 border-b border-[var(--color-border)] pb-3"><div className="flex justify-between gap-2 text-sm"><span>{assumption.asset_class}</span><span className="font-semibold tabular-nums">{assumption.assumed_pct_change}%</span></div><p className="text-xs leading-relaxed text-[var(--color-text-secondary)]">{assumption.assumption_note}</p></div>)}</section>
  </section>;
}
