# Individual Fund Page Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. TDD throughout (failing test, then minimal code). **No code starts until the owner says go.**

**Goal:** read-only FastAPI endpoints under `/fund-page/{scheme_id}` and pure service functions that give the Overview and Insights tabs of the per-fund page their data, built on existing tables and code, with no new table, job or package.

**Architecture:** one new router `app/api/fund_page.py` over a new package `app/services/fund_page/`. Three tiers: tier 1 (summary, from a scheme-filtered stored-price holdings read), tier 2 (single-fund NAV/TRI reads, risk, disclosure composition, manager; measured 10 to 19 ms together), tier 3 (category peers, score, insights; measured 2.0 to 4.5 s cold per fund, cached in process with a day key and single flight). The page never starts a recompute and never downloads prices live except one fund with no price in 3 days.

**Tech Stack:** FastAPI, SQLAlchemy sync `Session`, pydantic, pytest, `Decimal`. No new dependency.

**Spec:** `Docs/orchestration/2026-10-23-individual-fund-functionality-backend-spec.md` (section numbers cited as spec §n). Also: `...-individual-fund-backend-decisions-proposal.md` (BDF1-BDF14), `...-individual-fund-tdd.md`, `...-individual-fund-architecture.md`, and the two workbooks (`...-individual-fund-planning-decisions-v1.html` L1-L20, `...-individual-fund-design-mockups.html` S1-S14, M1-M11, all answered 23 Oct).

## Global Constraints

- `Decimal`, never `float`, for money, units, NAV and returns in anything that leaves the service layer. (The timing script used floats only for measuring; the product must not.) Serialise as strings.
- Prefix `/fund-page/{scheme_id}`; scope is the query parameter `scope=combined|<household_member_id>`; auth `get_active_user`; a member id goes through `require_member`; unknown scheme 404 (S4).
- No new table, migration, job or package (BDF12). No `analytics_sections` writes. No call to `compute_holdings` without `scheme_ids` (S1, S10).
- Prices: stored only; one live fetch only for a scheme with no NAV row within 3 days (`warm_nav_history` rule) (S10).
- Chart windows and chips: 1M, 3M, 6M, 1Y, 3Y, 5Y, All. Risk window 3 years ending at the latest NAV date; under 3 and at least 1 year: life window printed; under 1 year: `no_history` (S5).
- Risk-free rate: `settings.risk_free_rate`, default `Decimal("0.065")` (S6, placeholder). Sharpe = (3-year CAGR - rf) / annualised volatility. Volatility = sample std of daily returns times sqrt(252). Beta needs at least 120 shared dates.
- Equity-oriented only gets a benchmark, benchmark rows and beta: `asset_class_bucket(sebi_category) == "Equity"` (S9); the index is `_benchmark_index_for_category`.
- Risk bands (equity, starting values to calibrate on the synthetic set): volatility under 12 Low, 12 to 18 Moderate, over 18 High; drawdown shallower than -15 Low, -15 to -30 Moderate, deeper than -30 High; Sharpe under 0.5 Weak, 0.5 to 1.0 Fair, over 1.0 Good; beta up to 0.95 Lower risk, up to 1.05 Market-like, over 1.05 Higher risk. Other fund classes return the value with `band: null` until the owner supplies bands.
- Returns: up to 1 year absolute, over 1 year annualised (CAGR); NAV on or before the anchor date; a column longer than the history is `null`. Legend figures cumulative (S12). Since Inception uses the fund's own dates for the benchmark and peers that existed on the fund's first NAV date (S13).
- Peer set: `get_category_peers(db, sebi_category, plan_type)`. Category weights `scheme_aaum` fixed at today. Cache in process, key `(category, plan_type, day, kind, period)`, life 6 hours, single flight per key (S2). Scatter on daily 3-year returns (S14).
- Folio numbers: masked (last four characters) in the summary; the full number only from `GET /folios/{folio_id}/number` for a folio of the caller's household (S7).
- Sector per holding: `stock_master.sector` by ISIN, else `sector_raw` (S8). Market cap shares are of classified equity; the unclassified share is returned (A5 C).
- Insight text: fixed templates rendered on the server with evidence, no advice words (S3, L8). Smart Insights cards are the top three facts (L20, M11).
- No monthly added/removed endpoint, no churn fact (L13 dropped).
- Provisional budgets: tier 1 under 300 ms (estimate), tier 2 under 50 ms each, tier 3 first open of a category under 5 s.
- No live network in tests (`tests/offline_http.py`). Run only the test files a task touches.

## Review Focus

1. **CAS-only fund (no `amfi_code`) or a fund with no NAV rows:** every NAV-based endpoint returns `status: "no_history"`, never a 500 (tests in T4, T5, T6).
2. **Member who does not hold the fund:** `/summary` returns `held: false` with the other holders; fund-level endpoints still answer; never a 404 for the member (T3, T13).
3. **Fund younger than a window:** risk uses the printed life window at 1 to 3 years and `no_history` under 1 year; returns columns longer than the history are `null`; rolling windows longer than the history are omitted (T4, T5, T11).
4. **Category with one or two peers, or the AMFI list unavailable (`get_category_universe` returns `[]`):** peer endpoints return `peers_unavailable` or a thin flag and the other tiers are unaffected (T9, T10).
5. **Debt, hybrid, gold, index and other non-equity categories:** no benchmark line, row or beta; risk bands `null` where no bands exist; no equity index silently applied (T4, T5, T6).
6. **Midnight and concurrency:** two simultaneous cold opens compute once; a cache entry from yesterday is not served after midnight (T9).

---

## Branch and order

Branch `feat/individual-fund-page` from `leapswitch-redesign` (PR targets `leapswitch-redesign`). Order: T1 (now owned by Home T1; this plan only consumes it), T2 (skeleton), T3 to T8 (tiers 1 and 2, any order after T2), T9 to T11 (tier 3), T12 (insights), T13 (wiring and regression), T14 (staging measurement). No commit or push without the owner's word.

**Test command:** `cd backend && .venv/Scripts/python.exe -m pytest <files>` (Postgres-only behaviour in `tests/functional_postgres`).

**Existing code touched (flagged):** `app/services/dashboard/holdings.py` (T1), `app/services/dashboard/nav.py` (T1), `app/config.py` (T6), `app/main.py` one `include_router` line (T13). Nothing else.

---

### Task 1: `compute_holdings` scheme filter and stored-prices setting (S1, S10) — owned by the Home backend plan

**Changed 24 Oct (gap G3):** this task is now implemented once, as Home backend plan **T1**, with exactly the signature this plan needs: `async def compute_holdings(db, household_member_ids, *, scheme_ids: frozenset[uuid.UUID] | None = None, allow_stale_today: bool = False) -> list[HoldingRow]`, `peek_cached_holdings` and `invalidate_holdings_cache` with the same key shape. Its tests (`test_scheme_filter_returns_only_requested_schemes`, `test_filtered_and_unfiltered_cache_entries_do_not_collide`, `test_unfiltered_default_behaviour_unchanged`, `test_allow_stale_today_never_fetches`, `test_default_still_fetches_when_today_row_missing`) live there.

- [ ] **Step 1:** confirm Home T1 is merged on `leapswitch-redesign`; if not, stop and run it first (it is the first backend run of the whole effort).
- [ ] **Step 2: Smoke test** in `tests/services/fund_page/test_scope.py` or `test_holdings_usage.py`: `test_fund_page_calls_compute_holdings_with_scheme_filter_and_stored_prices` (patch `compute_holdings`, call the summary service, assert the keyword arguments `scheme_ids=frozenset({scheme.id})` and `allow_stale_today=True`). Expected after T3: PASS.
- [ ] **Step 3:** no commit here.

### Task 2: package skeleton, scope resolution, stored-section reader

**Files:**
- Create: `app/services/fund_page/__init__.py`, `schemas.py`, `scope.py`, `sections.py`; `app/api/fund_page.py` (router with prefix, no endpoints yet)
- Test: `tests/services/fund_page/test_scope.py`, `tests/api/test_fund_page_routes.py` (auth skeleton)

**Interfaces:**
- Produces: `@dataclass(frozen=True) class ScopeContext: member_ids: list[uuid.UUID]; scope_key: str; is_combined: bool`; `def resolve_scope(db: Session, user_id: uuid.UUID, scope: str) -> ScopeContext` (raises `HTTPException` 400 for a malformed scope, 404 via `require_member`); `def stored_section(db: Session, user_id: uuid.UUID, scope_key: str, name: str) -> dict | None` (reads `analytics_sections` and returns the section's own result, or `None` when the row is missing; for `combined` the stored payload is wrapped by the recompute's `wrap_combined`, so unwrap it with `_COMBINED_INNER_KEY = {"allocation": "allocation", "benchmark_funds": "comparison", "score": "score", "overlap": "overlap"}`; a member scope row is already the bare result); `class Status(str, Enum)` with `READY, UNAVAILABLE`; `class Unavailable(BaseModel): status: Literal["unavailable"] = "unavailable"; reason: str`.

- [ ] **Step 1: Failing tests:** `test_combined_resolves_all_members`, `test_member_scope_resolves_one_member`, `test_foreign_member_404`, `test_malformed_scope_400`, `test_stored_section_unwraps_combined_and_returns_member_payload_as_is`, `test_stored_section_missing_row_is_none`; route test `test_endpoints_require_session` (401 without a token on a stub `GET /fund-page/{id}/ping` registered only in the test).
- [ ] **Step 2: Run** the files. Expected: FAIL (modules missing).
- [ ] **Step 3: Implement** the signatures above. `scope_key` is `"combined"` or `str(member_id)` (canonical, same as `GET /analytics/{scope}`).
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(fund-page): scope resolution and stored section reader`.

### Task 3: summary, folios and share of portfolio (spec §3, S7, S11)

**Files:**
- Create: `app/services/fund_page/summary.py`, `folios.py`
- Modify: `app/api/fund_page.py` (two routes)
- Test: `tests/services/fund_page/test_summary.py`, `tests/api/test_fund_page_routes.py`

**Interfaces:**
- Consumes: `compute_holdings(..., scheme_ids=frozenset({scheme.id}), allow_stale_today=True)`, `peek_cached_holdings`, `stored_section`, `_latest_ter_for_scheme`, `xirr`, `_portfolio_xirr` and `_fund_level_transactions` from `analytics/benchmark.py`.
- Produces: `async def build_summary(db: Session, scheme: Scheme, ctx: ScopeContext) -> SummaryResponse`; `def mask_folio(folio_number: str) -> str` ("XXXXX" plus the last four letters or digits); `def full_folio_number(db: Session, user_id: uuid.UUID, folio_id: uuid.UUID) -> str` (404 for a folio outside the household). `SummaryResponse` fields per spec §3 including `held: bool`, `held_by_other_members: list[{id, name}]`, `nav_as_of: date | None`, `share_of_portfolio_pct: str | None`, `folios: list[{folio_id, member_name, folio_masked}]`.
- Routes: `GET /fund-page/{scheme_id}/summary?scope=` and `GET /fund-page/{scheme_id}/folios/{folio_id}/number`.

- [ ] **Step 1: Failing tests:** `test_combined_sums_members` (two members, units and invested add); `test_member_scope_single_member`; `test_not_held_in_scope_returns_held_false_with_other_holders` (Review Focus 2); `test_unknown_to_household_is_404`; `test_xirr_from_stored_benchmark_funds_section_else_computed`; `test_share_of_portfolio_fallback_chain` (warm cache wins, then stored `allocation` total, else `None`; assert `compute_holdings` is never called without `scheme_ids`); `test_first_and_last_investment_dates` (types from `_FUND_RELEVANT_TYPES`); `test_mask_folio_keeps_last_four`; `test_full_folio_only_for_own_household`; `test_cas_only_fund_has_no_history_flag`; `test_gain_matches_dashboard_row` (reconciliation with the holding row).
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** per spec §3. Share of portfolio = this scope's value over the total of `peek_cached_holdings(ctx.member_ids)` rows, else the stored `allocation` section's `total_value` (from `stored_section(..., "allocation")`, already unwrapped), else `None`.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(fund-page): summary and folio endpoints`.

### Task 4: performance series and benchmark selection (spec §5, S9, S12)

**Files:**
- Create: `app/services/fund_page/benchmark_select.py`, `performance.py`
- Test: `tests/services/fund_page/test_performance.py`

**Interfaces:**
- Produces: `def benchmark_for(scheme: Scheme) -> BenchmarkIndex | None` (None unless `asset_class_bucket(scheme.sebi_category) == "Equity"`); `PERIOD_DAYS: dict[str, int]` for 1M to All; `def period_series(db: Session, scheme: Scheme, period: str) -> PerformanceResponse` with `fund: list[Point]`, `benchmark: list[Point] | None`, `benchmark_index`, `period_returns: {fund, benchmark}` (cumulative, S12), `clamped: bool`, `status`. `Point = {date: date, pct: str}` rebased to 0 at the first point, at most about 250 points (daily to 1Y, weekly beyond).

- [ ] **Step 1: Failing tests:** `test_rebased_to_zero_at_start`; `test_fund_younger_than_period_clamps_and_flags`; `test_benchmark_uses_tri_rows_of_mapped_index`; `test_missing_tri_returns_fund_only`; `test_non_equity_has_no_benchmark` (hybrid and debt categories; Review Focus 5); `test_no_nav_rows_returns_no_history` (Review Focus 1); `test_downsample_keeps_first_and_last`; `test_cumulative_legend_equals_last_point`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** with Core `select` tuples (not ORM entities) for the NAV and TRI reads (BDF13).
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(fund-page): performance series`.

### Task 5: returns table, Inception and Current (spec §5, A1, S13)

**Files:**
- Create: `app/services/fund_page/returns.py`
- Test: `tests/services/fund_page/test_returns.py`

**Interfaces:**
- Consumes: `benchmark_for`, `xirr`, `_FUND_RELEVANT_TYPES` flows from `analytics/benchmark.py`, `compute_holdings` (scheme filter) for the opening value.
- Produces: `def inception_returns(db: Session, scheme: Scheme) -> InceptionReturns` (columns `1M 3M 6M 1Y 3Y 5Y since_inception`, rows `fund`, `benchmark | None`; category cells added by T9); `async def current_returns(db: Session, scheme: Scheme, ctx: ScopeContext) -> CurrentReturns` (columns `1Y 3Y 5Y since_first_investment`, rows `holding_xirr`, `benchmark_same_flows | None`; a column longer than the holding period is `None`).

- [ ] **Step 1: Failing tests (hand-computed series):** `test_up_to_one_year_absolute_over_one_year_annualised`; `test_column_longer_than_history_is_none` (Review Focus 3); `test_since_inception_benchmark_uses_fund_dates`; `test_current_lump_sum_matches_simple_annualised_return`; `test_current_sip_matches_xirr_of_flows`; `test_current_column_longer_than_holding_is_none`; `test_current_benchmark_replays_same_flows`; `test_non_equity_has_no_benchmark_row`; `test_no_history_status`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** Current mode: cash flows inside the window plus an opening flow of `units_at_window_start * NAV_at_start` (units from the lot replay up to the start) and the current value as the closing flow into `xirr()`; the benchmark replay invests the same flows in the index's TRI (windowed variant of `_benchmark_xirr_for_transactions`, written here, the existing function unchanged).
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(fund-page): returns tables`.

### Task 6: risk metrics and bands (spec §6, S5, S6)

**Files:**
- Modify: `app/config.py` (`risk_free_rate: Decimal = Decimal("0.065")`)
- Create: `app/services/fund_page/risk.py`, `risk_bands.py`
- Test: `tests/services/fund_page/test_risk.py`, `test_risk_bands.py`

**Interfaces:**
- Produces: `def compute_risk(db: Session, scheme: Scheme, today: date | None = None) -> RiskResponse` (`volatility`, `max_drawdown`, `sharpe`, `beta` each `{value: str, band: str | None, tone: str | None}`, plus `window_start`, `window_end`, `points`, `risk_free_rate`, `status`); `def band_for(metric: str, value: Decimal, fund_class: str) -> tuple[str, str] | None` (label and tone `pos|warn|neg|neu`).

- [ ] **Step 1: Failing tests (small fixed series):** `test_volatility_flat_series_is_zero`; `test_max_drawdown_single_crash`; `test_sharpe_uses_cagr_and_rate_from_settings` (monkeypatch the setting); `test_beta_perfectly_correlated_is_one`; `test_beta_inverse_is_minus_one`; `test_beta_none_below_120_shared_dates`; `test_no_beta_for_non_equity`; `test_under_one_year_no_history`; `test_one_to_three_years_prints_life_window` (Review Focus 3); `test_band_edges` (each equity edge value from Global Constraints falls in the stated band; other classes return `None`); `test_decimal_values` (strings, not floats). 
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** the formulas in Global Constraints; compute in `Decimal` (use `Decimal.sqrt()` for the square roots).
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(fund-page): risk metrics`.

### Task 7: composition and all holdings (spec §7, A5, A6, S8)

**Files:**
- Create: `app/services/fund_page/composition.py`
- Test: `tests/services/fund_page/test_composition.py`

**Interfaces:**
- Produces: `def build_composition(db: Session, scheme: Scheme, today: date | None = None) -> CompositionResponse` (`holdings_as_of`, `age_tag`, `stock_count`, `top10: list[{name, isin, sector, weight}]`, `allocation: {market_cap, sector, asset_type}`, `unclassified_pct`, `status`); `def all_holdings(db: Session, scheme: Scheme) -> HoldingsListResponse`.

- [ ] **Step 1: Failing tests:** `test_top10_equity_only_ordered_by_weight`; `test_stock_count_is_equity_rows`; `test_market_cap_shares_sum_to_100_of_classified_equity_and_unclassified_returned`; `test_sector_prefers_stock_master_then_sector_raw`; `test_asset_type_groups`; `test_no_written_batch_returns_no_disclosure`; `test_age_tag_when_batch_older_than_60_days`; `test_all_holdings_returns_every_row_sorted`; `test_uses_newest_written_batch_on_or_before_today` (a PENDING or future batch is ignored).
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** (equity rows are `EQUITY_DOMESTIC` and `EQUITY_INTERNATIONAL`; market cap by ISIN from the latest `market_cap_classifications.effective_date` on or before the batch date).
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(fund-page): composition and holdings`.

### Task 8: fund manager and stored-first score (spec §4, §8, B1)

**Files:**
- Create: `app/services/fund_page/manager.py`, `score.py`
- Test: `tests/services/fund_page/test_manager.py`, `test_score.py`

**Interfaces:**
- Produces: `def build_manager(db: Session, scheme: Scheme, today: date | None = None) -> ManagerResponse` (`managers: list[{name, role, managing_since, tenure_years}]`, `details_available: False`, `status`); `async def build_score(db: Session, scheme: Scheme, ctx: ScopeContext) -> ScoreResponse` (the existing `FundScoreRow` fields plus `source: "stored" | "computed"`, `computed_at`).

- [ ] **Step 1: Failing tests:** `test_manager_ordering_role_verbatim_and_tenure`; `test_manager_none_is_unavailable`; `test_latest_reference_period_only`; `test_score_uses_stored_section_when_present` (patch `compute_fund_score` to fail); `test_score_computes_when_section_missing` (`source == "computed"`); `test_score_thin_category_and_insufficient_history_pass_through`; `test_score_equals_analytics_endpoint_row` (reconciliation).
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** Stored score: find this scheme's row in `stored_section(..., "score")["funds"]` (the unwrapped `PortfolioScoreSummary`).
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(fund-page): manager and score`.

### Task 9: peer cache, category series and category returns (spec §9, S2, S13, A4)

**Files:**
- Create: `app/services/fund_page/peer_cache.py`, `peers.py`
- Test: `tests/services/fund_page/test_peer_cache.py`, `test_peers.py`

**Interfaces:**
- Produces: `class PeerCache` with `async def get_or_compute(self, key: tuple, compute: Callable[[], Awaitable[T]], ttl_seconds: int = 21600) -> T` (per-key `asyncio.Lock` single flight; entries carry the day, a different day misses; injectable clock); module singleton `peer_cache`. `async def category_series(db: Session, scheme: Scheme, period: str) -> CategorySeriesResponse` (AUM-weighted rebased average; daily up to 1Y, month-end beyond; `peers_used`, `thin_category`); `async def category_returns(db: Session, scheme: Scheme) -> CategoryReturnsResponse` (columns 1M to 5Y and `since_inception`, using peers that existed on the fund's first NAV date over the same dates for since inception).

- [ ] **Step 1: Failing tests:** `test_single_flight_computes_once_for_concurrent_callers` (`asyncio.gather` of five); `test_key_is_day_bound_midnight_misses` (fake clock across midnight; Review Focus 6); `test_entry_expires_after_ttl`; `test_category_average_is_aum_weighted`; `test_peer_without_start_date_is_dropped_and_counted`; `test_daily_up_to_one_year_month_end_beyond`; `test_since_inception_uses_peers_existing_on_launch`; `test_empty_peers_returns_peers_unavailable_and_no_exception` (Review Focus 4); `test_thin_category_flag`; `test_peers_computed_via_cache` (second call does not reread NAV).
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** Reuse `get_category_peers`, `_latest_aaum_by_scheme`, `_aum_weighted_average`, `_bulk_nav_on_or_before`; read peer NAV with one Core query for all peers (tuples) (BDF13).
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(fund-page): peer cache and category series`.

### Task 10: rolling returns and Period Returns buckets (spec §9, C1, C6 A)

**Files:**
- Modify: `app/services/fund_page/peers.py`
- Test: `tests/services/fund_page/test_peers_rolling.py`

**Interfaces:**
- Produces: `async def rolling_returns(db: Session, scheme: Scheme, window_years: int) -> RollingResponse` (windows 1, 3, 5; up to 10 years of month-end points for fund, benchmark, category; own `build_monthly_series_bulk` call over `month_end_dates(years_ago(today, 10), today)`; the scorer's 5-year call untouched); `async def period_returns(db: Session, scheme: Scheme, period: str) -> PeriodReturnsResponse` with `bucket: "week"|"month"|"quarter"|"year"` and `buckets: list[{label, fund, benchmark | None, category}]` (1M and 3M weekly, 6M and 1Y monthly, 3Y quarterly, 5Y and All yearly with the current year labelled year to date).

- [ ] **Step 1: Failing tests:** `test_rolling_window_longer_than_history_is_omitted`; `test_rolling_annualised_for_multi_year_windows`; `test_scorer_window_unchanged` (call `compute_fund_score` before and after, same score); `test_period_bucket_widths_per_chip` (parametrized over the seven chips); `test_current_year_is_labelled_ytd`; `test_buckets_cover_period_without_gaps`; `test_non_equity_has_no_benchmark_values`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** Cache each result via `peer_cache`.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(fund-page): rolling and period returns`.

### Task 11: risk-return scatter (S14)

**Files:**
- Modify: `app/services/fund_page/peers.py`
- Test: `tests/services/fund_page/test_peers_scatter.py`

**Interfaces:**
- Produces: `async def risk_return_scatter(db: Session, scheme: Scheme) -> ScatterResponse` (`points: list[{scheme_id, name, return_pct, volatility_pct, is_fund: bool}]`, `window_start`, `window_end`, `thin_category`; daily 3-year returns for every peer using the same formulas as `compute_risk`, shared helpers not copies).

- [ ] **Step 1: Failing tests:** `test_fund_point_equals_overview_risk_numbers` (same volatility to the digit as `compute_risk`); `test_peer_without_three_years_is_omitted`; `test_scatter_flags_exactly_one_fund`; `test_thin_category_flag`; `test_peers_unavailable`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** by extracting the return and volatility helpers from `risk.py` into a shared function used by both.
- [ ] **Step 4: Run.** Expected: PASS (plus `test_risk.py` still green).
- [ ] **Step 5: Commit** `feat(fund-page): risk-return scatter`.

### Task 12: insights engine and top-three cards (spec §10, C4, L20)

**Files:**
- Create: `app/services/fund_page/insights/__init__.py`, `rules.py`, `constants.py`, `templates.py`, `engine.py`
- Test: `tests/services/fund_page/test_insight_rules.py`, `test_insight_engine.py`

**Interfaces:**
- Produces: `@dataclass class Fact: id: str; list: Literal["key","strength","consideration"]; tone: Literal["pos","warn","neg","info","neu"]; text: str; evidence: list[tuple[str, str]]; priority: int`; `async def build_insights(db: Session, scheme: Scheme, ctx: ScopeContext) -> InsightsResponse` (`key`, `strengths`, `considerations`, `top_three`); each rule is `def rule_xxx(inputs: InsightInputs) -> Fact | None`; `class InsightInputs` bundles calendar-year returns (fund and category), TER and category TER, top 5 weight, sector weights, overlap pairs, 3 and 5-year returns and category averages, manager tenure, cap shares, volatility and category median.
- Thresholds in `constants.py` exactly as workbook section 11: TER gap 0.25 points; sector 25%; overlap shown from 30% and a consideration from 50%; tenure 5 years; cap spread each at least 15%; peer-beat years 4 or 5 strength, 2 or fewer consideration; top 5 wording at 40% and 25%; volatility 1 point above the category median.

- [ ] **Step 1: Failing tests:** one test per rule for fires, does not fire, and missing input returns `None` (Review Focus; never guessed); `test_templates_contain_no_banned_words` (scan every template for `buy`, `sell`, `should`, `recommend`, `good fund`, `experienced`); `test_evidence_numbers_appear_in_text`; `test_top_three_prefers_performance_overlap_management_then_next_priority`; `test_overlap_rule_uses_stored_overlap_section_for_scope`; `test_member_without_fund_skips_overlap_and_personal_facts`; `test_no_facts_returns_empty_lists_not_error`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** the rules, templates and engine; inputs gathered from the T8, T9, T10 and T7 functions (no new queries beyond reading the stored `overlap` section).
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(fund-page): insights engine`.

### Task 13: wire every endpoint, member checks, regression

**Files:**
- Modify: `app/api/fund_page.py` (all routes of spec §1), `app/main.py` (one `include_router`)
- Test: `tests/api/test_fund_page_routes.py`

**Interfaces:**
- Consumes: every function above. Routes exactly as the spec §1 table, `GET` only, `response_model` set from `schemas.py`, each `async def` and calling sync DB work through the existing session dependency (a plain `def` only where the route never awaits).

- [ ] **Step 1: Failing tests:** for each route `test_<route>_requires_session`, `test_<route>_unknown_scheme_404`; `test_member_not_in_household_404` on a scoped route; `test_not_held_scope_still_serves_fund_level_routes` (Review Focus 2); `test_unavailable_reasons_are_stable_strings` (`no_history`, `no_benchmark`, `no_disclosure`, `peers_unavailable`, `not_held`); `test_page_never_dispatches_recompute` (patch the dispatcher and `try_claim_recompute`, assert untouched across all routes); `test_no_route_calls_compute_holdings_without_scheme_ids`.
- [ ] **Step 2: Run** `pytest tests/api/test_fund_page_routes.py -v`. Expected: FAIL.
- [ ] **Step 3: Implement** the routes and the router registration.
- [ ] **Step 4: Run** this file, then every `tests/services/fund_page` file, then `tests/services/dashboard/test_holdings.py`, `test_nav.py`, `tests/api/test_dashboard_holdings_route.py`, `tests/api/test_analytics_route.py`, `tests/api/test_analytics_scorer_route.py` (regression). Expected: PASS.
- [ ] **Step 5: Commit** `feat(fund-page): router and endpoints`.

### Task 14: staging verification (not a unit test)

**Files:** none (uses `backend/scripts/measure_fund_page_staging.py`, committed 689ebb4).

- [ ] **Step 1:** Add `--scheme-filtered` mode to the script so tier 1 times `compute_holdings(..., scheme_ids=..., allow_stale_today=True)` and tier 3 times the new `peers.py` functions through `peer_cache` cold and warm. Test by importing the module (syntax and imports only).
- [ ] **Step 2:** Owner or manager runs it on the VM with `--include-score`; paste the output.
- [ ] **Step 3: Pass criteria:** tier 1 under 300 ms (estimate to confirm), each tier 2 call under 50 ms, tier 3 first open of a category under 5 s, second open of the same category under 300 ms. If tier 3 misses, apply BDF13 (lean month-end query chosen in SQL) before touching the cache design.
- [ ] **Step 4:** Check the V items: V5 (TRI for Largemidcap 250 and Midcap 150 on staging), V6 (account deletion leaves nothing; no new data stored), V7 (sector source on real batches).

---

## Documents that need the owner's approval before they change (not part of any task)

PRD-03 (per-fund view moves to this page when the redesign ships), PRD-04 and the TDD API list (new `/fund-page/...` surface), `decisions.md` (BDF1 to BDF14), `Database-Schema-Unifolio.md` (no change expected). Ask first.

## Self-review record

Spec coverage: §1 endpoints (T13), §2 shared rules (T1, T2, T13), §3 (T3), §4 (T8), §5 (T4, T5), §6 (T6), §7 (T7), §8 (T8), §9 (T9, T10, T11), §10 (T12), §11 no tables or jobs (Global Constraints, T13 test), §13 budgets (T14). L13 dropped, no task. Types: `ScopeContext`, `Unavailable`, `benchmark_for`, `peer_cache` are defined once (T2, T4, T9) and used by name later.
