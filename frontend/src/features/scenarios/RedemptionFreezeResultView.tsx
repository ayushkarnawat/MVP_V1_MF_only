import { Compliance, Funds, Members } from "./ResultParts";
import type { ScenarioResult } from "./types";

export function RedemptionFreezeResultView({ result }: { result: ScenarioResult }) {
  return <section className="space-y-6"><Compliance ongoing={result.scenario.is_ongoing} />
    <div className="space-y-3 rounded-xl border-2 border-[var(--color-freeze)] p-4"><p className="font-semibold">This wasn't a price fall — a ~20-month liquidity freeze</p><p className="font-display text-3xl font-bold text-[var(--color-freeze)]">Frozen, not %</p></div>
    <Funds result={result} freeze /><Members result={result} />
  </section>;
}
