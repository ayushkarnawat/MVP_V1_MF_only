# Handoff: d4-several-benchmarks (Batch D, task D-4: several benchmarks matched by date, backend, Codex)
**Status:** READY TO RELAY (written 2026-11-20). **Approved by the owner on 19 Nov 2026** (Batch D). Can run **at the same time as** the D-9 red tests handoff (`2026-11-20-d9-popup-red-tests-handoff.md`): different worktree, different files.
**Parent plan:** `Docs/superpowers/plans/2026-11-17-batch-d-charts-plan.md` (Task D-4; read "Global Constraints" and "Review Focus"). **Spec:** `Docs/orchestration/2026-11-13-batch-d-planning-workbook.html`, item 13 and section 2 ("After: three"). The workbook is the design; if it and the code disagree, stop and say so.
**Worker:** Codex, backend only. **Reviewer and committer:** Claude.
**Work in:** `D:\unifolio-d-charts` (branch `batch/d-charts`, which already holds D-2, D-3 and, after the orchestrator merges, D-8). Never in `D:\Unifolio code`. If `git log` there does not show the D-8 commit (`e9300cee` or its merge), stop: the orchestrator merges `batch/d-movers` first, because D-8 and D-4 both edit `services/home/schemas.py` and `api/home.py`.
Read first, in order: `Docs/orchestration/ui-common-rules-codex.md`, `Docs/orchestration/wave-common-rules.md` (wins where they differ), then this file.

## Wave-start check (re-check, report drift)
`backend/app/services/home/wealth.py` (`_benchmark_series` at about line 66, `assemble_wealth_series`, `build_wealth_series`), `backend/app/api/home.py` (`HomeBenchmark` literal; `aggregate_wealth` and `member_wealth` at about lines 381 to 390; the helper at about line 309 that loads the index levels and calls `build_wealth_series`) exist as described. Today the by-date matching and the "carry the last index level over a gap" rule already live in `_benchmark_series` (one benchmark). The job is to let the route take a **list**, not to rewrite that rule.

## The change
- **Old link untouched:** the existing query `benchmark` (single) and every existing response field (`benchmark` included) stay exactly as they are, in every field, for every old caller.
- New optional query parameter **`benchmarks`** (repeatable, `list[HomeBenchmark] | None`), at most **`MAX_BENCHMARKS = 3`** (a module constant, not a literal in the route); more than 3 returns HTTP 422 with a plain message. Duplicates are collapsed in the order given. If both `benchmark` and `benchmarks` are sent, `benchmarks` wins for the new field and `benchmark` still fills the old field.
- New response field **`benchmark_series: list[BenchmarkSeriesOut]`** (default empty list, additive) with `BenchmarkSeriesOut(benchmark: HomeBenchmark, points: list[SeriesPoint], clipped: bool, effective_start: date | None, available: bool)`. One entry per requested benchmark, in the requested order. Each entry is built by the **same function** the single benchmark uses (a single benchmark is a list of one; do not write a second implementation). Each benchmark is matched to the portfolio's dates on its own: the last index level is carried over a gap; a period that starts before that index's stored history is **clipped** (`clipped=true`, `effective_start` is where its data begins), never dropped; an index with no usable data gives `available=false` and no points, and does not hide the others.
- The old `benchmark` field and `benchmark_series[0]` agree when the same single index is asked both ways (test it).
- Percent values keep today's rounding (`PCT`) and `Decimal`-as-string in the response; no float anywhere.

## Tests first (`backend/tests/services/home/test_wealth.py`, `test_series.py`; invented data, `Decimal`; written and run before the change; red for the stated reason)
`test_old_single_benchmark_reply_unchanged` (guard: passes today); `test_three_benchmarks_return_three_series`; `test_fourth_benchmark_rejected` (422); `test_points_matched_by_date_with_last_level_carried_over_a_gap`; `test_period_starting_before_history_is_clipped_not_dropped`; `test_unavailable_benchmark_reports_available_false_and_keeps_the_others`; `test_duplicates_collapsed_and_order_kept`; `test_single_benchmark_equals_first_of_list`; `test_member_route_accepts_benchmarks_too`.

## Run these only
```
cd backend
"D:\Unifolio code\backend\.venv-win\Scripts\python.exe" -m pytest tests/services/home/test_wealth.py tests/services/home/test_series.py tests/api/test_home_routes.py -v
```
(Adjust the last path to the existing Home route tests and say which.) If the sandbox stalls at asyncio start-up, report BLOCKED with the exact error; still write the change and the tests; the orchestrator runs them.

## Files you may touch
`backend/app/services/home/wealth.py`, `backend/app/services/home/schemas.py`, `backend/app/api/home.py` (only the two wealth routes and the helper they share, plus the new constant), `backend/tests/services/home/test_wealth.py`, `backend/tests/services/home/test_series.py`. **Do not touch** the movers code, `frontend/**`, other `app/**`, existing tests' assertions, migrations.

## Constraints
`Decimal` only. No network. Invented data only. No new dependency. Git read-only. No deletion flags or recursive deletes. Every change additive.

## Report format
One fenced block `CODEX REPORT: d4-several-benchmarks`: status; baseline HEAD; drift; which new tests were red first; files and functions changed with a one-line reason each; the exact new query parameter and response fields (model, name, type, default); commands with counts; any existing test that fails; `git status --short`; Deviations; Open questions.

## Paste-ready prompt
```
Backend worker for Unifolio (Codex). Read, in order:
1. Docs/orchestration/ui-common-rules-codex.md
2. Docs/orchestration/wave-common-rules.md (wins where they differ)
3. Docs/orchestration/2026-11-20-d4-several-benchmarks-handoff.md (your task: D-4, owner-approved)
Work only in D:\unifolio-d-charts on branch batch/d-charts. Git is read-only. No deletion flags or recursive deletes. Write the failing tests first, run them, then make the change in the files the handoff names only. The old single-benchmark reply must not change in any field. Every change is additive. If an existing test fails because it asserts the old behaviour, do not edit it: report it.
Run tests with: cd backend; "D:\Unifolio code\backend\.venv-win\Scripts\python.exe" -m pytest <files>   (if the sandbox cannot run it, reply BLOCKED with the exact error, do not change any config)
Reply with the CODEX REPORT block from the handoff, nothing else.
```
