# Sub-project 2 — Look-Through Engine Architecture Spec

**Date:** 2026-10-09
**Status:** Design reached agreement with Ayush in-session, pressure-tested from multiple
angles (see "Pressure-test log" below), written directly per his explicit instruction —
no further approval gate needed before writing this document. Per
`feedback_subproject_planning_deliverable`, still needs its matching HTML artifact and a
sign-off before `writing-plans`.
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

The spike (4 passes) answered the only open question blocking this design: **is the data
actually reachable?** Final count: **47/57 AMCs machine-fetchable today, 2/57 need a
standing manual-fetch process (Edelweiss, Mahindra Manulife), 1 (Kotak) very likely to
join the 47 within days, 1 (WhiteOak) needs its adapter built during build-out, 1
(Monarch) ingests at its genuine fortnightly ceiling, 5 are an expected no-content state.**
Every AMC has an explicit, justified plan — this spec is what that plan becomes.

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
for the 2 (soon 1, once Kotak's Monthly file is live) AMCs needing a human-dropped file —
same precedent as attribute 04's factsheet manual-upload path. No separate table for
"things waiting on a human."

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
    quantity: Mapped[Decimal | None] = mapped_column(Numeric(20, 4), nullable=True)
    market_value: Mapped[Decimal] = mapped_column(Numeric(20, 2), nullable=False)  # always normalized to ₹ (not lakhs/crores) at write time
    pct_to_nav: Mapped[Decimal] = mapped_column(Numeric(6, 3), nullable=False)
```

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
     found on). Confirmed necessary for HDFC (`files.hdfcfund.com`) and generalizes to
     Kotak (`vatseelabs-s3.kotakmf.com`) once its Monthly file publishes. Worth a single
     shared helper (query CDX for a domain + date range → most recent capture's HTML),
     not re-derived per AMC.
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

Most of the 47 fetchable AMCs need only a declarative row — a URL template (with
`{year}`/`{month}`/`{scheme_slug}` placeholders) plus a column-mapping dict (source header
→ `scheme_holding` field) — no bespoke Python. Custom adapter code is reserved for AMCs
whose Locate or Parse step is genuinely non-formulaic: multi-sheet/multi-scheme bundles
needing an index-sheet lookup (Bank of India, Abakkus, Sundaram, ICICI Prudential),
cascading-select-driven discovery (Bajaj Finserv, Abakkus, Sundaram), or Wayback-based
Locate (HDFC, and Kotak once live).

### Adapter classification — all 57 AMCs

| Tier | Count | Locate | Parse | Notes |
|---|---|---|---|---|
| `STATIC_REGEX`, single scheme/URL pattern | 29 | generic (URL template) | generic (column map) | Nippon, DSP, SBI, Motilal Oswal, Mirae, NJ, Franklin Templeton, Invesco, PPFAS, Shriram, Helios, Capitalmind, LIC, Old Bridge, Quantum, Samco, Axis, ITI, Trust, HSBC, Groww, 360 ONE, Taurus, Angel One, Wealth Company, JM Financial, Aditya Birla Sun Life (custom Parse: BIFF via `xlrd`), AlphaGrep (`alphagrepmf.ai`, fully calendar-deterministic), Union Asset Management (`www.unionmf.com` static path, bypasses its own Angular SPA) |
| `STATIC_REGEX`, multi-scheme bundle | 4 | generic (URL template) | custom (index-sheet lookup) | Bank of India, Baroda BNP Paribas, ICICI Prudential (151-file ZIP), Canara Robeco (plain WordPress `wp-content/uploads/`, per-scheme 2-letter code prefix) |
| `STATIC_REGEX`, Wayback-Locate | 1 (soon 2) | custom (CDX helper, then generic fetch from a second host) | generic | HDFC (`files.hdfcfund.com`); Kotak Mahindra joins once its Monthly file publishes (~2026-10-12 re-check) via `vatseelabs-s3.kotakmf.com` |
| `JSON_API`, direct REST/XHR | 10 | custom (one scripted call per AMC) | generic (JSON field map) | PGIM India, Navi, Jio BlackRock, Bandhan, ICICI Prudential's media-center ZIP path, Zerodha, Unifi |
| `JSON_API`, cascading select | 4 | custom (Playwright select-driven) | generic | Bajaj Finserv, Abakkus, Sundaram, quant Money Managers |
| `JSON_API`, standard select+fetch | remainder of 14 | generic (select template) | generic | Choice, UTI, Tata |
| `BOT_BLOCKED` — manual fetch | 1 | — | — | Edelweiss: Akamai, confirmed no bypass across 4 passes |
| `BOT_BLOCKED` — pending CDN confirmation | 1 | will become generic `STATIC_REGEX` | generic | Kotak Mahindra — see above |
| `NEEDS_INVESTIGATION`, encrypted API — manual fetch | 1 | — | — | Mahindra Manulife: encrypted payload directly confirmed opaque, real file UUID undiscoverable without decrypting it (explicitly not attempted, per standing constraint) |
| `NEEDS_INVESTIGATION`, adapter not yet built | 1 | custom (select/click, same shape as the other `JSON_API` AMCs) | generic | WhiteOak Capital — page works (`mf.whiteoakamc.com`), just not yet driven to a download |
| Different-granularity ingest | 1 | generic | generic | Monarch (Networth) — ingest the fortnightly file as its real ceiling, not a gap |
| `NO_CONTENT_FOUND` — expected absence | 5 | n/a | n/a | ASK, IL&FS, Lakshya, Carnelian, Nuvama — no row that month is a normal state, not a failure |

Full per-AMC URL patterns, column headers, and verification evidence:
`2026-10-09-amc-portfolio-disclosure-spike-consolidated.md`'s master tier table and
"Fourth pass" section.

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

- Kotak Mahindra's Monthly file: re-check after ~2026-10-12; if live, it's a plain
  `STATIC_REGEX` config row, no adapter code — if still absent, decide then whether to
  fold it into the 2-AMC manual-fetch set or wait longer.
- WhiteOak Capital's adapter (select/click-driven, same shape as 14 other `JSON_API`
  AMCs) is unbuilt; not a design question, just sequencing during implementation.
- The exact `DisclosureBatchStatus` enum values above are a first draft — confirm against
  whatever the implementation plan's actual state machine needs (e.g. whether `FETCHED`
  and `PARSED` need to be distinct states or collapse into one).
- This spec does not cover attributes 02/06/10/13/15's own compute logic (how
  `scheme_holding` rows become overlap/allocation/P-E numbers) — that's each attribute's
  own implementation plan, written against this spec's two tables as its data source.

## Source documents

- `Docs/analytics/2026-10-06-analytics-pdf-attribute-gap-analysis.md` — scope, §0/§2/§3
- `Docs/analytics/investigations/2026-10-09-amc-portfolio-disclosure-spike-consolidated.md`
  — the full 4-pass fetchability spike this spec's adapter table is grounded in
- `Docs/orchestration/amc-portfolio-disclosure-spike-handoff.md` — handoff narrative
- `backend/app/models/reference.py` — existing `schemes`/`scheme_fund_managers` schema
  conventions this design reuses (`match_method`/`match_confidence`, denormalized name
  columns, `enum_column` helper)
