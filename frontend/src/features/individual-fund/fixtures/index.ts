// REAL GOLDEN FIXTURES (IF-C): these 35 JSON files are byte-identical copies of the backend goldens in
// backend/tests/fixtures/fund/*.json (written by backend/scripts/write_fund_fixtures.py, branch merge/if-backend).
// fixtures.test.ts is the guard that compares them with the types in ../types.ts. Orchestrator-owned: never edit a
// JSON file by hand; when the backend regenerates a golden, copy the new file over the old one. The three Overlap-tab
// files (overlap_fund, overlap_unavailable, overlap_compare) belong to the Overlap tab (IF-D); only the guard reads
// them here. Tests load every file through fixture().
const files = import.meta.glob("./*.json", { eager: true, import: "default" }) as Record<string, unknown>;

export function fixture<T>(name: string): T {
  const key = `./${name}.json`;
  if (!(key in files)) throw new Error(`unknown Individual Fund fixture: ${name}`);
  return structuredClone(files[key]) as T;
}

export const FIXTURE_NAMES = Object.keys(files).map(key => key.slice(2, -5)).sort();

/**
 * The ids used inside the golden fixtures. `scheme` is the main Alpha fund (summary, performance, risk, composition,
 * score, peers, insights ...); `debtScheme` is the debt fund of risk_life_window and performance_1y_debt_no_benchmark;
 * `youngScheme` the young fund of performance_all_young_fund; `casScheme` the CAS-only fund of summary_cas_only.
 * `meera` is NOT in any golden: it is a household member id the tests use as a scope that has no fixture of its own.
 */
export const IDS = {
  scheme: "2c652f6f-008c-58a5-90a5-d1f2e331823f",
  debtScheme: "92769a73-3a1e-5c03-8a0e-7fc438116b0e",
  youngScheme: "cceb8d44-0b9a-5824-aad6-b85e8b272af1",
  casScheme: "8dab2639-73ac-56f1-be54-c1c6267bd58b",
  peer1: "dfb6f3a4-ed3e-5d4c-81e4-7343b0862d60",
  asha: "80008f0b-4cf4-5e83-b15a-b3122e6abbf2",
  dev: "c4083fcb-1e9f-50d6-b023-a1a17a1972d1",
  meera: "b4a3e2f6-9c33-4b8d-9e5a-2c3d4e5f6a7b",
  folioAsha: "ec34b18e-27b6-5fd0-88e9-d04bf4136f0f",
  folioDev: "e562b2b9-d43a-5957-bee6-8b1eb24de5df",
} as const;