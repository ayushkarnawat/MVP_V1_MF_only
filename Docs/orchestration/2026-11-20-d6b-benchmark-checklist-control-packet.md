# Packet D-6b: the benchmark checklist control and its stored choice (Antigravity, front end, lane G-a2)
**Batch D, item 13.** Owner approved Batch D on 19 Nov. Plan: `Docs/superpowers/plans/2026-11-17-batch-d-charts-plan.md` (Task D-6). **Spec: `Docs/orchestration/2026-11-13-batch-d-planning-workbook.html`, section 2, the "After: three" drawing** (open it in a browser: the checklist look, "Choose up to 3", the recommended suffix). **The workbook is the design.** One of four lanes that run at the same time on disjoint files: D-10 (the pop-up), D-6a (the chart), D-6b (this), D-6c (data path and legend). **You build two new pieces and touch nothing that uses them.** Wiring into the Home card is a later task (D-6d).
Common rules for the D-6 lanes: `2026-11-20-d6-benchmark-checklist-packet.md` (design paragraph; ignore its single-task framing) and `2026-11-20-d5-benchmark-checklist-red-tests-handoff.md` (interfaces and my decisions). Text on the bright green is dark `#111111`; white only on the pressed deep green (palette reference).

**Your clone:** `C:\Users\Ayush\ag-d6b` (branch `ag/d6b-benchmarks`, cut from `batch/d-charts` at `204cf46c`). Work only there. Never edit `D:\Unifolio code`. Never run a git command that changes anything.
**Read first, in order:** `Docs/orchestration/ui-common-rules-antigravity.md`, `Docs/orchestration/wave-common-rules.md` (wins where they differ), `Docs/orchestration/2026-11-18-palette-reference-for-workers.md`, the two docs above, then this packet.

## The task (additive: nothing existing is changed or removed)
1. **`frontend/src/features/home/components/benchmarkChoice.ts`**: **add** beside the existing functions (which stay, because `WealthGraph`/`WealthCard` still use them until D-6d):
   `export const MAX_BENCHMARKS = 3;` `readStoredBenchmarks(): string[]` (the stored value is a JSON list; an OLD plain string such as `nifty_50` still loads as `["nifty_50"]`; anything else or blocked storage gives `[]`), `writeStoredBenchmarks(indices: string[]): void` (JSON list under the same key `home.benchmark`; storage errors swallowed), `pickBenchmarks(options: BenchmarkOptionOut[], stored: string[], recommendedIndex: string): string[]` (keeps stored indices that are still offered, in stored order, at most `MAX_BENCHMARKS`; none left gives `[recommendedIndex]` if offered, else `[options[0].index]`; no options gives `[]`).
2. **NEW `frontend/src/features/home/components/BenchmarkChecklist.tsx`** (a new file; `BenchmarkSelect.tsx` is **not** edited and stays until D-6d replaces its use): `export interface BenchmarkChecklistProps { options: BenchmarkOptionOut[]; values: string[]; onChange: (values: string[]) => void; disabled?: boolean; max?: number /* default MAX_BENCHMARKS */ }`. A button that opens a list of checkboxes (or an always-open list in the card's popover: follow the drawing). Rules: at most `max` checked; a fourth box cannot be checked and the message **"Choose up to 3"** appears; **the last checked box cannot be unchecked** (my decision: one benchmark always stays); `onChange` gets the new list in the order checked; the recommended option keeps its "(recommended)" suffix; disabled when there are no options; keyboard operable with a visible focus ring (`--ui-focus`), 24 px minimum target, real `role="checkbox"` semantics (native checkboxes are fine), the open list is a labelled group; a colour dot next to each name uses the colour from `components/wealth-graph/benchmarkColors.ts` (`benchmarkColor(index)`) so the chip colours and the list agree (import is allowed: it is under `components/`, and `features/` may import `components/`).

## Tests (you write them first; show them fail, then make them pass)
Append to `benchmarkChoice.test.ts` (existing assertions untouched): `stored choice is a list and an old single stored value still loads`; `unknown stored index falls back to the recommended one`; `more than three stored are cut to three, order kept`; `blocked storage returns an empty list and writing does not throw`. New `BenchmarkChecklist.test.tsx`: `allows at most MAX_BENCHMARKS and a fourth shows "Choose up to 3"`; `the last checked benchmark cannot be unchecked`; `onChange gets the new list in the order checked`; `the recommended option keeps its suffix`; `disabled when there are no options`; `each option shows the colour of its benchmark`; `works with the keyboard (Tab, Space)`.

## Files you may change
`benchmarkChoice.ts`, `benchmarkChoice.test.ts` (appended), new `BenchmarkChecklist.tsx` and `BenchmarkChecklist.test.tsx`, all under `frontend/src/features/home/components/`. Anything else: stop and report.
## Do not touch
`BenchmarkSelect.tsx` and its test, `components/wealth-graph/**`, `components/ui/charts/**`, `features/home/sections/**`, `HomePage.tsx`, `api.ts`, `types.ts`, `backend/**`, `frontend/src/mobile/**`, `home-tokens.css`, `home-tokens.test.ts`, `index.css`, `package.json`, lockfiles, any existing assertion.

## Checks (PowerShell, from your clone)
```
wsl.exe -d Ubuntu -- bash "/mnt/d/Unifolio code/Docs/orchestration/wave-fe-check.sh" ag-d6b test src/features/home
wsl.exe -d Ubuntu -- bash "/mnt/d/Unifolio code/Docs/orchestration/wave-fe-check.sh" ag-d6b types
wsl.exe -d Ubuntu -- bash "/mnt/d/Unifolio code/Docs/orchestration/wave-fe-check.sh" ag-d6b lint src/features/home
```
If WSL is denied on your machine, run the same in PowerShell inside the clone: `npx vitest run <paths>`, `npx tsc -b`, `npx oxlint <paths>`.

## Report (one block, nothing else)
Failing counts before and after; the exact commands and results; `git status --short`; the exact exports (names and signatures); decisions the packet did not cover; anything you could not check (visual: the orchestrator compares to the drawing at 1280x600, 1440x810 and 1536x730, light and dark); Open questions.

## Paste-ready prompt
```
You are the frontend worker for Unifolio (Antigravity). Read, in order:
1. Docs/orchestration/ui-common-rules-antigravity.md
2. Docs/orchestration/wave-common-rules.md (wins where they differ)
3. Docs/orchestration/2026-11-18-palette-reference-for-workers.md
4. Docs/orchestration/2026-11-20-d5-benchmark-checklist-red-tests-handoff.md and Docs/orchestration/2026-11-20-d6-benchmark-checklist-packet.md (background only)
5. Docs/orchestration/2026-11-20-d6b-benchmark-checklist-control-packet.md (your task: D-6b)
Open Docs/orchestration/2026-11-13-batch-d-planning-workbook.html, section 2, "After: three", and build to its drawing. Work only in C:\Users\Ayush\ag-d6b on branch ag/d6b-benchmarks. Tests first: write the new tests and show them fail, then make them pass. Add the new storage functions and the new BenchmarkChecklist.tsx; do not edit BenchmarkSelect.tsx or anything that uses it. Never run a git command that changes anything. Touch only the files the packet lists. Reply with the report block from the packet, nothing else.
```
