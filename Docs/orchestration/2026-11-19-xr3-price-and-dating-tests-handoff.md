# Handoff: xr3-price-and-dating-tests (Batch A, task XR-3)
**Status:** READY TO RELAY (written 2026-11-19; the first clean unattended NAV runs have happened: 17, 18 and 19 Nov 06:00 IST, all held funds priced afterwards)
**Parent plan:** `Docs/superpowers/plans/2026-11-17-batch-a-numbers-plan.md` (Task XR-3, step 1). **Spec:** `Docs/orchestration/2026-11-17-batch-a1-xirr-planning-workbook.html` (tests T8-4 to T8-7 and T8-NAV; findings F1, F2, F3, F8; proposed fixes FX-8a to FX-8d). The workbook is the design; if it and the code disagree, stop and say so.
**Worker:** Codex, backend only. **Reviewer and committer:** Claude. **Adversarial review:** yes.
**Work in:** `D:\unifolio-a-numbers` (branch `batch/a-numbers`). Never in `D:\Unifolio code`.
Read first, in order: `Docs/orchestration/ui-common-rules-codex.md`, `Docs/orchestration/wave-common-rules.md` (wins where they differ), then this file.

## Question and what "correct" means
Does every XIRR figure on one screen use a value for every held fund and one end date? Four findings were read in code and now need tests that show them. **This task documents current behaviour; a failing test is the finding for the fix proposals FX-8a to FX-8d, not a bug to fix here. It changes no number and no app code.** Expected values are worked out by hand in the test (plain arithmetic or the existing `xirr_reference` fixtures), never by calling the function under test.

## Read-in-code facts (re-check each; report drift)
- `backend/app/services/dashboard/xirr.py`: `portfolio_xirr(...)` appends the final flow as `(date.today(), current_value)` (~line 92); `calculate_dashboard_xirr(...)` (~220) builds `current_value` by **skipping a holding whose `current_value` is `None`** (~245, ~258-262) while the transactions of that fund stay in the flows (finding **F1**: the rate is understated with nothing on screen to say why).
- `backend/app/services/analytics/benchmark.py`: `_current_value_by_scheme(holdings)` (~166) does `Decimal(h.current_value)` for every holding, so a holding whose `current_value` is `None` raises (finding **F2**); `compute_portfolio_vs_benchmarks` and `compute_fund_vs_benchmark` call it.
- The headline tile is computed live (`calculate_dashboard_xirr`); the per-fund XIRR column in the holdings table is a **stored** analytics result written by the recompute job. Find where it is written and read (report the file and function names you find; they are not given here on purpose) (**F3**, **F8**: the tile and the column can be computed at different times).
- The final flow is dated with the **server's** `date.today()`, not the date of the price used (**F3**): a Friday price used on Sunday, and a server clock in UTC just after midnight India time, give a different last date from the price date.
- Existing helpers to reuse: `from services.dashboard.test_xirr import _disclaimer_scenario` (a synthetic household builder) and the `FIXTURES` in `tests/services/analytics/xirr_reference/fixtures.py`. Existing XIRR tests must pass unchanged: `test_xirr.py`, `test_xirr_fast.py`, `test_xirr_steep_declines.py`, `xirr_reference/test_xirr_reference.py`.

## Task
Create `backend/tests/services/analytics/xirr_reference/test_xirr_prices.py` (tests only), invented households only, `Decimal` only, no network. Tests (names fixed):
1. `test_fund_without_nav_is_not_silently_dropped` (T8-4): a household of two funds, one with no usable NAV; the tile must either value the fund or leave the fund's flows out as well. Expected today: the rate is understated (flows kept, value dropped). Give the figure the app returns and the figure with the fund valued (worked by hand).
2. `test_per_fund_job_with_no_nav_holding_does_not_raise` (T8-5): the per-fund path through `analytics/benchmark.py` with one no-NAV holding; expected today: it raises. Report the exception type and line.
3. `test_final_flow_is_dated_with_the_price_date_not_the_server_clock` (T8-6): hold the price date at a Friday and make the server date a Sunday, then a server clock in UTC at 00:30 the next day in India (patch `date.today` in `dashboard/xirr.py` only for this test, restore after). Assert the last cash-flow date equals the price date. Expected today: it equals the server date.
4. `test_tile_and_stored_column_agree_for_the_same_household_and_day` (T8-7): build one household, compute the tile and the stored per-fund result for the same day, and compare the household's rate where both exist. Expected today: they can differ by the price date and by prices that changed between the stored run and the live call; report what you find.
5. `test_same_household_morning_and_evening` (T8-NAV): the same household with the 06:00 prices and then with the evening price update; report the stored result against the live one after the update (finding F8).

## Tests first
Write each test, run it, and report the result **as it is**. Do not mark anything as expected-to-fail yourself: the orchestrator marks the findings after review (as was done for XR-2 and CA-3).

## Run these only
```
cd backend
"D:\Unifolio code\backend\.venv-win\Scripts\python.exe" -m pytest tests/services/analytics/xirr_reference -v
```
(From the `backend` folder of the worktree. No full suite. If the sandbox stalls at asyncio start-up as it did for CA-3, report BLOCKED with the exact error; the orchestrator runs the tests.)

## Files you may touch
Only the new test file (and, if a helper is needed, a new file next to it). **Do not touch** `app/**`, existing tests, `frontend/**`, migrations, real data.

## Constraints
`Decimal` only, never `float`. No network. Invented data only. Git is read-only for you. No deletion flags or recursive deletes.

## Report format
One fenced block `CODEX REPORT: xr3-price-and-dating-tests`: status; baseline HEAD; drift (every fact above that did not match); commands with counts; for each test pass or fail and, for a fail, the app value or error against the hand-worked value; the file and function where the stored per-fund result is written; tests not run and why; `git status --short`; Deviations; Open questions.

## Paste-ready prompt
```
Backend worker for Unifolio (Codex). Read, in order:
1. Docs/orchestration/ui-common-rules-codex.md
2. Docs/orchestration/wave-common-rules.md (wins where they differ)
3. Docs/orchestration/2026-11-19-xr3-price-and-dating-tests-handoff.md (your task: XR-3)
Work only in D:\unifolio-a-numbers on branch batch/a-numbers. Git is read-only. No deletion flags or recursive deletes. Change no app code: add the one test file only. A failing test is a finding, report it, do not fix the app and do not mark it expected-to-fail.
Run tests with: cd backend; "D:\Unifolio code\backend\.venv-win\Scripts\python.exe" -m pytest tests/services/analytics/xirr_reference -v   (if the sandbox cannot run it, reply BLOCKED with the exact error, do not change any config)
Reply with the CODEX REPORT block from the handoff, nothing else.
```
