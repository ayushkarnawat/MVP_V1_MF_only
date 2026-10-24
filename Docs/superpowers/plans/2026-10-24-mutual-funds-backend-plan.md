# Mutual Funds Page Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task, through the Claude–Codex method of the `model-orchestration` skill. Steps use checkbox (`- [ ]`) syntax for tracking. TDD throughout (failing test, then minimal code). `Decimal`, never `float`, for every money, units, NAV and rate value. **No code starts until the owner says go.**

**Goal:** the additive backend the 7-tab Mutual Funds page and the Individual Fund Overlap tab need: four more benchmark indices, windowed (1Y / 3Y / 5Y / Since inception) benchmark XIRR stored beside the existing benchmark payload, `sebi_category` on the holdings rows, and the two Overlap-tab endpoints of the Individual Fund page.

**Architecture:** everything is additive so the old UI, the mobile app and the PDF export keep reading exactly what they read today (the redesign link and `ls-staging` share one backend). New enum members sit behind a *legacy index tuple* that every pre-existing code path keeps iterating. Windowed XIRR is a new module that preloads each index's TRI series once and reuses the existing `xirr()`. The Overlap-tab endpoints are two new routes in the Individual Fund plan's `fund_page` package, built on the existing disclosure scope and `compute_fund_pair_overlap`.

**Tech Stack:** FastAPI, SQLAlchemy 2, Alembic, Pydantic v2, pytest (SQLite in unit tests, Postgres in `tests/functional_postgres`), `httpx` (offline in tests).

**Spec:** `Docs/PRDs/PRD-06-Mutual-Funds-Page-Redesign.md`, `Docs/orchestration/2026-10-23-mutual-funds-page-design.md` (§3, §7.1, §7.5, §7.5.1, §11.2), `Docs/superpowers/specs/2026-10-24-mutual-funds-tdd-backend-flow.md` (§2, §6), `Docs/orchestration/2026-10-24-ui-redesign-execution-strategy.md` (gaps G3, G6). The mockups' "Data source mapping" tables are the contract for field names the frontend plan (`2026-10-24-mutual-funds-frontend-plan.md`) consumes.

**Branch:** `feat/mf-backend` cut from `leapswitch-redesign`; PR targets `leapswitch-redesign`. Order: BT1 → BT2 → BT3 → BT4 (strict), BT5 after the Individual Fund backend plan's T2 (`fund_page` skeleton) is on `leapswitch-redesign`. No commit or push without the orchestrator's instruction.

**Test commands:** `cd backend && .venv/Scripts/python.exe -m pytest <files>` (Postgres-only behaviour in `tests/functional_postgres`). No live network in tests. Run only the touched files per task; the full backend suite once at the end (T6).

## Global Constraints

- **Additive only (owner, 24 Oct).** No existing field, enum member, key or route is removed, renamed or reshaped; existing endpoints return byte-identical JSON for the existing keys. A new field on an existing Pydantic model must have a default so rows already stored in `analytics_sections` still validate.
- **Migrations:** latest is `0043`. This plan owns exactly **`0045`** (the benchmark enum values). `0044` belongs to the News plan. Run `alembic heads` first; if either number is taken, stop and tell the orchestrator.
- **This plan supersedes** Home backend plan **T3** (`nifty_smallcap_250`): that task is removed there and Home depends on BT1. It also does not duplicate Home T1 / Individual Fund T1 (`compute_holdings(scheme_ids, allow_stale_today)`): BT2 only reads a field, it never changes `compute_holdings`' signature.
- **Index set (owner-confirmed 23 Oct):** Nifty Next 50, Nifty Smallcap 250, Nifty 100, Nifty 200 added to the existing four. A non-NSE index (BSE Sensex) is out of scope.
- **Windows** are exactly `"1Y"`, `"3Y"`, `"5Y"`, `"SI"` (Since inception), matching `category_ranking`'s periods.
- **No change** to `_benchmark_index_for_category` (per-fund assigned benchmark stays one of the legacy four), the scorer, valuation, or `analytics_sections` keys. The matrix is stored *inside* the existing `benchmark` and `benchmark_funds` payloads (design.md §7.1), not as a 16th section.
- `Decimal` strings on the wire via `_xirr_str`; dates ISO.
- Mobile, auth, CAS import, and every `scripts/jobs/*` other than the one-line behaviour noted in BT1 are untouched.

## Review Focus

1. **A new enum member silently changes old output.** `compute_portfolio_vs_benchmarks` and `scenario_engine._scenario_benchmark_comparisons` both do `for index in BenchmarkIndex`; adding members would add four rows to the old Benchmark table and four extra bars to every scenario result. Expected: both keep exactly the legacy four. (BT1 test.)
2. **Not enough history for a window.** A household with 14 months of data asked for 3Y/5Y: expected `available: false`, no XIRR, no exception, and `SI` still computed. (BT3.)
3. **Index history missing or partly missing** for a new index (first deploy before the daily job has fetched it, or NSE fetch failure): that index's rows are `xirr: null`; other indices and the portfolio value are unaffected; nothing raises. (BT3, BT4.)
4. **Recompute cost.** 8 indices × 4 windows × (1 + n_members) scopes inside the single-worker recompute must not multiply DB round-trips per transaction: index levels are loaded once per index per call. Expected: query count independent of the number of transactions; synthetic large household finishes within the existing budget. (BT3 query-count test, BT4 timing gate.)
5. **Overlap endpoints with funds outside the matrix.** `overlap.matrix` keeps only the top 12 funds, but the Individual Fund page can be opened for any held fund: expected: top-overlap list covers *all* disclosed funds, and a fund with no disclosure returns a typed `unavailable` payload, not 500. (BT5.)
6. **Foreign member / scope** on the new routes: 404 exactly as the Individual Fund plan's `resolve_scope` does. (BT5.)

---

## File Structure

| File | Responsibility |
|---|---|
| `app/models/enums.py` (modify) | four new `BenchmarkIndex` members; `LEGACY_BENCHMARK_INDICES` tuple |
| `alembic/versions/0045_benchmark_index_new_members.py` (create) | `ALTER TYPE benchmarkindex ADD VALUE IF NOT EXISTS …` ×4, pattern of 0006 |
| `app/services/analytics/nse_indices_client.py` (modify) | four `_TRADING_INDEX_NAME` entries |
| `app/services/analytics/benchmark.py` (modify) | iterate `LEGACY_BENCHMARK_INDICES`; call the window engine |
| `app/services/analytics/benchmark_windows.py` (create) | `IndexLevels`, `window_start`, `compute_window_rows`, `compute_fund_window_rows` |
| `app/services/analytics/schemas.py` (modify) | `BenchmarkWindowRow`, `FundWindowXirr`, additive `windows` fields |
| `app/services/analytics/scenario_engine.py` (modify, one line) | iterate `LEGACY_BENCHMARK_INDICES` |
| `app/services/dashboard/schemas.py`, `holdings.py` (modify) | `HoldingRow.sebi_category` |
| `app/services/analytics/cap_allocation.py` (modify) | extract `classify_isins` helper (behaviour unchanged) |
| `app/services/fund_page/overlap.py` (create) | per-fund overlap and fund-vs-fund comparison |
| `app/api/fund_page.py` (modify) | two routes |
| `scripts/measure_benchmark_matrix.py` (create) | recompute-time gate |
| tests | `tests/services/analytics/test_benchmark_windows.py`, additions to `test_benchmark.py`, `test_nse_indices_client.py`, `test_scenario_engine*.py`, `tests/services/dashboard/test_holdings.py`, `tests/services/fund_page/test_overlap.py`, `tests/api/test_fund_page_overlap_routes.py`, `tests/functional_postgres/test_benchmark_enum_0045.py` |

---

### Task 1: Four new indices behind a legacy tuple, migration 0045 (BT1)

**Files:**
- Modify: `app/models/enums.py` (`BenchmarkIndex` at line ~134), `app/services/analytics/nse_indices_client.py:34-39`, `app/services/analytics/benchmark.py:166,174`, `app/services/analytics/scenario_engine.py:496`
- Create: `alembic/versions/0045_benchmark_index_new_members.py`
- Test: `tests/services/analytics/test_benchmark.py`, `test_nse_indices_client.py`, the existing scenario-engine test file that asserts benchmark comparisons, `tests/test_migrations.py`, `tests/functional_postgres/test_benchmark_enum_0045.py`

**Interfaces:**
- Produces: `BenchmarkIndex.NIFTY_NEXT_50 = "nifty_next_50"`, `NIFTY_SMALLCAP_250 = "nifty_smallcap_250"`, `NIFTY_100 = "nifty_100"`, `NIFTY_200 = "nifty_200"`; `LEGACY_BENCHMARK_INDICES: tuple[BenchmarkIndex, ...]` = the original four in their original order; `ALL_BENCHMARK_INDICES = tuple(BenchmarkIndex)`.

- [ ] **Step 1: Failing tests.**
  - `test_enum_has_eight_members_and_legacy_tuple_is_the_original_four_in_order`
  - `test_trading_name_map_covers_every_member` (every member of `BenchmarkIndex` has an entry)
  - `test_portfolio_vs_benchmarks_still_returns_exactly_the_legacy_four_rows` (`[r.index for r in summary.benchmarks] == list(LEGACY_BENCHMARK_INDICES)`)
  - `test_scenario_benchmark_comparisons_ignore_new_indices` (seed TRI rows for all eight, assert only the legacy four `ScenarioBenchmarkResult` names)
  - `test_refresh_benchmark_daily_fetches_all_eight_for_price_and_tri` (patch `ensure_index_history_fresh`, assert 16 calls)
  - migration: add `0045` to `tests/test_migrations.py`'s head/chain checks; `functional_postgres` test `test_new_enum_values_insertable` inserts a `BenchmarkIndexHistory` row per new member.
- [ ] **Step 2: Run** the files. Expected: FAIL.
- [ ] **Step 3: Verify the four NSE trading names live before hard-coding them.** From a machine that can reach `niftyindices.com` (the VM), POST the working `getHistoricaldatatabletoString` and `getTotalReturnIndexString` endpoints for each candidate name (`Docs/data-resources-reference.md`, NSE index discovery) and confirm a non-empty, date-range-correct response for **both** price and TRI. If the TRI endpoint needs a different name, add a second map `_TRADING_INDEX_NAME_TRI` rather than guessing. Record the verified strings in the task report. Do not merge unverified names.
- [ ] **Step 4: Implement** the enum members, `LEGACY_BENCHMARK_INDICES`, the name-map entries, migration `0045` (four `ALTER TYPE benchmarkindex ADD VALUE IF NOT EXISTS` statements, each outside a transaction block exactly like 0006's pattern; `downgrade` is a documented no-op because Postgres cannot drop enum values), and switch `benchmark.py:166,174` and `scenario_engine.py:496` to `LEGACY_BENCHMARK_INDICES`. `refresh_benchmark_daily.py` is deliberately unchanged: it already loops over every member, so the first daily run after deploy backfills price (10 y) and TRI (from 1990) for the new indices.
- [ ] **Step 5: Run** the files. Expected: PASS; `grep -rn "in BenchmarkIndex" app` shows only `refresh_benchmark_daily` and the legacy-tuple definition.
- [ ] **Step 6: Commit** `feat(benchmark): four new NSE indices behind a legacy tuple, migration 0045` (orchestrator, explicit paths).

### Task 2: `sebi_category` on `HoldingRow` (BT2)

**Files:**
- Modify: `app/services/dashboard/schemas.py:55` (`HoldingRow`), `app/services/dashboard/holdings.py` (where `HoldingRow(...)` is built)
- Test: `tests/services/dashboard/test_holdings.py`, `tests/api/` dashboard holdings route test

**Interfaces:**
- Produces: `HoldingRow.sebi_category: str | None = None` (last field, defaulted; JSON key `sebi_category`).

- [ ] **Step 1: Failing tests:** `test_holding_row_carries_sebi_category_from_scheme` (scheme with `sebi_category="Flexi Cap Fund"` → row value), `test_holding_row_sebi_category_none_when_scheme_has_none`, `test_existing_holding_fields_unchanged` (serialised row minus the new key equals the pre-change fixture), `test_cas_only_fund_without_master_row_has_none`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** by reading `Scheme.sebi_category` where the row is assembled (the scheme is already loaded for `amc_name`/`plan_type`; add no new query, no per-row `db.get`). Do not touch `compute_holdings`' signature or cache key.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(dashboard): sebi_category on HoldingRow`.

### Task 3: Windowed benchmark XIRR engine (BT3)

**Files:**
- Create: `app/services/analytics/benchmark_windows.py`
- Test: `tests/services/analytics/test_benchmark_windows.py`

**Interfaces:**
- Consumes: `xirr(cash_flows) -> Decimal | None`, `_signed_amount`, `_xirr_str`, `_investment_transactions`, `_fund_level_transactions` (all from `benchmark.py` / `xirr.py`), `get_snapshots(db, member_ids) -> list[SnapshotRow]` (`dashboard/snapshots.py`), `last_completed_month_end() -> date`, `BenchmarkIndexHistory` TRI rows.
- Produces:
  - `WINDOWS: tuple[str, ...] = ("1Y", "3Y", "5Y", "SI")`; `WINDOW_YEARS = {"1Y": 1, "3Y": 3, "5Y": 5, "SI": None}`
  - `def window_start(window: str, today: date) -> date | None` — month-end `N` years before `last_completed_month_end()`; `None` for `"SI"`
  - `class IndexLevels` with `@classmethod def load(cls, db, index: BenchmarkIndex, start: date, end: date) -> "IndexLevels"` (ONE query, TRI rows ordered by date) and `def on_or_before(self, d: date) -> Decimal | None` (bisect)
  - `async def compute_window_rows(db, member_ids: list[uuid.UUID], transactions: list[Transaction], today: date) -> list[BenchmarkWindowRow]` — one row per window; `indices` lists all eight indices in enum order
  - `async def compute_fund_window_rows(db, member_ids, scheme_id: str, fund_transactions: list[Transaction], index: BenchmarkIndex, today: date) -> list[FundWindowXirr]`

- [ ] **Step 1: Failing tests** (SQLite session as in `test_benchmark.py`; flat index series so the expected rates are exact):
  - `test_window_start_is_month_end_n_years_back` (today 2026-10-24 → 1Y = 2025-09-30, 3Y = 2023-09-30, 5Y = 2021-09-30; SI is None)
  - `test_si_window_equals_existing_since_inception_rates_for_legacy_four` (compare with `_benchmark_xirr_for_transactions` per legacy index, exact equality)
  - `test_one_year_window_uses_snapshot_value_at_window_start_as_opening_flow` (portfolio value 100 at 2025-09-30, one in-window purchase, terminal value known; assert `portfolio_xirr` equals `xirr` of the hand-built flows)
  - `test_benchmark_window_buys_index_units_with_opening_value_and_same_flows` (index doubles over the window → `index_xirr` equals the hand-computed rate)
  - `test_window_unavailable_when_no_snapshot_at_window_start` (`available is False`, `portfolio_xirr is None`, all `indices[*].xirr is None`, `start_date is None`)
  - `test_window_unavailable_when_snapshot_at_start_is_partial`
  - `test_missing_index_history_gives_null_for_that_index_only`
  - `test_index_levels_loaded_once_per_index` (count SQL statements via an engine event listener: constant in the number of transactions, 8 TRI loads + snapshot reads)
  - `test_fund_window_rows_use_fund_flows_and_the_assigned_index` (a fund held 4 years, 3Y window)
  - `test_no_float_anywhere` (all returned rates are `str` from `_xirr_str`)
- [ ] **Step 2: Run.** Expected: FAIL (module missing).
- [ ] **Step 3: Implement.** Window semantics, which the signatures do not determine: the portfolio window flow list is `[(start, -V0)]` + the in-window transactions (signed as today) + `[(today, V_now)]`, where `V0` = sum over members of `SnapshotRow.total_value` at the window-start month end and `V_now` is the same terminal value the since-inception calculation already uses. The index-side hypothetical buys `V0 / level(start)` units at the start and applies the in-window flows at index levels, ending at `units × level(today)`. A window is `available` only if every member that has data has a non-partial snapshot at the start month. `SI` reuses today's full-history flows unchanged. Fund-level windows follow the same rule using that fund's own flows and a per-fund start value from the same snapshot month detail (`get_month_detail` fund values), `None` when absent.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(benchmark): windowed XIRR engine for portfolio and per fund`.

### Task 4: Store the windows beside the existing benchmark payload; recompute gate (BT4)

**Files:**
- Modify: `app/services/analytics/schemas.py` (`PortfolioBenchmarkSummary` ~line 163, `FundBenchmarkRow` ~line 178), `app/services/analytics/benchmark.py` (`compute_portfolio_vs_benchmarks`, `compute_fund_vs_benchmark`)
- Create: `scripts/measure_benchmark_matrix.py`
- Test: `tests/services/analytics/test_benchmark.py`, `tests/services/analytics/test_recompute*.py` (stored-payload round trip)

**Interfaces:**
- Produces (Pydantic, all additive with defaults): `BenchmarkWindowRow(window: Literal["1Y","3Y","5Y","SI"], available: bool, start_date: date | None, portfolio_xirr: str | None, indices: list[IndexXirrRow])`; `FundWindowXirr(window: Literal["1Y","3Y","5Y","SI"], fund_xirr: str | None, benchmark_xirr: str | None)`; `PortfolioBenchmarkSummary.windows: list[BenchmarkWindowRow] = []`; `FundBenchmarkRow.windows: list[FundWindowXirr] = []`.

- [ ] **Step 1: Failing tests:** `test_summary_has_windows_for_all_four_in_order`; `test_existing_summary_keys_unchanged` (legacy `portfolio_xirr` and four `benchmarks` rows equal the pre-change values); `test_old_stored_payload_without_windows_still_validates` (parse a fixture JSON from before this change); `test_fund_rows_carry_windows_and_keep_benchmark_index_legacy`; `test_empty_household_returns_empty_windows`; `test_windows_survive_json_round_trip_through_analytics_sections` (upsert then read).
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** the two model fields and call the BT3 functions from the two compute functions (portfolio: all eight indices; funds: the fund's one legacy-mapped index). Failures inside the window engine degrade to an empty `windows` list with a logged warning, never to a failed section.
- [ ] **Step 4: Implement `scripts/measure_benchmark_matrix.py`**: builds the largest synthetic household from `Docs/CAS Files/synthetic/pdfs/` (path via `pdf_dir.py`), runs `compute_portfolio_vs_benchmarks` and `compute_fund_vs_benchmark` for combined + each member and prints per-call seconds and SQL statement counts. **Gate (pass criteria):** the benchmark section's added time is under 3 s per scope on staging Postgres and the whole household recompute stays inside the existing 15-minute stale ceiling with the worker container's memory cap unchanged. Failing the gate means vectorise further or reduce stored cells; report to the orchestrator, do not relax the gate.
- [ ] **Step 5: Run** the touched test files, then the recompute test file. Expected: PASS.
- [ ] **Step 6: Commit** `feat(benchmark): store windowed XIRR beside the benchmark payloads (additive)`.

### Task 5: Individual Fund Overlap-tab endpoints (BT5)

**Depends on:** Individual Fund backend plan T2 (`app/services/fund_page/` package, `ScopeContext`, `resolve_scope`) merged on `leapswitch-redesign`.

**Files:**
- Modify: `app/services/analytics/cap_allocation.py` (extract `classify_isins`), `app/api/fund_page.py`
- Create: `app/services/fund_page/overlap.py`
- Test: `tests/services/analytics/test_cap_allocation.py` (unchanged assertions must still pass), `tests/services/fund_page/test_overlap.py`, `tests/api/test_fund_page_overlap_routes.py`

**Interfaces:**
- Consumes: `get_disclosure_scope(db, member_ids) -> DisclosureScope` (`scope.selected`, `scope.raw_rows`, `scope.values`, `scope.schemes`, `scope.coverage`), `compute_fund_pair_overlap(rows_a, rows_b) -> OverlapResult`, `_stock_weights`, `resolve_scope(db, user_id, scope) -> ScopeContext`, `SchemeHolding.sector_raw`.
- Produces:
  - `def classify_isins(db: Session, isins: set[str], as_of: date | None) -> dict[str, MarketCapBucket]` in `cap_allocation.py`, used by `build_cap_allocation` (no behaviour change).
  - `class FundOverlapResponse(BaseModel)` — `status: Literal["ready"]`, `scheme_id`, `overlap_pct` (share of this fund's stock NAV also held by at least one other fund in scope), `common_stock_count`, `total_stock_count`, `distribution` (`unique_to_fund_pct`, `common_pct`, `unique_to_others_pct`), `common_holdings: list[{isin, name, sector, fund_weight, portfolio_weight, held_in_funds: list[{scheme_id, scheme_name}]}]` (no cap on length; the page shows 10 and expands), `by_sector: list[{sector, pct, stocks: list[{isin, name, weight}]}]`, `top_overlap_funds: list[{scheme_id, scheme_name, overlap_pct, common_stock_count}]` sorted descending over **all** disclosed funds in scope (not just the 12-fund matrix), `holdings_as_of`, `coverage`.
  - `class FundComparisonResponse(BaseModel)` — both funds' ids and names, `counts` (`unique_a`, `common`, `unique_b`), `impact` (₹ and % for common-both / unique-A / unique-B / other funds), `sector_comparison` (per sector: common, A, B weights), `common_holdings` (stock, sector, weight A, weight B, combined), `unique_holdings` (top 5 each), `market_cap` (per fund: Large / Mid / Small / Other percentage of equity), `holdings_as_of`.
  - `class OverlapUnavailable` reuses the Individual Fund plan's `Unavailable` (`reason`: `"no_disclosure"` or `"not_held"`).
  - Routes: `GET /fund-page/{scheme_id}/overlap?scope=<combined|member_id>` → `FundOverlapResponse | Unavailable`; `GET /fund-page/{scheme_id}/overlap/{other_scheme_id}?scope=…` → `FundComparisonResponse | Unavailable`.
  - Performance Comparison needs no backend: the frontend calls the Individual Fund `performance` endpoint for each fund.

- [ ] **Step 1: Failing tests** (seed a scope with three disclosed funds and one without disclosure; reuse `test_overlap.py`'s fixtures): `test_overlap_pct_matches_compute_fund_pair_overlap_semantics`; `test_distribution_sums_to_100`; `test_top_overlap_funds_cover_all_disclosed_funds_even_beyond_twelve` (14 funds); `test_by_sector_groups_by_sector_raw_and_puts_missing_sector_under_other`; `test_comparison_counts_and_impact_reconcile_to_portfolio_value`; `test_comparison_market_cap_uses_classification_as_of_holdings_date` and `test_classify_isins_matches_existing_cap_allocation_buckets`; `test_fund_without_disclosure_returns_unavailable_no_disclosure`; `test_fund_not_held_in_scope_returns_unavailable_not_held`; route tests: 401 without session, 404 foreign member (same as `resolve_scope`), 400 malformed scope, combined vs member payload differ when only one member holds the fund.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** `classify_isins` by lifting the `MarketCapClassification` query out of `build_cap_allocation` (same ordering and `effective_date <= as_of` rule), then `fund_page/overlap.py` over `get_disclosure_scope` (the scope is memoised per session, so both routes cost one scope build). Equity-only, stock-only weights, exactly as `_stock_weights` does; percentages are shares of net assets, as the portfolio overlap uses.
- [ ] **Step 4: Run** the four test files plus `test_cap_allocation.py` and `test_overlap.py`. Expected: PASS, existing assertions untouched.
- [ ] **Step 5: Commit** `feat(fund-page): overlap and fund-vs-fund comparison endpoints`.

### Task 6: Final verification and operations notes (BT6)

- [ ] **Step 1:** Backend suite: `cd backend && .venv/Scripts/python.exe -m pytest -q` (the one full run for this plan). Expected: all pass; report the exact counts.
- [ ] **Step 2: Old-UI invariance.** With the redesign backend running locally, call the five existing endpoints the old UI and mobile use for holdings and analytics (`GET /analytics/{scope}`, the dashboard holdings and allocation routes) against a seeded household and diff the JSON against the same call on `feat/leapswitch-staging`'s code: the only differences allowed are the new keys `sebi_category`, `windows`. Record the diff in the report.
- [ ] **Step 3: Operations checklist for the deploy guide** (written, not executed here): take a backup; apply `0045` (`alembic upgrade head`); run `refresh_benchmark_daily` once via `run-job.sh` to backfill the four new indices; run the household analytics recompute so stored `benchmark` / `benchmark_funds` payloads gain `windows`; smoke-check the *old* link's Analytics Benchmark section still shows four index rows.
- [ ] **Step 4: Docs batch (ask the owner first, show the diff):** `decisions.md` entry, `backend.md` entry, schema doc line for the enum values, TDD spec §2 status. Nothing is edited without approval.

## Self-review record

- **Spec coverage:** TDD §2.1 → BT2; §2.2 indices → BT1; §2.2.1 windowed XIRR → BT3; §2.2.2 precompute shape → BT4; §2.3 excluded funds → no backend (derivable from `OverlapSummary.coverage`; the frontend plan computes it; recorded here so nobody adds a field); §2.4 per-fund market cap → BT5; design.md §7.5.1 per-fund overlap, distribution, sector bars, top overlap funds, comparison tabs → BT5 (Performance Comparison via the Individual Fund plan's endpoint); key-insight sentences → frontend templates, no backend; §11.2 benchmark and window selection → BT1/BT3/BT4.
- **Types:** `LEGACY_BENCHMARK_INDICES`, `BenchmarkWindowRow`, `FundWindowXirr`, `FundOverlapResponse`, `FundComparisonResponse` are defined once and used by name in the frontend plan's types task.
- **Unresolved by design, decided by the implementer with the gate as arbiter:** vectorisation details inside BT3.
