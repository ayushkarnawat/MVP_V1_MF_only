# AMC Monthly Portfolio Disclosure — Format Survey (Spike 1 of N)

**Date:** 2026-10-06
**Status:** First-pass spike complete — regulatory format confirmed, per-AMC file reachability
spot-checked. Not exhaustive (did not individually crawl all 40+ AMC websites); this de-risks the
"what does the data actually look like" question enough to scope the ingestion build, but a
second pass (pulling and diffing 8-10 real AMC files column-by-column) is still recommended
before writing the parser.
**Triggered by:** Open Question #4 from
`Docs/analytics/2026-10-06-analytics-pdf-attribute-gap-analysis.md` — "kick off the
AMC-disclosure-ingestion-format survey as the first spike," decided 2026-10-06.
**Why this matters:** this is the data input the look-through engine (PDF section 00) needs —
the single biggest gap blocking 6 of the PDF's 15 attributes (02, 06, 10, 13, 15, plus 00 itself).

---

## Headline finding: this is a regulator-prescribed format, not 40+ ad hoc ones

The earlier framing in the gap-analysis/deep-understanding docs ("40+ AMCs, inconsistent
monthly PDF/Excel formats, no single aggregated feed") was directionally right but understated
one important fact: **SEBI's Master Circular for Mutual Funds prescribes a standard "Monthly
Portfolio Disclosure" format** (Section 3.C, "Monthly Portfolio Disclosure and Half Yearly
Portfolio Disclosures," p.83 of SEBI's `Formats for Master Circular for Mutual Funds` document,
confirmed by directly fetching and extracting that PDF this session). Every AMC is filing against
the same regulatory template, not inventing its own columns independently.

**Confirmed core fields, present by regulation (and independently corroborated by multiple
third-party descriptions of real published files):**

| Field | Purpose for the look-through engine |
|---|---|
| Name of the Instrument | Human-readable stock/bond name (not the join key — see below) |
| **ISIN** | The join key — exactly matches the PDF's own "match by ISIN, not name" rule |
| Industry / Sector classification | Feeds attribute 06's sector cut, attribute 13's non-equity split |
| Quantity | Raw share count |
| Market Value (₹ Lakhs) | Absolute holding value |
| **% to NAV** | The security-weight-inside-fund input to the look-through formula directly |
| (Debt only) Rating, Coupon, Yield | Not needed for equity-side attributes 02/06/10/13/15 |

This is good news specifically for the formula in PDF section 00 — `% to NAV` is *already* the
"security weight inside that fund" term the look-through formula needs, pre-computed by the AMC,
not something Unifolio has to derive from quantity × price itself.

## What's still genuinely inconsistent (the real remaining risk)

1. **No single aggregated feed.** Unlike NAV (one AMFI daily file) or TER (one AMFI periodic
   file), portfolio disclosures are **filed by each AMC separately**, both on the AMC's own
   website and to AMFI — AMFI does not appear to re-publish them as one combined cross-AMC file
   (confirmed: AMFI's `otherdata` page lists "Monthly Portfolio Disclosures" as a topic, but
   fetching it directly this session showed no unified download — only a menu of topics, pointing
   back to per-AMC sourcing). This means ~40+ separate monthly fetches, not one.
2. **File format varies by AMC presentation, not by regulatory content.** Several AMCs (SBI,
   HDFC, ICICI Prudential, confirmed via each AMC's own disclosures page this session) publish
   via their own "Downloads"/"Statutory Disclosure" pages as dated monthly files; third-party
   aggregators (AdvisorKhoj) mirror these. The regulatory content is standardized; the wrapper
   (one Excel workbook per scheme-sheet vs. a single PDF table vs. a zipped multi-sheet workbook)
   is not — this session's web research corroborates third-party commentary describing "per-AMC
   Excel files with slight column-name variations, no clean cross-AMC join keys [across AMCs,
   i.e. no master ISIN-to-AMC-code table], late filings, and inconsistent industry
   classifications" (sector-naming differs AMC to AMC even though SEBI mandates an "Industry"
   column — e.g. one AMC's "Banks" vs. another's "Banking & Finance").
3. **Direct file URLs are not yet confirmed machine-fetchable.** This spike confirmed the
   *landing pages* exist and are publicly reachable (no login) for SBI, HDFC, and ICICI
   Prudential. It did **not** confirm the actual file download links or their exact structure —
   those pages render via JavaScript, which this session's fetch tooling couldn't execute; a
   real scrape would need either a headless browser or finding each AMC's underlying API/CDN
   file-listing endpoint (the same kind of reverse-engineering already done once for NSE's
   indices endpoint, see `2026-10-06-tri-sourcing-feasibility-confirmed.md`).

## What this changes about scoping the look-through engine

The core per-security schema question — "will the data even contain ISIN and a usable weight
field, consistently, across AMCs" — is now **answered: yes, by regulation.** That was the
scariest unknown. What remains is squarely an **ingestion-engineering problem, not a data-quality
unknown**: ~40 separate monthly fetches, likely requiring per-AMC adapters (or a headless-browser
approach) rather than one shared client, plus a sector-name normalization table (since "Industry"
values aren't a shared enum across AMCs even though every AMC includes some such column).

## Recommended next step (spike 2, not yet done)

Pick 8-10 AMCs by AUM share, actually download one real monthly file from each (not just confirm
the landing page), and diff their real column headers/sheet structure side by side. That's the
piece this pass couldn't finish (JS-rendered download pages) and the piece that will determine
whether a single parser with per-AMC column-name mapping suffices, or whether some AMCs need
bespoke handling (e.g. PDF-only filers, if any still exist despite the regulatory Excel/CSV
push referenced in the SEBI 2024 transparency initiative found during this session's research).

## Not covered by this spike

- The AMFI "Categorization of Large Cap, Mid Cap and Small Cap Stocks" list (the second input the
  look-through engine needs, for attribute 02) is confirmed to exist as its own listed item on
  AMFI's `otherdata` page, separate from portfolio disclosures — but its actual file format/URL
  was not fetched this pass either, for the same JS-rendering reason.
- Fund-manager data (attribute 04's need) and stock P/E/P/B (attribute 15's need, per the earlier
  decision to build free in-house scraping) are out of scope for this spike — separate surveys.
