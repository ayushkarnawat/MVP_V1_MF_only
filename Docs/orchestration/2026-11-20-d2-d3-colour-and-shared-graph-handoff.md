# Handoff: d2-d3-colour-and-shared-graph (Batch D, tasks D-2 then D-3, front end, Codex)
**Status:** READY TO RELAY (written 2026-11-20). **Approved by the owner on 19 Nov 2026** ("you have my approval with Batch D"): the colour fix FX-13d (D-2) and the batch as planned. Two parts in one task, because D-3 builds on D-2's files; report each separately. Runs **at the same time as** `2026-11-20-h3-tutorial-red-tests-handoff.md` (different worktree, different files).
**Parent plan:** `Docs/superpowers/plans/2026-11-17-batch-d-charts-plan.md` (Tasks D-2 and D-3; read its "Global Constraints" and "Review Focus"). **Spec:** `Docs/orchestration/2026-11-13-batch-d-planning-workbook.html` (Q1 B: up to three benchmarks; Q2 A: graph under the Overview summary strip; section 2: the root cause and FX-13d). The workbook is the design; if it and the code disagree, stop and say so.
**Worker:** Codex. This task is front end only (no backend file). **Reviewer and committer:** Claude.
**Work in:** `D:\unifolio-d-charts` (branch `batch/d-charts`, cut from `leapswitch-redesign` after M1; the front end is `D:\unifolio-d-charts\frontend`). Never in `D:\Unifolio code`.
Read first, in order: `Docs/orchestration/ui-common-rules-codex.md`, `Docs/orchestration/wave-common-rules.md` (wins where they differ), `Docs/orchestration/2026-11-18-palette-reference-for-workers.md`, then this file.

## Wave-start check (done 20 Nov; re-check, report drift)
`frontend/src/features/home/sections/WealthCard.tsx` still paints the benchmark line and its text with `var(--home-bench)` (lines ~260 and ~344); `frontend/src/index.css` does **not** import `features/home/home-tokens.css`, so `--home-bench` is never defined and the line is invisible (root cause found 13 Nov). `features/home/components/BenchmarkSelect.tsx`, `benchmarkChoice.ts`, `components/ui/charts/line-area-chart.tsx`, `features/home/sections/Movers.tsx`, `features/mutual-funds/overview/OverviewPage.tsx` exist.

## Part 1: D-2, the colour fix (FX-13d)
**Change.** Create `frontend/src/components/wealth-graph/benchmarkColors.ts` exporting `BENCHMARK_COLORS: Record<HomeBenchmark, string>` with **exactly** these always-loaded palette tokens keyed by the existing `HomeBenchmark` ids: Nifty 50 `var(--c3)` (blue), Nifty 500 `var(--c5)` (violet), Nifty LargeMidcap 250 `var(--c6)` (amber), Nifty Midcap 150 `var(--c4)` (indigo), Nifty Smallcap 250 `var(--c2)` (teal); and `benchmarkColor(b: HomeBenchmark): string`. Replace both `var(--home-bench)` uses in `WealthCard.tsx` (the second line's stroke and the text line below the value) with `benchmarkColor(<the chosen benchmark>)`; the text line uses the **same** colour as its line. Green stays the portfolio's line. **Do not delete or edit `features/home/home-tokens.css` or `home-tokens.test.ts`** (the owner's decision on removing them is open; keep them untouched). Colour is never the only cue: the line already has a text label and the tooltip names the benchmark; do not remove either. **Check each `--cN` token exists in the always-loaded stylesheet** (`src/styles/palette-tokens.css` or whatever `index.css` loads: name the file) and report if any is missing; do not invent a hex.
**Tests first (new `features/home/homeTokensLoaded.test.ts`; existing `WealthCard.test.tsx` gets new `it` blocks):** `every var(--name) used under features/home is defined in a stylesheet that src/index.css loads` (fails today for `--home-bench`); `the second line stroke and the text line use the benchmark's mapped colour`; `each benchmark has a distinct colour`.

## Part 2: D-3, move the Home graph into a shared component, no visible change
**Change.** Create `frontend/src/components/wealth-graph/WealthGraph.tsx` and `useWealthSeries.ts`. `WealthGraph({ scope, defaultPeriod, hideValues, benchmarkChoice }: WealthGraphProps)` renders what the Home card renders today (the chart, the period buttons, the custom-date calendar, the benchmark control, the note); `useWealthSeries(scope: Scope, period: Period, range: DateRange | null, benchmarks: HomeBenchmark[]) -> { data, status }` fetches the **existing** wealth-series route; until D-4 (backend) lands it sends the first benchmark only. `WealthCard.tsx` keeps the headline value and the hide-values button and uses `WealthGraph`. **No `features/*` import inside `components/`** (move or accept what the graph needs through props or into `components/`; the boundary guard test must stay green). **Home must look and behave exactly as before.**
**Tests first:** `WealthGraph.test.tsx` (new): `renders the same chart, period buttons, custom dates, benchmark control and note as the Home card did` (move the matching assertions from `WealthCard.test.tsx`; the originals must stay green too); `WealthCard keeps the headline value and the hide-values button`.

## Run these only
```
cd frontend
npx vitest run src/features/home/homeTokensLoaded.test.ts src/features/home/sections/WealthCard.test.tsx src/components/wealth-graph
npx vitest run src/features/home
npx tsc -b
npx oxlint src/features/home src/components
```
If `node_modules` is missing in the worktree, use the orchestrator's script from WSL (lane `d` is added for this worktree): `bash "/mnt/d/Unifolio code/Docs/orchestration/wave-fe-check.sh" d test <paths under src/>`, `... d types`, `... d lint <paths>`. If WSL is denied to you, report BLOCKED with the exact error; the orchestrator runs it. Run every new test **before** the change and report it red for the stated reason (the guards, such as the original `WealthCard` tests, must pass today). Part 1 first, then Part 2; **`tsc` and lint clean after each**.

## Files you may touch
`frontend/src/components/wealth-graph/{benchmarkColors.ts,WealthGraph.tsx,useWealthSeries.ts}` (new), `frontend/src/features/home/sections/WealthCard.tsx`, `frontend/src/features/home/homeTokensLoaded.test.ts` (new), `frontend/src/features/home/sections/WealthCard.test.tsx`, `frontend/src/components/wealth-graph/WealthGraph.test.tsx` (new), and, only if the move needs it, the files it moves out of or imports (list each in the report). **Do not touch** `backend/**`, `frontend/src/mobile/**` (phone unchanged), `home-tokens.css`, `home-tokens.test.ts`, `index.css`, `package.json`, lockfiles, the Home hide-values behaviour, the existing Inception performance graph.

## Constraints
No new dependency. No hex colours (tokens only). No analytics events (GA4 paused); keep the stable test ids the Home tracking plan names. Invented data only. Git read-only. No deletion flags or recursive deletes.

## Report format
One fenced block `CODEX REPORT: d2-d3-colour-and-shared-graph`: status; baseline HEAD; drift; **Part 1 and Part 2 separately**: which new tests were red first, the files changed with a one-line reason each, which stylesheet defines the five `--cN` tokens, the exact exports (names and signatures) of the new files; commands with counts; any existing test that fails; `git status --short`; Deviations; Open questions.

## Paste-ready prompt
```
Frontend worker for Unifolio (Codex). Read, in order:
1. Docs/orchestration/ui-common-rules-codex.md
2. Docs/orchestration/wave-common-rules.md (wins where they differ)
3. Docs/orchestration/2026-11-18-palette-reference-for-workers.md
4. Docs/orchestration/2026-11-20-d2-d3-colour-and-shared-graph-handoff.md (your task: D-2 then D-3, owner-approved)
Work only in D:\unifolio-d-charts (frontend folder) on branch batch/d-charts. Git is read-only. No deletion flags or recursive deletes. Write the failing tests first, run them, then make the change in the files the handoff names only. Do not edit home-tokens.css or home-tokens.test.ts. Home must look and behave exactly as before. If an existing test fails because it asserts the old behaviour, do not edit it: report it.
Run checks with the commands in the handoff (if the sandbox cannot run them, reply BLOCKED with the exact error, do not change any config).
Reply with the CODEX REPORT block from the handoff, nothing else.
```
