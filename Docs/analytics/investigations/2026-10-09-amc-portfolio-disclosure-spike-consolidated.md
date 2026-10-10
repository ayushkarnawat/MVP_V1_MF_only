# AMC Monthly Portfolio Disclosure Fetchability Spike — Consolidated (Spike 2 of N)

**Date:** 2026-10-09 (first closure), deepened same-day across a second harder audit pass (see
"Second audit pass" below), a third pass that turned the remaining 9 into an operational plan
(see "Third pass" below), and a fourth, maximal-effort pass that found genuine new alternate
sources for most of what the third pass had accepted as manual-fetch (see "Fourth pass" below).
**Status:** Complete through four passes. All 57 AMFI-registered AMCs classified; every
`NEEDS_INVESTIGATION`/`BOT_BLOCKED` case was re-attempted multiple times with harder per-site
interaction (accordions, cascading selects, button-driven downloads, encrypted-API probing,
WebSearch for AMC-side dead/moved links, and — new in the fourth pass — Wayback Machine/CDX as a
Locate-step workaround for WAF-blocked main sites plus broad non-keyword-filtered domain
searches) rather than accepted at face value.
**Triggered by:** spike 1's recommended-but-undone "second pass" (per
`2026-10-06-amc-portfolio-disclosure-format-survey.md`) — pull a real monthly portfolio
disclosure file from every AMC, not a sample, and confirm machine-fetchability the same way
attribute 04's AMC-matching spike did (curl-first, Playwright-trace fallback, tiered
categorization).
**Methodology note:** batches A, B, and D were initially produced in Codex sandboxes with no
DNS resolution to AMC hosts, so their `NEEDS_INVESTIGATION` counts were inflated by a tooling
limitation, not AMC-side difficulty. Every one of those 22 cases was re-run directly in this
session (real `curl` + headless Chromium/Playwright, reusing attribute 04's network-trace
script). A second, harder pass (same day) then re-attempted every remaining
`NEEDS_INVESTIGATION` case again, this time pushing past the first "0 file-shaped hits"
finding with accordion-opening, cascading-select, and button/`expect_download`-driven
interaction — which is why most of the first pass's `NEEDS_INVESTIGATION` verdicts did not
survive a harder second look.

## Headline (after the fourth pass): 47/57 (82%) confirmed machine-fetchable today; only 2/57 genuinely need manual fetch

| Tier | Count | Meaning |
|---|---|---|
| `STATIC_REGEX` | 33 | Plain HTML/server-rendered page (or a JS-rendered page requiring no scheme/date selection), or a separate unprotected static-asset/CDN subdomain reachable via a Wayback-revealed filename, exposes a direct, dated file URL |
| `JSON_API` | 14 | Page is client-rendered and requires a scripted interaction (select year/month/scheme, open an accordion, click a button) to reveal the file URL or a backing JSON/XHR endpoint |
| `BOT_BLOCKED` | 2 | Site returns HTTP 403/a bot-challenge to a plain request; headless-browser access is either also blocked or unreliable enough that it needs a different approach, not just more Playwright patience. One of the two (Kotak) is very likely solvable within days — see "Fourth pass" |
| `NO_CONTENT_FOUND` | 5 | AMC-side: fund genuinely has no monthly disclosure to publish yet (too new) or no disclosure page/live scheme was found at all |
| `NEEDS_INVESTIGATION` | 3 | Confirmed, across up to four independent passes with real network access, that no static file link, simple API, or alternate unprotected source exists — needs a dedicated per-AMC deep-dive, acceptance of manual fetch, or (Monarch) isn't actually a gap |

`STATIC_REGEX` + `JSON_API` = 47 AMCs buildable today. Of the remaining 10: 1 (WhiteOak) just
needs its adapter built (page works, not blocked); 1 (Kotak) is `BOT_BLOCKED` on its main site but
very likely solvable via an alternate CDN once its Monthly file's ~10-day publishing lag passes;
1 (Monarch) isn't a gap at all — fortnightly is its genuine ceiling; 5 are an expected empty
state; only **2 (Edelweiss, Mahindra Manulife) are confirmed to need manual monthly fetch**, down
from 9 after the third pass's operational-plan count, because the fourth pass found genuine new
alternate sources (separate unprotected static-asset subdomains, or Wayback-cached HTML revealing
otherwise WAF-hidden filenames) for HDFC, AlphaGrep, Union Asset Management, and Canara Robeco —
see "Fourth pass" below for the full detail.

## Second audit pass (same day): why the fetchable count roughly doubled

The first pass's `NEEDS_INVESTIGATION` verdicts were almost all reached by one round of
"load the page, look for `<a href>` links ending in `.xlsx`/`.xls`/`.zip`, see 0 hits, stop."
That is too shallow a bar — most AMC sites hide the real file behind one more interaction step.
Pushing one level deeper (and, for two AMCs, finding the AMC's real domain/page after
discovering the first attempt was targeting a dead/parked/wrong URL) resolved 14 of the
original 20 `NEEDS_INVESTIGATION` cases and both `NO_CONTENT_FOUND`/`BOT_BLOCKED`
misclassifications below, each confirmed by actually downloading a file and opening it with
`openpyxl`/`xlrd` to verify genuine ISIN/Industry/Quantity/Market-Value/%NAV holdings data (not
just a file-shaped URL):

| AMC | Old tier | New tier | What the harder pass actually found |
|---|---|---|---|
| Bank of India Mutual Fund | NEEDS_INVESTIGATION | **STATIC_REGEX** | A single workbook (`Index` sheet mapping scheme codes YB01–YB44 to names, plus one sheet per scheme) at a stable, directly-curlable URL |
| Baroda BNP Paribas Mutual Fund | NEEDS_INVESTIGATION | **STATIC_REGEX** | The direct `.xlsx` link (`assets/download_documents/Portfolio_Holdings_and_Exposure-...`) is present in the page's own static HTML — a plain `grep` on the curl-fetched page finds it; the first pass's Playwright trace had simply missed it |
| Angel One Mutual Fund | NO_CONTENT_FOUND | **STATIC_REGEX** | The first pass never independently re-checked this one; it does have monthly files (per-scheme, per-month, under a "Portfolio Disclosures" sidebar category) going back years — the original classification was simply wrong, not stale |
| Wealth Company Mutual Fund | NEEDS_INVESTIGATION | **STATIC_REGEX** | A full grid of 97 downloadable files is server-rendered on page load (Next.js); the per-file URL (`/uploads/Monthly_Portfolio_<Scheme>_<hash>.xlsx`) is a stable static asset, just implemented as a MUI `<button>` instead of `<a href>` |
| PGIM India Mutual Fund | BOT_BLOCKED | **JSON_API** | The original BOT_BLOCKED verdict was a batch-C sandbox-DNS artifact, not a real block — `pgimindia.com`'s disclosure page has a clean JSON API (`resultStatus`/`pdfPath` fields) with full history back to 2021 |
| Navi Mutual Fund | NEEDS_INVESTIGATION | **JSON_API** | Selects were hidden inside an unopened accordion; once opened, a WordPress REST endpoint (`/wp-json/nv/v1/documents`) returns the file URL |
| Jio BlackRock Mutual Fund | NEEDS_INVESTIGATION | **JSON_API** | An Ant Design combobox (blocked by a sticky-nav click interception, fixed with `force=True`) reveals direct Azure CDN file links per scheme |
| Bandhan Mutual Fund | NEEDS_INVESTIGATION | **JSON_API** | Client-side button navigation to a `/portfolio-summary/monthly` route, then a backend download-proxy that signs an underlying GCS URL |
| ICICI Prudential Mutual Fund | NEEDS_INVESTIGATION | **JSON_API** | The AMC's own primary site 307-redirects its real `/downloads/others/monthly-portfolio-disclosures` path to `archive.icicipruamc.com` — a genuinely dead hostname (confirmed via `getent hosts`/`curl -v`: `NXDOMAIN`, not a firewall/TLS block). The real, working page is `/media-center/downloads?currentTabFilter=OtherSchemeDisclosures&subCatTabFilter=Monthly+Portfolio+Disclosures`, found via WebSearch, whose "DOWNLOAD" buttons trigger a single ZIP containing all 151 schemes' `.xlsx` files for the month |
| Bajaj Finserv Mutual Fund | NEEDS_INVESTIGATION | **JSON_API** | A 63-`<select>` page; the "Monthly Portfolio" sub-section's year/month selects (cascading — month options only populate after year is chosen) reveal a direct link, a single workbook covering all 25 schemes |
| Unifi Mutual Fund | NEEDS_INVESTIGATION | **JSON_API** | The first pass's "Scheme Dashboard" hits were genuinely the wrong document type; a deeper pass found the real per-scheme Monthly Portfolio Statement file |
| Zerodha Mutual Fund (Coin) | NEEDS_INVESTIGATION | **JSON_API** | The first pass's "only stale quarterly files" finding was incomplete; a real September 2026 monthly file exists but isn't in the static HTML — only reachable via the rendered page |
| Abakkus Mutual Fund | NEEDS_INVESTIGATION | **JSON_API** | Cascading year/month `<select>` elements (`#mpdYear`/`#mpdMonth`) reveal a single-workbook-many-schemes file (`Index` sheet + 4 per-scheme sheets) |
| quant Money Managers | NEEDS_INVESTIGATION | **JSON_API** | A nested `<li onclick="submit_event1/2(...)">` widget (not a plain `<select>`) drives an AJAX call that populates a `#files` div with the real link |
| Sundaram Mutual Fund | NEEDS_INVESTIGATION | **JSON_API** | A category `<select>` + "View" button reveals a single `Index`-sheet workbook covering 31 schemes |

**Kotak Mahindra Mutual Fund** reclassified `NEEDS_INVESTIGATION` → `BOT_BLOCKED`: `curl`
confirms a genuine Radware Bot Manager challenge (`ssk=botmanager_support@radware.com` in the
302 redirect to `validate.perfdrive.com`); a real headless Playwright browser sometimes gets a
clean 200 and sometimes gets Radware's own "we think you are a bot" interstitial on a repeat
visit — this is a real, address/behavior-level block (just an imperfectly consistent one), not
a missing-link problem more tracing would solve.

**Edelweiss Mutual Fund** and **HDFC Mutual Fund** (already `BOT_BLOCKED` from the first pass)
reconfirmed with the specific mechanism identified: both return `HTTP 403` with an
`akamai-grn` response header — a genuine Akamai WAF block, not a Playwright timing artifact.

## One classification this pass explicitly rejected after independent re-verification

**AlphaGrep Mutual Fund** — a prior in-session note (since superseded) suggested this AMC could
be reclassified `NO_CONTENT_FOUND`. Re-verifying independently found the opposite: AlphaGrep has
three live, allotted schemes (Multi Asset Allocation Fund, allotted 24-Jul-2026; Flexi Cap Fund,
allotted ~Aug-2026; Liquid Omni FOF, launched 4-Aug-2026) that are well past their first
month-end disclosure deadline, so a real monthly portfolio file should exist. The AMC's real
domain is `alphagrepmf.ai` (`alphagrepmf.com` — the domain the first pass checked — is a
privately-held, parked domain, unrelated to the AMC and a dead end by itself). On the real
domain, the "Portfolio Disclosure" nav item triggers a `POST /api/v1/api` call whose request and
response bodies are both AES-encrypted base64 blobs (`{"data": "...", "keyIv": "...", "tag":
"..."}`), the same encrypted-API blocker mechanism already documented for Canara Robeco and
Mahindra Manulife. AlphaGrep stays `NEEDS_INVESTIGATION`, now for a concrete, specific, and
correctly-attributed reason — not reclassified to `NO_CONTENT_FOUND`, which this pass confirmed
would have been wrong.

## Two upgrades found during direct re-verification (originally `NEEDS_INVESTIGATION`)

**Aditya Birla Sun Life Mutual Fund** → `STATIC_REGEX`. The portfolio page's filtered download
catalogue hides a direct zip: `30092026_abslmf_monthlydisclosure.zip`, a 105-sheet workbook (one
sheet per scheme). It is a genuine legacy `.xls` (BIFF/Composite Document Format, not OOXML) —
`openpyxl` cannot open it; use `xlrd`. Verified header row: `Name of the Instrument / Issuer |
ISIN | Industry^ / Rating | Quantity | Market value (Rs. in Lakhs) | % to AUM`. Page:
`https://mutualfund.adityabirlacapital.com/forms-and-downloads/portfolio`.

**JM Financial Mutual Fund** → `STATIC_REGEX`. Found and downloaded `Monthly Portfolio - JM
Large Cap Fund - Sep 30, 2026.xlsx` directly (modern `.xlsx`, `openpyxl` reads it fine). Verified
header row: `ISIN | Name of Instrument | Rating/Industry | Quantity | Market Value (In Rs. lakh)
| % To Net Assets`. Page: `https://www.jmfinancialmf.com/downloads/Portfolio-Disclosure`.

## What survived a second, harder pass: 6 AMCs genuinely still hard

After pushing every original `NEEDS_INVESTIGATION` case one interaction-step deeper (see
"Second audit pass" above), only 6 AMCs remain unresolved, each for a specific, verified
reason — not "couldn't resolve DNS" or "didn't try hard enough":

| AMC | Why it's genuinely hard |
|---|---|
| Union Asset Management | Monthly Portfolios section is a live Angular app with a year/month selector; the backing XHR for the selected file wasn't recoverable from the rendered DOM even on a second, deeper pass |
| Canara Robeco Mutual Fund | The "Portfolio Disclosure" nav item drives a genuinely encrypted request/response REST API (same AES-encrypted-blob mechanism independently confirmed for Mahindra Manulife and AlphaGrep) — not a missing-selector problem, an actual encryption layer between the client and the real file |
| WhiteOak Capital Mutual Fund | The domain in the original batch-C finding, `whiteoakcapitalmf.com`, is a **dead/parked GoDaddy domain**, not WhiteOak's real site. Real domain is `whiteoakamc.com` — but that site's own "Downloads" mega-menu link (`/resources/downloads/product-documents`) 404s even when navigated from within a live browser session on their own homepage. This is a broken link on WhiteOak's own site, confirmed reproducible, not a trace-tooling failure |
| Mahindra Manulife Mutual Fund | Site-redesign-orphaned: the old disclosure-page SID/URL pattern is dead; the redesigned site's equivalent surfaces the same genuinely-encrypted request/response API mechanism as Canara Robeco and AlphaGrep |
| AlphaGrep Mutual Fund | Real domain is `alphagrepmf.ai`, not the dead/parked `alphagrepmf.com` the first pass checked — but even on the real domain, the "Portfolio Disclosure" nav item drives the same genuinely-encrypted API mechanism as Canara Robeco/Mahindra Manulife. 3 live allotted schemes confirm content should exist; the blocker is the encryption layer, not a missing page |
| Monarch Mutual Fund (Networth) | Found genuine recent files, but both are labeled **"Fortnightly"** (Overnight Fund, 15 Sep and 30 Sep 2026) — confirms no monthly consolidated file is exposed for this AMC's one live scheme; re-confirmed on a second pass, not a stale finding |

**Pattern worth naming explicitly for the architectural design:** 3 of these 6 (Canara Robeco,
Mahindra Manulife, AlphaGrep) share the exact same blocker — a genuinely encrypted
request/response API, not merely an unscripted JS interaction. This is a distinct, recurring
blocker *class* (not three unrelated one-offs), and the look-through design should treat
"encrypted API" as its own named category alongside "bot-blocked" and "needs mirror," since
none of curl/Playwright/select-automation can solve it without either reverse-engineering the
specific encryption scheme per AMC or finding an alternate (mirror) source.

## Confirmed `BOT_BLOCKED` (3) — distinct from `NEEDS_INVESTIGATION`

These return a clean HTTP 403/bot-challenge to both a plain `curl` and a real headless
browser — the block is deliberate and address/behavior-level, not a missing-link problem more
tracing would solve:

- **Edelweiss Mutual Fund** — `curl` to the notice/disclosure page returns `HTTP 403` with an
  `akamai-grn` response header — a confirmed Akamai WAF block
- **HDFC Mutual Fund** — same: `curl` to `statutory-disclosure/portfolio/monthly-portfolio`
  returns `HTTP 403` with an `akamai-grn` header — confirmed Akamai, not a Playwright timing
  artifact. (Batch D had separately noted HDFC's portfolio-disclosure page is *not* blocked the
  way its attribute-04 factsheet page is — that finding doesn't hold up under a direct `curl`
  check and is corrected here.)
- **Kotak Mahindra Mutual Fund** — reclassified from `NEEDS_INVESTIGATION` after a second pass:
  `curl` gets a 302 redirect to `validate.perfdrive.com` with
  `ssk=botmanager_support@radware.com` in the query string, an unambiguous Radware Bot Manager
  fingerprint. A real headless Playwright run sometimes gets a clean 200 with real content and
  sometimes gets Radware's explicit "we think you are a bot" challenge page on an immediately
  following request — a real, address/behavior-based block, just non-deterministic per-request
  rather than a hard 100% block.

**PGIM India Mutual Fund** — previously listed here from batch C's finding, **corrected to
`JSON_API`** this pass: the batch-C `BOT_BLOCKED` verdict was itself a sandbox-network
artifact, not a real block. `pgimindia.com`'s disclosure page has a clean, unauthenticated JSON
REST API (`resultStatus`/`pdfPath` fields) with file history back to 2021, confirmed via a
genuinely downloaded and opened file.

## Confirmed `NO_CONTENT_FOUND` (5) — AMC genuinely has nothing to fetch yet

- **ASK Mutual Fund** — AMFI-registered 2026-02-16, first scheme opened 2026-09-03; first
  month-end portfolio isn't due until 2026-10-10 (the day after this research)
- **IL&FS Mutual Fund (IDF)** — batch D's dispatch-prompt AMC name ("IL&FS Infra," IITL) was
  wrong; corrected name confirmed, but no live scheme/disclosure found
- **Lakshya Mutual Fund** — AMFI-registered, no live scheme found
- **Carnelian Mutual Fund** — first MF scheme still at NFO/draft stage
- **Nuvama Mutual Fund** — AMFI-registered, no launched scheme found

**Angel One Mutual Fund** — previously listed here from batch B's finding (flagged "not
re-checked"), **corrected to `STATIC_REGEX`** this pass: it does have monthly files (per-scheme,
per-month, under a "Portfolio Disclosures" sidebar category) going back years — the original
classification was simply wrong, not stale, confirmed by directly downloading and opening a
September 2026 file.

## Master tier table — all 57 AMCs

| AMC | Final tier | Source |
|---|---|---|
| Nippon India Mutual Fund | STATIC_REGEX | batch A |
| DSP Mutual Fund | STATIC_REGEX | batch A |
| Aditya Birla Sun Life Mutual Fund | STATIC_REGEX | batch A, upgraded this session |
| SBI Mutual Fund | STATIC_REGEX | batch A |
| Union Asset Management | **STATIC_REGEX** | batch A, upgraded 4th pass (predictable `www.unionmf.com` static file path bypasses the Angular SPA entirely) |
| Motilal Oswal Mutual Fund | STATIC_REGEX | batch A |
| quant Money Managers | **JSON_API** | batch A, upgraded 2nd pass (`submit_event1/2` AJAX widget) |
| Mirae Asset Mutual Fund | STATIC_REGEX | batch A |
| NJ Mutual Fund | STATIC_REGEX | batch A |
| Franklin Templeton Mutual Fund (India) | STATIC_REGEX | batch A |
| Invesco Mutual Fund | STATIC_REGEX | batch A |
| Canara Robeco Mutual Fund | **STATIC_REGEX** | batch A, upgraded 4th pass (the encrypted API is only one nav item; the actual monthly files are plain WordPress `wp-content/uploads/` assets) |
| Baroda BNP Paribas Mutual Fund | **STATIC_REGEX** | batch A, upgraded 2nd pass (direct link in static HTML) |
| PPFAS Mutual Fund (Parag Parikh) | STATIC_REGEX | batch A |
| Shriram Mutual Fund | STATIC_REGEX | batch B |
| Bajaj Finserv Mutual Fund | **JSON_API** | batch B, upgraded 2nd pass (cascading year/month select) |
| Helios Mutual Fund | STATIC_REGEX | batch B |
| Zerodha Mutual Fund | **JSON_API** | batch B, upgraded 2nd pass |
| Unifi Mutual Fund | **JSON_API** | batch B, upgraded 2nd pass |
| Angel One Mutual Fund | **STATIC_REGEX** | batch B, corrected 2nd pass (was misclassified NO_CONTENT_FOUND) |
| Capitalmind Mutual Fund | STATIC_REGEX | batch B |
| Abakkus Mutual Fund | **JSON_API** | batch B, upgraded 2nd pass (cascading year/month select) |
| LIC Mutual Fund | STATIC_REGEX | batch B |
| JM Financial Mutual Fund | STATIC_REGEX | batch B, upgraded 1st-pass re-verification |
| Old Bridge Mutual Fund | STATIC_REGEX | batch B |
| Quantum Mutual Fund | STATIC_REGEX | batch B |
| Samco Mutual Fund | STATIC_REGEX | batch B |
| ICICI Prudential Mutual Fund | **JSON_API** | batch B, upgraded 2nd pass (dead `archive.` subdomain; real page found via WebSearch) |
| Axis Mutual Fund | STATIC_REGEX | batch C |
| Choice Mutual Fund | JSON_API | batch C |
| UTI Mutual Fund | JSON_API | batch C |
| ITI Mutual Fund | STATIC_REGEX | batch C |
| PGIM India Mutual Fund | **JSON_API** | batch C, corrected 2nd pass (was BOT_BLOCKED, a sandbox-DNS artifact) |
| WhiteOak Capital Mutual Fund | NEEDS_INVESTIGATION | batch C, confirmed across 2 passes (dead-domain + broken-nav-link) |
| Trust Mutual Fund | STATIC_REGEX | batch C |
| HSBC Mutual Fund | STATIC_REGEX | batch C |
| Sundaram Mutual Fund | **JSON_API** | batch C, upgraded 2nd pass (category select + View button) |
| Groww Mutual Fund | STATIC_REGEX | batch C |
| 360 ONE Mutual Fund | STATIC_REGEX | batch C |
| Tata Mutual Fund | JSON_API | batch C |
| Taurus Mutual Fund | STATIC_REGEX | batch C |
| ASK Mutual Fund | NO_CONTENT_FOUND | batch C |
| Bandhan Mutual Fund | **JSON_API** | batch D, upgraded 2nd pass (button-driven route + signed GCS URL) |
| Jio BlackRock Mutual Fund | **JSON_API** | batch D, upgraded 2nd pass (Ant Design combobox, `force=True`) |
| Navi Mutual Fund | **JSON_API** | batch D, upgraded 2nd pass (accordion + WordPress REST endpoint) |
| Bank of India Mutual Fund | **STATIC_REGEX** | batch D, upgraded 2nd pass (stable curlable workbook URL) |
| Mahindra Manulife Mutual Fund | NEEDS_INVESTIGATION | batch D, confirmed across 4 passes — 4th pass directly observed the `investorapi.mahindramanulife.com` endpoint returning an AES-encrypted payload (not just inferred); real static files exist (`/uploads/download/{uuid}.xlsx`) but the UUID isn't discoverable without decrypting the API |
| Edelweiss Mutual Fund | BOT_BLOCKED | batch D, confirmed across 4 passes (Akamai, `akamai-grn` header; 4th pass found the real disclosure page via Wayback but it's a client-rendered SPA shell with no static links and no capturable API) |
| IL&FS Mutual Fund (IDF) | NO_CONTENT_FOUND | batch D (name corrected from "IL&FS Infra") |
| Lakshya Mutual Fund | NO_CONTENT_FOUND | batch D |
| Carnelian Mutual Fund | NO_CONTENT_FOUND | batch D |
| AlphaGrep Mutual Fund | **STATIC_REGEX** | batch D, upgraded 4th pass (a separate plain static path, `www.alphagrepmf.ai/assets/documents/...`, bypasses the encrypted API entirely, deterministic filename from the calendar alone) |
| Nuvama Mutual Fund | NO_CONTENT_FOUND | batch D |
| Wealth Company Mutual Fund | **STATIC_REGEX** | batch D, upgraded 2nd pass (97-file server-rendered grid) |
| Monarch Mutual Fund (Networth) | NEEDS_INVESTIGATION | batch D, confirmed across 2 passes (fortnightly-only, no monthly file) |
| HDFC Mutual Fund | **STATIC_REGEX** | batch D, upgraded 4th pass (Wayback's cached HTML of the Akamai-blocked disclosure page reveals the current filename; the file itself downloads live from the separate unblocked `files.hdfcfund.com` subdomain) |
| Kotak Mahindra Mutual Fund | **BOT_BLOCKED**, likely resolving to STATIC_REGEX shortly | batch D, 4th pass found a separate unblocked CDN (`vatseelabs-s3.kotakmf.com`) confirmed live for the Fortnightly file; the Monthly file is believed to follow the identical naming pattern (per the AMC's own hosting-notice PDF) but hasn't yet published for the current month as of 2026-10-09 (~10-day lag) — re-check after ~2026-10-12 |

## Third pass: closing out the remaining 9 (3 `BOT_BLOCKED` + 6 `NEEDS_INVESTIGATION`) with an operational plan, not more scraping

Before accepting any AMC as permanently hard, this pass tried a short, targeted set of
alternate-source checks (not more automation effort against the same blocked page): alternate
static-asset subdomains, third-party aggregator mirrors, robots.txt/sitemap leaks, and
Wayback Machine. Time-boxed deliberately — the goal was to find a genuinely different *source*,
not to out-wait a WAF.

**`BOT_BLOCKED` (3) — no alternate automatable source found; genuinely blocked, not under-tried:**

- **HDFC Mutual Fund**: `www.hdfcfund.com` blocks even `robots.txt` with Akamai's "Access Denied"
  (edge/IP-reputation-level, not a JS challenge a browser can solve). A separate static-asset
  subdomain, `files.hdfcfund.com`, *is* directly fetchable (confirmed: downloaded a real,
  Google-indexed PDF from it with plain `curl`, no block) — but it only serves files whose exact
  name is already known from search-engine indexing or the blocked page itself; the real
  monthly-portfolio `.xlsx` isn't independently indexed there, and 4 reasonable filename guesses
  against it all 403'd (expected — S3-backed, no guessable listing). The third-party aggregator
  that looked like it might mirror the real file (AdvisorKhoj) turned out to only link back to
  the same blocked HDFC URL for every month, not host an actual copy.
- **Edelweiss Mutual Fund**: same Akamai signature (`akamai-grn` header, `robots.txt` itself
  blocked) — no distinct alternate subdomain found this pass.
- **Kotak Mahindra Mutual Fund**: Radware confirmed via 3 separate probes this pass (direct
  `curl`, two different page paths via Playwright) — one earlier Playwright run got a clean 200,
  but every other attempt (4 more, across 2 different URLs) was challenged. Kotak's own
  `robots.txt` leaked a disallowed path (`/kotakmf/reportupload/download/`) that resolves to an
  S3 bucket (`assets.kotakmf.com`) — real, but access-denied on a blind root request since the
  exact object key is only ever revealed by passing the Radware challenge on the main page first.

**Decision for all 3 `BOT_BLOCKED` AMCs: manual monthly fetch**, the same operational pattern
already used for some attribute-04 factsheet AMCs — a human downloads the file once a month from
an ordinary browser (no datacenter IP/bot fingerprint to trip) and drops it into the same
ingestion intake the automated adapters use. Rejected alternatives: a paid residential-proxy/
CAPTCHA-solving setup (real recurring cost, operational complexity, and arguably contrary to the
sites' terms, for only 3 of 57 AMCs — not proportionate); retrying indefinitely with more
Playwright variations (already shown non-deterministic/blocked across 7+ attempts this pass
alone, not a "just try once more" problem).

**`NEEDS_INVESTIGATION` (6) — accepted, no further automation attempted this pass:**

- **Canara Robeco, Mahindra Manulife, AlphaGrep** (3 AMCs, 1 shared blocker): a genuinely
  encrypted request/response API. Reverse-engineering the client-side decryption key is possible
  in principle but is a real, open-ended reverse-engineering effort per AMC (and the 3 sites
  aren't confirmed to share the same key/scheme, so solving one wouldn't necessarily solve the
  others) — not pursued further, per explicit scope decision: not worth the effort for 3 of 57
  AMCs. **Decision: manual monthly fetch**, same as the `BOT_BLOCKED` 3 above.
- **Union Asset Management**: backing XHR for its Angular year/month selector wasn't recoverable.
  **Decision: manual monthly fetch.**
- **WhiteOak Capital Mutual Fund**: the second pass's "broken link on their own site" finding
  was on the *wrong* domain (`whiteoakamc.com`'s own nav link 404s) — one more targeted search
  this pass found the actual working mutual-fund subdomain, **`mf.whiteoakamc.com`**, whose
  `/regulatory-disclosures/scheme-portfolios` page returns a genuine `HTTP 200` (confirmed via
  `curl`, not yet downloaded/content-verified). This reclassifies WhiteOak from "genuinely
  dead-ended" to "real page found, one more interaction step away" — **decision: worth a
  follow-up automation attempt during ingestion-adapter build-out** (not manual fetch), since
  unlike the other 5 in this bucket, this one isn't blocked by anything, just not yet fully
  driven to a downloaded file.
- **Monarch Mutual Fund (Networth)**: confirmed (twice, across two passes) that only
  **fortnightly** files exist — there is no monthly file to find, on any domain. This isn't a
  fetch failure at all. **Decision: ingest the fortnightly file as this AMC's best available
  granularity**; no manual-fetch workaround needed since nothing is being missed.

**`NO_CONTENT_FOUND` (5)** — per explicit decision: these AMCs genuinely have nothing to
disclose yet (too new, no live scheme, or pre-NFO); this isn't a problem to solve. **Decision:
the ingestion design treats "no file published this month" as a normal, expected per-AMC state,
not an error path** — no manual fetch, no retry logic, just absence of a row for that AMC that
month. One exception worth a calendar note, not engineering: **ASK Mutual Fund**'s first
month-end disclosure was due 2026-10-10 (the day after this research) — worth a routine
re-check once that date has passed, since it may already have flipped to fetchable by the time
ingestion is actually built.

### Summary: what every one of the remaining 14 "not immediately automatable" AMCs needs

| Decision | AMCs | Why |
|---|---|---|
| **Manual monthly fetch** (7) | Edelweiss, HDFC, Kotak Mahindra (`BOT_BLOCKED`); Canara Robeco, Mahindra Manulife, AlphaGrep (encrypted API); Union Asset Management (unrecoverable XHR) | Genuinely blocked or genuinely not worth per-AMC reverse-engineering effort for this few AMCs — cheapest real option, same pattern as existing factsheet precedent |
| **Automate during adapter build-out** (1) | WhiteOak Capital | Not blocked — a real, responding page was found this pass; just needs the same select/click-and-capture work already done for the 43 solved AMCs |
| **Ingest as-is, different granularity** (1) | Monarch (Networth) | No monthly file exists at all; fortnightly is the genuine ceiling, not a gap |
| **Treat as expected empty state** (5) | ASK, IL&FS, Lakshya, Carnelian, Nuvama | AMC-side: no content to publish yet; design for absence, not failure |

With this, **44/57 AMCs are either already fetchable (43) or will be once WhiteOak's adapter is
built (1)**; the remaining 13 have an explicit, cheap operational answer (7 manual, 1
different-granularity, 5 no-op) rather than an open question — this is the basis for the
"110%" confirmation: not that every AMC is automatable, but that every AMC has a deliberate,
justified plan.

**Superseded by the fourth pass below** — the third pass's "7 manual fetch" count was accepted
too early. A fourth, maximal-effort pass (same day, more tokens available) found genuine new
alternate sources for 4 of those 7, cutting the manual-fetch count to 2.

## Fourth pass: one more maximal-effort round on the remaining 9, before accepting any as final

The third pass closed the "110%" gate with an operational plan, but accepted "manual fetch" for
7 AMCs after only a short, time-boxed alternate-source check. Given more budget, this pass went
deliberately harder on exactly those 9 (3 `BOT_BLOCKED` + 6 `NEEDS_INVESTIGATION`, i.e. everything
except the 5 `NO_CONTENT_FOUND`), using two techniques not fully exploited in the third pass:

1. **Internet Archive / Wayback Machine as a Locate-step workaround for WAF-blocked main sites.**
   Internet Archive's own crawler reaches some sites our direct `curl`/Playwright requests cannot
   (observed for HDFC specifically — Akamai's edge rules apparently don't block the Wayback
   crawler's IP/fingerprint the way they block ours). Wayback's cached HTML of the blocked page
   reveals the current month's real filename; if that filename happens to live on a *separate*,
   unblocked static-asset/CDN subdomain (not the WAF-protected main domain), the actual file then
   downloads live, right now, with no block at all.
2. **Broad, non-keyword-filtered CDX domain searches**, rather than searches filtered to
   `urlkey:.*portfolio.*` — the third pass's narrower searches for Union and Canara Robeco missed
   real hits because the live files don't all have "portfolio" literally in the URL path (Union's
   uses `/fund-portfolio/`; Canara Robeco's don't have the word in the path at all, just the fund
   name and month).

**Reclassified from manual-fetch to fully automatable (4 AMCs):**

- **HDFC Mutual Fund → `STATIC_REGEX`.** Wayback's CDX index has both a July-2025 and a
  September-2026 capture of the (Akamai-blocked) disclosure page; the September 2026 capture's
  cached HTML lists the current month's exact filename. That filename downloads successfully,
  live, right now, from `files.hdfcfund.com` — the same separate static-asset subdomain found in
  the third pass, previously thought useless because its filenames weren't independently
  discoverable. Wayback turned out to be the missing discovery mechanism. Verified: downloaded
  and opened a real file (HDFC Arbitrage Fund, 31 August 2026) with genuine ISIN/Industry/
  Quantity/Market Value/%NAV data.
- **AlphaGrep Mutual Fund → `STATIC_REGEX`** (not merely "not `NO_CONTENT_FOUND`" as the second
  pass had it — fully solved, and not behind the encrypted API at all). A Wayback CDX search
  surfaced a separate, plain, unprotected static path:
  `www.alphagrepmf.ai/assets/documents/{Scheme_Name}/monthly/FY-{year}-{year+1}/{Month}_{Year}.xls`
  — fully deterministic from the calendar alone, no discovery step needed at all going forward.
  Confirmed live via direct download: AlphaGrep Flexi Cap Fund, 31 August 2026, genuine ISIN/
  Industry/Quantity/Market Value/%AUM data verified with `xlrd`.
- **Union Asset Management → `STATIC_REGEX`.** The third pass's verdict ("unrecoverable XHR")
  was about the Angular front-end's year/month selector specifically — but the underlying files
  sit on a plain Sitefinity-CMS-style static path that was never actually blocked:
  `www.unionmf.com/docs/default-source/funddetail-downloads/fund-portfolio/{month-year}/
  monthly-portfolio-report-{scheme-name-slug}-{dd-mm-yyyy}.xlsx`. Confirmed live for the current
  month: a directly-guessed August-2026 URL (built from the same pattern as a Wayback-captured
  August-2024 file) returned `HTTP 200` with genuine "MONTHLY PORTFOLIO STATEMENT OF UNION
  CORPORATE BOND FUND AS ON AUGUST 31, 2026" content — real ISIN/Rating/Industry/Quantity/Market
  Value/%NAV/YTM columns, verified with `openpyxl`. (Note: `unionmf.com` without the `www.` prefix
  doesn't resolve — an easy trap when constructing the adapter.)
- **Canara Robeco Mutual Fund → `STATIC_REGEX`.** The encrypted API found in the second pass is
  real, but it's not the only path to the data: `canararobeco.com` is a WordPress site, and its
  monthly portfolio statements are plain `wp-content/uploads/{year}/{month-uploaded}/` media
  assets — e.g. `SC-–-Canara-Robeco-Small-Cap-Fund-–-August-2026.xlsx`. A broad (non-"portfolio"-
  filtered) CDX search found dozens of these going back to 2025, with a 2-letter fund-code prefix
  (`BA`, `BP`, `DB`, `DV`, `EQ`, `FE`, `FR`, `GB`, `GL`, `MO`, `SC`...) + an en-dash + the full
  fund name + an en-dash + the month. Confirmed live: downloaded the August-2026 Small Cap Fund
  file, genuine ISIN/Industry/Quantity/Market Value/%NAV data verified with `openpyxl`. The
  encrypted API is most likely just the disclosure *page's* own search/filter UI, not a gate on
  the files themselves.

**Upgraded from confirmed-blocked to likely-solvable-shortly (1 AMC, not yet counted as solved):**

- **Kotak Mahindra Mutual Fund — `BOT_BLOCKED` stands for now, but a resolution path is
  identified.** A separate, plain, unprotected CDN subdomain, `vatseelabs-s3.kotakmf.com`, hosts
  the real files — confirmed live for the **Fortnightly** disclosure (downloaded and verified with
  `xlrd`). The AMC's own hosting-notice PDF (also downloaded via Wayback, text-extracted with
  `pypdf`) confirms the **Monthly** disclosure is hosted on the same CDN with an identically
  structured path, but publishes with a ~10-day lag after month-end. One evidence-based filename
  guess for the current month's Monthly file (`.../Monthly-Portfolio-as-on-September-30,-2026/
  MonthlyPortfolioSeptember302026.xlsx`) returned `403` — most likely because the file genuinely
  isn't published yet as of 2026-10-09 (one day before the ~10-day mark), not because the naming
  guess is wrong; no Monthly file for the current month was found anywhere (Wayback or live)
  either, which is consistent with a timing gap rather than a dead end. Per the standing
  no-brute-force-guessing correction, this was not retried with further filename variants — the
  next step is a routine re-check after ~2026-10-12, not more guessing.

**Reconfirmed, still genuinely needs manual fetch (2 AMCs — down from 7 in the third pass):**

- **Edelweiss Mutual Fund.** Found the real current disclosure page URL via Wayback
  (`edelweissmf.com/altivasif/statutory/portfolio-of-schemes`) and inspected its cached HTML —
  confirmed to be a client-rendered SPA shell with zero embedded file links and no captured
  API/XHR call specific to portfolio holdings. The Wayback trick that solved HDFC and Kotak
  doesn't generalize here: Wayback's crawler doesn't execute client-side JS, so it never triggers
  (and therefore never captures) whatever API call this specific SPA makes to fetch its data.
- **Mahindra Manulife Mutual Fund.** The third pass had *inferred* an encrypted API from the
  shared blocker pattern seen at Canara Robeco/AlphaGrep; this pass found and fetched the actual
  endpoint via Wayback CDX (`investorapi.mahindramanulife.com/api/v1/web/fetch-all-funds`,
  captured 2026-07-22) and directly confirmed its JSON response's `payload` field is an opaque
  encrypted string (not JSON, not a list — a single base64-shaped blob), not merely inferred from
  pattern-matching. Real static files do exist, unprotected, at a `/uploads/download/{uuid}.xlsx`
  path — but the UUID for the current month's file is only ever revealed by decrypting this API's
  response, which is exactly the "don't crack the encrypted API" boundary this investigation has
  respected throughout. Confirmed dead end without crossing that line.

**Reconfirmed unchanged from the third pass (2 AMCs):**

- **WhiteOak Capital Mutual Fund** — re-fetched `mf.whiteoakamc.com/regulatory-disclosures/
  scheme-portfolios` live: still `HTTP 200`, still has no direct file links in the raw HTML (the
  page is JS-rendered, needs a proper select/click-driven adapter, same as ~14 other `JSON_API`
  AMCs already solved this way). No new blocker found; the third pass's "automate during adapter
  build-out, not manual" decision stands exactly as-is.
- **Monarch Mutual Fund (Networth)** — one more broad domain search (no "portfolio" keyword
  filter) on both `networthdirect.com` and `monarchnetworth.com` surfaced nothing new relevant to
  mutual fund disclosures. The fortnightly-only ceiling is reconfirmed a third time; "ingest at
  its real ceiling" stands exactly as-is.

### Revised summary: what every one of the remaining 10 "not immediately automatable" AMCs needs

| Decision | AMCs | Why |
|---|---|---|
| **Manual monthly fetch** (2) | Edelweiss (Akamai, SPA shell, no bypass found across 4 passes); Mahindra Manulife (encrypted API directly confirmed, UUID undiscoverable without decrypting it) | Genuinely exhausted every legitimate alternate source; cheapest real option left |
| **Pending a short re-check, very likely solvable** (1) | Kotak Mahindra | Fortnightly confirmed live on an unblocked CDN; Monthly believed identical, just not yet published as of 2026-10-09 — re-check after ~2026-10-12 before falling back to manual |
| **Automate during adapter build-out** (1) | WhiteOak Capital | Not blocked — a real, responding page; just needs the same select/click-and-capture work already proven for 14 other AMCs |
| **Ingest as-is, different granularity** (1) | Monarch (Networth) | No monthly file exists at all; fortnightly is the genuine ceiling, not a gap |
| **Treat as expected empty state** (5) | ASK, IL&FS, Lakshya, Carnelian, Nuvama | AMC-side: no content to publish yet; design for absence, not failure |

With this, **47/57 AMCs are already fetchable**, 1 more (Kotak) is very likely to join them
within days, 1 more (WhiteOak) just needs its adapter built, 1 (Monarch) ingests at its genuine
ceiling, 5 are an expected no-op, and only **2 of 57 AMCs (3.5%) are confirmed to need a standing
manual-fetch process** — a far smaller permanent operational burden than the third pass's 7
suggested, found entirely through legitimate alternate-source discovery (Wayback Machine, broader
domain searches, reading an AMC's own hosting-notice PDF) with no encryption-cracking and no
brute-force filename guessing beyond single evidence-based hypothesis tests.

## What this changes for sub-project 2's architectural design

- An ingestion build covering the 47 `STATIC_REGEX`/`JSON_API` AMCs today is real and
  immediately buildable with the same per-AMC-adapter pattern as attribute 04 — no new unknowns.
  Note the recurring "one file, many schemes" shape (a single workbook or ZIP covering every
  scheme for the AMC, e.g. Bank of India, Abakkus, Sundaram, Baroda BNP Paribas, ICICI
  Prudential's 151-file ZIP) — the ingestion job design should assume a per-AMC "bundle" can
  resolve to N schemes, not hardcode a 1-file-per-scheme assumption.
- **A "separate unprotected static-asset/CDN subdomain, distinct from the main WAF-protected
  domain" is a recurring, nameable pattern, not a one-off** — found this session for HDFC
  (`files.hdfcfund.com`), Kotak (`vatseelabs-s3.kotakmf.com`), AlphaGrep
  (`alphagrepmf.ai/assets/documents/...`), Union (`unionmf.com/docs/default-source/...`), and
  Canara Robeco (`canararobeco.com/wp-content/uploads/...`). AMCs very often build their public
  website on a bot-protected CMS/app platform but host the actual files on a plain storage/CDN
  tier that was never configured with the same protection. **The Locate stage's adapter design
  should explicitly support "find the filename elsewhere (Wayback, a sitemap, a hosting-notice
  PDF, a broad domain search), then fetch from a different host than the one you located it on"**
  as a first-class pattern, not treat every WAF 403 as terminal.
- **Internet Archive / Wayback Machine is a legitimate, reusable Locate-step fallback for the
  genuinely bot-blocked cases**, not just a one-off trick for this investigation. Its own crawler
  reaches some WAF-protected pages that direct requests can't, and its CDX API
  (`web.archive.org/cdx/search/cdx`) is a cheap, scriptable way to search a domain's entire
  crawled history for a filename pattern. Worth building a small shared helper for this (query
  CDX for a domain + date range, fetch the cached HTML/JSON of the most recent capture) rather
  than re-deriving the curl incantations per AMC each time it's needed — likely useful again for
  AMCs not in today's 2-manual-fetch list if a URL pattern ever changes.
- `BOT_BLOCKED` (2: Edelweiss via Akamai with no bypass found; Kotak Mahindra via Radware on its
  main site, but with a confirmed-working alternate-CDN bypass pending only a ~10-day Monthly-
  file publishing lag) needs an explicit design decision only for Edelweiss (proxy/rotation, a
  manual/scheduled fetch, or accepting this as a standing exception) — Kotak's design should just
  be "fetch from `vatseelabs-s3.kotakmf.com` like any other `STATIC_REGEX` AMC," no bot-handling
  logic needed at all once the Monthly file is confirmed live.
- `NO_CONTENT_FOUND` (5) isn't a gap to close — these AMCs have nothing to ingest yet; the
  design should treat "no file this month" as an expected, not exceptional, per-AMC state.
- `NEEDS_INVESTIGATION` (3, down from 6) no longer has "encrypted API" as its dominant shape —
  that pattern mostly turned out to be a red herring once a separate static source was found for
  2 of the original 3 encrypted-API AMCs (Canara Robeco, AlphaGrep). Only **Mahindra Manulife**
  is now confirmed to be genuinely gated by its encrypted API with no bypass (directly observed,
  not inferred, this pass). The other 2 (WhiteOak's not-yet-automated-but-unblocked page,
  Monarch's fortnightly-only cadence) remain distinct one-offs, neither related to encryption.
  This re-shapes the look-through engine's ingestion architecture: an "encrypted API" adapter
  category is still worth keeping as a documented concept (for Mahindra Manulife, and in case a
  future AMC turns out to share the same scheme), but it should no longer be treated as a
  load-bearing, multi-AMC blocker class the way the third pass suggested — it affects exactly
  one AMC now.

## Checked post-spec: AMFI's own "Portfolio Disclosure" page is a directory, not a central file feed

**2026-10-10.** Ayush flagged a lead worth checking immediately before any implementation
starts: AMFI's own site (`amfiindia.com/online-center/portfolio-disclosure`) advertises a
central portfolio-disclosure page. Fetched and inspected directly (`curl`, then parsed the
embedded Next.js RSC JSON payload). **Confirmed real, but it is a directory of links, not
an aggregated file source:** a JSON array of all 57 AMCs (`mf_id`/`mf_name` keyed), each
with its own `amc_monthly_portfolio_disclosure`/`amc_fortnightly_portfolio_disclosure`/
`amc_halfYearly_portfolio_disclosure` URL — pointing to each AMC's own page, not a file
AMFI itself hosts. Cross-checked a sample against this investigation's own findings: the
AlphaGrep entry points to `www.alphagrepmf.ai/disclosures` (same domain the fourth pass
independently found); no `amfiindia.com`-hosted `.xlsx`/`.xls`/`.zip` file links exist
anywhere on the page (confirmed via regex scan — the only `amfiindia.com` file links on
the page are unrelated CMS assets: logo SVGs, a code-of-ethics PDF).

**Net effect on this spec: none to the data model or pipeline, one real but small Locate-stage
optimization.** This directory doesn't reduce the adapter count (still need 47+ per-AMC
Locate/Parse implementations — AMFI's page gives you the entry *page* URL, not the file
itself, so Fetch/Parse/Normalize/Write are unaffected either way) or change the
`disclosure_batch`/`scheme_holding` schema. What it *does* usefully provide: an
AMFI-maintained, machine-readable seed list of each AMC's current disclosure-page URL —
worth using as the Locate stage's starting point instead of a hardcoded per-AMC URL,
since it reduces future config drift if an AMC moves its page (AMFI's directory should
update before our own re-discovery would notice). Not worth re-opening the 4-pass
investigation or re-deriving any of the 47 adapters' URLs from this directory now — the
URLs already found and content-verified are confirmed correct and match this directory
where checked.

## Source documents

- `2026-10-06-amc-portfolio-disclosure-format-survey.md` (spike 1 — regulatory format, not
  per-AMC reachability)
- `2026-10-09-amc-portfolio-disclosure-spike-batch-A.md` (raw, pre-re-verification)
- `2026-10-09-amc-portfolio-disclosure-spike-batch-B.md` (raw, pre-re-verification)
- `2026-10-09-amc-portfolio-disclosure-spike-batch-C.md` (raw, pre-re-verification)
- `2026-10-09-amc-portfolio-disclosure-spike-batch-D.md` (raw, pre-re-verification)
- This document supersedes all four batch documents' tier columns; the batch documents are kept
  for their original page URLs, notes, and the specific column headers already verified for the
  `STATIC_REGEX`/`JSON_API` AMCs.
