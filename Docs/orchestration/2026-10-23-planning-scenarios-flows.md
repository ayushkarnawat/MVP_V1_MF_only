# Planning (market scenarios): flows (draft v1)

**Status:** draft, 2026-10-23. Planning only. Document 8. User flows, compute and trigger flows. Decisions cited as L-numbers.

## 1. User flows

**A. Plan your future.** Sidebar Planning, landing, click Plan your future, Coming soon view, Back to Planning (or browser Back), landing.

**B. Explore a scenario.** Planning, landing, Explore market scenarios, list, click a scenario card, detail loads below with a smooth scroll, read tiles and charts, expand a member row to see funds and their Estimate or Frozen labels. Browser Back returns to the list, again to the landing.

**C. Compare for one person.** In a detail, open the member dropdown, choose a member, tiles and charts dim while the new numbers load, then update. Open another scenario: the same member stays chosen. Leave Planning: the choice resets.

**D. Event with no fund data (pre-2006).** Open Dot-com bust: benchmark tile and bars show, a note says fund prices were not reported then, no fund sections.

**E. Freeze event.** Open the Franklin Templeton wind-up: the freeze banner shows (or the "none of your funds were frozen" variant), the member list shows funds with Frozen text.

**F. Household with no holdings.** Detail shows a message with a link to import a statement (G6); the list remains usable.

**G. Error.** A failed list or result shows "Scenarios aren't available right now" with Try again; the rest of the page stays usable.

## 2. Compute flow (detail load)

```
click scenario  ->  GET /scenarios/{id}/results[?member_id]
  route: load scenario; 404 if hidden hypothetical or unknown
         member_id? -> check it belongs to the account, else 404
  engine: compute_holdings(member ids, allow_stale_today)   [cache per worker, 15 min]
          for each holding: stored per-fund result -> rupee impact, flags
          sum per member, per asset-class group, headline, covered value
          benchmarks from benchmark_index_history (not for phases or freeze)
          funds_data_available from scenario_scheme_results
  response: result row (+ by_asset_class, member fund flags, funds_data_available)
client: caches by URL; renders; previous data stays while a new member loads
```

## 3. Precompute flow (unchanged)

The existing scenario job computes per-fund results for each scenario and stores them. The job and its schedule are not touched. New scenarios appear in the list as soon as their rows exist.

## 4. Trigger summary

| Trigger | Effect |
|---|---|
| Open Planning | no request |
| Explore | list requests (curated and full) |
| Scenario card | result request (family) |
| Member dropdown | result request with `member_id` |
| Back | history entry popped, no request (cached) |
| Mira button | opens the shell dialog, no request |
