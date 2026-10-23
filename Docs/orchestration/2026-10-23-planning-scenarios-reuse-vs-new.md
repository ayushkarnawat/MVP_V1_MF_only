# Planning (market scenarios): reuse versus new, and how it is built (draft v1)

**Status:** draft, 2026-10-23. Planning only. Document 4. Inputs: functionality spec, design system, decisions L1 to L36 (G1 C, L36, replaces D1). **Rule:** no new table, migration or job. L27 (edit in place) is met by the variant switch of L36.

## 1. Frontend

| Piece | Reuse | New / change | How it is built |
|---|---|---|---|
| Route | shell route registry and wrapper pattern (contract v1.5 row `planning`) | one wrapper route file that mounts `PlanningPage`, placed where the shell architecture document puts route files (the desktop shell does not exist in the code yet) | thin file, no logic |
| `PlanningPage` | `listScenarios`, `getScenarioResult` in `api.ts` | new component, four states, history entries | `useState` for state and selection; `planningHistory.ts` pushes and reads `window.history.state` (the app already stores tab state there); effect cleanups abort fetches as in `ScenariosScreen` |
| Landing cards, Coming soon | `ui/card`, `ui/button` | `PlanCard`, `ComingSoonView` | static markup |
| List | picker logic (curated, More, pills), `formatDateRange`, `listScenarios` | `ScenarioList`, `ScenarioCard`, `ScenarioTypeIcon` | copy the picker's grouping logic into the new list rather than importing the old file's private pieces; stat from `quick_market_pct` only |
| Detail shell | `getScenarioResult` (add optional `memberId`) | `ScenarioDetail` | one fetch per (scenario, member); previous data kept while loading |
| Tiles | `rupees`, `lib/decimal` | `StatTile`, `scenarioFormat.ts` | pure functions with unit tests |
| Charts | `benchmarkLabel`, `rupees` | `DivergingBars`, `BenchmarkChart`, `AssetClassChart`, `barScale` | plain markup and CSS; no chart library; row widths from `barScale` |
| Mira | shell `MiraComingSoonDialog` | `MiraInsightsCard` | static card plus button |
| Members | `Members` row logic | member rows with `EstimateChip` and `FrozenText` | rows read `is_proxied`, `proxy_basis`, `is_frozen` from the member fund rows |
| Phases, freeze banner, no-data text | existing views and strings | restyle | share the string constants (`NO_DATA`, `COMPLIANCE_COPY`) |
| Types, api | `types.ts`, `api.ts` | additive fields and the `memberId` argument | add fields; no removals (mobile keeps compiling) |

**G1 answered C (L36): edit in place, with a desktop variant switch.** `ScenariosScreen` gets `variant?: "classic" | "planning"` (default classic, so mobile and the old desktop tab flow are unchanged). The `"planning"` branch is an early return to the new `PlanningScenarios` flow, which lives in new files; the classic code paths are not edited. No other existing scenario file is edited except `types.ts` and `api.ts` (additive). The old desktop tab flow is retired by the shell, not by this work.

## 2. Backend

| Piece | Reuse | New / change |
|---|---|---|
| Routes | `GET /scenarios`, `GET /scenarios/{id}/results` | optional `member_id` query parameter and ownership check |
| Engine | `_async_get_scenario_result_for_household`, `compute_holdings`, `underlying_asset_class`, stored per-fund results | `by_asset_class` builder, member-fund flags, `funds_data_available` |
| Schemas | `ScenarioSummaryRow`, `ScenarioResultRow`, `ScenarioMemberFundResult` | additive fields |
| Tables | `scenarios`, `scenario_scheme_results`, `scenario_category_averages` | none |
| Speed | Home plan T1 (`allow_stale_today`) | pass it from this route; timing script `backend/scripts/measure_planning_staging.py` (read-only, modelled on the Home script) |

## 3. Tests touched (only these run)

Backend: `tests/services/analytics/test_scenario_engine.py`, `test_scenario_asset_class.py`, `tests/api/test_scenarios_api.py`. Frontend: new test files beside the new components, plus one added case in `ScenariosScreen.test.tsx` (variant planning renders the new flow; default renders classic). Every existing scenarios test stays unchanged and must stay green: they are the proof that classic is untouched.

## 4. Why not the alternatives

- A new asset-class table: the numbers are a sum over stored per-fund results; a table would duplicate them and need a job.
- A per-member route: one optional parameter on the existing route is smaller and the response shape is identical.
- The existing `bar-chart`: unread, and two plain bar charts do not justify extending it (L28).
