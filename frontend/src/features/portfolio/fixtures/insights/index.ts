// SPEC fixtures for the Quick Insights route (GET .../portfolio-insights). The route is not built yet: these six files
// were hand-built from the response schema in Docs/orchestration/ui-redesign-QI-quick-insights-backend-handoff.md with
// exact Decimal arithmetic (ROUND_HALF_UP, 4 places for percentages, 2 for money). When the backend ships, replace
// the six JSON files with a copy of backend/tests/fixtures/portfolio/insights_*.json (same names), set FIXTURE_STATUS to
// "BACKEND GOLDEN" and keep this guard green. Orchestrator-owned: never edit a JSON file by hand.
const files = import.meta.glob("./*.json", { eager: true, import: "default" }) as Record<string, unknown>;

export const FIXTURE_STATUS = "SPEC FIXTURE";

export function fixture<T>(name: string): T {
  const key = `./${name}.json`;
  if (!(key in files)) throw new Error(`unknown Quick Insights fixture: ${name}`);
  return structuredClone(files[key]) as T;
}

export const FIXTURE_NAMES = Object.keys(files).map(key => key.slice(2, -5)).sort();
