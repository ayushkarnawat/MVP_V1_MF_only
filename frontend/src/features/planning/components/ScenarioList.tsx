import { useState } from "react";
import { NO_SCENARIOS } from "../planningCopy";
import type { ScenarioSummary, ScenarioType } from "../types";
import { ScenarioCard } from "./ScenarioCard";

export interface ScenarioListProps {
  curated: ScenarioSummary[];
  all: ScenarioSummary[];
  selectedId: string | null;
  onSelect: (scenarioId: string) => void;
  isLoading: boolean;
}

const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]";
const GRID = "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 min-[1280px]:grid-cols-5";

export function ScenarioList({ curated, all, selectedId, onSelect, isLoading }: ScenarioListProps) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<"all" | ScenarioType>("all");

  if (isLoading) {
    return (
      <div role="status" data-testid="scenario-list-loading" className={GRID}>
        <span className="sr-only">Loading scenarios</span>
        {Array.from({ length: 8 }, (_, i) => (
          <div
            key={i}
            data-testid="card-skeleton"
            aria-hidden="true"
            className="min-h-[150px] animate-pulse rounded-xl bg-[var(--ui-elevated)]"
          />
        ))}
      </div>
    );
  }

  if (curated.length === 0 && all.length === 0) {
    return <p className="text-sm text-[var(--ui-text-muted)]">{NO_SCENARIOS}</p>;
  }

  const curatedIds = new Set(curated.map(s => s.scenario_id));
  const remaining = all.filter(s => !curatedIds.has(s.scenario_id));

  const categories: { type: "all" | ScenarioType; label: string }[] = [
    { type: "all", label: "All" },
    { type: "CRASH", label: "Crashes" },
    { type: "BULL_RUN", label: "Bull Runs" },
    { type: "POLICY_RATE", label: "Policy / Rate" },
  ];
  if (all.some(s => s.scenario_type === "HYPOTHETICAL")) {
    categories.push({ type: "HYPOTHETICAL", label: "Hypothetical" });
  }

  const filteredRemaining =
    category === "all" ? remaining : remaining.filter(s => s.scenario_type === category);

  return (
    <div className="space-y-3">
      <div data-testid="curated-grid" className={GRID}>
        {curated.map(scenario => (
          <ScenarioCard
            key={scenario.scenario_id}
            scenario={scenario}
            selected={scenario.scenario_id === selectedId}
            onSelect={onSelect}
          />
        ))}
      </div>

      {remaining.length > 0 && (
        <button
          type="button"
          aria-expanded={open}
          aria-controls="more-scenarios"
          onClick={() => setOpen(v => !v)}
          className={`py-2 text-sm font-semibold text-[var(--pos-text)] ${FOCUS}`}
        >
          {open ? "Hide" : "More scenarios"}
        </button>
      )}

      {open && remaining.length > 0 && (
        <div id="more-scenarios" className="space-y-3">
          <div role="group" aria-label="Scenario categories" className="flex flex-wrap gap-2">
            {categories.map(cat => (
              <button
                key={cat.type}
                type="button"
                aria-pressed={category === cat.type}
                onClick={() => setCategory(cat.type)}
                className={`rounded-full border border-[var(--ui-divider)] bg-[var(--ui-page)] px-3.5 py-1.5 text-sm font-semibold text-[var(--ui-text)] aria-pressed:border-[var(--ui-text)] aria-pressed:bg-[var(--ui-text)] aria-pressed:text-[var(--ui-page)] ${FOCUS}`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          <div data-testid="more-grid" className={GRID}>
            {filteredRemaining.map(scenario => (
              <ScenarioCard
                key={scenario.scenario_id}
                scenario={scenario}
                selected={scenario.scenario_id === selectedId}
                onSelect={onSelect}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
