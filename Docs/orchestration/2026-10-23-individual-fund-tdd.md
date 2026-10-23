# Individual fund page: test design (TDD, draft v1)

**Status:** draft, 2026-10-23. Planning only. Doc 5. Rules: red then green then refactor; run only the test files a change touches; no live network in tests (`tests/offline_http.py`); `Decimal` only for money; synthetic CAS set (`Docs/CAS Files/synthetic/`) for realistic numbers.

## 1. Backend (`tests/services/fund_page/`, `tests/api/test_fund_page_routes.py`)

Pure functions first, each written test-first:

| Module | Tests |
|---|---|
| `risk.py` | volatility, drawdown, Sharpe, beta against hand-computed series (flat series, one crash, perfectly correlated index gives beta 1, inverse gives -1); fewer than 120 shared dates gives no beta; under 1 year gives `no_history`; 1 to 3 years prints the actual window; risk-free rate is read from settings |
| `risk_bands.py` | each band edge value falls in the stated band for each fund class; non-equity gets no beta band |
| `returns.py` | period anchors use NAV on or before; absolute up to 1 year, annualised above; a column longer than history is a dash; Since Inception benchmark uses the same dates; Current mode: a lump sum held the whole window gives the simple annualised return, a SIP gives the XIRR of the flows, a window longer than the holding is hidden; benchmark replay uses the same flows |
| `performance.py` | rebasing to the period start; fund younger than the period starts at first NAV with the note flag; downsample keeps first and last points; benchmark missing gives no line, not zero |
| `peers.py` | AUM weighted average with fixed weights; a peer without the start date is dropped and counted; daily up to 1Y and month-end beyond; rolling windows 1, 3, 5; Period Returns bucket widths per chip (weekly, monthly, quarterly, yearly) and the year-to-date label; scatter flags the fund; thin category flag; single-flight lock computes once under concurrent calls; cache key includes day (midnight rollover recomputes) |
| `composition.py` | top 10 by weight among equity rows; stock count; market cap shares add to 100 over classified equity and the unclassified share is returned; sector precedence `stock_master` over `sector_raw`; asset type groups |
| `manager.py` | ordering by `sequence_order`; verbatim role; tenure from `managing_since`; none gives unavailable |
| `insights/rules.py` | one test per rule for fires, does not fire, and missing input (skipped, never guessed); templates contain no advice words (a test scans every template for a banned list: buy, sell, should, recommend, good fund); evidence matches the numbers in the text |
| `summary.py` | combined scope sums members; member scope; not held gives `held: false` with the other holders; share of portfolio fallback chain (warm cache, stored allocation, hidden); folio masking keeps the last four characters; XIRR from the stored section, else computed |
| `score.py` | stored section used when present (`source: stored`); missing gives `computed`; thin category and insufficient history pass through |
| Route tests | 401 without a session; 403/404 for a member not in the household; 404 unknown scheme; `scope=combined` and a member id; each endpoint's `unavailable` reasons; the full folio number endpoint returns it only for a folio of the user |
| Existing holdings | the `compute_holdings` optional filter: existing tests unchanged and green; with `scheme_ids` only that scheme's rows come back; cache key differs per filter; `allow_stale_today` never calls the network (patch the fetcher to fail) |

Reconciliation checks on the synthetic set: gain and gain % in the summary equal the Dashboard's holding row for the same fund; the XIRR equals the stored `benchmark_funds` value; the score equals `/analytics/funds/{id}/score`.

## 2. Frontend (vitest, `renderInShell`, `features/fund-page/*.test.tsx`)

Per component: renders with real-shaped fixtures; each state in the layout doc's state matrix (loading, unavailable, partial, error, not held); keyboard focus and hover affordances exist (class or attribute assertions, not pixels).

- **Header and tabs:** pills show plan, category and AMC and no Growth pill; Overlap tab is disabled with a tooltip; Insights navigates; the member stays when switching tabs.
- **Stat tiles:** Indian grouping and L/Cr formats; no sub-line under XIRR; each tile opens its drill-down popup; the score card opens `FundScoreDetailModal` with the row as `initialData`.
- **Performance chart:** chips change the period and refetch; legend items toggle lines; tooltip shows the three values; the category line appears when tier 3 arrives; fund-younger note.
- **Returns table:** Inception and Current toggle; Current hides short columns; dashes; footnote text.
- **Risk metrics:** band labels from the payload; unavailable beta shows the explanation; each row opens its definition popup.
- **Holdings and allocation:** top 10 in two columns; "View all holdings" opens the panel; allocation tabs switch; unclassified footnote; age tag.
- **Insights:** the three Smart Insights cards show computed facts with evidence and the follow-up opens the Mira popup; each insight row opens its evidence; rolling window dropdown; Period Returns chart title and bar widths per chip; scatter highlights the fund and a held peer links; empty states.
- **Disabled targets (D2 B):** Add Investment, the "..." menu, Update and manager approach are disabled with a tooltip and do nothing on click.
- **Copy:** copy folio calls the on-demand endpoint and writes the clipboard (mocked); the masked number is shown otherwise.
- **Formatting and utilities** (`format.ts`): rupee and percent formatting edge cases (negative, zero, very large, null).

## 3. Contract and shell

A route-registry test already fails on duplicate ids or paths; add: the two route files for this page exist with `status: "live"`, `scope: "family-or-member"`, and the Overlap route stays `placeholder`; links use `paths.*`.

## 4. Performance checks (not unit tests)

Baseline recorded 23 Oct (46-fund household, run twice): household holdings cold 20.3 to 22.1 s; one-fund price check 0.49 to 0.82 s; tier 2 10 to 19 ms; tier 3 2.0 to 4.5 s per fund (10-year peer series 1.4 to 2.0 s, first score 1.2 to 1.7 s). After the build the same script is re-run and the page's tiers must meet the budgets in the spec section 13 (tier 1 under 300 ms, tier 2 under 50 ms, tier 3 first open under 5 s).

`backend/scripts/measure_fund_page_staging.py` (committed 689ebb4), the checks it covers: household holdings cold (the cost to avoid), one-fund availability, tier 2 reads and risk numbers, disclosure batches, peer pass, 10-year series, 1-year and 3-year daily category averages, Fund Score cold and warm. After the build, repeat the same script with the scheme-filtered read and stored prices to confirm tier 1 and 2 budgets.

## 5. What not to run

No full suites. Per change: the touched test files only (`pytest tests/services/fund_page tests/api/test_fund_page_routes.py`, plus `tests/services/dashboard/test_holdings*.py` when `compute_holdings` changes; `npm test -- features/fund-page`).
