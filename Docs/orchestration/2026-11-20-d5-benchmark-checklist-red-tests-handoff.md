# Handoff: d5-benchmark-checklist-red-tests (Batch D, task D-5: red tests for the benchmark checklist, legend chips and end labels, front end, Codex)

> **SUPERSEDED 20 Nov 2026 (later): the Codex red tests for this feature are not needed.** The work is split into four disjoint Antigravity lanes that write their own tests first (D-6a chart, D-6b checklist control, D-6c request and legend, then the wiring D-6d); the **interfaces and my decisions below remain the contract**. One change to the contract: the checklist is a NEW file `BenchmarkChecklist.tsx` (not an edit of `BenchmarkSelect.tsx`); the old select stays until D-6d replaces its use. See `2026-11-20-d6a-...`, `d6b-...`, `d6c-...` packets.
**Status:** READY TO RELAY (written 2026-11-20). **Approved by the owner on 19 Nov 2026** (Batch D). The backend it talks to (D-4: `benchmarks` query, `benchmark_series` reply) is built and committed (`204cf46c` on `batch/d-charts`).
**Parent plan:** `Docs/superpowers/plans/2026-11-17-batch-d-charts-plan.md` (Tasks D-5 and D-6; "Global Constraints" and "Review Focus"). **Spec:** `Docs/orchestration/2026-11-13-batch-d-planning-workbook.html`, item 13, section 2 ("After: three"). The workbook is the design; if it and these tests' rules disagree, stop and say so.
**Worker:** Codex writes tests and the type-only additions below. **It cannot run the front-end checks (its sandbox is refused WSL): it writes the tests and reports BLOCKED on running; Claude runs them and confirms each is red for the stated reason.** Antigravity builds the control and the legend later (D-6) against these tests.
**Work in:** `D:\unifolio-d-charts` (branch `batch/d-charts`; it holds D-2, D-3, D-8 and D-4). Never in `D:\Unifolio code`. Stop if `git log` there does not show `204cf46c`.
Read first, in order: `Docs/orchestration/ui-common-rules-codex.md`, `Docs/orchestration/wave-common-rules.md` (wins where they differ), then this file.

## What exists today (read it, do not assume)
`features/home/components/BenchmarkSelect.tsx` (a single `<select aria-label="Benchmark">`), `benchmarkChoice.ts` (`BENCHMARK_STORAGE_KEY = "home.benchmark"`, `readStoredBenchmark`, `writeStoredBenchmark`, `pickBenchmark`), `components/ui/charts/line-area-chart.tsx` (one optional second line), `components/wealth-graph/{WealthGraph.tsx,useWealthSeries.ts,types.ts,benchmarkColors.ts}` (D-2, D-3), `features/home/api.ts` (`getWealthSeries`), `features/home/types.ts` (`WealthSeriesResponse` has `benchmark` but not yet `benchmark_series`).

## The interfaces the tests are written against (decided here; do not invent others)
```ts
// benchmarkChoice.ts (D-6 builds it; the tests import these names)
export const MAX_BENCHMARKS = 3;
export function readStoredBenchmarks(): string[];            // the stored value is a JSON list; an OLD plain string ("nifty_50") still loads as ["nifty_50"]; anything else or blocked storage -> []
export function writeStoredBenchmarks(indices: string[]): void;   // JSON list under the same key "home.benchmark"; storage errors swallowed
export function pickBenchmarks(options: BenchmarkOptionOut[], stored: string[], recommendedIndex: string): string[];
//   keeps stored indices that are still offered, in stored order, at most MAX_BENCHMARKS; none left -> [recommendedIndex] if offered, else [options[0].index]; no options -> []
// BenchmarkSelect.tsx -> a checklist
export interface BenchmarkSelectProps { options: BenchmarkOptionOut[]; values: string[]; onChange: (values: string[]) => void; disabled?: boolean; max?: number /* default MAX_BENCHMARKS */ }
// line-area-chart.tsx: a NEW optional prop beside the existing single-line one (which keeps working unchanged)
export interface ChartBenchmarkLine { id: string; label: string; color: string; points: { date: string; pct: string }[] }
//   prop: benchmarkLines?: ChartBenchmarkLine[]   -> each line drawn in its own colour on the right (percent) axis; an end label "<label>" at the line's last point (data-testid=`end-label-${id}`); the hover tooltip names the benchmark
// WealthGraph.tsx: legend chips in the legend area
//   one chip per chosen benchmark: a real <button data-testid=`legend-chip-${id}` aria-pressed> with a colour swatch (style color from benchmarkColor(index)) and the label; click hides or shows that line (local state, NOT stored); a hidden chip has aria-pressed="false"
// types.ts (type-only): WealthSeriesResponse gains  benchmark_series?: { benchmark: string; points: { date: string; pct: string }[]; clipped: boolean; effective_start: string | null; available: boolean }[]
// api.ts: getWealthSeries takes  benchmarks?: string[]  and sends them as REPEATED query parameters (benchmarks=a&benchmarks=b); the old single `benchmark` parameter still works unchanged
// useWealthSeries(scope, period, range, benchmarks: string[]) sends all of them
```
**My decisions where the workbook is silent (recorded in `decisions.md`):** at least one benchmark stays chosen (the last checked box cannot be unchecked, as the old drop-down always had one); a fourth box cannot be checked and the message **"Choose up to 3"** appears; the recommended option keeps its "(recommended)" suffix; the chosen list is remembered per browser exactly like the old single choice.

## Tests (write only these; invented data; written before any implementation; red for the stated reason)
- `BenchmarkSelect.test.tsx` (append; existing assertions untouched; the old single-select tests stay for the old props only if the component still supports them: if they cannot, **stop and list which old tests the new control replaces**): `checklist allows at most MAX_BENCHMARKS and a fourth shows "Choose up to 3"`; `the last checked benchmark cannot be unchecked`; `onChange gets the new list in the order checked`; `the recommended option keeps its suffix`; `disabled when there are no options`.
- `benchmarkChoice.test.ts` (append): `stored choice is a list and an old single stored value still loads`; `unknown stored index falls back to the recommended one`; `more than three stored are cut to three, order kept`; `blocked storage returns an empty list and writing does not throw`.
- `components/ui/charts/line-area-chart.test.tsx` (append): `chart draws more than one second line, each in its own colour`; `end label names each line`; `tooltip names the benchmark`; `the old single second line still draws unchanged`.
- `components/wealth-graph/WealthGraph.test.tsx` (append): `each chosen benchmark has a legend chip in its fixed colour`; `clicking a chip hides that line and its end label, clicking again shows them`; `hiding is not stored`.
- `features/home/api.test.ts` or `api.encode.test.ts` (append, whichever holds the wealth-series URL tests): `benchmarks are sent as repeated parameters`; `the old benchmark parameter is unchanged`.
- Stay red until D-6. **A test that only compiles once a missing export exists is red for that reason: say so in the report.**

## Run these only (Claude runs them; Codex cannot)
`wave-fe-check.sh d test src/features/home src/components` from the orchestrator. Codex: write the tests, run nothing, report BLOCKED on running.

## Files you may touch
Append to `features/home/components/{BenchmarkSelect.test.tsx,benchmarkChoice.test.ts}`, `components/ui/charts/line-area-chart.test.tsx`, `components/wealth-graph/WealthGraph.test.tsx`, and the one api test file; type-only additions to `features/home/types.ts` (the `benchmark_series` field). **Do not touch** any component, `api.ts`, hooks, any existing assertion, backend, config, fixtures' JSON.

## Constraints
Invented data only. No network. No new dependency. Git read-only. No deletion flags or recursive deletes. Colours are asserted only as "the swatch carries the colour `benchmarkColor(index)` returns", never as a hex.

## Report format
One fenced block `CODEX REPORT: d5-benchmark-checklist-red-tests`: status; baseline HEAD; drift; the list of tests with why each is red; any `it.todo` with its reason; files created or changed; `git status --short`; Deviations; Open questions.

## Paste-ready prompt
```
Front-end test writer for Unifolio (Codex). Read, in order:
1. Docs/orchestration/ui-common-rules-codex.md
2. Docs/orchestration/wave-common-rules.md (wins where they differ)
3. Docs/orchestration/2026-11-20-d5-benchmark-checklist-red-tests-handoff.md (your task: D-5, owner-approved)
Work only in D:\unifolio-d-charts on branch batch/d-charts. Git is read-only. No deletion flags or recursive deletes. Write the tests the handoff lists, exactly against the interfaces it fixes; touch only the files it names. You cannot run the front-end checks: do not try, report BLOCKED on running. If a rule cannot be tested from the interfaces given, write it as it.todo with the reason; do not invent behaviour.
Reply with the CODEX REPORT block from the handoff, nothing else.
```
