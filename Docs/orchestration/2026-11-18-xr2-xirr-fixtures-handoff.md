# Handoff: xr2-xirr-fixtures (Batch A, task XR-2)
**Status:** READY TO RELAY (written 2026-11-18; relay after B-9 is reported, one Codex task at a time)
**Parent plan:** `Docs/superpowers/plans/2026-11-17-batch-a-numbers-plan.md` (Task XR-2). **Spec:** `Docs/orchestration/2026-11-17-batch-a1-xirr-planning-workbook.html` (tests T8-1, T8-2, T8-3, T8-8, T8-9). The workbook is the design; if it and the code disagree, stop and say so.
**Worker:** Codex, backend only. **Reviewer and committer:** Claude. **Adversarial review:** yes (a solver proof that agrees with itself is the risk).
**Work in:** `D:\unifolio-a-numbers` (branch `batch/a-numbers`). Never in `D:\Unifolio code`.
Read first, in order: `Docs/orchestration/ui-common-rules-codex.md`, `Docs/orchestration/wave-common-rules.md` (wins where they differ), then this file.

## Question and what "correct" means
Is the app's XIRR solver right? Right means: for 25 invented cash-flow sets it agrees to **1e-6** with a separate high-precision solver written without reusing the app's code, and with Excel's `XIRR` on the same flows (the orchestrator fills the Excel values, see below), under the convention **actual days over 365** including leap years. This task **changes no number**: it adds fixtures, a calculator and tests only. A failing test is a finding to report, never a bug to fix here.

## Read-in-code facts (re-check each; report drift)
- `backend/app/services/analytics/xirr.py:20` `xirr(cash_flows: list[tuple[date, Decimal]], guess: Decimal = Decimal("0.1")) -> Decimal | None`.
- Callers of `xirr(`: `analytics/benchmark.py:149`, `analytics/benchmark_windows.py:334` and `:437`, `dashboard/xirr.py:93` (`portfolio_xirr`, `calculate_dashboard_xirr:220`, `xirr_string:96`), `fund_page/returns.py:275` and `:344`. Search again for any other caller and list it.
- Existing tests that must pass **unchanged**: `tests/services/analytics/test_xirr.py`, `test_xirr_fast.py`, `test_xirr_steep_declines.py`.

## Task
1. `backend/tests/services/analytics/xirr_reference/__init__.py` (empty), `fixtures.py`, `independent_xirr.py`, `test_xirr_reference.py`.
2. `backend/scripts/xirr_caller_audit.py`.

**fixtures.py** exports `XirrFixture(name: str, flows: list[tuple[date, Decimal]], expected: Decimal | None, excel_value: Decimal | None)` (a frozen dataclass) and `FIXTURES: list[XirrFixture]` with **exactly 25** sets, every `name` unique. Outflows (money in) negative, inflows positive, the last flow the terminal value. All amounts and dates invented. Required sets (add the rest to reach 25, each named for what it tests): single lump sum 1 year +25% (365 days: expected exactly `0.25`); single lump sum across 29 Feb 2024 (366 days: expected `1.25 ** (365/366) - 1` computed with `decimal`); lump sum 2 years; lump sum 3 years negative; monthly SIP 12 and 36 months; SIP with a partial redemption; SIP then full redemption; under a year (3 months up, 3 months down, 1 month); steep fall (-60% in 1 year, -90% in 2 years); same-day buy and sell; same-day flows netting to zero; flows with no money out (`None`); flows with no money in (`None`); a single flow (`None`); very large gain (10x in 5 years); an opening balance dated before the first transaction; quarterly top-ups; a purchase and its reversal on the same day; a fund fully sold then bought again. `expected`: set it where a closed form exists (state which), else leave it equal to the independent solver's answer computed **in the test**, not typed in. `excel_value` is `None` for every fixture: **the orchestrator fills these with Excel-compatible values**; the Excel test (below) is skipped while any is `None` and says so.

**independent_xirr.py**: `independent_xirr(flows) -> Decimal | None` with `decimal.getcontext().prec = 50` set locally (use `localcontext`), **bisection** (or Brent) over a bracket found by expansion, converging to 1e-30; a different method from the app's Newton. Never imports `app.services.analytics.xirr`. Returns `None` for the same no-solution cases (no money in, no money out, fewer than two flows, same-day-only flows).

**test_xirr_reference.py** (the names are fixed): `test_app_solver_matches_independent_for_all_25` (agree to 1e-6; where the app returns `None` the independent returns `None`); `test_there_are_exactly_25_unique_fixtures`; `test_closed_form_fixtures_match_their_formula`; `test_excel_convention_including_leap_year` (compares with `excel_value` where set, `pytest.skip` with the reason "excel_value not filled" while any is `None`; always asserts the leap-year pair `365` vs `366` days gives the closed-form answers); `test_no_money_in_or_out_returns_none`; `test_same_day_flows`; `test_steep_fall`; `test_under_a_year_is_not_silently_extreme_flagged` (T8-9: **document** the value the app returns for the 1, 3 and 3-down-month sets in the assertion message and assert only that it equals the independent value; the decision FX-8e belongs to the owner); `test_opening_balance_disclaimer_only_when_removing_piece_explains` (T8-8: use `calculate_dashboard_xirr` on a synthetic household built in the style of the existing tests in `tests/services/dashboard/` that exercise the opening-balance disclaimer; one household where removing the opening piece explains the number, one where it does not; assert the disclaimer appears only in the first).

**xirr_caller_audit.py**: `python scripts/xirr_caller_audit.py` builds **one invented household** in an in-memory SQLite database (use the same fixture helpers as the existing XIRR tests) and prints, for each caller above, the caller name, the number of flows, the first and last dates, the sum of outflows, the sum of inflows, the signed amounts list and the resulting rate, as one aligned table; prints counts and dates and amounts only (no names). Exit 0. Add a short test `test_caller_audit_runs_and_lists_every_caller` that runs it and asserts every caller name appears. Write the table to the file given by an optional `--out` argument.

## Tests first
Write the tests, run them and see them fail because the modules do not exist, then implement.

## Run these only
```
cd backend
"D:\Unifolio code\backend\.venv-win\Scripts\python.exe" -m pytest tests/services/analytics/xirr_reference -v
"D:\Unifolio code\backend\.venv-win\Scripts\python.exe" -m pytest tests/services/analytics/test_xirr.py tests/services/analytics/test_xirr_fast.py tests/services/analytics/test_xirr_steep_declines.py -q
```
(Run from the `backend` folder of the worktree so the worktree's code is imported. If the sandbox cannot run a test, reply BLOCKED for that file with the exact error; do not change config. No full suite.)

## Files you may touch
Only the new files listed above. Do not edit any existing file.
## Do not touch
`app/**` (the solver's results are the thing under test), real data, any existing test, `frontend/**`, migrations.

## Constraints
`Decimal` only, never `float`, in fixtures, the independent solver and the assertions. No real data. No network. Git is read-only for you. No deletion flags or recursive deletes. Prints counts, dates and amounts only.

## Report format
One fenced block `CODEX REPORT: xr2-xirr-fixtures`: status; baseline HEAD; drift found; the commands with counts; which tests were RED first and why; the 25 fixture names; the audit table printed by the script; tests not run and why; `git status --short`; Deviations; Open questions.

## Paste-ready prompt
```
Backend worker for Unifolio (Codex). Read, in order:
1. Docs/orchestration/ui-common-rules-codex.md
2. Docs/orchestration/wave-common-rules.md (wins where they differ)
3. Docs/orchestration/2026-11-18-xr2-xirr-fixtures-handoff.md (your task: XR-2)
Work only in D:\unifolio-a-numbers on branch batch/a-numbers. Tests first. Git is read-only. No deletion flags or recursive deletes. Change no number: add files only.
Run tests with: cd backend; "D:\Unifolio code\backend\.venv-win\Scripts\python.exe" -m pytest <files>   (if the sandbox cannot run it, reply BLOCKED with the exact error, do not change any config)
Reply with the CODEX REPORT block from the handoff, nothing else.
```
