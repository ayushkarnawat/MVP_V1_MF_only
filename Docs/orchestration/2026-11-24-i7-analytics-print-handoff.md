# Handoff: i7-analytics-print (Batch I, task I-7 step 2: print versions of the Other Analytics group sections, Codex)
**Status:** READY TO RELAY in the order of `Docs/orchestration/2026-11-24-m4-lane-board.md` (the foundation is committed) (written 2026-11-24). Milestone M4. **Common rules for all six print group tasks: `Docs/orchestration/2026-11-24-print-groups-common.md` (read it first, fully).** Findings and decisions: `Docs/orchestration/2026-11-24-print-audit.md` (option C).
**Worker:** Codex, front end only. **Reviewer, test runner and committer:** Claude.
**Work in:** `C:\Users\Dell\lanes\unifolio-i-fe` (the existing worktree and Codex project of the print foundation, branch `batch/i-fe`). **The print group tasks run one after another in this same project, never two at once; I commit each before the next starts.** Never in the main project folder.
**Section ids in this task:** analytics-cost, analytics-category, analytics-ranking.

## The sections (audit: "Other Analytics"; sample pages 36 to 38)
The Fund Quality Scorer group is **switched off** (`SHOW_FUND_QUALITY_SCORES = false` in `other/otherLogic.ts`) and is not in the list: **do not print it**. The "i" explanations are already gone in print (the Notes page repeats them).
1. **analytics-cost (LIGHT to HEAVY).** `other/CostValuationGroup.tsx` renders three cards: the **TER ladder** (`TerLadder.tsx`: a hero gauge, a Direct/Regular spectrum, a ladder of fund rows each opening a 1Y/3Y/5Y table by click, a single `openId`), the **valuation spectrum** (`ValuationSpectrum.tsx`: Racetrack/Bar toggle, default spectrum), and **valuation by fund** (`ValuationByFund.tsx`: a `min-w-[640px]` table with `overflow-x-auto`, dot-on-bar cells whose **Nifty 500 tick value is title-only**, two collapsed "Stocks without ratios" lists, a collapsed "how the portfolio average works" paragraph). Print: ladder **every row open** (add a print flag so all rows show their 1Y/3Y/5Y table; the heading line that says "click a fund for its 1Y/3Y/5Y returns" is wrong on paper: replace it in print with "Each fund's 1Y/3Y/5Y returns are shown." and **flag these new words**); spectrum: the default view, no toggle; valuation by fund: the two lists **expanded**, the average paragraph expanded, **remove `min-width` and the scroll wrapper**, and **print the Nifty 500 value** (a visible legend line or a column; today title-only); the screen's `lg:`/`md:` grid breakpoints must resolve to the stacked branch at the 680 px viewport (check that nothing needs the wide branch).
2. **analytics-category (LIGHT).** `other/CategoryRankingGroup.tsx`: filter chips (All / Behind somewhere / Ahead everywhere), per-fund cards with dot-on-line bars. Print: **no chips** (everything shown, as the "All" state), one card per fund as on screen, the summary sentence kept; the `lg:grid-cols-2` becomes one column at 680 px (check).
3. **analytics-ranking (LIGHT).** `other/PerformanceRankingGroup.tsx`: one table with `min-w-[640px]` and an `overflow-x-auto` wrapper. Print: remove both (the table is `w-full`, fixed layout), repeated header, rows do not split, everything else as on screen.
**Dates:** print the date line the Other Analytics date strip shows (`TabDateStrip` data: `valuation.nav_as_of`, `holdings_as_of`, `pe`/`pb as_of_date`, `ter.reference_period`) after the cost section, **through `formatDataDate`/`DataDateLabel`**, not the strip component (it has popovers).

## Files you may touch
`frontend/src/print/groups/analyticsPrint.tsx`, a new folder `frontend/src/print/groups/analytics/` (components and **all your tests: `analytics.print.test.tsx` there**), edits inside `frontend/src/features/mutual-funds/other/*.tsx` (not tests) only to add `usePrintMode()` branches. **Do not touch** shared charts, other groups, the registry.

## Paste-ready prompt
```
Front-end worker for Unifolio (Codex). Read, in order:
1. Docs/orchestration/ui-common-rules-codex.md
2. Docs/orchestration/wave-common-rules.md (wins where they differ)
3. Docs/orchestration/2026-11-24-print-audit.md (the findings per section)
4. Docs/orchestration/2026-11-24-print-groups-common.md (rules common to all print group tasks: read it fully)
5. Docs/orchestration/2026-11-24-i7-analytics-print-handoff.md (your task: Other Analytics group)
Work only in C:\Users\Dell\lanes\unifolio-i-fe on branch batch/i-fe (the same project as the print foundation; I commit between tasks, so it starts clean). Git is read-only. No deletion flags or recursive deletes. Write the tests first, then the code; touch only the files the task lists; register only your group's sections in your own group file; do not change shared chart components. Screens must behave exactly as today outside print mode, and every existing test must pass untouched. You cannot run the tests; do not try, and do not change any config. Re-read your code against the tests.
Reply with the CODEX REPORT block from the common rules, nothing else.
```
