# TRI Benchmark Sourcing — Feasibility Confirmed (Free, In-House, Same Endpoint Family)

**Date:** 2026-10-06
**Status:** Investigation complete. **TRI sourcing is confirmed free and reachable** — this
closes the first unconfirmed question in `Docs/orchestration/tri-benchmark-deferred-plan.md`
("Does NSE's endpoint this codebase already uses even serve a TRI series?" → **yes**, via a
sibling endpoint, same host, same auth-free access, no paid NSE data product needed).
**Triggered by:** re-opening Open Question #2 from
`Docs/analytics/2026-10-06-analytics-pdf-attribute-gap-analysis.md` (attribute 12, Historical
Returns + Benchmark Comparison) during analytics-PDF planning — user asked for "a complete deep
dive on TRI sourcing" rather than defaulting to keep-as-is.
**Supersedes:** the open "reachability" question in `tri-benchmark-deferred-plan.md` (steps 1-3
of its "what a real fix requires" list). Does **not** supersede that doc's steps 4-5
(schema/API change, replay-logic re-verification) — those remain the implementation work, not
yet done.

---

## What was tested (live, against the real NSE/niftyindices.com endpoint)

1. **Found the right endpoint.** The codebase's existing `nse_indices_client.py` only calls
   `POST https://www.niftyindices.com/BackPage/getHistoricaldatatabletoString` — price-return
   OHLC data. A separate, sibling endpoint serves Total Return Index data:

   ```
   POST https://www.niftyindices.com/BackPage/getTotalReturnIndexString
   ```

   (Note the exact casing: `BackPage` not `Backpage.aspx` — a `Backpage.aspx`-cased request
   302-redirects to the site's login/home page instead of hitting the handler; this matches the
   existing client's own hard-won `BackPage` casing lesson, confirmed live during this session —
   the `.aspx`-cased variant does **not** work for either endpoint.)

2. **Same request shape, same trading names already in the codebase.** The TRI endpoint accepts
   the identical `{"cinfo": "{...}"}` payload shape and the exact same four trading names already
   defined in `nse_indices_client.py`'s `_TRADING_INDEX_NAME` map (`"Nifty 50"`, `"Nifty 500"`,
   `"NIFTY LARGEMID250"`, `"Nifty Midcap 150"`) — confirmed live for all four:

   | Index | TRI reachable? | Sample (30 Sep 2026) |
   |---|---|---|
   | Nifty 50 | ✅ | TRI 34,371.66 vs PR close 22,620.45 (ratio 1.52×) |
   | Nifty 500 | ✅ | TRI 35,505.86 |
   | Nifty LargeMidcap 250 | ✅ | TRI 20,590.26 (Net TRI not published — `"NTR_Value": "-"`) |
   | Nifty Midcap 150 | ✅ | TRI 27,954.70 (Net TRI not published — `"NTR_Value": "-"`) |

3. **Confirmed historical depth, not just recent data.** Same endpoint, 2020 date range,
   returned real historical TRI values (e.g. Nifty 50 TRI = 17,096.83–17,236.70 for
   1–3 Jan 2020) — the endpoint isn't a recent-data-only shortcut.

4. **Confirmed it's genuinely TRI, not a relabeled price series** (closes the deferred plan's
   second unconfirmed question — "what does the endpoint actually return today"). Spot-checked
   31 Mar 2020 — a well-known date (COVID-crash trading-year end) — against both endpoints in
   the same call:

   - Price-return (existing endpoint): Nifty 50 close **₹8,597.75** — matches the
     independently-known public closing level for that date.
   - TRI (new endpoint): Nifty 50 TRI **12,105.66** — matches the independently-known public TRI
     level for that date, and the ~1.4× TRI/PR ratio for that era is consistent with Nifty 50's
     long-run dividend-reinvestment drift since its 1995 TRI base.

   Two independently-correct, differently-valued numbers for the same date/index is exactly what
   "this endpoint is really serving TRI, not duplicating price data under a different name" looks
   like.

## What's different about the response shape (matters for implementation, not just fetching)

The TRI endpoint's response uses **different field names** than the existing price-return
client's parsing code expects — a direct drop-in reuse of `_fetch_index_history` would silently
break:

| | Price-return endpoint (existing) | TRI endpoint (new) |
|---|---|---|
| Date field | `"HistoricalDate"` | `"Date"` |
| Date format | `"30 Sep 2026"` (`%d %b %Y`) | `"30 Sep 2026"` (same `%d %b %Y` — confirmed identical) |
| Value field | `"CLOSE"` | `"TotalReturnsIndex"` |
| Extra field | — | `"NTR_Value"` (Net Total Return, withholding-tax-adjusted — not published for the two narrower indices; not needed, standard benchmarking uses Gross TRI / `TotalReturnsIndex`) |

## What this changes about the deferred plan

`tri-benchmark-deferred-plan.md`'s own "what a real fix requires" list had 5 steps; steps 1-3 are
now answered:

1. ~~Confirm reachability~~ → **Yes, free, same host, no new auth, no paid NSE product.**
2. ~~If not reachable for free: sourcing/cost decision~~ → **moot, it is free.**
3. ~~Confirm the response's economic content~~ → **Confirmed via the 31-Mar-2020 spot-check
   above.**

Steps 4-5 remain real engineering work, not yet done:

4. **Schema/API change** — `BenchmarkIndexHistory` and the `IndexXirrRow`/`FundBenchmarkRow`
   schemas would need a `series_type: Literal["price_return", "total_return"]` field (per the
   deferred plan's own proposal) so the frontend can render the correct label from data, replacing
   the current hardcoded `" (Price Return)"` suffix. A second small new function (e.g.
   `_fetch_total_return_index`) mirroring `_fetch_index_history` but reading `Date`/
   `TotalReturnsIndex` instead of `HistoricalDate`/`CLOSE` is the fetch-side change.
5. **Re-verify `_benchmark_xirr_for_transactions`'s replay logic is series-agnostic** — per the
   deferred plan, it should already just divide amount by whatever index level it's given, but
   this needs confirming against real TRI values in hand, not assumed.

## Recommendation

Given the only two open feasibility risks (reachability, economic content) are now closed and
confirmed free, **this is a small, well-scoped build, not an open research question anymore** —
on the order of the existing price-return client's own size (`nse_indices_client.py` is ~140
lines). Suggest treating it as a near-term, standalone ticket: add the TRI fetch/cache path
alongside the existing price-return one, backfill history for the 4 benchmark indices, add the
`series_type` field, and switch attribute 12's default comparison to TRI with the price-return
series kept as a fallback/secondary view rather than deleted outright (useful if NSE ever
rate-limits or changes this undocumented endpoint again).

**Not yet decided:** whether to implement this now as part of the analytics-PDF build, or treat
it as a separate small ticket to schedule independently. That's a sequencing call, not a
feasibility one — flagging it rather than silently picking for you.
