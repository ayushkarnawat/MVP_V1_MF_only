# Data Resources Reference

**Read this before searching the internet for a data source.** This is a single,
cumulative index of every external data source, API, library, or technique Unifolio
has found useful (or ruled out) across any attribute, sub-project, or feature — not
scoped to whatever task first surfaced it. Check here first; if what you need isn't
here, go research it, then **add what you find here** before closing out the task,
so the next session (or the next attribute) doesn't repeat the same research.

One file, not one-per-resource — append new rows/sections rather than creating a
new doc per source. Keep each entry tight: what it is, what it's used for today (if
anything), access pattern, and known caveats/limits. Link out to a dedicated
investigation doc for the full story where one already exists.

## How to use this

1. Looking for a data source for a new attribute/feature? Scan the relevant section
   below first.
2. Found something new, or discovered a source already listed here is now broken,
   paid-walled, or has changed shape? Update this file in the same session — don't
   leave it for later.
3. A source found while working on one thing but useful elsewhere (e.g. a stock-data
   library found while building a benchmark) belongs here regardless of which task
   found it. See [[feedback_cross_cutting_resource_discovery]] in memory.

---

## Mutual fund core data (NAV, scheme master, TER, AAUM, market cap)

| Source | What it provides | Access | Status / caveats |
|---|---|---|---|
| **AMFI NAV/scheme-master feeds** | Daily NAV, scheme master (ISIN, AMFI code, category) | `amfiindia.com` bulk NAV file (existing, long-standing integration) | Live, core to the whole platform |
| **AMFI TER** | Monthly Direct/Regular TER per scheme | `https://www.amfiindia.com/api/populate-ter-month`, `.../api/populate-te-rdata-revised` (JSON, `{"data":[...],"meta":{...}}` envelope — don't assume a bare list) | Live. `backend/app/services/analytics/amfi_ter_client.py`. Matched by SEBI scheme code (`NSDLSchemeCode`), not fuzzy. **Full history back to at least FY2019-2020 is fetchable directly from this API**, independent of Unifolio's own ingestion job (built 2026-08-11) — confirmed by a Scorer V2 calibration run, 2026-10-21. **Caveat — real schema break confirmed live:** `NSDLSchemeCode` is `null` in older months (match by normalized `Scheme_Name` instead, there pre-2026); and the row schema itself changes between Jan-2026 and Apr-2026 (pre: `R_BaseTER`/`R_6A_B`/`R_6A_C`/`R_GST`; post: `R_BER`/`R_BrokerageCost`/`R_TransactionCost`/`R_StatutoryLevies`, likely the SEBI TER-disclosure overhaul) — `R_TER`/`D_TER` are the only field names stable across both eras, but the *total* they represent was redefined, so any multi-year TER comparison that straddles Jan–Apr 2026 is comparing two different things, not real fund-level drift. Confirmed by both a single-page schema probe and an empirical run where removing the straddle flipped the result from "+9.93bps rising" to "-4.07bps falling." See `Docs/Scorer-V2/Scorer-v2-Calculation-Annex-Open-Questions.md` item 5 for the full calibration. |
| **AMFI AAUM** | Scheme-wise Average AUM, half-yearly | `https://www.amfiindia.com/api/average-aum-schemewise` | Live. `amfi_aaum_client.py`. Years/periods endpoints return CSV-style strings inside `data`, not JSON arrays — see module docstring. `id` counts down (lower id = more recent). Per-scheme row shape: `AMFI_Code` + a nested `AverageAumForTheMonth` object, the value is under its `ExcludingFundOfFundsDomesticButIncludingFundOfFundsOverseas` key, not top-level. **Full history back to April 2006 (21 financial years) is fetchable directly from this API**, independent of Unifolio's own ingestion job — confirmed 2026-10-21. `AMFI_Code` matching is stable across years (no equivalent of the TER schema break above). **Window-length lesson (2026-10-21 Scorer V2 re-audit):** an initial Cost Trend calibration pulled AUM on a 36-month window (Jul-Sep 2023 vs Jul-Sep 2026) while TER was pulled on a 24-month window — two different window lengths feeding thresholds meant for the same single comparison window. Re-pulled matched at 24 months (Jul-Sep 2023 vs Jul-Sep 2025, 6,637 matched schemes): median abs change 40.4%, p90 335.7%, 14.3% under 10%. Lesson for any future multi-signal calibration: always match the comparison window length across every signal feeding one formula, not just within each signal's own research. **Second lesson, same re-audit:** a full density curve (2-point resolution, 0-40%) showed AUM's % change has no sharp "elbow" anywhere near 10% — density is flat-to-rising through 18% and only thins past ~20-24%. Unlike TER (a real discontinuity: 23.5% of funds report *exactly* zero, a precision-of-reporting artifact), AUM is continuous with no equivalent spike — don't reuse "natural elbow" framing for a continuous measure without checking the actual density curve first, not just two cumulative cut points. **Third lesson, same re-audit:** the dead-zone was moved from 10% to 20% because raw AUM % change is not a clean flow signal — it conflates net new money (the thing actually worth measuring) with pure NAV/price appreciation (AUM rises with zero net flow whenever the market is up, and Indian equity markets routinely clear 10%+ cumulative over 2 years). Any future metric built on raw AUM-change-as-a-proxy-for-flow should either net out market appreciation first or set its threshold well above typical multi-year market-return noise, same reasoning as here. |
| **AMFI Market Cap classification** | Half-yearly large/mid/small-cap classification per ISIN | Per-period PDF links at `amfiindia.com`/`portal.amfiindia.com` (filenames drift each period — hardcoded per period, not a stable pattern) | Live. `amfi_market_cap_client.py`. New period = add a new verified URL, don't guess the pattern. |
| **AMFI factsheet directory** | Monthly fund-manager-per-scheme attribution, sourced per-AMC (no AMFI bulk feed for this) | `https://www.amfiindia.com/online-center/download-factsheets` (directory) → ~60 individual AMC factsheet URLs, one resolver per AMC in `fund_manager_resolvers.py` | Live for most AMCs. **10 AMCs need manual monthly import, 5 have no factsheet at all** — this is Priority 1 in `DEFERRED_FEATURES.md`, don't re-derive the per-AMC URL list here, it's already the canonical registry. |

## Benchmark indices (equity, debt, hybrid)

| Source | What it provides | Access | Status / caveats |
|---|---|---|---|
| **NSE historical/TRI endpoints** | Historical price-return and Total Return Index series for a *named* index | POST `https://www.niftyindices.com/BackPage/getHistoricaldatatabletoString` and `.../getTotalReturnIndexString`. `cinfo` payload is a Python-dict-repr **string** (single quotes), e.g. `{"cinfo": "{'name':'<INDEX NAME>','startDate':'...','endDate':'...'}"}` | Live, `nse_indices_client.py`. **Must use `/BackPage/` casing** — `/Backpage.aspx/...` (what the old TDD doc said) returns a generic ASP.NET error. `liveindexsa.niftyindices.com` returns HTTP 405 for this POST — use `www.niftyindices.com`. |
| **NSE discovery API** (3 endpoints) | Enumerates NSE's *entire* live index catalog — top-level category → sub-category → exact canonical index names — so you never have to guess an index name | `gethistoricaltypedata1` (POST, no params) → `gethistoricaltypeSubindexdata` (POST, JSON `{"cinfo":{"indextype":"<category>"}}`) → `gethistoricaltypeindexdata` (POST, **form-urlencoded**, `cinfo[indextype]`/`cinfo[indexgroup]`). `indexgroup` = data type: `Historical Index Data` / `Total returns Index Values ` (trailing space) / `P/E, P/B & Div.Yield values`. Called from `developer.js` on NSE's historical-data page — plain jQuery `$.ajax`, no auth/session needed. | **Use this before guessing any new index name**, for benchmarks or valuation data. Cracked via `jugaad-data`'s source — see Techniques/Libraries section below. Full writeup: `Docs/Scorer-V2/scorer-v2-benchmark-coverage-expansion-research.md`. An index being enumerable here doesn't guarantee it's populated (Corporate Bond sub-category exists, returns `[]`). |
| **NSE PE/PB/Div-Yield data** | Index-level valuation series | Same discovery API, `indexgroup: "P/E, P/B & Div.Yield values"`; also `INDEX_VALUATION_URL = https://www.niftyindices.com/BackPage/getpepbHistoricaldataDBtoString` (already used in `stock_fundamentals_client.py`) | Live. Cross-check task #6 (Scorer V2 valuation aggregator) against this before re-deriving index names — see `Docs/analytics/investigations/2026-10-13-attribute-15-pe-pb-sourcing-feasibility.md`. |
| **Yahoo Finance unofficial chart API** | International index history (e.g. S&P 500) | `https://query1.finance.yahoo.com/v8/finance/chart/<ticker>` (e.g. `^GSPC`) — clean JSON, no auth | Live, Scorer V2's "International" benchmark category. Same mechanism (ticker-based chart JSON) also usable for FX pairs, e.g. `USDINR=X` — see Gold section below. |
| **Corporate Bond / Aggressive Hybrid official benchmarks (CRISIL)** | The actual SEBI/AMFI Tier-1 mandated benchmarks for these two categories (`CRISIL Corporate Debt A-II Index`, `CRISIL Hybrid 35+65 – Aggressive Index`) | CRISIL's own indices portal — **no free API, explicit no-redistribution terms** | **Ruled out.** Confirmed no free path exists; this is why Corporate Bond/Hybrid need the Scorer V2 fallback treatments (exclude+reweight / synthetic blend) documented in the benchmark-coverage-expansion doc. Don't re-investigate CRISIL access unless something changes (e.g. a future paid-data-licensing decision). |

## Gold / commodity price data

| Source | What it provides | Access | Status / caveats |
|---|---|---|---|
| **MCX bhavcopy / iCOMDEX Bullion** | Daily futures settlement price for gold contracts | `mcxindia.com/market-data/bhavcopy`, free CSV/PDF, no login (page itself 403s to a plain `curl`/WAF — likely needs a browser UA or headless fetch at implementation time, not proof it's inaccessible) | **Free depth is shallow**, contrary to earlier assumption: MCX's own datafeed page states free historical data is limited (~3 months, excluding the most recent 12 months) — bulk multi-year history requires a formal request. A daily scraper can only accumulate forward from today, same backfill problem as IBJA below. Also a conceptually weaker fit — futures settlement price, not SEBI's literal "Domestic Price of (Physical) Gold" benchmark language. |
| **IBJA official rate** | India's standard domestic gold spot-price reference (also the SGB/RBI gold-lending reference) | Official paid API: `https://ibjarates.com/API/GoldRates/?ACCESS_TOKEN=...&START_DATE=...&END_DATE=...` (needs a registered token) | Paid only for programmatic/date-range historical access. |
| **IBJA homepage chart data** | Trailing gold/silver rate chart shown on `ibjarates.com` | **Not an API** — data is server-rendered directly into a hidden `<input id="HdnGold">` field as JSON at page-load time (ASP.NET WebForms pattern), read by an inline script and fed to Chart.js | **Ruled out as a free historical source.** Window observed: ~4 trailing months only, no date-range parameter exists to request more — there's nothing to "call" beyond re-scraping the homepage, and no way to backfill years of history. |
| **Third-party IBJA scrapers** (`0xSaurabhx/IBJA-API`, fork `the-solipsist/IBJA-API`) | Unofficial wrapper exposing IBJA rates as JSON (`/latest`, `/history`, `/changes/weekly`) | Open-source, deployed on Vercel | Confirmed to exist, but its README doesn't establish genuine multi-year depth for `/history` — the only explicit depth claim anywhere in its docs is a 30-day PDF window. Likely same accumulate-forward limitation as scraping IBJA directly. Not pursued further; see LBMA reconstruction below instead. |
| **LBMA Gold Price (daily PM fix)** | The actual international benchmark AMC Gold ETF SIDs cite as their pricing basis | GitHub repo [`unbalancedparentheses/forex-centuries`](https://github.com/unbalancedparentheses/forex-centuries), file `data/sources/lbma/lbma_gold_daily.csv` — `date, gold_pm_usd, gold_pm_gbp, gold_pm_eur`, daily from 1968, **auto-updated weekly via GitHub Actions CI** | **Recommended path for Gold** — see below. World Gold Council's own Goldhub site removed free historical LBMA data in March 2025 (ICE Benchmark Administration request) — only a since-1978 monthly/quarterly/annual currency-averages Excel remains free there, not daily. This community-maintained CSV is the practical free daily source. |
| **USD/INR daily rate** | Needed to convert LBMA USD price to INR | RBI reference rate (what AMC SIDs literally cite — `rbi.org.in`, exact free historical API shape not yet reverse-engineered) **or** Yahoo Finance `USDINR=X` via the same chart-JSON mechanism already proven for International (lower implementation effort, same code path) | Yahoo Finance recommended for implementation simplicity; RBI's own rate is the more literally-exact source if ever worth the extra reverse-engineering effort. |
| **Import duty + GST** | The remaining terms in AMC SIDs' actual benchmark formula: `Domestic Gold Price = (LBMA price × USD/INR rate) + import duty + GST + local premium` | Policy values, not a data feed — a handful of discrete rate-change dates (e.g. 15%→6% Jul 2024, 6%→15% May 2026) + GST flat 3% since Jul 2017 | Needs a small manually-maintained lookup table (duty rate by effective-date range), same maintenance pattern as other regulatory tables already in this codebase (e.g. scheme categorization rules). |

**Gold recommendation (per the SID formula confirmed via live search — see
`scorer-v2-benchmark-coverage-expansion-research.md`):** reconstruct "Domestic Price
of Gold" as `LBMA PM fix (forex-centuries CSV) × USD/INR (Yahoo Finance) × (1 + import
duty + GST)`. This is literally the formula Gold ETF SIDs (e.g. ICICI Prudential Gold
ETF) say they benchmark against — a far closer conceptual match than MCX futures, and
with genuine multi-decade daily backfill already available today, unlike IBJA. Must
still be labeled "Unifolio-reconstructed" (same disclosure discipline as the Hybrid
blend) since it's an approximation of the SID formula (PM fix vs AM fix, no local
transaction-charge premium), not an official index feed. MCX remains the documented
fallback-of-last-resort if this reconstruction's sources (the GitHub CSV, specifically)
ever become unavailable.

## Stock / equity data

| Source | What it provides | Access | Status / caveats |
|---|---|---|---|
| **NSE archives (PE, security master)** | Daily stock-level PE ratios; security master list | `https://nsearchives.nseindia.com/content/equities/peDetail/PE_{date}.csv`, `.../content/cm/NSE_CM_security_{date}.csv.gz` | Live, `stock_fundamentals_client.py`. |
| **NSE/niftyindices constituents** | Index constituent lists (e.g. Nifty 500) | `https://archives.nseindia.com/content/indices/ind_nifty500list.csv`, `https://www.niftyindices.com/IndexConstituent/ind_nifty50list.csv` | Live. |
| **Yahoo Finance quoteSummary** | Per-stock fundamentals (quote data) | `https://query2.finance.yahoo.com/v10/finance/quoteSummary/{symbol}.NS` — needs a crumb/cookie handshake first (`fc.yahoo.com` → `finance.yahoo.com/quote/{symbol}.NS` → `query2.finance.yahoo.com/v1/test/getcrumb`) | Live, `stock_fundamentals_client.py`. More setup than the simple chart-JSON endpoint used for indices. |
| **screener.in** | Fallback per-stock fundamentals | `https://www.screener.in/company/{symbol}/consolidated/` | Live, used as a fallback source in `stock_fundamentals_client.py`. |

## AMC portfolio disclosures (look-through)

Full detail already lives in Sub-project 2's own docs — not duplicated here, just
pointed to: `Docs/analytics/investigations/2026-10-09-amc-portfolio-disclosure-spike-consolidated.md`
and `Docs/analytics/plans/2026-10-10-sub-project-2-lookthrough-ingestion-plan.md`.
`portfolio_disclosure_client.py` orchestrates per-AMC monthly disclosure file
discovery/fetch/parse (Locate/Fetch/Parse/Normalize/Write), including a Wayback
Machine (`web.archive.org/cdx/search/cdx`) fallback for AMCs that don't keep an
accessible history of their own disclosure files.

## CAS parsing

`casparser` (third-party library) — the parser for CAMS/KFintech Consolidated Account
Statements. Already fully documented in `Docs/CAS Parsers/MF CAS Parsers.md`; not
duplicated here. Relevant note: the 10-year statement value-discrepancy investigation
traced likely causes to this library's page/fund-boundary detection, not Unifolio code
— see `Docs/investigations/2026-10-01-cas-10-year-parsing-discrepancy-handoff.md`.

## Techniques / libraries (not data sources themselves, but how to find them)

| Resource | What it is | Why it's useful |
|---|---|---|
| **`jugaad-data`** (PyPI, [github.com/jugaad-py/jugaad-data](https://github.com/jugaad-py/jugaad-data)) | Open-source Python wrapper around NSE's/niftyindices.com's undocumented endpoints — index history, TRI, PE/PB, stock history/quotes, and the 3-endpoint discovery API above | Reading its actual source (`jugaad_data/nse/history.py`) is what cracked the discovery API's exact payload shapes (JSON vs form-urlencoded, exact field names) in this session, after hours of guessing wrong. **General principle: when a site only exposes data through its own undocumented AJAX calls, check for an open-source wrapper and read its source before reverse-engineering from scratch.** Also a standing candidate for any future stock/index data need (see Task #12 in the task list). |
| `nsepython` (PyPI) | A sibling NSE-data wrapper package | Downloaded but not deeply compared against `jugaad-data` yet — worth evaluating both together when picked up. |
| [satwikbasu/indian-market-data-endpoints](https://github.com/satwikbasu/indian-market-data-endpoints) | Community reverse-engineering writeup of NSE's historical/TRI *data* endpoints (headers, payload quirks) | Useful background on the two data endpoints; does not cover the 3 discovery endpoints. |

---

*Maintenance note: when a source above is reverified, superseded, or found broken,
update its row in place with the date and what changed — don't leave stale status
claims standing. This file has no owner-task; any session working any attribute can
and should edit it.*
