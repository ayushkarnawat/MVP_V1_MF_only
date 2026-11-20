# Packet D-6c: the several-benchmarks request, the reply type and the legend chips (Antigravity, front end, lane G-a3)
**Batch D, item 13.** Owner approved Batch D on 19 Nov. Plan: `Docs/superpowers/plans/2026-11-17-batch-d-charts-plan.md` (Task D-6). **Spec: `Docs/orchestration/2026-11-13-batch-d-planning-workbook.html`, section 2, the "After: three" drawing** (open it: the legend chips' size, swatch, pressed and hidden looks are drawn there). **The workbook is the design.** One of four lanes that run at the same time on disjoint files: D-10 (the pop-up), D-6a (the chart), D-6b (the checklist control), D-6c (this). **You build the request and reply plumbing and one standalone legend component; you touch neither the chart, nor the checklist, nor `WealthGraph.tsx`, nor the Home card.** The wiring of all the lanes into `WealthGraph` and the Home card is a later task (D-6d).
Common rules for the D-6 lanes: `2026-11-20-d6-benchmark-checklist-packet.md` (design paragraph; ignore its single-task framing) and `2026-11-20-d5-benchmark-checklist-red-tests-handoff.md` (interfaces and my decisions). The backend is done: `GET .../home/wealth-series?benchmarks=a&benchmarks=b` (repeatable, at most 3, else 422) returns the old fields plus `benchmark_series: [{ benchmark, points: [{ date, pct }], clipped, effective_start, available }]` (absent when none was asked for). Colours only through tokens (`components/wealth-graph/benchmarkColors.ts`: `benchmarkColor(index)`); colour is never the only cue (the chip carries the name).

**Your clone:** `C:\Users\Ayush\ag-d6c` (branch `ag/d6c-benchmarks`, cut from `batch/d-charts` at `204cf46c`). Work only there. Never edit `D:\Unifolio code`. Never run a git command that changes anything.
**Read first, in order:** `Docs/orchestration/ui-common-rules-antigravity.md`, `Docs/orchestration/wave-common-rules.md` (wins where they differ), `Docs/orchestration/2026-11-18-palette-reference-for-workers.md`, the two docs above, then this packet.

## The task (additive: the old single `benchmark` parameter and every existing field keep working unchanged)
1. **The request.** There are two places that build the wealth-series URL: `frontend/src/features/home/api.ts` (`getWealthSeries`, through `homePath(...)`) and `frontend/src/components/wealth-graph/useWealthSeries.ts` (`wealthSeriesPath`). In both, accept `benchmarks?: string[]` in the query type (`WealthSeriesQuery` in `features/home/types.ts` / `components/wealth-graph/types.ts`: add the optional field) and send it as **repeated parameters** (`benchmarks=a&benchmarks=b`, in the order given; none when empty or absent). The old `benchmark` parameter is sent exactly as today. If `homePath` cannot repeat a key, extend it without changing any existing call's output.
2. **The reply type.** Add the optional field `benchmark_series?: { benchmark: string; points: { date: string; pct: string }[]; clipped: boolean; effective_start: string | null; available: boolean }[]` to the wealth-series reply types in both type files (`WealthSeriesResponse` and the structural `WealthSeriesData`); export a named type `BenchmarkSeriesEntry` for it. No other type changes.
3. **NEW `frontend/src/components/wealth-graph/BenchmarkLegend.tsx`** (a new file): `export interface BenchmarkLegendItem { id: string; label: string; color: string }`, `export interface BenchmarkLegendProps { items: BenchmarkLegendItem[]; hidden: ReadonlySet<string>; onToggle: (id: string) => void }`. One chip per item: a real `<button type="button" data-testid={`legend-chip-${id}`} aria-pressed={!hidden.has(id)}>` with a colour swatch (the item's `color`) and the label; click calls `onToggle(id)`; a hidden chip is dimmed (`aria-pressed="false"`) and keeps its name readable; wraps on a narrow card; visible focus ring (`--ui-focus`); 24 px minimum target; renders nothing for an empty list. The component stores nothing (hiding is local to the caller).

## Tests (you write them first; show them fail, then make them pass)
Append to the api test that holds the wealth-series URL tests (`features/home/api.test.ts` or `api.encode.test.ts`: whichever has them) and to the test of `useWealthSeries` (find it under `components/wealth-graph/`; if `wealthSeriesPath` has no test file, add `useWealthSeries.test.ts`): `benchmarks are sent as repeated parameters in order`; `no benchmarks parameter when the list is empty or absent`; `the old benchmark parameter is unchanged`. New `BenchmarkLegend.test.tsx`: `one chip per benchmark in its colour`; `clicking a chip calls onToggle with its id`; `a hidden chip has aria-pressed false and keeps its name`; `renders nothing for an empty list`; `works with the keyboard (Tab, Space, Enter)`.

## Files you may change
`features/home/api.ts` (+ its test), `features/home/types.ts`, `components/wealth-graph/{useWealthSeries.ts,types.ts}` (+ test), new `components/wealth-graph/{BenchmarkLegend.tsx,BenchmarkLegend.test.tsx}`. A shared URL helper if `homePath` needs one: list it. Anything else: stop and report.
## Do not touch
`components/wealth-graph/WealthGraph.tsx`, `components/ui/charts/**`, `features/home/components/**` (lane D-6b), `features/home/sections/**`, `HomePage.tsx`, `backend/**`, `frontend/src/mobile/**`, `home-tokens.css`, `home-tokens.test.ts`, `index.css`, `package.json`, lockfiles, any existing assertion.

## Checks (PowerShell, from your clone)
```
wsl.exe -d Ubuntu -- bash "/mnt/d/Unifolio code/Docs/orchestration/wave-fe-check.sh" ag-d6c test src/components src/features/home
wsl.exe -d Ubuntu -- bash "/mnt/d/Unifolio code/Docs/orchestration/wave-fe-check.sh" ag-d6c types
wsl.exe -d Ubuntu -- bash "/mnt/d/Unifolio code/Docs/orchestration/wave-fe-check.sh" ag-d6c lint src/components src/features/home
```
If WSL is denied on your machine, run the same in PowerShell inside the clone: `npx vitest run <paths>`, `npx tsc -b`, `npx oxlint <paths>`.

## Report (one block, nothing else)
Failing counts before and after; the exact commands and results; `git status --short`; the exact exports and type changes; decisions the packet did not cover; anything you could not check (visual: the orchestrator compares the chips to the drawing at 1280x600, 1440x810 and 1536x730, light and dark); Open questions.

## Paste-ready prompt
```
You are the frontend worker for Unifolio (Antigravity). Read, in order:
1. Docs/orchestration/ui-common-rules-antigravity.md
2. Docs/orchestration/wave-common-rules.md (wins where they differ)
3. Docs/orchestration/2026-11-18-palette-reference-for-workers.md
4. Docs/orchestration/2026-11-20-d5-benchmark-checklist-red-tests-handoff.md and Docs/orchestration/2026-11-20-d6-benchmark-checklist-packet.md (background only)
5. Docs/orchestration/2026-11-20-d6c-benchmark-data-path-and-legend-packet.md (your task: D-6c)
Open Docs/orchestration/2026-11-13-batch-d-planning-workbook.html, section 2, "After: three", and build the legend chips to its drawing. Work only in C:\Users\Ayush\ag-d6c on branch ag/d6c-benchmarks. Tests first: write the new tests and show them fail, then make them pass. Add the request plumbing, the reply type and the new BenchmarkLegend.tsx; do not edit WealthGraph.tsx, the chart, the checklist or the Home card. Never run a git command that changes anything. Touch only the files the packet lists. Reply with the report block from the packet, nothing else.
```
