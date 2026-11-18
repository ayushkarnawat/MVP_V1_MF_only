# Handoff: ca3-category-average-checks (Batch A, task CA-3)
**Status:** READY TO RELAY (written 2026-11-18; relay after RK-3 is reported)
**Parent plan:** `Docs/superpowers/plans/2026-11-17-batch-a-numbers-plan.md` (Task CA-3). **Spec:** `Docs/orchestration/2026-11-17-batch-a3-category-average-excel-planning-workbook.html` (tests T9-1 to T9-7). The workbook is the design; if it and the code disagree, stop and say so.
**Worker:** Codex, backend only. **Reviewer and committer:** Claude. **Adversarial review:** yes.
**Work in:** `D:\unifolio-a-numbers` (branch `batch/a-numbers`). Never in `D:\Unifolio code`.
Read first, in order: `Docs/orchestration/ui-common-rules-codex.md`, `Docs/orchestration/wave-common-rules.md` (wins where they differ), then this file.

## Question and what "correct" means
Is the category average on the fund page the size-weighted mean it claims to be? This task **documents the current behaviour** with tests on invented categories whose expected values are worked out by plain spreadsheet arithmetic (a weight is `size / sum of sizes of the funds counted`; the average is the sum of weight times return). **A failing test is a finding for the fix proposal (FX-9a), not a bug to fix here.** This task changes no number and no app code.

## Read-in-code facts (re-check each; report drift)
All in `backend/app/services/analytics/category_ranking.py` (these functions take plain dicts, so most tests need no database): `_has_usable_size(size)` (~257), `_fund_size_average(returns, aaum_by_scheme)` (~261), `category_period_weighted_averages(detailed, aaum_by_scheme)` (~277; `detailed` maps scheme id to a tuple `(r1y, r3y, r5y, legacy_blend)`; **the 3Y floor: a fund with no 3Y return is left out of every period**), `category_blended_weighted_average(detailed, aaum_by_scheme)` (~292), `CategoryAverage(value, peers, weighting, funds_without_size)`, `load_category_pool` (async, ~314), `_THIN_CATEGORY_THRESHOLD` (used by `category_rank_row`; find its value, the plan says 5). Find in `_category_returns_detailed` how the legacy blend (`values[3]`) is formed from the periods and use that formula in the legacy test.

## Task
Create `backend/tests/services/analytics/test_category_average_checks.py` (tests only).

Build three invented categories as module-level data (scheme ids are `uuid.UUID`, returns and sizes `Decimal`, all invented): **large** (12 funds, all sized, mixed returns), **thin** (4 funds, so under 5), and **missing-sizes** (8 funds, 3 of them with no size: `None`, `Decimal("0")` and a non-finite value). For each category write the **expected average for 1Y, 3Y, 5Y and the legacy blend as plain spreadsheet arithmetic in the test** (explicit `sum(weight * return)` over the counted funds with `Decimal`; no call to the app's function to produce the expected value), quantised to 4 decimal places. Put a comment above each expected block giving the sheet formula it mirrors, so the orchestrator can reproduce it in a spreadsheet. The orchestrator will independently recompute all three categories in a spreadsheet and report any difference; do not adjust an expected value to make a test pass.

**Tests (names fixed):** `test_weighted_average_matches_spreadsheet_for_three_categories` (T9-1); `test_three_year_floor_excludes_short_history_from_all_periods` (T9-2: a fund with a 1Y return and no 3Y return is in no period); `test_missing_sizes_counted_but_unweighted_and_plain_fallback_flagged` (T9-3: `funds_without_size` equals 3; the weighted figure ignores them; if **no** fund has a size the result is the plain mean with `weighting == "equal"`); `test_thin_category_flag_under_five` (T9-4: build a `CategoryPool` for the thin category and call `category_rank_row`; `thin_category` is true for 4 peers, false for 5); `test_legacy_blend_is_40_30_60_50_consistent` (T9-5: the legacy figure is the same blend the periods give, same pool and same weights); `test_rank_pool_and_average_pool_same_funds_except_index_rule` (T9-6: on a synthetic pool through `get_category_peers` and `load_category_pool`, the funds counted for the average and for the rank are the same set except the funds the index and ETF rule drops from one and not the other; **document** which, do not assert it is intended); `test_no_idcw_in_any_average_pool` (T9-7: no IDCW or dividend series in the pool, built from names; this is the same assertion as RK-4's T10-6, one result serves both). For the two tests that need `load_category_pool` (async) use `asyncio.run` with an in-memory SQLite `Scheme` table the way the existing tests in `tests/services/analytics/` do; if the sandbox cannot run them, reply BLOCKED for those two and the orchestrator runs them.

## Tests first
Write each test, run it, and report the result **as it is**: tests are expected to document current behaviour, and a failing one is a finding (name it in the report with the value the app gave and the value the spreadsheet arithmetic gave).

## Run these only
```
cd backend
"D:\Unifolio code\backend\.venv-win\Scripts\python.exe" -m pytest tests/services/analytics/test_category_average_checks.py -v
```
(From the `backend` folder of the worktree. No full suite.)

## Files you may touch
Only the new test file.
## Do not touch
`app/**`, existing tests, real data, `frontend/**`, migrations.

## Constraints
`Decimal` only, never `float`. No network. Invented data only (no real scheme names or sizes). Git is read-only for you. No deletion flags or recursive deletes.

## Report format
One fenced block `CODEX REPORT: ca3-category-average-checks`: status; baseline HEAD; drift; commands with counts; for each test pass or fail and, for a fail, app value vs arithmetic value; the three categories' expected averages in a small table (1Y, 3Y, 5Y, legacy) so the orchestrator can check them in a spreadsheet; tests not run and why; `git status --short`; Deviations; Open questions.

## Paste-ready prompt
```
Backend worker for Unifolio (Codex). Read, in order:
1. Docs/orchestration/ui-common-rules-codex.md
2. Docs/orchestration/wave-common-rules.md (wins where they differ)
3. Docs/orchestration/2026-11-18-ca3-category-average-checks-handoff.md (your task: CA-3)
Work only in D:\unifolio-a-numbers on branch batch/a-numbers. Git is read-only. No deletion flags or recursive deletes. Change no app code: add the one test file only. A failing test is a finding, report it, do not fix the app.
Run tests with: cd backend; "D:\Unifolio code\backend\.venv-win\Scripts\python.exe" -m pytest <files>   (if the sandbox cannot run it, reply BLOCKED with the exact error, do not change any config)
Reply with the CODEX REPORT block from the handoff, nothing else.
```
