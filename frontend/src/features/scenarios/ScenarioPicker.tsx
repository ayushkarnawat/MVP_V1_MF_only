import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { ScenarioSummary, ScenarioType } from "./types";

export interface ScenarioPickerProps {
  curated: ScenarioSummary[];
  all: ScenarioSummary[];
  isLoading: boolean;
  onSelectScenario: (scenario_id: string) => void;
  className?: string;
}

export function quickStatLine(s: ScenarioSummary): string | null {
  const signed = (value: string) => value.startsWith("-") ? `−${value.slice(1)}%` : `+${value}%`;
  const parts = [
    s.quick_market_pct !== null ? `Nifty 50 ${signed(s.quick_market_pct)}` : null,
    s.quick_equity_pct !== null ? `Equity funds ${signed(s.quick_equity_pct)}` : null,
    s.quick_debt_pct !== null ? `Debt funds ${signed(s.quick_debt_pct)}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

function ScenarioCard({ scenario, select }: { scenario: ScenarioSummary; select: (id: string) => void }) {
  const hypothetical = scenario.scenario_type === "HYPOTHETICAL";
  const frozen = Boolean(scenario.had_redemption_freeze_schemes?.length);
  const preview = hypothetical || frozen || scenario.has_phases ? null : quickStatLine(scenario);
  return (
    <button type="button" onClick={() => select(scenario.scenario_id)} className={cn(
      "min-h-28 rounded-xl border bg-[var(--color-surface)] p-4 text-left space-y-3 hover:bg-[var(--color-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]",
      hypothetical ? "border-dashed border-[var(--color-hypo)]" : "border-[var(--color-border)]",
    )}>
      <div className="flex items-start justify-between gap-3">
        <span className="font-display font-bold text-[var(--color-ink)]">{scenario.name}</span>
        {frozen ? <Badge variant="outline" className="border-[var(--color-freeze)]">Freeze</Badge> : scenario.is_ongoing ? <Badge variant="outline"><span aria-hidden="true" className="mr-1 h-2 w-2 rounded-full bg-[var(--color-negative)] motion-safe:animate-pulse" />ongoing</Badge> : null}
      </div>
      {scenario.start_date && <p className="text-xs text-[var(--color-text-secondary)]">{scenario.start_date} – {scenario.end_date ?? "ongoing"}</p>}
      {hypothetical && <p className="text-xs text-[var(--color-hypo)]">Assumption-based</p>}
      {preview && <p className="text-xs tabular-nums text-[var(--color-text-secondary)]" title={scenario.quick_weight_quarter ? `Fund moves weighted by fund size in the quarter ending ${scenario.quick_weight_quarter}` : undefined}>{preview}</p>}
    </button>
  );
}

const categories: Array<[ScenarioType, string]> = [["CRASH", "Crashes"], ["BULL_RUN", "Bull Runs"], ["POLICY_RATE", "Policy / Rate"], ["HYPOTHETICAL", "Hypothetical"]];

export function ScenarioPicker({ curated, all, isLoading, onSelectScenario, className }: ScenarioPickerProps) {
  const [showMore, setShowMore] = useState(false);
  const [category, setCategory] = useState<ScenarioType | "all">("all");
  if (isLoading) return <div role="status" className="space-y-3"><span className="sr-only">Loading scenarios</span><Skeleton className="h-28 rounded-xl" /><Skeleton className="h-28 rounded-xl" /></div>;
  if (!all.length && !curated.length) return <p>No scenarios are available yet.</p>;
  const curatedIds = new Set(curated.map(s => s.scenario_id));
  const remaining = all.filter(s => !curatedIds.has(s.scenario_id));
  return <section aria-label="Scenario picker" className={cn("space-y-6", className)}>
    <p className="text-xs italic text-[var(--color-text-secondary)]">Here's what this portfolio would have captured during this period, based on actual historical fund performance — not a prediction of future returns.</p>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{curated.map(s => <ScenarioCard key={s.scenario_id} scenario={s} select={onSelectScenario} />)}</div>
    {remaining.length > 0 && <button type="button" aria-expanded={showMore} aria-controls="more-scenarios" onClick={() => setShowMore(value => !value)} className="min-h-11 text-sm font-semibold text-[var(--color-accent)]">{showMore ? "Hide" : "More scenarios"}</button>}
    {showMore && <div id="more-scenarios" className="space-y-4">
      <div className="flex flex-wrap gap-2" aria-label="Scenario categories">
        {([["all", "All"], ...categories.filter(([type]) => all.some(s => s.scenario_type === type))] as const).map(([type, label]) => <button key={type} type="button" aria-pressed={category === type} onClick={() => setCategory(type)} className="min-h-11 rounded-lg border border-[var(--color-border)] px-3 text-sm">{label}</button>)}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{remaining.filter(s => category === "all" || s.scenario_type === category).map(s => <ScenarioCard key={s.scenario_id} scenario={s} select={onSelectScenario} />)}</div>
    </div>}
  </section>;
}
