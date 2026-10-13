# Attributes 02 / 06 / 10 / 13 / 15 — Look-Through Consumers: Design Spec

**Date:** 2026-10-12
**Status:** Written directly per the standing "continue straight through 1→5" instruction
(same precedent as the 2026-10-09 engine spec itself — see its own status line). Originally
flagged two open items inline (§7.1's schema amendment, §7.2's P/E/P/B fetch mechanism) rather
than silently resolving them — both are now closed (§7.1 approved 2026-10-12; §7.2 fully
resolved and its sourcing-preference sub-question finalized 2026-10-13, see §7.2). Zero open
items remain in this document as of 2026-10-13.
**Depends on:** `Docs/analytics/2026-10-09-sub-project-2-lookthrough-engine-spec.md` (the
two-table ingestion data model — `disclosure_batches`/`scheme_holdings` — and the five-stage
pipeline). That spec explicitly carved this compute/UI layer out of its own scope: *"This
spec does not cover attributes 02/06/10/13/15's own compute logic... that's each attribute's
own implementation plan, written against this spec's two tables as its data source."* This
document is that implementation.
**Source of truth for formulas/UI intent:** `Docs/analytics/2026-10-06-analytics-pdf-deep-
understanding.md` §3 (sections 02, 06, 10, 13, 15) — restated here only where the restatement
adds implementation-level detail; not re-derived from scratch.
**Companion artifact:** `Docs/analytics/artifacts/2026-10-12-attributes-02-06-10-13-15-
lookthrough-consumers-visual-map.html`
**Implementation plan:** `Docs/analytics/plans/2026-10-12-attributes-02-06-10-13-15-
lookthrough-consumers-plan.md`

## 1. Why these 5 are one design document, not five

All five attributes are named together in the engine spec's own scope line because they share
one upstream fact: every one of them is a different slice of the same `scheme_holdings` table,
multiplied through the same fund-weight × stock-weight formula. Building them as five
independent features would mean five different places re-deriving "what does this client
actually hold," which is precisely the mistake the PDF's own section 00 write-up calls out by
name (`Docs/analytics/2026-10-09-...-spec.md` calls this "the shared service" principle). So
this spec's first and most load-bearing decision is architectural, not per-attribute: **one
shared compute function, one shared result type, five thin consumers.**

## 2. The shared look-through table (powers all five)

**New module:** `backend/app/services/analytics/lookthrough.py`

```python
@dataclass(frozen=True)
class LookthroughStockRow:
    isin: str | None                 # None only for cash/CBLO/TREPS/Net Receivables lines
    instrument_name: str             # from the contributing row with the largest exposure
    sector_raw: str | None
    asset_type: AssetType            # see §7.1 — amendment to the engine spec's scheme_holdings
    exposure_pct: Decimal            # client-level %, re-derived below, never summed naively
    exposure_value: Decimal          # exposure_pct × total MF portfolio value
    contributing_funds: list[FundContribution]  # [{scheme_id, fund_weight_pct, stock_weight_pct}]

@dataclass(frozen=True)
class LookthroughTable:
    client_id: uuid.UUID
    rows: list[LookthroughStockRow]
    nav_as_of: date                  # golden rule #2: NAV date and holdings date differ
    holdings_as_of: date             # the oldest disclosure_batches.as_of_date actually used
    total_portfolio_value: Decimal

async def compute_lookthrough_table(db: AsyncSession, client_id: uuid.UUID) -> LookthroughTable: ...
```

**Formula** (restated from the engine spec, now wired to real columns):

```
fund_weight(scheme)  = scheme's current value ÷ total MF portfolio value   # same scheme-value calc as allocation.py, reused not re-derived
stock_weight(scheme, isin) = latest WRITTEN scheme_holdings.pct_to_nav for that (scheme, isin),
                              from the batch with the greatest as_of_date <= nav_as_of
client_exposure_pct(isin) = Σ over held schemes ( fund_weight(scheme) × stock_weight(scheme, isin) )
```

Grouped by ISIN, not by `instrument_name` — this is the engine spec's own "match by ISIN, not
name" rule (called out twice in the PDF: sections 06 and 13), now enforced structurally by the
dataclass itself having no name-keyed grouping path at all. Rows with `isin IS NULL` (cash,
CBLO, TREPS, Net Receivables/Payables — the engine spec's own documented `NULL` case) are kept
in the table under their own `instrument_name` strings, never merged with each other across
funds — two funds' "Net Receivables" rows are not the same instrument.

**Which disclosure batch counts as "current":** for each held scheme, the latest
`disclosure_batches` row with `status = WRITTEN`, independent per scheme — this is exactly why
the engine spec keyed the batch table by `(scheme_id, as_of_date)` rather than one calendar
month for every scheme (Canara Robeco's mixed cadence already forced that design; this compute
layer just consumes the consequence). `holdings_as_of` on the result is the *oldest* of those
per-scheme dates used, so the UI's "Holdings as on" label is honest when schemes disclose on
different cycles, not silently picking the newest and hiding a stale one.

**Precompute, not synchronous:** hooks into the existing precompute-cache pattern
(`GET /analytics/{scope}`, async Fargate recompute dispatch, already used for the Scorer) —
the engine spec itself already names this as the intended home, specifically to avoid
repeating BUG-001 (`Docs/orchestration/bug-001-findings.md`). Recompute trigger: any
`disclosure_batches` row reaching `WRITTEN` for a scheme the client holds, same event that
would invalidate the existing allocation/category caches.

**A scheme with no `WRITTEN` batch yet** (newly held, or an AMC still in `AWAITING_MANUAL_UPLOAD`)
contributes its full current value to `total_portfolio_value` (so percentages still sum
correctly against the real portfolio) but zero rows to the stock table — surfaced to the user
as a coverage caveat per attribute below (§3-§7), not silently dropped from the denominator.

## 3. Attribute 06 — Overall stock holdings (build first; every other attribute reads off this)

Pure consumer of `LookthroughTable`, no extra query. Sort rows by `exposure_pct` descending.

- **Top-10 view:** stacked horizontal bars, one segment per contributing fund (colour-coded),
  per the deep-understanding doc's worked example (Reliance 8%/6%/5% across 3 funds →
  6.55% client exposure, not 19% — the naive-sum error the PDF explicitly warns against).
  `contributing_funds` on each row already carries the segment breakdown; no second query.
- **"View all":** searchable table — %, ₹, sector (`sector_raw`, shown verbatim, un-normalized
  — normalizing it is this attribute's own display concern, not the ingestion layer's, per
  the engine spec's explicit "`sector_raw` stays raw at write time" rule).
- **Coverage caveat:** if any held scheme contributed zero rows (§2's no-batch-yet case), a
  banner: "N of your M funds haven't published this month's holdings yet — their stocks aren't
  counted below." Never silently omitted without saying so.
- **Drill-down:** stock row → its `contributing_funds` list (already in memory, zero extra
  query) → tapping a fund opens that scheme's existing detail view.

## 4. Attribute 02 — Large / Mid / Small Cap allocation

**New table:** `market_cap_classifications` — `(isin, rank, bucket [LARGE|MID|SMALL],
effective_date)`, **ingested from AMFI's own half-yearly list** (the deep-understanding doc
calls this "the easy half" since it's one centralized free feed, unlike the 40+-AMC
disclosure side). **URL live-verified 2026-10-13, then re-verified to a 110%-confidence
standard the same day** (not just HTTP 200 + plausible columns): current period at
`https://portal.amfiindia.com/spages/AverageMarketCapitalization30Jun2026.pdf` (HTTP 200,
real PDF — `Sr. No.` row order is the AMFI rank, `ISIN` column, `Categorization as per SEBI
Circular dated Oct 6, 2017` column is already `Large Cap`/`Mid Cap`/`Small Cap`). **Deeper
structural verification:** the full PDF was parsed (48 pages, `pypdf`, not just the first
page/top-N skimmed) — 5,427 data rows total (the full listed-companies universe, not merely
the top 500), and regex-extracting every row's `(rank, category)` pair found exactly 3
category-transition points across all 5,427 rows: rank 1→`Large Cap`, rank 101→`Mid Cap`,
rank 251→`Small Cap`. This exactly matches the SEBI circular's own Large=1-100/Mid=101-250/
Small=251+ definition, which is structural confirmation (not a coincidence a malformed parse
could produce) that row order genuinely is AMFI's rank and the categorization column is
genuinely correct — not just a plausible-looking column header. `robots.txt` was checked on
both hosts: `www.amfiindia.com/robots.txt` disallows only `/admin/`, `/login/`, `/search/`
(none of which this URL touches); `portal.amfiindia.com/robots.txt` 404s (no restriction
declared). **One real caveat found and disclosed, not silently dropped:** AMFI's own
terms-of-use page (`https://www.amfiindia.com/terms-of-use`) grants "a non-exclusive,
personal, non-transferable, non-sublicensable, limited and revocable right to access, use and
display this Site... for your personal and non-commercial use only." This is more explicit
"non-commercial" language than previously assumed, and is flagged here honestly rather than
assumed away — but it's consistent with the project's own already-accepted, already-live
practice of running on AMFI data elsewhere in production (`amfi_ter_client.py`/
`amfi_aaum_client.py` already exist and already ingest AMFI data daily for TER/AAUM), so this
plan treats it the same way: proceed, with the caveat recorded, not blocking. The
host/filename convention has drifted twice historically (older periods lived at
`www.amfiindia.com/Themes/Theme1/downloads/AverageMarketCapitalizationoflistedcompanies
duringthesixmonthsended<DDMonYYYY>.pdf`) — treat this URL like a `STATIC_REGEX` AMC entry
needing re-verification each half-year, not a hardcoded-forever constant. **New ingestion
client:** `amfi_market_cap_client.py`, same shape as `amfi_ter_client.py` — frozen
`*RefreshResult`, periodic refresh, degrades gracefully.

- **Bucket lookup is effective-dated, not "whatever AMFI says today":** for each stock row in
  the look-through table, join to the `market_cap_classifications` row whose `effective_date`
  is the latest one `<= holdings_as_of` (not `<= today`) — this is the deep-understanding
  doc's explicit rule ("a stock's bucket must match the ruling list at computation time").
- Rows with no ISIN, or an ISIN not in any market-cap list (debt, cash, gold, REITs, foreign
  stocks, unlisted) → `Other / Unclassified` bucket, per spec.
- **Denominator toggle:** "% of total portfolio" (divide by `total_portfolio_value`) vs. "% of
  equity only" (divide by the sum of `EQUITY_DOMESTIC` + `EQUITY_INTERNATIONAL` exposure only)
  — these are two different sums, not a relabeling of the same number.
- **UI:** donut + legend with mini bars, centre label = largest bucket; optional comparison
  strip against Nifty 500's own cap split (Nifty 500's constituent list already defines
  AMFI's rank 1-500 split, so this comparison strip needs no new data source beyond the same
  `market_cap_classifications` table).
- **Drill-down:** bucket → stocks in bucket (filtered `LookthroughTable` rows) → funds holding
  each stock (`contributing_funds`, reused).

## 5. Attribute 10 — Portfolio overlap

Two independent reads, genuinely different grains — worth stating precisely because it would
be easy to wire both off the client-level `LookthroughTable` and get the first one wrong:

- **Fund-to-fund overlap** needs each fund's *own* stock-weight list (`pct_to_nav` straight
  from that scheme's latest `scheme_holdings` rows), **not** the client-exposure-weighted
  numbers — "weight in Fund A" in the formula `Σ min(weight_A, weight_B)` is a fund-level %
  (sums to ~100% per fund), never the client-level % (`LookthroughTable.exposure_pct`, which
  already has the client's fund-weight baked in and would double-discount it here). New
  module `overlap.py`, function `compute_fund_pair_overlap(scheme_a, scheme_b) ->
  OverlapResult` reading `scheme_holdings` directly, pairwise over every pair of held schemes,
  matched by ISIN, symmetric by construction (computed once per unordered pair, not twice).
- **Stock concentration curve** ("Top 10 stocks represent 38%...") *does* read the shared
  `LookthroughTable` directly — client-level exposure is exactly what this headline needs.
- **UI:** fund×fund overlap heatmap (darker = higher overlap, 40%+ bands shown bold per the
  spec's suggested thresholds, configurable) + separate concentration-curve headline below it.
  Tapping a heatmap cell opens that pair's common-stock list (computed as a byproduct of the
  `min()` sum — worth returning the common-stock list from `compute_fund_pair_overlap` itself
  rather than recomputing it on tap). Tapping the concentration curve opens attribute 06's
  full table (same `LookthroughTable`, no new view).

## 6. Attribute 13 — Asset allocation within MF portfolio

**Depends on §7.1's `asset_type` amendment** — this is the attribute that most needs it, since
its whole point is the non-equity split (debt/gold/cash), not just equities.

- `Asset class % = Σ (fund weight × fund's % in that asset class)` — computed directly from
  `scheme_holdings` grouped by `asset_type` per scheme (not from the ISIN-level
  `LookthroughTable`, since asset-class lines like "CBLO/TREPS" and "Net Receivables" have no
  ISIN and must still count here, unlike in attribute 06 where they're display rows with no
  real identity to merge across funds — here they're exactly the kind of same-bucket item that
  *should* sum together regardless of which fund they came from).
- Six classes per spec: `EQUITY_DOMESTIC`, `EQUITY_INTERNATIONAL`, `DEBT`, `GOLD_SILVER`,
  `REIT_INVIT`, `CASH_EQUIVALENT` — these become the `AssetType` enum's six values (§7.1).
  Hedged arbitrage positions may optionally fold into `CASH_EQUIVALENT` (PDF's explicit "can
  optionally be classed as cash-like" — a display toggle, not a parse-time decision, since the
  raw disclosure doesn't reliably flag "hedged" vs. unhedged at the line-item level).
- **UI:** two-ring donut (inner = asset class, outer = next level down) with the equity ring's
  drill-down explicitly chaining into attribute 02 (cap split) then attribute 06 (stock table)
  — the deep-understanding doc calls this out as "the entry point into attribute 02's cap
  split and ultimately attribute 06's stock table," so the three attributes share one
  drill-down path, not three separate ones.

## 7. Attribute 15 — Portfolio P/E and P/B

**Formula (harmonic mean, restated verbatim since the *why* matters for the implementation):**

```
Portfolio P/E = 1 ÷ Σ(wᵢ ÷ P/Eᵢ)      Portfolio P/B = 1 ÷ Σ(wᵢ ÷ P/Bᵢ)
```

`w` = look-through stock weight **re-scaled so equity = 100%** (i.e. divide each equity row's
`exposure_pct` by the sum of all equity rows' `exposure_pct` before applying the formula — debt/
cash/gold rows are excluded from the denominator entirely, not given a weight of zero inside
it, which would still be mathematically fine but is worth stating so the implementation
doesn't accidentally include them as zero-weight terms that still need a defined P/E).
Loss-making stocks (`pe_ratio` null or negative, i.e. negative earnings) are excluded from the
P/E sum specifically (re-normalizing the remaining weights), with a disclosed footnote ("x% of
equity excluded — negative earnings"); P/B has no equivalent exclusion since book value is
rarely negative.

**New table:** `stock_master` — `(isin PK, name, sector, pe_ratio, pb_ratio, as_of_date,
source)`. Per the already-made sourcing decision (`decisions.md`, 2026-10-06, "Attribute 15
(stock P/E, P/B, sector): build free in-house, no paid vendor exception... scrape NSE/BSE
company-fundamentals pages and/or parse AMC-published factsheets"). This also backfills
attribute 06's `sector_raw` display with a normalized `sector` where available, though 06
itself never depends on this table (§3's `sector_raw` stays the raw source string either way).

**UI:** two horizontal bar comparisons (portfolio vs. Nifty 50), delta stated in plain language
("~10% more expensive on earnings"). Nifty 50's own P/E/P/B comes from the same
niftyindices.com index-level endpoint used for the portfolio comparison — see §7.2, fully
resolved, not an open mechanism question.

---

## 7.1 Amendment proposed to the 2026-10-09 engine spec's `scheme_holdings` table

**Flagging this rather than silently resolving it**, per the standing "stop and say so" rule
when a doc appears to conflict with what's about to be built: the engine spec's
`scheme_holdings` model (as written 2026-10-09) has no `asset_type` column — only
`instrument_name`/`isin`/`sector_raw`/`quantity`/`market_value`/`pct_to_nav`. But the
deep-understanding doc's own section 13 write-up *already anticipated exactly this gap*
("needs the asset-type per line item too... worth keeping in mind when scoping the
disclosure-ingestion format survey") and recommended folding it into the same ingestion rather
than a second one. Attribute 13 (§6) and attribute 15's equity-only exclusion (§7) both need
it structurally, not as a nice-to-have.

**Proposed column:** `asset_type: Mapped[AssetType]` on `scheme_holdings`, where `AssetType` is
a new enum (`EQUITY_DOMESTIC | EQUITY_INTERNATIONAL | DEBT | GOLD_SILVER | REIT_INVIT |
CASH_EQUIVALENT`), **populated by the Parse stage** from which section of the disclosure a row
came from. This is mechanically cheap because the SEBI-prescribed disclosure format already
groups rows under section headers ("Equity & Equity related", "Debt Instruments", "Money
Market Instruments", "Cash & Other Current Assets", etc. — confirmed as the real format shape
by `2026-10-06-amc-portfolio-disclosure-format-survey.md`) — the Parse stage already has to
walk those sections to find rows at all, so stamping `asset_type` per section is a side effect
of work it's already doing, not a new pass over the file.

**Approved 2026-10-12.** This changed an already-written, previously-agreed spec's schema, so
it was not made as a unilateral edit — Ayush explicitly signed off before it was written into
the engine spec. The column has been added to the engine spec's own `SchemeHolding` model
(`2026-10-09-sub-project-2-lookthrough-engine-spec.md`); this note stays as historical record
of the amendment (same pattern used elsewhere in this project for spec corrections — appended,
not silently rewritten).

## 7.2 Attribute 15's data-fetch mechanism — fully resolved 2026-10-13, nothing deferred

`decisions.md`'s 2026-10-06 entry settled the **sourcing strategy** (free, in-house, no paid
vendor). The **exact mechanism** is now resolved, live-verified end to end, for every input the
attribute needs — see
`Docs/analytics/investigations/2026-10-13-attribute-15-pe-pb-sourcing-feasibility.md` for the
full detail (including a same-day correction: the first pass wrongly concluded per-stock P/B
was a dead end after checking only NSE/BSE; a second pass checking screener.in, Yahoo Finance,
and Google Finance found it resolved). Summary:

- **Index-level P/E, P/B, Div Yield** (Nifty 50/500 benchmark comparison): ✅ resolved —
  `POST niftyindices.com/BackPage/getpepbHistoricaldataDBtoString`, same endpoint family and
  request shape already used by `nse_indices_client.py`.
- **Per-stock P/E**: ✅ resolved — NSE's daily `peDetail/PE_<DDMMYY>.csv` report, discovered via
  `nseindia.com/api/daily-reports?key=CM`.
- **Symbol→ISIN mapping** (needed to join any symbol-keyed per-stock file against
  `scheme_holdings`'/`stock_master`'s ISIN key): ✅ resolved — NSE's own "CM - MII - Security
  File" (`content/cm/NSE_CM_security_<DDMMYYYY>.csv.gz`), filtered to `SctySrs == "EQ"` rows.
- **Per-stock P/B**: ✅ resolved — two independent, cross-validated free sources: **Yahoo
  Finance's unofficial `quoteSummary` API** (cookie+crumb handshake via plain `curl`, no
  headless browser; `defaultKeyStatistics.priceToBook`/`bookValue`, confirmed live for 6 real
  NSE stocks, matched by the same `.NS`-ticker→ISIN mapping as the P/E file) and
  **screener.in's server-rendered company pages** (plain HTML, `Current Price` ÷ `Book Value`,
  independently matching Yahoo's RELIANCE figures to the rupee). Google Finance was also checked
  live and confirmed not useful for P/B specifically (no book-value field on its quote page, and
  its old public API is dead).

**ToS-sourcing-preference, finalized 2026-10-13 (see `decisions.md`'s 2026-10-06 entry's
same-day addendum):** Yahoo Finance's unofficial API and screener.in's pages are both free and
technically reliable (confirmed, including a 14-request rate-limit stress test with no
throttling), but neither is an official licensed data product — their terms are written for
personal/research use, unlike NSE's own regulatory-disclosure-adjacent data (the PE CSV,
security master, niftyindices endpoints), which carries no such restriction. **Decided:** NSE's
own data is used wherever it covers the need (all of P/E, the symbol→ISIN mapping, both
index-level figures). For P/B — the one metric NSE doesn't publish — **Yahoo is the live
runtime primary source; screener.in is a per-ISIN fallback only**, called just for a stock
Yahoo has no data for (e.g. a delisted/merged ticker), not fetched in parallel for every stock,
to minimize exposure to screener.in's more explicit commercial-use restriction. Both failing
for one ISIN → `pb_ratio NULL` with a disclosed footnote, same pattern as P/E's
loss-making-stock exclusion. No open items remain here.

## 7.3 Integration architecture — how `stock_master` connects to the AMC disclosure pipeline

**Written 2026-10-13, in response to a direct question: §7.2 proved the data sources exist;
this section specifies how they actually wire into the rest of the system**, since "the API
works" and "this is integrated correctly" are different claims.

**`stock_master` is a second, independent reference-data pipeline — not a stage of the
look-through engine.** The engine spec's five-stage pipeline (Locate/Fetch/Parse/Normalize/
Write) populates `disclosure_batches`/`scheme_holdings` from 40+ AMCs, each on its own
monthly/quarterly/half-yearly cadence. `stock_master` is populated by `stock_fundamentals_client.py`,
a daily reference-data refresh job in the same family as `amfi_ter_client.py`/
`amfi_market_cap_client.py` — same frozen-`*RefreshResult` shape, same "degrades gracefully, no
new data overwrites good data with a failure" contract. The two pipelines never block each
other: `stock_master` refreshing has no dependency on any AMC's disclosure status, and no AMC
disclosure write waits on `stock_master`. `valuation.py` (attribute 15's aggregation module) is
the only place they meet — it reads `LookthroughTable` (from `scheme_holdings`, via
`lookthrough.py`) and `stock_master`, joined by ISIN, at read time.

**ISIN universe to fetch — bounded, not "all NSE/BSE-listed stocks":** fetching all ~5,400
companies AMFI's own market-cap list carries (§4) would be wasteful and mostly pointless — the
overwhelming majority will never appear in any client's look-through table. The universe for
each daily refresh is the **union of two queries**, re-derived every run rather than
hardcoded: (1) every distinct non-`NULL` `isin` currently present across all `scheme_holdings`
rows (i.e., every stock any onboarded AMC has ever disclosed holding — bounded by the engine's
own onboarded-AMC scope, realistically low thousands, not tens of thousands), and (2) every
ISIN in the Nifty 50 and Nifty 500 constituent lists (needed for attribute 15's own benchmark
comparison and attribute 02's cap-split comparison strip — these overlap heavily with (1) but
aren't a strict subset of it, since a client may hold stocks outside the Nifty 500 and the
benchmark comparison needs the index's own constituents regardless of what any client holds).
This is a **one-way read dependency**: `stock_fundamentals_client.py` reads `scheme_holdings` to
know what to fetch, but is never triggered by a write to it, and a `scheme_holdings` write never
waits on it either.

**Refresh cadence: daily, independent of any AMC's disclosure cadence.** `pe_ratio` (price ÷
trailing EPS) and `pb_ratio` (price ÷ book value) both move daily because *price* moves daily,
even though the EPS/book-value inputs themselves only change when a company files results
(quarterly/annually) — NSE's own `peDetail` CSV is itself published daily for exactly this
reason. This means attribute 15's recompute trigger is **not** the same event as the other four
attributes': today's precompute-cache pattern fires on `disclosure_batches` reaching `WRITTEN`
for a held scheme; `valuation.py` additionally needs its own, second trigger — a fresher
`stock_master.as_of_date` than the last computed result — since a client's portfolio P/E/P/B
can genuinely change day-to-day on price movement alone, with zero new AMC disclosures that
day. **Either event independently invalidates attribute 15's cached result; they are not merged
into one trigger.**

**Fetch mechanics at real scale (not the 14-stock stress test's toy scale):** one Yahoo Finance
cookie+crumb handshake per daily run, reused for the whole ISIN universe (confirmed reusable
across many requests in §7.2's testing) — not re-established per stock. At the realistic
universe size (low thousands, not 14), the client needs: a small per-request delay between Yahoo
calls (politeness toward an unofficial API, not a documented rate limit, so a conservative
default rather than a tuned number); detection of a crumb going stale mid-run (a request
starting to 401 again partway through) and a single re-handshake, not a full-run abort; and the
same per-ISIN fallback-and-footnote behavior below applied independently per stock, so one bad
ISIN never fails the whole batch.

**Symbol-resolution fallback chain, per ISIN, every refresh:**
1. ISIN → NSE trading symbol, via the existing security-master mapping
   (`NSE_CM_security_<DDMMYYYY>.csv.gz`, `SctySrs == "EQ"` rows) — already solved for P/E.
2. Symbol found → fetch NSE's `peDetail` CSV row (→ `pe_ratio`, `source = NSE`) and Yahoo's
   `quoteSummary` for `<symbol>.NS` (→ `pb_ratio`, `source = YAHOO`).
3. **ISIN not in NSE's current security master at all** (delisted or merged — the real case
   already surfaced in §7.2's testing, HDFC Ltd's 2023 merger into HDFC Bank; a client's
   look-through table can still reference a pre-merger ISIN if a fund's holdings snapshot
   predates it): both `pe_ratio`/`pb_ratio` → `NULL`, footnote "delisted/merged, data
   unavailable." **No BSE-symbol fallback is attempted here** — BSE's per-stock data API is
   already confirmed bot-blocked (§7.2's investigation doc), so there is no live BSE path to
   fall back to; this is a stated, accepted gap, not an unexplored one.
4. **Symbol found but Yahoo's `.NS` quote 404s/omits `priceToBook` anyway** (API gap, not a
   delisting): fall back to screener.in for that one ISIN only, per the finalized
   ToS-sourcing decision above (`source = SCREENER`) — never fetched in parallel for every
   stock, only on a per-ISIN Yahoo miss.
5. **Both Yahoo and screener.in fail for one ISIN:** `pb_ratio` → `NULL`, same disclosed-footnote
   pattern as step 3, not silently dropped from the aggregate — this reuses the exact mechanism
   §7's harmonic-mean formula already specifies for loss-making-stock exclusion, not a new one.

**What this means for Task 6's test plan:** beyond the harmonic-mean formula test already
specified in §7, the implementation needs explicit tests for (a) ISIN-universe derivation as
the stated two-query union, de-duplicated; (b) the full 4-step fallback chain above, one test
per branch; (c) that `stock_master`'s refresh runs and succeeds with zero `disclosure_batches`
activity that day (proves the independence claim, not just assumes it); (d) that attribute 15's
cache invalidates on *either* trigger independently (a `WRITTEN` disclosure batch with no new
stock-price data, and fresh stock-price data with no new disclosure, each alone must trigger a
recompute).

## 8. Shared cross-attribute rules (golden rules, now wired to real fields)

- **"As on" dates everywhere:** every one of the 5 widgets shows `nav_as_of`/`holdings_as_of`
  from the shared `LookthroughTable` (or, for attribute 10's fund-pair overlap, the two
  schemes' own latest batch dates) — never a single undated "current" label.
- **Standard drill-down (Portfolio → AMC → Fund → Stock/Transaction):** attributes 02/06/13 all
  terminate in the same stock→fund step via `contributing_funds`; attribute 10's heatmap
  terminates in a common-stock list instead, which itself links into 06's per-stock view for
  any one stock in that list.
- **Every number clickable, hypotheticals labelled:** none of these 5 attributes are
  back-tested/hypothetical (unlike 11/12), so no "Back-tested" tag applies here — noted only
  to rule it out explicitly, not leave it ambiguous.

## 9. What this spec deliberately does not cover

- The AMC-disclosure ingestion pipeline itself (Locate/Fetch/Parse/Normalize/Write) — that's
  the 2026-10-09 engine spec and its implementation plan, unaffected by this document except
  for the §7.1 `asset_type` amendment, approved and written in 2026-10-12.
- Exact frontend component names/file placement — left to the implementation plan, following
  the same per-attribute frontend-spec convention sub-project 1 used (e.g.
  `2026-10-08-attribute-09-fund-ranking-spec.md`'s "Placement" section), since that's a smaller
  decision than the shared-table architecture this document exists to settle.
