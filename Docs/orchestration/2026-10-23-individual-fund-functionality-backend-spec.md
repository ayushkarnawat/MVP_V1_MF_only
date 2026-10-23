# Individual fund page (Overview and Insights): functionality and backend spec (draft v1)

**Status:** draft for owner review, 2026-10-23. Planning only; nothing is built. Document 1 of the individual-fund documents phase.
**Scope:** desktop web, mutual funds, held funds only (L6). Overview tab (PDF p.24) and Insights tab (PDF p.26). Mobile untouched. Existing screens untouched. Search on hold.
**Inputs:** the planning workbook `2026-10-23-individual-fund-planning-decisions-v1.html` (decisions L1 to L19, answers to cards A1 to E4 and C6), shell contract v1.4 (route ids `portfolio-mutual-funds-fund`, `-fund-insights`, `-fund-overlap`; path `/portfolio/mutual-funds/funds/:schemeId` plus `/insights` and `/overlap`; scope `family-or-member`), the Home spec (same style, same reuse rules).
**Reuse-first rule:** every endpoint is a thin read over code or tables that exist. No new table is proposed (section 9).
**Staging measurement (planning check B3), received 23 Oct 2026:** `backend/scripts/measure_fund_page_staging.py` (commit 689ebb4) was run twice on the LeapSwitch VM by the manager, household of 3 members and 46 funds, four sampled funds in three categories (Flexi Cap, Small Cap twice, Large Cap; Direct plans; 35 to 46 peers each), with live fetch and score writes allowed. Results are cited as *Run* below. Summary: household-wide holdings cold 20.3 to 22.1 s; a one-fund price check 0.49 to 0.82 s because today's NAV row is absent; tier 2 reads plus risk plus holdings batches 10 to 19 ms per fund; tier 3 (peers, 10-year month-end series, 3-year daily average, fund score) 2.0 to 4.5 s cold per fund. Anything still marked *estimate* was not measured. Facts marked *Home run* come from the 23 Oct Home staging measurement (three real households, 12 to 46 funds).

## 1. Page contract

GET-only. One endpoint per section group, in three tiers, so a slow tier never blocks a fast one (workbook section 5). Prefix `/fund-page/{scheme_id}`; the scope is a query parameter `scope=combined|<household_member_id>` (same vocabulary as `GET /analytics/{scope}`). Money and units are `Decimal` serialised as strings; never `float` (AGENTS.md).

| Tier | Endpoint | Content | Built on |
|---|---|---|---|
| 1 | `GET /fund-page/{id}/summary?scope=` | header, stat tiles, investment details, folios (masked), expense ratio | scheme-filtered `compute_holdings`, `scheme_ter`, `folios`, `transactions`, stored `benchmark_funds` |
| 1 | `GET /fund-page/{id}/folios/{folio_id}/number` | the full folio number, on an explicit copy | `folios.folio_number` |
| 2 | `GET /fund-page/{id}/performance?period=&scope=` | fund and benchmark lines, period returns for the legend | `nav_history`, `benchmark_index_history` (TRI) |
| 2 | `GET /fund-page/{id}/returns?mode=inception\|current&scope=` | returns table rows for fund and benchmark; Current mode: your XIRR rows | `nav_history`, TRI, transactions |
| 2 | `GET /fund-page/{id}/risk` | volatility, maximum drawdown, Sharpe, beta (3 years) | `nav_history`, TRI |
| 2 | `GET /fund-page/{id}/portfolio-composition` | top 10, stock count, three allocation views, as-of date, age tag | `disclosure_batches`, `scheme_holdings`, `market_cap_classifications`, `stock_master` |
| 2 | `GET /fund-page/{id}/holdings` | every holding of the fund (the "View all holdings" panel) | same |
| 2 | `GET /fund-page/{id}/manager` | manager names, role, managing since, tenure | `scheme_fund_managers` |
| 3 | `GET /fund-page/{id}/score?scope=` | the fund score (stored first, else computed) | stored `score` section, `compute_fund_score` |
| 3 | `GET /fund-page/{id}/peers/series?period=` | category average line | peer NAV (bulk), `scheme_aaum` |
| 3 | `GET /fund-page/{id}/peers/returns` | category average for every returns column | peer NAV on-or-before, `scheme_aaum` |
| 3 | `GET /fund-page/{id}/peers/rolling?window=1\|3\|5` | rolling returns: fund, benchmark, category | monthly series (up to 10 years) |
| 3 | `GET /fund-page/{id}/peers/period-returns?period=` | Period Returns bars (L19) | monthly and daily series |
| 3 | `GET /fund-page/{id}/peers/scatter` | 3-year return and volatility of every peer, the fund flagged | peer series |
| 3 | `GET /fund-page/{id}/insights?scope=` | Key Insights, Strengths, Considerations with evidence | the above plus stored `overlap` |

The Smart Insights cards are the top three facts from the insights engine (section 10; owner, 23 Oct, heading question M11); the follow-up button opens the shell's Mira popup and has no endpoint. The page never starts an Analytics recompute and never calls the snapshot rebuild; if a stored section is missing it computes only this fund or reports `unavailable` for that card (B1).

## 2. Shared rules

- **Auth and scope:** `get_active_user`; `scope=combined` means every member of the household, a member id goes through `require_member` (same checks as `GET /analytics/{scope}`). An unknown `scheme_id` is 404.
- **Held only (L6, E4):** if the scheme is not held in the chosen scope, `/summary` still returns the fund's header and `held: false` with `held_by_other_members: [{id, name}]`; personal fields are null and the UI shows "Not held by <name>". Fund-level endpoints (performance, risk, composition, manager, score, peers, insights) work for any scheme. The page is reachable only for funds held somewhere in the household (it is opened from pages that list holdings); a fund held by nobody in the household is 404 on `/summary`.
- **Stored prices, no live download on the page (consistency with Home BD3).** A fund's NAV rows are read from `nav_history` as stored by the 06:00 job. The only network fetch allowed is the existing rule: a scheme with no NAV row within 3 days gets one live history fetch for that one fund (`warm_nav_history` behaviour). The household-wide fetch of every held fund is what made Home's cold open 4.9 to 24.3 s (*Home run*), and it must not happen here. Valuation uses the newest stored NAV and returns its date as `nav_as_of`.
- **Scheme-filtered holdings (B2):** tier 1 needs only this fund's folios. `compute_holdings(db, member_ids)` gains an optional `scheme_ids` filter (and the optional "stored prices only" setting Home already needs, BD3), applied in `_load_folio_transactions`; the cache key includes the filter. This is the one change to existing code (flagged, question S1). *Run*: the household-wide cold call took 22,122 ms and again 20,259 ms on the immediate second run, because the newest stored NAV was dated 22 Oct and no row dated today existed (AMFI had not published it), so the live fetch repeats on every cold call, not once. A single-fund price check cost 487 to 817 ms for the same reason. Reading the stored price instead costs only the database read (tier 2 single-fund reads took 3 to 12 ms), so a stored-prices-only scheme-filtered call is expected to take tens of milliseconds (*estimate*; to be confirmed once built).
- **Money-weighted figures** use `xirr()` and the transaction type sets already used by `benchmark.py` (`_XIRR_RELEVANT_TYPES`, `_FUND_RELEVANT_TYPES`).
- **As-of and age:** each composition payload carries `holdings_as_of` (the batch date) and `age_tag` (`older_than_60_days` when the batch is more than 60 days older than the NAV date, same rule as look-through).
- **Formats:** server returns raw Decimal strings and ISO dates; Indian grouping and "L"/"Cr" formatting is the frontend's.
- **Partial data:** an endpoint that cannot compute returns `status: "unavailable"` with a reason code (`no_history`, `no_benchmark`, `no_disclosure`, `peers_unavailable`, `not_held`), never a guess.
- **Folio privacy:** summary returns `folio_masked` (all but the last four characters hidden); the full number is returned only by the on-demand endpoint (question S7).

## 3. Tier 1: summary

Returns: `scheme` {id, name, plan (Direct/Regular), category (`sebi_category`), amc_name} (no Growth pill, L3); `held`; `nav_as_of`; tiles `current_value`, `share_of_portfolio_pct` (see below), `invested`, `total_gain` and `total_gain_pct` (unrealized over invested, matching the mockup's 46.6%), `xirr`, `expense_ratio` {value, reference_period, plan}; details {units, average_nav, current_nav, invested, current_value, gain, gain_pct, xirr, first_investment, last_investment, folios[]}. Combined scope sums units and amounts across members and lists each folio with its member name.

- **XIRR:** read the fund's row from the stored `benchmark_funds` section for the scope (`fund_xirr`); if the section is missing, compute this one fund's XIRR from its transactions with the same functions. Nothing under the tile (A2 C).
- **Share of portfolio (question S11):** the scope's mutual fund total is needed. Order: the holdings cache if warm, else the stored `allocation` section's total, else hide the line. It never triggers a household-wide holdings call.
- **First and last investment:** earliest and latest transaction date among the fund-relevant inflow types (purchase, SIP purchase, switch-in, opening balance, gift in per `_FUND_RELEVANT_TYPES`; verify the exact set in the spec phase, V3). Opening-balance lots are shown as the opening date with the existing disclaimer.
- **Expense ratio:** latest `scheme_ter` value for the held plan; "Direct Plan"/"Regular Plan" caption.
- **Edge cases:** CAS-only fund (no amfi_code): valued at the statement NAV (existing rule), chart shows "no price history" and tier 2 performance endpoints return `no_history`; NAV unavailable; fund with only redemptions in scope (units 0, held false for the scope).

## 4. Tier 3: the score (B1)

`GET /score?scope=`: if the stored `score` section for the scope has this fund, return it (`source: "stored"`, `computed_at`); otherwise call `compute_fund_score(db, scheme)` for this one fund (`source: "computed"`). The response is the existing `FundScoreRow` plus `source`. The ring shows `final_score`; the verdict word and sentence come from the existing verdict helpers; the score card opens the existing `FundScoreDetailModal` unchanged with this row as `initialData` so it does not fetch twice (L2). Thin category and insufficient history use the existing flags and show the card with its explanation, no ring.

## 5. Tier 2: performance chart and returns

- **Period chips:** 1M, 3M, 6M, 1Y, 3Y, 5Y, All (same as the PDF and L16). `performance` returns downsampled points (at most about 250 per series; daily up to 1Y, weekly beyond; same `_downsample` idea as the existing nav-history route) as percent from the first point of the period.
- **Lines (L12):** fund (tier 2 teal, M1 B; from `nav_history`); benchmark = TRI of the index returned by `_benchmark_index_for_category(sebi_category)`, rebased to the same start; category average from `peers/series`. A fund younger than the period starts at its first NAV with a "since launch" note (existing `clamped` idea).
- **Legend figure** = cumulative return over the chosen period (matches the line end; question S12). The table below annualises periods over one year.
- **Benchmark for non-equity categories (question S9):** the existing mapping folds every category that is not clearly large, mid or large-and-mid into Nifty 500, including debt, hybrid and gold funds, where an equity index is not a fair comparison. Proposal: the benchmark row, line and beta show only for equity-oriented categories; others return `no_benchmark` and the UI says so.
- **Returns, Inception mode (L4):** columns 1M, 3M, 6M, 1Y, 3Y, 5Y, Since Inception; rows fund, benchmark, category. Periods up to 1 year are absolute; over 1 year annualised (CAGR); footnote says so (A1 assumption). Anchors use NAV on or before the date (`_bulk_nav_on_or_before` logic). A column longer than the fund's history shows a dash. Since Inception: fund from its first NAV; benchmark over the same dates; category: peers that existed on the fund's first NAV date, over the same dates (question S13). Fund and benchmark return from tier 2; the category cells come from `peers/returns` and fill in when ready.
- **Returns, Current mode (A1 A):** rows "Your holding (XIRR)" and "Benchmark, same cash flows"; columns 1Y, 3Y, 5Y, Since first investment. For a period, the cash flows inside the window plus an opening flow equal to the units held at the window start times the NAV then (and the current value as the closing flow) go into `xirr()`. Columns longer than the holding period are hidden or dashed. The benchmark row replays the same flows in the fund's index (new windowed variant of `_benchmark_xirr_for_transactions`). 1M, 3M, 6M are not shown in this mode.

## 6. Tier 2: risk metrics (3 years)

Verdict from the workbook: easy. Window ends at the latest NAV date and starts three years earlier. Daily NAV returns on the dates both series have. **Volatility** = sample standard deviation of daily returns times the square root of 252. **Maximum drawdown** = worst peak-to-trough fall of the NAV in the window. **Sharpe** = (annualised return over the window minus the risk-free rate) divided by volatility; the risk-free rate is one setting (A3 A; the owner provides the number, question S6). **Beta** = covariance of fund and benchmark daily returns divided by the benchmark's variance, on shared dates; null with fewer than 120 shared dates. The fund's benchmark is as in section 5; non-equity funds show volatility and drawdown only.

- **Labels (A3 A):** a band per metric from a small constants module `risk_bands.py`, one set per fund class (equity, hybrid, debt, other). Starting values for equity, to be calibrated on the synthetic set and shown to the owner before locking: volatility under 12% Low, 12 to 18% Moderate, over 18% High; drawdown shallower than -15% Low, -15 to -30% Moderate, deeper than -30% High; Sharpe under 0.5 Weak, 0.5 to 1.0 Fair, over 1.0 Good; beta up to 0.95 Lower risk, 0.95 to 1.05 Market-like, over 1.05 Higher risk. Each payload carries `value`, `band`, `window_start`, `window_end`, `points`.
- **Short history (question S5):** a fund with at least 1 year but less than 3 years shows the metrics over its life with the actual window printed ("since launch, 2.1 years"); under 1 year: `no_history`.
- **Cost (*Run*):** 3-year NAV read about 740 rows in 3 to 5 ms; benchmark TRI 3-year read about 743 rows in 3 to 9 ms; all four metrics (including beta) computed in 1.5 to 2.6 ms. Total with the holdings batch 10 to 19 ms per fund. Easy, as assessed in the workbook; L5 stands (build now).
- **TRI on staging (V5, partly verified):** `nifty_500` and `nifty_50` TRI rows exist for 3 years (743 rows). `nifty_largemidcap_250` and `nifty_midcap_150` were not sampled.

## 7. Tier 2: portfolio composition and all holdings

- **Source:** the newest `disclosure_batches` row with status `WRITTEN` and `as_of_date` on or before today for the scheme; its `scheme_holdings`.
- **Top 10 and count:** equity rows (`EQUITY_DOMESTIC` and `EQUITY_INTERNATIONAL`) ordered by `pct_to_nav`; "(38 stocks)" is the count of those rows. Sector per row from `stock_master.sector` by ISIN, else `sector_raw` (question S8 lists the one-source rule).
- **Allocation (A5 C, three tabs):** *Market Cap*: Large, Mid, Small from `market_cap_classifications` (latest `effective_date` on or before the batch date) by ISIN, shown as a share of the classified equity part so the three slices add to 100; the unclassified share (debt, cash, unlisted) is returned as `unclassified_pct` and printed in a footnote. *Sector*: top sectors by weight, remainder as "Others". *Asset Type*: `asset_type` groups (equity, debt, gold and silver, REIT/InvIT, cash equivalent, derivative, other).
- **All holdings (A6 A):** every row of the batch with name, ISIN, sector, asset type, weight; sorted by weight; the client sorts further.

## 8. Tier 2: fund manager

From `scheme_fund_managers`, latest `reference_period` for the scheme, ordered by `sequence_order`: `{name, role (verbatim, may be null), managing_since (date or null), tenure_years}`. Photo, biography, approach and style are not held (L9): the payload has `details_available: false` and the UI shows them as Coming soon. No manager rows (five fund houses have none): `status: "unavailable"`.

## 9. Tier 3: peers, series and charts

- **Peer set:** `get_category_peers(db, sebi_category, plan_type)`, the same set Category Ranking and the scorer use (one series per fund, same plan type, Growth option). `thin_category` flag reused.
- **Category line (A4 A):** up to 1Y: daily rebased average of peers' NAV; beyond: month-end points. Weighted by `scheme_aaum` (fixed at today's weights, same weighting as the table); a peer without data at the period start is dropped from that period's average and counted in `peers_used`.
- **Category returns:** `category_period_averages` already gives 1Y, 3Y, 5Y; 1M, 3M, 6M and Since Inception are new, computed from one bulk on-or-before read for every peer.
- **Rolling (C1 A):** windows 1, 3, 5 years over up to 10 years of month-end series: fund, benchmark (TRI at month-ends), category (AUM-weighted average of peers' rolling returns). The scorer builds only 5 years of months today; this uses a separate 10-year call of `build_monthly_series_bulk` and does not change scorer behaviour (V4).
- **Period Returns (L19, C6 A):** bar width follows the chip: 1M and 3M weekly, 6M and 1Y monthly, 3Y quarterly, 5Y and All yearly (current year labelled year to date). Each bucket returns fund, benchmark, category. The chart title is "Period Returns".
- **Scatter (C3 A):** each peer's 3-year annualised return and volatility; the fund flagged. Basis question S14. *Run:* the 3-year daily read for every peer is 22,536 to 29,426 rows in 138 to 276 ms plus 25 to 42 ms of averaging, so a daily basis, which makes each dot match the Overview risk card, costs about 0.2 to 0.3 s and is recommended over monthly.
- **Measured tier 3 costs (*Run*, 35 to 46 peers):** peer set 28 to 462 ms (the first call in a process loads AMFI's list; later 28 to 43 ms); **10-year month-end series for all peers 1.4 to 2.0 s (the largest single cost)**; daily category average 1 year 57 to 82 ms, 3 years 213 to 313 ms; Fund Score cold 1.2 to 1.7 s for the first fund of a category and 81 to 86 ms when the category was already scored in the same process, warm 68 to 95 ms. Per fund total 2.0 to 4.5 s. The score's category cache is shared by every fund in that category, which supports the in-process cache choice. The 10-year series is built from full ORM rows; a leaner Core query (tuples, or month-end rows picked in SQL) is expected to cut it substantially (*estimate*; a build-time optimisation, not a design change).
- **Cache:** peer results are not user-specific, so they are cached in process, keyed `(category, plan_type, day, kind, period)` and guarded by a per-key lock so concurrent first opens compute once (single flight). Life: the scorer uses 15 minutes; because the data changes once a day, the proposal is a day key with a life of several hours (question S2 lists it). No table (question S2).

## 10. Insights engine (L8, C4 A)

A rule list in one module (`insights/rules.py`) with thresholds in one constants module; each rule returns `{id, list: key|strength|consideration, tone: positive|warning|negative|info|neutral, text, evidence}` or nothing when an input is missing (never guessed). Text is a fixed template filled with numbers and rendered on the server (question S3) so the evidence popup and the sentence cannot disagree. The catalogue is workbook section 11: peer-beat years (from calendar-year returns), expense ratio versus category average (`scheme_ter` and the scorer's category TER context), top 5 weight, sector concentration, overlap with other held funds (stored `overlap` section for the scope), 3 and 5-year return versus category, manager tenure, market-cap spread, volatility versus category, lagging years. "Experienced" and "low churn" are never stated as judgements. No advice wording. The three Smart Insights cards at the top are the three highest-priority facts from the same engine (long-term performance, overlap, fund management when they exist); a missing one is replaced by the next fact.

## 11. Jobs, triggers and tables

- **Jobs:** none new. **Triggers:** the page never dispatches a recompute. It reads sections the existing recompute stores after imports and in the daily job.
- **Tables:** none new, no migration. Reuse alternative recorded for the cache question: the user-keyed `analytics_sections` table is the wrong shape for scheme-wide peer results (one copy per user); an in-process cache costs one cold pass per worker (3 workers) until measured (B3). Only if the staging numbers show that is too slow would a small reference-data cache table be proposed, with this alternative stated first.
- **Existing code touched (flagged):** `compute_holdings` optional filter and setting (S1). Nothing else.

## 12. Errors and degradation

Each tier fails independently: a failed card shows its own error with a retry; an unavailable card shows its reason in words. Tier 3 cards show skeletons while computing and never block tiers 1 and 2. No endpoint returns partial numbers silently.

## 13. Performance budgets (provisional, *estimates* until the staging output arrives)

Set from the staging run. Tier 1 under 300 ms from stored prices (*estimate*; to be confirmed after build; the old path costs 20 s or about 0.5 s per fund and is not used). Tier 2: each call under 50 ms (measured 10 to 19 ms for all reads, risk and batch work together). Tier 3, first open of a category in a process: target under 5 s behind skeletons (measured 2.0 to 4.5 s per fund, dominated by the 10-year peer series and the first score); later opens in the same category within the cache life: under 300 ms except per-fund pieces. Three workers can each pay one cold pass per category.

## 14. Verification items for the build

V1 `today_gain` is not used here. V2 the fund score's `final_score` range and verdict mapping (question M2). V3 exact transaction types for first and last investment. V4 widening the monthly window for rolling does not change existing scores. V5 that `benchmark_index_history` holds TRI rows for the Largemidcap 250 and Midcap 150 indices on staging (Nifty 500 and Nifty 50 confirmed by the run). V6 `analytics_sections` rows are removed by account deletion (no new data is stored, so this is a check, not a change). V7 sector source precedence on real batches.

## 15. Questions raised by this document (all answered 23 Oct)

S1 to S14 were in the design workbook, and all were answered 23 Oct as recommended (S6: 6.5% placeholder, the owner changes it later) (`2026-10-23-individual-fund-design-mockups.html`): scheme-filtered holdings change (S1), peer cache (S2), insight text on the server (S3), endpoint prefix (S4), short-history rule (S5), risk-free rate value (S6), folio masking (S7), sector source (S8), benchmark for non-equity funds (S9), legend basis (S12), since-inception comparison (S13), scatter basis (S14), share of portfolio source (S11), and S10: the page never downloads prices live except one fund with no NAV in 3 days (section 2). Layout and design questions M1 to M10 are in the same workbook.
