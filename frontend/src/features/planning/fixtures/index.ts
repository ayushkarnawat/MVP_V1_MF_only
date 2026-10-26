// SPEC FIXTURE. These JSON files were written by hand from the end-state contract in
// Docs/orchestration/ui-redesign-PB-planning-backend-handoff.md (Appendix A and the T7 fixture table),
// because the Planning backend (PB1/PB2) was not built yet. When it lands, replace the seven JSON files
// by the copies in backend/tests/fixtures/planning/ (same names), delete this notice, and re-run
// fixtures.test.ts; the Planning tests build every edge case from these files (with the helpers in
// ../testData.ts), so they keep working when the numbers change a little.
// Orchestrator-owned: never edit a JSON file by hand, copy the regenerated set instead.
const files = import.meta.glob("./*.json", { eager: true, import: "default" }) as Record<string, unknown>;

export const FIXTURE_STATUS = "SPEC FIXTURE";

export function fixture<T>(name: string): T {
  const key = `./${name}.json`;
  if (!(key in files)) throw new Error(`unknown Planning fixture: ${name}`);
  return structuredClone(files[key]) as T;
}

export const FIXTURE_NAMES = Object.keys(files).map(key => key.slice(2, -5)).sort();

export const ASHA_ID = "81e5a369-bbd4-59f1-b480-8a5bbf1c74ef";
export const DEV_ID = "e6b4557c-b0e3-58f9-8642-54da2db3a27d";
