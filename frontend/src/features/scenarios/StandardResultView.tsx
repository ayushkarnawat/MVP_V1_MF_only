import { Benchmarks, Compliance, Funds, Hero, Members } from "./ResultParts";
import type { ScenarioResult } from "./types";

export function StandardResultView({ result }: { result: ScenarioResult }) {
  return <section className="space-y-6"><Compliance ongoing={result.scenario.is_ongoing} /><Hero result={result} /><Benchmarks result={result} /><Funds result={result} /><Members result={result} /></section>;
}
