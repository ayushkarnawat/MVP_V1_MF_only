# Handoff: d7-overview-graph (Batch D, task D-7: the same wealth graph on the Mutual Funds Overview, front end, Codex)
**Status:** READY TO RELAY (written 2026-11-20). **Approved by the owner on 19 Nov 2026** (Batch D, item 14: "Keep it on Home and add it to the Overview"). Runs **at the same time as** `2026-11-20-d12-series-end-date-handoff.md` (different worktree and files) and the four Antigravity lanes (D-10, D-6a, D-6b, D-6c; none of them touches the Overview).
**Parent plan:** `Docs/superpowers/plans/2026-11-17-batch-d-charts-plan.md` (Task D-7; "Global Constraints" and "Review Focus"). **Spec:** `Docs/orchestration/2026-11-13-batch-d-planning-workbook.html`, section 3 ("The same graph on the MF Overview"; open it: placement and the Overview's states are drawn). The workbook is the design; if it and the code disagree, stop and say so.
**Worker:** Codex. **It cannot run the front-end checks (its sandbox is refused WSL): it writes the tests first and the change, runs nothing, and reports BLOCKED on running; Claude runs them (lane `do`) and confirms the red-then-green.** **Reviewer and committer:** Claude.
**Work in:** `D:\unifolio-d-overview` (a new worktree, branch `batch/d-overview`, cut from `batch/d-charts` at `204cf46c`). Never in `D:\Unifolio code`.
Read first, in order: `Docs/orchestration/ui-common-rules-codex.md`, `Docs/orchestration/wave-common-rules.md` (wins where they differ), then this file.

## Wave-start check (re-check, report drift)
`frontend/src/features/mutual-funds/overview/OverviewPage.tsx` exists (the body renders the summary strip, the holdings table, the SIP timeline); `frontend/src/components/wealth-graph/WealthGraph.tsx` and `useWealthSeries.ts` exist (D-3) and `features/home/sections/WealthCard.tsx` shows how Home mounts them (the data loading, the period, the custom range, the benchmark list and choice, hide-values); whether the Overview has **its own hide-values control** (the plan: if not, hide amounts only when Home's setting is on, and say which).

## The change
- Mount `WealthGraph` on the Overview **directly under the summary strip and above the SIP timeline**, for the Overview's own scope (the family or the one member the Overview is showing: it must follow the scope selector, like the strip does).
- **Loads after the strip and the holdings table; it never blocks them** (start the wealth request only once the dashboard data is in, or lazily; an error or a slow graph leaves the strip, the table and everything else working, with the graph's own error and retry).
- The benchmark choice is **one device setting shared with Home** (the same stored value `home.benchmark`: read it with the helpers Home uses today, `readStoredBenchmark` / `writeStoredBenchmark` / `pickBenchmark` in `features/home/components/benchmarkChoice.ts`: do **not** change those files; **another lane is adding list versions of them at the same time, and the wiring to the list happens later in D-6d**: use the single-choice functions now). The period default is **not** shared (the Overview starts on its own default, 1Y).
- Hide-values follows Home's existing rule (percentages stay, rupee amounts become dots).
- The monthly sparkline in the summary strip **stays**. Nothing else on the Overview moves.
- **Old link:** no backend change; the request is the existing wealth-series route.

## Tests first (`frontend/src/features/mutual-funds/overview/OverviewPage.test.tsx`: append; existing assertions untouched; invented data; written before the change; red for the stated reason)
`graph appears directly under the summary strip and above the SIP timeline`; `graph follows the family or member selector` (the wealth request is made for the selected scope and is repeated when the selector changes); `loads after the strip and the table (does not block them)` (while the wealth request is pending, the strip and table are present; an error in the graph does not remove them); `the graph shows amounts like the rest of the Overview (no hide control there)`; `monthly sparkline in the strip stays`; `the benchmark choice is the one Home stores`.

## Run these only (Claude runs them; Codex cannot)
`wave-fe-check.sh do test src/features/mutual-funds src/features/home src/components` (lane `do` is added by Claude). Codex: write the tests and the change, run nothing, report BLOCKED on running.

## Files you may touch
`frontend/src/features/mutual-funds/overview/OverviewPage.tsx`, `OverviewPage.test.tsx`; a small new hook file beside them **only** if the Overview needs its own wealth-series state (list it). **Do not touch** `components/wealth-graph/**`, `features/home/**`, `components/ui/charts/**`, `frontend/src/mobile/**`, backend, config, any existing assertion.

## Constraints
No new dependency. Invented data only. Git read-only. No deletion flags or recursive deletes. No new analytics event.

## Report format
One fenced block `CODEX REPORT: d7-overview-graph`: status; baseline HEAD; drift (and what the Overview does about hide-values); which new tests were red first; files and functions changed with a one-line reason each; commands (BLOCKED expected); `git status --short`; Deviations; Open questions.

## Paste-ready prompt
```
Front-end worker for Unifolio (Codex). Read, in order:
1. Docs/orchestration/ui-common-rules-codex.md
2. Docs/orchestration/wave-common-rules.md (wins where they differ)
3. Docs/orchestration/2026-11-20-d7-overview-graph-handoff.md (your task: D-7, owner-approved)
Open Docs/orchestration/2026-11-13-batch-d-planning-workbook.html, section 3, for the placement. Work only in D:\unifolio-d-overview on branch batch/d-overview. Git is read-only. No deletion flags or recursive deletes. Write the failing tests first, then make the change in the files the handoff names only. You cannot run the front-end checks: do not try, report BLOCKED on running. Do not touch components/wealth-graph/**, features/home/** or any existing assertion. If something cannot be done within the files named, stop and say so.
Reply with the CODEX REPORT block from the handoff, nothing else.
```

## Decision on your open question (orchestrator, 20 Nov, after your first report)
**No Home change.** The Overview has no hide-values control and Home's setting is local React state, so the Overview graph shows amounts exactly as the rest of the Overview does (pass `hideValues={false}`). Replace the test `hide-values rule matches Home` with `the graph shows amounts like the rest of the Overview (there is no hide control there)`. Everything else in the handoff stands. Your branch now also holds the handoff file and the rest of this release's documents (merged by the orchestrator).
