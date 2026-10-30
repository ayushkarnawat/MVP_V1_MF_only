# Change Requests (13 items) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task, through the Claude–Codex method of the `model-orchestration` skill (Claude orchestrates, designs interfaces, verifies, commits and reviews; Codex is the default worker; one handoff document per task, written at the start of its run, **not in this plan**). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** build the 13 change requests of the October 2026 "Developer Change Requirements" PDF (plus the stakeholder answers of 29 to 31 Oct) on `leapswitch-redesign`: Head of Family, consolidated family holdings, market cap, fund manager, equity overlap, removal of Stock Concentration, fund-wise P/E and P/B, Performance Ranking, Category Average Comparison, hiding Fund Quality Scores, benchmark comparison from each fund's factsheet, the include-switches control, and the look-through asset allocation. Stopped SIPs and LinkedIn are **on hold** and not in this plan.

**Architecture:** additive first. New fields and tables are added, the new screens read them, one forced analytics recompute at the single staging deploy replaces stored rows, and old fields are removed in a later cleanup release. The new Mutual Funds pages are the only surface that changes (D12 option B); the PDF print view and the phone app keep their old layout, except that Stock Concentration is deleted from them. Seven runs, each one branch of tasks that share files, run one at a time; nothing is deployed between runs; staging happens once at the end.

**Tech Stack:** FastAPI, SQLAlchemy 2, Alembic, Pydantic v2, pytest (SQLite in unit tests, Postgres in `tests/functional_postgres`), `httpx` offline in tests, pypdfium2 for factsheets; React 19, Vite, Tailwind, vitest + Testing Library.

**Spec:** `Docs/orchestration/unifolio-change-briefing.html` (the single source of truth, except its migration map, which this plan supersedes: the 13 deep-dive cards, decisions D1 to D40 and Q1 to Q6, the Item 1 build, rules, methodology gaps, factsheet check, Step 0, execution playbook and audits A to F) and `Docs/orchestration/unifolio-change-briefing-handoff.md` (current state). Where this plan and the briefing disagree, stop and ask.

**Commits (decided 31 Oct):** all work is committed **directly on `leapswitch-redesign`** (the `wt/docs` worktree), run after run, with the message prefix `cr-r<N>:` and a local tag `cr-run-<N>-done` after each run's gate as a rollback point. There are no run branches and no integration branch. **Nothing is pushed** until the single staging step, when the owner gives an explicit go; until then no staging redeploy can pick up this work. If `origin/leapswitch-redesign` moves in the meantime (another session pushing), the orchestrator rebases the local commits onto it before the final push and never force-pushes.

**Test commands:** backend `cd backend && pytest <touched files>`; Postgres-only behaviour `pytest tests/functional_postgres/<file>` with `TEST_DATABASE_URL` set (`docker compose up postgres`); frontend `cd frontend && npx vitest run <touched files>`, plus `npm run build` (runs `tsc -b`) and `npm run lint` (oxlint) at the end of every run. No live network in tests. Run only the touched files per task; the full backend and frontend suites once per run, before its handoff doc may move to DONE.

## Global Constraints

Every task inherits these. Values are copied from the owner's decisions in the briefing.

- **Additive only within a run.** No existing stored field, enum member, key or route is removed or reshaped in this release; old stored rows must keep rendering until the forced recompute. Removal of old fields (Stock Concentration curve, `equity_outer`, rank and percentile fields) is a later cleanup release. A new field on a Pydantic model has a default.
- **Migrations, numbered in run order:** Alembic head today is `0046` (chain 0043, 0045, 0044, 0046). Run `alembic heads` at the start of each run; if a number below is taken, stop. Run 2 creates `0047` (`scheme_reported_valuation` and the `stock_master` columns) and `0048` (drops `scheme_rankings` and `ranking_weights`); Run 3 creates `0049` (index registry and `scheme_benchmark`); Run 5 creates `0050` (head of Family). This **supersedes the briefing's earlier map** (0047 head, 0048 LinkedIn, 0049 benchmark, 0050 valuation, 0051 drop); the docs run updates the briefing. LinkedIn is on hold and takes the next free number when it resumes.
- **Money and ratios are `Decimal`**, serialised as strings (`_xirr_str` style); the frontend formats and never adds money. Dates ISO.
- **Section keys do not change** in `analytics_sections`: `allocation, ter, ter_direct_regular, benchmark, benchmark_funds, category_ranking, ranking, score, investment_withdrawal, fund_manager, stock_holdings, valuation, overlap, asset_allocation, cap_allocation`. Home, the fund page and the Insights engine read stored sections; the `ranking` key is reused for Performance Ranking.
- **Fund Quality Score keeps being computed** (D32); only its group is hidden on Other Analytics. The blended 3Y/5Y return stays as an internal helper for it.
- **Equity rule (D14):** category allowlist (SEBI Equity Schemes incl. ELSS, equity index funds and ETFs, Aggressive Hybrid) plus the 65% domestic-equity definition; arbitrage, debt, liquid, gold and international are excluded; the hybrids and index funds that the category list cannot decide (about 18 funds on staging) are decided by the 65% data rule on their latest published portfolio, now that the S7 counts are in.
- **Main manager (D7 A, D38 A):** the main manager gets the whole fund value; none marked means the first listed, recorded as assumed. No LinkedIn work.
- **Portfolio P/E uses one basis (D39 B):** a forward factsheet P/E is replaced by the computed trailing value in the portfolio total only; the fund table shows the printed figure with its basis.
- **Benchmarks (D34 C with B fallback):** each fund uses the benchmark in its own factsheet; fallback is the fixed mapping (Large Cap to Nifty 100, Small Cap to Nifty Smallcap 250, index funds to the index they track, non-equity funds none), always labelled. BSE benchmarks show a labelled NSE proxy; blends are built from components with a stated rule or shown as "not available"; derived returns only, never raw index levels.
- **Head of Family:** same `users` row, same user id; Self moves to the new head in the same transaction, `is_head` mirrors it; four codes (email and phone, both people), phone codes use the existing stub and the test code is shown; ten-minute window; one open request per account; 24-hour undo; both heads need an email, a phone and (for the new head) a PAN with no conflict.
- **UI rules:** brand green `#22C55E` with white text through the shared `Button`; fund logos through `SchemeLogo` wherever a fund or fund house is named; one heading per card (the group heading is the name, the card heading differs); banners say what the number means in one plain sentence, then the answer.
- **Untouched:** SIP logic, LinkedIn, the Individual Fund page's score card and manager team block, auth sign-in flows other than the new purpose column, CAS import, every job other than the factsheet job's added readers.
- **Print view and phone app:** unchanged (D12 option B), except Stock Concentration is deleted from them.
- **Stock Concentration (item 6):** removed from every screen in Run 1; the backend curve (`compute_concentration`, `ConcentrationPoint`, `total_stock_count`) stays until the cleanup release, after a test confirms nothing reads it.
- **No deploy and no push between runs.** Commits stay local; staging is one deploy at the end, with migrations, a forced recompute and the timing scripts.

## Review Focus

Failure modes the spec implies that no single task's tests would otherwise exercise, most likely first. Each is pinned by a test in the task named.

1. **Old stored payloads after the deploy.** Every changed screen must render a payload that has only the previous shape (no new fields) as an "updating" state, never a crash or a blank. (Pinned in every frontend task: a test that feeds the previous fixture.)
2. **A category or fund with too little to compare.** A category with no funds or one fund (overlap, T1.4), a fund younger than the period (ranking T2.5, category average T2.7), an index fund (ranking T2.5), a fund with no manager data (T1.3): each shows its defined message, no exception, no divide by zero.
3. **A benchmark that is missing, a proxy, a blend or a price-only index.** Never an unlabelled or wrong number (T3.2, T3.3): an index with no history gives `xirr: null` for that row only; a proxy says proxy; a blend never silently becomes one index.
4. **Head change atomicity and collisions.** A failure at any point rolls back everything; a Google identity cannot sign in afterwards; an email or phone taken in the meantime blocks both the change and the undo; two open requests are impossible; a login code cannot confirm a change and the reverse (T5.4, T5.5, T5.6, on Postgres as well as SQLite).
5. **Totals that must still add up.** Consolidated rows equal the sum of their members to the paisa, and average price is cost over units (T4.1); manager totals never exceed the portfolio value (T1.3); the five asset classes and the three market-cap slices each add to exactly 100 (T1.1, T1.2); Home's allocation donut and benchmark pick still work on the changed sections (T1.1, T1.2).

## Method: the Claude–Codex loop (as used for Sub-projects 1 and 2 and the analytics fixes)

1. **Roles.** Claude (orchestrator): all interface design, migrations, the handoff documents, verification, commits, merges, reviews and the documentation update. Codex (`codex:codex-rescue`, default worker): implements one handoff's tasks and self-checks. A genuine Claude subagent is a fallback only under the three conditions in `references/delegation-rules.md`. Opus only on the three named triggers in `references/escalation-triggers.md`, and only after asking.
2. **Per run, before any dispatch:** (a) record the starting commit on `leapswitch-redesign`; (b) because the repo lives on a Windows drive mounted in WSL, **clone `leapswitch-redesign` at that commit into a fresh directory on the native filesystem** (`git clone --branch leapswitch-redesign file://<repo> ~/cr-run-N`, then a throwaway branch `codex/cr-run-N`) and dispatch Codex there; the orchestrator copies the verified changes back into the `wt/docs` worktree and commits them on `leapswitch-redesign`; (c) run the **cheap probe first**: one dispatch to write a one-line file, `git add` it, `git commit` it, expecting that Git writes fail in this environment, in which case Codex implements and self-checks and **the orchestrator does every staging, commit and merge**; (d) provision `backend/.venv` and `frontend/node_modules` inside the clone only after the probe passes, otherwise the orchestrator runs all verification from the real checkout.
3. **Per task: the standard cycle.** Step 1 failing tests (named and with assertions, written first); Step 2 run them and confirm they fail for the stated reason; Step 3 implement the stated signatures; Step 4 run the task's test files and confirm they pass; Step 5 the orchestrator verifies the diff (`git diff --stat`, reads the changed files, re-runs touched-area tests) and commits. A task below lists its Step 1 tests, its Step 3 signatures and its verify command; Steps 2, 4 and 5 are the standard cycle.
4. **Handoff documents.** One per task or per group of tasks that share files, at `Docs/orchestration/<slug>-handoff.md`, written by Claude at the start of the run from this plan (slugs are listed per run). Each states scope, files, interfaces, tests, constraints and the reasoning behind them; the Codex prompt refers to the handoff by path. Status moves OPEN, IN REVIEW, DONE. One line per decision goes in `Docs/orchestration/delegation-log.md`.
5. **Parallel dispatch** only for tasks that share no files (stated per run). Otherwise sequential.
6. **Mandatory review gate before a handoff may be DONE:** `/codex:adversarial-review` against the run's commit range (`<start commit>..HEAD`), dispatched through `codex:codex-rescue` with `run_in_background: true`, never `isolation: "worktree"`. The wrapper is forwarder-only: **the human must type `/codex:status <id>` and `/codex:result <id>` and relay the output**; tell the owner this when each review is dispatched. Findings are never auto-applied. A review verdict that contradicts a direct read of the cited lines is re-dispatched, not acted on. Fixes may be made by the orchestrator directly only under the "Review-loop fix authorship" criteria, followed by a scoped re-review. Stop after a round whose remaining findings are lower severity, correctness-safe and would need a bigger primitive: recommend accepting them as documented limitations.
7. **Verification tiering:** intermediate rounds re-run only the touched-area test files; the round expected to reach DONE, and any round touching shared code beyond the task's own files, gets the full backend and frontend suites.
8. **Where a deeper check is wanted** (Run 4 money maths, Run 5 sign-in and data safety): a second, scoped adversarial-review round after fixes and an orchestrator hand check of every figure; **Opus is requested only if a trigger fires**, and then only with the owner's approval. (The briefing's earlier phrase "Opus review" means this approval-gated option, not a default.)
9. **Run-level gates, in order:** touched-file tests; full suites; `npm run build` and `npm run lint`; old-payload tests; the section-list tests; for Runs 3, 4 and 5 the synthetic statement gates (`portfolio_synthetic_gate.py`, `fund_synthetic_gate.py`, `home_synthetic_gate.py`, synthetic CAS in `Docs/CAS Files/synthetic/pdfs`, password `MF@123`); for Run 5 and any new unique rule the Postgres functional tests; migration up, down and up on Postgres; the timing scripts for Runs 2 to 4 against the Step 0 baseline (no script more than 10% slower).

## Gates from Step 0 (VM session of 30 Oct and enquiries)

The plan never waits on these to be written; each blocks only the task named. The first VM session (30 Oct, two sessions from the manager's laptop) settled G1, G3, G4 and most of G7; the briefing's Step 0 section holds the raw results.

| Gate | Status | Result | Blocks | If it is late |
|---|---|---|---|---|
| G1 category counts | **Received** | 32 categories held; about 81 funds in SEBI Equity categories (two stored spellings); about 8 hybrids (Multi Asset 4, Balanced Advantage 2, Equity Savings 1, Children's Fund 1) and 10 index funds go to the 65% data rule | settled in T1.4 | none |
| G2 recompute and baselines | **Partly received** | All-users recompute 6 min 10.9 s, no failure. Month detail 243 to 261 ms; fund page 74 to 107 ms per call (over the 50 ms budget, already known and accepted below 100 ms). Home and benchmark matrix **not measured**: today's NAV was not stored, and the scripts abort on any write. | the home and benchmark-matrix baselines must exist before Run 2 starts | re-run after 06:35 IST on a trading day, for the recomputed test user, twice each; do not start Run 2 without them |
| G3 reader list | **Received** | Fund-level P/E and P/B readers: Invesco, ITI, Kotak (hand-import) and UTI, ABSL (automatic). Edelweiss prints only the index's P/E and P/B (no reader). No image-only pages in 4,355 scanned pages. | none | the second capture after 10 Nov may add houses |
| G4 benchmark lines | **Received** | All 38 fetched houses print a benchmark in text. Not accepted this month: Angel One (403), Sundaram (no factsheet link), SBI and Mahindra Manulife (files older than 45 days): they keep last month's mapping or the category fallback. | T3.2 layout list is every fetched house | none |
| G5 index names and the return-series check | Open; the VM command `verify_benchmark_sources.sh` (owner's step0 folder) answers S8 and S9 | S9: the Nifty 50 Arbitrage close can dip (2,747.05 then 2,745.42), so it needs a factsheet comparison; S8 (debt and hybrid names) not done | T3.1 second index batch | ship the equity batch only |
| G6 terms and licence | Open | S10: niftyindices terms of use (read 30 Oct) allow personal non-commercial use only and prohibit automated collection without NSE Indices' written consent; this also bears on the daily benchmark job already running. A written enquiry or data subscription is the owner's decision | release of T3.1 and T3.3 index data | derived returns only; hold raw display |
| G7 sources from the VM | **Mostly received** | NSE P/E file, security master, niftyindices (total-return and price), AMFI and the BSE bhavcopy all answered 200 from the VM; the BSE API answered 403 (expected). S6 (NSE filing endpoint) untested. | T2.12 (Phase C) waits on S6; T2.11 (Phase B) is a go | skip Phase C only |

## File Structure

| Area | Files (modify unless marked create) |
|---|---|
| Allocation backend | `app/services/analytics/cap_allocation.py`, `asset_allocation_lookthrough.py`, `fund_manager_allocation.py`, `schemas.py`, `app/services/home/allocation.py` |
| Overlap | `app/services/analytics/overlap.py`, `scheme_universe.py` (equity helper), `schemas.py` |
| Other Analytics backend | `valuation.py`, `category_ranking.py`, `recompute.py`, `schemas.py`, `app/api/analytics.py`; create `fund_valuation_layouts.py`, `performance_ranking.py`, `scripts/category_average_diff_report.py`; delete `fund_ranking.py` |
| Factsheet intake | `amfi_factsheet_client.py`, `fund_manager_resolvers.py`, `scripts/jobs/import_manual_fund_managers.py`; create `benchmark_layouts.py` |
| Benchmarks | `benchmark.py`, `benchmark_windows.py`, `nse_indices_client.py`, `app/services/fund_page/benchmark_select.py`, `scripts/jobs/refresh_benchmark_daily.py`; create `benchmark_registry.py`, `benchmark_names.py`, `scripts/benchmark_diff_report.py` |
| Holdings | `app/services/dashboard/holdings.py`, `aggregate.py`, `schemas.py` |
| Head of Family | `app/models/user.py`, `app/models/auth.py`, `app/services/auth/otp.py`, `email_templates.py`, `session.py`, `app/services/dashboard/member_profile.py`, `app/services/auth/account_deletion.py`, `app/api/auth.py`; create `app/services/auth/head_change.py`, `head_labels.py`, `head_eligibility.py` |
| Migrations | create `0047`, `0048`, `0049`, `0050` under `alembic/versions/` |
| Frontend | `features/mutual-funds/{types.ts, allocation/*, overlap/*, overview/HoldingsTable.tsx, performance/*, transactions/*, other/*, data/analyticsStore.ts}`, `features/profile-v2/pages/FamilyPage.tsx`, `features/auth/OtpVerify.tsx`, `features/legal/ReconsentGate.tsx`, `components/ui/button.tsx`; create `components/OtpStubBanner.tsx`, `features/profile-v2/components/ChangeHeadDialog.tsx` |
| Legacy surfaces | `features/analytics/OverlapSection.tsx`, `features/analytics/print/PrintAnalyticsView.tsx`, `mobile/features/analytics/MobileAnalyticsView.tsx` (Stock Concentration removal, Fund Ranking removal only) |

---

# Run 1: Allocation, Fund Manager and Overlap (items 3, 13, 4, 5, 6)

Commits straight on `leapswitch-redesign`, prefix `cr-r1:`. Handoff slugs: `cr-r1-market-cap-asset-class`, `cr-r1-fund-manager`, `cr-r1-overlap`, `cr-r1-remove-stock-concentration`. T1.1 and T1.2 share `cap_allocation` and `asset_allocation_lookthrough` (sequential). T1.3, T1.4 and T1.5 share no files with them or each other (parallel allowed). Estimate: 2 days.

### Task 1.1: Market cap adds to 100% (item 3, D8, D21)

**Files:** Modify `app/services/analytics/cap_allocation.py`, `app/services/analytics/schemas.py`, `frontend/src/features/mutual-funds/allocation/MarketCapCard.tsx`, `features/mutual-funds/types.ts`. Test `tests/services/analytics/test_cap_allocation.py`, `MarketCapCard.test.tsx`.

**Interfaces:** Produces additive `percentage_classified: str` on each bucket and `unclassified_share_pct: str` on the section. Old fields and the OTHER row stay (Home reads them).

- [ ] **Step 1: Failing tests.** `test_three_buckets_sum_to_exactly_100_with_unclassified_stocks` (sum of `percentage_classified` over Large, Mid, Small `== Decimal("100.00")`, remainder lands on the last bucket); `test_unclassified_share_reports_the_stock_value_with_no_bucket`; `test_all_equity_unclassified_returns_empty_state_fields` (no NaN, `unclassified_share_pct == "100.00"`); `test_old_fields_unchanged` (golden compare of `percentage_total`, `percentage_equity`). Frontend: `renders three slices and no Other slice`; `shows the note only when unclassified is 0.5 percent or more`; `shows 'Not enough classified equity' when none classified`; `renders a payload without the new fields as the updating state`.
- [ ] **Step 3: Implement** `build_cap_allocation(...)` additions as above; card reads `percentage_classified`, drops the Other slice and legend row, shows the note text "N% of your equity could not be sorted into Large, Mid or Small (for example overseas stocks), so the three slices describe the other M%."
- Verify: `pytest tests/services/analytics/test_cap_allocation.py` and `npx vitest run src/features/mutual-funds/allocation/MarketCapCard.test.tsx`; expected all pass.

### Task 1.2: Asset class with five slices (item 13, D6, arbitrage toggle kept)

**Files:** Modify `app/services/analytics/asset_allocation_lookthrough.py`, `schemas.py`, `app/services/home/allocation.py`, `frontend/.../allocation/AssetClassCard.tsx`, `types.ts`. Test `test_asset_allocation_lookthrough.py`, `tests/services/home/test_allocation.py` (existing or create), `AssetClassCard.test.tsx`.

**Interfaces:** Consumes T1.1 untouched. Produces classes `equity, debt, gold, real_estate, others` in `ASSET_CLASS_MAP`; `reit_invit` to `real_estate`; `cash_equivalent` to `debt`; positive derivative and unclassified rows to `others`; negative derivative lines still excluded and counted in the coverage note; the old `equity_outer` stays in the payload (not drawn).

- [ ] **Step 1: Failing tests.** `test_reit_row_lands_in_real_estate_not_equity`; `test_cash_equivalent_adds_to_debt_and_total_stays_100`; `test_positive_derivative_and_unclassified_rows_land_in_others`; `test_negative_futures_line_is_ignored_and_others_never_negative`; `test_five_classes_sum_to_100_within_rounding`; `test_arbitrage_as_cash_toggle_still_moves_the_whole_fund`; `test_golden_contributing_funds_hybrid_index_arbitrage` (three synthetic funds, hand-computed, includes a negative derivative line); `test_home_allocation_reads_the_five_classes` (Home donut still builds from `asset_allocation`). Frontend: `draws five slices with Others last and grey`; `hides Others at 0 percent`; `clicking Others lists the funds behind it`; `no outer cap ring`; `old payload shows updating state`.
- [ ] **Step 3: Implement** the map change, the Others bucketing and the Home mapping; card shows label "Real Estate (REITs and InvITs)" and the note "Cash is included under Debt".
- Verify: those test files; expected pass. Hand check: three real funds on staging later (Step 0 / QA).

### Task 1.3: Fund manager cards and the main-manager rule (item 4, D7, D38, D13)

**Files:** Modify `app/services/analytics/fund_manager_allocation.py`, `schemas.py`, `frontend/.../allocation/FundManagerCard.tsx`, `allocation/AllocationPage.tsx`. Test `test_fund_manager_allocation.py`, `FundManagerCard.test.tsx`.

**Interfaces:** Produces `pick_main_manager(rows: list[SchemeFundManager]) -> MainManager` with `MainManager(row: SchemeFundManager | None, assumed: bool, with_others: int)`; each manager group carries `main_source: "marked" | "assumed"`; the equal split (`_split_equally`) is no longer used for the card. No new table, no LinkedIn field.

- [ ] **Step 1: Failing tests** (parametrised on real role strings): `one_manager`; `lead_with_assistants_picks_the_non_assistant`; `none_marked_picks_first_listed_and_marks_assumed`; `two_equal_co_managers_first_listed_assumed`; `equity_portion_manager_is_main_for_equity_oriented_fund`; `debt_portion_manager_is_main_for_debt_oriented_fund`; `only_overseas_or_gold_specialist_listed_is_main_and_assumed`; `future_wef_handover_is_ignored`; `manager_totals_never_exceed_portfolio_value`; `same_person_two_funds_sums_per_fund`; `lead_on_one_fund_assistant_on_another_counts_only_where_main`; `fund_without_manager_data_is_counted_in_the_no_data_line` (staging has seven houses with none: Sundaram, Bajaj Finserv, IL&FS, AlphaGrep, Carnelian, Monarch and Lakshya, about 420 scheme rows); `same_name_two_amcs_are_two_groups`. Frontend: `opens on Cards`; `Table view is today's table`; `no Donut or Bar Chart option exists`; `the sentence about funds divided equally is gone`; `shows assumed marker on assumed managers`; `no LinkedIn icon renders`.
- [ ] **Step 3: Implement** `pick_main_manager` and group totals with the full fund value; replace the Donut and Bar Chart views with Cards and Table; remove the equal-division sentence.
- Verify: those files; the Individual Fund page's manager block tests unchanged and green (`tests/services/fund_page`).

### Task 1.4: Overlap equity only and the By category tab (item 5, D14, D15)

**Files:** Modify `app/services/analytics/overlap.py`, `scheme_universe.py`, `schemas.py`, `frontend/.../overlap/OverlapPage.tsx` and its cards, `types.ts`. Create `frontend/.../overlap/CategoryTabs.tsx`. Test `test_overlap.py`, `OverlapPage.test.tsx`, `CategoryTabs.test.tsx`, `overlapLogic.test.ts`.

**Interfaces:** Produces `EQUITY_CATEGORIES: tuple[str, ...]` and `is_equity_fund(sebi_category: str, domestic_equity_pct_after_hedging: Decimal | None) -> bool`; `compute_overlap` adds `excluded_funds: list[ExcludedFund(name, reason)]` and `by_category: dict[str, OverlapSummary]` for `Large Cap, Mid Cap, Small Cap, Flexi Cap`; pairs are computed once for all equity funds and grouped.

- [ ] **Step 1: Failing tests.** Backend: `debt_overnight_liquid_low_duration_arbitrage_are_excluded_with_reason`; `index_fund_and_flexi_cap_are_included`; `hybrid_with_70_percent_domestic_equity_is_included_and_with_40_percent_is_excluded`; `debt_index_fund_fails_the_data_rule_and_an_equity_index_fund_passes`; `both_stored_category_spellings_are_matched` ("Equity Scheme -" and "Equity Schemes -", plus "Index Funds - Equity Funds"); `a_fund_ranked_15th_still_appears_in_its_category_matrix`; `category_pair_equals_the_same_pair_in_all_funds`; `category_with_no_funds_or_one_fund_returns_the_message_state`; `category_list_matches_stored_category_strings` (guards new SEBI categories); `funds_analysed_counts_equity_funds_only`. Frontend: `All funds | By category switch`; `category card with one fund is greyed and opens the one-fund message with a button to All funds`; `category with no funds says no funds`; `not-shown note names excluded funds and why`; `no equity funds shows the page-level message`; `one equity fund says overlap needs two`; `old payload renders All funds only`; `funds in other categories appear only in All funds`.
- [ ] **Step 3: Implement** the helper and `by_category`; the tab strip with an accessible drop-down (menu button, arrows, Escape) and the category cards; remember the category while the page is open.
- Verify: those files. Gate G1 is received: the data rule decides the hybrids and index funds (the tracked index is not available until Run 3, so index funds use the holdings test in Run 1).

### Task 1.5: Remove Stock Concentration from every screen (item 6)

**Files:** Modify `frontend/.../overlap/OverlapPage.tsx`; delete `overlap/StockConcentration.tsx`, `StockConcentration.test.tsx`, its link helper; modify `features/analytics/OverlapSection.tsx`, `features/analytics/print/PrintAnalyticsView.tsx`, `mobile/features/analytics/MobileAnalyticsView.tsx`, the fixtures and tests that name it. Test `OverlapPage.test.tsx`, legacy analytics tests.

**Interfaces:** None. Backend untouched.

- [ ] **Step 1: Failing tests.** `overlap_page_has_four_cards_and_no_stock_concentration`; `legacy_overlap_section_no_longer_renders_concentration`; `print_and_mobile_views_render_without_it`; `home_worth_a_look_still_renders_its_concentration_card` (it reads stored holdings, not this field); `payload_with_and_without_the_curve_fields_still_parses`.
- [ ] **Step 3: Implement** by deleting the card, its link helper and the legacy blocks; keep the Holdings All Stocks table.
- Verify: frontend suites for overlap and analytics; `npm run build`.

### Task 1.5b: Four fund houses move to hand import (factsheet access, owner decision 30 Oct)

**Files:** `backend/app/services/analytics/fund_manager_resolvers.py`, `fund_manager_layouts.py` (Sundaram reader only), tests.

**Behaviour:** Angel One (403 from the VM), Sundaram (no factsheet link), SBI and Mahindra Manulife (stale files) become `ResolverKind.MANUAL` with a note each; the owner supplies their files monthly through `import_manual_fund_managers.py`. Readers already exist for Angel One, SBI and Mahindra; **Sundaram has no reader and needs one** (its fund-wise factsheet layout is not yet examined). SBI and Mahindra keep a working automatic path in the note in case their page lists the file later.

**Tests:** `manual_import_accepts_the_four_houses`; `monthly_job_skips_the_four_houses`; a registry test that every MANUAL house has a note.

**Steps:** probe Sundaram's file layout first (cheap); implement; run the hand import against the owner's October files on the VM; record the `matched=` counts in the Priority 1 doc. Estimate 0.5 day plus the Sundaram reader (0.5 to 1 day).

### Task 1.6: Run 1 integration and gate

Section-list test updates; old-payload tests for every card of the run; `npm run build`, `npm run lint`; full suites; Home allocation and benchmark-pick tests; review gate over the run's commit range; the orchestrator commits and tags `cr-run-1-done` (local only).

---

# Run 2: Other Analytics (items 7 Phase A, 8, 9, 10, composite deletion)

Commits straight on `leapswitch-redesign`, prefix `cr-r2:`. Handoff slugs: `cr-r2-valuation-readers`, `cr-r2-factsheet-alerts`, `cr-r2-valuation-compute-ui`, `cr-r2-performance-ranking`, `cr-r2-category-average`, `cr-r2-hide-quality-scores`. Order: T2.1, T2.2, T2.3, T2.4 then T2.5, T2.6 then T2.7, T2.8 (T2.7 needs T2.5's deletion of the shared helper), T2.9 any time. Needs gate G2 before starting (the home and benchmark-matrix baselines are still to be measured after 06:35 IST); G3 is received. Estimate: 5 days.

### Task 2.1: Migrations 0047 and 0048 and models

**Files:** Create `alembic/versions/0047_scheme_reported_valuation.py`, `alembic/versions/0048_drop_composite_ranking.py`. Modify `app/models/reference.py`, `tests/test_migrations.py`. Test `tests/functional_postgres/test_migrations_0047_0048.py`.

**Interfaces:** Produces model `SchemeReportedValuation(scheme_id FK, reference_period: date, metric: "pe" | "pb", value: Numeric, basis: "trailing" | "forward" | "not_stated", method: "harmonic" | "weighted_average" | "not_stated", source_file: str, page: int, parsed_at)`, unique on `(scheme_id, reference_period, metric)`; `StockMaster` gains nullable `bse_scrip_code`, `pe_as_of`, `pb_as_of`, `pe_source`; `0048` drops `scheme_rankings` and `ranking_weights` (D36 B).

- [ ] **Step 1: Failing tests.** `upgrade_creates_table_and_columns`; `downgrade_drops_them_and_restores_composite_tables` (downgrade of 0048 recreates the two tables empty); `unique_key_rejects_a_duplicate_metric_month` (Postgres); `no_code_imports_the_dropped_models` is added in T2.5.
- [ ] **Step 3: Implement** both migrations; update the staging data-wipe script lists that name reference tables (`scripts/clean-staging-db.sh`, `deploy/leapswitch/scripts/clean-db.sh`).
- Verify: `pytest tests/test_migrations.py`; Postgres up, down, up.

### Task 2.2: Factsheet P/E and P/B readers (item 7 Phase A, Q1, Q2, Q3)

**Files:** Create `app/services/analytics/fund_valuation_layouts.py`; modify `amfi_factsheet_client.py` (second reader in the same pass), `scripts/jobs/import_manual_fund_managers.py` (read valuation from the same PDFs), `tests/fixtures/factsheets/` (create text snippets). Test `tests/services/analytics/test_fund_valuation_layouts.py`.

**Interfaces:** Produces `ValuationReading(heading: str, pe: Decimal | None, pb: Decimal | None, pe_basis: str, pb_basis: str, method: str, page: int)` and `read_valuation(layout: str, pages: list[str], boxes) -> list[ValuationReading]`; `import_reported_valuation(db, amc: str, readings, reference_period: date) -> tuple[int, int]` (matched, unmatched) reusing the manager matcher. Layouts: `invesco` (Fund P/E FY27E forward, Fund P/B trailing), `iti`, `kotak`, `uti`, `absl`; positional extraction for iti, kotak, uti. Sanity range P/E 3 to 200, P/B 0.2 to 40; outside is "not found" and logged. A page with no values returns nothing and never fails.

- [ ] **Step 1: Failing tests** from saved snippets of a real scheme page per house: `invesco_forward_pe_and_trailing_pb`; `iti_column_order`; `kotak_label_and_value_in_separate_runs`; `uti_fund_and_benchmark_columns_take_the_fund_value`; `absl_equity_snapshot_row`; `page_with_no_values_returns_nothing`; `absurd_or_negative_or_text_values_are_dropped_and_logged`; `direct_and_regular_plans_share_the_scheme_value`; `unknown_scheme_is_skipped_not_guessed`; `valuation_alert_when_a_house_that_had_values_returns_none`.
- [ ] **Step 3: Implement** the readers and the alert line in the factsheet job. Gate G3 may add houses later; add none that are not in the VM scan.
- Verify: the test file; the existing manager tests (`test_fund_manager_*`) still green.

### Task 2.2b: Missed-month alert for the hand-import houses (Priority 1, decided 31 Oct)

**Files:** Create `backend/scripts/jobs/check_manual_factsheets.py`. Modify `app/services/analytics/amfi_factsheet_client.py` (helper), `deploy/leapswitch/crontab.leapswitch` (one line; installing it is the owner's step at deploy). Test `tests/services/analytics/test_manual_factsheet_alert.py`.

**Interfaces:** Produces `stale_manual_houses(db, today: date) -> list[StaleHouse(amc: str, last_import: date | None, days_overdue: int)]` for every registry entry with `ResolverKind.MANUAL` whose latest `scheme_fund_managers.reference_period` is before the current month; the script logs `FUND_MANAGER_ALERT amc=<name> reason=manual_import_missing detail=<last import month>` per house and exits non-zero when any is overdue, so `run-job.sh` emails the alert. It runs on the 15th at 06:00 IST (`0 6 15 * *`), five days after the monthly job and the hand import, because the monthly job on the 10th cannot see an import that has not happened yet. Automatic houses are not checked here.

- [ ] **Step 1: Failing tests.** `manual_house_imported_this_month_is_not_stale`; `manual_house_last_imported_last_month_is_stale`; `never_imported_house_is_stale_with_no_last_import`; `automatic_and_layoutless_houses_are_not_checked`; `script_exits_nonzero_and_names_each_overdue_house`; `script_exits_zero_when_all_ten_are_current`.
- [ ] **Step 3: Implement** the helper and the script.
- Verify: that test file plus the existing factsheet tests.

### Task 2.3: Per-fund valuation and the portfolio on the same method (items 7, Q1, Q4, D17, D39)

**Files:** Modify `app/services/analytics/valuation.py`, `schemas.py`, `app/services/analytics/stock_fundamentals_client.py` (date label fix). Test `test_valuation.py`, `test_stock_valuation_isolation.py`.

**Interfaces:** Consumes `SchemeReportedValuation`. Produces `ValuationValue(value: str | None, source: "factsheet" | "computed" | "none", as_of: date, basis: str, method: str, coverage_pct: str | None, reason: str | None)`; `ValuationFund(scheme_id, scheme_name, pe: ValuationValue, pb: ValuationValue)`; `resolve_fund_ratio(reported, computed, nav_date) -> ValuationValue` (factsheet if the latest and at most 75 days old on the NAV date, else computed); the valuation section gains `funds: list[ValuationFund]`; the portfolio P/E and P/B are the value-weighted harmonic mean of the funds' figures, with a forward factsheet P/E replaced by the computed trailing value in the portfolio total only (D39 B); `pe_as_of` and `pb_as_of` fix the date label.

- [ ] **Step 1: Failing tests.** `fund_with_full_coverage_equals_hand_worked_harmonic_value`; `fund_below_70_percent_coverage_shows_no_value_and_a_reason`; `loss_making_stock_is_excluded_and_named`; `factsheet_value_older_than_75_days_falls_back_to_computed`; `forward_factsheet_pe_shows_basis_forward_in_the_fund_row_but_trailing_in_the_portfolio_total`; `pe_from_factsheet_with_pb_computed_in_one_row`; `portfolio_ratio_equals_the_harmonic_mean_of_fund_figures` (golden); `retained_old_pb_keeps_its_old_date`; `overseas_holdings_are_counted_separately_not_missing`.
- [ ] **Step 3: Implement** the functions above; stored shape is additive.
- Verify: those files plus the full `tests/services/analytics`.

### Task 2.4: Valuation by Fund screen (item 7, Q5, D17)

**Files:** Modify `frontend/.../other/CostValuationGroup.tsx`, `ValuationSpectrum.tsx`, `types.ts`. Create `other/ValuationByFund.tsx`. Test `ValuationByFund.test.tsx`, `CostValuationGroup.test.tsx`, `ValuationSpectrum.test.tsx`.

**Interfaces:** Consumes `valuation.funds`. Produces the card exactly as the item 7 mockup: banner "N of M funds trade richer than Nifty 500 on earnings", a range line per number with the Nifty 500 tick, a source label (Factsheet, Factsheet fwd, NSE/BSE) with a hover note that spells out basis and method (tap on a phone), a one-line footnote, an info button with the plain-words harmonic-mean disclaimer, logos via `SchemeLogo`.

- [ ] **Step 1: Failing tests.** `renders one row per fund with logo, P/E, P/B and as-on date`; `label shows Factsheet, Factsheet fwd or NSE/BSE`; `hover note names basis and method`; `fund under 70 percent shows 'Not enough data' with the reason`; `the two excluded lists are closed by default with a count and open on click`; `info text explains why a harmonic mean is used`; `payload without funds renders the existing section only`.
- [ ] **Step 3: Implement** the card and the collapsible lists.
- Verify: those files; `npm run build`.

### Task 2.5: Performance Ranking backend and deletion of the composite (item 8, D5, D36 B)

**Files:** Create `app/services/analytics/performance_ranking.py`. Modify `recompute.py` (`ranking` spec now calls the new function), `schemas.py`, `app/api/analytics.py` (remove `GET /analytics/funds/{id}/ranking`), `app/models/reference.py` (remove `SchemeRanking`, `RankingWeight`). Delete `app/services/analytics/fund_ranking.py`. Test `tests/services/analytics/test_performance_ranking.py` (create); delete `test_fund_ranking.py`, `test_recompute_fund_ranking_section.py`; update `test_period_consistency.py`, `test_recompute.py`, `test_analytics_route.py`, `test_migrations.py`.

**Interfaces:** Produces `compute_performance_ranking(db, scope) -> PerformanceRankingResult` with, per held fund and per period `"1Y" | "3Y" | "5Y"`, `PeriodRank(rank: int | None, total: int, status: "ranked" | "not_enough_history" | "not_ranked_index_fund")`; pools differ per period; a fund is ranked only against the same category and plan type; a 1-year rank needs only 1 year of history; ties share a rank; funds with NAV 0 are excluded; index funds carry `not_ranked_index_fund` and the disclaimer key. It reuses `_category_returns_detailed` and its 15-minute cache (no new NAV work).

- [ ] **Step 1: Failing tests.** `rank_and_total_per_period_on_a_five_fund_category`; `fund_with_only_one_year_gets_1y_rank_and_dashes_for_3y_5y`; `ties_share_the_same_rank`; `wound_up_fund_is_excluded_from_the_pool`; `direct_fund_is_never_ranked_against_regular_peers`; `index_fund_is_not_ranked_and_carries_the_disclaimer_key`; `ranking_section_key_is_unchanged_in_recompute`; `no_module_imports_fund_ranking_or_the_dropped_models` (guards the deletion); `legacy_print_and_mobile_views_no_longer_read_the_composite_shape` (frontend, T2.6).
- [ ] **Step 3: Implement** the function; delete the composite code, route, models and schema types; confirm by a repository-wide search that nothing else reads `scheme_rankings` (the Home backend spec mentions it; the code appears not to).
- Verify: `pytest tests/services/analytics tests/api/test_analytics_route.py tests/test_migrations.py`.

### Task 2.6: Performance Ranking screen (item 8)

**Files:** Create `frontend/.../other/PerformanceRankingGroup.tsx`; delete `other/FundRankingGroup.tsx` and its test; modify `other/OtherAnalyticsPage.tsx`, `other/otherLogic.ts` (`GROUP_TITLES`, remove `RANK_WEIGHTS` and ranking helpers), `types.ts`, `data/analyticsStore.ts`, `features/analytics/FundRankingSection.tsx`, `print/PrintAnalyticsView.tsx`, `mobile/.../MobileAnalyticsView.tsx` (remove the Fund Ranking block so they compile). Test `PerformanceRankingGroup.test.tsx`, `OtherAnalyticsPage.test.tsx`, `otherLogic.test.ts`.

**Interfaces:** Consumes `PerformanceRankingResult`. Produces the earlier lane layout with the larger rank: a header row (Fund, 1 year, 3 years, 5 years) and a row per fund (logo, name, category and plan); each period cell shows the rank large (for example 4/38, the number about twice the size of the total) above a line with a dot placed from best (left) to last (right) and the top quarter stretched in green; banner "Your funds rank in the top quarter in N of M comparisons. A rank such as 4/38 means this fund is 4th best out of 38 funds in the same category. Lower is better. The dot shows where the fund sits, from best (left) to last (right); the green stretch is the top quarter."; group heading "Performance Ranking" and a **different** card heading "Rank in your fund's category"; index-fund row shows "Index funds are not ranked here. Their comparison with the index they track is shown in the benchmark comparison."; `SchemeLogo` on every fund.

- [ ] **Step 1: Failing tests.** `rank_is_rendered_large_with_the_total_smaller_and_the_dot_position_follows_the_rank`; `heading_text_appears_once` (group and card headings differ); `not_enough_history_state`; `index_fund_shows_the_disclaimer_and_no_rank`; `old_composite_payload_renders_the_updating_state`; `group_titles_are_unique`; `legacy_print_view_compiles_without_fund_ranking`.
- [ ] **Step 3: Implement** and update the titles in every test that names them.
- Verify: frontend suites for `other`, analytics legacy; `npm run build`.

### Task 2.7: Category Average Comparison backend (item 9, D4 A)

**Files:** Modify `app/services/analytics/category_ranking.py`, `schemas.py`. Test `test_category_ranking.py`, `test_recompute.py`, Home worth-a-look tests.

**Interfaces:** Removes `category_rank`, `percentile`, `category_size`, `scheme_return` from the calculation and the stored payload and deletes `_rank_and_percentile` (safe after T2.5); the blended 3Y/5Y helper stays internal for the score; `category_period_averages` becomes the simple average of all funds in the category and plan type per period (no size weighting); the 3-year floor stays; Home's `home/worth.py` still receives the 1-year return and 1-year category average.

- [ ] **Step 1: Failing tests.** `payload_has_no_rank_percentile_or_category_size`; `simple_average_golden_on_a_five_fund_category`; `fund_with_no_size_figure_is_no_longer_dropped`; `fund_under_3_years_is_left_out_of_every_period`; `home_worth_a_look_still_gets_1y_return_and_1y_category_average`; `blended_helper_still_feeds_the_score`; `no_module_imports_rank_and_percentile`.
- [ ] **Step 3: Implement.** Before release, `scripts/benchmark_diff_report.py`'s sibling `scripts/category_average_diff_report.py` (create, read-only) lists each held fund's category average before and after on a real household (run in Step 0 S11 environment).
- Verify: those files plus `tests/services/home`.

### Task 2.8: Category Average Comparison screen (item 9)

**Files:** Modify `frontend/.../other/CategoryRankingGroup.tsx`, `otherLogic.ts`, `types.ts`; modify the legacy `features/analytics/CategoryRankingSection.tsx` only to stay compiling. Test `CategoryRankingGroup.test.tsx`, `otherLogic.test.ts`.

**Interfaces:** Produces the earlier dot-on-a-line layout: one card per fund (logo, name, category and plan) with a row per period (1Y, 3Y, 5Y): a filled dot for the fund and a hollow dot for the category average on one scale, a coloured line for the gap (green when ahead, red when behind) and the exact figures beside it (`+8.6 pts`, `28.4% vs 19.8%`); a summary at the top ("Your funds beat their category average in N of M comparisons. Each number is your fund's return minus the average return of funds in the same category, in percentage points. Plus is better. The one to watch: ...") and chips that filter the cards (All funds, Behind somewhere, Ahead everywhere); funds under the history floor keep their notice row; group heading "Category Average Comparison", card heading "Returns against the category average"; everything open, no rank badge, no percentile text, `SchemeLogo`. Known limit: a gap under about half a point puts the two dots almost on top of each other; the number beside the line carries it.

- [ ] **Step 1: Failing tests.** `row_shows_both_dots_the_gap_line_and_the_exact_figures`; `gap_line_is_green_when_ahead_and_red_when_behind`; `summary_counts_ahead_comparisons_and_names_the_one_to_watch`; `chips_filter_the_cards`; `no_rank_badge_or_percentile_text_anywhere`; `cards_are_open_without_a_click`; `payload_that_still_carries_old_fields_ignores_them`; `heading_text_appears_once`.
- [ ] **Step 3: Implement.**
- Verify: those files; `npm run build`.

### Task 2.9: Hide Fund Quality Scores on Other Analytics (item 10, D2, D11, D32)

**Files:** Modify `frontend/.../other/OtherAnalyticsPage.tsx`, `otherLogic.ts`. Test `OtherAnalyticsPage.test.tsx`.

**Interfaces:** Produces `SHOW_FUND_QUALITY_SCORES = false` in `otherLogic.ts`; the group is skipped and its data is not requested while false. Nothing deleted; the recompute still computes `score`.

- [ ] **Step 1: Failing tests.** `constant_off_renders_other_groups_and_no_quality_scores_and_no_score_request_from_this_page`; `constant_on_brings_the_group_back`; `individual_fund_page_still_shows_the_score_card`; `home_worth_a_look_still_gets_its_tier`.
- [ ] **Step 3: Implement.**
- Verify: those files plus `features/individual-fund` tests.

### Task 2.10: Run 2 integration and gate

Section-list and old-payload tests; `npm run build` and `lint`; full suites; the measure scripts against the G2 baseline (`measure_home_staging.py`, `measure_benchmark_matrix.py`, `measure_month_detail.py`, `measure_fund_page_staging.py`); hand-check three factsheet figures (one forward, one trailing, one computed) and one category average; review gate; the orchestrator commits and tags `cr-run-2-done` (local only).

### Task 2.11 (gate G7: go): Phase B, the BSE price file

**Files:** Modify `stock_fundamentals_client.py`, `valuation.py`. Test `test_stock_fundamentals_bse.py`. **Go (Step 0, 30 Oct):** the bhavcopy address is verified from the VM, `https://www.bseindia.com/download/BhavCopy/Equity/BhavCopy_BSE_CM_0_0_0_<YYYYMMDD>_F_0000.CSV` (a new-format file with ISIN, ticker, series and close), and only 96 held equity stocks have no NSE symbol (278 have no stored P/E). The task pins that address in the client first. BSE-only stocks are identified and priced; their ratios use the labelled fallbacks; international holdings are counted separately. The BSE data API answers 403, so BSE's own ratios are not planned. Estimate 1 day.

### Task 2.12 (gate G7: waits on S6): Phase C, book value from official filings

**Files:** Create `app/services/analytics/filings_book_value.py`; modify `stock_fundamentals_client.py`. Test `test_filings_book_value.py`. Book value per share from the latest year-end or half-year filing (equity attributable to owners over shares in issue), times the day's close; refresh only when a new filing appears; banks, insurers and finance companies tested or kept on the fallback; request volume estimated first. Yahoo and screener.in stay as labelled fallbacks. Estimate 3 days. The NSE Integrated Filing address is not in the repo; record it first.

---

# Run 3: Benchmarks and switches (items 11, 12)

Commits straight on `leapswitch-redesign`, prefix `cr-r3:`. Handoff slugs: `cr-r3-index-registry`, `cr-r3-factsheet-benchmarks`, `cr-r3-benchmark-selection`, `cr-r3-benchmark-audit-ui`, `cr-r3-switches`. T3.1 before T3.2 and T3.3; T3.6 shares no files with T3.1 to T3.5 and may run in parallel. G4 is received; G5 (S8, S9) and G6 (S10) are open. Estimate: 4 days, plus 1 day by hand (mapping check). **SIP fixes are on hold and absent.**

### Task 3.1: Index registry and new NSE indices (item 11, Gap 1)

**Files:** Create `alembic/versions/0049_benchmark_index_registry.py`, `app/services/analytics/benchmark_registry.py`. Modify `app/models/reference.py` (`benchmark_index_history.index_name` becomes a text key), `app/models/enums.py` (keep `BenchmarkIndex` and `LEGACY_BENCHMARK_INDICES`), `nse_indices_client.py`, `scripts/jobs/refresh_benchmark_daily.py`. Test `test_benchmark_registry.py`, `test_nse_indices_client.py`, `tests/functional_postgres/test_migration_0049.py`.

**Interfaces:** Produces table `benchmark_index_master(key, nse_name, family, source, return_type, active)`; `get_index(key: str) -> IndexSpec`; `ensure_index_history(db, key: str) -> int`; the eight existing keys keep their values; the daily job reads the master (TRI only for new indices, no price rows); the equity batch is about 40 indices from the verified list (Nifty 100, 200, Next 50, Midcap 100, Smallcap 100, 250 and 50, the 50:25:25 index with its exact name `Nifty500 Multicap 50:25:25`, factor, sector and thematic series); the second batch (debt, hybrid, Arbitrage, 1D Rate) ships only after G5. **Benchmark sources for the other families (owner decision 30 Oct):** CRISIL, BSE and gold/silver series are built only if a free, permitted source is found (the `verify_benchmark_sources.sh` reachability results and the terms decide); otherwise those funds keep the category fallback, labelled. A gold or silver ETF's NAV from our own history is a possible labelled proxy for gold and silver, pending the owner's decision. No new source is added before G6 is answered.

- [ ] **Step 1: Failing tests.** `migration_converts_enum_to_text_and_keeps_existing_rows`; `legacy_tuple_still_drives_the_old_benchmark_tab_output` (golden compare of old payload); `new_index_with_empty_response_is_a_failure_not_zero_rows` (the client treats `[]` as failure and raises the per-index health alert); `echoed_index_name_is_validated` (the total-return endpoint echoes it in `Index Name`; the price endpoint leaves that blank and echoes it in `INDEX_NAME`); `daily_job_fetches_tri_only_for_new_keys`; `index_with_no_history_gives_null_xirr_for_that_row_only`.
- [ ] **Step 3: Implement** the registry, name map and validation of the echoed `Index Name`; per-index health alert.
- Verify: those files; Postgres up and down. Release is gated by G6.

### Task 3.2: Factsheet benchmark readers and the name normaliser (item 11, D34 C)

**Files:** Create `app/services/analytics/benchmark_layouts.py`, `benchmark_names.py`, `alembic` content is in 0049 (`scheme_benchmark` table). Modify `amfi_factsheet_client.py`, `scripts/jobs/import_manual_fund_managers.py`. Test `test_benchmark_layouts.py`, `test_benchmark_names.py`.

**Interfaces:** Produces table `scheme_benchmark(scheme_id PK, declared_benchmark_name, mapped_index_key, tracked_index_key, match_quality: "exact" | "proxy" | "none", source: "factsheet" | "document" | "category_fallback", verified_on)`; `read_benchmarks(layout: str, pages, boxes) -> list[BenchmarkReading(heading, tier1_name, additional_name | None)]`; `normalise_benchmark_name(raw: str) -> BenchmarkMatch(key: str | None, quality: str, blend: list[tuple[str, Decimal]] | None)` handling `TRI`, `Total Return Index`, `S&P BSE` to `BSE`, price-only names marked as TRI, the 41 most-printed names, composite blends, BSE to NSE proxy; houses needing positional extraction (WhiteOak, UTI, Groww, Franklin).

- [ ] **Step 1: Failing tests** over a table of real printed names: `variants_of_nifty_50_tri_map_to_one_key`; `bse_500_tri_is_a_labelled_nse_500_proxy`; `crisil_series_returns_none_and_keeps_the_declared_name`; `blend_is_split_into_components_with_weights_or_marked_not_available`; `price_only_name_is_treated_as_tri_and_marked`; `tier2_is_stored_but_tier1_is_compared`; `index_fund_tracked_index_is_read_from_the_same_line`; `a_house_that_failed_this_month_keeps_last_months_mapping_marked_with_its_age`; `layout_with_label_and_value_in_separate_runs_reads_the_value`.
- [ ] **Step 3: Implement** readers per house from local fixtures; gate G4 may add layouts.
- Verify: those files; existing manager tests green.

### Task 3.3: Benchmark selection with the fallback (item 11, D34, D35, D24)

**Files:** Modify `app/services/analytics/benchmark.py` (`_benchmark_index_for_category` becomes the fallback), `benchmark_windows.py`, `app/services/fund_page/benchmark_select.py`, `schemas.py`. Test `test_benchmark.py`, `test_benchmark_windows*.py`, `tests/services/fund_page/test_benchmark_select.py`.

**Interfaces:** Produces `benchmark_for_scheme(db, scheme_id: UUID) -> BenchmarkChoice(index_key: str | None, source: "factsheet" | "proxy" | "category_fallback" | "none", declared_name: str | None, window_start_note: str | None)`; fallback mapping Large Cap to Nifty 100, Small Cap to Nifty Smallcap 250, index funds to their tracked index, non-equity funds none; the fund-page and Performance blocks both read it; payload gains the fields additively.

- [ ] **Step 1: Failing tests.** `fund_with_factsheet_benchmark_uses_it_and_says_so`; `missing_declared_benchmark_falls_back_labelled_as_a_proxy_with_the_declared_name_beside_it`; `large_cap_fallback_is_nifty_100_and_small_cap_is_smallcap_250`; `index_fund_uses_tracked_index`; `non_equity_fund_gets_no_benchmark`; `fund_page_and_performance_tab_agree_on_the_choice`; `legacy_four_index_old_ui_output_unchanged`.
- [ ] **Step 3: Implement.**
- Verify: those files; the synthetic gates run unchanged.

### Task 3.4: Benchmark audit: golden tests and the difference report (item 11, D18)

**Files:** Create `scripts/benchmark_diff_report.py`; test files `tests/services/analytics/test_benchmark_golden.py` (create). Modify none beyond fixes the audit proves necessary.

**Interfaces:** The report (read-only) lists every held fund whose benchmark or benchmark return changed versus today's mapping, with both numbers; nothing is shown to a user before it is reviewed by hand.

- [ ] **Step 1: Failing tests.** `three_purchases_and_a_sale_match_the_spreadsheet_to_the_paisa_for_portfolio_and_fund_for_each_window_and_since_inception`; `legacy_and_window_solvers_agree_within_1e_8`; `opening_balance_inside_a_window_shows_unavailable_with_a_reason`; `oversold_replay_case_is_handled`; `fully_redeemed_fund_shows_no_meaningless_benchmark`; `purchases_before_index_history_are_reported_not_skipped_silently`.
- [ ] **Step 3: Implement** only fixes the tests prove needed; write the report.
- Verify: those files; the report is run on the Step 0 household and its output is reviewed by the owner.

### Task 3.5: Benchmark screens (item 11)

**Files:** Modify `frontend/.../performance/BenchmarkBlock.tsx`, `benchmarkLogic.ts`, `types.ts`, `features/individual-fund` benchmark block. Test `BenchmarkBlock.test.tsx`, `benchmarkLogic.test.ts`.

**Interfaces:** Each opened row names the benchmark and its source ("From the fund's factsheet", "Proxy: NSE", "Category fallback"), window start dates on the chips, and a short method note; funds with no benchmark show "No benchmark"; `SchemeLogo` on rows.

- [ ] **Step 1: Failing tests.** `row_names_benchmark_and_source_label`; `proxy_is_labelled`; `fund_without_benchmark_says_no_benchmark`; `window_chip_shows_start_date`; `old_payload_without_source_renders_as_before`.
- [ ] **Step 3: Implement.**
- Verify: those files; `npm run build`.

### Task 3.6: Include-switches control on Transactions, and the Net invested label (item 12, D19, D18)

**Files:** Modify `frontend/.../transactions/TransactionsPage.tsx`, `CashFlowStrip.tsx`, the cash-flow bars component, `performance/PerformancePage.tsx` (rename tile), `types.ts`. Create `transactions/SwitchesControl.tsx`. Test `CashFlowStrip.test.tsx`, `TransactionsPage.test.tsx`, `PerformancePage.test.tsx`.

**Interfaces:** Consumes `total_switched_in`, `total_switched_out`, `switch_count` from `investment_withdrawal` (no backend change). Produces `SwitchesControl({included: boolean, onChange})` rendered at the right of a line under the tiles, "Switched between funds: ₹X in N switches" (or "none"), with the visible words "Switches: Included" / "Excluded" and one line saying which figures change. Included: Invested = `total_invested + total_switched_in`, Withdrawn = `total_withdrawn + total_switched_out`, and the bars follow; Net invested and absolute gain never change. The Performance tile "Total Invested" is renamed "Net invested".

- [ ] **Step 1: Failing tests.** `state_word_matches_aria_state`; `included_adds_switches_to_invested_and_withdrawn_tiles_and_bars`; `net_invested_is_unchanged_either_way`; `no_switches_shows_none_and_a_disabled_control`; `bars_label_is_consistent_with_the_switch`; `performance_tile_is_labelled_net_invested`; `print_stays_excluded` (print is unchanged, a test asserts it).
- [ ] **Step 3: Implement.** Button and focus styling through the shared components.
- Verify: those files; `npm run build`.

### Task 3.7: Run 3 integration and gate

Section-list and old-payload tests; full suites; synthetic gates (portfolio, fund, home); measure scripts against the G2 baseline (benchmark matrix under 3000 ms added); review gate (deeper round if any number changes); the orchestrator commits and tags `cr-run-3-done` (local only).

---

# Run 4: Consolidated family holdings (item 2)

Commits straight on `leapswitch-redesign`, prefix `cr-r4:`. Handoff slugs: `cr-r4-consolidation-backend`, `cr-r4-holdings-ui`. Sequential. Estimate: 2 days.

### Task 4.1: Consolidation in the holdings service (item 2, D20, D22)

**Files:** Modify `app/services/dashboard/holdings.py`, `aggregate.py`, `schemas.py`, `app/api/dashboard.py`. Test `tests/services/dashboard/test_holdings.py`, `tests/api/test_dashboard_holdings.py`.

**Interfaces:** Produces `HoldingRow.folios: list[FolioSlice(folio_id, folio_masked, units, invested, value)]` (masked only, last 4 characters); `consolidate_holdings(rows: list[HoldingRow], xirr_by_scope: dict[str, dict[UUID, str | None]]) -> list[ConsolidatedHolding]` grouped by `scheme_id` (Direct and Regular stay apart): summed units, invested, value, realised and unrealised gain, `average_price = invested / units`, the combined-scope XIRR from the stored `benchmark_funds` section, and a child per member with that member's XIRR (dash when the member scope has no stored row); `GET /dashboard/household/aggregate/holdings` gains an additive `consolidated` list in the family view only; the single-member response is unchanged.

- [ ] **Step 1: Failing tests.** `two_members_one_fund_parent_equals_sum_of_children_to_the_paisa`; `average_price_is_total_cost_over_total_units_not_the_mean_of_child_prices`; `parent_xirr_equals_stored_combined_scope_rate_and_child_equals_member_rate`; `direct_and_regular_stay_separate_parents`; `fund_held_by_one_member_is_a_parent_with_one_child`; `folio_numbers_are_masked_only_and_never_full`; `stale_and_nav_unavailable_flags_carry_to_parent_and_child`; `household_with_more_than_four_members_shows_dash_for_member_xirr`; `single_member_view_response_is_unchanged`; `opening_balance_disclaimer_is_inherited_by_the_parent`.
- [ ] **Step 3: Implement** with `Decimal`; no new XIRR engine; extend the holdings cache without a new key.
- Verify: those files; `portfolio_synthetic_gate.py` with the synthetic family set.

### Task 4.2: Family holdings table with a split bar and member rows (item 2)

**Files:** Modify `frontend/.../overview/HoldingsTable.tsx`, `OverviewPage.tsx`, `types.ts`. Test `HoldingsTable.test.tsx`, `OverviewPage.test.tsx`.

**Interfaces:** Produces the earlier table layout with roomier spacing: columns Fund, Units, Avg price, Invested, Current value, Unrealised, Realised, XIRR; the parent row shows a small split bar under the fund name with each member's share and a legend; a + button (`aria-expanded`, keyboard) opens one row per member with the same columns and the masked folio under the member name; one-member funds have no control and no bar; spacing is improved (taller rows, more padding in every cell, second lines on their own line, tinted member rows, the table scrolls sideways on a narrow screen instead of squeezing); on a phone the rows become cards with the expansion inside the card; the single-member view keeps today's layout.

- [ ] **Step 1: Failing tests.** `parent_row_shows_all_requirement_2_2_columns_and_a_split_bar`; `expand_opens_one_row_per_member_with_the_masked_folio`; `plus_is_keyboard_operable_and_sets_aria_expanded`; `single_member_view_is_unchanged`; `fund_held_by_one_member_has_no_expander_or_bar`; `old_payload_without_consolidated_renders_todays_rows`.
- [ ] **Step 3: Implement.**
- Verify: those files; `npm run build`.

### Task 4.3: Run 4 integration and gate

Hand check of every figure on the synthetic family; full suites; synthetic gates; measure `measure_home_staging.py` and the holdings endpoint against baseline; adversarial review plus a scoped second round (money maths); the orchestrator commits and tags `cr-run-4-done` (local only).

---

# Run 5: Head of Family backend (item 1)

Commits straight on `leapswitch-redesign`, prefix `cr-r5:`. Handoff slugs: `cr-r5-migration-and-codes`, `cr-r5-swap-and-undo`. Sequential. Estimate: 3 days. Postgres functional tests are mandatory here.

### Task 5.1: Migration 0050 and models

**Files:** Create `alembic/versions/0050_head_of_family.py`. Modify `app/models/user.py`, `app/models/auth.py`, `tests/test_migrations.py`. Test `tests/functional_postgres/test_head_of_family_0050.py`.

**Interfaces:** Produces `HouseholdMember.is_head: bool` with partial unique index `(user_id) WHERE is_head`; backfill sets `is_head` on each account's `relationship = 'self'` row; `HeadChangeRequest(id, user_id, from_member_id, to_member_id, current_email_verified_at, current_phone_verified_at, new_email_verified_at, new_phone_verified_at, status, expires_at, undo_token_hash, undo_expires_at, snapshot JSON)` with a partial unique index one open request per user; `OtpRequest.purpose: str | None`.

- [ ] **Step 1: Failing tests.** `backfill_leaves_exactly_one_head_per_user_and_it_is_the_self_member`; `second_head_for_the_same_user_is_rejected`; `second_open_request_for_the_same_user_is_rejected`; `downgrade_removes_flag_table_and_column`.
- [ ] **Step 3: Implement.**
- Verify: Postgres up, down, up.

### Task 5.2: OTP purpose, time-to-live and email variants (D3, D37)

**Files:** Modify `app/services/auth/otp.py`, `email_templates.py`, `email_provider.py` callers, `app/api/auth.py` (login paths pass `purpose="login"`). Test `tests/services/auth/test_otp.py`, `test_email_templates.py`.

**Interfaces:** Produces `create_otp_request(db, *, channel, identifier, purpose: str = "login", ttl_minutes: int = 5, commit: bool = True)` and `verify_otp(db, *, identifier, code, purpose: str = "login", commit: bool = True)`; `otp_email_html(otp: str, ttl_minutes: int, *, headline: str, note: str) -> str` plus shared header and footer helpers and two new notice builders `head_changed_email(...)`, `head_change_undo_email(...)`; sign-in wording and the 5-minute window are unchanged by default.

- [ ] **Step 1: Failing tests.** `head_change_code_cannot_sign_anyone_in`; `login_code_cannot_confirm_a_head_change`; `ttl_is_10_minutes_for_head_change_and_5_for_login`; `stub_mode_returns_the_code_for_sms_and_email_and_ses_mode_does_not_return_it`; `existing_signin_email_html_is_unchanged_by_default` (golden); `head_change_headline_does_not_say_to_sign_in`.
- [ ] **Step 3: Implement.**
- Verify: those files plus the existing auth tests.

### Task 5.3: Eligibility and the label flip (item 1, D29, D30)

**Files:** Create `app/services/auth/head_eligibility.py`, `head_labels.py`. Test `test_head_eligibility.py`, `test_head_labels.py`.

**Interfaces:** Produces `member_eligibility(db, user, member_id: UUID) -> list[EligibilityReason]` with reasons `no_email, no_phone, same_email_as_head, same_phone_as_head, email_in_use, phone_in_use, pan_registered_elsewhere, no_pan, label_missing, account_pending_deletion, import_in_progress, head_change_already_open`; `flip_labels(new_head_old_label: Relationship | None, members: list[MemberLabel]) -> LabelPlan(old_head_new_label, member_labels: dict[UUID, Relationship | None], needs_input: list[UUID])` implementing the briefing's tables (spouse, parent, child, sibling, other, not set), never guessing a hard label (result `other` without a label becomes not set).

- [ ] **Step 1: Failing tests.** One test per reason above; `contact_check_also_looks_at_identity_email_column` (the Google gap); every cell of both label tables; `unlabelled_new_head_needs_input`; `free_text_other_is_cleared_unless_symmetric`.
- [ ] **Step 3: Implement.**
- Verify: those files.

### Task 5.4: Request lifecycle and the four codes (item 1)

**Files:** Create `app/services/auth/head_change.py` (start, verify, cancel, expire). Modify `app/api/auth.py` (routes `POST /auth/head-change/start`, `/verify`, `/cancel`; `GET /auth/head-change/pending`), `schemas.py`. Test `test_head_change_flow.py`, `tests/api/test_head_change_routes.py`.

**Interfaces:** Produces `start_head_change(db, user, to_member_id, current_head_code: str) -> HeadChangeRequest` (the current head re-confirms with a fresh email code first); `verify_head_change_code(db, request_id, party: "current" | "new", channel: "email" | "phone", code: str) -> HeadChangeStatus`; errors return `{code, message}` with the codes of the briefing's error table (`head_change_already_open`, `member_not_eligible`, `contact_same_as_head`, `contact_in_use`, `pan_registered_elsewhere`, `import_in_progress`, `request_expired`, `consent_required`); each of the four codes has its own five-try limit and 60-second resend throttle; the API returns the stub code in the `otp` field in stub mode only.

- [ ] **Step 1: Failing tests.** `start_requires_a_fresh_confirmation_from_the_current_head`; `start_twice_returns_409_while_one_is_open`; `wrong_code_increments_attempts_and_locks_at_five`; `expired_request_changes_nothing`; `all_four_codes_are_required_any_three_leave_heads_unchanged`; `cancel_frees_the_slot`; `route_uses_active_user_check_so_pending_deletion_is_403`; `stub_code_present_only_in_stub_mode`; `each_error_code_returns_its_own_message`.
- [ ] **Step 3: Implement.**
- Verify: those files.

### Task 5.5: The swap transaction (item 1, D3, D10, D28, D29, D31)

**Files:** Modify `app/services/auth/head_change.py` (`complete_head_change`), `app/services/legal/consent.py` usage, `session.py`. Test `test_head_change_swap.py`, `tests/functional_postgres/test_head_change_swap.py`.

**Interfaces:** Produces `complete_head_change(db, request_id: UUID) -> HeadChangeResult` performing, in one transaction and in this order: lock `users`, members (by id) and the request (`FOR UPDATE`); re-validate; snapshot (old identities including Google, old contact, labels, session count, undo token hash); delete all of the user's `auth_identities`; set `users.phone_number` and `users.email` to the new head's verified values; insert the two new identities (`commit=False`); old head's row (clear head, new label, receives the old contact) then flush then new head's row (set head, `relationship = self`) with the other labels flipped; delete `sessions` and pending identity links; delete the four used code rows; insert consent withdrawals with surface `head_change`; write the audit row; commit; after commit send the notice emails (a failed email never undoes the swap and is retried). `IntegrityError` at commit returns `contact_in_use`.

- [ ] **Step 1: Failing tests.** `swap_leaves_user_id_portfolio_and_analytics_rows_untouched`; `google_identity_cannot_sign_in_afterwards_and_old_contact_becomes_free`; `one_self_index_order_never_violates_and_failure_midway_rolls_back_everything` (SQLite and Postgres); `sessions_are_all_deleted_including_the_callers`; `labels_flip_per_the_table_and_the_old_heads_contact_lands_on_their_row`; `onboarding_answers_and_created_at_are_kept`; `consent_withdrawn_so_new_head_must_accept_terms`; `email_failure_does_not_undo_the_swap`; `concurrent_second_swap_for_the_same_account_is_blocked`; `account_deletion_removes_the_new_request_table_rows`.
- [ ] **Step 3: Implement** as specified; no step commits internally.
- Verify: those files plus Postgres functional tests.

### Task 5.6: Undo, /auth/me and the Self checks (item 1, D31)

**Files:** Modify `app/services/auth/head_change.py` (`undo_head_change`), `app/api/auth.py` (`/auth/head-change/undo`, `head_member_id` and pending state in `/auth/me`), `app/services/auth/account_deletion.py`. Test `test_head_change_undo.py`, `tests/api/test_auth_me.py`.

**Interfaces:** Produces `undo_head_change(db, token: str) -> HeadChangeResult` valid for 24 hours; restores identities, contact and only the labels the swap changed; blocks with `undo_contact_taken` when the old phone or email was taken and `undo_expired` after the window; ends all sessions; records a withdrawal; changing back is limited to once every 7 days.

- [ ] **Step 1: Failing tests.** `undo_restores_identities_contact_and_the_swaps_own_labels`; `later_member_edits_are_kept`; `undo_blocked_when_contact_taken`; `undo_blocked_after_24_hours`; `change_back_limited_to_once_per_7_days`; `auth_me_returns_head_member_id_and_pending_request`; the 15 `relationship == SELF` readers keep working (regression suite listed in the handoff).
- [ ] **Step 3: Implement.**
- Verify: those files; the nine backend files that read Self.

### Task 5.7: Run 5 gate

Full backend suite; Postgres functional tests; migration up, down, up; synthetic gates (import and people matching must be unaffected); review gate plus a second scoped round (sign-in and data safety); the orchestrator commits and tags `cr-run-5-done` (local only).

---

# Run 6: Head of Family frontend (item 1)

Commits straight on `leapswitch-redesign`, prefix `cr-r6:`. Handoff slug: `cr-r6-head-dialog`. Needs Run 5 committed. Estimate: 1.5 days.

### Task 6.1: Shared test-code banner

**Files:** Create `frontend/src/components/OtpStubBanner.tsx`. Modify `features/auth/OtpVerify.tsx`. Test `OtpStubBanner.test.tsx`, `OtpVerify.test.tsx`.

**Interfaces:** Produces `OtpStubBanner({code: string | null, channel: "phone" | "email"})` showing "Test mode: no SMS is sent yet. Your phone code is 482 913." only when `code` is non-null.

- [ ] **Step 1: Failing tests.** `renders_only_when_a_code_is_returned`; `sign_in_screen_still_shows_local_dev_otp_through_the_shared_banner`.
- [ ] **Step 3: Implement.**
- Verify: those files.

### Task 6.2: Family page, dialog, banner, re-consent (item 1, D3, D31)

**Files:** Create `features/profile-v2/components/ChangeHeadDialog.tsx`. Modify `features/profile-v2/pages/FamilyPage.tsx`, `features/legal/ReconsentGate.tsx` (head-change wording variant), `features/auth/api.ts`, `features/auth/types.ts`, `components/ui/button.tsx` usage. Test `ChangeHeadDialog.test.tsx`, `FamilyPage.test.tsx`, `ReconsentGate.test.tsx`.

**Interfaces:** Consumes the routes of T5.4 to T5.6. Produces a green "Change Head of Family" button on the head's Family page (shared primary button, white text), a pending banner with time left and Cancel, and a three-step dialog: choose a member (not-eligible members greyed with the reason), four code boxes using the existing six-box input with the stub strip under each phone box, and a before-and-after summary; after success it calls `logout()` and shows the sign-in page; errors from the table show next to the box or member they belong to as plain sentences, parsed from `ApiError` code and message; the re-consent gate uses its own title for a new head.

- [ ] **Step 1: Failing tests.** `button_shown_to_the_head_only`; `ineligible_members_are_greyed_with_the_reason`; `four_boxes_with_stub_codes_visible_in_stub_mode`; `confirm_disabled_until_all_four_verified`; `each_error_message_appears_beside_its_box`; `pending_banner_shows_time_left_and_cancel`; `success_calls_logout`; `reconsent_gate_uses_head_change_wording`; `member_list_cards_are_unchanged`.
- [ ] **Step 3: Implement.**
- Verify: those files; `npm run build`.

### Task 6.3: Run 6 gate

Full frontend suite, build, lint; review gate; the QA hand-over test is in the staging step (two real inboxes). The orchestrator commits and tags `cr-run-6-done` (local only).

---

# Run 7: Logos, headings and green buttons

Commits straight on `leapswitch-redesign`, prefix `cr-r7:`. Handoff slug: `cr-r7-logo-pass`. Estimate: 2 days.

### Task 7.1: Logos everywhere a fund or fund house is named

**Files:** Modify the screens in the logo worklist of the briefing's rules section: allocation drill-downs and the By AMC card, all overlap parts (heatmap headers, top pairs, pair detail, common holdings, stat strip, impact), holdings All Stocks fund names, performance rows, benchmark rows, transactions ledger and period drill, Home Movers and its pop-up, SIP card, individual-fund overlap panels, quick insights. Test: one `renders SchemeLogo` assertion per file plus `tests/fund_logo_coverage.test.tsx` (create) that fails when a listed component names a fund without it.

**Interfaces:** Uses `SchemeLogo` (`amcName`, `schemeName`, size `sm` for lists and `lg` for page headers); fund house rows pass `amcName`.

- [ ] **Step 1: Failing tests** as above, plus `fallback_tile_renders_for_a_fund_house_not_in_the_map` and `logo_map_matches_the_real_list_of_fund_houses` (guards the loose substring match).
- [ ] **Step 3: Implement.** Legacy, print and phone views are out of scope.
- Verify: frontend suites for the touched folders; `npm run build`.

### Task 7.2: One heading per card and the green token

**Files:** Modify `other/otherLogic.ts` and group components; `components/ui/button.tsx`; the hand-built green buttons in `MutualFundsFrame.tsx`, `OverviewPage.tsx`, `AllocationPage.tsx`, `HoldingsPage.tsx`, `PerformancePage.tsx`, `TransactionsPage.tsx`; files touched by this plan that hard-code `#22C55E`. Test `otherLogic.test.ts`, `button.test.tsx`.

**Interfaces:** Produces a test that no Other Analytics group heading equals its card heading; green buttons use `bg-[var(--pos)] text-white`; the other hard-coded copies of `#22C55E` (about 257, mostly sign-in and import screens) are left as a tracked backlog, not changed here.

- [ ] **Step 1: Failing tests.** `group_and_card_headings_never_match`; `primary_button_is_brand_green_with_white_text`.
- [ ] **Step 3: Implement.**
- Verify: those files; full frontend suite; `npm run build`, `npm run lint`.

### Task 7.3: Run 7 gate

Open each listed screen with a fund house outside the 35-house map and with the network blocked; review gate; the orchestrator commits and tags `cr-run-7-done` (local only).

---

# Documentation update (after Run 7; Claude only)

Task D.1 updates, with the owner reviewing the diff: `DEFERRED_FEATURES.md` (Fund Ranking replaced; PDF export still hidden; SIP and LinkedIn on hold; the Stock Concentration cleanup release; `equity_outer` and rank-field removal), `decisions.md` (Performance Ranking replaces Fund Ranking; composite deleted; head of family; D1 to D40), `log.md`, `database.md` (migrations 0047 to 0050), `backend.md`, `session.md`, `CLAUDE.md` Session State pointer, `Docs/PRD-04-MF-Analytics-Dashboard.md` (Fund Ranking and composite weights; Fund Quality Score hidden on one page), `Docs/orchestration/2026-10-23-mutual-funds-page-design.md`, `2026-10-24-mutual-funds-redesign-handoff.md`, `ui-redesign-MF-C-mutual-funds-packet.md`, `Docs/superpowers/plans/2026-10-24-mutual-funds-frontend-plan.md` and the restructure and backend-flow specs, the Other Analytics mockup HTML, the redesign decisions register (new row), the staging QA checklist and the IF-E packet, the schema document (new tables), a new decision record and ADR for the head of family, and the LinkedIn verification procedure (kept for when it resumes). Historical attribute 09 plans and specs get a "superseded" line at the top. Verify `Docs/orchestration/2026-10-23-home-functionality-backend-spec.md` before `scheme_rankings` is dropped.

# Staging (once, after the documentation update)

Task S.1 (manager QA through the manager's own Claude). Lessons from the 30 Oct VM session apply: query `analytics_recompute_status` first and confirm no claim is in flight; never stop a running recompute (a stopped run leaves a 15-minute claim, and the next run skips that user; a one-household recompute with `run_analytics_recompute.py --household <id>` clears it); start long jobs in the background because `run-job.sh` prints nothing until the job ends; read `.env` commands under `sudo`; confirm every scope of every user has all 15 sections afterwards. the owner's explicit go to push `leapswitch-redesign` (the rebase onto `origin` first, if it has moved); a new deploy guide `Docs/orchestration/2026-10-31-staging-deploy-guide-change-requests.md` written by Claude covering migrations 0047 to 0050 together, the forced analytics recompute, the check queries, the timing scripts against the baseline, and the QA checklist; QA includes the head-of-family hand-over with two real inboxes (wrong code five times, expiry, cancel, email already used elsewhere, a PAN on another account, undo within 24 hours, an old Google sign-in afterwards), real-data checks of three asset-class funds, three factsheet P/E figures against the PDF page, a rank and a category average by hand, and a benchmark difference review. Estimate: 2 days.

# Later release (cleanup, after staging is accepted)

Remove the Stock Concentration backend curve after a test confirms nothing reads it; remove `equity_outer` and the old rank, percentile and composite shapes once no surface reads them; migrate the remaining hard-coded greens; add a local copy of the 35 fund-house logos; factsheet registry gaps found on 30 Oct (Sundaram has no factsheet link, Carnelian is not in the registry, Angel One returns 403, SBI and Mahindra Manulife published files older than 45 days): the owner decides which to chase in the Priority 1 track; on hold: stopped SIPs and LinkedIn.

---

## Spec coverage

| Item | Tasks |
|---|---|
| 1 Head of Family | 5.1 to 5.7, 6.1 to 6.3 |
| 2 Consolidated holdings | 4.1 to 4.3 |
| 3 Market cap | 1.1 |
| 4 Fund manager | 1.3 (LinkedIn on hold) |
| 5 Overlap | 1.4 |
| 6 Stock Concentration | 1.5 (screens now), Later release (backend) |
| 7 P/E and P/B | 2.1 to 2.4, optional 2.11 and 2.12 |
| Priority 1 missed-month alert (10 hand-import houses) | 2.2b |
| 8 Performance Ranking | 2.5, 2.6 (composite deleted, migration 0048) |
| 9 Category Average Comparison | 2.7, 2.8 |
| 10 Fund Quality Scores hidden | 2.9 |
| 11 Benchmarks | 3.1 to 3.5 |
| 12 Switches | 3.6 |
| 13 Asset allocation | 1.2 |
| Design rules (logos, headings, buttons, plain banners) | 7.1, 7.2, and inside each screen task |
| Documentation | Documentation update |
| One staging pass | S.1 |

## Decisions recorded 31 Oct (the four open points of the first draft)

1. **No integration branch and no run branches.** Everything is committed directly on `leapswitch-redesign`, locally, with a `cr-r<N>:` prefix and a `cr-run-<N>-done` tag per run; nothing is pushed until the single staging step, on the owner's explicit go. The risk this accepts: local commits can diverge if `origin/leapswitch-redesign` moves, so the orchestrator rebases (never force-pushes) before the final push.
2. **Migration numbers follow run order** (0047 and 0048 in Run 2, 0049 in Run 3, 0050 in Run 5); the briefing's older map is updated in the docs run.
3. **Opus is an approval-gated option, not a default** (named triggers only).
4. **The Priority 1 missed-month alert rides in Run 2** as Task 2.2b, because Run 2 already changes the factsheet job; it runs on the 15th so it can see a hand import that did not happen. Note the 10 Nov deadline for the alert's first useful run falls before these runs start; until then the manual check in the briefing's monthly procedure stands.
