# Handoff: xfix1-final-flow-date (Batch A, XIRR fixes: FX-8c, FX-8a small version, FX-8b)
**Status:** READY TO RELAY (written 2026-11-19). **Approved by the owner on 19 Nov 2026**: FX-8c (on the condition that the effect is small; the formula and the fixture show about 0.1 of a point per day on a one-year-old household and far less on a long-held one), and FX-8a and FX-8b **in their small version only** (the owner's rule: do it if the radius is small, otherwise not at all; see "Added scope"). May run **at the same time as** `2026-11-19-rk7b-average-pool-and-legacy-blend-handoff.md` (different worktrees, different files).
**Parent plan:** `Docs/superpowers/plans/2026-11-17-batch-a-numbers-plan.md` (fix task template). **Evidence:** `Docs/orchestration/2026-11-18-xr2-caller-audit-table.txt` (the same household gives 44.69%, 44.57% and 45.06% because the callers end it on 6 Jan, 7 Jan and 3 Jan 2025) and the XR-3 tests (`tests/services/analytics/xirr_reference/test_xirr_prices.py`). **Spec:** `Docs/orchestration/2026-11-17-batch-a1-xirr-planning-workbook.html` (finding F3, fix FX-8c: "date the final flow with the price date it uses, which is the standard practice"). The workbook is the design; if it and the code disagree, stop and say so.
**Worker:** Codex, backend only. **Reviewer and committer:** Claude.
**Work in:** `D:\unifolio-a-xirr` (a new worktree, branch `batch/a-xirr-fixes`, cut from `batch/a-numbers` at the XR-3 commit). Never in `D:\Unifolio code`.
Read first, in order: `Docs/orchestration/ui-common-rules-codex.md`, `Docs/orchestration/wave-common-rules.md` (wins where they differ), then this file.

## What is wrong (read in code; re-check each line and report drift)
The terminal cash flow of an XIRR (today's value of what is held) is dated by the **server's** `date.today()` in some callers and by the **price date** in others. From the caller audit on one invented household: `dashboard.xirr.portfolio_xirr` (ends 2025-01-06) and `analytics.benchmark.*` that use it; `analytics.benchmark_windows.*` (ends 2025-01-07); `fund_page.returns.*` (ends 2025-01-03, the price date). A price dated Friday used on Sunday, or a server clock in UTC just after midnight India time, gives a different last date from the price date. Files to read: `backend/app/services/dashboard/xirr.py` (`portfolio_xirr` appends `(date.today(), current_value)` ~line 92), `backend/app/services/analytics/benchmark.py`, `backend/app/services/analytics/benchmark_windows.py`, `backend/app/services/fund_page/returns.py` and `summary.py`, and `backend/scripts/xirr_caller_audit.py` (the audit script).

## The change (only this)
- **The terminal flow is dated with the price date of the values it sums**, the same for every caller. Rule: the **newest price date among the holdings valued in that calculation** (all held funds normally share one price date; when they differ, the newest). If a calculation has no price date at all, fall back to today as now. Pass the date in (a new optional parameter, default keeps today's behaviour for any caller you do not change) rather than reading the clock inside the solver wrapper.
- The windowed callers (`benchmark_windows`) anchor their windows on the end date; moving the end to the price date moves each window's start with it. That is intended; say in the report what changes for each window.
- Not in this task: the FX-8a price fallback chain, FX-8d (the stored column) and FX-8e (short periods). Do not change the solver `xirr()` in `analytics/xirr.py`; its tests must pass unchanged.
- Every change additive. No field removed or renamed. Stored results are rebuilt once at M2 (not your task).

## Added scope (19 Nov, owner: "if it is too big a change, don't; if not, go ahead"): FX-8a small version and FX-8b
**Why only a small version.** The workbook's FX-8a is a price fallback chain (stored price, live retry, latest stored price of any age, statement price) across `dashboard/holdings.py` and `dashboard/nav.py`: a large radius for a rare case, so it is **not built** (parked: it comes back only if a held fund with no price ever shows up). What is built is the last step of that chain and the guard, both **no-ops when every held fund has a price** (all 46 on staging today).
**Facts (re-check; report drift).** A held fund with `current_value is None` (`units_held != 0`) is today (1) left out of the value in `dashboard/xirr.py` `calculate_dashboard_xirr` (~245, ~258-262, ~273) while its transactions stay in the flows: the tile reads -45% where the household is +15% (XR-3 `test_fund_without_nav_is_not_silently_dropped`); (2) raises `TypeError` in `analytics/benchmark.py` `_current_value_by_scheme` (`Decimal(h.current_value)`, ~166-169); and (3) in the same file a fund missing from the value dict is read as `Decimal("0")` at ~361 and ~419 (the per-fund rate would be computed against a value of zero), and the portfolio totals at ~253-254 and ~382-383 keep that fund's transactions while its value is absent.
**The change (only this).**
- **Unpriced = held (`units_held != 0`) with `current_value is None`.** A fully sold fund (no units) is **not** unpriced: its flows stay and its value is 0, as today.
- **FX-8a small:** an unpriced fund is left out **whole**: its transactions and its value are both left out of the tile (lifetime and current-holdings rates) and of the totals at the sites above. No other price step is added.
- **FX-8b:** `_current_value_by_scheme` skips a holding with `current_value is None` (no exception); an unpriced fund's per-fund rate is `None` (not computed against zero) and every other fund keeps its figure.
- The two XR-3 tests `test_fund_without_nav_is_not_silently_dropped` and `test_per_fund_job_with_no_nav_holding_does_not_raise` are strict expected failures: after your change they must report **XPASS(strict)** (the success signal; do not edit their markers). Their hand-worked values: both funds valued 15%; the unpriced fund left out whole 10%; the priced fund keeps 10% and the unpriced fund has no rate.
- Add one test, `test_household_with_every_fund_priced_is_unchanged_by_the_unpriced_rule` (a household with a fully sold fund and priced funds; the rates must equal what they are today), so the "no-op when priced" claim is proven.

## Tests first
The two `test_final_flow_is_dated_with_the_price_date_not_the_server_clock[...]` tests (XR-3, T8-6) are marked **strict expected failures**; after your change they must report **XPASS(strict)**: that is the success signal. Do not edit their markers; the orchestrator removes them. Also write the new test named under "Added scope". Add, before the change, red tests for the callers the audit lists: `test_every_caller_ends_the_same_household_on_the_price_date` (build one invented household with a Friday price, run the callers named above, assert the same last date for each). Report which were red first.

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
3. Docs/orchestration/2026-11-19-xfix1-final-flow-date-handoff.md (your task: XFIX-1, FX-8c plus the small FX-8a and FX-8b, owner-approved)
Work only in D:\unifolio-a-xirr on branch batch/a-xirr-fixes. Git is read-only. No deletion flags or recursive deletes. Write the failing tests first, run them, then make the change in the files the handoff names only. Do not change analytics/xirr.py. If an existing test fails because it asserts the old behaviour, do not edit it: report it.
Run tests with: cd backend; "D:\Unifolio code\backend\.venv-win\Scripts\python.exe" -m pytest <files>   (if the sandbox cannot run it, reply BLOCKED with the exact error, do not change any config)
Reply with the CODEX REPORT block from the handoff, nothing else.
```
