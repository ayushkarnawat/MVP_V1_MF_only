# Batch D: Charts (Benchmark Lines, Overview Graph, Day's-Change Pop-up) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Read `Docs/orchestration/wave-common-rules.md` first; it wins where it differs.

**Goal:** In milestone M2, (13) make the Home benchmark line visible with one fixed colour per benchmark and up to three at once, (14) add the same graph to the Mutual Funds Overview, and (15) make "View all by day's change" open a pop-up listing every mover.

**Architecture:** The line is invisible because `--home-bench` is never loaded (root cause found 13 Nov); the fix replaces it with fixed palette tokens. The Home graph moves, with no visible change, into one shared presentational component under `frontend/src/components/` (features may not import other features), which Home and the Overview both use. The movers route gains an additive "all rows" switch in the same response shape; the pop-up is one new component.

**Tech Stack:** FastAPI, pytest; React, TypeScript, Vitest, the chart in `components/ui/charts/line-area-chart.tsx`, palette tokens in `styles/palette-tokens.css`.

**Spec:** `Docs/orchestration/2026-11-13-batch-d-planning-workbook.html` (Q1 B: up to three benchmarks; Q2 A: graph directly under the Overview summary strip; section 2's root cause and FX-13d; section 4's eleven pop-up stages). Program rules: `2026-11-17-program-execution-and-deployment-plan.html`.

## How this plan is used (read first)

- **Packets and handoffs are not written here.** The orchestrator (Claude) writes the Antigravity packets (legend and chips, the pop-up) and each Codex handoff in detail when the task starts, taking measurements, copy and the eleven stages from the workbook's drawings.
- **Review gate:** FX-13d (the colour fix) is built only after the user approves it. Item 14 and 15 placement and options were decided in the workbook.
- **Wave-start check:** confirm `WealthCard.tsx` still paints with `var(--home-bench)` (lines ~260 and ~344) and `home-tokens.css` is still not imported by `src/index.css`; confirm `BenchmarkSelect.tsx`, `benchmarkChoice.ts` (in `features/home/components/`), `line-area-chart.tsx`, `Movers.tsx`, `services/home/{wealth,movers,schemas,series,benchmarks}.py`, `api/home.py` (`_wealth`, `_movers`, `aggregate_wealth`) and `mutual-funds/overview/OverviewPage.tsx` exist as described; the 16 Nov NAV fix (`b231b6f4`) is in the branch. Report drift.
- **Waits for:** A2's common end date (FX-10c) decides where the chart's last point stops; if A2's fix is not merged when D-9 starts, build the "stop at the latest date with complete-enough prices" rule behind one small function so A2's rule can replace it. The pop-up and the Overview graph do not wait for H or C.
- **Branch:** `batch/d-charts` from `leapswitch-redesign` at wave 2 start (after M1). Ships in M2.
- **Builders:** Codex = backend, shared component move, hooks, all tests, one task at a time. Antigravity = legend chips and the pop-up look, lanes G-a (graph legend/colour chips) and G-b (pop-up), disjoint files, may run together after their red tests exist.

## Global Constraints

- Old staging link untouched: the wealth-series route keeps `benchmark` (single) and its response fields unchanged; add `benchmarks` (list, max 3) and a new `benchmark_series` list **beside** them. The movers route keeps today's payload for the card; "all rows" is an additive query switch (for example `all=true`) returning the same shape plus `waiting_for_price` rows.
- Money is `Decimal` as strings; the client never adds money; rows in the all-rows reply sum exactly to the net change for each grouping (fund, category, sector estimate states its own footer).
- Colours only through always-loaded palette tokens; fixed map: Nifty 50 `--c3` (blue), Nifty 500 `--c5` (violet), Nifty LargeMidcap 250 `--c6` (amber), Nifty Midcap 150 `--c4` (indigo), Nifty Smallcap 250 `--c2` (teal); green stays the portfolio. Colour is never the only cue: end labels, legend chips, tooltip names the benchmark. No new CSS file import for tokens.
- Two scales stay (rupees left, benchmark percent right from 0%): recorded Home decision.
- Benchmark line draws from where its data begins (by date), with the existing note; never silently dropped for a point-count mismatch.
- Limit of 3 benchmarks is a setting (a constant `MAX_BENCHMARKS = 3`), not hard-coded in the UI strings.
- Phone code unchanged. No analytics events (GA4 paused) but keep the labels the Home tracking plan names (period chosen, benchmark chosen, mover opened) as stable test ids.
- No migration. Index history is loaded as data if ever needed; the diagnosis shows it is current.
- Hide-values: the pop-up and the Overview graph follow Home's existing hide-values rule; percentages stay visible, rupee amounts become dots.

## Review Focus

- A period that starts before stored index history: shortened line with the existing note, not dropped.
- Benchmark and portfolio series with different point counts: matched by date, last index level carried forward over gaps.
- A fund with no new price today is listed as "Waiting for today's price", never as zero change, and is left out of the net change.
- All-rows reply sums exactly to the card's net change for fund and category groupings; sector view is labelled estimated.
- Markets closed (no changed rows): a message with the date of the latest prices, not an empty list.
- Home looks and behaves exactly as before after the component move (existing Home tests and screenshots at three window sizes).
- Dialog: focus moves in and is trapped, Escape closes, focus returns to the link; the existing one-row panel is untouched.
- A stored drop-down choice naming an index no longer offered falls back safely; the stored choice becomes a list without breaking an old stored value.

## File Structure

| File | Responsibility |
|---|---|
| `frontend/src/features/home/sections/WealthCard.tsx` | Keeps headline value and hide-values button; uses the shared graph. |
| `frontend/src/components/wealth-graph/WealthGraph.tsx` (new) | Shared chart, period buttons, custom-date calendar, benchmark control, note. Presentational plus the series hook. |
| `frontend/src/components/wealth-graph/benchmarkColors.ts` (new) | The fixed colour map (`BENCHMARK_COLORS: Record<HomeBenchmark, string>` of `var(--cN)` strings). |
| `frontend/src/components/wealth-graph/useWealthSeries.ts` (new) | `useWealthSeries(scope, period, range, benchmarks)`. |
| `frontend/src/features/home/components/{BenchmarkSelect.tsx,benchmarkChoice.ts}` | Checklist of up to 3, legend chips; stored choice becomes a list. |
| `frontend/src/components/ui/charts/line-area-chart.tsx` | More than one second line, end labels. |
| `frontend/src/features/home/home-tokens.css` + `home-tokens.test.ts` | Removed or kept (the user decides at review of FX-13d). |
| `frontend/src/features/mutual-funds/overview/OverviewPage.tsx` | Adds the graph under the summary strip, loaded after the strip and table. |
| `backend/app/services/home/{wealth.py,series.py,schemas.py}`, `backend/app/api/home.py` | `benchmarks` list, by-date matching, `benchmark_series`. |
| `backend/app/services/home/{movers.py,schemas.py}`, `backend/app/api/home.py` | `all` switch, `waiting_for_price` rows. |
| `frontend/src/features/home/sections/Movers.tsx` | Enable the link; fetch all rows on open. |
| `frontend/src/features/home/components/DayChangeDialog.tsx` (new) | The pop-up (stages 1 to 11). |

**Lanes (Antigravity):** G-a legend chips and colours (after D-4 and D-5's red tests), G-b the pop-up look (after D-7 and D-8's red tests). `HomePage.tsx` is touched by both: D-9 goes after D-6's merge.

## Task list

| Task | What | Builder | Size | Order |
|---|---|---|---|---|
| D-1 | Wave-start check; write handoffs and the two packets | Claude | M | first |
| D-2 | Token-loaded guard test and per-benchmark colours (FX-13d) after the user approves | Codex | S | needs approval |
| D-3 | Move the Home graph into the shared component, no visible change | Codex | M | after D-2 |
| D-4 | Backend: `benchmarks` list, by-date matching, `benchmark_series` | Codex | M | with D-3 |
| D-5 | Red tests for the legend, chips, checklist, end labels | Codex | S | after D-3, D-4 |
| D-6 | Legend chips, checklist look, end labels | Antigravity (G-a) | M | after D-5 |
| D-7 | Overview graph under the summary strip | Codex | M | after D-3 |
| D-8 | Backend: movers all-rows with waiting-for-price | Codex | M | any time |
| D-9 | Red tests for the pop-up (11 stages) | Codex | S | after D-8 |
| D-10 | The pop-up component | Antigravity (G-b) | M | after D-9 |
| D-11 | Enable the link; fetch on open; focus behaviour | Codex | S | after D-10 |
| D-12 | Chart end date rule (stops at the latest complete date) | Codex | S | with A2's rule |
| D-13 | Screens vs mockups, light and dark, three sizes; Overview request count and time | Claude | M | after D-6, D-7, D-11 |
| D-14 | Whole-batch review, M2 notes | Claude | M | last |

---

### Task D-2: Colour fix FX-13d (after the user approves it)

**Files:** Create `frontend/src/components/wealth-graph/benchmarkColors.ts`; modify `frontend/src/features/home/sections/WealthCard.tsx` (the two `var(--home-bench)` uses); Test: new `frontend/src/features/home/homeTokensLoaded.test.ts`, `WealthCard.test.tsx`.

**Interfaces:** Produces `BENCHMARK_COLORS: Record<HomeBenchmark, string>` (values `"var(--c3)"`, `"var(--c5)"`, `"var(--c6)"`, `"var(--c4)"`, `"var(--c2)"` keyed by the existing `HomeBenchmark` ids) and `benchmarkColor(b: HomeBenchmark): string`.

- [ ] **Step 1: Write failing tests:** `every var(--name) used under features/home is defined in a stylesheet that src/index.css loads` (fails today for `--home-bench`); `second line stroke and the text line use the benchmark's mapped colour`; `each benchmark has a distinct colour`.
- [ ] **Step 2: Run** `cd frontend && npx vitest run src/features/home/homeTokensLoaded.test.ts src/features/home/sections/WealthCard.test.tsx`. Expected: new tests FAIL.
- [ ] **Step 3: Implement** the map and replace both uses; the text line below the value uses the same colour as its line. Leave `home-tokens.css` alone until the user decides (remove it and `home-tokens.test.ts`, or keep).
- [ ] **Step 4: Run** the two files, `npx tsc -b`, `npx oxlint src/features/home src/components`. Expected: PASS.

### Task D-3: Move the Home graph into the shared component

**Files:** Create `frontend/src/components/wealth-graph/{WealthGraph.tsx,useWealthSeries.ts}`; modify `WealthCard.tsx`; Test: `WealthCard.test.tsx` (unchanged assertions must stay green), new `frontend/src/components/wealth-graph/WealthGraph.test.tsx`.

**Interfaces:** Produces `WealthGraph({ scope, defaultPeriod, hideValues, benchmarkChoice }: WealthGraphProps)`; `useWealthSeries(scope: Scope, period: Period, range: DateRange | null, benchmarks: HomeBenchmark[]) -> { data, status }` (fetches the existing wealth-series route; until D-4 lands it sends the first benchmark only).

- [ ] **Step 1: Write failing tests:** `WealthGraph renders the same chart, period buttons, custom dates, benchmark control and note as the Home card did` (moved assertions from `WealthCard.test.tsx`); `WealthCard keeps headline value and hide-values button`.
- [ ] **Step 2: Run** `cd frontend && npx vitest run src/components/wealth-graph src/features/home/sections/WealthCard.test.tsx`. Expected: new tests FAIL.
- [ ] **Step 3: Implement** the move with no visible change; no `features/*` import inside `components/`.
- [ ] **Step 4: Run** the files plus the whole `src/features/home` tests for Home. Expected: PASS; orchestrator compares Home screenshots before and after at 1280x600, 1440x810, 1536x730.

### Task D-4: Several benchmarks, matched by date (backend)

**Files:** Modify `backend/app/services/home/{wealth.py,series.py,schemas.py}`, `backend/app/api/home.py` (`aggregate_wealth` and the member route, around line 354); Test: `backend/tests/services/home/test_wealth.py`, `test_series.py`.

**Interfaces:** Produces query `benchmarks: list[HomeBenchmark] | None` (max 3; more is a 422), response `benchmark_series: list[BenchmarkSeriesOut]` with `BenchmarkSeriesOut(benchmark: HomeBenchmark, points: list[SeriesPoint], clipped: bool, effective_start: date | None, available: bool)`; the old `benchmark` query and old response fields unchanged.

- [ ] **Step 1: Write failing tests:** `test_old_single_benchmark_reply_unchanged`; `test_three_benchmarks_return_three_series`; `test_fourth_benchmark_rejected`; `test_points_matched_by_date_with_last_level_carried_over_a_gap`; `test_period_starting_before_history_is_clipped_not_dropped`; `test_unavailable_benchmark_reports_available_false`.
- [ ] **Step 2: Run** `cd backend && pytest tests/services/home/test_wealth.py tests/services/home/test_series.py -v`. Expected: FAIL.
- [ ] **Step 3: Implement** one function for one or several benchmarks (single is a list of one).
- [ ] **Step 4: Run** the two files. Expected: PASS, old assertions untouched.

### Task D-5: Red tests for the legend and checklist

**Files:** Test: `frontend/src/features/home/components/BenchmarkSelect.test.tsx`, `benchmarkChoice.test.ts`, `frontend/src/components/ui/charts/line-area-chart.test.tsx`, `WealthGraph.test.tsx`.

- [ ] **Step 1: Write failing tests:** `checklist allows at most MAX_BENCHMARKS and a fourth shows "Choose up to 3"`; `each chosen benchmark has a legend chip in its fixed colour, click hides it`; `end label names each line`; `tooltip names the benchmark`; `stored choice is a list and an old single stored value still loads`; `unknown stored index falls back to the recommended one`; `chart draws more than one second line`.
- [ ] **Step 2: Run** the four files. Expected: new tests FAIL (stay red until D-6 and the chart change).

### Task D-6: Legend chips, checklist look, end labels (Antigravity, lane G-a)

**Files:** Modify `BenchmarkSelect.tsx`, `benchmarkChoice.ts`, `line-area-chart.tsx`, `WealthGraph.tsx` (legend area only). Tests: D-5 (fixed).

- [ ] **Step 1: Packet** (orchestrator, at start): workbook section 2 "After: three" drawing, chip size, colours by token, light and dark pairs from `palette-tokens.css`, focus ring, "Choose up to 3" message, end label placement, hover tooltip.
- [ ] **Step 2: Build** to the packet; legend chips are real buttons with a pressed state.
- [ ] **Step 3: Run** the D-5 files, `tsc -b`, `oxlint`. Expected: PASS. Orchestrator screenshots both themes; checks teal vs green and indigo vs violet are told apart by labels.

### Task D-7: Overview graph under the summary strip (item 14)

**Files:** Modify `frontend/src/features/mutual-funds/overview/OverviewPage.tsx`; Test: `OverviewPage.test.tsx`.

**Interfaces:** Consumes `WealthGraph`, the Overview's scope (family or one member); the shared benchmark choice (one device setting), period default not shared.

- [ ] **Step 1: Write failing tests:** `graph appears directly under the summary strip and above the SIP timeline`; `graph follows the family or member selector`; `loads after the strip and the table (does not block them)`; `hide-values rule matches Home`; `monthly sparkline in the strip stays`.
- [ ] **Step 2: Run** `npx vitest run src/features/mutual-funds/overview/OverviewPage.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement.** The wave-start check confirms whether the Overview has its own hide-values control; if not, hide amounts only when Home's setting is on.
- [ ] **Step 4: Run** the file, `tsc -b`, `oxlint`. Expected: PASS.

### Task D-8: Movers all rows (backend)

**Files:** Modify `backend/app/services/home/{movers.py,schemas.py}`, `backend/app/api/home.py` (`_movers`); Test: `backend/tests/services/home/test_movers.py`.

**Interfaces:** Produces query `all: bool = False`; response adds `waiting_for_price: list[MoverWaitingOut]` (`fund_id`, `name`, `category`) and, when `all`, every row of the grouping in the same row shape as today's top rows; zero-change rows are included with a flag `no_change: bool`.

- [ ] **Step 1: Write failing tests:** `test_default_reply_unchanged` (card payload and size identical); `test_all_rows_sum_to_net_change_for_fund_and_category`; `test_funds_without_new_price_are_listed_apart_and_not_zero`; `test_markets_closed_returns_no_rows_and_latest_price_date`; `test_sector_view_marked_estimated`; `test_decimals_are_strings_exact`.
- [ ] **Step 2: Run** `cd backend && pytest tests/services/home/test_movers.py -v`. Expected: FAIL.
- [ ] **Step 3: Implement** one implementation behind the switch (not a second route).
- [ ] **Step 4: Run** the file. Expected: PASS.

### Task D-9: Red tests for the pop-up

**Files:** Test: new `frontend/src/features/home/components/DayChangeDialog.test.tsx`, `Movers.test.tsx`.

- [ ] **Step 1: Write failing tests** per stage: `opens at once with net change and totals copied from the card and a placeholder list` (2); `fund view: gainers then losers largest first, collapsed "No change" group` (3); `category view reuses fetched rows, no new request` (4); `category row opens its funds` (5); `sector view shows Estimated badge and the estimate footer` (6); `waiting funds listed apart with the clock mark, never zero, Partial badge` (7); `no-change group opens` (8); `markets closed message with the latest price date` (9); `error keeps the summary and offers Try again which repeats the fetch` (10); `values hidden turns rupees into dots, percentages stay` (11); `Escape, cross, outside click close; focus trapped and returns to the link`; `the existing one-row panel is untouched`.
- [ ] **Step 2: Run** the two files. Expected: FAIL (stay red until D-10 and D-11).

### Task D-10: The pop-up (Antigravity, lane G-b)

**Files:** Create `frontend/src/features/home/components/DayChangeDialog.tsx`. Tests: D-9 (fixed).

- [ ] **Step 1: Packet** (orchestrator): the eleven stages from workbook section 4 (measurements, copy, colours, bar scale from one centre line, sticky group headers, pill switch, footer check line, loading placeholder, empty and error states), using the app's `Dialog` primitive; Fund, Category, Sector switch starting on the card's grouping.
- [ ] **Step 2: Build** to the packet using only the props the orchestrator lists.
- [ ] **Step 3: Run** `DayChangeDialog.test.tsx`, `tsc -b`, `oxlint`. Expected: PASS. Orchestrator compares to the drawings at 1280x600, 1440x810, 1536x730, light and dark.

### Task D-11: Enable the link and fetch on open

**Files:** Modify `frontend/src/features/home/sections/Movers.tsx` (the disabled "Coming soon" link), `HomePage.tsx` (the request, after D-7's merge). Test: `Movers.test.tsx`, `Movers.open.test.tsx`.

- [ ] **Step 1:** The D-9 `Movers` tests cover it: `link is live`, `all rows are fetched only when the dialog opens`, `card request unchanged`.
- [ ] **Step 2: Implement.** **Step 3: Run** `Movers.test.tsx Movers.open.test.tsx DayChangeDialog.test.tsx`, `tsc -b`. Expected: PASS.

### Task D-12: Chart end date rule

**Files:** Modify `backend/app/services/home/wealth.py` (the point that replaces the last day with the headline value).

- [ ] **Step 1: Write failing test** `test_series_stops_at_latest_date_with_complete_enough_prices_and_says_so` (partial prices: no falling last point). **Step 2: Run** `pytest tests/services/home/test_wealth.py -k end_date`. Expected: FAIL. **Step 3: Implement** behind one function that A2's common end date rule (FX-10c) can replace. **Step 4: Run.** Expected: PASS.

### Task D-13: Visual and performance checks (Claude)

- [ ] **Step 1:** Screenshots of Home, the Overview graph and the pop-up (all states) at three sizes, light and dark, next to the mockups; send exact differences back to the workers.
- [ ] **Step 2:** Count and time the Overview's requests with the graph (Batch A's method); confirm the graph loads after the strip and table.
- [ ] **Step 3:** Visual checks on real data only after the first clean unattended NAV run, labelled with time of day, once in the morning and once after the 14:00 held-only run.

### Task D-14: Whole-batch review and M2 notes (Claude)

- [ ] **Step 1:** A fresh adversarial reviewer reads the diff against Review Focus. **Step 2:** Merge `leapswitch-redesign` into `batch/d-charts`, rerun the affected tests, merge in. **Step 3:** Hand the M2 deploy guide (written at M2) its facts: backend first (new optional params, additive), frontend after; no migration; no deploy step beyond the usual; the draft staging check (workbook section 9).

## Self-Review notes

- Spec coverage: item 13 (D-2, D-4, D-5, D-6), item 14 (D-3, D-7), item 15 (D-8 to D-11), prices and end date (D-12), tests and checks (D-13).
- Placement fix: the shared component lives in `components/wealth-graph/`, not under `features/`, because features may not import other features.
- Packets and handoffs: not written here, by instruction.
