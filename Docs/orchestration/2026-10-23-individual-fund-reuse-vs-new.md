# Individual fund page: reuse versus new, and how each new piece is built (draft v1)

**Status:** draft, 2026-10-23. Planning only. Doc 4. Reuse-first: a new file is listed only when nothing existing does the job. Names are proposals.

## Backend

| Need | Reuse (as is) | New (small) | Changed existing code |
|---|---|---|---|
| Fund's holding (units, NAVs, amounts) | `compute_holdings` rows, `HoldingRow` | `fund_page/summary.py` assembles the tile payload | `compute_holdings(..., scheme_ids=None, allow_stale_today=False)`: optional filter and setting (S1; the setting is shared with Home BD3). Existing callers pass nothing and behave exactly as today |
| Fund XIRR and benchmark XIRR | stored `benchmark_funds` section; `xirr()`; `_portfolio_xirr` | windowed variant for the Current table (`returns.py`) | none |
| Score | `compute_fund_score`, stored `score` section, `FundScoreRow`, `fundScoreVerdicts` | `fund_page/score.py` (stored first, else compute) | none |
| NAV and benchmark series | `nav_history`, `benchmark_index_history` (TRI), `_benchmark_index_for_category`, `_downsample` idea from `fund_detail.py` | `performance.py`: period series for 1M..All incl. 3M and 6M | none |
| Period returns of fund and index | `_bulk_nav_on_or_before`, `_cagr`, `years_ago` | `returns.py` | none |
| Category lines and averages | `get_category_peers`, `build_monthly_series_bulk`, `category_period_averages`, `_latest_aaum_by_scheme`, `_aum_weighted_average` | `peers.py`: category series, 1M/3M/6M/inception averages, rolling, period buckets, scatter; in-process cache with single flight | none |
| Risk numbers | `risk_metrics.years_ago`, `month_end_dates` (helpers only) | `risk.py`: volatility, drawdown, Sharpe, beta; `risk_bands.py` | none |
| Fund holdings | `disclosure_batches`, `scheme_holdings`, `market_cap_classifications`, `stock_master`, look-through age rule | `composition.py` (top 10, three allocations, all holdings) | none |
| Fund manager | `scheme_fund_managers` | `manager.py` | none |
| Expense ratio | `scheme_ter`, `_latest_ter_for_scheme`, scorer's category TER context | none | none |
| Overlap fact | stored `overlap` section | read-only accessor | none |
| Insights | none | `insights/rules.py`, `insights/constants.py`, `insights/templates.py` | none |
| Routes | auth and member checks (`get_active_user`, `require_member`) | `api/fund_page.py`, registered in `main.py` | one `include_router` line |
| Schemas | pydantic conventions in `analytics/schemas.py` | `fund_page/schemas.py` | none |
| Tables, migrations, jobs | all existing | **none** | none |

## Frontend

| Need | Reuse (as is) | New (small) |
|---|---|---|
| Cards, tabs, dialog, select, badge, tooltip, skeleton, table, button | `components/ui/*` | none |
| Donut with centre label | `ui/charts/pie-chart`, `pie-center` | none |
| Bars | `ui/charts/bar-chart` | grouped variant (`GroupedBarChart`) for Period Returns |
| Line and area chart | none exists (`d3-shape` is installed) | `ui/charts/line-area-chart.tsx` with crosshair tooltip; **Home's plan builds the same component first or in parallel; one shared file, whoever merges first owns it** |
| Scatter | none | `ui/charts/scatter-chart.tsx` (d3 scales, small) |
| Fund score popup | `FundScoreDetailModal`, `FundScoreCard`, `fundScoreVerdicts.ts`, `tierStyle.ts` | `FundScoreRing` (ring only; the popup is unchanged) |
| AMC logo | `SchemeLogo`, `amcLogos.ts` (35 fund houses, first-letter fallback) | none (verify the logo service still resolves, V-logo) |
| XIRR explanation | `XirrDisclaimerModal` | none |
| Page frame, scope, links, states, Mira popup | shell `PageLayout`, `useScope()`, `paths`, `AppLink`, `PageState`, `MiraComingSoonDialog`, `renderInShell` | none |
| API calls | `lib/apiClient` (`cachedFetch`, `ApiError`), `features/analytics/api.ts` pattern | `features/fund-page/api.ts`, `types.ts` |
| Formatting (Indian grouping, L/Cr, dates) | Home's formatter module if merged, else the same small functions | `features/fund-page/format.ts` only if Home's does not exist yet |
| Page pieces | none | `FundHeader`, `FundTabs`, `StatTiles`, `InvestmentDetails`, `PerformanceChart`, `ReturnsTable`, `RiskMetrics`, `TopHoldings`, `FundAllocation`, `AllHoldingsPanel`, Insights: `SmartInsightsCards`, `InsightList`, `StrengthsConsiderations`, `FundManagerCard`, `RollingReturnsChart`, `PeriodReturnsChart`, `RiskReturnScatter`, drill-down popups, `useFundPage*` hooks |
| Route files | shell placeholders `portfolio-mutual-funds-fund`, `-fund-insights` (and `-fund-overlap`, which stays a placeholder) | the first two are replaced and set `live` |

## Tokens

Palette tokens as scoped for Home and the shell (Home M12 A): this page uses the same `--shell-*` and feature-level variables; `tokens.css` is untouched. New names only for chart series if the palette lacks one (benchmark blue is Chart 03, category grey is the muted icon grey; see the design workbook).

## Not reused on purpose

The old `FundDetailModal` and `FundSignalGraph` (Dashboard) stay as they are; this page does not extend them. The scorer's 5-year month window is not widened (rolling uses its own 10-year call). `analytics_sections` is not used to store scheme-wide peer results (wrong shape). `compute_holdings` is not called for the whole household.

## Dependencies

No new package. Needs shell PR 1 (router and registry) before the route files exist; the line chart component is shared with Home; the `compute_holdings` setting is shared with Home. Logos load from the AMC sites at view time (third-party request); verify the logo service and decide whether to bundle files later.
