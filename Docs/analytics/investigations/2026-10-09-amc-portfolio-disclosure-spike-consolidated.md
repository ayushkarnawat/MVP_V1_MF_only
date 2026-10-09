# AMC Monthly Portfolio Disclosure Fetchability Spike — Consolidated (Spike 2 of N)

**Date:** 2026-10-09.
**Status:** Complete. All 57 AMFI-registered AMCs classified; every original `NEEDS_INVESTIGATION`
case re-verified with real network access (no sandbox DNS restriction).
**Triggered by:** spike 1's recommended-but-undone "second pass" (per
`2026-10-06-amc-portfolio-disclosure-format-survey.md`) — pull a real monthly portfolio
disclosure file from every AMC, not a sample, and confirm machine-fetchability the same way
attribute 04's AMC-matching spike did (curl-first, Playwright-trace fallback, tiered
categorization).
**Methodology note:** batches A, B, and D were initially produced in Codex sandboxes with no
DNS resolution to AMC hosts, so their `NEEDS_INVESTIGATION` counts were inflated by a tooling
limitation, not AMC-side difficulty. Every one of those 22 cases was re-run directly in this
session (real `curl` + headless Chromium/Playwright, reusing attribute 04's network-trace
script), which is why the final tier counts below differ from the 4 raw batch documents.

## Headline: 28/57 (49%) confirmed machine-fetchable today; 20/57 need a harder per-AMC solve

| Tier | Count | Meaning |
|---|---|---|
| `STATIC_REGEX` | 25 | Plain HTML/server-rendered page exposes a direct, dated file URL — no JS execution needed to fetch |
| `JSON_API` | 3 | Page is client-rendered, but a discoverable JSON/XHR endpoint behind it returns the file URL |
| `BOT_BLOCKED` | 3 | Site returns HTTP 403 to both a plain request and a real headless-browser request — needs a different approach (proxy/rotation) or manual fetch, not just more Playwright patience |
| `NO_CONTENT_FOUND` | 6 | AMC-side: fund genuinely has no monthly disclosure to publish yet (too new) or no disclosure page/live scheme was found at all |
| `NEEDS_INVESTIGATION` | 20 | Confirmed, with real network access, that no static file link or simple API exists — needs a dedicated per-AMC deep-dive (form automation, mega-menu/JS-click sequencing, or accepting a third-party mirror) |

`STATIC_REGEX` + `JSON_API` = 28 AMCs buildable today with the same curl/regex approach as
attribute 04. The remaining 29 split between AMCs that can't be solved by more scraping effort
(`BOT_BLOCKED`, `NO_CONTENT_FOUND`) and AMCs that likely can, but need bespoke automation per
site (`NEEDS_INVESTIGATION`).

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

## What direct re-verification confirmed was genuinely NOT a sandbox artifact

20 AMCs remain `NEEDS_INVESTIGATION` after a real browser/network pass, each for a specific,
verified reason — not "couldn't resolve DNS":

| AMC | Why it's genuinely hard |
|---|---|
| Union Asset Management | Monthly Portfolios section is a live Angular app with a year/month selector; the backing XHR for the selected file wasn't recoverable from the rendered DOM |
| quant Money Managers | Same pattern — 2026 selector UI, no static document links, backing API not identified |
| Canara Robeco Mutual Fund | Only PDF "declaration of hosting" notices are static-linked; the actual stock-level workbook sits behind a portfolio tab with no exposed file URL |
| Baroda BNP Paribas Mutual Fund | Downloads page is a dynamic filtered shell (category/month pickers); no direct workbook link surfaced in the rendered DOM |
| Bajaj Finserv Mutual Fund | No portfolio file found; page structure not yet mapped |
| Zerodha Mutual Fund (Coin) | Only stale **quarterly** files found — no monthly file is exposed at all |
| Unifi Mutual Fund | Found file-shaped hits ("Scheme Dashboard" xlsx), but downloaded and opened them — wrong document type (scheme summary, not instrument-level holdings) |
| Abakkus Mutual Fund | Same pattern — "Scheme Dashboard" and a stress-test/liquidity-analysis file, both ruled out by content, not instrument-level holdings |
| ICICI Prudential Mutual Fund | Site has constant background polling (networkidle never settles); even with a `load`-based wait, 0 file-shaped hits surfaced |
| WhiteOak Capital Mutual Fund | The domain in the original batch-C finding, `whiteoakcapitalmf.com`, is a **dead/parked GoDaddy domain**, not WhiteOak's real site. Real domain is `whiteoakamc.com` — but that site's own "Downloads" mega-menu link (`/resources/downloads/product-documents`) 404s even when navigated from within a live browser session on their own homepage. This is a broken link on WhiteOak's own site, confirmed reproducible, not a trace-tooling failure |
| Sundaram Mutual Fund | Found the real page (`/monthly-fortnightly-adhoc-portfolios`), but it's a dynamic scheme/date-picker form with no static file links in the rendered DOM — consistent with batch C's original finding, now confirmed with a second independent pass |
| Bandhan Mutual Fund | 0 file-shaped hits with real network + Playwright |
| Jio BlackRock Mutual Fund | Only wrong-document-type hits (notices, factsheets) |
| Navi Mutual Fund | 0 file-shaped hits |
| Bank of India Mutual Fund | Only wrong-document-type hits (newsletters) |
| Mahindra Manulife Mutual Fund | Only wrong-document-type hits |
| AlphaGrep Mutual Fund | Only 3 unrelated PDF hits (distributor form, lock-in facility, investor charter) — no portfolio file located |
| Wealth Company Mutual Fund | 0 file-shaped hits |
| Monarch Mutual Fund (Networth) | Found genuine recent files, but both are labeled **"Fortnightly"** (Overnight Fund, 15 Sep and 30 Sep 2026) — confirms no monthly consolidated file is exposed for this AMC's one live scheme |
| Kotak Mahindra Mutual Fund | 196 requests captured, 0 file hits — the disclosure page's document sections render empty client-side |

## Confirmed `BOT_BLOCKED` (3) — distinct from `NEEDS_INVESTIGATION`

Unlike the 20 above, these return a clean HTTP 403 to both a plain `curl` and a real headless
browser — the block is deliberate and address-level, not a missing-link problem more tracing
would solve:

- **PGIM India Mutual Fund** (confirmed in batch C's original sandbox pass, which had real
  network access)
- **Edelweiss Mutual Fund** — `curl` to the notice/disclosure page returns `HTTP 403` directly;
  confirmed this session, not a Playwright timing artifact
- **HDFC Mutual Fund** — same: `curl` to `statutory-disclosure/portfolio/monthly-portfolio`
  returns `HTTP 403` directly. (Batch D had separately noted HDFC's portfolio-disclosure page is
  *not* blocked the way its attribute-04 factsheet page is — that finding doesn't hold up under a
  direct `curl` check and is corrected here.)

## Confirmed `NO_CONTENT_FOUND` (6) — AMC genuinely has nothing to fetch yet

- **Angel One Mutual Fund** (batch B original finding; not independently re-checked this
  session since it wasn't in the `NEEDS_INVESTIGATION` bucket — lower priority, flagged for a
  future spot-check)
- **ASK Mutual Fund** — AMFI-registered 2026-02-16, first scheme opened 2026-09-03; first
  month-end portfolio isn't due until 2026-10-10 (the day after this research)
- **IL&FS Mutual Fund (IDF)** — batch D's dispatch-prompt AMC name ("IL&FS Infra," IITL) was
  wrong; corrected name confirmed, but no live scheme/disclosure found
- **Lakshya Mutual Fund** — AMFI-registered, no live scheme found
- **Carnelian Mutual Fund** — first MF scheme still at NFO/draft stage
- **Nuvama Mutual Fund** — AMFI-registered, no launched scheme found

## Master tier table — all 57 AMCs

| AMC | Final tier | Source |
|---|---|---|
| Nippon India Mutual Fund | STATIC_REGEX | batch A |
| DSP Mutual Fund | STATIC_REGEX | batch A |
| Aditya Birla Sun Life Mutual Fund | STATIC_REGEX | batch A, upgraded this session |
| SBI Mutual Fund | STATIC_REGEX | batch A |
| Union Asset Management | NEEDS_INVESTIGATION | batch A, confirmed this session |
| Motilal Oswal Mutual Fund | STATIC_REGEX | batch A |
| quant Money Managers | NEEDS_INVESTIGATION | batch A, confirmed this session |
| Mirae Asset Mutual Fund | STATIC_REGEX | batch A |
| NJ Mutual Fund | STATIC_REGEX | batch A |
| Franklin Templeton Mutual Fund (India) | STATIC_REGEX | batch A |
| Invesco Mutual Fund | STATIC_REGEX | batch A |
| Canara Robeco Mutual Fund | NEEDS_INVESTIGATION | batch A, confirmed this session |
| Baroda BNP Paribas Mutual Fund | NEEDS_INVESTIGATION | batch A, confirmed this session |
| PPFAS Mutual Fund (Parag Parikh) | STATIC_REGEX | batch A |
| Shriram Mutual Fund | STATIC_REGEX | batch B |
| Bajaj Finserv Mutual Fund | NEEDS_INVESTIGATION | batch B, confirmed this session |
| Helios Mutual Fund | STATIC_REGEX | batch B |
| Zerodha Mutual Fund | NEEDS_INVESTIGATION | batch B, confirmed this session |
| Unifi Mutual Fund | NEEDS_INVESTIGATION | batch B, confirmed this session |
| Angel One Mutual Fund | NO_CONTENT_FOUND | batch B, not re-checked |
| Capitalmind Mutual Fund | STATIC_REGEX | batch B |
| Abakkus Mutual Fund | NEEDS_INVESTIGATION | batch B, confirmed this session |
| LIC Mutual Fund | STATIC_REGEX | batch B |
| JM Financial Mutual Fund | STATIC_REGEX | batch B, upgraded this session |
| Old Bridge Mutual Fund | STATIC_REGEX | batch B |
| Quantum Mutual Fund | STATIC_REGEX | batch B |
| Samco Mutual Fund | STATIC_REGEX | batch B |
| ICICI Prudential Mutual Fund | NEEDS_INVESTIGATION | batch B, confirmed this session |
| Axis Mutual Fund | STATIC_REGEX | batch C |
| Choice Mutual Fund | JSON_API | batch C |
| UTI Mutual Fund | JSON_API | batch C |
| ITI Mutual Fund | STATIC_REGEX | batch C |
| PGIM India Mutual Fund | BOT_BLOCKED | batch C |
| WhiteOak Capital Mutual Fund | NEEDS_INVESTIGATION | batch C, re-verified this session (dead-domain + broken-nav-link finding) |
| Trust Mutual Fund | STATIC_REGEX | batch C |
| HSBC Mutual Fund | STATIC_REGEX | batch C |
| Sundaram Mutual Fund | NEEDS_INVESTIGATION | batch C, re-verified this session |
| Groww Mutual Fund | STATIC_REGEX | batch C |
| 360 ONE Mutual Fund | STATIC_REGEX | batch C |
| Tata Mutual Fund | JSON_API | batch C |
| Taurus Mutual Fund | STATIC_REGEX | batch C |
| ASK Mutual Fund | NO_CONTENT_FOUND | batch C |
| Bandhan Mutual Fund | NEEDS_INVESTIGATION | batch D, confirmed this session |
| Jio BlackRock Mutual Fund | NEEDS_INVESTIGATION | batch D, confirmed this session |
| Navi Mutual Fund | NEEDS_INVESTIGATION | batch D, confirmed this session |
| Bank of India Mutual Fund | NEEDS_INVESTIGATION | batch D, confirmed this session |
| Mahindra Manulife Mutual Fund | NEEDS_INVESTIGATION | batch D, confirmed this session |
| Edelweiss Mutual Fund | BOT_BLOCKED | batch D, reclassified this session (HTTP 403 confirmed via curl) |
| IL&FS Mutual Fund (IDF) | NO_CONTENT_FOUND | batch D (name corrected from "IL&FS Infra") |
| Lakshya Mutual Fund | NO_CONTENT_FOUND | batch D |
| Carnelian Mutual Fund | NO_CONTENT_FOUND | batch D |
| AlphaGrep Mutual Fund | NEEDS_INVESTIGATION | batch D, confirmed this session |
| Nuvama Mutual Fund | NO_CONTENT_FOUND | batch D |
| Wealth Company Mutual Fund | NEEDS_INVESTIGATION | batch D, confirmed this session |
| Monarch Mutual Fund (Networth) | NEEDS_INVESTIGATION | batch D, confirmed this session (fortnightly-only, no monthly file) |
| HDFC Mutual Fund | BOT_BLOCKED | batch D, reclassified this session (HTTP 403 confirmed via curl) |
| Kotak Mahindra Mutual Fund | NEEDS_INVESTIGATION | batch D, confirmed this session |

## What this changes for sub-project 2's architectural design

- An ingestion build covering the 28 `STATIC_REGEX`/`JSON_API` AMCs today is real and
  immediately buildable with the same per-AMC-adapter pattern as attribute 04 — no new unknowns.
- `BOT_BLOCKED` (3) needs an explicit design decision (proxy/rotation, a manual/scheduled fetch,
  or accepting a third-party mirror as a fallback source for just these AMCs) rather than more
  scraping engineering.
- `NO_CONTENT_FOUND` (6) isn't a gap to close — these AMCs have nothing to ingest yet; the
  design should treat "no file this month" as an expected, not exceptional, per-AMC state.
- `NEEDS_INVESTIGATION` (20, ~35% of all AMCs) is the real remaining design question: most
  need either (a) scripted multi-step browser automation (select year/month/scheme, then
  capture the resulting XHR/download — the same shape as batch C's `Tata`/`JSON_API` solve, just
  not yet reverse-engineered per-site) or (b) a documented decision to accept a vetted
  third-party mirror for AMCs where first-party automation isn't worth the per-site engineering
  cost. This split (28 easy / 3 blocked / 6 empty / 20 hard-but-likely-solvable) should directly
  shape the look-through engine's ingestion architecture and its per-AMC adapter-vs-mirror
  decision, rather than assuming a single uniform scraper will cover all 57.

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
