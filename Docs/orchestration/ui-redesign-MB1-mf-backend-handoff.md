# Handoff: ui-redesign MB1 (Mutual Funds backend: four new benchmark indices behind a legacy tuple, migration 0045)
**Status:** READY FOR CODEX (written 26 Oct 2026, not yet run)
**Parent plan:** `Docs/superpowers/plans/2026-10-24-mutual-funds-backend-plan.md` Task **BT1**. Run catalogue: `2026-10-24-ui-redesign-orchestrator-handoff.md` section 6, run **MB1**. It also unblocks Home's `recommend_benchmark` and the Smallcap 250 benchmark option (Home run HB4, task T10).
**Branch:** `feat/mf-backend`, cut by the orchestrator from `leapswitch-redesign` (it carries this handoff). The PR will target `leapswitch-redesign`. **Orchestrator:** Claude Code · **Worker:** Codex (manual relay). One working tree, one run at a time: do not switch branches. Where the plan names a step but not a detail, this document wins.

**Why this is small but delicate.** Adding enum members is easy; the risk is that code which loops over `BenchmarkIndex` silently starts returning four extra rows (the old Benchmark table in Analytics, the scenario results, the stored `analytics_sections` payloads). Hence the legacy tuple: every pre-existing loop keeps exactly the original four, and only the daily refresh job (which must fetch history for all eight) uses the full set.

## What to build (all additive; nothing existing is removed, renamed or reshaped)
1. `backend/app/models/enums.py`: `BenchmarkIndex` gains, after the existing four and in this order, `NIFTY_NEXT_50 = "nifty_next_50"`, `NIFTY_SMALLCAP_250 = "nifty_smallcap_250"`, `NIFTY_100 = "nifty_100"`, `NIFTY_200 = "nifty_200"`. Add, right below the class:
```python
LEGACY_BENCHMARK_INDICES: tuple[BenchmarkIndex, ...] = (
    BenchmarkIndex.NIFTY_50, BenchmarkIndex.NIFTY_500,
    BenchmarkIndex.NIFTY_LARGEMIDCAP_250, BenchmarkIndex.NIFTY_MIDCAP_150,
)   # the four the old UI, the PDF export, the mobile app and every stored payload know; pre-existing loops iterate this, never the full enum
ALL_BENCHMARK_INDICES: tuple[BenchmarkIndex, ...] = tuple(BenchmarkIndex)
```
2. `backend/app/services/analytics/nse_indices_client.py`: four entries in `_TRADING_INDEX_NAME`, with these **exact strings, verified live by the orchestrator on 26 Oct 2026** against both endpoints (`getHistoricaldatatabletoString` and `getTotalReturnIndexString`, same `cinfo` request shape as the existing code, a window of 13 to 23 Oct 2026; every one returned rows through 23 Oct; the match is case-insensitive on NSE's side but use these spellings): `NIFTY_NEXT_50: "Nifty Next 50"`, `NIFTY_SMALLCAP_250: "Nifty Smallcap 250"`, `NIFTY_100: "Nifty 100"`, `NIFTY_200: "Nifty 200"`. The same name works for price and TRI, so **do not add a second map**. Update the stale comment `# Static — only 4 members ...` to say eight. Do not make any live request yourself (no network in tests or in this run).
3. `backend/app/services/analytics/benchmark.py` lines about 166 and 174: both `for i in BenchmarkIndex` / `for index in BenchmarkIndex` become `LEGACY_BENCHMARK_INDICES`. `_benchmark_index_for_category` is **not** touched (the per-fund assigned benchmark stays one of the legacy four).
4. `backend/app/services/analytics/scenario_engine.py` line about 496 (`_scenario_benchmark_comparisons`): `for index in BenchmarkIndex` becomes `LEGACY_BENCHMARK_INDICES`. Nothing else in that file changes.
5. **Migration `backend/alembic/versions/0045_benchmark_index_new_members.py`**, `revision = "0045"`, **`down_revision = "0043"`** (the current and only head; `0044` is reserved by a later plan and does not exist yet; run `alembic heads` first and stop and report if the head is not `0043`). Four statements `ALTER TYPE benchmarkindex ADD VALUE IF NOT EXISTS '<value>'` (one per new value, Postgres only, `if bind.dialect.name == "postgresql"`), done **outside a transaction block**: look at how migration `0006` and any later enum migration do it and follow the repo's pattern (`op.get_context().autocommit_block()` is the usual alembic way; if 0006 shows a different working pattern, use that and say so under Findings). SQLite stores the enum as plain VARCHAR (see `enum_column`), so no schema change there. `downgrade()` is a documented no-op (Postgres cannot drop enum values). Docstring style like the neighbouring migrations; no imports from `app.models`.
6. `backend/scripts/jobs/refresh_benchmark_daily.py` is **deliberately not edited**: it already loops over every member, so the first daily run after deploy backfills price (10 years) and TRI (from 1990) for the four new indices.

## Tests first (each seen RED first; say which)
- `backend/tests/services/analytics/test_benchmark.py` (add): `test_enum_has_eight_members_and_legacy_tuple_is_the_original_four_in_order` (also `ALL_BENCHMARK_INDICES` has eight and starts with the legacy four); `test_portfolio_vs_benchmarks_still_returns_exactly_the_legacy_four_rows` (use the file's existing fixtures; **also seed price and TRI history rows for the four new indices** so a loop over the full enum would show up, and assert `[row.index for row in summary.benchmarks] == list(LEGACY_BENCHMARK_INDICES)`); and the same assertion for the no-data early-return branch (`xirr=None` rows at about line 166).
- `backend/tests/services/analytics/test_nse_indices_client.py` (the existing `test_trading_index_name_covers_every_benchmark_index_enum_member` keeps passing, now with eight): add `test_new_indices_trading_names_are_the_verified_ones` asserting the four exact strings above; and one test that `_fetch_index_history` and `_fetch_tri_history` send `name` and `indexName` equal to the mapped string for a new index (patch `httpx.AsyncClient` as the neighbouring tests do; no network).
- `backend/tests/services/analytics/test_scenario_engine.py` (add): `test_scenario_benchmark_comparisons_ignore_new_indices`: seed TRI rows for all eight indices over the scenario window, assert only the four legacy `ScenarioBenchmarkResult` names come back.
- `backend/tests/scripts/test_background_jobs.py` (**existing test must change, say so**): the refresh-benchmark test hard-codes `fetches=8 succeeded=6` in the log assertion; with eight indices the job makes 16 fetches and (the fake fails only `NIFTY_500`, two fetches) 14 succeed, so the message becomes `fetches=16 succeeded=14 success=False`. It already derives the call count from `len(BenchmarkIndex) * 2`; keep that. This is the only existing assertion you may edit, and only for this reason.
- `backend/tests/test_migrations.py`: a test that `alembic heads` is `0045`, that upgrading a fresh SQLite database to head works and that `downgrade` to `0043` works (the downgrade is a no-op; follow the file's existing `_alembic(...)` helper style).
- `backend/tests/functional_postgres/test_benchmark_enum_0045.py` (new, `@pytest.mark.postgres` like its neighbours): after upgrading to head, a `BenchmarkIndexHistory` row can be inserted for each of the four new members, and re-running the upgrade is idempotent (`IF NOT EXISTS`). **This test cannot run on the laptop** (no Postgres); write it carefully, mirror the neighbouring files' fixtures, and report that it was collected but skipped. CI's `backend-postgres` job will run it.

## Test commands (run only these; no full suite)
Use the WSL venv (Python 3.14); `.venv-win` is incomplete on this laptop. From PowerShell:
```
wsl.exe -d Ubuntu --cd "D:\Unifolio code\backend" -- .venv/bin/python -m pytest tests/services/analytics/test_benchmark.py tests/services/analytics/test_nse_indices_client.py tests/services/analytics/test_scenario_engine.py tests/scripts/test_background_jobs.py tests/test_migrations.py -q -p no:cacheprovider --disable-warnings
```
Then, the same way, the neighbours that use what you changed: every file `git grep -l "BenchmarkIndex\|benchmark_comparisons\|nse_indices_client" -- tests` finds that is not already listed, and `tests/functional_postgres/test_benchmark_enum_0045.py` (expect skipped). Also run `git grep -n "in BenchmarkIndex" -- app scripts` at the end and report the output: the only hits left must be `scripts/jobs/refresh_benchmark_daily.py` and the definition of `ALL_BENCHMARK_INDICES`. In WSL itself: `cd backend` then `.venv/bin/python -m pytest <files> -q -p no:cacheprovider --disable-warnings`. Report every command and its last lines. If a run stalls or the sandbox blocks it, report BLOCKED with the exact error; do not edit configs.

## Constraints
No `float` anywhere. TDD: see each new test fail for the right reason first. Additive only, except the one assertion named above. **Allowed files:** `backend/app/models/enums.py`, `backend/app/services/analytics/nse_indices_client.py`, `backend/app/services/analytics/benchmark.py`, `backend/app/services/analytics/scenario_engine.py` (the one loop only), `backend/alembic/versions/0045_benchmark_index_new_members.py`, the test files named above (`tests/services/analytics/test_benchmark.py`, `test_nse_indices_client.py`, `test_scenario_engine.py`, `tests/scripts/test_background_jobs.py`, `tests/test_migrations.py`, `tests/functional_postgres/test_benchmark_enum_0045.py`), and this handoff's Report block. Touch nothing else (not the refresh job, not `valuation.py` or `stock_fundamentals_client.py`, which deliberately use only Nifty 50 and Nifty 500, not the schemas, not the frontend). No new dependency. Git is read-only (`status`, `diff`, `log`, `show`, `grep`, `ls-files`). LF endings, UTF-8 (check with `git diff --check` and `git ls-files --eol`). Match the surrounding code's comment density and naming.

## Review Focus (for the gate)
That no pre-existing loop over the benchmark enum can return a new index (the three places named, plus anything `git grep` finds that this handoff missed: report it, do not fix it outside the allowed files); the migration's chain and its out-of-transaction enum additions; the four trading names; and the changed daily-job assertion being the only existing assertion edited.

## Approaches considered and rejected
Putting the new indices behind a database flag (more moving parts for the same effect); a second name map for TRI (the live check shows the same names work for both); letting `compute_portfolio_vs_benchmarks` return eight rows and filtering in the frontend (it would change the stored `analytics_sections` payload, the PDF export and the mobile app's table for everyone); numbering the migration `0044` (reserved for the News plan, which does not exist yet: when it is built its migration must use `down_revision = "0045"` or whatever is the head then).

## Open questions
Anything the code shows that this handoff did not say goes under Findings; behaviour or interface questions under Open questions. Do not guess. If a shape cannot work with the real code, stop on that point and say why.

## Report (Codex fills this in at the end, in one fenced block)
```
CODEX REPORT — ui-redesign — MB1
Run date/time:    Environment:    Python:    Baseline HEAD:
1. TASK STATUS:
2. FILES:
3. TESTS (RED list, GREEN task runs, final fresh commands, the `git grep "in BenchmarkIndex"` output):
4. DEVIATIONS (mechanics only):
5. FINDINGS:
6. OPEN QUESTIONS / BLOCKERS:
7. SELF-REVIEW FINDINGS:
8. CONFIRMATIONS: No git write commands:  Full suites not run:  Edits only in the allowed files:
```
