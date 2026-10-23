# Home: reuse versus new, and how each new piece is built (draft v1)

**Status:** draft, 2026-10-23. Doc 4. Companion to docs 1 and 3.

## Backend

| Need | Reuse | New | How the new piece is built |
|---|---|---|---|
| Holdings, day gain, totals | `compute_holdings` (+ allow-stale-today), `HoldingRow` | `services/home/` package: `summary.py`, `series.py`, `movers.py`, `allocation.py`, `worth.py` | thin functions taking `(db, member_ids)`; no new state |
| Daily value series | `nav_history`, transaction/FIFO unit logic | `series.build_value_series()` | one bulk NAV read for held schemes and range, one pass over transactions, forward-fill; pure function over loaded rows, so unit-testable without a DB |
| Period change (Modified Dietz) | none | `series.modified_dietz()` | pure function; tested against hand-computed cases |
| Benchmark % | `benchmark_index_history` (total return), `get_index_level_on_or_before` | `series.benchmark_return()` | end/start index level; clip when history starts late |
| Benchmark list + recommendation | `BenchmarkIndex`, `compute_cap_allocation` | enum value `nifty_smallcap_250`, migration, trading-name line, `recommend_benchmark()` | pattern of migration 0006; confirm the NSE name via the discovery API first |
| Allocation + class status | `compute_asset_allocation`, `/allocation` | class-status constant, family list | constant in `services/home/allocation.py` |
| Movers | `HoldingRow.today_gain` (verify), `scheme_holdings`, `stock_master.sector` | `movers.by_fund/category/sector()` | sector: pro-rata split of each fund's exact change by sector weight; coverage under 50% → category fallback; reconciliation asserted in code and tests |
| Worth a look | `fund_scores`, `scheme_rankings`, `scheme_ter`, look-through, stored Analytics sections | `worth.py` rule functions + thresholds in one config module | each signal is a pure function returning a card or none; thresholds calibrated on synthetic set |
| Greeting | `User`, `Import` | greeting word from the IST hour | server computes with `zoneinfo("Asia/Kolkata")`; no storage |
| Usage tracking (deferred, PRIORITY 2) | not in the Home release | see `2026-10-23-home-tracking-ga4-plan.md` | n/a |
| Disclosure retention (H6, N1) | `prune_old_batches` in `portfolio_disclosure_retention.py` | change the 3-month constant to 6, update its test | existing job; check `scheme_holdings` size first |
| News | cron + `run-job.sh` pattern, `stock_master`, look-through, asset-class map | `refresh_news.py`, `news_items`, `nse_symbol`, `services/news/` (ingest, normalise, match, score), `/home/news`, heartbeat | streaming reader of GDELT 15-min files; allow-list filter; rule-based matcher with the strict ladder; scoring at request time; kill switch in config |

## Frontend

| Need | Reuse | New | How built |
|---|---|---|---|
| Page shell | shell registry, `PageLayout`, `PageState`, `useScope`, `AppLink` | `shell/routes/home.route.tsx` (flip to `live`), `features/home/HomePage.tsx` | lazy page; only its own route file and folder touched |
| Donut, bars, card, dialog, select, skeleton, badge | existing `ui/*` | none | as is |
| Line/area chart | `d3-shape` (installed) | `LineAreaChart` | `area()`/`line()` paths in SVG, scales via simple linear mapping (no d3-scale dependency unless already installed), `ResizeObserver` width, pointer crosshair; props: series, second series with right axis, formatters |
| Date range | none | `DateRangeCalendar` | small controlled component, month grid, min date = today − 10 y; no new dependency |
| Data hooks | `lib` API client patterns (see `features/dashboard/api.ts`) | `features/home/api.ts`, `useHomeSection` | typed fetchers, abort on scope change |
| Formatters | existing format helpers (check `lib`) | `homeFormat.ts` | reuse an existing Indian-grouping helper if present, otherwise one function with tests |
| News icons | `lucide-react` | `NewsCategoryIcon` map | category → icon; custom SVG only where Lucide has no match |

## Tokens

The palette PDF adds tokens that do not exist yet (elevated surface, semantic tints and borders, informational, chart palette). Plan: add them as new names used by Home and the shell only (question M12), leaving `tokens.css` values untouched.

## Not reused on purpose

Dashboard's `DashboardView` and Analytics sections are not imported into Home (existing screens stay untouched); Home calls services directly. No precomputed table, no feature flag (L19).

## Dependencies

New npm: none (react-router arrives with the shell PR). New Python: none expected (GDELT parsed with stdlib/`httpx`, both present).
