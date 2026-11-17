# Batch A: Truth-Finding for the Numbers (A1 XIRR, A2 Rank Denominators, A3 Category Average and Excel) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Read `Docs/orchestration/wave-common-rules.md` first; it wins where it differs.

**Goal:** Prove the three stakeholder-facing numbers right or fix them: the XIRR (item 8), the rank "out of N" (item 10) and the category average with its Excel (item 9), and produce the evidence packs. A4 (load times) and GA4 are paused and not in this plan.

**Architecture:** One plan, three parts that share the pool code and the stored-result rebuild. **Part 1** (wave 1, read-only, ships nothing): fixtures, independent calculators and recount scripts on synthetic data. **Part 2** (wave 2): after the user approves each written fix proposal, one small fix task each, failing test first. **Part 3**: the export scripts for the reference workbook and the category-average Excel (built from the product's own functions), the two one-line Growth-only notes, and the evidence notes.

**Tech Stack:** Python 3.14, SQLAlchemy, pytest; the Excel library already used by `backend/scripts/export_ca_fund_metrics.py` (no new dependency); React only for two one-line notes.

**Specs:** `Docs/orchestration/2026-11-17-batch-a1-xirr-planning-workbook.html`, `...-batch-a2-rank-denominators-planning-workbook.html`, `...-batch-a3-category-average-excel-planning-workbook.html`; background `2026-11-13-batch-a-planning-workbook.html`. Program rules: `2026-11-17-program-execution-and-deployment-plan.html`.

## How this plan is used (read first)

- **Packets and handoffs are not written here.** The orchestrator writes each Codex handoff in detail when its task starts (question, facts to re-check, fixtures, do-not-touch, output file, report format, as in workbook A1 section 5).
- **Review gate, always.** No code that changes a number is written until the user has approved the written fix proposal. Each proposal has: root cause with evidence, proposed change, before and after on the same fixture, risk and reach, the failing test, and the user's decision (approve, change, reject), one proposal at a time. Part 1 and Part 3's export scripts change no number.
- **When fixes are approved**, the orchestrator adds one task per approved fix from the "Fix task template" at the end of this plan.
- **Wave-start check (run before XR-2):** confirm `backend/app/services/analytics/xirr.py` `xirr(cash_flows: list[tuple[date, Decimal]], guess: Decimal = Decimal("0.1")) -> Decimal | None` is unchanged; `dashboard/xirr.py` (`calculate_dashboard_xirr`, `portfolio_xirr`, `xirr_string`); `analytics/benchmark.py`; `analytics/benchmark_windows.py`; `fund_page/summary.py` and `returns.py`; `analytics/scheme_universe.py` (`canonical_category`, `is_index_fund`, `get_category_peers`); `analytics/category_ranking.py` (`load_category_pool`, `category_rank_row`, `category_period_weighted_averages`, `category_blended_weighted_average`); `analytics/performance_ranking.py`; the 16 Nov NAV fix commit `b231b6f4` is in the branch (`dashboard/held_nav_refresh.py`). Report drift before building.
- **Real-data rule:** any statement that a real number "is right or wrong" comes only from runs after the first clean unattended NAV run on 17 Nov, labelled with the time and how many funds had the day's price. Earlier runs are the labelled baseline.
- **Branch:** `batch/a-numbers`, cut from `leapswitch-redesign` at wave 1 start (it must include commit `c4434e15` or later). Part 1 ships nothing to staging; fixes ship in M2.
- **Builders:** Codex builds scripts, fixtures, tests, approved fixes (one task at a time). Claude runs the cross-checks against official references, writes proposals and notes, and verifies on real data. Antigravity is not used.

## Global Constraints

- The solver's results must not change: `test_xirr.py`, `test_xirr_fast.py`, `test_xirr_steep_declines.py` (backend) pass unchanged before and after every task.
- Old staging link untouched: all backend changes are additive; no field removed or renamed.
- `Decimal` only; no float in money, units, NAV, returns or weights. The XIRR convention stays actual days over 365 (same as Excel).
- Read-only on staging apart from a test household the user agrees; never run `clean-db`, restore, rollback or a deploy. Scripts print counts, times and lists of **public** schemes only; no household, folio, account or member data and no internal ids in any evidence file or Excel.
- Official public data only for rank verification: AMFI, SEBI, fund houses' own disclosures. No outside ranking or rating site is used, read, scraped or quoted.
- IDCW and dividend options are **not** in the rank pool or the average (decided 17 Nov); app text, the reference workbook and the Excel say so. Growth options only.
- The category card gets no "i", no popover and no date; the XIRR tile stays undated; the rank stays undated.
- Stored results (per-fund XIRR, rank, average) are rebuilt together in one pass during the staging deploy; no extra recompute run after the 10:30 or 14:00 price runs.
- Evidence files: working notes as `.md` in `Docs/orchestration/`; stakeholder pages as HTML or PDF; Excel files are downloads and are **not** committed (the scripts and their tests are). Nothing is sent or published without the user's written go.
- Paused: no speed work (A4), no analytics events (GA4). A4 later edits `dashboard/xirr.py`; this plan finishes there first.

## Review Focus

- A held fund with no price: today's dashboard drops its value but keeps its purchases (F1); the per-fund job raises on `Decimal(h.current_value)` of `None` (F2).
- The final flow dated by server `date.today()` around a weekend and around midnight IST with a UTC server clock (F3).
- Tile (live) vs holdings column (stored) for the same household and day (F3, F8).
- A pool with a peer whose price history failed to load, a duplicated base name, an IDCW series, a mis-named scheme, mixed end dates (F4, F7, F9, F12).
- A fund with no size on record, a category with fewer than 5 funds, a category where some funds have under 3 years of history (F11).
- Excel formulas recalculate to the product's own values in Excel and LibreOffice; no real id leaks.

## File Structure

| File | Responsibility |
|---|---|
| `backend/tests/services/analytics/xirr_reference/fixtures.py` (new) | 25 invented cash-flow sets with expected rates. |
| `backend/tests/services/analytics/xirr_reference/independent_xirr.py` (new) | Separate high-precision solver (different method from the app's). |
| `backend/tests/services/analytics/xirr_reference/test_xirr_reference.py` (new) | T8-1, T8-2, T8-3, T8-8, T8-9. |
| `backend/scripts/xirr_caller_audit.py` (new) | Prints every caller's input list side by side for one fixture household (counts, dates, signs only). |
| `backend/scripts/recount_category_pool.py` (new) | Independent AMFI recount and exclusion ledger per held category. |
| `backend/tests/services/analytics/test_recount_pool.py` (new) | Ledger equals the app's pool on a synthetic pool with deliberate gaps. |
| `backend/scripts/workbook_common.py` (new) | Shared workbook helpers (styles, formula cells, protection off, checks sheet), used by both exports and, later, the CA export. |
| `backend/scripts/export_rank_reference_workbook.py` (new) | Rank reference workbook (sheets: Read me, Summary, Funnel, Pool, Excluded, Cross-checks, End dates, Checks, Sources). |
| `backend/scripts/export_category_average_excel.py` (new) | Category average Excel (Contents, Read me, Summary, Pool, Weights audit, Sizes, Legacy figure, Excluded, Worked example, Checks, Glossary). |
| `backend/tests/scripts/test_export_*.py` (new) | Open the generated file, recalculate, compare every Summary cell with the product's result; no ids. |
| `frontend/src/features/mutual-funds/performance/` (rank rows) and `.../performance/` category card | One-line Growth-only notes and the "ranked as Growth" label (only after Part 2's verdicts). |

## Task list

Parts and IDs follow the workbooks (XR = XIRR, RK = rank, CA = category average).

| Task | What | Builder | Size | When |
|---|---|---|---|---|
| A-0 | Wave-start check; write the first handoffs | Claude | M | first |
| XR-2 | 25 fixtures, independent calculator, T8-1/2/3/8/9 | Codex | M | wave 1 (no prices) |
| RK-2 | Verification protocol and source list S1 to S6; confirm AMFI downloads for S2 and S3 | Claude | S | wave 1 |
| RK-3 | Independent AMFI recount script and ledger (incl. IDCW step) | Codex | M | wave 1 (no prices) |
| RK-9 | Rank reference workbook export script (synthetic first) | Codex | L | wave 1 to 2 |
| CA-6 | Category-average exporter and workbook (synthetic first) | Codex | L | wave 1 to 2, after RK-9's `workbook_common.py` |
| CA-3 | T9-1 to T9-7 on synthetic then real pools | Codex | M | synthetic wave 1; real after 17 Nov runs |
| XR-3 | Price and dating tests T8-4 to T8-7, T8-NAV | Codex | S | after first clean run |
| RK-4 | Reconcile ledger with the app's pool; returns spot check; T10-4/5/6 | Codex | M | after first clean run |
| RK-5 | Cross-checks against official references (T10-2, T10-7, T10-8, fund-house sample) | Claude | M | after RK-2, RK-3 |
| XR-4, RK-6, CA-4 | Root-cause notes and fix proposals FX-8a to FX-8e, FX-10a to FX-10d, FX-9a, for review | Claude | S each | after the tests |
| XR-5 | Short-period examples for the FX-8e decision | Claude | S | after XR-2 |
| A-FIX-n | One task per approved fix (template below) | Codex | S to M | wave 2, after approval |
| RK-8, CA-8 | The two one-line Growth-only notes and the held-IDCW "ranked as Growth" label, with tests | Codex | S | after RK-6, CA-2 |
| RK-10, CA-9 | Verify both workbooks on real data (formulas vs app; 10 funds by hand; dates; Read me) | Claude | M | after fixes |
| A-R | Adversarial review per handoff, then one whole-plan review (XR-7, RK-11, CA-10) | Codex, Claude | M | before M2 |
| A-N | Evidence notes and packs (XR-9, RK-13, CA-7, CA-11 handover) | Claude | M | after M2 passes |

M2 deploy notes (the guide is written at M2): one-time stored-result rebuild for all households; the list of user-visible numbers that change with before and after; the Excel is built after the deploy from deployed data.

---

## Part 1: Investigation (wave 1, read-only)

### Task XR-2: Fixtures, independent calculator, solver proof (T8-1, T8-2, T8-3, T8-8, T8-9)

**Files:** Create `backend/tests/services/analytics/xirr_reference/{__init__,fixtures,independent_xirr,test_xirr_reference}.py`, `backend/scripts/xirr_caller_audit.py`.

**Interfaces:**
- Consumes `xirr(cash_flows: list[tuple[date, Decimal]], guess: Decimal = Decimal("0.1")) -> Decimal | None` (`analytics/xirr.py`).
- Produces `FIXTURES: list[XirrFixture]` with `XirrFixture(name: str, flows: list[tuple[date, Decimal]], expected: Decimal | None, excel_value: Decimal | None)`; `independent_xirr(flows: list[tuple[date, Decimal]]) -> Decimal | None` (bisection or Brent with `decimal` precision 50, never reusing the app's solver).

- [ ] **Step 1: Write the tests.** `test_app_solver_matches_independent_for_all_25` (agree to 1e-6); `test_excel_convention_including_leap_year` (compare with stored `excel_value`s that the orchestrator computes by hand in Excel and writes into the fixtures); `test_no_money_in_or_out_returns_none`; `test_same_day_flows`; `test_steep_fall`; `test_under_a_year_is_not_silently_extreme_flagged` (T8-9 documents the value; decision FX-8e belongs to the user); `test_opening_balance_disclaimer_only_when_removing_piece_explains` (T8-8, using `calculate_dashboard_xirr` on a synthetic household built in the existing XIRR test style).
- [ ] **Step 2: Run** `cd backend && pytest tests/services/analytics/xirr_reference -v`. Expected: tests that need the new files FAIL (module missing).
- [ ] **Step 3: Implement** the 25 fixtures (single lump sum, monthly SIP, SIP with redemptions, negative return, under a year, steep fall, same-day, leap year, and the rest named in the handoff), the independent solver, and `xirr_caller_audit.py` (prints dates, signed amounts and the caller name for each of the five callers listed in workbook A1 section 3, for one invented household; counts and times only).
- [ ] **Step 4: Run** the new tests plus `pytest tests/services/analytics/test_xirr.py tests/services/analytics/test_xirr_fast.py tests/services/analytics/test_xirr_steep_declines.py`. Expected: PASS, existing tests untouched. Output file: the audit table, named in the handoff.

### Task RK-3: Independent recount and exclusion ledger

**Files:** Create `backend/scripts/recount_category_pool.py`, `backend/tests/services/analytics/test_recount_pool.py`.

**Interfaces:**
- Consumes `UniverseRow` parsing in `scheme_universe.py` (read only), AMFI `NAVAll.txt` text (a synthetic sample in the tests).
- Produces `recount_pool(rows: list[AmfiRow], category: str, plan: SchemePlanType, today: date) -> RecountResult` with `.steps: list[Step(name: str, remaining: int, set_aside: list[LedgerEntry])]` and `.final_pool: list[str]` (scheme codes); `LedgerEntry(scheme_code: str, name: str, reason: str)` with reasons exactly: `not_live`, `idcw`, `other_plan_type`, `second_option_of_fund`, `index_or_etf`, `no_history_for_period`, `closed_or_merged`. Written independently of the app's pool code (reads the AMFI file itself).

- [ ] **Step 1: Write failing tests** on a synthetic pool with deliberate gaps: `test_ledger_counts_each_step`; `test_idcw_series_set_aside_and_never_in_pool`; `test_peer_without_history_is_listed`; `test_duplicate_base_name_is_listed`; `test_mixed_end_dates_listed`; `test_mis_named_scheme_is_flagged`; `test_ledger_equals_app_pool_for_clean_synthetic_category` (compares with `get_category_peers` / `load_category_pool` on the same data).
- [ ] **Step 2: Run** `cd backend && pytest tests/services/analytics/test_recount_pool.py -v`. Expected: FAIL.
- [ ] **Step 3: Implement** the script (CLI: `--category`, `--plan`, `--out <file>`); prints counts and public scheme lists only.
- [ ] **Step 4: Run** the test file. Expected: PASS. Output: a ledger file per held category on real data is produced later, in RK-4, not here.

### Task RK-2 / RK-5 (Claude, no code)

- [ ] **Step 1:** Write the verification protocol and source list S1 to S6 (workbook A2 section 3 table) in `Docs/orchestration/` as `.md`; confirm which AMFI downloads carry category, option, launch and closure data (S2) and monthly category counts (S3). Mark any source that cannot be downloaded as "not done", never guessed.
- [ ] **Step 2:** After RK-3 and the first clean run, do the cross-checks T10-2, T10-7, T10-8 and a fund-house sample; place each difference in R1 to R12.

### Task CA-3: Category-average checks (T9-1 to T9-7)

**Files:** Create `backend/tests/services/analytics/test_category_average_checks.py`.

**Interfaces:** Consumes `category_period_weighted_averages`, `category_blended_weighted_average`, `_has_usable_size` and `load_category_pool` from `category_ranking.py`.

- [ ] **Step 1: Write the tests** (names): `test_weighted_average_matches_spreadsheet_for_three_categories` (large, thin, funds missing a size; expected values computed by hand in a spreadsheet by the orchestrator and typed into the test, 4 decimals); `test_three_year_floor_excludes_short_history_from_all_periods`; `test_missing_sizes_counted_but_unweighted_and_plain_fallback_flagged`; `test_thin_category_flag_under_five`; `test_legacy_blend_is_40_30_60_50_consistent`; `test_rank_pool_and_average_pool_same_funds_except_index_rule`; `test_no_idcw_in_any_average_pool` (the same assertion as RK-4's T10-6; one result serves both).
- [ ] **Step 2: Run** `cd backend && pytest tests/services/analytics/test_category_average_checks.py -v`. Expected: documents current behaviour; a failing test is a finding, not a bug to fix here (goes to CA-4's proposal).

### Task XR-3 / RK-4 (after the first clean unattended run)

- [ ] **Step 1 (XR-3):** Write and run T8-4 (no-NAV fund; today expected: silently understated), T8-5 (per-fund job with a no-NAV holding; today expected: raises), T8-6 (weekend and midnight dating with the server clock in UTC), T8-7 (tile vs stored column), T8-NAV (same household about 07:00 and in the evening), as tests in `backend/tests/services/analytics/xirr_reference/test_xirr_prices.py` using the existing synthetic household helpers. Expected today: T8-4, T8-5, T8-6, T8-7 FAIL (these are the findings F1 to F3).
- [ ] **Step 2 (RK-4):** Run the ledger on every real held category (read-only; output counts and public scheme lists), reconcile with the app's pool at every step, recompute returns for 5 funds per category from a second price source (the stored history), and run T10-4 (end dates), T10-5 (stored rank vs fresh evening computation), T10-6 (zero IDCW in pools). Label every result with the time and how many funds had the day's price.

### Task A-P: Fix proposals (Claude, no code)

- [ ] **Step 1:** For each finding write the review-gate proposal (six parts above). IDs: FX-8a (every held fund gets a value: stored price on or before today; retry the live source; latest stored price of any age marked stale; statement closing price; only a never-priced fund is left out, flows and value together), FX-8b (skip a no-value fund in the per-fund job), FX-8c (final flow dated with the price date), FX-8d (tile and column from the same inputs and price date), FX-8e (short-period figure: three options with real numbers), FX-10a (retry peer histories before a total is shown; correct base-name grouping; replace the 30-day rule only if the ledger shows it drops live funds), FX-10b (definition differences: user decides), FX-10c (one common end date for a pool), FX-10d (Growth-only pool; a fund with no Growth series is listed with that reason), FX-9a (anything CA-3 shows wrong).
- [ ] **Step 2:** Present them to the user one at a time. Record each decision in the proposal file. Only approved ones become A-FIX tasks.

## Part 3: Exports and notes (synthetic first, real after the fixes)

### Task RK-9: Rank reference workbook export script

**Files:** Create `backend/scripts/workbook_common.py`, `backend/scripts/export_rank_reference_workbook.py`, `backend/tests/scripts/test_export_rank_reference_workbook.py`.

**Interfaces:**
- Consumes `load_category_pool`, `category_rank_row`, `canonical_category` (read-only); the Excel library already imported by `export_ca_fund_metrics.py`.
- Produces `write_workbook(db: Session, out_path: Path, *, today: date, app_version: str) -> None`; `workbook_common`: `formula_cell(ws, ref: str, formula: str)`, `add_checks_sheet(wb, rows: list[CheckRow])`, `freeze_and_filter(ws)`.

- [ ] **Step 1: Write failing tests:** `test_every_summary_total_is_a_countifs_over_pool_and_equals_product_total` (open the generated file with LibreOffice headless recalculation or the library's formula evaluation, compare with `category_rank_row` totals for 1Y, 3Y, 5Y); `test_every_excluded_scheme_has_a_reason_from_the_allowed_list`; `test_every_pool_row_is_counted_in_summary`; `test_read_me_states_growth_only_and_dates`; `test_no_household_or_internal_ids_in_any_cell`; `test_runs_read_only` (no insert, update, delete, no price download).
- [ ] **Step 2: Run** `cd backend && pytest tests/scripts/test_export_rank_reference_workbook.py -v`. Expected: FAIL.
- [ ] **Step 3: Implement** sheets and columns as in workbook A2 section 5 (Read me, Summary, Funnel, Pool, Excluded, Cross-checks, End dates, Checks, Sources). Measure size and run time early; fallback is narrowing to the held categories (tell the user).
- [ ] **Step 4: Run** the test file. Expected: PASS on synthetic data.

### Task CA-6: Category-average Excel

**Files:** Create `backend/scripts/export_category_average_excel.py`, `backend/tests/scripts/test_export_category_average_excel.py`; reuse `workbook_common.py`.

**Interfaces:** Produces `write_workbook(db: Session, out_path: Path, *, today: date, app_version: str) -> None` with the eleven sheets and the formula shapes in workbook A3 section 3 (weight `=IF(H2="Y", F2/SUMIFS(F:F, A:A, A2, H:H, "Y"), 0)`, average `SUMPRODUCT` over counted funds, `=ROUND(D2 - I2, 4)` for the difference, formula cells pale green and value cells white).

- [ ] **Step 1: Write failing tests:** `test_summary_formulas_recalculate_to_app_value_to_4_decimals`; `test_weights_sum_to_100_percent_in_every_pool`; `test_excluded_sheet_lists_idcw_count_and_missing_sizes`; `test_sizes_older_than_45_days_flagged`; `test_legacy_figure_sheet_matches_blend`; `test_three_worked_examples_reproduce_card_numbers`; `test_no_ids_and_no_macros`; recalculation passes in Excel-compatible and LibreOffice evaluation.
- [ ] **Step 2: Run** the test file. Expected: FAIL.
- [ ] **Step 3: Implement** (Codex; the Read me and Glossary text are supplied by Claude in CA-7 as a text file the script reads).
- [ ] **Step 4: Run** the test file. Expected: PASS on synthetic data. The real-data build happens after M2 deploys, from deployed data.

### Task RK-8 / CA-8: Two one-line notes (frontend, after the verdicts)

**Files:** Modify the Performance tab rank rows and the category card component (find them in the wave-start check; they live under `frontend/src/features/mutual-funds/performance/` and the fund page returns card); tests next to them.

- [ ] **Step 1: Write failing tests:** `shows "Ranks compare Growth options only. IDCW (dividend) options are not counted." under the ranks`; `a held IDCW fund's row says "ranked as Growth"` (Q2 A); `the category card shows one Growth-only line under its existing sentence and no "i" and no date`.
- [ ] **Step 2: Run** `cd frontend && npx vitest run <the two test files>`. Expected: FAIL.
- [ ] **Step 3: Implement** the lines in the card's own small text; plain words; no other visible change.
- [ ] **Step 4: Run** the files, `npx tsc -b`, `npx oxlint <folders>`. Expected: PASS.

### Task A-N: Evidence notes (Claude)

- [ ] **Step 1:** XIRR evidence note (two pages: the method; the check table of 25 sets with our, independent and Excel values; what was fixed with before and after), rank note (method, summary table with verdict per category, what was fixed, how to recount one N), category-average one-page note leading with how to read the card. Invented households only; counts and times only; a last check before anything is sent. Nothing leaves without the user's go.

## Fix task template (the orchestrator instantiates one per approved fix)

**Files:** only the files named in the approved proposal (likely `dashboard/xirr.py`, `dashboard/holdings.py`, `dashboard/nav.py`, `analytics/benchmark.py`, `analytics/scheme_universe.py`, `analytics/category_ranking.py`, `analytics/performance_ranking.py`).

- [ ] **Step 1: Write the failing test** from the proposal's "test written first" (the fixture, the exact expected value before and after).
- [ ] **Step 2: Run** it. Expected: FAIL for the stated reason.
- [ ] **Step 3: Implement** the approved change only; `test_xirr*.py` and the existing ranking tests unchanged.
- [ ] **Step 4: Run** the new test, the XR-2/RK-3 suites and the existing tests of the touched module. Expected: PASS.
- [ ] **Step 5:** Fixture "after" value goes into the evidence note's before-and-after table.

## Self-Review notes

- Spec coverage: item 8 (XR-2 to XR-5, FX-8a to FX-8e, A-N), item 10 (RK-2 to RK-10, FX-10a to FX-10d, RK-8), item 9 (CA-3 to CA-9, FX-9a, CA-8), Excel and reference workbook (RK-9, CA-6), shared recompute and notes (M2 deploy notes).
- By design this plan does not pin fix code: a fix's content depends on a finding and on the user's approval (review gate).
- Packets and handoffs: not written here, by instruction.
