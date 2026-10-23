# Home: user flows and compute/trigger flows (draft v1)

**Status:** draft, 2026-10-23. Doc 8. Base: the F3 reply in the decision record. All facts verified in code on 22 Oct.

## 1. Landing

```mermaid
flowchart LR
  L[Login] --> A[Authentication] --> H[/home]
  S[Sign-up] --> A2[Authentication] --> O[Onboarding] --> C[CAS upload + confirm] --> H
  H -->|no holdings| E[Empty Home: Import button]
  H -->|import running| P[Skeletons + note]
  H -->|import failed| F[Banner + retry]
```

A deep link to a valid path is respected once the gates pass.

## 2. In-page user flows

- Change period → refetch wealth-series only. Pick benchmark → refetch wealth-series. Custom → calendar (≤10 years).
- Pick a member (selector or family bar) → every section refetches in that scope; reset to Family Combined on any page change except between one page's tabs.
- Movers dropdown → refetch movers; bar click → popup → fund (disabled until live).
- Understand / Ask Mira → coming-soon dialog. News item → publisher in a new tab. Return to tab → news refetch (throttled 5 min).

## 3. What is computed when

```mermaid
flowchart TD
  IMP["CAS confirm"] --> TX["save transactions"] --> CC["clear holdings cache"]
  CC --> Q1["per member: NAV fetch + snapshot rebuild (queued)"]
  CC --> Q2["per household: Analytics recompute, 30 sections stored (queued)"]
  CRON6["06:00 nav-daily + benchmark-daily"] --> DATA["fresh NAV + index closes"]
  CRON630["06:30 analytics-recompute-all"] --> Q2
  CRON3H["every 3 h + catch-up: refresh_news"] --> NI["news_items"]
  HOMEOPEN["Open /home"] --> HE["thin endpoints"]
  HE --> H1["compute_holdings (allow stale today, per-request memo)"]
  HE --> H2["bulk NAV read -> value series, movers"]
  HE --> H3["READ stored Analytics sections (never recompute)"]
  HOMEOPEN --> NEWSREQ["news request last: score news_items per user"]
  DASHOPEN["Open Portfolio > Mutual Funds"] --> DE["aggregate: holdings + XIRR + allocation in parallel; member: holdings + allocation + gaps"]
  ANALOPEN["Open Analytics"] --> AR["read stored sections; cold = start recompute"]
```

### Answer to "compute Home and Dashboard together or on separate triggers?"

Separate. Home computes only what Home shows, on Home's open; the Dashboard computes (including the 0.7-1.0 s XIRR) only on its own page open. Import confirm keeps queuing the same background work as today. Home adds no background work except the news job. If the staging measurement misses 1.5 s, the fallback is precomputing the daily series after import confirm and in the 06:30 job; that is a plan-time decision, not v1.

### Replacing the Dashboard by Home

Home becomes the landing page. The Dashboard is not removed: it is wrapped unchanged at `/portfolio/mutual-funds` (L38). Its compute is unchanged and triggers only when that route opens.

## 4. Risks in the flow

Per-worker holdings cache (3 workers, 15 min); opening-balance route does not invalidate the cache; full NAV re-download when no row is dated today (use allow-stale-today); XIRR slow (kept off Home).
