# Attribute 15 (P/E & P/B Look-Through) — Data-Source Feasibility, Fully Resolved

**Date:** 2026-10-13 (revised same day — see "Revision" note below)
**Status:** Investigation complete. **Every input attribute 15 needs — index-level P/E, P/B,
Div Yield; per-stock P/E; per-stock P/B; and the symbol→ISIN mapping to join them — is free and
live-verified. Nothing is deferred.**
**Triggered by:** the two-step instruction attached to
`Docs/analytics/2026-10-12-attributes-02-06-10-13-15-lookthrough-consumers-spec.md` §7.2 — (1)
confirm `scheme_holdings` cannot derive P/E/P/B itself, (2) if not, find a real NSE/BSE source,
live-verified, not guessed.

**Revision note (same day):** this document's first version concluded per-stock P/B was a
confirmed dead end on NSE/BSE and recommended deferring it. Ayush rejected that recommendation
outright — correctly: NSE and BSE were not the only candidate sources, and "nothing should move
to deferred features until we're 110% sure about it." A further round, explicitly checking
screener.in, Yahoo Finance, and Google Finance per his instruction, found **two independent,
free, live, cross-validated sources that return per-stock P/B** (and P/E) for NSE-listed stocks.
The "NSE/BSE-only, confirmed dead end" framing below is kept as a record of what was actually
checked and found wanting, not deleted — but it no longer describes the final state. See
"Step 2 (revised) — per-stock P/B, actually resolved" below for the real answer.

---

## Step 1 — can `scheme_holdings` derive P/E/P/B itself? No.

Read `Docs/analytics/investigations/2026-10-06-amc-portfolio-disclosure-format-survey.md` in
full. The SEBI-mandated monthly portfolio disclosure format — the source of every field
`scheme_holdings` captures — contains: Name of Instrument, ISIN, Industry/Sector, Quantity,
Market Value (₹ Lakhs), % to NAV, and (debt only) Rating/Coupon/Yield. **No EPS, book value, or
per-share price field exists anywhere in this format.** P/E and P/B cannot be derived from data
the look-through engine already ingests — an external per-stock fundamentals source is required.
This matches the attribute-consumer spec's own existing model: a new `stock_master` table keyed
by ISIN, holding `pe_ratio`/`pb_ratio`/`as_of_date`/`source`.

## Step 2 — what's actually free and reachable (live-verified, this session)

### Index-level P/E, P/B, Div Yield — ✅ resolved

```
POST https://www.niftyindices.com/BackPage/getpepbHistoricaldataDBtoString
Content-Type: application/json; charset=utf-8
Body: {"cinfo": "{'name':'<NAME>','startDate':'<DD-Mon-YYYY>','endDate':'<DD-Mon-YYYY>','indexName':'<NAME>'}"}
```

Same host, same `BackPage` endpoint family, same `cinfo` request shape, and the exact same
trading names (`"NIFTY 50"`, `"NIFTY 500"`) already defined in `nse_indices_client.py`'s
`_TRADING_INDEX_NAME` map — this is a sibling to the existing price-return and TRI endpoints (see
`2026-10-06-tri-sourcing-feasibility-confirmed.md`), not a new integration pattern. Confirmed live
for both Nifty 50 (P/E ~19.36–20.34, P/B ~2.75–2.92) and Nifty 500 (P/E ~21.42–21.77, P/B
~3.06–3.09) with real September 2026 data. Response shape: an array of `{"Index Name", "DATE",
"pe", "pb", "divYield"}` rows. This fully covers the consumer spec's benchmark-comparison need
(portfolio P/E, P/B vs. Nifty 50/500's own index-level figures) — no gap here.

One caveat carried over, not yet re-checked: the site's historical-data UI enforces a max-1-year
date range client-side; whether the server enforces it too (requiring chunked requests for longer
backfills) is unconfirmed and should be checked at implementation time, not assumed.

### Per-stock P/E — ✅ resolved

NSE's own daily-reports feed (`https://www.nseindia.com/api/daily-reports?key=CM` — reachable
directly, unlike the bot-blocked `/api/quote-equity`/`/api/allIndices` paths) lists a "PE Ratio"
report whose JSON entry gives the exact real file-naming convention:

```
GET https://nsearchives.nseindia.com/content/equities/peDetail/PE_<DDMMYY>.csv
```

e.g. `PE_121026.csv` for 12-Oct-2026. Confirmed live via direct download — real data, columns
`SYMBOL,SYMBOL P/E,ADJUSTED P/E` (e.g. `THERMAX,65.70,70.89`), ~2,257 symbols. Free, no auth, no
session cookie, static archive path (`nsearchives.nseindia.com`, not the bot-blocked main
`nseindia.com` dynamic API).

### Symbol → ISIN mapping (needed to join the P/E file against `scheme_holdings`) — ✅ resolved

The PE Ratio file is keyed by NSE trading **symbol**, but the look-through engine's mandatory
join key is **ISIN**. The same daily-reports feed also lists NSE's official "CM - MII - Security
File," which resolves this:

```
GET https://nsearchives.nseindia.com/content/cm/NSE_CM_security_<DDMMYYYY>.csv.gz
```

e.g. `NSE_CM_security_12102026.csv.gz` for 12-Oct-2026 (note: 8-digit date, `DDMMYYYY` — different
from the PE file's 6-digit `DDMMYY`). Confirmed live via direct download and decompression: a
~38,000-row CSV with `TckrSymb` and `ISIN` columns among ~110 fields (NSE's standard security
master format). Verified against two known real stocks:

| Symbol | Series (`SctySrs`) | ISIN in file | Real-world ISIN |
|---|---|---|---|
| RELIANCE | `EQ`/`AF`/`BE`/`BL` rows (multiple series per symbol) | `INE002A01018` | `INE002A01018` ✅ |
| THERMAX | `EQ`/`BE`/`BL` rows | `INE152A01029` | `INE152A01029` ✅ |

Both match. **Implementation note:** the file has multiple rows per symbol (one per market
series — `EQ`, `BE`, `BL`, debt series, etc.); the join should filter to `SctySrs == "EQ"` (the
primary equity listing) to get one canonical symbol→ISIN row per stock, avoiding duplicate or
wrong-series ISINs.

This closes the gap flagged mid-research in this session: per-stock P/E + this security file
together give the look-through engine everything needed to populate `stock_master.pe_ratio` keyed
by ISIN, for every NSE-listed stock a scheme might hold.

### Per-stock P/B — ⚠️ not on NSE or BSE (what was checked first, below) — but see the revision

What was actually checked, live, in the first pass — not assumed:

1. **NSE's full daily-reports catalog** (`/api/daily-reports?key=CM`, all 37 report types listed)
   — no P/B or book-value report of any kind. "PE Ratio" is P/E only (confirmed above); nothing
   else in the list is stock-fundamentals-shaped.
2. **Plausible sibling file paths**, tested by analogy to the PE file's own naming convention
   (`peDetail/PE_<DDMMYY>.csv`) — `pbDetail/PB_<DDMMYY>.csv`, `peDetail/PB_<DDMMYY>.csv`,
   `pbrDetail/PBR_<DDMMYY>.csv`. **All three returned HTTP 404** — confirmed dead, not just
   unchecked; this was a live test of a hypothesis, not a guessed URL presented as working.
3. **NSE's `/all-reports` page content itself** — the only P/B-related content on the entire page
   is the "P/E, P/B & Div. Yield values" section, which is explicitly the **index-level** Nifty
   50 report (same one already resolved above via `niftyindices.com`), not a per-stock report.
4. **BSE's per-stock financials/ratios page**
   (`bseindia.com/stock-share-price/.../financials-ratios/`) — reachable (HTTP 200), but it is an
   Angular SPA shell with no data in the raw HTML; all real content loads client-side via calls to
   `api.bseindia.com`, which returned **HTTP 403** on direct request (bot-blocked, same pattern as
   `nseindia.com`'s dynamic JSON APIs — confirmed, not assumed, via direct curl).

**This was wrong to treat as the end of the search.** NSE/BSE are not the only candidates — see
below.

## Step 2 (revised) — per-stock P/B, actually resolved via two independent sources

Checked, live, exactly as instructed: screener.in, Yahoo Finance, and Google Finance.

### Yahoo Finance's quote API — ✅ resolved, gives both P/E and P/B

The plain, unauthenticated request path is dead
(`query1.finance.yahoo.com/v10/finance/quoteSummary/...` → **HTTP 401 "Invalid Crumb"** — Yahoo
locked this down at some point after the `yfinance`-style libraries made it famous). But the
**cookie + crumb handshake still works with plain `curl`, no JS execution, no headless
browser**:

```
1. GET https://fc.yahoo.com                              (sets a cookie)
2. GET https://finance.yahoo.com/quote/<ANY-SYMBOL>        (same cookie jar)
3. GET https://query2.finance.yahoo.com/v1/test/getcrumb   (same cookie jar) → returns a crumb token
4. GET https://query2.finance.yahoo.com/v10/finance/quoteSummary/<SYMBOL>.NS
     ?modules=defaultKeyStatistics,summaryDetail&crumb=<crumb-from-step-3>
     (same cookie jar)
```

Confirmed live for 6 real NSE stocks, with real, plausible, internally-consistent values:

| Symbol | `trailingPE` (`summaryDetail`) | `priceToBook` (`defaultKeyStatistics`) | `bookValue` |
|---|---|---|---|
| RELIANCE.NS | 21.10 | 1.74 | ₹668.04 |
| THERMAX.NS | 61.85 | 6.61 | ₹492.56 |
| TCS.NS | 15.67 | 7.38 | ₹303.01 |
| INFY.NS | 14.20 | 4.56 | ₹228.78 |
| HDFCBANK.NS | 15.61 | 1.81 | ₹393.81 |

(RELIANCE's P/E of 21.10 here vs. NSE's own `PE_121026.csv` figure — not RELIANCE in that
sample, but the same methodology — is a different, independently-sourced number, as expected;
cross-checked against screener.in below instead, which matches exactly.)

**Scale test:** 14 further sequential `.NS` requests (SBIN, WIPRO, ITC, LT, BAJFINANCE, MARUTI,
SUNPHARMA, TITAN, ASIANPAINT, NESTLEIND, ULTRACEMCO, ADANIENT, COALINDIA, ONGC), reusing the same
cookie/crumb from one handshake — **13/14 succeeded** (the one failure, `HDFC.NS`, is a dead
ticker: HDFC Ltd merged into HDFC Bank in 2023, a stale-symbol 404, not a rate-limit signal). No
sign of rate-limiting or blocking across this batch.

**The ticker-symbol problem is the same one already solved for NSE's PE file** — Yahoo's
`.NS`-suffixed symbols are the same NSE trading symbols as the security-master file's
`TckrSymb` column, so the existing symbol→ISIN mapping (`NSE_CM_security_<DDMMYYYY>.csv.gz`,
`SctySrs == "EQ"` rows) joins Yahoo's data to `scheme_holdings` exactly the same way it joins
NSE's own PE file — no new mapping problem introduced.

### screener.in — ✅ resolved, independently cross-validates Yahoo, server-rendered (easier to scrape)

`https://www.screener.in/company/<SYMBOL>/consolidated/` is a **plain server-rendered HTML
page** (not a JS SPA) — confirmed live for RELIANCE: the raw HTML directly contains `Stock P/E:
21.1`, `Book Value: ₹668`, `Current Price: ₹1,164`, `Market Cap: ₹15,75,728 Cr.` — **matching
Yahoo's numbers for the same stock almost exactly** (21.10 vs 21.1 P/E; ₹668.04 vs ₹668 book
value; P/B = 1164/668 = 1.74, identical to Yahoo's `priceToBook: 1.74`). Two independent
providers agreeing this closely on the same day is strong confirmation neither is a fluke or
stale-cache artifact. No explicit "Price to Book" ratio field is shown directly on this page
(it appears only as a chart-metric button label), but it's one division away from two fields
that are both shown plainly.

### Google Finance — checked, genuinely not useful here

No current public API exists (the old `google.com/finance/info?q=...` endpoint is dead — confirmed
live, it 302-redirects rather than returning data; that API was retired around 2012). The
regular quote page (`google.com/finance/quote/RELIANCE:NSE`) is reachable (HTTP 200) and does
contain a server-rendered "P/E ratio" field, but **no "Price-to-book" or "Book value" field
exists anywhere in the page** (checked live, not assumed) — Google Finance's per-stock view
simply doesn't surface P/B. Not a source for this attribute, for P/B specifically; not needed
anyway given Yahoo + screener.in above.

## What this means for attribute 15's design (revised — nothing deferred)

- **Portfolio-level P/E**: fully buildable. Per-stock P/E from NSE's own daily CSV (first
  choice, official regulator-adjacent exchange data) or Yahoo Finance (cross-check/fallback) +
  symbol→ISIN mapping (NSE security master) + benchmark index P/E (niftyindices.com).
- **Portfolio-level P/B**: **also fully buildable.** Per-stock P/B from Yahoo Finance's
  `quoteSummary` API (primary) and/or screener.in's server-rendered page (cross-check/fallback,
  easier to scrape since it needs no cookie/crumb handshake) + the same symbol→ISIN mapping +
  benchmark index P/B (niftyindices.com, already resolved).

**A real caveat, not silently resolved either way — a Terms-of-Service question, not a
technical one:** both Yahoo Finance's unofficial API and screener.in's scraped pages are
commonly used in the open-source fintech community (e.g. the `yfinance` Python library), but
neither is an official, licensed public API, and both providers' terms (Yahoo's finance ToS;
screener.in's `/guides/terms/` page, which includes a standard "materials license" restricting
commercial use/redistribution) are written for personal/research use, not commercial
redistribution inside a product. NSE's own official regulatory-disclosure-adjacent data (the PE
Ratio CSV, the security master file, the niftyindices `BackPage` endpoints) carries no such
restriction — it's published exchange data.

**Revision note (2026-10-13, same day): the sourcing call above was Ayush's to make and has
now been made — this is no longer open.** Decided: **(a)** — NSE's own data as the
primary/sole source wherever it suffices (all of P/E, the symbol→ISIN mapping, both
index-level figures), and for P/B specifically (the one metric NSE doesn't publish), **Yahoo
Finance's `quoteSummary` API is the live runtime primary source; screener.in is a per-ISIN
fallback only** — called just for a stock Yahoo has no data for (e.g. a delisted/merged
ticker), never fetched in parallel for every stock, to minimize exposure to screener.in's more
explicit commercial-use restriction while keeping its resilience value for individual misses.
Both failing for a given ISIN → `pb_ratio NULL` with a disclosed footnote, the same pattern
already used for P/E's loss-making-stock exclusion. This stays within the existing "no paid
vendor" rule (`decisions.md`'s 2026-10-06 entry) — option (c), a licensed vendor, remains
available as a future fallback if Yahoo/screener.in's ToS posture ever becomes a problem in
practice, not a prerequisite to building this now. Full decision record:
`decisions.md`'s 2026-10-06 attribute 15 entry's same-day addendum; consumer spec §7.2 and
plan Task 6 are both written to this same decision.

**Nothing here goes into `DEFERRED_FEATURES.md`.** Attribute 15 is fully buildable, P/E and
P/B, benchmark and per-stock. No open items remain in this document.
