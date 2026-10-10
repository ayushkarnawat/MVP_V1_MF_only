import { useEffect, useRef, useState } from "react";
import { getScenarioResult, listScenarios } from "./api";
import { HypotheticalResultView } from "./HypotheticalResultView";
import { MultiPhaseResultView } from "./MultiPhaseResultView";
import { RedemptionFreezeResultView } from "./RedemptionFreezeResultView";
import { resolveResultShape } from "./resolveResultShape";
import { ScenarioPicker } from "./ScenarioPicker";
import { StandardResultView } from "./StandardResultView";
import type { ScenarioResult, ScenarioSummary } from "./types";

const actionClass = "min-h-11 rounded-lg px-3 text-sm font-semibold text-[var(--color-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]";

export function ScenariosScreen() {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [curated, setCurated] = useState<ScenarioSummary[]>([]);
  const [all, setAll] = useState<ScenarioSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [result, setResult] = useState<ScenarioResult | null>(null);
  const [resultError, setResultError] = useState<string | null>(null);
  const [listAttempt, setListAttempt] = useState(0);
  const [resultAttempt, setResultAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setListError(null);
    Promise.all([listScenarios(true, controller.signal), listScenarios(false, controller.signal)])
      .then(([cards, scenarios]) => {
        if (!controller.signal.aborted) { setCurated(cards); setAll(scenarios); }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setListError(error instanceof Error ? error.message : "Request failed");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [listAttempt]);

  useEffect(() => {
    if (selectedId === null) return;
    const controller = new AbortController();
    setResult(null);
    setResultError(null);
    getScenarioResult(selectedId, controller.signal)
      .then((response) => { if (!controller.signal.aborted) setResult(response); })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setResultError(error instanceof Error ? error.message : "Request failed");
      });
    return () => controller.abort();
  }, [selectedId, resultAttempt]);

  // The clicked control unmounts on a view change; move focus to the heading, not <body>.
  const select = (id: string | null) => { setResult(null); setResultError(null); setSelectedId(id); headingRef.current?.focus(); };
  const errorCard = (message: string, retry: () => void) => <div role="alert" className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-sm">
    <p>Scenarios aren't available right now.</p>
    <p className="mt-2 text-[var(--color-text-secondary)]">{message}</p>
    <button type="button" onClick={retry} className={actionClass}>Try again</button>
  </div>;
  const shape = result ? resolveResultShape(result.scenario) : null;

  return <div className="space-y-6 text-[var(--color-ink)]">
    <h1 ref={headingRef} tabIndex={-1} className="font-display text-2xl font-bold focus:outline-none">Scenarios</h1>
    {selectedId !== null ? <>
      <button type="button" onClick={() => select(null)} className={actionClass}>← Back to scenarios</button>
      {resultError ? errorCard(resultError, () => setResultAttempt(value => value + 1)) : result ? <>
        <h2 className="font-display text-xl font-semibold">{result.scenario.name}</h2>
        {shape === "standard" && <StandardResultView result={result} />}
        {shape === "multi_phase" && <MultiPhaseResultView result={result} />}
        {shape === "redemption_freeze" && <RedemptionFreezeResultView result={result} />}
        {shape === "hypothetical" && <HypotheticalResultView result={result} />}
      </> : <p role="status" className="text-sm text-[var(--color-text-secondary)]">Loading scenario result…</p>}
    </> : listError ? errorCard(listError, () => setListAttempt(value => value + 1)) : <ScenarioPicker curated={curated} all={all} isLoading={loading} onSelectScenario={select} />}
  </div>;
}
