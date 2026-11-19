# Handoff: xfix1-final-flow-date (Batch A, XIRR fix: FX-8c)
**Status:** READY TO RELAY (written 2026-11-19). **Approved by the owner on 19 Nov 2026** (on the condition that the effect is small; the formula and the fixture show about 0.1 of a point per day on a one-year-old household and far less on a long-held one). May run **at the same time as** `2026-11-19-rk7b-average-pool-and-legacy-blend-handoff.md` (different worktrees, different files).
**Parent plan:** `Docs/superpowers/plans/2026-11-17-batch-a-numbers-plan.md` (fix task template). **Evidence:** `Docs/orchestration/2026-11-18-xr2-caller-audit-table.txt` (the same household gives 44.69%, 44.57% and 45.06% because the callers end it on 6 Jan, 7 Jan and 3 Jan 2025) and the XR-3 tests (`tests/services/analytics/xirr_reference/test_xirr_prices.py`). **Spec:** `Docs/orchestration/2026-11-17-batch-a1-xirr-planning-workbook.html` (finding F3, fix FX-8c: "date the final flow with the price date it uses, which is the standard practice"). The workbook is the design; if it and the code disagree, stop and say so.
**Worker:** Codex, backend only. **Reviewer and committer:** Claude.
**Work in:** `D:\unifolio-a-xirr` (a new worktree, branch `batch/a-xirr-fixes`, cut from `batch/a-numbers` at the XR-3 commit). Never in `D:\Unifolio code`.
Read first, in order: `Docs/orchestration/ui-common-rules-codex.md`, `Docs/orchestration/wave-common-rules.md` (wins where they differ), then this file.

## What is wrong (read in code; re-check each line and report drift)
The terminal cash flow of an XIRR (today's value of what is held) is dated by the **server's** `date.today()` in some callers and by the **price date** in others. From the caller audit on one invented household: `dashboard.xirr.portfolio_xirr` (ends 2025-01-06) and `analytics.benchmark.*` that use it; `analytics.benchmark_windows.*` (ends 2025-01-07); `fund_page.returns.*` (ends 2025-01-03, the price date). A price dated Friday used on Sunday, or a server clock in UTC just after midnight India time, gives a different last date from the price date. Files to read: `backend/app/services/dashboard/xirr.py` (`portfolio_xirr` appends `(date.today(), current_value)` ~line 92), `backend/app/services/analytics/benchmark.py`, `backend/app/services/analytics/benchmark_windows.py`, `backend/app/services/fund_page/returns.py` and `summary.py`, and `backend/scripts/xirr_caller_audit.py` (the audit script).

## The change (only this)
- **The terminal flow is dated with the price date of the values it sums**, the same for every caller. Rule: the **newest price date among the holdings valued in that calculation** (all held funds normally share one price date; when they differ, the newest). If a calculation has no price date at all, fall back to today as now. Pass the date in (a new optional parameter, default keeps today's behaviour for any caller you do not change) rather than reading the clock inside the solver wrapper.
- The windowed callers (`benchmark_windows`) anchor their windows on the end date; moving the end to the price date moves each window's start with it. That is intended; say in the report what changes for each window.
- Not in this task: FX-8a (a fund with no price), FX-8b (the per-fund job guard), FX-8d (the stored column), FX-8e (short periods). Do not change the solver `xirr()` in `analytics/xirr.py`; its tests must pass unchanged.
- Every change additive. No field removed or renamed. Stored results are rebuilt once at M2 (not your task).

## Tests first
The two `test_final_flow_is_dated_with_the_price_date_not_the_server_clock[...]` tests (XR-3, T8-6) are marked **strict expected failures**; after your change they must report **XPASS(strict)**: that is the success signal. Do not edit their markers; the orchestrator removes them. Add, before the change, red tests for the callers the audit lists: `test_every_caller_ends_the_same_household_on_the_price_date` (build one invented household with a Friday price, run the callers named above, assert the same last date for each). Report which were red first.

## Run these only
```
cd backend
"D:\Unifolio code\backend\.venv-win\Scripts\python.exe" -m pytest tests/services/analytics/xirr_reference tests/services/dashboard/test_xirr.py tests/services/analytics/test_xirr.py tests/services/analytics/test_xirr_fast.py tests/services/analytics/test_xirr_steep_declines.py -v
```
(From `D:\unifolio-a-xirr\backend`. Adjust the three `test_xirr*` paths if they live elsewhere and say where; the existing XIRR tests must pass **unchanged**.) Also run the existing tests of every module you touch (`tests/services/analytics/test_benchmark*.py`, `tests/services/fund_page/test_returns*.py`, and any test that mentions the changed functions) and report the counts. If an existing test fails because it asserts the old end date, **do not edit it**: stop and report the test and why. If the sandbox stalls at asyncio start-up (as in CA-3, RK-7a and XR-3), report BLOCKED with the exact error; still write the change and the tests, and the orchestrator runs them.

## Files you may touch
`backend/app/services/dashboard/xirr.py`, `backend/app/services/analytics/benchmark.py`, `backend/app/services/analytics/benchmark_windows.py`, `backend/app/services/fund_page/returns.py` and `summary.py` (only where the terminal flow date is set), `backend/scripts/xirr_caller_audit.py` (only to print the new column if needed), and the new test file `backend/tests/services/analytics/xirr_reference/test_xirr_caller_dates.py`. **Do not touch** `analytics/xirr.py`, existing tests, `frontend/**`, migrations, real data.

## Constraints
`Decimal` only. No network. Invented data only. No new dependency. Git read-only. No deletion flags or recursive deletes.

## Report format
One fenced block `CODEX REPORT: xfix1-final-flow-date`: status; baseline HEAD; drift; which new tests were red first; the caller-audit table **before and after** for the same household (last date and rate per caller); every file and function changed with a one-line reason; what changes for each benchmark window; commands with counts; any existing test that fails; `git status --short`; Deviations; Open questions.

## Paste-ready prompt
```
Backend worker for Unifolio (Codex). Read, in order:
1. Docs/orchestration/ui-common-rules-codex.md
2. Docs/orchestration/wave-common-rules.md (wins where they differ)
3. Docs/orchestration/2026-11-19-xfix1-final-flow-date-handoff.md (your task: XFIX-1, FX-8c, owner-approved)
Work only in D:\unifolio-a-xirr on branch batch/a-xirr-fixes. Git is read-only. No deletion flags or recursive deletes. Write the failing tests first, run them, then make the change in the files the handoff names only. Do not change analytics/xirr.py. If an existing test fails because it asserts the old behaviour, do not edit it: report it.
Run tests with: cd backend; "D:\Unifolio code\backend\.venv-win\Scripts\python.exe" -m pytest <files>   (if the sandbox cannot run it, reply BLOCKED with the exact error, do not change any config)
Reply with the CODEX REPORT block from the handoff, nothing else.
```
