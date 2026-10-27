// SPEC FIXTURE: these 32 JSON files are written by hand from Appendix A.1 of
// Docs/orchestration/ui-redesign-IB-individual-fund-backend-handoff.md because the Individual Fund backend
// is not built yet. They are replaced by the real golden files (backend/tests/fixtures/fund/*.json, written by
// backend/scripts/write_fund_fixtures.py) at integration, and fixtures.test.ts is the guard that compares the
// real files with the types in ../types.ts. Orchestrator-owned: never edit a JSON file by hand. The three
// Overlap-tab files (overlap_fund, overlap_unavailable, overlap_compare) belong to the Overlap tab runs and are
// not part of this set. Tests load them through fixture().
const files = import.meta.glob("./*.json", { eager: true, import: "default" }) as Record<string, unknown>;

export function fixture<T>(name: string): T {
  const key = `./${name}.json`;
  if (!(key in files)) throw new Error(`unknown Individual Fund fixture: ${name}`);
  return structuredClone(files[key]) as T;
}

export const FIXTURE_NAMES = Object.keys(files).map(key => key.slice(2, -5)).sort();

/** The scheme id, member ids and folio ids used inside the fixtures. */
export const IDS = {
  scheme: "7c9e5b0a-3f1d-4a52-8e6b-1d2f3a4b5c6d",
  asha: "b2e1c0d4-7a11-4f6b-9c3e-0a1b2c3d4e5f",
  dev: "b3f2d1e5-8b22-4a7c-8d4f-1b2c3d4e5f6a",
  meera: "b4a3e2f6-9c33-4b8d-9e5a-2c3d4e5f6a7b",
  folioAsha: "a1d4c7e0-1111-4aaa-8bbb-000000000001",
} as const;
