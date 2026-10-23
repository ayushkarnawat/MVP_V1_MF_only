# Individual fund page: user flows and compute/trigger flows (draft v1)

**Status:** draft, 2026-10-23. Planning only. Doc 8.

## 1. Entry

```
Home (contributors fund row)  --->  /portfolio/mutual-funds/funds/:schemeId   (Overview)
Mutual Funds Overview/Holdings pages, when built  --->  same
Typed or bookmarked URL  --->  same (auth first; a fund not held anywhere in the household is not found)
Existing Dashboard and Analytics: no new link (existing screens unchanged, E3 A)
```

Back goes to the last non-Portfolio screen when the user came from Home (shell rule); otherwise the breadcrumb levels are the way up.

## 2. In-page user flows

1. **Open the page:** header and tiles appear first; chart, returns, risk and holdings next; category line, score and peer cells fill in last.
2. **Change the period:** chip click refetches the performance series (tier 2); the category line follows (tier 3, from cache when warm).
3. **Toggle Returns Inception | Current:** Inception is already loaded; Current fetches the XIRR rows once and keeps them for the scope.
4. **Drill into a tile or row:** a popup shows the numbers behind it (click map in the workbook); closing returns to the same scroll position.
5. **Open the score:** the card opens the existing popup with the row already loaded.
6. **View all holdings:** a wide panel with the full list; sortable.
7. **Switch to Insights:** route change; tier 1 data is reused, Insights calls start; the member stays.
8. **Switch member in the top bar:** personal tiles, details, Current returns and the overlap fact refetch; fund-level cards stay. A member without the fund sees "Not held by <name>".
9. **Disabled controls:** Overlap tab, Add Investment, "...", Update, manager approach show a short tooltip and do nothing.

## 3. What is computed when

| Event | What runs | Notes |
|---|---|---|
| Page open, warm | tier 1 (cache), tier 2 (indexed reads), tier 3 (in-process cache) | all fast |
| Page open, cold worker | tier 1 and 2 as above (stored prices, no download), tier 3 pays the peer pass once per key (single flight) | first user waits on skeletons for tier 3 cards only: measured 2.0 to 4.5 s per fund on staging (23 Oct); a household-wide holdings call would add 20 to 22 s and a one-fund live price check 0.5 to 0.8 s, which is why neither runs |
| Right after an import | stored sections may be missing; score computed for this fund; XIRR computed for this fund; overlap fact skipped until the recompute stores it | the recompute started by the import is untouched |
| Weekend or holiday | prices from the store; `nav_as_of` shows the last NAV day | no download |
| Fund with no price in 3 days | one live history fetch for that fund | the only network call |
| Daily | existing jobs only (NAV, benchmark, TER, disclosures, managers, analytics recompute) | no new job |

### Answer to "should the page compute with the Dashboard or on its own trigger?"

Its own: it reads stored sections and computes one fund, never starts a recompute, and does not share state with the Dashboard except the holdings cache and the stored sections.

## 4. Hand-off flow for the Overlap page

The other owner replaces `frontend/src/shell/routes/portfolio-mutual-funds-fund-overlap.route.tsx` and sets `status: "live"`; the tab here and the overlap row's link enable themselves. The page receives `schemeId` from the URL and the scope from `useScope()`. Nothing on this page changes.

## 5. Risks in the flow

Tier 3 skeletons on a slow cold pass (measure); a user switching members quickly (requests abort on scope change); stale stored sections after a new import (shown with their computed time where relevant); a fund house with no loaded disclosure (explained in words).
