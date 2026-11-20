# Packet D-6: the benchmark checklist, legend chips and end labels (Antigravity, front end)
**Batch D, item 13.** Owner approved Batch D on 19 Nov. **Start only after D-5 (the red tests, `2026-11-20-d5-benchmark-checklist-red-tests-handoff.md`) is committed on `batch/d-charts`**: the orchestrator then cuts your clone `C:\Users\Ayush\ag-d6` (branch `ag/d6-benchmark-checklist`) from that commit and says so. Plan: `Docs/superpowers/plans/2026-11-17-batch-d-charts-plan.md` (Task D-6; "Global Constraints" and "Review Focus"). **Spec: `Docs/orchestration/2026-11-13-batch-d-planning-workbook.html`, section 2, the "After: three" drawing** (open it in a browser: the chip size, the checklist look, the end labels and the hover tooltip are drawn there). **The workbook is the design; the D-5 tests are the behaviour.** Colours only through tokens: one fixed colour per benchmark from `components/wealth-graph/benchmarkColors.ts` (Nifty 50 `--c3`, Nifty 500 `--c5`, LargeMidcap 250 `--c6`, Midcap 150 `--c4`, Smallcap 250 `--c2`); green stays the portfolio; light and dark pairs come from `styles/palette-tokens.css`. **Colour is never the only cue:** every line has an end label, every chip has the name, the tooltip names the benchmark (teal sits close to the portfolio green and indigo close to violet and blue). Text on the bright green is dark `#111111`; white only on the pressed deep green (`Docs/orchestration/2026-11-18-palette-reference-for-workers.md`).

**Read first, in order:** `Docs/orchestration/ui-common-rules-antigravity.md`, `Docs/orchestration/wave-common-rules.md` (wins where they differ), the palette reference, the D-5 handoff (it fixes every interface and my three decisions), then this packet.

## The task
Make the D-5 tests pass, nothing more:
- `features/home/components/benchmarkChoice.ts`: `MAX_BENCHMARKS = 3`, `readStoredBenchmarks`, `writeStoredBenchmarks`, `pickBenchmarks` exactly as D-5 fixes them (an old stored single value still loads; unknown indices fall back to the recommended one; at most three).
- `features/home/components/BenchmarkSelect.tsx`: the drop-down becomes a **checklist** (a button that opens a list of checkboxes, or an always-open list inside the card's popover: follow the drawing), at most 3 checked, a fourth shows **"Choose up to 3"**, the last checked cannot be unchecked, "(recommended)" kept, keyboard operable with a visible focus ring (`--ui-focus`), 24 px minimum touch target.
- `components/ui/charts/line-area-chart.tsx`: the new optional `benchmarkLines` prop (several lines on the right percent axis, each in its colour, an end label at its last point, a tooltip that names the benchmark); the old single-line prop keeps working **unchanged** (the Inception performance graph and any other user of the chart must not change by a pixel).
- `components/wealth-graph/WealthGraph.tsx` (**legend area only**) and `useWealthSeries.ts`: the legend chips (real buttons, `aria-pressed`, swatch in the benchmark's colour, click hides or shows the line, not stored); the hook sends all chosen benchmarks.
- `features/home/api.ts` (`getWealthSeries` sends `benchmarks` as repeated parameters), `features/home/types.ts` (the `benchmark_series` field is already added by D-5), and the place that holds the choice (`features/home/sections/WealthCard.tsx` / `HomePage.tsx` wiring): pass the list down, store it with `writeStoredBenchmarks`.
- **No visible change anywhere else:** with one benchmark chosen, Home looks and reads as it does today, except that the control is now the checklist and the chip appears; the headline text line under the value ("Nifty 500 +12.3%") keeps showing the **first chosen** benchmark exactly as now (the old `benchmark` field).

## Tests
`BenchmarkSelect.test.tsx`, `benchmarkChoice.test.ts`, `line-area-chart.test.tsx`, `WealthGraph.test.tsx`, the api test are the oracle: **run them first and show the new ones fail, then make them pass.** Every older test under `features/home` and `components` must pass unchanged **except those the D-5 report lists as replaced by the new control** (the old single-select assertions; the orchestrator updates them with you, not you alone: if one conflicts, stop and report). Do not edit a test.

## Files you may change
`features/home/components/{BenchmarkSelect.tsx,benchmarkChoice.ts}`, `components/ui/charts/line-area-chart.tsx`, `components/wealth-graph/{WealthGraph.tsx,useWealthSeries.ts,types.ts}`, `features/home/api.ts`, `features/home/sections/WealthCard.tsx`, `features/home/HomePage.tsx` (only the benchmark wiring), `features/home/types.ts` (only if D-5 missed a type). List each touched file in the report. Anything else: stop and report.
## Do not touch
`backend/**`, `frontend/src/mobile/**`, `features/home/home-tokens.css`, `home-tokens.test.ts`, `components/wealth-graph/benchmarkColors.ts` (done), `index.css`, `package.json`, lockfiles, the Inception performance graph's own file, the Home hide-values behaviour, any assertion in any test.

## Checks (PowerShell, from your clone)
```
wsl.exe -d Ubuntu -- bash "/mnt/d/Unifolio code/Docs/orchestration/wave-fe-check.sh" ag-d6 test src/features/home src/components
wsl.exe -d Ubuntu -- bash "/mnt/d/Unifolio code/Docs/orchestration/wave-fe-check.sh" ag-d6 types
wsl.exe -d Ubuntu -- bash "/mnt/d/Unifolio code/Docs/orchestration/wave-fe-check.sh" ag-d6 lint src/features/home src/components
```
If WSL is denied on your machine, run the same in PowerShell inside the clone: `npx vitest run <paths>`, `npx tsc -b`, `npx oxlint <paths>`.

## Report (one block, nothing else)
Failing counts before and after; the exact commands and results; `git status --short`; the exact exports (names and signatures) you changed; decisions the packet did not cover; anything you could not check (visual: the orchestrator compares to the drawing at 1280x600, 1440x810 and 1536x730, light and dark, and checks that teal against green and indigo against violet are told apart by their labels); Open questions.

## Paste-ready prompt
```
You are the frontend worker for Unifolio (Antigravity). Read, in order:
1. Docs/orchestration/ui-common-rules-antigravity.md
2. Docs/orchestration/wave-common-rules.md (wins where they differ)
3. Docs/orchestration/2026-11-18-palette-reference-for-workers.md
4. Docs/orchestration/2026-11-20-d5-benchmark-checklist-red-tests-handoff.md
5. Docs/orchestration/2026-11-20-d6-benchmark-checklist-packet.md (your task: D-6)
Open Docs/orchestration/2026-11-13-batch-d-planning-workbook.html, section 2, "After: three", and build to its drawing. Work only in C:\Users\Ayush\ag-d6 on branch ag/d6-benchmark-checklist. Tests first: run the D-5 tests and show the new ones fail, then make them pass. Never run a git command that changes anything. Touch only the files the packet lists; do not touch backend/**, frontend/src/mobile/**, home-tokens.css or any test. Reply with the report block from the packet, nothing else.
```
