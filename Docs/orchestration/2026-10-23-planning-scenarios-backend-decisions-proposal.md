# Planning (market scenarios): backend decisions, proposal (draft v1)

**Status:** proposal only, 2026-10-23. Nothing is appended to `decisions.md` and no schema document is edited until you say so. Numbering (PD1...) is local to this proposal; it becomes the next free numbers in `decisions.md` when you approve.

| # | Decision | Reason |
|---|---|---|
| PD1 | No new table, migration or job for Planning. Everything is additive on the existing scenario API. | Reuse-first; the numbers are sums over stored per-fund results. |
| PD2 | `GET /scenarios/{id}/results` takes an optional `member_id`. A member that does not belong to the account returns 404, never 403. | One parameter instead of a new route; 404 does not reveal that the id exists. |
| PD3 | Add `by_asset_class` to the result: six display groups mapped from the existing `underlying_asset_class`; group percent is group rupee impact over group covered value; frozen and no-data funds are in neither. | Matches the engine's own rule for the headline (rupee impact over covered value). |
| PD4 | Add `is_proxied`, `proxy_basis`, `is_frozen` to the member fund rows; keep `by_fund` in the response unchanged. | The estimate and frozen disclosures move into member rows (L35); mobile and old clients still read `by_fund`. |
| PD5 | Add `description` to the scenario summary and `funds_data_available` to the result. | The card needs the description; the pre-2006 view needs a cheap, truthful flag read from existing rows. |
| PD6 | The results route passes Home's `allow_stale_today` to `compute_holdings`; a read-only timing script measures the route on staging. | Avoids the cold re-download cost found in the Home measurement (4.9 to 24.3 s). Depends on Home T1. |
| PD7 | Hypothetical values and the SEBI disclaimer wording keep their release gates; `SCENARIO_HYPOTHETICALS_ENABLED` stays off. | Existing decisions (2026-10-08). |
| PD8 | The benchmark comparison stays Nifty total-return indices only; the tile compares with Nifty 50 TRI and carries a one-line caveat. | The engine has no Sensex or S&P 500 data (L22). |

**Schema document:** no change (PD1). **Deferred list:** unchanged (retirement and goal planning are not added; L33).
