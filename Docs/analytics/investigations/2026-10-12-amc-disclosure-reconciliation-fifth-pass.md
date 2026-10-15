# AMC portfolio-disclosure reconciliation — fifth pass (2026-10-12)

> **⚠ SUPERSEDED — not the current state, 2026-10-13.** The sixth pass found and fixed three
> further issues this doc didn't catch (Kotak, AlphaGrep, HSBC's label). The single current
> source of truth is `Docs/analytics/2026-10-09-sub-project-2-lookthrough-engine-spec.md`'s
> "Adapter classification — all 57 AMCs" table. This doc is kept only for the live-recheck
> evidence behind the 16-AMC reconciliation it performed.

**Status:** CLOSED — all 14 AMCs in the plan's "needs Playwright" bucket have been
live-rechecked and resolved (one way or another). Final count, go/no-go decision, and
doc corrections are in this file; see "Still to do" at the end for the remaining,
separate follow-on work (spike doc + plan corrections, then attribute planning).

## Why this pass exists

While reading the newly-committed implementation plan
(`Docs/analytics/plans/2026-10-10-sub-project-2-lookthrough-ingestion-plan.md`) side by side with
the 2026-10-09 consolidated spike
(`Docs/analytics/investigations/2026-10-09-amc-portfolio-disclosure-spike-consolidated.md`), a
direct contradiction surfaced: the plan's "Open items carried forward" section classifies ~16
AMCs as serving a bare JS-shell to a plain `httpx` GET (DSP: 114 bytes; NJ: 1,253 bytes; etc.),
needing Playwright — but the consolidated spike doc already lists nearly every one of those same
AMCs as `STATIC_REGEX`, confirmed with a downloaded, opened file. Both documents can't be right.
This pass re-checked each contradiction live, one AMC at a time, with real `curl` and (where
`curl` found nothing) a headless-Chromium Playwright trace, rather than trusting either prior
document.

**This resolved a material finding: the consolidated spike doc has at least one confirmed false
positive (JM Financial — see below), and several AMCs it marked `STATIC_REGEX` needed a corrected
URL or mechanism, not a Playwright dependency.** The practical effect is that the plan's
Playwright/infra-cost question is smaller than either prior document suggested — most of the
"needs a browser" bucket turned out to need nothing but the right URL.

## Per-AMC findings (verdict column is this pass's conclusion)

| AMC | Spike doc (2026-10-09) | Plan (2026-10-10) | This pass, live-rechecked | Verdict |
|---|---|---|---|---|
| DSP Mutual Fund | `STATIC_REGEX` | JS-shell, needs Playwright (114-byte body) | Plain `curl` **with a realistic Chrome `User-Agent` header** on `dspim.com/mandatory-disclosures/portfolio-disclosures?origin=app` → 405,979 bytes, 345 `.zip`/`.xlsx` links, Sept 2026 ZIP present (`dsp-monthend-portfolio-as-on-30-september-2026.zip`) | **Spike doc was right.** Plan's 114-byte finding was a missing-`User-Agent` artifact, not a real block — DSP needs no Playwright. |
| NJ Mutual Fund | `STATIC_REGEX` | JS-shell, needs Playwright (1,253-byte body on `/downloads`) | The already-documented working endpoint, `downloads.njmutualfund.com/njmf_download.php?nme=127`, still returns 146 KB with 118 direct `viewfile.php?file=...xls/.xlsx` links | **Spike doc was right.** Plan rechecked the wrong URL (the generic `/downloads` landing page, not the working query-string endpoint) — no Playwright needed. |
| Baroda BNP Paribas | `STATIC_REGEX` | JS-shell / `NEEDS_INVESTIGATION` (`/archivedownload/` empty) | `/downloads/monthly-portfolio-scheme` (a sibling page to `/downloads/monthly-factsheet`) returns direct `.xls` links in plain static HTML, e.g. `BOBBNPMF_Monthly_Portfolio_30-09-2026_20376.xls` | **Spike doc was right, landing URL corrected.** `/archivedownload/` is not the real page; `/downloads/monthly-portfolio-scheme` is. No Playwright needed. |
| Wealth Company Mutual Fund | `STATIC_REGEX` | JS-shell, needs Playwright | Confirmed: the 97-file grid is embedded as a literal JSON array inside the page's plain HTML response (`{"uploadDate":"2026-09-30",...,"url":"/uploads/Monthly_Portfolio_<Category>_<hash>.xlsx"}`) — rendered as MUI `<button>`s, which is why a naive `href`-regex missed it, but the JSON itself needs no JS execution to read | **Spike doc was right.** Confirms the spike's own note that this is a server-rendered grid, just implemented as buttons not links — regex against the embedded JSON, not `href`, is the correct extraction. No Playwright needed. |
| 360 ONE Mutual Fund | `STATIC_REGEX` (via `archive.iiflmf.com`) | JS-shell, needs Playwright | `archive.iiflmf.com` is now dead (522 / origin timeout, confirmed twice; DNS itself resolves fine via Cloudflare, so this is an origin outage, not a DNS/typo issue). The live, current domain is `www.360.one/asset/mutual-funds/downloads/` — a Next.js app whose **initial server response** embeds the full document catalog as React Server Component "flight" data (`self.__next_f.push([1,"<escaped JSON>"])`). Regex-extracting and unicode-unescaping those chunks finds `"Monthly Portfolio 2026"` with a direct Sept 2026 link (`IN_MF_MONTHLY_PORTFOLIO_Sep2026_Final.xls`, hosted on a separate public S3 bucket, `s3.ap-south-1.amazonaws.com/x-web-s3.360.one/`); opened and confirmed correct SEBI columns (Name of Instrument, ISIN, Industry/Rating, Quantity, Market Value, % to Net Assets) | **Spike doc's tier was right, but its recorded domain is now stale and must be replaced.** New domain + a new parsing shape: flight-JSON embedded in an otherwise-plain HTML response (same family as Wealth Company's inline-JSON case, not a true JS-shell — no Playwright needed). |
| Invesco Mutual Fund | `STATIC_REGEX` | JS-shell / needs Playwright | `curl -I` → `403` (`server: volt-adc`, a WAF). **Also retried with a real headless-Chromium Playwright navigation → still `403`.** | **Correction: this is a genuine `BOT_BLOCKED`, not `STATIC_REGEX`.** Unlike every AMC above, a real browser doesn't get past Invesco's WAF either — this one isn't a missing-header artifact. |
| Taurus Mutual Fund | `STATIC_REGEX` | JS-shell, needs Playwright | `/financials/portfolio` is a Drupal Views exposed filter; replaying its AJAX POST to `/views/ajax` (no Playwright — a second plain POST, not JS execution) with the year/month `target_id`s returns real `.xls` links for **March 2026, labelled "Half Yearly Portfolio Report"**; September 2026 returns `view-empty`. The month dropdown only ever offers March/September. Separately, `/summary/<scheme>-fund` pages carry their own direct `.xls` downloads under `scheme-summary/<YYYY>_<MM>/excel/`, dated 2026_07, 2026_05, 2026_03, 2026_01, 2025_11 — a roughly bi-monthly cadence, not confirmed as the SEBI-mandated monthly stock-level disclosure (columns not yet opened and checked this pass) | **Correction needed, not yet closed.** Mechanism is an AJAX POST, not a plain GET (still no Playwright, but the plan's current `STATIC_REGEX` shape assumes one GET resolves the file — doesn't fit as-is). More importantly: **unclear which of the two file sets, if either, is the true monthly ISIN-level disclosure** — the main view is explicitly Half-Yearly; the scheme-summary files' column set is unverified. Do not onboard Taurus until this is resolved. |
| JM Financial Mutual Fund | `STATIC_REGEX` ("found and downloaded Monthly Portfolio - JM...") | Not listed (plan treats it as still `STATIC_REGEX` per the spike) | The file the spike's query returns **decodes to 832,xxx bytes of AES-ciphertext**: exact multiple of 16 bytes (block-cipher signature), all 256 byte values present, chi-square ≈ 235 (statistically indistinguishable from random/uniform — the opposite of any compressed, base64, or structured-binary format, which would show a non-uniform byte distribution or a real magic header) | **Correction needed — this is a confirmed false positive in the spike doc.** The spike downloaded *something* with a 200 status, but never opened it; it is not a real workbook, it's an encrypted blob. JM Financial must move out of `STATIC_REGEX` into the same standing-manual-fetch / encrypted-API bucket as Mahindra Manulife (and, per the spec, Edelweiss) — per this project's standing constraint against attempting to crack encrypted vendor APIs, not pursued further. |
| ITI Mutual Fund | `STATIC_REGEX` | JS-shell / needs Playwright | Plain `curl` returns a true Angular SPA shell (275,692 bytes, no "portfolio" text). A real headless-Chromium Playwright navigation to the same URL serves a **Cloudflare interactive-challenge page**, not the app — confirmed with a full network trace, not just a content dump | **Confirmed `BOT_BLOCKED`, not `STATIC_REGEX` and not a Playwright candidate.** Second AMC (after Invesco) where a real browser is blocked too — not a missing-header or SPA-rendering problem, a genuine bot wall. Dead end, matches this project's standing constraint not to pursue bypassing bot detection. |
| Trust Mutual Fund | `STATIC_REGEX` | JS-shell / needs Playwright | A Playwright network trace of the Vite/React SPA found the real backing call: `POST /api/api/Trust/GetData`, a plain JSON endpoint (no auth, no JS execution needed to call) that returns the current month's workbook URL directly; downloaded and opened — correct SEBI columns confirmed | **Resolved, no Playwright needed in production.** One-time Playwright trace found the mechanism; a plain `httpx`/`curl` POST replays it. |
| HSBC Mutual Fund | `STATIC_REGEX` | JS-shell / needs Playwright | Plain `curl` → `403` (`Microsoft-Azure-Application-Gateway`, a WAF). A real headless-Chromium Playwright navigation → `200`, 5.3 MB of genuine server-rendered HTML, with direct per-scheme monthly `.xlsx` links under `/portfolios/document-<DDMMYYYY>/` (latest found: August 2026, `document-31082026`); one opened and confirmed correct SEBI columns | **Confirmed to genuinely need a real-browser fetch** — HSBC's WAF passes a real browser's TLS/header fingerprint but rejects a plain `curl`, and no replayable JSON API was found underneath (unlike every other AMC in this table). Needs Playwright (or an equivalent fingerprint-matching HTTP client, e.g. `curl-impersonate`) in production, not just for discovery. |
| SBI Mutual Fund | `STATIC_REGEX` | Not listed (treated as `STATIC_REGEX`) | The originally-cited `/portfolios?FundID=34&Portfoliotype=Monthly` URL is now just a filter shell. A Playwright trace of the real page found the live mechanism: `POST /ajaxcall/CMS/GetSchemePortfolioSheetsQS`, a plain JSON endpoint — downloaded and opened the returned workbook, correct SEBI columns (Name of Instrument, ISIN, Industry, Quantity, Market Value, % to NAV) confirmed | **Resolved, no Playwright needed in production.** The spike doc's URL is stale (site redesign since 2026-10-09); the replacement is a plain JSON POST, replayable with `curl`/`httpx`. |
| Bank of India Mutual Fund | `STATIC_REGEX` ("a single workbook... Index sheet... at a stable, directly-curlable URL") | Not listed (treated as `STATIC_REGEX`) | `/investor-corner#t2` is a hash-fragment anchor, not a real page. A Playwright trace found the real mechanism: `AjaxService.asmx/GetDocuments`, a plain JSON/SOAP-lite endpoint — downloaded and opened the returned workbook, correct SEBI columns confirmed | **Resolved, no Playwright needed in production.** Same pattern as SBI: the spike's cited URL was never the real mechanism, but the real one is a plain JSON endpoint. |
| Taurus Mutual Fund | `STATIC_REGEX` | JS-shell, needs Playwright | Confirmed via the Drupal exposed-filter's literal field name (`field_hy_portfolio_year_target_id` / `field_hy_portfolio_month_target_id` — "HY" = Half-Yearly) that Taurus genuinely only ever publishes Half-Yearly disclosures (March/September; no monthly file exists at all, a data-availability gap not a fetch problem). Replaying the filter as a **plain GET with those query-string params** (no AJAX/Playwright needed) returns the file directly. Separately opened one `/summary/<scheme>-fund` scheme-summary `.xls` file: its columns are fund metadata / AUM-geography / risk parameters, **not** per-stock ISIN-level holdings — confirmed a different document type, not a monthly substitute | **Resolved as fetchable (plain GET, no Playwright), but flagged as Half-Yearly-only cadence** — a `disclosure_batches`-grain question for sub-project 2 (does the schema accept a non-monthly cadence for this one AMC, or is Taurus simply stale between HY publications), not an AMC-access problem. |
| Mirae Asset Mutual Fund | `STATIC_REGEX` | JS-shell, needs Playwright | The spike's cited page (`/downloads/statutory-disclosure/issuer-wise-disclosure`) and guessed filenames (`/docs/default-source/portfolios/maipf-<mon><yyyy>.xlsx`) are **soft-404 traps** — HTTP 200, but a ~140 KB generic branded HTML error page (confirmed via `content-type: text/html` and `file`, despite the `.xlsx` extension in the guessed URL). The real current page is `/downloads/portfolio` (found by crawling the live nav, not guessing), backed by `AjaxService/GetDownloadsData`, a plain JSON endpoint; downloaded the real current file and opened it — correct SEBI columns confirmed | **Resolved, no Playwright needed in production.** Important negative finding for the adapter registry: status-200 is not sufficient to confirm a real file — content-type/magic-byte checks are mandatory for this AMC's CMS. |
| LIC Mutual Fund | `STATIC_REGEX` (deterministic `/Monthly-Fortnightly-Portfolio/{scheme-code}` pattern) | Not listed (treated as `STATIC_REGEX`) | The spike's cited deterministic URL pattern is stale — the site has been redesigned. The real mechanism is a two-step JSON POST chain: `/downloads/portfolio-filter-options` (discover available year/month) then `/downloads/portfolio-files` (fetch the file URL for a selected year/month); downloaded and opened, correct SEBI columns confirmed | **Resolved, no Playwright needed in production.** Same "redesigned site, new JSON API, still no JS execution required" pattern as Trust MF/SBI/BOI. |
| Axis Mutual Fund | `STATIC_REGEX` ("one consolidated workbook... `/cms/sites/default/files/Statutory/...`") | Not listed (treated as `STATIC_REGEX`) | The spike's cited static path is stale (site redesign). Real mechanism, found via Playwright trace of the "Portfolios" accordion: `POST /cms/token` (**public, unauthenticated** — returns a bearer token with no login) → `POST /cms/get-scheme-documents` (`{"sdType":"yearMonthSchemeDocs","sdID":"sdMonthSchemePortfolio","year":"2026","month":"October","schemeCode":"Consolidated"}`, using that bearer token) → response's `documentList` gives direct `.xlsx`/`.xls` file URLs (each with a random hash suffix, not guessable without the API call). Replayed the entire chain with plain `curl` end-to-end, downloaded the file, opened it — correct SEBI columns (Name of Instrument, ISIN, Industry, Quantity, Market/Fair Value, % to Net Assets) confirmed in the `AXIS500` sheet of a multi-scheme consolidated workbook | **Resolved, no Playwright needed at all** — not even for one-time discovery past this point; the entire chain, including token issuance, is a plain unauthenticated JSON API replayable with `curl`/`httpx`. |
| Aditya Birla Sun Life Mutual Fund | `NEEDS_INVESTIGATION` (batch A — sandbox couldn't resolve external hosts in that original pass) | Not listed | Plain `curl` on `/forms-and-downloads/portfolio` returns an SSR page shell; a Playwright trace found the real backing call: `GET /postlogin/CustomApi/Resources/FactsheetAccordionById?id=...&ctype=...&month=...&year=0`, a plain JSON endpoint (no auth) returning a `pdfUrl` per month, e.g. a ZIP at `https://abcscprod.azureedge.net/-/media/bsl/files/resources/monthly-portfolio/2026/...zip`. **That literal `pdfUrl` host is dead** — `abcscprod.azureedge.net` is a genuine `NXDOMAIN` confirmed independently via three public resolvers (Google, Cloudflare, Quad9) querying Azure's own authoritative nameservers, consistent with Microsoft's retirement of the classic Azure CDN (`azureedge.net`); this is a site-side stale-link bug, not a sandbox network restriction. **Workaround found:** the same `/-/media/...` path also resolves directly on the live `mutualfund.adityabirlacapital.com` domain (confirmed via another resource link on the same site using that exact pattern) — substituting the live domain for the dead CDN host and re-fetching returns the real ZIP; extracted `.xls` inside has correct SEBI columns (Name Instrument/Issuer, ISIN, Industry^/Rating, Quantity, Market value, % to AUM) confirmed | **Resolved, no Playwright needed in production — but the adapter must rewrite the API's `pdfUrl` host to the live domain, not fetch it as literally returned.** Flag for the adapter registry: don't trust this AMC's JSON API response verbatim; strip the `abcscprod.azureedge.net` host and refetch from `mutualfund.adityabirlacapital.com` with the same path. |
| JM Financial Mutual Fund | `STATIC_REGEX` ("found and downloaded Monthly Portfolio - JM...") | Not listed (plan treats it as still `STATIC_REGEX` per the spike) | The file the spike's query returns **decodes to 832,xxx bytes of AES-ciphertext**: exact multiple of 16 bytes (block-cipher signature), all 256 byte values present, chi-square ≈ 235 (statistically indistinguishable from random/uniform — the opposite of any compressed, base64, or structured-binary format, which would show a non-uniform byte distribution or a real magic header) | **Correction needed — this is a confirmed false positive in the spike doc.** The spike downloaded *something* with a 200 status, but never opened it; it is not a real workbook, it's an encrypted blob. JM Financial must move out of `STATIC_REGEX` into the same standing-manual-fetch / encrypted-API bucket as Mahindra Manulife (and, per the spec, Edelweiss) — per this project's standing constraint against attempting to crack encrypted vendor APIs, not pursued further. |

## Net effect on the Playwright/infra-cost question (final tally)

Of the ~16 AMCs the plan deferred as "needs a headless-browser Fetch step", every one has now
been live-rechecked:

- **Resolved with no Playwright needed at all, in production** (wrong UA, stale URL, a
  static-HTML-embedded-JSON shape the plan's generic `href`-regex missed, or a plain JSON/AJAX
  API discoverable once and replayable forever with `curl`/`httpx`): DSP, NJ Mutual Fund, Baroda
  BNP Paribas, Wealth Company, 360 ONE, Trust Mutual Fund, SBI, Bank of India, Taurus (flagged
  separately for its Half-Yearly-only cadence, not a fetch problem), Mirae Asset, LIC, Axis,
  Aditya Birla Sun Life — **13 AMCs**. Of these, Trust MF/SBI/BOI/Mirae/LIC/Axis each needed a
  **one-time** Playwright trace purely to discover the real current URL or JSON API shape — the
  resulting production fetch is plain HTTP replay, no browser execution involved.
- **Confirmed to genuinely need a real-browser fetch in production**: HSBC — **1 AMC**. No
  replayable JSON API was found underneath its WAF; it passes a real browser's TLS/header
  fingerprint but rejects plain `curl`.
- **Confirmed `BOT_BLOCKED` even with a real headless-Chromium browser** (not Playwright
  candidates — a browser doesn't help): Invesco, ITI — **2 AMCs**. Dead ends per this project's
  standing constraint against bypassing bot detection.
- **Confirmed a false positive, corrected to the encrypted-API dead-end bucket** (alongside
  Mahindra Manulife and Edelweiss): JM Financial — **1 AMC**.

**Final count: 1 AMC (HSBC) needs Playwright (or an equivalent fingerprint-matching HTTP client)
as a standing production dependency.** 13 of the 16 need nothing but the right URL/JSON API; 2
(Invesco, ITI) are genuine bot walls regardless of tooling; 1 (JM Financial) is an encrypted dead
end regardless of tooling.

**Go/no-go decision: no — do not add Playwright as a production runtime dependency for
sub-project 2.** One AMC does not justify a headless-browser runtime, its container image size,
or its ongoing maintenance burden. HSBC becomes the sixth standing-manual-fetch AMC (joining
Edelweiss, Mahindra Manulife, Invesco, ITI and JM Financial), re-evaluated later if Playwright becomes needed for
other reasons. Playwright remains useful as a **one-time discovery tool** run ad hoc from a
developer machine whenever an AMC's URL/API goes stale — that is a research technique, not a
production dependency, and needs no infra decision.

## Still to do

1. ~~Finish AMC reconciliation~~ — done, see table and final tally above.
2. Correct the consolidated spike doc
   (`Docs/analytics/investigations/2026-10-09-amc-portfolio-disclosure-spike-consolidated.md`)
   and the implementation plan's "Open items carried forward" section + Task 5 adapter registry
   (`Docs/analytics/plans/2026-10-10-sub-project-2-lookthrough-ingestion-plan.md`) to match every
   correction in the table above: DSP/NJ/Baroda BNP/Wealth Company/360 ONE/Trust MF/SBI/Bank of
   India/Taurus/Mirae/LIC/Axis/Aditya Birla Sun Life → no Playwright needed (with corrected
   URLs/mechanisms); ITI and Invesco → confirmed `BOT_BLOCKED`; JM Financial → confirmed false
   positive, move to the encrypted-dead-end bucket; HSBC → confirmed genuinely needs
   Playwright/a fingerprint-matching client, named the sixth standing-manual-fetch AMC instead (the six are Edelweiss, Mahindra Manulife, Invesco, ITI, JM Financial, HSBC).
3. Record the go/no-go decision above in `decisions.md`.
4. Brainstorm + spec + plan + visual-map for look-through-dependent attributes 02, 06, 10, 13, 15.
5. Update `session.md`/`log.md` to reflect this reconciliation's close-out.

None of this touches `backend/` or `frontend*/` — it's pure research, same constraint as the
original spike. No code has been written for sub-project 2 yet (confirmed via `git log`/`find`:
the implementation plan commit is docs-only, no `portfolio_disclosure_*` module exists in
`backend/app/services/analytics/` yet).
