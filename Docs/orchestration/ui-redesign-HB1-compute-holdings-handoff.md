# Handoff: ui-redesign HB1 (compute_holdings scheme filter and stored-prices setting)
**Status:** DONE (commit `511f1ef` on `feat/home-snapshot`)
**Parent plan:** `Docs/superpowers/plans/2026-10-23-home-backend-plan.md` Task T1 (absorbs Individual Fund backend T1; consumed by Individual Fund backend and Planning backend T5). Strategy: `Docs/orchestration/2026-10-24-ui-redesign-execution-strategy.md` G3. Run catalogue: `2026-10-24-ui-redesign-orchestrator-handoff.md` section 6, run **HB1 (+ Opus)**.
**Branch:** `feat/home-snapshot` (cut from `leapswitch-redesign`). **Orchestrator:** Claude Code · **Worker:** Codex (manual relay).

## Task
Change the hot shared function `compute_holdings` so that Home, the Individual Fund page and Planning can ask for one fund's holding from stored prices, with no change for any existing caller.

Final signatures (exactly):
- `async def compute_holdings(db: Session, household_member_ids: list[uuid.UUID], *, scheme_ids: frozenset[uuid.UUID] | None = None, allow_stale_today: bool = False) -> list[HoldingRow]` in `backend/app/services/dashboard/holdings.py`.
- `async def get_navs_on_or_before(db, scheme_date_pairs, *, allow_stale_today: bool = False)` in `backend/app/services/dashboard/nav.py` (the single-fund `get_nav_on_or_before` already has `allow_stale_today`; do not change it).

Behaviour:
1. **Scheme filter:** when `scheme_ids` is given, keep only folios whose `Folio.scheme_id` is in it, **before** `_load_folio_transactions` loads transactions (add an optional filter argument to `_load_folio_transactions` or filter the folio list passed to it; its other callers, `compute_realized_summary` among them, must behave exactly as today). `None` means every scheme.
2. **Stored prices:** `allow_stale_today=True` makes the batched lookup trust the newest cached NAV row on any date up to today (`trustworthy = cached is not None and (allow_stale_today or cached.date == on_date or on_date != date.today())`) and never fetch because today's row is missing. In `compute_holdings`, the "compatibility seam" branch that calls a replaced `get_nav_on_or_before` must also pass `allow_stale_today=allow_stale_today`. A scheme with no cached row at all keeps today's behaviour (one fetch).
3. **Cache key:** `(tuple(sorted(household_member_ids)), date.today(), scheme_ids, allow_stale_today)` so a filtered or stale-allowed result never serves a different call. `peek_cached_holdings(household_member_ids)` (used by `import_/reconciliation.py`) keeps its signature and reads the **unfiltered, strict** key `(ids, today, None, False)`. `invalidate_holdings_cache(member_id)` still removes every key whose member tuple contains the member (the member tuple is still `key[0]`), whatever the other key parts. The generation check and publish logic stay as they are.
4. Existing callers (about 20 across `analytics/`, `dashboard/`, `api/`; run `git grep -n "compute_holdings("`) pass nothing and must be untouched.

## Tests first (failing, see them fail, then code)
In `backend/tests/services/dashboard/test_holdings.py` and `test_nav.py`, using the existing fixtures and patterns (no live network; patch `app.services.dashboard.nav._fetch_nav_history`):
- `test_scheme_filter_returns_only_requested_schemes` (two held schemes, filter one, one row; the other scheme's NAV is never looked up).
- `test_filtered_and_unfiltered_cache_entries_do_not_collide` (call unfiltered, then filtered: second returns one row; then unfiltered again returns all rows).
- `test_unfiltered_default_behaviour_unchanged` (existing fixtures produce identical rows).
- `test_allow_stale_today_never_fetches` (stored NAV dated yesterday, fetch patched to raise; with the flag the row is valued at the stored NAV and `current_nav_date` is yesterday).
- `test_default_still_fetches_when_today_row_missing` (patched fetch called once without the flag).
- `test_stale_allowed_result_does_not_serve_a_strict_call` (call with the flag, then without: the second call fetches).
- `test_invalidate_removes_filtered_and_stale_entries`.
- `test_peek_cached_holdings_reads_only_the_unfiltered_strict_entry`.
- In `test_nav.py`: `test_get_navs_on_or_before_allow_stale_today_trusts_yesterdays_row` and `test_get_navs_on_or_before_default_unchanged`.

## Test commands (run only these plus the importers)
From `backend\`: `.venv\Scripts\python.exe -m pytest tests/services/dashboard/test_holdings.py tests/services/dashboard/test_nav.py tests/api/test_dashboard_holdings_route.py -q`, plus every test file that `git grep -l "compute_holdings\|peek_cached_holdings\|invalidate_holdings_cache" -- tests` finds (list them in the report). No full suite.

## Constraints
`Decimal` never `float`. TDD. Additive only: no change in the output of any existing caller. Do not touch: `infra/`, `Docs/`, existing migrations, mobile code, the analytics services, the Dashboard routes (they must not pass the new parameters), any other file. Git read-only whitelist (`status`, `diff`, `log`, `show`, `grep`, `ls-files`): never `add`, `commit`, `stash`, `checkout`. LF endings, UTF-8, no new dependency.

## Review Focus (for the gate)
A wrong stale-price rule could show an old price as today's or let a strict call read a stale-allowed cache entry; a changed key shape could break `peek_cached_holdings` (import reconciliation) or leave filtered entries behind after `invalidate_holdings_cache`; the filter must not change `compute_realized_summary`.

## Approaches considered and rejected
A second function for the one-fund case (copies the lot logic, drifts from the Dashboard); filtering the returned rows after the call (still pays the whole-household price lookup, which cost 20 to 22 s cold on staging).

## Open questions
Anything the code shows that the plan did not say (names, extra callers, a test double that replaces `get_nav_on_or_before`) goes under Findings; behaviour or interface questions under Open questions. Do not guess.

## Report (Codex fills this in at the end, in one fenced block)
```
CODEX REPORT — ui-redesign — HB1
Run date/time: 2026-10-24 17:05:31 +05:30    Environment: Windows    Python: 3.14.3    Baseline HEAD: e63aab84d040e802ed743aa8f3460001d259df83
1. TASK STATUS: PARTIAL — Implementation matches the handoff; named tests pass; nine importer tests fail because protected test doubles reject the required keyword.
2. FILES:
   New (untracked) created by this run: none.
   Modified by this run:
   backend/app/services/dashboard/holdings.py
   backend/app/services/dashboard/nav.py
   backend/tests/services/dashboard/test_holdings.py
   backend/tests/services/dashboard/test_nav.py
   Docs/orchestration/ui-redesign-HB1-compute-holdings-handoff.md (pre-existing untracked file; Report block only).
   Pre-existing changes left alone: modified Docs/orchestration/delegation-log.md; untracked Docs/Web app UI mockups MFs.pdf and Docs/orchestration/ui-redesign-session.md.
   Staged (must be empty): empty.
3. TESTS (commands run from backend):
   RED command:
   .venv/Scripts/python.exe -m pytest tests/services/dashboard/test_holdings.py tests/services/dashboard/test_nav.py tests/api/test_dashboard_holdings_route.py -q --tb=short -p no:cacheprovider
   Last 3 lines:
   FAILED tests/services/dashboard/test_nav.py::test_get_navs_on_or_before_allow_stale_today_trusts_yesterdays_row
   FAILED tests/services/dashboard/test_nav.py::test_get_navs_on_or_before_allow_stale_today_fetches_when_cache_empty
   13 failed, 61 passed, 3 warnings in 4.65s
   All new feature tests failed before production edits; the default NAV characterization test already passed.
   GREEN command (named files, final):
   .venv/Scripts/python.exe -m pytest tests/services/dashboard/test_holdings.py tests/services/dashboard/test_nav.py tests/api/test_dashboard_holdings_route.py -q --tb=short -p no:cacheprovider --disable-warnings
   Last 3 lines:
   ........................................................................ [ 97%]
   ..                                                                       [100%]
   74 passed, 3 warnings in 4.16s
   Importer command (PowerShell):
   $hb1TestFiles = @(git grep -l "compute_holdings\|peek_cached_holdings\|invalidate_holdings_cache" -- tests); .venv/Scripts/python.exe -m pytest @hb1TestFiles -q --tb=short -p no:cacheprovider
   Last 3 lines:
   FAILED tests/services/analytics/test_ter.py::test_compute_direct_regular_ter_comparison_empty_bucket_when_no_regular_holdings
   FAILED tests/services/analytics/test_ter.py::test_weighted_ter_and_comparison_never_reach_amfi
   9 failed, 401 passed, 2 skipped, 4 warnings in 37.84s
   Extra files via git grep (22 matches; test_holdings.py overlaps the named set):
   tests/api/test_imports_routes.py
   tests/api/test_scenarios_api.py
   tests/functional_postgres/test_lookthrough_postgres.py
   tests/services/analytics/test_asset_allocation_lookthrough.py
   tests/services/analytics/test_benchmark.py
   tests/services/analytics/test_cap_allocation.py
   tests/services/analytics/test_fund_manager_allocation.py
   tests/services/analytics/test_investment_withdrawal.py
   tests/services/analytics/test_lookthrough.py
   tests/services/analytics/test_lookthrough_cross_section_agreement.py
   tests/services/analytics/test_overlap.py
   tests/services/analytics/test_period_consistency.py
   tests/services/analytics/test_recompute.py
   tests/services/analytics/test_recompute_stock_holdings_section.py
   tests/services/analytics/test_scenario_engine.py
   tests/services/analytics/test_ter.py
   tests/services/analytics/test_valuation.py
   tests/services/dashboard/test_distributor_comparison.py
   tests/services/dashboard/test_holdings.py
   tests/services/dashboard/test_member_profile.py
   tests/services/import_/test_reconciliation.py
   tests/services/import_/test_service.py
   Additional checks: git diff --check clean; staged files empty; all four code/test files verified UTF-8/LF.
4. DEVIATIONS (mechanics only):
   Sandbox runs stalled in asyncio's local socketpair creation; interrupted and reran with approved sandbox escalation.
   Used --tb=short and disabled pytest's cache provider after permission warnings; final named run also used --disable-warnings.
   Corrected the new fixture's missing Import foreign key before accepting RED evidence.
   Updated existing cache-key fixtures and batch-lookup doubles only in the permitted test_holdings.py.
   Added three edge tests before implementation: empty filter, single-lookup seam forwarding, and stale-allowed lookup with no cached NAV.
   Required schema/architecture/ADR/app-flow documents were located under Docs/PRDs/.
   Edited only the requested Report block in Docs; no other documentation changes.
5. FINDINGS (what the code showed that the plan did not say):
   Protected test_benchmark.py:73 and test_ter.py:69 have AsyncMock side-effect lambdas taking only three positional arguments. Explicit allow_stale_today forwarding makes nine existing tests raise TypeError.
   _load_folio_transactions is also used by dashboard/snapshots.py; its default remains unfiltered.
   PostgreSQL functional tests skip when TEST_DATABASE_URL is unset; this run skipped two tests.
   Warnings: deprecated Windows asyncio policies, Starlette/httpx TestClient integration, and an existing workbook fixture without a default style.
6. OPEN QUESTIONS / BLOCKERS:
   Orchestrator must resolve protected test-double signatures versus mandatory keyword forwarding before the importer gate can pass. No production fallback or protected-file edit was made.
   Failed test names:
   tests/services/analytics/test_benchmark.py::test_compute_fund_vs_benchmark_uses_per_fund_appropriate_index
   tests/services/analytics/test_benchmark.py::test_compute_fund_vs_benchmark_switch_only_household_still_yields_fund_rows
   tests/services/analytics/test_ter.py::test_compute_weighted_ter_computes_holding_value_weighted_average
   tests/services/analytics/test_ter.py::test_missing_current_month_ter_falls_back_to_last_saved_month_without_refreshing
   tests/services/analytics/test_ter.py::test_compute_weighted_ter_flags_uncovered_scheme_without_crashing
   tests/services/analytics/test_ter.py::test_compute_weighted_ter_returns_none_weighted_ter_when_nothing_covered
   tests/services/analytics/test_ter.py::test_compute_direct_regular_ter_comparison_splits_by_plan_type
   tests/services/analytics/test_ter.py::test_compute_direct_regular_ter_comparison_empty_bucket_when_no_regular_holdings
   tests/services/analytics/test_ter.py::test_weighted_ter_and_comparison_never_reach_amfi
7. SELF-REVIEW FINDINGS:
   - [Med] backend/tests/services/analytics/test_benchmark.py:73 and backend/tests/services/analytics/test_ter.py:69 — legacy test doubles reject allow_stale_today; nine importer failures — NOT FIXED (files outside the permitted edit scope; forwarding explicitly required).
   - No further service issues found: filter precedes transaction loading; NAV dates stay actual; strict/filtered/stale cache keys are isolated; peek reads only strict/unfiltered; invalidation and generation publication remain intact.
8. CONFIRMATIONS: No git write commands: YES   Full suites not run: YES
```

## Orchestrator record
- 2026-10-24 Codex built it (PARTIAL: 9 importer tests failed in `test_benchmark.py` and `test_ter.py`, whose test doubles take three positional arguments, because the flag was always forwarded to the single-fund lookup). Orchestrator fix (small diff, files loaded): forward `allow_stale_today` to the lookup functions only when it is True (`nav_kwargs`), so every existing caller and double sees the exact call it saw before. No protected test edited.
- Independent verification: `git diff --stat` matches the handoff (holdings.py, nav.py, test_holdings.py, test_nav.py); named tests plus every importer found by `git grep` (437 passed, 2 skipped, Postgres tests skip without `TEST_DATABASE_URL`).
- Pending: Codex adversarial review (manual relay), Opus review (subagent, started), commit on `feat/home-snapshot`.
- Opus review (subagent, 24 Oct): PASS, no High or Med. Low 2 fixed (`scheme_ids` coerced to a frozenset). Low 1 accepted and passed on: with `allow_stale_today=True` the row's `today_gain` is the last cached day's move, so Home's day-change (HB3) must not label it as today's without the `current_nav_date`. Low 3 accepted (no test that `compute_realized_summary` or snapshots are unaffected, or that a strict entry does not serve a stale-allowed call; both safe by construction).
- Codex review (relay, 24 Oct): PASS; one Low (CRLF in holdings.py after the orchestrator's edit), fixed before commit (LF restored, `git ls-files --eol` shows i/lf w/lf). `/codex:adversarial-review` was not available in the owner's Codex, so Codex reviewed directly (static).
- Committed `511f1ef` (code only); docs live on `leapswitch-redesign`.
