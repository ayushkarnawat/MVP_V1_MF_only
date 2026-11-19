# Handoff: rk7b-average-pool-and-legacy-blend (Batch A, task RK-7 part b: FX-10b and FX-9a)
**Status:** READY TO RELAY (written 2026-11-19). **Approved by the owner on 19 Nov 2026**: FX-10b (the category average counts the same funds as the rank; plan ID FX-9a part 1) and FX-9a option A (the older blended average exactly as the workbook designed). May run **at the same time as** `2026-11-19-xfix1-final-flow-date-handoff.md` (different worktrees, different files).
**Parent plan:** `Docs/superpowers/plans/2026-11-17-batch-a-numbers-plan.md` (fix task template). **Proposal and evidence:** `Docs/orchestration/2026-11-19-batch-a-fix-proposals.md` (FX-10b, FX-9a) and `Docs/orchestration/2026-11-19-rk4-real-pool-reconciliation.md`. **Spec:** `Docs/orchestration/2026-11-17-batch-a3-category-average-excel-planning-workbook.html` (weights, the legacy sheet `=40%*Summary_3Y + 60%*Summary_5Y`). The workbook is the design; if it and the code disagree, stop and say so.
**Worker:** Codex, backend only. **Reviewer and committer:** Claude.
**Work in:** `D:\unifolio-a-fixes` (branch `batch/a-fixes`; it already holds the approved FX-10a and FX-10d fixes in `scheme_universe.py`). Never in `D:\Unifolio code`.
Read first, in order: `Docs/orchestration/ui-common-rules-codex.md`, `Docs/orchestration/wave-common-rules.md` (wins where they differ), then this file.

## What is wrong (re-check each line; report drift)
All in `backend/app/services/analytics/category_ranking.py`.
1. **FX-10b.** `load_category_pool(db, scheme, today)` (~314) builds the average from **every series in `peers.schemes`**. The ranked pool (`performance_ranking.load_ranking_pools`, `eligible = {s.id for s in peers.schemes if s.is_active and not _is_index(s) and canonical_category(s.sebi_category) == key[0] and s.plan_type == key[1]}`) is stricter. After FX-10a and FX-10d the peers are already Growth-only and of the wanted plan; what still differs is the **index/ETF rule** (and `is_active`): the Navi ELSS Nifty 50 Index fund sits in the ELSS average on staging. The category average and the rank therefore describe different sets.
2. **FX-9a.** The legacy average (`category_blended_weighted_average`, ~292) takes each fund's own blended return (40% of its 3Y, 60% of its 5Y, or 100% of its 3Y when it has no 5Y return) and size-weights those. The workbook's legacy figure is **`40% x the displayed 3Y average + 60% x the displayed 5Y average`**. With one 3Y-only fund the app gives 0.2650 and the workbook 0.2200 (CA-3 test T9-5, currently marked a strict expected failure).

## The change (only this)
- **FX-10b:** the category average (all periods and the legacy figure) uses the funds of the ranked pool: active, not index/ETF, same canonical category, same plan. **Exception that keeps today's behaviour:** when the **held scheme itself is an index/ETF fund** (`is_index_fund(scheme.name, scheme.sebi_category)`), the average stays over its own category's index funds as today (the rank pool is empty there by design). **Filter the returned `detailed` dict, not the list passed to `_category_returns_detailed`**: that function caches by `("peers", *key)` and `load_ranking_pools` calls it with the full peer list first or second; filtering the input would poison the shared cache. `CategoryPool.peers` and `fund_count` stay as they are.
- **FX-9a (option A):** `category_blended_weighted_average` returns `0.4 x the 3Y weighted average + 0.6 x the 5Y weighted average` computed from `category_period_weighted_averages` (the same pools and weights as the displayed periods); when the 5Y average is `None` (no fund has a 5Y return) the legacy value is the 3Y average; when the 3Y average is `None` the legacy value is `None`. Keep the `CategoryAverage` fields (`peers`, `weighting`, `funds_without_size`) from the 3Y average and say so in the report. Do not change the constants `_BLEND_WEIGHT_3YR` and `_BLEND_WEIGHT_5YR` or `_blend_returns` (other code may use them); report who else calls them.
- Every backend change is additive. No field removed or renamed.

## Tests first (invented funds only, `Decimal`, no network)
In `backend/tests/services/analytics/test_category_average_checks.py` (extend the existing `seed_pool` fixture style) and `test_category_ranking.py`, written and run **before** the change, each failing today for the stated reason:
1. `test_average_pool_equals_ranked_pool_when_an_index_series_is_in_the_category`: a Growth category with an index fund; expected: the index fund is in no average and no rank; today it is in the average.
2. `test_index_category_average_keeps_its_own_funds`: a held index fund; expected: the average is over the category's index funds (passes today; must keep passing).
3. `test_inactive_series_is_in_neither_pool`.
4. The existing `test_legacy_blend_is_40_30_60_50_consistent` (T9-5) **must now pass**; it is marked strict expected-failure, so after your change it will report **XPASS(strict)**: that is the success signal. Do not edit its marker; the orchestrator removes it. Add `test_legacy_is_the_three_year_average_when_no_fund_has_a_five_year_return`.
5. `test_pool_cache_is_not_poisoned_by_the_average_filter`: call `load_ranking_pools` then `load_category_pool` and the reverse order on one category with an index fund; the ranked pool must be identical in both orders.

## Run these only
```
cd backend
"D:\Unifolio code\backend\.venv-win\Scripts\python.exe" -m pytest tests/services/analytics/test_category_ranking.py tests/services/analytics/test_category_average_checks.py tests/services/analytics/test_performance_ranking.py tests/services/analytics/test_scheme_universe.py tests/services/analytics/test_recount_pool.py tests/scripts/test_export_ca_fund_metrics.py -v
```
(From `D:\unifolio-a-fixes\backend`. No full suite.) If an existing test fails because it asserts the old behaviour, **do not edit it**: stop and report the test and why. If the sandbox stalls at asyncio start-up (a socket-pair timeout before the first coroutine), report BLOCKED with the exact error, still write the change and the tests; the orchestrator runs them. The two tests `test_no_module_imports_*` fail on Windows for an encoding reason that is not yours.

## Files you may touch
`backend/app/services/analytics/category_ranking.py` and the test files named above (the new tests only; leave existing assertions). **Do not touch** `scheme_universe.py`, `performance_ranking.py`, other `app/**`, existing tests' assertions, `frontend/**`, migrations, real data.

## Constraints
`Decimal` only. No network. Invented data only. No new dependency. Git read-only. No deletion flags or recursive deletes.

## Report format
One fenced block `CODEX REPORT: rk7b-average-pool-and-legacy-blend`: status; baseline HEAD; drift; which new tests were red first and why; commands with counts; files changed with a one-line reason each; who else calls the blend constants and `category_blended_weighted_average`; any existing test that fails after the change; `git status --short`; Deviations; Open questions.

## Paste-ready prompt
```
Backend worker for Unifolio (Codex). Read, in order:
1. Docs/orchestration/ui-common-rules-codex.md
2. Docs/orchestration/wave-common-rules.md (wins where they differ)
3. Docs/orchestration/2026-11-19-rk7b-average-pool-and-legacy-blend-handoff.md (your task: RK-7b, FX-10b and FX-9a, owner-approved)
Work only in D:\unifolio-a-fixes on branch batch/a-fixes. Git is read-only. No deletion flags or recursive deletes. Write the failing tests first, run them, then make the change in category_ranking.py only. If an existing test fails because it asserts the old behaviour, do not edit it: report it.
Run tests with: cd backend; "D:\Unifolio code\backend\.venv-win\Scripts\python.exe" -m pytest <files>   (if the sandbox cannot run it, reply BLOCKED with the exact error, do not change any config)
Reply with the CODEX REPORT block from the handoff, nothing else.
```
