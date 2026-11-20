# Packet D-6a: several benchmark lines, end labels and a tooltip in the line chart (Antigravity, front end, lane G-a1)
**Batch D, item 13.** Owner approved Batch D on 19 Nov. Plan: `Docs/superpowers/plans/2026-11-17-batch-d-charts-plan.md` (Task D-6). **Spec: `Docs/orchestration/2026-11-13-batch-d-planning-workbook.html`, section 2, the "After: three" drawing** (open it in a browser: line colours, end label placement and the hover tooltip are drawn there). **The workbook is the design.** This is one of four lanes that run at the same time on disjoint files: D-10 (the pop-up), D-6a (this), D-6b (the checklist control), D-6c (data path and legend). **You touch only the chart.** The final wiring of the lanes into `WealthGraph` and the Home card is a later task (D-6d), not yours.
Common rules for all the D-6 lanes (colours, the contract, my decisions): `2026-11-20-d6-benchmark-checklist-packet.md` (read its design paragraph, ignore its single-task framing) and `2026-11-20-d5-benchmark-checklist-red-tests-handoff.md` (the interfaces). Colours only through tokens: each line gets the colour it is **given** in `ChartBenchmarkLine.color` (the caller passes `benchmarkColor(index)`); the chart never picks a benchmark colour itself. **Colour is never the only cue:** every line has an end label with its name and the tooltip names it.

**Your clone:** `C:\Users\Ayush\ag-d6a` (branch `ag/d6a-benchmarks`, cut from `batch/d-charts` at `204cf46c`). Work only there. Never edit `D:\Unifolio code`. Never run a git command that changes anything.
**Read first, in order:** `Docs/orchestration/ui-common-rules-antigravity.md`, `Docs/orchestration/wave-common-rules.md` (wins where they differ), `Docs/orchestration/2026-11-18-palette-reference-for-workers.md`, the two docs above, then this packet.

## The task
In `frontend/src/components/ui/charts/line-area-chart.tsx` add an **optional** prop `benchmarkLines?: ChartBenchmarkLine[]` beside the existing single second-line prop (which keeps working **unchanged**: the Inception performance graph and every other user of the chart must not change by a pixel):
```ts
export interface ChartBenchmarkLine { id: string; label: string; color: string; points: { date: string; pct: string }[] }
```
- Each line is drawn on the **right (percent) axis** in its own colour, from where its data begins (its first point's date), matched to the chart's dates by date, **never dropped** for a point-count difference. Two scales stay (rupees left, percent right from 0%).
- An **end label** with the line's `label` at its last point (`data-testid={`end-label-${id}`}`), placed so up to three labels do not overlap (nudge them apart vertically when their last points are close).
- The hover tooltip **names each benchmark** with its value at that date, next to the portfolio value.
- Accessible: the chart keeps its existing accessible name; each end label is real text (not only SVG paint).
- Hide-values behaviour of the chart is unchanged.

## Tests (you write them first; show them fail, then make them pass)
Append to `frontend/src/components/ui/charts/line-area-chart.test.tsx` (existing assertions untouched): `chart draws more than one second line, each in the colour it is given`; `end label names each line`; `end labels of lines that finish close together do not overlap`; `tooltip names the benchmark`; `a line that starts later than the chart is drawn from its own first date, not dropped`; `the old single second line still draws unchanged`.

## Files you may change
`frontend/src/components/ui/charts/line-area-chart.tsx` and `line-area-chart.test.tsx`. Anything else: stop and report.
## Do not touch
`backend/**`, `frontend/src/mobile/**`, `home-tokens.css`, `home-tokens.test.ts`, `components/wealth-graph/**` (lane D-6c and the later wiring own it), `features/home/**`, `index.css`, `package.json`, lockfiles, any existing assertion.

## Checks (PowerShell, from your clone)
```
wsl.exe -d Ubuntu -- bash "/mnt/d/Unifolio code/Docs/orchestration/wave-fe-check.sh" ag-d6a test src/components
wsl.exe -d Ubuntu -- bash "/mnt/d/Unifolio code/Docs/orchestration/wave-fe-check.sh" ag-d6a test src/features/home src/features/mutual-funds
wsl.exe -d Ubuntu -- bash "/mnt/d/Unifolio code/Docs/orchestration/wave-fe-check.sh" ag-d6a types
wsl.exe -d Ubuntu -- bash "/mnt/d/Unifolio code/Docs/orchestration/wave-fe-check.sh" ag-d6a lint src/components
```
If WSL is denied on your machine, run the same in PowerShell inside the clone: `npx vitest run <paths>`, `npx tsc -b`, `npx oxlint <paths>`.

## Report (one block, nothing else)
Failing counts before and after; the exact commands and results; `git status --short`; the exact exports changed; decisions the packet did not cover; anything you could not check (visual: the orchestrator compares to the drawing at 1280x600, 1440x810 and 1536x730, light and dark); Open questions.

## Paste-ready prompt
```
You are the frontend worker for Unifolio (Antigravity). Read, in order:
1. Docs/orchestration/ui-common-rules-antigravity.md
2. Docs/orchestration/wave-common-rules.md (wins where they differ)
3. Docs/orchestration/2026-11-18-palette-reference-for-workers.md
4. Docs/orchestration/2026-11-20-d5-benchmark-checklist-red-tests-handoff.md and Docs/orchestration/2026-11-20-d6-benchmark-checklist-packet.md (background only)
5. Docs/orchestration/2026-11-20-d6a-chart-benchmark-lines-packet.md (your task: D-6a)
Open Docs/orchestration/2026-11-13-batch-d-planning-workbook.html, section 2, "After: three", and build to its drawing. Work only in C:\Users\Ayush\ag-d6a on branch ag/d6a-benchmarks. Tests first: write the new chart tests and show them fail, then make them pass. The existing single second line must not change. Touch only line-area-chart.tsx and its test. Never run a git command that changes anything. Reply with the report block from the packet, nothing else.
```
