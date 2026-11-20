# Handoff: d12-series-end-date (Batch D, task D-12: the wealth chart's last day never falls because of a few missing prices, backend, Codex)
**Status:** READY TO RELAY (written 2026-11-20). **Approved by the owner on 19 Nov 2026** (Batch D, prices and the end date). Runs **at the same time as** `2026-11-20-d7-overview-graph-handoff.md` (different worktree and files).
**Parent plan:** `Docs/superpowers/plans/2026-11-17-batch-d-charts-plan.md` (Task D-12). **FX-10c (one common end date for a pool) stays parked** (owner, 20 Nov: "no pool mixes end dates today; build only if the trigger appears"): this task is the small chart-side rule only. The workbook (`2026-11-13-batch-d-planning-workbook.html`, section 5, "Prices and the NAV fix") is the design; if it and the code disagree, stop and say so.
**Worker:** Codex, backend only. **Reviewer and committer:** Claude.
**Work in:** `D:\unifolio-d-endrule` (a new worktree, branch `batch/d-endrule`, cut from `batch/d-charts` at `204cf46c`). Never in `D:\Unifolio code`.
Read first, in order: `Docs/orchestration/ui-common-rules-codex.md`, `Docs/orchestration/wave-common-rules.md` (wins where they differ), then this file.

## What I already know, and what you must check
`backend/app/services/home/wealth.py` (`build_wealth_series`) ends the series at `inputs.nav_as_of`, which comes from `movers.as_of_nav_date` (`services/home/movers.py`, the "latest recent date on which funds holding at least half of the portfolio's value have a price" rule). So **the end date probably already follows the "complete enough" rule**, and the last point is replaced by the headline value only when `end == inputs.nav_as_of and not _priced_after(...) and not _units_changed_after(...)` (around line 304). **Your first job is to find out, with a test, whether the plan's failure still exists:** a day on which only a minority of the portfolio's funds have a new price must **not** produce a falling last point (the funds without a price must not be valued at zero or at stale prices against fresh ones on the last day).
- If the test **passes at once** (the rule already holds): keep it as a **guard** and report that no code change was needed, with the evidence.
- If it **fails**: make the smallest change in `wealth.py` so the series ends on the latest date with complete-enough prices, behind **one small function** (so FX-10c's common end-date rule can replace it later), and keep the old behaviour whenever every fund is priced. The response gains no new field unless the test cannot pass without one (then: an additive `end_reason` string, and say so).

## Tests first (`backend/tests/services/home/test_wealth.py`; invented data, `Decimal`; written and run before any change; the plan's name)
`test_series_stops_at_latest_date_with_complete_enough_prices_and_says_so` (a household of several funds where one small fund has no price on the last calendar day: the series ends at the last complete-enough date, no falling last point, the headline value and the last point agree); `test_series_with_every_fund_priced_is_unchanged` (guard: passes today; the existing golden fixture `tests/fixtures/home/wealth_1m_family_benchmark.json` stays equal); `test_majority_missing_does_not_end_on_the_partial_day`.

## Run these only
```
cd backend
"D:\Unifolio code\backend\.venv-win\Scripts\python.exe" -m pytest tests/services/home/test_wealth.py tests/services/home/test_series.py tests/api/test_home_routes.py -k "wealth or series or home" -v
```
If the sandbox stalls at asyncio start-up, report BLOCKED with the exact error; still write the tests and any change; the orchestrator runs them.

## Files you may touch
`backend/app/services/home/wealth.py`, `backend/tests/services/home/test_wealth.py`. **Do not touch** `movers.py`, `schemas.py`, `api/home.py`, `frontend/**`, other `app/**`, existing assertions, fixtures' JSON, migrations.

## Constraints
`Decimal` only. No network. Invented data only. No new dependency. Git read-only. No deletion flags or recursive deletes. Every change additive.

## Report format
One fenced block `CODEX REPORT: d12-series-end-date`: status; baseline HEAD; drift; **whether the new test was red or green at first and why**; files and functions changed (or "none needed") with a one-line reason each; commands with counts; any existing test that fails; `git status --short`; Deviations; Open questions.

## Paste-ready prompt
```
Backend worker for Unifolio (Codex). Read, in order:
1. Docs/orchestration/ui-common-rules-codex.md
2. Docs/orchestration/wave-common-rules.md (wins where they differ)
3. Docs/orchestration/2026-11-20-d12-series-end-date-handoff.md (your task: D-12, owner-approved)
Work only in D:\unifolio-d-endrule on branch batch/d-endrule. Git is read-only. No deletion flags or recursive deletes. Write the tests first and run them: the handoff explains that the rule may already hold, so a green test is a valid answer (keep it as a guard and say so). Change wealth.py only if a test is red, and only the smallest change. If an existing test fails because it asserts the old behaviour, do not edit it: report it.
Run tests with: cd backend; "D:\Unifolio code\backend\.venv-win\Scripts\python.exe" -m pytest <files>   (if the sandbox cannot run it, reply BLOCKED with the exact error, do not change any config)
Reply with the CODEX REPORT block from the handoff, nothing else.
```
