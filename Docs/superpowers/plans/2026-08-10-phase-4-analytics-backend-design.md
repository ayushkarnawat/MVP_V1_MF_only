# Phase 4 — MF Analytics Dashboard Backend — Design & Research

**Companion to:** `2026-08-10-phase-4-analytics-backend-part1-allocation.md` (first
implementation plan; later subsystems get their own plan files per the Scope Check
rule in `superpowers:writing-plans` — this design doc is shared across all of them).

**Governing spec:** `Docs/PRDs/PRD-04-MF-Analytics-Dashboard.md`

This doc exists because PRD-04's External Integrations were marked "resolved
approach" / "resolved, concretely" in `TDD-Unifolio.md` without a live-verified,
concrete request/response shape — the same situation the ARN-lookup work hit in
Phase 3, where the originally-cited approach turned out to be dead. Every endpoint
below was independently verified via direct HTTP calls during this session
(2026-08-10), not assumed from documentation.

## Resolved open questions (PRD-04)

1. **Return window** (PRD-04 Open Question 1): 3-year minimum NAV history to
   qualify a scheme for ranking/scoring at all; 5-year blended in once available
   for schemes old enough to have it; no 10-year window. Confirmed with the user.
2. **Cost-overlay nudge magnitude** (PRD-04 Open Question 2): explicitly left to
   Claude's technical judgment, no sign-off needed. Resolved below in the Scorer
   section.

## Build order (confirmed with user)

1. Allocation (FR-1, FR-2)
2. AMFI TER + AAUM integrations → weighted TER (FR-10, FR-11)
3. NSE Indices integration → benchmark comparison (FR-8, FR-9)
4. Category-universe NAV caching → category ranking/comparison (FR-3, FR-4)
5. Scorer (FR-5, FR-6, FR-7) — last, depends on TER (step 2) and category
   ranking (step 4)

Each subsystem ships as its own plan file and produces independently working,
testable software — per the Scope Check in `superpowers:writing-plans`.

---

## 1. Category-universe data-gap — found and resolved this session

**The gap:** FR-3/FR-4/FR-5a need, for a given SEBI category, the *full universe*
of schemes in that category (to rank a held scheme against all its peers and
compute an AUM-weighted category average). `mfapi.in`'s bulk scheme-list endpoint
(`GET https://api.mfapi.in/mf`, used by `MfApiClient.get_scheme_list()`) returns
~40,000 schemes with **no category field**. Per-scheme category lookup
(`MfApiClient.get_scheme_category()`) is one HTTP call per scheme — infeasible to
run across the full universe just to build a category index.

**The resolution:** AMFI publishes a bulk file, `NAVAll.txt`, that groups every
live scheme under a category header line:

```
GET https://www.amfiindia.com/spages/NAVAll.txt
```

- Returns **HTTP 302** to `https://portal.amfiindia.com/spages/NAVAll.txt` — must
  follow the redirect (`httpx.AsyncClient(follow_redirects=True)`).
- ~1.6MB, ~17,700 lines, semicolon-delimited, structured as:
  ```
  Scheme Code;ISIN Div Payout/ ISIN Growth;ISIN Div Reinvestment;Scheme Name;Net Asset Value;Date

  Open Ended Schemes(Debt Scheme - Banking and PSU Fund)

  Aditya Birla Sun Life Mutual Fund

  119551;INF209KA12Z1;INF209KA13Z9;Aditya Birla Sun Life Banking & PSU Debt Fund  - DIRECT - IDCW;107.0971;07-Aug-2026
  ...
  ```
  i.e. a category header line (`Open Ended Schemes(<category>)` /
  `Close Ended Schemes(<category>)` / `Interval Fund Schemes(<category>)`), then
  one or more AMC-name header lines, then scheme rows under each, until the next
  header. Blank lines separate all of these.
- Confirmed live: 90 distinct category headers, e.g.
  `Open Ended Schemes(Debt Scheme - Banking and PSU Fund)`,
  `Open Ended Schemes(Equity Scheme - Flexi Cap Fund)`,
  `Open Ended Schemes(Hybrid Scheme - Aggressive Hybrid Fund)`, etc.

**Format compatibility — verified, no reconciliation needed.** Local
`schemes.sebi_category` is populated (`import_/service.py`'s `_resolve_category`)
from mfapi.in's per-scheme metadata field `meta.scheme_category`. Live-checked
against scheme code 119551:

```
GET https://api.mfapi.in/mf/119551 → meta.scheme_category = "Debt Scheme - Banking and PSU Fund"
```

This is **exactly** the text inside `NAVAll.txt`'s header parens for that same
scheme (`Open Ended Schemes(Debt Scheme - Banking and PSU Fund)`). So the
ingestion rule is a plain regex extraction —
`r"^(?:Open Ended|Close Ended|Interval Fund) Schemes\((.+)\)$"` — with **zero**
string-format reconciliation against the existing `sebi_category` values. A
scheme's category from `NAVAll.txt` is directly comparable to (and joinable with)
`schemes.sebi_category` as already stored.

**Ingestion design:** a new `app/services/analytics/scheme_universe.py`, following
`import_/enrich.py`'s established disk-cache idiom (not `nav.py`/`arn_lookup.py`'s
DB-row cache idiom — this is a bulk universe file, not a resolve-once-per-key
value): fetch-and-parse `NAVAll.txt` into `(amfi_code, isin, name, amc_name,
sebi_category)` rows, cached on disk for 24h (mirrors `MfApiClient`'s
`SCHEMES_TTL`). `get_category_universe(db, sebi_category)` filters the parsed
rows to one category, and for each row does a `db.get`-or-create against
`schemes` keyed by `amfi_code` (new rows get `plan_name_variant=None` —
irrelevant for return-ranking, which operates per scheme code/NAV series
regardless of direct/regular). This directly answers "give me every scheme in
category X" without a single per-scheme mfapi.in call.

## 2. AMFI TER integration (FR-10, FR-11)

```
GET https://www.amfiindia.com/api/populate-ter-month?year=<FY>
Referer: https://www.amfiindia.com/ter-of-mf-schemes
```
`<FY>` is a financial-year string, e.g. `"2025-2026"` (April–March). Returns a
list of months with data, each with `MonthNumber` (format `MM-YYYY`).

```
GET https://www.amfiindia.com/api/populate-te-rdata-revised?MF_ID=All&Month=<MM-YYYY>&strCat=-1&strType=-1&page=<N>&pageSize=<N>
```
Returns TER rows with `Scheme_Name` (generic — no Direct/Regular plan suffix),
`SchemeCat_Desc`, `TER_Date`, `R_TER` (Regular plan %), `D_TER` (Direct plan %).
Republished daily even when the value hasn't changed — take the **latest**
`TER_Date` per scheme within the requested month, not every row.

**No shared join key.** AMFI's `NSDLSchemeCode` in this feed does not match our
`amfi_code` (mfapi.in's scheme code) or `isin`. Matching is by fuzzy name, same
`difflib.SequenceMatcher` idiom as `enrich.py`'s `_normalize_name`/
`fuzzy_match_scheme` (PRD-01's stdlib-only constraint applies equally here — no
new fuzzy-matching dependency). Since `Scheme_Name` here is plan-generic (one row
covers both Direct and Regular), the local match applies `R_TER` to locally-known
schemes whose `plan_name_variant == REGULAR` and `D_TER` to
`plan_name_variant == DIRECT`, both against the same matched `Scheme_Name`.

**Reference period:** first day of the `Month` value from `populate-ter-month`
(schema's `scheme_ter.reference_period` is "month TER applies to", a `date`).

## 3. AMFI AAUM integration (FR-4, FR-10)

```
GET https://www.amfiindia.com/api/average-aum-schemewise?strType=Typewise&MF_ID=0
→ {"type":"financial_years","data":[{"id":1,"financial_year":"April 2026 - March 2027"}, ...]}

GET .../average-aum-schemewise?strType=Typewise&MF_ID=0&fyId=<id>
→ periods/quarters within that financial year

GET .../average-aum-schemewise?strType=Typewise&MF_ID=0&fyId=<fyId>&periodId=<periodId>
→ scheme-wise AAUM data, grouped by AMC
```
Each scheme row carries a clean `AMFI_Code` field — **directly joinable** to
local `schemes.amfi_code`, no fuzzy matching needed (unlike TER). Value field:
`AverageAumForTheMonth.ExcludingFundOfFundsDomesticButIncludingFundOfFundsOverseas`.

**Reference period:** representative date for the quarter/period — use the last
day of the period's ending month (schema's `scheme_aaum.reference_period`).

**Two distinct meanings of "AUM-weighted" in PRD-04 — do not conflate:**
- **FR-4** (category-average comparison) and **FR-6** (portfolio score roll-up
  where category context matters): weighted by each *fund's* platform-wide AAUM
  from this integration.
- **FR-10** (user's own portfolio TER): weighted by the *user's holding value* in
  each fund (`current_value` from `compute_holdings`), not by the fund's AAUM —
  this is "what expense ratio is your money-weighted average paying", a
  holding-value-weighted average, unrelated to `scheme_aaum`.

## 4. NSE Indices benchmark integration (FR-8, FR-9)

**Correction to `TDD-Unifolio.md`:** the TDD documents this endpoint as
`POST .../Backpage.aspx/getHistoricaldatatabletoString` ("resolved, concretely").
That path is **stale** — live-tested, it returns a generic ASP.NET error (HTTP
302 to an error page). Root-caused via the site's own JS bundle
(`IISLComponet.js`): the old `.aspx` path is commented out in source, superseded
by a path with no `.aspx` extension. Live-verified working endpoint:

```
POST https://www.niftyindices.com/BackPage/getHistoricaldatatabletoString
User-Agent: <a normal browser UA — the site drops requests without one>
Content-Type: application/json

{"cinfo": "{\"name\":\"<Trading_Index_Name>\",\"startDate\":\"DD-MMM-YYYY\",\"endDate\":\"DD-MMM-YYYY\",\"indexName\":\"<Trading_Index_Name>\"}"}
```
Returns an array of `{HistoricalDate, OPEN, HIGH, LOW, CLOSE}` per trading day.
Verified working against `www.niftyindices.com` and `niftyindices.com`. Do
**not** use `liveindexsa.niftyindices.com` for this call — confirmed HTTP 405
(`UnsupportedHttpVerb`) for POST there.

**`Trading_Index_Name` mapping** — our 4 `BenchmarkIndex` enum members don't
match NSE's index name strings verbatim. Resolved via
`https://liveindexsa.niftyindices.com/assets/json/IndexMapping.json` (note:
parse with `encoding="utf-8-sig"` — the file has a UTF-8 BOM that breaks
`json.load` otherwise):

| `BenchmarkIndex` enum | `Trading_Index_Name` |
|---|---|
| `NIFTY_50` | `Nifty 50` |
| `NIFTY_500` | `Nifty 500` |
| `NIFTY_LARGEMIDCAP_250` | `NIFTY LARGEMID250` |
| `NIFTY_MIDCAP_150` | `Nifty Midcap 150` |

This mapping is static (four enum members) — hardcode it as a dict in the new
integration module; no need to fetch `IndexMapping.json` at runtime.

**This TDD staleness should be corrected in `TDD-Unifolio.md`** when the first
benchmark-comparison plan lands, the same way the ARN endpoint correction was
handled in Phase 3 (flagging here per CLAUDE.md's "stop and say so" instruction
— not silently left as-is, not silently rewritten without telling you).

## 5. XIRR (FR-8, FR-9)

No XIRR implementation exists anywhere in the codebase yet. **Design decision:**
pure `decimal.Decimal` Newton-Raphson — no numpy/scipy, no float. Python's
`Decimal` supports fractional exponents via `**` for a non-negative base, so
`(1 + rate) ** (days / 365)` stays exact-arithmetic (`Decimal ** Decimal`)
throughout, satisfying CLAUDE.md's Decimal-never-float rule without a new
dependency. Full algorithm and code in the relevant task's plan file (Part 3 —
Benchmark Comparison), not repeated here.

Both portfolio XIRR and benchmark-hypothetical XIRR reuse the same cash-flow
convention: purchase/SIP outflows (negative) and redemption/dividend-payout
inflows (positive) at their transaction dates (same classification as
`cash_flow.py`'s `_DEBIT_TYPES`/`_CREDIT_TYPES`, switches excluded as
intra-portfolio, consistent with existing FR-7 cash-flow logic), plus one
terminal inflow at today's date equal to current holding value (portfolio XIRR:
`current_value` from `compute_holdings`; benchmark XIRR: each historical
transaction's amount converted to "index units" bought at that date's index
level, valued at today's index level).

## 6. Scorer (FR-5, FR-6, FR-7)

Full formula and percentile-bucketing algorithm specified in Part 5's plan file
(built last, after TER and category ranking exist). Cost-overlay nudge magnitude
(Open Question 2, Claude's call): a scheme whose TER is below its category's
AUM-weighted average TER gets `+0.25` added to `cost_adjustment`
(`fund_scores.cost_adjustment`, `Numeric(3,2)`); above average gets `-0.25`;
within 0.05 percentage points of the average (a dead zone, since TER differences
that small are noise-level, not a meaningful "cheaper/more expensive" signal)
gets `0`. Chosen to be a visible but not tier-dominating nudge — the scheme's
tier (risk_adjusted_tier: 1–5) already carries most of the score, and ±0.25
against a 5-point tier scale is a real but secondary adjustment, matching FR-5b's
framing of cost as a secondary overlay, not a primary ranking axis.

## Reference — verification artifacts (not committed, scratch only)

Captured this session under
`/tmp/claude-1000/-mnt-d-Unifolio-code/04ac52ec-754c-4c24-8860-af984a3d07d1/scratchpad/`:
`ter_page.html/js`, `nse_page.html`, `historicalData.js`, `IISLComponet.js`,
`indexmapping.json`, `aaum_page.html/js`, `navall.txt`. Scratch verification only
— not part of the repo, not a data source any code should read from at runtime.
