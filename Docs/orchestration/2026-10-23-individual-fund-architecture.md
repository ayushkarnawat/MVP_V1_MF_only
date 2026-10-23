# Individual fund page: architecture (extends the shell and Home architecture, draft v1)

**Status:** draft, 2026-10-23. Planning only. Doc 6. Reads with `2026-10-22-nav-shell-architecture.md` and `2026-10-23-home-architecture.md`.

## 1. Where the page sits

```
Shell (router, registry, sidebar, useScope)
  Portfolio mode > Equity > Mutual Fund  (/portfolio/mutual-funds)
     funds/:schemeId            Overview   route file: portfolio-mutual-funds-fund.route.tsx
     funds/:schemeId/insights   Insights   route file: portfolio-mutual-funds-fund-insights.route.tsx
     funds/:schemeId/overlap    Overlap    placeholder, replaced later by the other owner
        |
        v   features/fund-page/  (new feature folder; the only code the page owner adds)
        v   api.ts -> GET /fund-page/{scheme_id}/...?scope=
Backend: api/fund_page.py -> services/fund_page/*  -> existing services and tables (read only)
```

The page owner touches only the two route files and the feature folder (contract section 7). The tab strip is the page's own, built on the shell's `PageLayout` `tabs`; its links come from `paths`.

## 2. Backend structure

```
backend/app/api/fund_page.py            router, prefix /fund-page, auth + scope, one include_router line in main.py
backend/app/services/fund_page/
  schemas.py        pydantic response models (Decimal as str)
  scope.py          resolve scope=combined|member id to household_member_ids (require_member)
  summary.py        tier 1
  performance.py    fund and benchmark period series
  returns.py        Inception and Current tables
  risk.py, risk_bands.py
  composition.py    top 10, three allocations, all holdings
  manager.py
  score.py          stored-first score
  peers.py          category series, averages, rolling, period buckets, scatter, in-process cache + single flight
  insights/         rules.py, constants.py, templates.py
```

No file in `services/fund_page/` is imported by existing services. Existing modules are imported (never edited) except the one optional-parameter change to `compute_holdings` (S1).

## 3. Compute and trigger model

| Tier | When it runs | Cost source | Cache |
|---|---|---|---|
| 1 | page mount | scheme-filtered holdings from stored prices, TER, folios; measured: the household-wide call costs 20 to 22 s cold and a one-fund live price check 0.5 to 0.8 s, so neither is used | holdings cache (per worker, 15 min), keyed with the filter |
| 2 | page mount, in parallel | one fund's NAV and TRI reads, arithmetic, one disclosure batch (two for changes); measured 10 to 19 ms together | none needed (indexed single-fund reads) |
| 3 | after tiers 1 and 2 paint; Insights tab on open | category peers (35 to 46 funds measured), bulk reads, series; measured 2.0 to 4.5 s cold per fund (10-year peer series 1.4 to 2.0 s, first score 1.2 to 1.7 s, 3-year daily 0.2 to 0.3 s) | in-process per worker, `(category, plan, day, kind, period)`, day key with a life of hours, single flight |

The page never starts a household recompute and never writes (the only write path in existing code that a read can trigger is the NAV cache insert for a fund with no price in 3 days, S10). Stored sections read: `score`, `benchmark_funds`, `overlap`, `allocation`. Cold start after an import is the case where those sections may be missing; each card has its own fallback or unavailable state (spec section 2 and layout section 5). A weekend or holiday needs no download because prices come from the store.

## 4. Frontend structure

```
frontend/src/features/fund-page/
  api.ts, types.ts, format.ts (if Home's is not merged)
  FundPageFrame.tsx           header + tabs, shared by both route files
  overview/  StatTiles, FundScoreRing, InvestmentDetails, PerformanceChart, ReturnsTable,
             RiskMetrics, TopHoldings, FundAllocation, AllHoldingsPanel, drilldowns/
  insights/  SmartInsightsCards, InsightList, StrengthsConsiderations, FundManagerCard,
             RollingReturnsChart, PeriodReturnsChart, RiskReturnScatter, StockChanges
  hooks/     useFundSummary, usePerformance, useReturns, useRisk, useComposition, usePeers ...
frontend/src/components/ui/charts/   line-area-chart.tsx (shared with Home), scatter-chart.tsx,
                                      grouped-bar-chart.tsx
```

Each hook owns one endpoint, aborts on unmount and on scope or period change, and exposes `loading | ready | unavailable | error`. Sections never read each other's state; they share only the scheme id, the scope from `useScope()` and the summary payload.

## 5. Cross-cutting

- **Scope:** `useScope()` supplies `scopeKey` (combined or member id); every request includes it; changing it refetches personal sections only.
- **Errors:** a section error is local; the frame stays. A 404 scheme renders the shell's not-found.
- **Theme and tokens:** shell tokens; light and dark; chart colours as the design workbook.
- **Security:** same bearer token and member checks as Analytics; the folio number endpoint checks the folio belongs to the user's household; no logging of folio numbers or amounts.
- **Existing screens:** Dashboard, Analytics and `FundScoreDetailModal` are reused or wrapped unchanged.

## 6. Architectural decisions proposed

AD1 prefix and scope parameter as above (S4). AD2 three tiers with lazy tier 3. AD3 in-process peer cache with single flight, no table (S2). AD4 stored prices only on this page (S10). AD5 insights text rendered on the server (S3). AD6 one shared line chart component with Home. Each is restated in the backend decisions proposal.
