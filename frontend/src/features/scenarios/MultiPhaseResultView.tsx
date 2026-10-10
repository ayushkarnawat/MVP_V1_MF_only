import { Compliance, Funds, Hero, Members, NO_DATA } from "./ResultParts";
import type { ScenarioResult } from "./types";

export function MultiPhaseResultView({ result }: { result: ScenarioResult }) {
  return <section className="space-y-6"><Compliance ongoing={result.scenario.is_ongoing} /><Hero result={result} cumulative />
    <section className="space-y-3"><h2 className="font-display text-lg font-semibold">Event phases</h2><ol className="grid gap-3 sm:grid-cols-3">{[...result.phases].sort((a, b) => a.order - b.order).map(phase => <li key={phase.order} className={`space-y-2 rounded-xl border p-4 ${phase.is_ongoing ? "border-[var(--color-negative)]" : "border-[var(--color-border)]"}`}><h3 className="font-semibold">{phase.label}</h3><p className="text-xs text-[var(--color-text-secondary)]">{phase.start_date} – {phase.end_date ?? "ongoing"}</p><p className="font-bold tabular-nums">{phase.pct === null ? NO_DATA : `${phase.pct}%`}</p>{phase.is_ongoing && <p className="flex items-center gap-2 text-xs"><span aria-hidden="true" className="h-2 w-2 rounded-full bg-[var(--color-negative)] motion-safe:animate-pulse" />ongoing</p>}</li>)}</ol></section>
    <Funds result={result} currentPhase /><Members result={result} />
  </section>;
}
