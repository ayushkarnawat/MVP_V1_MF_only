# Home (Portfolio Snapshot): functionality and backend spec (draft v1)

**Status:** draft for owner review, 2026-10-23. Planning only; nothing is built. Document 1 of the documents phase (`2026-10-23-documents-phase-handoff.md`).
**Scope:** desktop web, mutual funds only, family-combined first, then per-member. Mobile untouched. Existing screens untouched.
**Inputs:** decisions L1-L47 and the card answers the owner pasted on 23 Oct (cited as A1, B5, E11 and so on; answers that differ from the artifact's recommendation are marked **owner**). Shell contract v1.2 (route id `home`, path `/home`, scope `family-or-member`).
**Reuse-first rule:** every endpoint below is a thin read over code that exists. New tables are listed in section 7 and each leads with the reuse alternative.

## 1. Page contract

`GET`-only, one Home payload per section (not one giant call), so a slow section never blocks the rest. All endpoints take a `scope` of `aggregate` or a member id, using the same path pattern the Dashboard uses today (`/household/aggregate/...`, `/household-members/{id}/...`). Money and units are `Decimal` serialised as strings; never `float`.

| # | Section | Endpoint (new) | Built on |
|---|---|---|---|
| 1 | Greeting and status line | `GET .../home/summary` | `compute_holdings`, `Import`, `User` |
| 2 | Wealth graph | `GET .../home/wealth-series?period=&from=&to=&benchmark=` | `nav_history` bulk read, `transactions`, `benchmark_index_history` |
| 3 | Money at a glance (Mira) | none; built client-side from sections 1 and 5 | rule template |
| 4 | Asset allocation + family bar | `GET .../home/allocation` | `compute_asset_allocation`, member values |
| 5 | What moved today | `GET .../home/movers?by=sector\|category\|fund` | `compute_holdings` (`today_gain`), `scheme_holdings` |
| 7 | Worth a look | `GET .../home/worth-a-look` | `fund_scores`, `scheme_rankings`, `scheme_ter`, stored Analytics sections |
| 8 | News | `GET /home/news` (separate, loads last) | new `news_items` (section 6) |
| - | Benchmark list | `GET /home/benchmarks` | `BenchmarkIndex` enum + recommendation |

Section 6 of the mockup (market comparison) is removed (L5); Market context and Cash health are not built (L34).
Home **never starts an Analytics recompute** and never calls the snapshot rebuild on load (F3 reply). It reads stored sections; if a section is missing it reports `unavailable` for that card.

## 2. Shared rules

- **Scope:** `aggregate` = all members of the household, `member` = one. Same member resolution and ownership checks as the Dashboard routes. Family bar and "Data from n of n family members" appear only in aggregate scope of a multi-member household (L3, L44).
- **"As of" date:** `nav_as_of` = the latest NAV date across the scope's held funds (L2), returned in payloads for logic and the 1D wording; **not displayed as a status line** (owner, 23 Oct: the PDF status row shows only "Data from n of n family members"). All "today" figures mean "latest NAV day vs the NAV day before".
- **Price movement only (B2):** day change for a fund = `units_at_previous_close × (NAV_latest − NAV_previous)`. Units bought or sold on the latest NAV date use the units held at the previous close (stated edge rule). Cash flows never count.
- **Holdings source:** `compute_holdings`. **Measured on staging 23 Oct 2026 (manager ran `measure_home_staging.py`, three real households):** holdings cold 4.5 s (12 funds), 19.2 s (42 funds), 22.2 to 23.4 s (46 funds), about 375 to 510 ms per fund; holdings warm 0 ms; look-through 0.3 to 0.8 s first call, about 0.1 to 0.2 s after; bulk NAV read 1 year 21 to 148 ms, 5 years 155 to 741 ms, 20 years 234 to 2,004 ms; dashboard allocation 2 to 5 ms; the Dashboard aggregate plus XIRR 0.2 to 2.4 s (measured after holdings were warm). **Home cold-open estimate fails the 1.5 s budget on all three (4.9, 19.8 and 24.3 s).** Cause: the NAV freshness check in `nav.py` trusts a cached NAV only if it is dated exactly today, but today's NAV is not published until the evening (and never on weekends and holidays), so every cold holdings call re-downloads each fund's history live and re-does it on every cold call, not only the first. The cache stopped at 22 Oct while the VM's date was 23 Oct. This is existing behaviour that the Dashboard shares. Earlier correction (23 Oct): the "allow stale today" option exists only on `get_nav_on_or_before` in `nav.py`; `compute_holdings` has no such parameter, so as written it can trigger a live NAV download for a fund with no row dated today. Proposed: add an optional, default-off pass-through parameter (existing code, backward compatible), or give Home its own thin path. Open question P7; the staging script measures the cold cost either way. Home must show the same totals as the Dashboard for the same scope (tested, section 9).
- **Partial data (B8):** if any fund has `nav_unavailable` or a gap, return numbers plus `partial: true` and `missing_funds: [{scheme_id, name}]`; the UI shows a badge and tooltip.
- **Formats (G5):** server returns raw Decimal strings and ISO dates; formatting (Indian grouping, `Cr`/`L`, `DD Mon`) is the frontend's.
- **Caching:** holdings are cached per web worker for 15 minutes today and 3 workers do not share it. Home adds no new shared cache in v1; it relies on that cache plus a short per-request memo. Known gap: the opening-balance route does not call `invalidate_holdings_cache`. Home inherits that bug; the plan includes a one-line fix in that route as a **separate, flagged change** (it touches existing code, so the owner decides).

## 3. Section 1: greeting and status line

Returns: `display_name` (the logged-in person; never a member's name), `greeting` (morning/afternoon/evening, from the IST hour), `scope_label` ("Your family portfolio" in aggregate, "<Member>'s portfolio" for a member), `change_amount`, `change_pct`, `since_date`, `top_contributor` (fund name), `members_connected`, `members_total`.

- Heading (owner, 23 Oct, supersedes L16): **"Good morning / Good afternoon / Good evening, <name>"** from the Asia/Kolkata hour (before 12 morning, 12 to 17 afternoon, 17 onwards evening). Nothing is stored; the backend returns the greeting word computed from the IST clock (the frontend must not use the device clock). Confirmed 23 Oct: replaces L16.
- Sentence template (C1, IST, neutral): gain "up", loss "down", flat "little changed" (|change| below 0.05%, default; the owner made no choice on H3), weekend/holiday "since <previous NAV day>'s close". Names the top contributing fund. No advice words.
- Data line (L44): only **"Data from n of n family members"**, where connected = member has at least one confirmed `Import` (the `_has_data` rule in `dashboard/aggregate.py`). No PAN count, no statement date in this line. (Owner, 23 Oct: no "NAV as of" line anywhere in the status row.)
- **First visit:** no longer needed (greeting is time-based), so `users.home_first_seen_at` is dropped from the proposal.

## 4. Section 2: wealth graph

- **Series:** daily portfolio value = Σ over funds of (units held on date d × NAV on or before d). Built from **one bulk read of `nav_history`** for the held schemes and range, plus the transaction list replayed once (measured 8 ms for 1 month to 240 ms for full history; the naive per-fund-per-date build is 1.2 to 29 s and is forbidden). Units come from the same FIFO/unit logic the holdings code uses; carry NAV forward over weekends and holidays.
- **Periods:** 1D, 1W, 1M, 1Y, Custom (B6). 1D compares the latest NAV day with the one before. Custom uses a calendar limited to the last 10 years (L24); no ALL button.
- **Change figure (B5):** rupee gain excluding new money = (end value − start value − net contributions in the period). Percentage uses Modified Dietz (day-weighted contributions). A footnote explains. The same definition is used for every period including 1D, so the headline and 1D figure agree (for 1D the contributions term is the units-at-previous-close rule above).
- **Benchmark (L5, L23, L37):** green = portfolio rupee value on the left axis; blue = the benchmark's **total-return percentage over the chosen period** on a right axis; the blue figure under the portfolio change shows that percentage. This is a plain index return over the period, not a cash-flow replay (owner note on B4).
- **Benchmarks offered (L25, L45, B7):** the four stored indices (Nifty 50, Nifty 500, Nifty LargeMidcap 250, Nifty Midcap 150) plus **Nifty Smallcap 250**, total return. Recommended pick by the portfolio's cap mix: large-cap heavy → Nifty 50; large plus mid → LargeMidcap 250; mid-heavy → Midcap 150; small-heavy → Smallcap 250; broad/mixed → Nifty 500 (cap mix from `compute_cap_allocation`). Choice remembered per device. Sector indices never join this enum.
- **Clipping (B6):** if the period starts before stored index data, the blue line starts where data begins with a short note. The job stores total-return history from 1990 and price history for 10 years, so in practice this affects only Smallcap 250 backfill and new indices.
- **Hide values (L26):** client-side only; hides the big number and the change below it; resets each visit.
- **Edge cases:** no holdings (section state, layout doc); first transaction inside the period (series starts at that date, percentage over the invested span); fund with no NAV (partial badge); 1D with one data point (show the number, no line); custom range wholly before the first transaction (empty state "No investments in this range").
- **Payload:** points `[date, value]` plus `benchmark_pct` series `[date, pct]`, 9-12 KB for 365 points.
- **Cache of XIRR:** this section does not show XIRR, so the slow call (0.7 to 1.0 s) is not on Home's critical path.

## 5. Section 4: allocation and family bar

- **Donut by asset class (A1):** Equity, Debt, Gold, Real Estate, Others, from the existing look-through (`compute_asset_allocation`), so equity inside hybrids counts as equity. Centre label = total value.
- **Placeholder classes (A2, L20):** the endpoint returns the **full list of classes with a `status` of `live` or `coming_soon`** and values only for live ones. Muted legend rows for `coming_soon` classes, not drawn in the donut, not counted in totals. When a class is built it flips to `live` on the backend and the UI needs no change. The class list and statuses live in one backend constant (not a table).
- **Family bar:** per member `{id, name, value, pct}`; sums to the household total; hidden for member scope and single-member households. Clicking a member calls the shell's `setMember(id)`.
- **Reuse:** `GET .../allocation` already exists on the Dashboard; Home's endpoint wraps the same service and adds `status` rows and the family list. No new computation.
- Link "View in Analytics" → `/portfolio/mutual-funds/allocation` (disabled until live, G3).

## 6. Section 5: what moved today

- **Default view: sector (L21, L47)** with a dropdown to switch to **fund category** or **fund**.
- **Fund view and category view are exact.** **Sector view is an estimate**: each fund's exact rupee day change is spread over its sectors by the sector weights from the fund's latest monthly holdings (`scheme_holdings.sector_raw` mapped through `stock_master.sector`; pro-rata, assumes every sector in a fund moved equally). Always reconciles to the headline, labelled "estimated". If holdings coverage for the scope is under 50% by value, fall back to the category view with a note. The sector-index-informed version is deferred (L47, `DEFERRED_FEATURES.md`).
- **Display (L28):** top 2 gains, "offset by" top 2 losses, then **Net portfolio change** (equals the headline in section 2's 1D figure; tested). "View all" → the Mutual Funds Overview fund table sorted by Today's change, `/portfolio/mutual-funds?sort=today_change&dir=desc` (disabled until live; decided 24 Oct). In sector or category view a bar opens a popup listing its funds (works now); a fund row → its fund page (disabled until live).
- **Edge cases:** holiday/weekend → last NAV day shown with its date; one fund only; all funds down (no "offset" block, only losses); no movers.
- **Source check:** `HoldingRow.today_gain` already holds a per-fund day gain; the spec requires verifying its definition equals the price-only rule (B2) before reuse, otherwise Home computes its own from the bulk NAV read. (Spec-phase verification item V1.)

## 7. Section 7: Worth a look

Up to 3 cards, most severe first, no dismiss in v1 (D1b). When nothing is flagged there is **no card**, only the plain text "Nothing needs attention." under the heading (owner note on D1b). Signals (L6, L27; thresholds are starting values, calibrated on the synthetic set and shown to the owner before locking):

| Signal | Definition (starting) | Source |
|---|---|---|
| Weak fund | lowest tier of `fund_scores.risk_adjusted_tier` (shown with the palette Score colours, Weak and Poor; verify the tier meaning, V2) | `fund_scores` |
| Underperforming | 1-year return below the category average (`scheme_rankings.return_1y` vs category) | `scheme_rankings` |
| High expense | TER more than 0.5 pp above the category average for the same plan type | `scheme_ter` |
| Concentration (D1c) | top five **underlying stocks** across all funds (look-through), % of equity-fund value; "approximate, based on latest disclosures" | `scheme_holdings`, look-through |

- **"3 months ago" bar (owner, 23 Oct, H6: extend retention):** `portfolio_disclosure_retention.py` (`prune_old_batches`) keeps the newest **three calendar months per scheme** (it subtracts 3 months from the latest disclosure). The owner chose to extend retention so the earlier bar can show. Minimum needed is 4 months (current plus the one three months back). **Owner chose 6 months (N1 B)**: a margin for late or skipped monthly files and room for the "stocks added and removed" view. This is a change to an existing job and its tests, and it grows `scheme_holdings`; measure the row count before choosing. If a scheme still lacks the earlier month (new fund, skipped file), the bar is omitted for that card.
- Reads stored Analytics sections where they exist (overlap/stock holdings) and the reference tables otherwise; never recomputes.
- All links disabled until their pages exist (G3). No advice wording; copy list goes to the F5 review.

## 8. Section 8: news

All news decisions L9-L18, L40, L41 and the owner's answers apply. Summary of the build (full detail in the decision record, section 5 and appendix):

- **Source:** GDELT raw GKG 15-minute files only (L15, E13), read in a streaming way on the VM, files at least an hour old, with retry. English titles only (E16). Credit goes on the About/legal page only (**owner**, E14), not on the card.
- **Job:** one new `refresh_news.py` through `run-job.sh`, cron every 3 hours plus one daily catch-up (E19). Tests make no live network calls.
- **Table:** new `news_items` (migration 0044; section 10). Reuse alternative considered and rejected: `analytics_sections` is per user and scope, wrong shape for a shared feed.
- **NSE ticker column on `stock_master` and an external heartbeat for the job (**owner**, E11 option B):** both are new beyond the artifact's default. The ticker column is a small migration (nullable `nse_symbol`); the heartbeat is a check-in to an external monitor after each successful run. External service: Healthchecks.io (owner, 23 Oct).
- **Matching:** rule-based, per user at request time; the user's **top 5 of each kind** (stocks, fund houses, fund categories, asset classes, sectors) subject to the minimum-size rule (E20, values calibrated and shown to the owner first). Strict ladder: stocks → fund categories → fund houses → asset class/commodity → sectors → rates and macro → general (L40); majority-class override (L41); gold and silver one topic (E18); foreign-stock news only for users who hold such stocks (L18, +2 to 3 days).
- **Update rules (L10-L13, E22):** the card changes only when a user-specific headline arrives or holdings change; the last specific item stays; a specific item stays 24 hours from publication then is replaced by general news (SEBI/RBI/market); refetch on return to the tab (at most every 5 minutes) and on manual refresh, never on a timer.
- **Card:** title from E8 option C (PDF title, neutral subtext "headlines about companies your funds hold", no sentiment, plus disclaimer). Thumbnail slot shows our own category icons (E3 option b; 13 categories plus a general fallback, mockups in doc 3). Exposure chip only at 50% coverage or more, with a **dynamic** "holdings as of <Mon YYYY>" taken from the disclosure date used (**owner**, E9), and "of your equity-fund holdings we can see" below 100% coverage.
- **Operations (E11, **owner** option B):** `news_enabled` kill switch plus per-source disable list; "Updated" shown stale after 36 hours, card hidden after 72; heartbeat and `nse_symbol` as above.
- **Launch (owner: H24 same release, N5 B live from day one with the disclaimer):** the news card ships live in the same release as Home, with the disclaimer. Counsel review was recommended before production (advice-wording and licensing risk); the owner chose not to gate on it. The `news_enabled` kill switch stays so the card can be turned off at once if a problem appears. VM dry-run test (single run, not 24 hours, E4) before building.
- The news card loads separately, last, and never delays the rest of Home.

## 9a. Basic usage tracking: DEFERRED (owner, 2026-10-23)

Tracking is **not part of the Home release**; it is logged as PRIORITY 2 in `DEFERRED_FEATURES.md`. The design below is kept for when it is picked up. Tracking would be done with **Google Analytics 4 from the frontend only**: no backend endpoint, no table. Seven events (home viewed, period selected, benchmark selected, mover opened, Worth a look clicked, news clicked, Mira popup opened), fixed-label parameters, opt-in consent, no user id by default, no financial values. Full plan: `2026-10-23-home-tracking-ga4-plan.md`. This withdraws the earlier `product_events` table and `POST /home/events` proposal. Open decisions P1 to P8 are in the artifact.

## 9. Jobs and triggers (summary; full flows in the flow doc)

| Trigger | What runs | Home impact |
|---|---|---|
| CAS import confirm (existing) | save transactions, clear holdings cache, per member NAV fetch + snapshot rebuild, household Analytics recompute | none added; Home reads fresh data after the cache clear |
| 06:00 IST `nav-daily`, `benchmark-daily` (existing) | yesterday's NAV, index close | "today's change" becomes available |
| 06:30 `analytics-recompute-all` (existing) | stored Analytics | Home reads stored sections |
| Every 3 h + daily catch-up `news-refresh` (new) | GDELT ingest, `news_items` | news card only |
| Home page open | thin endpoints; nothing precomputed in v1 | first load target about 1.5 s |

**Not added in v1:** a precomputed daily-series table. Fallback if staging misses the 1.5 s target: precompute after import confirm and in the 06:30 job (F3 reply). The unmeasured items (live fund-price fetch on a cold load, real look-through timing) are a staging run before the plans are locked (V4).

## 10. Tables

| Table | New? | Purpose | Reuse alternative |
|---|---|---|---|
| `news_items` (migration 0044) | **new** | Shared feed: id, source, title, url, published_at, language, matched entities (isin/name/category/fund house/asset class/sector tags), tier, ingested_at | none fits (per-user stores are the wrong shape) |
| `stock_master.nse_symbol` | new column (nullable) | alias matching for news (E11 B) | match on name/ISIN only (artifact default, **owner chose B**) |
| `benchmarkindex` enum value `nifty_smallcap_250` | enum add | B7 | none; `ALTER TYPE ... ADD VALUE IF NOT EXISTS` (pattern in migration 0006), plus a line in `_TRADING_INDEX_NAME`; confirm NSE trading name via NSE's discovery API first; tests asserting exactly four indices change |

No table for the daily series, contributors, allocation, worth-a-look or summaries: all computed on request from existing tables.

## 11. Endpoints (shapes)

All under the existing auth dependency; errors use the existing envelope. Per-section payloads include `scope`, `nav_as_of`, `partial`, `missing_funds`, `computed_at`.

```
GET /household/aggregate/home/summary          GET /household-members/{id}/home/summary
GET .../home/wealth-series?period=1D|1W|1M|1Y|custom&from=&to=&benchmark=nifty_50|...
GET .../home/allocation
GET .../home/movers?by=sector|category|fund
GET .../home/worth-a-look
GET /home/benchmarks                        (list + recommended pick for the scope)
GET .../home/news                           (separate, loads last)
```

## 12. Verification items before the plans are locked

V1 `today_gain` definition vs B2. V2 meaning of `risk_adjusted_tier`. V3 disclosure retention vs "3 months ago". V4 staging run: cold-load live NAV fetch cost and real look-through timing. V5 exact NSE trading name for Nifty Smallcap 250. V6 `stock_master.sector` distinct values vs the sectors used in the movers view. V7 `statement_to_date` is empty on old dev data (only matters if a statement date is shown anywhere).

## 13. Open items raised by this spec (answers needed; recorded in the questions doc)

Answered 23 Oct (second round: H1-H25, M1-M17 answered; follow-ups N1-N6 answered: N1 6 months, N2 script prepared, N3 seven events, N4 Google Analytics, N5 live from day one, N6 both PRD-03 copies, wording shown first; new follow-ups P1-P8 open): Q1 no NAV-date line (only "Data from n of n family members"); Q2 time-of-day greeting from the IST clock, nothing stored (replaces L16, confirmed); Q4 yes, the cache fix is a separate small change. Q3 answered: Healthchecks.io. Q2 greeting confirmed as replacing L16.
