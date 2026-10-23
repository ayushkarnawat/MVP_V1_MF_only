# Planning (market scenarios): architecture (draft v1)

**Status:** draft, 2026-10-23. Planning only. Document 6. Extends the shell architecture (`2026-10-22-nav-shell-architecture.md`, which still shows the old Planning route; contract v1.5 supersedes it) and the Home architecture. No new service, no new table, no new job. One FastAPI app and one React SPA, as in `AGENTS.md`.

## 1. Where Planning sits

```
Shell (router, sidebar, top bar)
  route planning  /planning  (layout app, scope none)
    wrapper route file
      PlanningPage  (state: landing | future | market(+selection))
        PlanCard x2, ComingSoonView
        ScenarioList -> ScenarioCard
        ScenarioDetail
          StatTile x4, BenchmarkChart, AssetClassChart (DivergingBars)
          MiraInsightsCard (shell MiraComingSoonDialog)
          member rows (EstimateChip, FrozenText)
api.ts  listScenarios, getScenarioResult(id, memberId?)
        |
FastAPI  GET /scenarios, GET /scenarios/{id}/results[?member_id]
        |
scenario_engine  (+ by_asset_class, flags)  -> compute_holdings (allow_stale_today)
        |
tables: scenarios, scenario_scheme_results (read only)
```

## 2. Data flow

1. Opening Planning mounts `PlanningPage` in `landing`; nothing is fetched.
2. Explore fetches the curated and the full list in parallel (existing calls, cached by `cachedFetch`).
3. Selecting a scenario fetches its result for the family. The member list is read from that response and kept.
4. Choosing a member refetches with `member_id`. Each (scenario, member) response is cached by URL.
5. The server computes the household result at request time from current holdings and the stored per-fund results (existing), then derives `by_asset_class` from the same loop (no second pass over holdings).

## 3. State and history

Page state is `{state, scenarioId, memberId}` in React plus a history entry per step. On refresh the history entry is read once and discarded: the page returns to `landing` (L15). The member choice lives in a ref that survives scenario changes and dies with the component (L19).

## 4. Dependencies and delivery order

- **Contract v1.5** (done, uncommitted) before the shell's route registry is built.
- **Shell PR 1** (router, registry, sidebar) before the Planning wrapper route can mount.
- **Home backend plan T1** (`allow_stale_today`) before the Planning backend task that passes it. If T1 slips, Planning can still ship with the cold-open cost; G7 asks.
- The Planning backend (additive API) and the Planning frontend can be built in parallel after the API shapes are fixed in the spec; the frontend stacks on shell PR 1.

## 5. Risks

| Risk | Mitigation |
|---|---|
| Cold open of the results route is slow | stored-price setting (Home T1) plus the timing script; skeletons keep the page usable |
| Per-member requests miss the household cache entry | measured by the timing script; the response is cached client-side by URL |
| Mobile and the old desktop flow import `ScenariosScreen` | L36: variant switch, default classic; existing tests unchanged and green |
| `underlying_asset_class` gains a value later | table-driven test over all return values; unknown goes to Other |
| Member id leaks another household's numbers | 404 on a foreign id, tested |
| Home and Planning group assets differently (four versus six) | note under the chart; accepted by L20 |

## 6. Observability

No new logging. The route keeps its existing error handling; the timing script is the only new tooling. Event tracking is deferred (same as Home).
