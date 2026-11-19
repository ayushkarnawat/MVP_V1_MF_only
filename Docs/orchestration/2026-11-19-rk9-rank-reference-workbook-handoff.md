# Handoff: rk9-rank-reference-workbook (Batch A, task RK-9: the rank reference workbook export script, first cut, synthetic data)
**Status:** READY TO RELAY (written 2026-11-19). Runs **at the same time as** `2026-11-19-xfix2-xirr-metadata-and-nav-recompute-handoff.md` (different worktree, different files). It changes no number and no app code: it only reads.
**Parent plan:** `Docs/superpowers/plans/2026-11-17-batch-a-numbers-plan.md` (Task RK-9). **Spec:** `Docs/orchestration/2026-11-17-batch-a2-rank-denominators-planning-workbook.html` (section 5: the sheets and what each holds). The workbook is the design; if it and the code disagree, stop and say so.
**Worker:** Codex, backend only. **Reviewer and committer:** Claude.
**Work in:** `D:\unifolio-a-fixes` (branch `batch/a-fixes`, which holds the approved pool fixes FX-10a, FX-10b, FX-10d and FX-9a). Never in `D:\Unifolio code`.
Read first, in order: `Docs/orchestration/ui-common-rules-codex.md`, `Docs/orchestration/wave-common-rules.md` (wins where they differ), then this file.

## What this is
An Excel workbook that lets a stakeholder see **how each rank's "out of N" is reached**: every category and plan, every step of the count, every fund in each pool, every fund left out and why. A reader can recount one N with a filter or a `COUNTIFS`. The workbook is a **download, not committed**; the script that builds it and its tests are committed. This task builds the script on **invented data only**; real data comes later, after the fixes, run by the orchestrator.

## Scope of this first cut (some sheets wait on work that is not done)
Build these sheets: **Read me** (a fixed text block the orchestrator will fill; put a clearly marked placeholder plus the export date, app version and the Growth-only line), **Summary**, **Funnel**, **Pool**, **Excluded**, **End dates** (every pool fund's return end date and, when they differ, the funds on a different date; **no common-end-date logic**: that fix is parked), **Checks** (our recount against the app per category and period, pass or fail), **Sources** (the six references S1 to S6 as a fixed table with their names; the orchestrator fills the dates). **Cross-checks** is created **empty with its header row only** (it waits for the cross-check task RK-5). The sheet list and column meanings are in the workbook's section 5.

## Interfaces and where the data comes from (re-check; report drift)
- App side (read-only): `performance_ranking.load_ranking_pools(db, scheme, today)` (the ranked pools per period, plus `.peers` and `.names`), `category_ranking.load_category_pool`, `category_rank_row`, `scheme_universe.canonical_category`, `is_index_fund`.
- Independent side: `backend/scripts/recount_category_pool.py` (`parse_navall`, `recount_all_periods`, the step names and the `LedgerEntry` reasons: `not_live`, `idcw`, `other_plan_type`, `second_option_of_fund`, `index_or_etf`, `no_history_for_period`, `closed_or_merged`). The script takes the **AMFI NAVAll text as an input file path** (`--navall`) and never downloads it. Import the recount script by path (it is in `scripts/`, not a package).
- Excel library: `openpyxl==3.1.5` (already in `requirements.txt`; no new dependency).
- New: `backend/scripts/workbook_common.py` with `formula_cell(ws, ref, formula)`, `add_checks_sheet(wb, rows)`, `freeze_and_filter(ws)` (shared later with the category-average Excel); `backend/scripts/export_rank_reference_workbook.py` with `write_workbook(db, out_path, *, navall_text, today, app_version) -> None` and a `main()` with `--out`, `--navall`, `--today`.

## Rules for the file
- **Every Summary total is a formula** (`COUNTIFS` over the Pool sheet for that category, plan and period flag); the app's value sits beside it as a plain number and the difference is a formula. Formula cells pale green, value cells white. `freeze_and_filter` on every data sheet. Dates are real dates with a date format.
- **Public fund data only:** no household, folio, account or member data and **no internal ids** (no UUIDs) in any cell; scheme code, name, fund house, category, plan, option only.
- **Read-only:** no insert, update, delete, commit or network call (test it).
- Every figure carries its date; the Read me says plainly where a figure cannot be as of a single date.

## Tests first (invented categories and funds; a pool with deliberate gaps: a peer without history, a duplicate series, an IDCW series, an index fund, a closed fund)
In `backend/tests/scripts/test_export_rank_reference_workbook.py`, written and run **before** the script:
1. `test_every_summary_total_is_a_countifs_over_pool_and_equals_the_product_total` (read the formula text with openpyxl and check its shape; compute the count it would give in Python from the Pool rows and compare it with `category_rank_row` / the ranked pool totals for 1Y, 3Y and 5Y).
2. `test_every_excluded_scheme_has_a_reason_from_the_allowed_list`.
3. `test_every_pool_row_is_counted_in_summary` and `test_pool_and_excluded_together_equal_the_category` (no scheme lost or counted twice).
4. `test_funnel_counts_match_the_recount_ledger_step_by_step`.
5. `test_read_me_states_growth_only_and_dates`.
6. `test_no_household_or_internal_ids_in_any_cell` (no UUID pattern, no member or folio field).
7. `test_runs_read_only` (no insert, update, delete or commit; no network).
8. `test_cross_checks_sheet_exists_with_header_only`.
9. `test_workbook_opens_and_every_formula_has_a_cached_value_or_is_recalculable` (skip with a clear reason if no spreadsheet engine is available to you; the orchestrator recalculates with LibreOffice).

## Run these only
```
cd backend
"D:\Unifolio code\backend\.venv-win\Scripts\python.exe" -m pytest tests/scripts/test_export_rank_reference_workbook.py -v
```
(From `D:\unifolio-a-fixes\backend`. Also run the existing `tests/scripts/test_export_ca_fund_metrics.py` and `tests/services/analytics/test_recount_pool.py` to show they still pass.) If the sandbox stalls at asyncio start-up (as in every previous task), report BLOCKED with the exact error; still write the script and the tests; the orchestrator runs them.

## Files you may touch
Only the three new files named above (and `__init__` or `conftest` helpers if the existing `tests/scripts` folder needs one; say so). **Do not touch** `app/**`, `recount_category_pool.py`, existing tests, `frontend/**`, migrations, real data. Do not generate a workbook file into the repository (tests write to a temporary directory).

## Constraints
`Decimal` only for money-like numbers (returns are decimals written as numbers with a percent format). No network. Invented data only. No new dependency. Git read-only. No deletion flags or recursive deletes.

## Report format
One fenced block `CODEX REPORT: rk9-rank-reference-workbook`: status; baseline HEAD; drift; which tests were red first; the sheets built with their column lists; how Summary, Funnel and Checks derive each number; commands with counts; measured size and run time on the invented data (and your estimate for about 80 categories in two plans; the fallback is narrowing to the held categories, tell the orchestrator); `git status --short`; Deviations; Open questions.

## Paste-ready prompt
```
Backend worker for Unifolio (Codex). Read, in order:
1. Docs/orchestration/ui-common-rules-codex.md
2. Docs/orchestration/wave-common-rules.md (wins where they differ)
3. Docs/orchestration/2026-11-19-rk9-rank-reference-workbook-handoff.md (your task: RK-9, first cut on invented data)
Work only in D:\unifolio-a-fixes on branch batch/a-fixes. Git is read-only. No deletion flags or recursive deletes. Write the failing tests first, run them, then add only the three new files the handoff names. Read-only: no database writes, no network. Do not generate a workbook into the repository.
Run tests with: cd backend; "D:\Unifolio code\backend\.venv-win\Scripts\python.exe" -m pytest <files>   (if the sandbox cannot run it, reply BLOCKED with the exact error, do not change any config)
Reply with the CODEX REPORT block from the handoff, nothing else.
```
