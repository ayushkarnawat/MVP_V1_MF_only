# Sub-project 2 — Look-Through Engine Architecture Spec

**Date:** 2026-10-09
**Status:** Design reached agreement with Ayush in-session, pressure-tested from multiple
angles (see "Pressure-test log" below), written directly per his explicit instruction —
no further approval gate needed before writing this document. **HTML artifact exists**
(`Docs/analytics/artifacts/2026-10-09-sub-project-2-lookthrough-engine-visual-map.html`) —
the "still needs its matching HTML artifact" note here was stale, corrected 2026-10-13.
Individual sign-off gates within this spec's scope are each closed and recorded in
`decisions.md`: the AMC-reachability spike (4+2 reconciliation passes, "2026-10-12" entry),
the Playwright go/no-go ("2026-10-12" entry, decided no), and the `asset_type` amendment
(approved 2026-10-12, added to the `SchemeHolding` model below — originally proposed in the
consumer spec's §7.1). No standing sign-off gate remains open on this document as of
2026-10-13.
**Branch:** `feat/enhanced-ui` (implementation branch TBD via `writing-plans`)
**Scope:** PDF section 00 (the look-through engine itself) plus every attribute that reads
from it — 02 (category allocation via AMFI market-cap list), 06 (overall stock holdings),
10 (portfolio overlap), 13 (asset allocation equity/debt/gold/cash), 15 (portfolio P/E,
P/B). Attributes 01/03/04/05/07/08/09/11/12/14 are independently buildable and out of
scope here — see `2026-10-06-analytics-pdf-attribute-gap-analysis.md` §0/§2/§3.
**Feasibility source:** `Docs/analytics/investigations/2026-10-09-amc-portfolio-disclosure-spike-consolidated.md`
(4 passes, all 57 AMFI-registered AMCs classified) and
`Docs/orchestration/amc-portfolio-disclosure-spike-handoff.md`.

## Context and what this closes

Zero stock-level holdings data exists anywhere in the codebase today — confirmed by grep
across `backend/` and `Docs/` (gap analysis §0). The platform only has fund-*level*
metadata (category, AMC, TER, NAV, AUM); nothing about what a fund actually holds. Five of
the PDF's 15 attributes are blocked on this single missing data source. The formula
driving everything downstream:

```
Client exposure to security = Σ over funds ( Fund weight in client portfolio × Security weight inside fund )
```

Fund weight is already computable (`scheme's value ÷ total MF portfolio value`, same as
`allocation.py`). Security weight is the missing half — sourced from each fund's monthly
AMC-published portfolio disclosure, matched by ISIN.

The spike (4 passes, plus a fifth and sixth reconciliation pass on 2026-10-12) answered
the only open question blocking this design: **is the data actually reachable?** Final
count: **44/57 AMCs machine-fetchable today with a live-verified mechanism (Kotak
Mahindra resolved 2026-10-12 — see below), 6/57 need a standing manual-fetch process
(Edelweiss, Mahindra Manulife — genuine WAF/encrypted-API blocks; Invesco, ITI —
bot-blocked even against a real headless browser; JM Financial — confirmed
encrypted-API false positive; HSBC — the sole AMC needing a standing Playwright/
fingerprint-matching dependency, rejected per the go/no-go decision in `decisions.md`),
1 (WhiteOak) needs its adapter built during build-out, 1 (Monarch) ingests at its
genuine fortnightly ceiling, 5 are an expected no-content state.** Every AMC has an
explicit, justified plan — this spec is what that plan becomes.

## Data model

Two tables, no more. The temptation to add a third ("bundle"/"file"/"job" tracking) is
rejected below (Alternatives considered).

### `disclosure_batch` — one row per (scheme, as-of-date) disclosure event

```python
class DisclosureBatch(Base):
    __tablename__ = "disclosure_batches"
    __table_args__ = (
        UniqueConstraint("scheme_id", "as_of_date", name="uq_disclosure_batches_scheme_date"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    scheme_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("schemes.id"), nullable=False, index=True)
    as_of_date: Mapped[date_] = mapped_column(nullable=False)  # exactly as given by the source file
    amc_name: Mapped[str] = mapped_column(String, nullable=False)  # denormalized, for adapter-level queries without a schemes join
    status: Mapped[DisclosureBatchStatus] = mapped_column(enum_column(DisclosureBatchStatus), nullable=False)
    # PENDING | FETCHED | PARSED | WRITTEN | FAILED | AWAITING_MANUAL_UPLOAD
    source_url: Mapped[str | None] = mapped_column(String, nullable=True)
    raw_file_reference: Mapped[str | None] = mapped_column(String, nullable=True)  # S3 key of the original downloaded file
    parse_errors: Mapped[list[dict] | None] = mapped_column(JSONB, nullable=True)  # [{"file": "...", "error": "..."}]
    fetched_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    written_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
```

**Why (scheme, as_of_date), not (amc, month):** Canara Robeco mixes monthly (equity) and
fortnightly (some debt) disclosure cadence for different schemes under the same AMC —
keying by (AMC, month) would make the grain ambiguous/colliding the first time an AMC's
schemes disclose on different cadences. (scheme, as_of_date) has no such collision, and
storing `as_of_date` verbatim as the source states it (rather than coercing to a
canonical "month-end") means the ingestion layer never has to guess — "which snapshot
counts as period X's data" is an analytics/query-time decision, not an ingestion-time one.

**`AWAITING_MANUAL_UPLOAD`** is this table's existing state doing double duty as the queue
for the 6 AMCs needing a human-dropped file (Edelweiss, Mahindra Manulife, Invesco, ITI,
JM Financial, HSBC — Kotak Mahindra resolved to automated `STATIC_REGEX` 2026-10-12, no
longer in this set) — same precedent as attribute 04's factsheet manual-upload path. No
separate table for "things waiting on a human."

### `scheme_holding` — one row per scheme + held-security + as-of-date

```python
class SchemeHolding(Base):
    __tablename__ = "scheme_holdings"
    __table_args__ = (
        Index("ix_scheme_holdings_batch", "batch_id"),
        Index("ix_scheme_holdings_isin", "isin"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    batch_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("disclosure_batches.id"), nullable=False)
    instrument_name: Mapped[str] = mapped_column(String, nullable=False)  # verbatim from source
    isin: Mapped[str | None] = mapped_column(String, nullable=True)  # NULL for non-ISIN lines: cash, CBLO, TREPS, Net Receivables/Payables
    sector_raw: Mapped[str | None] = mapped_column(String, nullable=True)  # verbatim source string, never normalized at write time
    asset_type: Mapped[AssetType] = mapped_column(enum_column(AssetType), nullable=False)
    # EQUITY_DOMESTIC | EQUITY_INTERNATIONAL | DEBT | GOLD_SILVER | REIT_INVIT | CASH_EQUIVALENT
    quantity: Mapped[Decimal | None] = mapped_column(Numeric(20, 4), nullable=True)
    market_value: Mapped[Decimal] = mapped_column(Numeric(20, 2), nullable=False)  # always normalized to ₹ (not lakhs/crores) at write time
    pct_to_nav: Mapped[Decimal] = mapped_column(Numeric(6, 3), nullable=False)
```

**Added 2026-10-12, approved amendment (originally proposed in the attribute 02/06/10/
13/15 consumer spec's §7.1, needed so attributes 13 and 15 don't each have to re-derive
an asset-class split from `sector_raw` strings):** `asset_type` is stamped by the Parse
stage from each AMC's disclosure section headers — the SEBI-mandated format already
groups rows under headers like "Equity & Equity related," "Debt Instruments," "Money
Market Instruments," "Gold/Silver related," so this requires no new heuristic, just
reading the section header already being parsed to find each row. No AMC's disclosure
has been found that doesn't section its holdings this way across the entire spike.

Written by **delete-all-rows-for-`batch_id`-then-reinsert** on every (re)parse of that
batch — never a partial upsert (idempotent Write semantics, below).

`sector_raw` is deliberately raw, not normalized against a sector taxonomy at write time —
attribute 06's own aggregation step owns that normalization, so the ingestion layer
doesn't need a sector-matching concept at all, only the holdings layer does.

## Five-stage pipeline

Every AMC adapter implements the same five stages. Whether a given stage is **generic**
(driven entirely by a declarative config row) or **custom** (bespoke Python) is decided
per AMC, per stage — most of the 47 fetchable AMCs are generic in every stage; custom
code is reserved for genuinely non-formulaic behavior.

1. **Locate** — resolve this month's file URL(s) for a scheme or AMC bundle.
   - Accepts a target date parameter (not just "current month") so historical backfill
     and the routine retry both use the same code path.
   - Two sub-paths: **live discovery** (fetch the AMC's page, apply a regex/select-driven
     rule to find this month's URL — most AMCs) and **Wayback-based discovery** (query
     the CDX API for a WAF-blocked AMC's cached HTML, extract the filename, then fetch
     from a *different*, unprotected static-asset/CDN host than the one the filename was
     found on). Confirmed necessary for HDFC (`files.hdfcfund.com`) and now also for Kotak
     Mahindra (`vatseelabs-s3.kotakmf.com`) — resolved live 2026-10-12: a CDX query surfaced
     the real path, `/FAD/Portfolios/Consolidated-SEBI-Portfolio-as-on-{Month}-{DD},-{YYYY}/
     ConsolidatedSEBIPortfolio{Month}{YYYY}.xlsx` (not the originally-guessed
     `Monthly-Portfolio-as-on-...` name or path — the spike's filename guess was wrong on
     both the path prefix and the naming convention), confirmed with a live download and
     SEBI-schema verification. Worth a single shared helper (query CDX for a domain + date
     range → most recent capture's HTML), not re-derived per AMC.
   - A "separate unprotected CDN subdomain, distinct from the AMC's main WAF-protected
     site" is a named, recurring pattern (HDFC, Kotak, AlphaGrep, Union, Canara Robeco) —
     the Locate stage must support "find the filename on host A, fetch it from host B" as
     a first-class case, not treat every WAF 403 on the main domain as terminal.
2. **Fetch** — download the located URL(s). Should carry forward any headers/cookies/
   referer the Locate step needed (not yet observed as required by any of the 47, but
   cheap to design for given how many AMCs route through a CMS/CDN split).
3. **Parse** — extract rows from the downloaded file(s).
   - Must auto-detect file format: legacy `.xls` (BIFF/Composite Document Format, `xlrd`)
     vs. modern `.xlsx` (OOXML, `openpyxl`) — confirmed necessary (Aditya Birla Sun
     Life's zip is genuine BIFF; most others are OOXML). Never assume by extension alone;
     sniff the actual bytes.
   - Must assert the stated unit (e.g. "Market value (Rs. in Lakhs)" vs. a bare "Market
     Value") and normalize to ₹ at write time — fail loudly on an unrecognized unit
     string rather than silently misinterpreting a magnitude.
   - Always reprocesses a full multi-file bundle from scratch on retry — never resumes
     partial state. A bundle resolving to N schemes (one workbook/ZIP covering every
     scheme for an AMC — confirmed for Bank of India, Abakkus, Sundaram, Baroda BNP
     Paribas, ICICI Prudential's 151-file ZIP) is the normal case, not an edge case; the
     adapter design must not hardcode 1-file-per-scheme.
   - Per-file failures inside a bundle are captured individually in `parse_errors`
     (structured JSONB, `{"file": ..., "error": ...}`) — not a single pass/fail for the
     whole batch, and not free-text prose on the batch row.
4. **Normalize** — match each parsed scheme name to a `schemes.id`.
   - Reuses the established hybrid layered-matching pattern (exact-first, scoped fuzzy
     fallback, ambiguity guard, persisted confidence) per
     `feedback_matching_design_philosophy` and the existing `SchemeFundManager.match_method`
     / `match_confidence` precedent (`backend/app/models/reference.py:167-168`) — not a
     new one-off matcher built for this pipeline alone.
5. **Write** — upsert `disclosure_batch` to `WRITTEN`, delete+reinsert that batch's
   `scheme_holding` rows. Idempotent by construction: re-running Write for the same
   `batch_id` is always safe, since nothing partial is ever left behind to merge with.

## Adapter design: config-driven by default, custom code only where genuinely needed

Most of the fetchable AMCs need only a declarative row — a URL template (with
`{year}`/`{month}`/`{scheme_slug}` placeholders) plus a column-mapping dict (source header
→ `scheme_holding` field) — no bespoke Python. Custom adapter code is reserved for AMCs
whose Locate or Parse step is genuinely non-formulaic: multi-sheet/multi-scheme bundles
needing an index-sheet lookup (Canara Robeco, Baroda BNP Paribas), cascading-select-driven
discovery (Bajaj Finserv, Abakkus, Sundaram), or Wayback-based Locate (HDFC, Kotak
Mahindra).

### Adapter classification — all 57 AMCs

**Status (2026-10-12, sixth pass):** fully reconciled against the fifth pass's
`2026-10-12-amc-disclosure-reconciliation-fifth-pass.md` and two further live
re-verifications done in this pass (Kotak Mahindra, AlphaGrep) — this table previously
still reflected the original 2026-10-09 spike and had drifted out of sync with the
fifth pass's corrections to the spike-consolidated doc and the ingestion plan. Now
consistent across all three documents.

| Tier | Count | Locate | Parse | Notes |
|---|---|---|---|---|
| `STATIC_REGEX`, single scheme/URL pattern | 18 | generic (URL template) | generic (column map) | Nippon, DSP, Union Asset Management (`www.unionmf.com` static path, bypasses its own Angular SPA), Motilal Oswal, NJ, Franklin Templeton, PPFAS, Shriram, Helios, Angel One, Capitalmind, Old Bridge, Quantum, Samco, Groww, 360 ONE, AlphaGrep (`alphagrepmf.ai`, calendar-deterministic — re-verified live 2026-10-12, see "Open items"), Wealth Company |
| `STATIC_REGEX`, multi-scheme bundle | 2 | generic (URL template) | custom (index-sheet lookup) | Canara Robeco (plain WordPress `wp-content/uploads/`, per-scheme 2-letter code prefix), Baroda BNP Paribas (`/downloads/monthly-portfolio-scheme`, direct `.xls` links in static HTML) |
| `STATIC_REGEX`, Wayback-Locate | 2 | custom (CDX helper, then generic fetch from a second host) | generic | HDFC (`files.hdfcfund.com`); Kotak Mahindra (`vatseelabs-s3.kotakmf.com`) — resolved live 2026-10-12, see "Open items" |
| `JSON_API`, endpoint already found (ready to adapt, no further research) | 8 | custom (one scripted call per AMC, already documented) | generic (JSON field map) | SBI (`POST /ajaxcall/CMS/GetSchemePortfolioSheetsQS`), Bank of India (`AjaxService.asmx/GetDocuments`), Trust Mutual Fund (`POST /api/api/Trust/GetData`), Mirae Asset (`/downloads/portfolio` → `AjaxService/GetDownloadsData`), LIC (`/downloads/portfolio-filter-options` then `/downloads/portfolio-files`), Axis (`POST /cms/token` → `POST /cms/get-scheme-documents`), Aditya Birla Sun Life (`/postlogin/CustomApi/Resources/FactsheetAccordionById`, adapter rewrites the dead `abcscprod.azureedge.net` host in its `pdfUrl` response to the live `mutualfund.adityabirlacapital.com` domain), Taurus (Drupal exposed-filter AJAX, replayable as a plain GET — Half-Yearly cadence only, March/September, a `disclosure_batches`-grain note not a fetch problem) |
| `JSON_API`, research gap (no literal endpoint documented yet) | 15 | custom (needs a from-scratch network-trace pass per AMC before an adapter can be written) | generic (JSON field map) | PGIM India, Navi, Jio BlackRock, Bandhan, Unifi, Zerodha, Abakkus, quant Money Managers, Sundaram, Choice, UTI, Tata, Bajaj Finserv, ICICI Prudential (151-file ZIP via its media-center page), WhiteOak Capital (page confirmed live at `mf.whiteoakamc.com/regulatory-disclosures/scheme-portfolios`, same select/click shape as the other 14, just not yet driven to a download) |
| Standing manual-fetch | 6 | — | — | Edelweiss (Akamai, confirmed no bypass across 4 passes); Mahindra Manulife (encrypted payload directly confirmed opaque, real file UUID undiscoverable without decrypting it — explicitly not attempted, per standing constraint); Invesco, ITI (confirmed `BOT_BLOCKED` even against a real headless-Chromium browser — a genuine bot wall, not a missing-JS-execution problem); JM Financial (confirmed false positive — its "downloaded" file decodes to AES-ciphertext, an encrypted-API dead end, not a real workbook); HSBC (the sole AMC where a real browser passes its WAF but plain `curl` and every attempted JSON-API replay don't — rejected adding a standing Playwright/fingerprint-matching production dependency for one AMC, see the go/no-go decision in `decisions.md`, 2026-10-12) |
| Different-granularity ingest | 1 | generic | generic | Monarch (Networth) — ingest the fortnightly file as its real ceiling, not a gap |
| `NO_CONTENT_FOUND` — expected absence | 5 | n/a | n/a | ASK, IL&FS, Lakshya, Carnelian, Nuvama — no row that month is a normal state, not a failure |

Full per-AMC URL patterns, column headers, and verification evidence:
`2026-10-09-amc-portfolio-disclosure-spike-consolidated.md`'s master tier table (as
corrected by the fifth and sixth passes) and `2026-10-12-amc-disclosure-reconciliation-
fifth-pass.md`.

## Scheduling and orchestration

**Retry-until-found, daily, for N days after month-end** — not a per-AMC publishing-lag
config. Simpler, avoids config drift (lag already varies: most AMCs same-day, Kotak
~10 days), and the Locate stage already returns "not found yet" vs. "found" cleanly.
Reuses the existing EventBridge Scheduler → ECS Fargate `RunTask` pattern (ADR-006,
already live for NAV/TER/benchmark/account-deletion/analytics-recompute/CAS-expiry jobs)
— no new infrastructure.

**Alerting** — reuse the existing SNS ops-alerts topic (live per `decisions.md`,
2026-10-01) for "AMC X not found by day N" past a threshold, rather than building a new
notification path.

**`AWAITING_MANUAL_UPLOAD` batches** surface the same way attribute 04's factsheet manual
queue already does — no new UI concept, no separate table.

## Pressure-test log (what this design survived)

- **Mixed per-scheme disclosure cadence within one AMC** (Canara Robeco: monthly equity,
  fortnightly some debt) — would have broken an (AMC, month) grain. Fixed by re-keying
  `disclosure_batch` to (scheme, as_of_date). This was the one significant gap found;
  everything else below is a refinement, not a fix.
- **Multi-file bundle status tracking as free text** ("143/151 parsed, 8 failed") — too
  weak for debugging. Fixed: `parse_errors` as structured JSONB.
- **Bespoke Python per AMC as the default** — unnecessary cost for ~33 of 57 AMCs that
  are a pure URL-template + column-map. Fixed: config-driven adapters as the default,
  custom code only where Locate/Parse is genuinely non-formulaic.
- **Per-AMC publishing-lag configuration** for scheduling — adds config surface for no
  real benefit over a flat retry-until-found window. Rejected in favor of the simpler
  option.
- **A one-off scheme-name matcher for this pipeline** — rejected; reuses the hybrid
  layered-matching pattern and the `match_method`/`match_confidence` column precedent
  already established for `scheme_fund_managers` rather than inventing a new one.
- **Partial-state resume on multi-file bundle retry** — rejected as added complexity for
  no real benefit; bundles are small enough (max observed: ICICI Prudential's 151 files)
  that a full reprocess on retry is cheap and removes an entire class of partial-state
  bugs.

## Alternatives considered and rejected

- **A third table for file/job tracking**, separate from `disclosure_batch`. Rejected —
  `disclosure_batch`'s `status`/`source_url`/`raw_file_reference`/`parse_errors` columns
  already carry everything a separate table would, and `AWAITING_MANUAL_UPLOAD` already
  gives it double duty as the manual-upload queue state. No second table earns its cost.
- **Keying `disclosure_batch` by (AMC, month)**, the original framing before this
  pressure-test. Rejected — collides the first time one AMC's schemes disclose on
  different cadences (Canara Robeco, confirmed). (scheme, as_of_date) has no such case.
- **Normalizing `sector_raw` against a sector taxonomy at write time.** Rejected — pushes
  a matching/taxonomy concern into the ingestion layer that only attribute 06's
  aggregation actually needs; keeping it raw at write time keeps the Write stage dumb and
  idempotent.
- **Paid residential-proxy/CAPTCHA-solving for the 2 `BOT_BLOCKED`/encrypted-API
  manual-fetch AMCs.** Rejected (already decided in the consolidated investigation,
  carried forward here) — real recurring cost and operational complexity for only 2 of
  57 AMCs; manual fetch is the same precedent already used for attribute 04 factsheets.
- **Reverse-engineering the encrypted API** (Mahindra Manulife). Explicitly out of scope
  per standing constraint — manual fetch is the accepted cost instead.

## Open items carried into implementation planning

**None remaining as of 2026-10-12 (sixth pass) — full resolution below.**

- ~~Kotak Mahindra's Monthly file: re-check after ~2026-10-12~~ — **resolved.** Live-checked
  on the trigger date itself: a Wayback CDX query found the real path,
  `/FAD/Portfolios/Consolidated-SEBI-Portfolio-as-on-{Month}-{DD},-{YYYY}/
  ConsolidatedSEBIPortfolio{Month}{YYYY}.xlsx` on `vatseelabs-s3.kotakmf.com` — the
  original spike's filename guess (`Monthly-Portfolio-as-on-...`) had the wrong path
  prefix and the wrong naming convention, which is why it 403'd on 2026-10-09 even though
  the file was by then already live (crawled by Wayback on 2026-10-10). Confirmed via live
  download: real SEBI-schema data (ISIN, Industry, Quantity, Market Value, % to Net
  Assets). Folds into `STATIC_REGEX`, Wayback-Locate — see the classification table above.
- ~~WhiteOak Capital's adapter is unbuilt~~ — **not actually an open item**, just a
  correctly-scoped future task identical in shape to the other 14 `JSON_API`-research-gap
  AMCs (confirmed unchanged on re-check: `mf.whiteoakamc.com/regulatory-disclosures/
  scheme-portfolios` still returns `HTTP 200`, still JS-rendered, no blocker). One real gap
  found during this pass's audit: the ingestion plan's own JSON_API-tier accounting
  (22 AMCs after its fifth pass) never included WhiteOak — corrected there to 23.
- ~~The exact `DisclosureBatchStatus` enum values above are a first draft~~ — **confirmed,
  not a draft.** Cross-checked against the ingestion plan's actual implementation
  (`backend/app/models/enums.py` design in that plan's Task 1): it defines the identical
  6 states (`PENDING`, `FETCHED`, `PARSED`, `WRITTEN`, `FAILED`, `AWAITING_MANUAL_UPLOAD`),
  with `FETCHED`/`PARSED` kept distinct. No divergence to reconcile.
- **Found during this pass's audit, not previously flagged:** the spike-consolidated doc's
  master tier table still listed AlphaGrep as confirmed-live `STATIC_REGEX` from the
  original 2026-10-09 verification, while the ingestion plan's own fifth-pass note (same
  day as this pass) separately found that exact URL template returning a soft-404 shell and
  flagged it as needing fresh discovery — a live contradiction between two documents.
  Re-verified directly: the site is not broken: the previously-recorded URL template had a
  digit-format bug (`FY-{year}-{year+1}`, e.g. `FY-2026-2027`, when the real path uses a
  two-digit year range, `FY-{YY}-{YY+1}`, e.g. `FY-2026-27`). Confirmed via Wayback CDX and
  a live download with the corrected template — genuine SEBI-schema data. AlphaGrep stays
  `STATIC_REGEX`, no manual fetch needed; this was a one-digit-format bug, not a real break.
- **Also found during this pass's audit:** the spike-consolidated doc's master table had
  HSBC's tier *column* still reading `STATIC_REGEX` even after its own description text and
  the ingestion plan both correctly concluded HSBC needs standing manual fetch (the fifth
  pass's go/no-go decision) — a self-contradicting row, not a substantive disagreement.
  Corrected in the classification table above and cross-checked against
  `2026-10-12-amc-disclosure-reconciliation-fifth-pass.md` and `decisions.md`.
- This spec does not cover attributes 02/06/10/13/15's own compute logic (how
  `scheme_holding` rows become overlap/allocation/P-E numbers) — that's each attribute's
  own implementation plan (`2026-10-12-attributes-02-06-10-13-15-lookthrough-consumers-
  plan.md`), written against this spec's two tables as its data source.

## Source documents

- `Docs/analytics/2026-10-06-analytics-pdf-attribute-gap-analysis.md` — scope, §0/§2/§3
- `Docs/analytics/investigations/2026-10-09-amc-portfolio-disclosure-spike-consolidated.md`
  — the full 4-pass fetchability spike this spec's adapter table is grounded in
- `Docs/orchestration/amc-portfolio-disclosure-spike-handoff.md` — handoff narrative
- `backend/app/models/reference.py` — existing `schemes`/`scheme_fund_managers` schema
  conventions this design reuses (`match_method`/`match_confidence`, denormalized name
  columns, `enum_column` helper)
