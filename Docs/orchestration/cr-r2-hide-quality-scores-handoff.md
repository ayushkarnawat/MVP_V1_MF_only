# Handoff: Hide Fund Quality Scores on Other Analytics (T2.9)

**Status:** OPEN (IN REVIEW when Codex reports, DONE after the Run 2 review gate)
**Run:** 2 of 7 | **Slug:** `cr-r2-hide-quality-scores` | **Commit prefix:** `cr-r2:` | **Tasks:** T2.9
**Order:** Last frontend task of Run 2: after T2.6 and T2.8 (shares `OtherAnalyticsPage.tsx` and `otherLogic.ts`).
**Rules:** `Docs/orchestration/cr-r2-common-rules.md` (read first). **Task text (authoritative):** `Docs/superpowers/plans/2026-10-31-change-requests-implementation-plan.md`, the task sections named above (Files, Interfaces, Step 1 test names, Step 3, Verify).

## Notes
- Files: `frontend/src/features/mutual-funds/other/OtherAnalyticsPage.tsx`, `otherLogic.ts`; test `OtherAnalyticsPage.test.tsx`. Add `export const SHOW_FUND_QUALITY_SCORES = false` in `otherLogic.ts`; the group is skipped **and its data is not requested** from this page while false. Nothing is deleted; the recompute still computes `score`.
- Must stay true (tests named in the plan): the Individual Fund page still shows its score card; Home's Worth a Look still gets its tier. Run the `features/individual-fund` and `features/home` suites with it.
- After this task the orchestrator runs Task 2.10 (the Run 2 gate: full suites, old-payload and section-list tests, `vite build`, lint, the timing scripts against the G2 baseline by the manager, a hand check of three factsheet figures and one category average, the review) and tags `cr-run-2-done`. Tasks 2.11 (BSE price file) and 2.12 (book value from filings) get their own handoffs only when the owner says go (2.12 starts with the XBRL probe and asks before downloading).
