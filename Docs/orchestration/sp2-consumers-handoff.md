# Handoff: sp2-consumers (attributes 06, 02, 13, 10, 15 + PDF, Sub-project 2 plan 2)
**Status:** IN_PROGRESS — engine complete (Runs 1–5 committed, last `e08dd2c`); Run 6 ready, 2026-10-14
**Parent plan:** `Docs/analytics/plans/2026-10-12-attributes-02-06-10-13-15-lookthrough-consumers-plan.md` (binding; read its **Revision 2026-10-13** block first: shared rules, order, decisions)
**Spec:** `Docs/analytics/2026-10-12-attributes-02-06-10-13-15-lookthrough-consumers-spec.md` · execution map: `Docs/analytics/artifacts/subproject2-execution/` (a06, a02, a13, a10, a15, overview)
**Engine handoff (read for data facts):** `Docs/orchestration/sp2-engine-handoff.md`
**Orchestrator:** Claude Code · **Worker:** Codex (manual relay, one run per prompt)

## How this works
Same loop as the engine (see the engine handoff): the user pastes a prompt, Codex implements test-first and prints the CODEX REPORT (template at the bottom), the user pastes it back, Claude re-runs the gate in WSL, reviews, commits **one commit per plan task** (Task 2 in two parts), never pushes. No staging between runs.

## Runs
| Run | Plan | What | Gate reviewer |
|---|---|---|---|
| **6** | Task 2 backend | `lookthrough.py` (shared table), `stock_holdings` section, schemas, `_SectionSpec` | Codex |
| 7 | Task 2 frontend | `CoverageBanner`, `StockHoldingsSection`, both views | Codex |
| 8 | Task 3 | A02 cap allocation (new table + migration + half-yearly job text) | Codex |
| 9 | Task 5 | A13 asset allocation (after 02) | Codex |
| 10 | Task 4 | A10 overlap | Codex |
| 11 | Task 6 data side | A15 `stock_master`, client, daily job text | Opus |
| 12 | Task 6 valuation + frontend | A15 section | Codex |
| 13 | Task 7 | PDF export (6 sections) | Codex |

## Real-data facts the plan was written before (binding adaptations)
The engine is built and was run live end to end (14,371 real schemes, 41 AMCs, ~400k holdings rows, in an in-memory DB). What the consumers will read:
1. `scheme_holdings.pct_to_nav` is stored in **percentage points** (`Numeric(6,3)`), already scaled per sheet by Parse (a source fraction 0.0567 is stored as 5.67). `market_value` is rupees. `asset_type` is one of the 8 enum values; **`DERIVATIVE` rows can carry negative weights, and `OTHER` rows exist**. Per Q13 they are **excluded from every consumer sum** (stock table, cap split, overlap, P/E universe) and **counted in the coverage note** (their combined share is reported, not hidden). The shared `LookthroughTable` therefore excludes `DERIVATIVE` and `OTHER` from `rows` and carries `excluded_share` (derivative and other) for the notes; asset allocation (Task 5) reads `scheme_holdings` directly and applies its own rule.
2. **Only `WRITTEN` batches are read.** `FAILED` and `AWAITING_MANUAL_UPLOAD` batches never reach a client. Per fund the newest `WRITTEN` batch with `as_of_date <=` the NAV date; a held scheme with none is uncovered.
3. **Plan variants:** every scheme row (Direct/Regular, Growth/IDCW) has its own batch with identical rows (`write_disclosure_batch` writes to every row of the family). Held `scheme_id`s from `compute_holdings` map straight to batches by `scheme_id`.
4. **Coverage reasons** come from the engine registry: `AMC_DISCLOSURE_RESOLVERS` (`portfolio_disclosure_resolvers.py`): a scheme with no `WRITTEN` batch is "not available from this AMC" when its AMC has no registry row, or is a `MANUAL` AMC with no batch ever; else "not published yet". Age tags use the entry's `cadence` (`half_yearly` Taurus; others monthly): older than 60 days → `older_than_60_days`, except a cadence-consistent batch → `on_cycle`.
5. Some funds legitimately have no ISINs (overnight/liquid): `NULL`-ISIN rows stay one row per originating fund (never merged across funds).
6. `compute_holdings(db, household_member_ids)` returns `HoldingRow` objects with `scheme_id: str`, `current_value: str | None`, one row per folio (several per scheme). `_SectionSpec(name, compute, wrap_combined)` lists live in `recompute.py` (`_SECTIONS`); model the new section on `fund_manager` / `investment_withdrawal` (see `tests/services/analytics/test_recompute_investment_withdrawal.py` and `test_recompute_fund_manager_section.py` for the test shape).

## Constraints (non-negotiable)
**Git read-only whitelist** (`status`, `diff`, `log`, `show`, `grep`, `ls-files`). **Never touch** `infra/` (except Runs 8 and 11, which add scheduler job text for their own jobs; `terraform fmt`/`validate` only, never apply), real CAS PDFs, `Docs/` (the plans and artifacts are Claude's), existing migrations. New migrations only in Runs 8 and 11, with the number read from `alembic heads` at build time. **Existing code is read only** except the additive lines the plan names (`_SECTIONS`, `schemas.py`, frontend `types.ts`/`AnalyticsView.tsx`/`MobileAnalyticsView.tsx`, `test_migrations.py` table list). Do not edit `allocation.py`, `holdings.py`, `amfi_factsheet_client.py`, `fund_manager_*`, or any engine module (`portfolio_disclosure_*`); import from them.
**Follow the plan literally**; mechanics deviations go under "Deviations", behaviour/interface questions under "Open questions". **Test-first. Run only named files plus every importer `git grep` finds.** Backend on Windows from `backend\`: `.venv\Scripts\python.exe -m pytest <files> -q`; frontend from `frontend\`: `npx vitest run <files>` and `npx tsc -b`. `Decimal` for money and weights (no float maths on displayed values); LF endings, UTF-8; no new dependencies.

## Run 6 — Task 2 backend (shared table + `stock_holdings` section)
Implement the consumer plan's **Task 2, backend part** exactly (its first backend tests through "Run (backend)" and the backend half of the wiring): the `scheme_values` helper; `compute_lookthrough_table(db, household_member_ids)` on the sync `Session`; the per-run memo on `db.info`; coverage by value with the two reasons and `hide_headlines` below `HEADLINE_MIN_COVERAGE = Decimal("0.50")`; age tags; the `LOOKTHROUGH_MAX_ROWS = 100` cap with `truncated` and `total_stock_count`; the equity-only stock-section builder; schemas (`StockHoldingsSummary`, `AggregateStockHoldingsResponse`); the `_SectionSpec("stock_holdings", …)` in `_SECTIONS`. Tests live in `tests/services/analytics/test_lookthrough.py` plus the recompute test pattern. Use synthetic `scheme_holdings` rows (the spec's Reliance 8%/6%/5% → 6.55% example exactly), and one test that builds a small table from a few **real fixture sheets** parsed with the engine's `parse_workbook` and written with `write_disclosure_batch` (so the shared table is proven on real parsed data, including a derivative-bearing arbitrage sheet and an ISIN-less overnight sheet). **Not in Run 6:** any frontend, `CoverageBanner`, other attributes, migrations.

## Open questions (Codex: flag back, don't guess)
- Any difference between the plan's `HoldingRow` assumptions and the code.
- How `excluded_share` should be worded in the coverage payload if the spec's field list differs.

## Run 7 — Task 2 frontend (+ one small backend schema addition) (2026-10-14; Run 6 committed `eeeaa20`)

Plan: Task 2, frontend part (`CoverageBanner`, `StockHoldingsSection`, `types.ts`, `AnalyticsView.tsx`, `MobileAnalyticsView.tsx`, tests) per the consumer plan's shared rule 5, spec §3 and the visual map `Docs/analytics/artifacts/2026-10-12-attributes-02-06-10-13-15-lookthrough-consumers-visual-map.html` section 02. Follow the existing section conventions exactly: read `InvestmentWithdrawalSection.tsx` and `FundManagerSection.tsx` (props `{data, isLoading}`, `Skeleton`, the `CARD` class, `formatIndianCurrency` from `@/lib/decimal`, `cn`, the `--color-*` tokens, curly apostrophes in copy) and `components/ui/charts/` (visx-based `BarChart`, `PieChart`; no new charting package).

**Backend payload as built (Run 6):** section name `stock_holdings`; combined-scope wrapper field is `stock_holdings` (so `AGGREGATE_FIELD.stock_holdings = "stock_holdings"`); `StockHoldingsSummary { rows[], nav_as_of, holdings_as_of, total_portfolio_value, coverage, truncated, total_stock_count, hide_headlines, excluded_share, non_equity_share }`; row `{ isin, instrument_name, sector_raw, asset_type, exposure_pct, exposure_value, contributing_funds[] }`; contribution `{ scheme_id, fund_weight_pct, stock_weight_pct, holdings_as_of, cadence, age_tag }`; coverage `{ covered_value_pct, not_published_yet[ids], not_available_from_amc[ids], missing_value_schemes[ids], funds[{scheme_id, holdings_as_of, cadence, age_tag}] }`. All numbers are `Decimal` serialised as strings; percentages are percentage points.

**Backend addition required (small, test-first, in Run 7):** the payload carries only `scheme_id`s, but the UI must name funds ("stacked by fund", "3 funds not covered"). Add `scheme_name: str` to `LookthroughFundAge` (so `FundContribution` inherits it) and make the three uncovered lists in `LookthroughCoverage` carry names (e.g. `list[CoverageFund { scheme_id, scheme_name }]`); resolve names from the `schemes` rows already loaded in `compute_lookthrough_table`. Update `test_lookthrough.py`/`test_recompute_stock_holdings_section.py` accordingly. No other backend change.

**UI scope:** (1) `CoverageBanner.tsx`, shared by all five sections later: "Based on N% of your portfolio" (one decimal), the two reasons listed separately with fund names ("not published yet" / "not available from this AMC"), the `older_than_60_days` and `on_cycle` tags (plain wording: "older than 60 days", "on its half-yearly cycle"), and the missing-value note. (2) `StockHoldingsSection.tsx`: heading "Overall stock holdings"; top 10 stacked by fund (each stock's bar split into its contributing funds, legend by fund name); a "View all" searchable table of the stored rows with `sector_raw` as a column; the note "Showing the top N of M stocks; your full portfolio is longer" when `truncated`; one line under the top 10 stating the non-equity share (`non_equity_share`) linking to attribute 13 (a plain anchor/placeholder for now; the section does not exist yet); the excluded share (`excluded_share`, derivative and other) mentioned in the coverage note. When `hide_headlines` is true, hide headline sentences (any "Top 10 stocks = X%" line) but still show the table and the banner. Empty/loading/failed states like the sibling sections. (3) `types.ts` (name in `ANALYTICS_SECTION_NAMES`, interfaces), `AnalyticsView.tsx` (`AGGREGATE_FIELD`, `unwrap`, the loading flag, JSX placement after the existing allocation block), `MobileAnalyticsView.tsx` (same, it keeps its own copy of the map). Tests: `StockHoldingsSection.test.tsx`, `CoverageBanner.test.tsx`, and extend `AnalyticsView.test.tsx`, `MobileAnalyticsView.test.tsx`, `useAnalyticsScope.test.ts` if they enumerate section names. Run `npx vitest run <those files>` and `npx tsc -b`.

**Not in Run 7:** PDF print (Task 7), other attributes, migrations. Report extras: screenshots are not possible, so list the rendered states you tested (loading, empty, partial coverage, truncated, hide_headlines, desktop and mobile).

## Run 8 — Task 3: Attribute 02, AMFI market-cap ingestion + Cap Allocation (2026-10-14; Run 7 committed `84185e4`)

Plan: consumer plan Task 3 in full (all checkboxes, backend then frontend), plus shared rules F7–F11 and Q3–Q7. Read the plan's Task 3 text and decisions Q20–Q22 first. Follow Run 6/7 conventions (`lookthrough.py` shared table, `_SectionSpec`, `CoverageBanner`, `AGGREGATE_FIELD`).

**Order inside the run:** (1) pypdfium2 proof on the real file, report the outcome; (2) enum/model/migration (`alembic heads` for the number; add to `test_alembic_upgrade_creates_all_tables`); (3) client + job + Terraform text (fmt/validate only, nothing applied); (4) aggregation + schemas + `_SectionSpec`; (5) frontend. Tests first for each.

**Verified URLs (Claude, 2026-10-14, HTTP 200 + application/pdf):**
- Six months ended 30 Jun 2026 (effective 2026-07-01): `https://portal.amfiindia.com/spages/AverageMarketCapitalization30Jun2026.pdf` (1.1 MB)
- Six months ended 31 Dec 2024 (effective 2025-01-01): `https://www.amfiindia.com/Themes/Theme1/downloads/AverageMarketCapitalizationoflistedcompaniesduringthesixmonthsended31Dec2024.pdf` (2.1 MB)
- NOT found (404 on every pattern tried on both hosts): 31 Dec 2025 and 30 Jun 2025. Find the real links yourself (AMFI's "categorization of stocks" page, search), and put every verified URL in a per-period table in the client. If a period still cannot be found, the client loads what it can, raises the alert line for the missing period, and the report says which. Do not guess URLs in production code and never write an empty table silently. Save one real PDF per found period under `backend/tests/fixtures/market_cap/` (small ones only; 1–2 MB is fine) for tests.

**Rules:** weights Decimal; ISIN is the key (no name matching); `effective_date` = day after the period ends; the join uses `holdings_as_of`, not today; Q21 no Nifty 500 strip; Q22 donut slice "Other / Unclassified" with two-way drill-down. LF/UTF-8. Run affected tests only (commands in the plan). No git write commands.

**Report extras:** list the periods actually loaded with row counts (expect ~5,400 per list, 3 category transitions at ranks 1/101/251), the pypdfium2 outcome, the migration number, and the rendered UI states tested.

## Run 9 — Task 5: Attribute 13, look-through asset allocation (2026-10-14; Run 8 committed `78400ff`)

Plan: consumer plan Task 5 in full, plus shared rules F7–F11, F13 and decisions Q26–Q27. Task 3 is done, so the equity outer ring reuses attribute 02's classification: call `compute_cap_allocation` / reuse its bucket logic from `cap_allocation.py`; do not re-implement the effective-date join. Reuse `get_lookthrough_table`'s memo for anything table-shaped.

**Careful, existing code:** the dashboard already has an `allocation` section built from `allocation.py` (declared asset class, not look-through). Do not change `allocation.py`, `AllocationSection.tsx` or the `allocation` section. The new section is named `asset_allocation`, with its own schema, `_SectionSpec`, wrapper field and component `AssetAllocationSection.tsx`; the UI placement and wording must make clear it is the look-through view.

**Design rulings (so you do not ask):**
- The shared `LookthroughTable.rows` already drops DERIVATIVE/OTHER and is grouped per instrument, so it is the wrong source for class sums. Read `scheme_holdings` per selected scheme batch grouped by `asset_type` (the plan's first Red test is exactly this), using the same selected-batch rule as `compute_lookthrough_table` (WRITTEN only, newest batch ≤ that scheme's NAV date). If you need the selection, factor it out of `lookthrough.py` into a small shared helper rather than copying it; Run 6/7 tests must stay green.
- NULL-ISIN cash lines (CBLO/TREPS, net receivables) SUM into their class. This is the opposite of attribute 06.
- Asset classes in the payload: equity (with the Large/Mid/Small/Other outer split), debt, gold, cash-like, plus a separate excluded/other note carried in coverage (`excluded_share`). Map the 8 `asset_type` values to those four classes explicitly in one constant and document any value that has no obvious class in the report.
- Percentages are of the covered portfolio value, using the same coverage-by-value logic and `HEADLINE_MIN_COVERAGE` hide rule as the other sections.
- Hedged-arbitrage toggle (Q26): the payload carries BOTH variants (`as_disclosed` and `arbitrage_as_cash`) so the frontend toggles without a request. A fund counts as arbitrage only if `schemes.sebi_category == "Arbitrage Fund"`; its whole covered value moves to cash-like. Equity Savings is unaffected.
- The equity ring's drill-down chains into attribute 02's buckets (and from there into stocks) through one shared path; do not build three drill-downs.

**Tests (named in the plan):** `tests/services/analytics/test_asset_allocation_lookthrough.py` with the 3-fund worked example 95/0/0/5, 65/30/0/5, 0/0/100/0 giving 76.5/9.0/10.0/4.5 exactly; NULL-ISIN cash sums; derivative/other excluded (arbitrage fixture with futures does not inflate equity); toggle; outer ring; plus `test_recompute.py`. Frontend: the new section test plus the three shared view tests and `tsc -b`. Run affected tests only.

**Not in Run 9:** PDF print (Task 7), other attributes, migrations (none expected; if you think one is needed, stop and ask), Terraform. No git write commands.

**Report extras:** the 8-value to 4-class map, the exact helper you factored out (if any), and UI states tested (loading, empty, partial coverage, hidden headlines, toggle on/off, both views).

## Run 10 — Task 4: Attribute 10, fund-pair overlap + concentration curve (2026-10-14; Run 9 committed `859cbd7`)

Plan: consumer plan Task 4 in full, plus shared rules F7–F11 and decisions Q23–Q25 (read them first). Spec §5 and the visual map section 04 for the UI. Section name `overlap`, wrapper field `overlap`, component `OverlapSection.tsx`, module `overlap.py`, tests `tests/services/analytics/test_overlap.py`.

**Reuse, do not re-implement:** Run 9 factored `get_disclosure_scope` (selected batches, raw rows, values, coverage) and `build_lookthrough_table` out of `lookthrough.py`. Use `get_disclosure_scope` for the per-scheme raw rows; use `get_lookthrough_table` (memoised) for the concentration curve. Do not change the engine, `allocation.py`, or the Run 6–9 section payloads.

**Design rulings (so you do not ask):**
- Overlap is computed on RAW per-scheme `pct_to_nav` of equity rows only (`EQUITY_DOMESTIC`, `EQUITY_INTERNATIONAL`), per ISIN, `min(weight_A, weight_B)` summed over common ISINs, as a percentage of each fund's net assets. Never use `LookthroughTable.exposure_pct` (the plan's regression test). Sum repeated lines of the same ISIN within a scheme first. NULL-ISIN rows never match across funds. REIT/InvIT rows are not equity here (Run 9 put them in "equity Other" for allocation only; overlap stays stock-only per Q23).
- Funds considered are only the scheme with a selected WRITTEN batch (covered funds). Uncovered funds are named through the existing `coverage` payload; they are not shown as zero overlap.
- One value per unordered pair; the matrix is symmetric, diagonal omitted or null (your choice, document it).
- Heatmap: top 12 covered funds by household value, labelled "top 12 funds by value". `pairs_above_low` is uncapped over ALL covered funds and carries the overlap %, both fund names and the common-stock list so a tap needs no second request. Common-stock list per pair: ISIN, name, both weights, sorted by the smaller weight, desc. For the 12-fund matrix cells include the common-stock list as well; if the payload gets large, cap each list at 20 stocks with a `common_total` count and say so in the report.
- Bands: `OVERLAP_BAND_LOW = 20`, `OVERLAP_BAND_HIGH = 40` as constants in `overlap.py`, carried in the payload as `bands: {low, high}`; the frontend must read them from the payload (no second copy).
- Concentration curve: from the complete shared table's equity rows, top-N cumulative `exposure_pct` for N = 5, 10, 20, 50 (and the full count if smaller); a separate code path from the heatmap. Headline sentence hidden when `hide_headlines`; the heatmap and banner still show.
- The UI states that a 70%-equity fund caps at 70% overlap, in plain words. A household with fewer than 2 covered funds shows an explicit "overlap needs at least two funds with published holdings" state, not an empty chart.

**Tests (named in the plan):** spec worked example (two funds, 42% across HDFC Bank/Reliance/ICICI Bank/Infosys/TCS + 11 others); equity-only (debt/cash/derivative common lines add nothing; 70%-equity cap); symmetry; 15 funds gives a 12-fund matrix and `pairs_above_low` still contains a pair outside the 12; concentration curve; `test_recompute.py` section wiring. Also one real-data test on committed fixtures if two real funds from the same AMC share holdings (list which in the report). Frontend: the new section test, the three shared view tests, `tsc -b`. Run affected tests only.

**Not in Run 10:** PDF print (Task 7), other attributes, migrations (none expected; stop and ask if you think one is needed), Terraform. No git write commands.

**Report extras:** payload size for a 15-fund household, the per-list cap decision, UI states tested (loading, empty, fewer than two funds, partial coverage, hidden headlines, 12-cap label, band colours, desktop and mobile).

## Run 11 — Task 6: Attribute 15, stock fundamentals ingestion + P/E, P/B (data side AND section) (2026-10-14; Run 10 committed `7da9da8`)

Opus review follows this run (external data, new table, new job). Plan: consumer plan Task 6 in full (all checkboxes, backend then frontend), shared rules F7–F11, F14–F16, decisions Q28–Q30. Read the sourcing evidence first: `Docs/analytics/investigations/2026-10-13-attribute-15-pe-pb-sourcing-feasibility.md` and spec §7. Section `valuation`, wrapper `valuation`, module `valuation.py`, client `stock_fundamentals_client.py`, job `scripts/jobs/refresh_stock_fundamentals_daily.py`, component `ValuationSection.tsx`.

**Verified endpoints (all returned HTTP 200 from AWS in the Task 0 egress check, `Docs/orchestration/sp2-egress/aws-result.txt`):**
- Per-stock P/E: `https://nsearchives.nseindia.com/content/equities/peDetail/PE_<DDMMYY>.csv` (use the `SYMBOL P/E` column; NOT `ADJUSTED P/E`). Published per trading day: when today's file is 404, step back day by day (max 7) and record the file's date as `as_of_date`.
- Symbol to ISIN: `https://nsearchives.nseindia.com/content/cm/NSE_CM_security_<DDMMYYYY>.csv.gz` (`TckrSymb`, `ISIN`; note the 8-digit date). Same step-back rule.
- Nifty lists: `https://archives.nseindia.com/content/indices/ind_nifty500list.csv` and `https://www.niftyindices.com/IndexConstituent/ind_nifty50list.csv` (columns Company Name, Industry, Symbol, Series, ISIN Code). Use Industry as `sector`.
- P/B: Yahoo `quoteSummary` via the plain-HTTP cookie+crumb handshake documented in the feasibility file (fc.yahoo.com cookie → quote page → getcrumb → quoteSummary `<SYMBOL>.NS`, modules `defaultKeyStatistics,summaryDetail`, field `priceToBook`). One handshake per run, one re-handshake on a 401. No headless browser, no proxies, no tricks beyond that documented handshake (standing rule).
- Fallback P/B: `https://www.screener.in/company/<SYMBOL>/consolidated/` server-rendered HTML, per failing ISIN only, never in parallel for all stocks. Polite pacing (about 0.3 s between requests) everywhere.
- Index-level figures: `POST https://www.niftyindices.com/BackPage/getpepbHistoricaldataDBtoString` (body shape in the feasibility file; names `NIFTY 50`, `NIFTY 500` from `nse_indices_client.py`'s `_TRADING_INDEX_NAME`). Check whether the server enforces the 1-year range; request only the last ~10 days.

**Ruling (user, 2026-10-14) — where index P/E and P/B are stored:** reuse `benchmark_index_history` by adding two `BenchmarkReturnType` values (`PE`, `PB`); its `value Numeric(12,2)` fits and no new table is created. Requirements: the enum is a DB enum/check, so the migration must extend it correctly on both SQLite and Postgres (look at how the existing migrations add enum values). BEFORE building, `git grep` every reader of `benchmark_index_history` / `BenchmarkReturnType` (benchmark section, TER, fund ranking, NAV/benchmark jobs, tests) and add a regression test proving PE/PB rows never leak into price/TRI queries or the benchmark section. Fetch these two index series inside the same daily job as `stock_master`, in its own try block so an index failure never blocks the stock refresh (and vice versa). If you find that leakage cannot be prevented without changing other sections, STOP and report; do not widen scope.

**Other design rulings (so you do not ask):**
- `stock_master`: `isin` PK, `name`, `sector`, `pe_ratio`, `pb_ratio`, `as_of_date`, `source` (always NSE for P/E), plus `pb_source` (`YAHOO`/`SCREENER`) and `footnote`. No foreign keys. Migration: next number via `alembic heads` (expected 0041), plus its migration test and the `creates_all_tables` entry; one migration may also carry the enum extension above.
- A failed fetch never overwrites a good existing row. Loss-making (blank/negative P/E) gives `pe_ratio NULL` with footnote; delisted/merged (ISIN absent from the security master) gives both NULL with footnote; no BSE fallback.
- ISIN universe each refresh: every distinct non-NULL ISIN in `scheme_holdings` (WRITTEN or not, as spec §7.3 says) plus Nifty 50 + 500 ISINs, de-duplicated.
- Portfolio ratio = weighted harmonic mean over EQUITY rows of the shared table only (`EQUITY_DOMESTIC`, `EQUITY_INTERNATIONAL`), re-scaled to the equity weights that have a ratio; separate calculation for P/E and P/B. `VALUATION_MIN_COVERAGE = Decimal("0.70")` of equity exposure by value, else "not enough data" plus the missing holdings and reasons. Also hidden when `hide_headlines`. Both index comparators (Nifty 50 and 500) in the same result. Source line under the chart: P/E from NSE, P/B from Yahoo (name the screener fallback in the footnote when used).
- Scheduler: `stock_fundamentals_daily` at 05:45 IST daily (cron form used by the neighbouring entries, memory 2048, Terraform text only, `fmt -check` and `validate` only, nothing applied). The test required by F16 compares the cron times: this job and `portfolio_disclosures_daily` before `analytics_recompute_daily`. NOTE the disclosure job already uses 05:45 (`cron(45 5 1-20 * ? *)`), so the two run in parallel; that is fine as long as both precede 06:30, and the report states their times.
- Job script exits non-zero when the stock refresh fails entirely (Run 8's job did not; do this one properly) and logs `PORTFOLIO_DISCLOSURE_ALERT`-style lines for partial failures.
- Tests may NOT call the live internet. Commit small real-sample fixtures (a few hundred rows of each CSV, one real Yahoo JSON, one screener HTML, one niftyindices response) under `backend/tests/fixtures/stock_fundamentals/`, and test each branch (a) to (d) of the fallback chain, the stale-crumb re-handshake, and pipeline independence from `disclosure_batches` exactly as the plan lists. Real-data check: parse the real fixtures, and, using the committed disclosure fixtures through `parse_workbook` and `write_disclosure_batch` as Run 10 did, compute a real portfolio P/E and P/B for one fund and report them.
- Then the frontend: `ValuationSection.tsx` per visual-map §06 with `CoverageBanner`, two bars (portfolio vs Nifty 50 and Nifty 500), a plain-language delta, the not-enough-data state with the missing list, the shared-rules-5 files, and `tsc -b`. Run affected tests only.

**Not in Run 11:** PDF print (Task 7), other attributes, `allocation.py`, engine modules, the existing benchmark section's behaviour. No git write commands.

**Report extras:** the migration number and how the enum extension was done; every reader of `benchmark_index_history` found and how leakage is blocked; the real portfolio P/E and P/B and index figures from the fixtures; how many of the real fixture ISINs resolved to a symbol and had a P/E; the cron times; any live request you made while building (list them, there should be few).

---

## Self-review (before printing the report)
1. `git diff --stat` / `git status --porcelain`: only this run's files; `git diff --cached --stat` empty.
2. Hostile review against the plan's Review Focus and the facts above: derivative/other rows excluded from `rows`; `FAILED`/`AWAITING` batches never read; newest `WRITTEN` batch ≤ NAV date; NULL-ISIN rows per fund; no float maths; the table built once per scope per run; the 100-row cap and `truncated`; coverage by value, not fund count; `hide_headlines` below 50%.
3. Fix what you find, re-run affected tests, list every finding.

## CODEX REPORT — template (one fenced code block, at the very end)
```
CODEX REPORT — sp2-consumers — Run <6..13>
Run date/time: <…>    Environment: Windows    Python: <version>    Baseline HEAD: <hash>

1. TASK STATUS
   Task <n>: DONE | PARTIAL | BLOCKED — <one line>
2. FILES (grouped by plan task)
   New (untracked): …   Staged (must be empty): …
3. TESTS (exact command + last 3 lines)
   RED: …   GREEN: …   Extra files via git grep: …
4. DEVIATIONS (mechanics only)
5. REAL-DATA FINDINGS (what the fixtures/real rows showed that the plan did not say)
6. OPEN QUESTIONS / BLOCKERS
7. SELF-REVIEW FINDINGS
   - [High/Med/Low] file:line — finding — FIXED | NOT FIXED (why)
8. CONFIRMATIONS
   - No git write commands: YES/NO   - Full suites not run: YES/NO
   - Engine modules / allocation.py / holdings.py unchanged: YES/NO
```

## Round log
| Round | Run | Result | Notes |
|---|---|---|---|
| — | Run 6 | ready 2026-10-14 | Task 2 backend. |
| 6 | Run 6 | built + committed 2026-10-14 (Codex, baseline `dbfb19c`) | Shared table, memo, coverage, age tags, equity-only section, schemas, `_SectionSpec`. Cap ruling: 100 applies to the stored section payload only; the shared table is complete (user ruling to Codex). Real-data test: Zerodha arbitrage (−68.87% derivatives, 12.88% OTHER excluded), Monarch overnight (ISIN-less cash kept), Union flexi cap; 117 shared rows, 108 stocks, stored 100, `truncated`. WSL 52+ passed. Commit `eeeaa20`. |
| — | Run 7 | ready 2026-10-14 | Task 2 frontend + scheme names in the payload. |
| 7 | Run 7 | built + committed 2026-10-14 (Codex) | Scheme names in payload (`CoverageFund`), CoverageBanner, StockHoldingsSection, views/types. WSL backend 45 passed, vitest 44 passed, tsc -b exit 0. Commit `84185e4`. |
| — | Run 8 | ready 2026-10-14 | Task 3 (A02). Only 2 of 4 AMFI list URLs verified; Codex finds the rest. |
| 8 | Run 8 | built + committed 2026-10-14 (Codex, baseline `6e28c66`) | Migration 0040, AMFI client (4 verified lists, 21,053 rows), job + cron text, cap_allocation section, frontend. WSL 35 passed. Claude review notes: new half-year needs a code edit (explicit URL table, alerts until added); job exits 0 even when a period fails; classification date uses oldest holdings_as_of across funds. Commit `78400ff`. |
| — | Run 9 | ready 2026-10-14 | Task 5 (A13). Depends on Run 8 (done). |
| 9 | Run 9 | built + committed 2026-10-14 (Codex, baseline `4745a50`) | `asset_allocation` section: both arbitrage variants in payload, shared helpers factored from lookthrough.py (`get_disclosure_scope`, `build_lookthrough_table`, `build_cap_allocation`), embedded CapAllocation drill-down. WSL 54 passed; Codex 121 backend / 147 frontend. Judgment call: REIT_INVIT counted as equity (outer Other). |
| — | Run 10 | ready 2026-10-14 | Task 4 (A10). Uses Run 9's shared scope helper. |
| 10 | Run 10 | built + committed 2026-10-14 (Codex, baseline `d2d72d7`) | `overlap` section: raw equity weights per ISIN, 12-fund matrix (one entry per unordered pair), uncapped pairs_above_low, 20-stock lists with common_total, bands in payload, concentration from shared table. Real HDFC Flexi Cap vs BSE 500 index: 40.31% across 70 ISINs. WSL 26 passed. Payload 344 KB for 15 funds (pairs stored in both matrix and above list). |
| — | Run 11 | ready 2026-10-14 | Task 6 (A15), data side and section. Index P/E,P/B stored in benchmark_index_history (user ruling). Opus review after. |
| 11 | Run 11 | built + Opus-reviewed + committed 2026-10-14 (Codex, baseline `a7c62b7`) | `stock_master`, migration 0041 (PE/PB on benchmark_index_history; PG16 upgrade/downgrade/upgrade verified by Claude), fundamentals client, daily job, `valuation` section. Real fund P/E 33.5x, P/B 4.37x (72.7% equity coverage). Opus found 7 issues, none High. FIXED by Claude: (1) a lagging fund NAV blanked all stock ratios, (3 partial) ISIN universe now equity-only, (5) index parser filters out-of-range rows, (6) httpx logging silenced. OPEN follow-ups (logged in DEFERRED_FEATURES): (2) `as_of_date` is bumped even when an old ratio is kept, (3) no time budget if Yahoo blocks the server (up to ~2k sequential screener calls, one commit at the end), (4) valid stocks in BE/BZ series treated as delisted, (7) job exits 0 when P/B fails for every stock; missing-holding reason can show the wrong ratio's footnote. |
| 12 | Run 12 | built by Claude (Codex quota used up) + independent Sonnet review, committed 2026-10-14 | Task 7 PDF export: 6 new `print-section` blocks, `printMode` on 6 components, payload fields optional/null-safe. 5 new tests RED then GREEN. Review: 0 High, 2 Med (cap drill-down and overlap details not printed; disabled 'view all' button) + 4 Low, all fixed. vitest 78 passed over 7 files, `tsc -b` clean. NOT done: the 15-second print-wait check on a large synthetic household (needs the headless browser). |

