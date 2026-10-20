import { Compliance, Funds, Members } from "./ResultParts";
import type { ScenarioResult } from "./types";

export function RedemptionFreezeResultView({ result }: { result: ScenarioResult }) {
  const frozenCount = result.by_fund.filter(fund => fund.is_frozen).length;
  return <section className="space-y-6"><Compliance ongoing={result.scenario.is_ongoing} />
    {frozenCount > 0
      ? <div className="space-y-3 rounded-xl border-2 border-[var(--color-freeze)] p-4"><p className="font-semibold">This wasn't a price fall — a ~20-month liquidity freeze</p><p className="font-display text-3xl font-bold text-[var(--color-freeze)]">Frozen, not %</p></div>
      : <div className="rounded-xl border border-[var(--color-border)] p-4"><p className="font-semibold">None of your funds were frozen in this event</p></div>}
    <Funds result={result} freeze /><Members result={result} />
  </section>;
}
