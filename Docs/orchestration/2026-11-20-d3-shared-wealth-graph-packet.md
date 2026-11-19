# Packet D-3: move the Home graph into one shared component, no visible change (Antigravity, front end)
**Batch D.** Owner approved 19 Nov. Plan: `Docs/superpowers/plans/2026-11-17-batch-d-charts-plan.md` (Task D-3; read "Global Constraints" and "Review Focus"). Spec: `Docs/orchestration/2026-11-13-batch-d-planning-workbook.html` (Q2 A: the same graph goes under the Mutual Funds Overview summary strip, so it must live in one shared place). **D-2 (the colour fix) is already done and committed** (`ff3f8e41`): `components/wealth-graph/benchmarkColors.ts` exists and `WealthCard.tsx` already uses `benchmarkColor`. Why Antigravity: the front-end checks run for you; Codex's sandbox cannot start them.

**Your clone:** `C:\Users\Ayush\ag-d3` (branch `ag/d3-wealth-graph`, cut from `batch/d-charts` at `ff3f8e41`). Work only there. Never edit `D:\Unifolio code`. Never run a git command that changes anything.
**Read first, in order:** `Docs/orchestration/ui-common-rules-antigravity.md`, `Docs/orchestration/wave-common-rules.md` (wins where they differ), `Docs/orchestration/2026-11-18-palette-reference-for-workers.md`, then this packet.

## The task
Create `frontend/src/components/wealth-graph/WealthGraph.tsx` and `useWealthSeries.ts` and make `frontend/src/features/home/sections/WealthCard.tsx` use them. **Home must look and behave exactly as it does today** (the chart, the period buttons, the custom-date calendar, the benchmark control, the note under the chart, the hide-values behaviour, every test id and every string). This is a **move**, not a redesign.
- `WealthGraph({ ... }: WealthGraphProps)` renders what the Home card renders for the chart area today: the line chart (portfolio line, the optional second benchmark line, its colour from `benchmarkColor`), the period buttons, the custom-date calendar, the benchmark control, the notes. `WealthCard` keeps the **headline value, the change line and the hide-values button**, and the partial-data badge, and renders `WealthGraph` for the rest. Props: pass in everything that came from the feature (the data, `period`, `onPeriodChange`, the benchmark choice and its change handler, `hideValues`, the benchmark options, and a `loadSeries` function if the hook is moved).
- `useWealthSeries(scope, period, range, benchmarks)` returns `{ data, status }`; it fetches the **existing** wealth-series route (until the backend task D-4 lands it sends the first benchmark only). If the data loading currently lives in a Home hook or in `WealthCard`, move it here **without changing the request**; if moving it would force a `features/*` import into `components/`, keep the fetch in the feature and pass the function in as a prop (`loadSeries`), and say which you did.
- **Import boundary (a guard test enforces it):** nothing under `frontend/src/components/` may import from `frontend/src/features/*`. Do not import `Scope`, `Period`, `HomeBenchmark` or the series type from `features/home/types`: define small structural types in `components/wealth-graph/types.ts` that the feature's own types satisfy.

## Tests
- The existing `features/home/sections/WealthCard.test.tsx` and **every other test under `features/home`** are the oracle: they must pass **unchanged** (the one assertion already updated for D-2 stays as is).
- Add `frontend/src/components/wealth-graph/WealthGraph.test.tsx`: move the chart, period-button, custom-dates, benchmark-control and note assertions out of `WealthCard.test.tsx` **by copying them** (the originals stay in place and green): `renders the same chart, period buttons, custom dates, benchmark control and note as the Home card did`; and keep one test `WealthCard keeps the headline value and the hide-values button`. Run the new test file first and show it fail (the module does not exist) before you create the component.

## Files you may change
New: `frontend/src/components/wealth-graph/{WealthGraph.tsx,useWealthSeries.ts,types.ts,WealthGraph.test.tsx}`; modify: `frontend/src/features/home/sections/WealthCard.tsx`, and (only if the move needs it) the Home hook or file the data loading lives in: list each in the report. Anything else: stop and report.
## Do not touch
`backend/**`, `frontend/src/mobile/**` (phone unchanged), `features/home/home-tokens.css`, `home-tokens.test.ts` (the owner's decision on removing them is open), `components/wealth-graph/benchmarkColors.ts` (done), `index.css`, `package.json`, lockfiles, the Home hide-values behaviour, the existing Inception performance graph, any existing assertion in any test.

## Checks (PowerShell)
```
wsl.exe -d Ubuntu -- bash "/mnt/d/Unifolio code/Docs/orchestration/wave-fe-check.sh" ag-d3 test src/components/wealth-graph src/features/home/sections/WealthCard.test.tsx
wsl.exe -d Ubuntu -- bash "/mnt/d/Unifolio code/Docs/orchestration/wave-fe-check.sh" ag-d3 test src/features/home src/components
wsl.exe -d Ubuntu -- bash "/mnt/d/Unifolio code/Docs/orchestration/wave-fe-check.sh" ag-d3 types
wsl.exe -d Ubuntu -- bash "/mnt/d/Unifolio code/Docs/orchestration/wave-fe-check.sh" ag-d3 lint src/features/home src/components
```
If WSL is denied on your machine, run the same in PowerShell inside the clone: `npx vitest run <paths>`, `npx tsc -b`, `npx oxlint <paths>`. (Known: `lint` reports about 11 warnings in files you do not touch; yours must add none.)

## Report (one block, nothing else)
Failing counts before and after; the exact commands and results; `git status --short`; where the data loading lives and why; the exact exports (names and signatures) of the new files; decisions the packet did not cover; anything you could not check (visual: the orchestrator compares Home screenshots before and after at 1280x600, 1440x810 and 1536x730); Open questions.

## Paste-ready prompt
```
You are the frontend worker for Unifolio (Antigravity). Read, in order:
1. Docs/orchestration/ui-common-rules-antigravity.md
2. Docs/orchestration/wave-common-rules.md (wins where they differ)
3. Docs/orchestration/2026-11-18-palette-reference-for-workers.md
4. Docs/orchestration/2026-11-20-d3-shared-wealth-graph-packet.md (your task: D-3)
Work only in C:\Users\Ayush\ag-d3 on branch ag/d3-wealth-graph. This is a move with no visible change: every existing test under features/home must pass unchanged. Tests first: add WealthGraph.test.tsx and show it fail before you create the component. Never run a git command that changes anything. Do not touch backend/**, frontend/src/mobile/**, home-tokens.css, home-tokens.test.ts, or any file outside the packet's Files list. Reply with the report block from the packet, nothing else.
```
