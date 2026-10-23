# Individual fund page: backend decisions (proposal, not appended to `decisions.md`)

**Status:** proposal, 2026-10-23. Doc 9. Append to `decisions.md` only on the owner's go. Format: decision, why, reuse alternative. Ids BDF1 to BDF12 so they do not collide with Home's BD1 to BD17.

| # | Decision | Why | Reuse alternative / note |
|---|---|---|---|
| BDF1 | New read-only router `/fund-page/{scheme_id}/...` with `scope=combined\|<member id>` | one prefix for the page, same scope vocabulary as Analytics (S4) | existing `/funds/{id}/nav-history` and `/analytics/funds/{id}/score` stay as they are |
| BDF2 | Three tiers; tier 3 (peers, score, insights) loads lazily | keeps tiers 1 and 2 independent of the expensive peer pass | one blocking endpoint (rejected) |
| BDF3 | The page never starts a recompute and reads stored sections `score`, `benchmark_funds`, `overlap`, `allocation` | same posture as Home BD2 | compute only this fund when a section is missing |
| BDF4 | `compute_holdings` gains optional `scheme_ids` and `allow_stale_today` | the household-wide call costs about 375 to 510 ms per fund cold (Home run) and the page needs one fund; the setting is the one Home already needs (BD3) | a duplicate function (rejected: copies lot logic) |
| BDF5 | Prices come from the store; one live fetch only for a fund with no NAV in 3 days | consistency with Home BD3; measured 23 Oct: with no row dated today the household-wide call took 20 to 22 s on both runs and a one-fund price check 0.5 to 0.8 s, so the cost repeats on every cold call (S10) | none |
| BDF6 | Peer results cached in process, key `(category, plan, day, kind, period)`, 15 minutes, single-flight lock; no table | peer results are scheme-wide, not per user; `analytics_sections` is keyed per user | measured 2.0 to 4.5 s cold per fund, 1.2 to 1.7 s of it the first score, and a second fund in the same category hit the cache (86 ms); a small reference-data cache table only if production shows cold passes are common (S2) |
| BDF7 | Risk metrics computed on daily NAV returns over 3 years; Sharpe uses a risk-free rate from one setting; band thresholds in a constants module per fund class | A3 A; values are the owner's (S6) and calibrated before locking | none |
| BDF8 | Benchmark, beta and benchmark lines shown only for equity-oriented categories | `_benchmark_index_for_category` folds debt, hybrid and gold into Nifty 500 (S9) | add proper indices later |
| BDF9 | Insight sentences are fixed templates rendered on the server with their evidence; thresholds in one constants module | L8, C4; sentence and evidence cannot disagree (S3) | frontend templates (rejected) |
| BDF10 | Folio numbers are masked in the summary; the full number comes from a separate authenticated call on copy | personal financial identifier (S7) | ship the full number and mask in the browser (rejected) |
| BDF11 | Withdrawn 23 Oct: the monthly added/removed stocks block was dropped by the owner, so no batch diff and no dependency on the three-month retention | owner | none |
| BDF12 | No new table, migration or job | reuse-first; all inputs exist | none |
| BDF13 | Peer month-end series built with a lean query (tuples or month-end rows chosen in SQL), not full ORM rows | the 10-year series for 35 to 46 peers took 1.4 to 2.0 s, the largest tier 3 cost; the 3-year daily read of 22k to 29k rows took 0.14 to 0.28 s | reuse `build_monthly_series_bulk` as is (works, slower); change only if the build misses the tier 3 budget; the scorer's use of it is untouched |
| BDF14 | The scatter uses daily 3-year returns for every peer | each dot then matches the Overview risk card; costs about 0.2 to 0.3 s on staging (S14) | monthly basis (cheaper, dots differ from the card) |

Open and not decided here: S1 to S14 in the design workbook; the staging script output; the risk-free rate value (owner).
