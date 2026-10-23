# Planning (market scenarios): TDD document (draft v1)

**Status:** draft, 2026-10-23. Planning only. Document 5. Red, green, refactor, no live network. Run only the files a change touches. Money and percentages are `Decimal` on the backend and decimal strings on the frontend, never `float`.

## 1. Backend (pytest)

| File | Tests first (red) |
|---|---|
| `tests/services/analytics/test_scenario_engine.py` | (a) `by_asset_class` sums per-fund rupee impact into the six groups and `pct` equals group rupee over group covered value, 2 dp; (b) frozen and no-data funds are in neither sum; (c) a family with two members merges groups across members; (d) hypothetical results return an empty `by_asset_class`; (e) member fund rows carry `is_proxied`, `proxy_basis`, `is_frozen` matching the by-fund row for the same scheme; (f) `funds_data_available` is false when no result row has a percent and true otherwise; (g) `description` appears on the summary |
| `tests/services/analytics/test_scenario_asset_class.py` | the display-group mapping: Debt-short and Debt-long to Debt, Gold and Silver together, Overseas, Hybrid, unknown to Other; a table-driven test over every return value of `underlying_asset_class` so a new value cannot be silently dropped |
| `tests/api/test_scenarios_api.py` | (a) `member_id` of the signed-in account returns that member only, headline equals that member's `pct`; (b) another account's `member_id` returns 404 with no detail that reveals it exists; (c) a malformed id returns 422; (d) omitted `member_id` equals today's response plus the new fields; (e) hypothetical scenario still 404 while the flag is off; (f) the list endpoint includes `description` |
| Speed script test | `measure_planning_staging.py` imports without side effects and refuses to write (its guard is itself tested); not run against a live database in CI |

Existing assertions in these files that compare whole response dicts are updated for the added fields (list produced in the plan step).

## 2. Frontend (vitest)

| File | Tests first |
|---|---|
| `scenarioFormat.test.ts` | `signedPct` real minus sign and rounding; `outperformedBy` positive, negative, equal, null inputs, no float drift (0.1 + 0.2 style cases); `barScale` all zero, one negative, mixed |
| `planningHistory.test.ts` | push and read, missing or foreign `history.state` tolerated |
| `PlanningPage.test.tsx` | landing shows two cards; Plan your future shows Coming soon and Back returns; Explore shows the list; selecting a scenario fetches and shows the detail and scrolls (mock `scrollIntoView`; reduced motion skips smooth); browser Back steps detail, list, landing; refresh state returns to the landing |
| `ScenarioList.test.tsx` | curated first, More and Hide, pills filter only the remaining cards, hypothetical pill only when scenarios of that type exist; card shows description, icon, Nifty 50 stat coloured by sign, no stat for freeze, multi-phase and hypothetical; selected outline |
| `ScenarioDetail.test.tsx` | tiles for a standard result (values, outperformed or behind, caveat line); no benchmark tile or chart for multi-phase and freeze; freeze banner variants; pre-2006 (`funds_data_available` false) shows index only and the note; Mira button opens the dialog; member dropdown lists only members with funds, selecting refetches with `member_id`, keeps the choice across scenarios, previous numbers stay while loading, error reverts |
| `DivergingBars.test.tsx` | rows sorted, widths from the scale, negative left and positive right, every row has an accessible name with value, zero chart renders a message |
| `MemberRows.test.tsx` | Estimate chip with the basis tooltip for proxied funds, Frozen text, no label otherwise, same label for a fund under two members |
| `AssetClassChart.test.tsx` | six groups in order, empty groups hidden, caption states coverage, rupee bars with percent beside |
| Existing scenarios tests | unchanged and green (L36: the classic variant must behave exactly as before); one case added to `ScenariosScreen.test.tsx`: `variant="planning"` renders the new flow, no prop renders classic; the mobile test (`MobileRoot.test.tsx`, which mocks the screen) is not touched |

## 3. Out of the test plan

Visual regression, live NSE or NAV calls, load tests in CI. The staging timing script is run by a person on the VM and its output pasted back.

## 4. Definition of done for a task

Failing test written and seen failing; minimal change; the touched files' tests green; no `float` in the money path (grep check); the review step in the model-orchestration skill's gate for any Codex-written change.
