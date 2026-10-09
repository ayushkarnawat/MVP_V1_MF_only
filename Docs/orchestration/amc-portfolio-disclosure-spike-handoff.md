# AMC Monthly Portfolio Disclosure — Full 57-AMC Fetchability Spike

**Status:** IN_PROGRESS — 4 batches dispatched 2026-10-09 (A: 14 AMCs, B: 14, C: 14, D: 15),
findings due at `Docs/analytics/investigations/2026-10-09-amc-portfolio-disclosure-spike-batch-{A,B,C,D}.md`.

**Parent plan:** None yet — this spike is the prerequisite for sub-project 2
(bucket D: look-through engine + attributes 02/06/10/13/15) architectural
design. Gap analysis: `Docs/analytics/2026-10-06-analytics-pdf-attribute-gap-analysis.md`
(section "0. The architectural core," section "5. What I'd suggest").
Prior partial investigation ("spike 1," 10 AMCs, format survey only — this
spike supersedes it with full 57-AMC coverage):
`Docs/analytics/investigations/2026-10-06-amc-portfolio-disclosure-format-survey.md`.

## Task

For each AMC in your assigned batch (listed in your dispatch prompt, not
here), determine whether that AMC's **monthly stock-level portfolio
disclosure** file (NOT the factsheet — a different document, see
Constraints) is machine-fetchable, and if so, by what method.

Use this exact two-step method, in order, per AMC:

1. **Plain HTTP fetch first.** `curl` (or Python `requests`) with a
   realistic browser `User-Agent` header against the AMC's "Statutory
   Disclosures" / "Portfolio Disclosure" / "Downloads" page. Many AMC
   sites server-render this page — if so, the HTML response itself will
   contain a direct link to a recent (2025 or 2026 dated) monthly
   disclosure file (PDF, XLSX, CSV, or ZIP).
2. **Playwright headless-browser network trace, only if step 1 found
   nothing usable.** Launch headless Chromium, navigate to the page,
   capture all network requests (XHR/fetch/document). JS-rendered SPAs
   hide the real file link behind a client-side API call or a dynamic
   `<a>` tag that a plain GET never sees — the trace reveals the
   underlying API/CDN URL.

For every AMC where you find a real file link, **actually download one
file** (pick any one scheme, most recent available month) and open/parse
it far enough to confirm (or refute) the field set below. Don't just
confirm the link resolves with a 200 — confirm the content is the right
document.

Categorize each AMC into exactly one of these tiers (same taxonomy as the
attribute-04 factsheet investigation, reused on purpose — see
`Docs/analytics/2026-10-07-sub-project-1-planning.md` lines ~1997-2086 for
that precedent table's shape):

- `STATIC_REGEX` — step 1 alone found a working direct link + file
  downloaded and confirmed.
- `JSON_API` — step 2 needed; API/CDN endpoint found + file downloaded
  and confirmed.
- `NEEDS_INVESTIGATION` — something was found (a page, a button, a stale
  link) but not conclusive — name the specific blocker (stale date
  param, wrong document type found, content behind a login/OTP gate, a
  UI tab/dropdown that needs state you couldn't drive headlessly).
- `BOT_BLOCKED` — both methods hit a 403/WAF/Cloudflare challenge.
- `NO_CONTENT_FOUND` — no portfolio-disclosure-shaped document locatable
  via either method; note whether the AMC appears to have any live
  retail schemes at all (check AMFI's scheme list if easy) since some
  very new/boutique AMCs may not yet publish one.

## Constraints

- **This is NOT the factsheet.** Attribute 04's prior investigation found
  factsheet links via `amfiindia.com/online-center/download-factsheets`'s
  embedded Strapi-CMS JSON (`amc_website` field per AMC). Reuse that
  `amc_website` value only as your **starting point** to reach the AMC's
  own site, then navigate to its own "Statutory Disclosures" / "Portfolio
  Disclosure" section — a different page/section from the factsheet
  downloads page. If you need the AMC's website root, re-fetch
  `https://www.amfiindia.com/online-center/download-factsheets` yourself
  (plain curl with a browser UA returns the full page including the
  embedded JSON; no headless browser needed for this one lookup).
- **SEBI's standardized format (confirmed in spike 1, re-confirm or
  refute per AMC with a real downloaded file):** Name of Instrument,
  **ISIN**, Industry/Sector classification, Quantity, Market Value (₹
  Lakhs), **% to NAV**. Debt-only columns (Rating, Coupon, Yield) exist
  on debt schemes but are out of scope for what you're confirming — only
  report on the equity-relevant columns above.
- **Report every AMC in your batch, with no omissions**, even ones you
  couldn't resolve — `NO_CONTENT_FOUND`/`NEEDS_INVESTIGATION` are valid,
  reportable outcomes, not failures to hide.
- **No product code changes.** This is pure external research. Do not
  touch any file under `backend/` or `frontend*/`. Do not run `git add`
  or `git commit` — write your findings doc only; the orchestrator
  handles all staging/commits.
- **Playwright is available** (`playwright==1.62.0` is in
  `backend/requirements.txt`; browsers may or may not be pre-installed in
  your sandbox — if `playwright install chromium` is needed and network
  access allows it, run it; if it's genuinely unavailable, fall back to
  plain `requests`/`curl` only and note in your findings which AMCs you
  could not trace for this reason).
- **Time-box each AMC.** If after a genuine two-method attempt (curl +
  Playwright trace) plus one reasonable follow-up (e.g., trying an
  obvious alternate URL pattern) you still have nothing, categorize it
  `NEEDS_INVESTIGATION` or `NO_CONTENT_FOUND` and move to the next AMC —
  don't sink unbounded time into one AMC at the expense of your whole
  batch.

## Approaches considered and rejected

- **Reusing attribute 04's exact factsheet-page links as the disclosure
  source** — rejected. Portfolio disclosure is a legally distinct,
  separately-filed document from the factsheet; the two commonly live on
  different pages of the same AMC site (sometimes the same "Downloads"
  hub, sometimes not). The factsheet link is only a same-site starting
  point, not the answer.
- **Assuming AMFI re-publishes a single aggregated cross-AMC portfolio
  file** (as it does for NAV/TER) — rejected, already ruled out in spike
  1: no such aggregated feed exists; each AMC must be checked
  individually.

## Open questions

Flag these back in your findings doc rather than guessing a resolution:

- If an AMC's disclosure page requires picking a specific scheme from a
  dropdown with no "all schemes" bulk option, is there a single
  parent/umbrella file, or is it genuinely one file per scheme (matters
  for bucket D's later ingestion design — just report what you observe,
  don't design around it).
- If a file downloads as a password-protected PDF/ZIP, say so explicitly
  — don't attempt to crack it, just note it as its own blocker type under
  `NEEDS_INVESTIGATION`.
- If sector/industry naming looks like it diverges from a standard
  taxonomy (e.g., "Banks" vs "Banking & Finance" vs "BFSI"), note the
  exact string you saw — don't normalize it yourself.

## Output

Write your findings to the exact file path given in your dispatch prompt,
as a markdown table, one row per AMC in your batch:

`| AMC | Website/base URL used | Disclosure page URL found | Tier | File format | Columns confirmed (if downloaded) | Notes/blockers |`

Plus a short prose paragraph per `NEEDS_INVESTIGATION`/`BOT_BLOCKED` AMC
explaining exactly what you tried and where it stopped (this is what lets
the orchestrator decide whether a later investigation pass is worth it).
