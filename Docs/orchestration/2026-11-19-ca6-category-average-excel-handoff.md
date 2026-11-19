# Handoff: ca6-category-average-excel (Batch A, task CA-6: the category-average Excel, first cut, synthetic data)
**Status:** READY TO RELAY AGAIN (first report was BLOCKED at the drift check; see the Addendum, which answers both of its questions). It changes no number and no app code: it only reads. Runs **at the same time as** `2026-11-19-fe1a-xirr-labels-red-tests-handoff.md` (a different worktree and different files).
**Parent plan:** `Docs/superpowers/plans/2026-11-17-batch-a-numbers-plan.md` (Task CA-6). **Spec:** `Docs/orchestration/2026-11-17-batch-a3-category-average-excel-planning-workbook.html` (section 3: "The Excel for stakeholders" and "The workbook, sheet by sheet"). The workbook is the design; if it and the code disagree, stop and say so.
**Worker:** Codex, backend only. **Reviewer and committer:** Claude.
**Work in:** `D:\unifolio-a-fixes` (branch `batch/a-fixes`). It already holds the approved pool and average fixes (FX-10a, FX-10b, FX-10d, FX-9a) **and RK-9's `scripts/workbook_common.py` and `scripts/export_rank_reference_workbook.py`, which you reuse**. Never in `D:\Unifolio code`.
Read first, in order: `Docs/orchestration/ui-common-rules-codex.md`, `Docs/orchestration/wave-common-rules.md` (wins where they differ), then this file.

## What this is
One Excel workbook that explains the **category average** for stakeholders "in as much detail as possible, for every category", and lets a reader **check the arithmetic**: the averages are written as **live Excel formulas** over the listed funds, next to the value the app shows. The on-screen "i" was dropped (17 Nov); this workbook is the only explanation. It is built from the product's own functions so it cannot drift from the screen. A download, not committed; the script and its tests are. This task: the script on **invented data only**.

## The eleven sheets (columns and meanings are in the workbook section 3; build all eleven)
**Contents** (sheet, purpose, row count, links), **Read me** (plain-words method; how to read the card; the dates; what is left out including "IDCW options are not included"; how to verify; export date and app version; **a marked placeholder block the orchestrator fills**), **Summary** (one row per category and plan: funds in the pool, funds covered in 1Y, 3Y and 5Y, the size-weighted average per period as a **formula**, the plain average for comparison, funds without a size, the weighting used, the thin flag, the app's value and the difference), **Pool** (one row per fund in each pool: category, plan, fund, fund house, size in crore and its month, the 1Y, 3Y and 5Y returns, whether it counts (3-year floor), its weight (**formula**) and its contribution (**formula**)), **Weights audit** (per category and period: the weights add to 100%), **Sizes** (every size with its month and age; funds with no size), **Legacy figure** (the older blended figure: **40% of the displayed 3Y average plus 60% of the displayed 5Y average**, as a formula, next to the app's), **Excluded** (every scheme left out, with the reason: not live, another plan type, a second option of the same fund, inactive, no 3-year history, no size, index or ETF), **Worked examples** (three funds step by step in the card's own shape: the gap, the fund's return against the category average, how a reader reproduces each number; pick three invented funds in the synthetic data), **Checks** (per category: the recomputed average against the app's, the largest difference, whether the weights add to 100%, the dates; pass or fail), **Glossary** (a fixed plain-words block: AAUM, CAGR, category, plan, Growth and IDCW, thin category, eligibility floor; the orchestrator refines the wording).

## Rules that decide the numbers (re-check each in code; report drift)
- Pool and weights come from `category_ranking.load_category_pool(db, scheme, today)` and `category_rank_row`, **as they are on this branch** (after FX-10b: the average counts the ranked pool's funds: Growth, active, same plan, no index or ETF; **3-year floor**: a fund with no 3Y return is in no period; weight = latest AAUM; a fund with no size is counted but left out of the weighted figure; if no fund has a size a plain mean is used and flagged; fewer than 5 funds = thin). The Excel's formulas must reproduce exactly these figures.
- Formula shapes (workbook section 3, plan CA-6): weight `=IF(H2="Y", F2/SUMIFS(F:F, A:A, A2, H:H, "Y"), 0)` (adapt the columns), average `SUMPRODUCT` over the counted funds, difference `=ROUND(D2 - I2, 4)`. Formula cells pale green, value cells white (use `workbook_common.formula_cell`). `freeze_and_filter` on every data sheet. Dates are real dates.
- **Read-only and offline:** reuse RK-9's approach (it builds the app side without writing to the database or calling the network: stored prices, transient objects for uncatalogued schemes). **No insert, update, delete or commit; no network** (test it).
- **Public fund data only:** no household, folio, account or member data and **no internal ids** (no UUIDs) in any cell.
- Every figure carries its date; the Read me says plainly where a figure cannot be as of one date (sizes are quarterly; each fund's return ends on its own latest price).

## Tests first (invented categories and funds; the three categories of CA-3: one large, one thin, one with funds missing a size; plus an IDCW series, an index fund and a fund with no 3-year history in the pool)
In `backend/tests/scripts/test_export_category_average_excel.py`, written and run **before** the script:
1. `test_every_summary_average_is_a_formula_and_equals_the_app_value_to_four_places` (read the formula text with openpyxl; recompute the figure in Python from the Pool rows; compare with `category_rank_row`).
2. `test_weights_add_to_100_percent_for_every_category_and_period` and `test_weight_and_contribution_are_formulas`.
3. `test_three_year_floor_excludes_short_history_from_every_period` (the Excluded sheet lists it with its reason).
4. `test_missing_sizes_are_counted_unweighted_and_flagged`; `test_plain_fallback_when_no_fund_has_a_size_is_labelled`; `test_thin_category_flag_under_five`.
5. `test_legacy_figure_is_40_percent_of_3y_plus_60_percent_of_5y` (a formula, equal to the app's `category_avg_return`).
6. `test_no_idcw_and_no_index_series_in_any_pool_and_both_are_on_the_excluded_sheet`.
7. `test_worked_examples_reproduce_the_summary_figures`.
8. `test_no_household_or_internal_ids_in_any_cell`; `test_runs_read_only_and_offline`; `test_all_eleven_sheets_exist_in_order`.
9. `test_workbook_recalculates_without_errors_and_summary_equals_app` (recalculate with LibreOffice headless exactly as RK-9's last test does: `C:\Program Files\LibreOffice\program\soffice.exe` is installed on the orchestrator's machine but may not be on your PATH; skip with a clear reason if it is unavailable to you; the orchestrator runs it).

## Addendum 19 Nov (orchestrator's answers to the first report: both drifts were real, both are now decided)
**1. Legacy figure.** My text above omitted a fallback that the approved fix already has. **Use the app's rule exactly:** legacy = `0.4 x the 3Y average + 0.6 x the 5Y average`, and **when the category has no 5Y average (blank) the legacy figure is the 3Y average**; when the 3Y average is blank it is blank. The Legacy figure sheet writes this as one formula (an `IF` on the blank 5Y), says so in a note on the sheet and in the Read me, and the existing test `test_category_ranking.py:904` (25% when 3Y is 25% and 5Y is blank) is the oracle. The workbook (section 3) is silent on a missing 5Y figure, so this is a clarification, not a conflict.
**2. Index scope.** The app's average for a reference fund that is itself an index fund or ETF is over the category's **index** funds (the owner's approved exception: the Index Funds category keeps its average over its own funds); for any other reference fund it is over the ranked pool (no index or ETF). **The workbook shows both, explicitly:** Summary has one row per **category, plan and pool kind**, where the pool kind is `active` (Growth, active, same plan, no index or ETF) or `index` (index and ETF series of that category and plan). An `index` row exists only for a category that has at least one index or ETF series. Pool and Excluded carry the pool kind: in an `active` pool the index and ETF series are on Excluded with the reason `index or ETF (average is over index funds in a separate row)`; in an `index` pool the non-index series are on Excluded with the reason `not an index or ETF`. Checks compares each row with `load_category_pool` called for a representative reference fund of that kind (invented data: include a category with one active held fund and one index held fund, so both rows are tested; add `test_index_pool_rows_equal_the_app_for_an_index_reference_fund`).

## Run these only
```
cd backend
"D:\Unifolio code\backend\.venv-win\Scripts\python.exe" -m pytest tests/scripts/test_export_category_average_excel.py tests/scripts/test_export_rank_reference_workbook.py tests/scripts/test_export_ca_fund_metrics.py -v
```
(From `D:\unifolio-a-fixes\backend`. No full suite.) If the sandbox stalls at asyncio start-up (as in every previous task), report BLOCKED with the exact error; still write the script and the tests; the orchestrator runs them.

## Files you may touch
New: `backend/scripts/export_category_average_excel.py`, `backend/tests/scripts/test_export_category_average_excel.py`. You may **add** small helpers to `backend/scripts/workbook_common.py` (do not change existing ones; RK-9's tests must keep passing) and import from `export_rank_reference_workbook.py` (do not edit it). **Do not touch** `app/**`, existing tests, `frontend/**`, migrations, real data. Do not write a workbook into the repository (tests use a temporary file).

## Constraints
`Decimal` for sizes and returns; no `float` in any value written. No network. Invented data only. No new dependency (`openpyxl==3.1.5` is already there). Git read-only. No deletion flags or recursive deletes.

## Report format
One fenced block `CODEX REPORT: ca6-category-average-excel`: status; baseline HEAD; drift; which tests were red first; the eleven sheets with their column lists; how Summary, Weights audit, Legacy figure and Checks derive each number; commands with counts; measured size and run time on the invented data and your estimate for about 80 categories in two plans; `git status --short`; Deviations; Open questions.

## Paste-ready prompt
```
Backend worker for Unifolio (Codex). Read, in order:
1. Docs/orchestration/ui-common-rules-codex.md
2. Docs/orchestration/wave-common-rules.md (wins where they differ)
3. Docs/orchestration/2026-11-19-ca6-category-average-excel-handoff.md (your task: CA-6, first cut on invented data)
Work only in D:\unifolio-a-fixes on branch batch/a-fixes. Git is read-only. No deletion flags or recursive deletes. Write the failing tests first, run them, then add only the new files the handoff names (small additions to workbook_common.py allowed). Read-only: no database writes, no network. Do not generate a workbook into the repository.
Run tests with: cd backend; "D:\Unifolio code\backend\.venv-win\Scripts\python.exe" -m pytest <files>   (if the sandbox cannot run it, reply BLOCKED with the exact error, do not change any config)
Reply with the CODEX REPORT block from the handoff, nothing else.
```
