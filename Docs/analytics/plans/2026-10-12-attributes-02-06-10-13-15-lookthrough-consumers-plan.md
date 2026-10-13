# Attributes 02 / 06 / 10 / 13 / 15 — Look-Through Consumers — Implementation Plan

**For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development`
(recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use
checkbox (`- [ ]`) syntax for progress tracking. Each task is a full TDD red → green → commit
cycle; no task is marked done without its own passing test.

**Goal:** build the compute + UI layer for the 5 attributes that read from the look-through
engine (`disclosure_batches`/`scheme_holdings`, per the 2026-10-09 engine spec), in dependency
order — the shared table and its headline consumer (06) first, since every other attribute is
additional aggregation on top of exactly that table, not a new data path.

**Architecture:** one shared service (`lookthrough.py`, `compute_lookthrough_table`) consumed
by 02/06/13/15 and half of 10; `overlap.py` for 10's fund-pair half, reading raw
`scheme_holdings` directly (fund-level %, not client-level — see spec §5 for why these must
not share a code path). Each attribute gets its own thin aggregation module + frontend
section, following the existing `allocation.py`/`AllocationSection.tsx` shape. Precompute via
the existing async Fargate recompute-cache pattern (`GET /analytics/{scope}`) — no new caching
scheme, no synchronous per-request computation (the BUG-001 mistake, already fixed once
elsewhere, not to be reintroduced here).

**Tech Stack:** Python/FastAPI/SQLAlchemy/Alembic (existing backend stack), reusing
`allocation.py`'s existing scheme-value/fund-weight calculation rather than re-deriving it.
React/TypeScript frontend, new stacked Analytics sections sibling to `AllocationSection.tsx`/
`TerSection.tsx`, following `tokens.css`/DM Sans/Manrope conventions.

**Spec:** `Docs/analytics/2026-10-12-attributes-02-06-10-13-15-lookthrough-consumers-spec.md`
**Visual map:** `Docs/analytics/artifacts/2026-10-12-attributes-02-06-10-13-15-lookthrough-
consumers-visual-map.html`
**Depends on:** `Docs/analytics/2026-10-09-sub-project-2-lookthrough-engine-spec.md`'s
ingestion pipeline (`Docs/analytics/plans/2026-10-10-sub-project-2-lookthrough-ingestion-
plan.md`) being built and populating `scheme_holdings` with real data — **this plan cannot
start in earnest until that one has at least one AMC's real `WRITTEN` batches to test
against**; Task 0 below is explicitly gated on that.

**Implementation gate — lifted 2026-10-13.** This plan was written under a standing
research/docs-only constraint ("this is not an implementation session... no kind of
implementation will be done here"), which held through all of this plan's own writing,
revision, and the feasibility/integration/ToS work closed out above. Ayush has now
explicitly asked for this plan (plus the sibling engine/ingestion plan) to be handed to an
intern to execute — this is that explicit go-ahead. **Tasks 0-6 below are cleared to start.**
The one dependency that still gates Task 0 itself is unchanged: real `WRITTEN`
`disclosure_batches` rows from the ingestion plan's own build-out (see "Depends on" above) —
confirm that first, per Task 0's own checklist.

---

## Task 0 — Gate: confirm real ingested data exists before building consumers

- [ ] Confirm at least one AMC's `disclosure_batches` row is `WRITTEN` with real
      `scheme_holdings` rows (from the ingestion plan's own build-out, not this plan).
- [ ] If not yet true, stop here — do not build Tasks 1-6 against an empty table; there is
      nothing to TDD a real aggregation against beyond trivial empty-input cases, and the
      amendment in Task 1 needs real section-header data to verify against.

## Task 1 — `scheme_holdings.asset_type` amendment (spec §7.1) — approved 2026-10-12

- [x] Get explicit user sign-off on the amendment to the already-written 2026-10-09 engine
      spec (new `AssetType` enum column on `scheme_holdings`, populated by the Parse stage from
      disclosure section headers) — approved 2026-10-12 and written into the engine spec's
      `SchemeHolding` model, per the spec's own §7.1 note. Implementation (the migration below)
      remains out of scope until a dedicated implementation session starts, per this plan's
      standing "no implementation yet" constraint.
- [ ] Red: a migration test asserting `scheme_holdings.asset_type` exists with the 6 enum
      values (`EQUITY_DOMESTIC`, `EQUITY_INTERNATIONAL`, `DEBT`, `GOLD_SILVER`, `REIT_INVIT`,
      `CASH_EQUIVALENT`), run against SQLite per `tests/test_migrations.py`'s existing pattern.
- [ ] Green: write the Alembic migration (next sequential number) adding the column, backfill
      existing rows as `OTHER`/`NULL`-safe default if any pre-amendment rows exist.
- [ ] Red/Green: extend the ingestion plan's Parse-stage tests (wherever they live) to assert
      `asset_type` is stamped correctly from each AMC's section headers for at least the 2-3
      AMCs already built in the ingestion plan at that point.
- [ ] Commit.

## Task 2 — Shared `lookthrough.py` service + Attribute 06 (build together — 06 has no logic beyond reading the shared table)

- [ ] Red: `compute_lookthrough_table()` test — 3 synthetic funds, synthetic `scheme_holdings`
      rows, assert the Reliance 8%/6%/5% → 6.55% worked example from the spec/PDF exactly
      (the naive-sum trap this whole engine exists to prevent).
- [ ] Red: a second test asserting `NULL`-ISIN rows (cash/CBLO/TREPS/Net Receivables) appear
      as distinct rows per originating fund, never merged across funds.
- [ ] Red: a coverage-caveat test — a held scheme with no `WRITTEN` batch contributes to
      `total_portfolio_value` but zero stock rows.
- [ ] Green: implement `lookthrough.py`'s `LookthroughStockRow`/`LookthroughTable`/
      `compute_lookthrough_table`, reusing `allocation.py`'s existing scheme-value calculation
      for fund weight — do not re-derive it.
- [ ] Red/Green: `StockHoldingsSection.tsx` + its backend endpoint — top-10 stacked-by-fund
      view, "View all" searchable table, coverage-caveat banner, per spec §3 / visual-map §02.
- [ ] Wire into the existing precompute-cache pattern, recompute trigger = any held scheme's
      `disclosure_batches` reaching `WRITTEN`.
- [ ] Commit.

## Task 3 — Attribute 02: AMFI market-cap ingestion + Cap Allocation

- [x] **Feasibility spike — done 2026-10-13, deepened to 110%-confidence same day.**
      Live-verified AMFI's half-yearly market-cap list: current period
      (`https://portal.amfiindia.com/spages/AverageMarketCapitalization30Jun2026.pdf`, HTTP
      200, confirmed real PDF content — `Sr. No./Company name/ISIN/BSE Symbol/.../
      Categorization as per SEBI Circular dated Oct 6, 2017` columns, row order already *is*
      the AMFI rank, `Categorization` column is already `Large Cap`/`Mid Cap`/`Small Cap`,
      exactly the 4 fields `market_cap_classifications` needs). **Not stopped at HTTP-200 +
      plausible columns** — the full 48-page PDF was parsed (5,427 data rows, the entire
      listed-companies universe, not just top-500) and every row's `(rank, category)` pair
      regex-extracted: exactly 3 category-transition points found, at rank 1 (→`Large Cap`),
      101 (→`Mid Cap`), 251 (→`Small Cap`) — an exact match to the SEBI circular's own
      Large=1-100/Mid=101-250/Small=251+ definition, structurally confirming the row order is
      genuinely AMFI's rank and the category column is genuinely correct. `robots.txt` checked
      on both `www.amfiindia.com` (disallows only `/admin/`/`/login/`/`/search/`, none
      relevant) and `portal.amfiindia.com` (404, no restriction). **Caveat found and
      disclosed, not hidden:** AMFI's own terms-of-use page states site use is for "personal
      and non-commercial use only" — flagged honestly, treated the same as the project's
      already-live, already-accepted practice of using AMFI data elsewhere in production
      (`amfi_ter_client.py`/`amfi_aaum_client.py`), so this doesn't block the build. A
      2025-period file at the older host/name
      (`https://www.amfiindia.com/Themes/Theme1/downloads/
      AverageMarketCapitalizationoflistedcompaniesduringthesixmonthsended30Jun2023.pdf`-style)
      also live-verified. **Drift caveat:** the host/filename convention has already drifted
      twice across prior periods (a verbose spaced name on
      `www.amfiindia.com/Themes/Theme1/downloads/` through ~2020-2025, now a shorter name on
      `portal.amfiindia.com/spages/` for the current 2026 period) — same drift risk already
      documented elsewhere in this sub-project for AMC disclosure URLs (e.g. the ingestion
      plan's Old Bridge/AlphaGrep entries). `amfi_market_cap_client.py` should treat the URL
      as needing the same twice-yearly manual re-verification as any `STATIC_REGEX` AMC entry,
      not a hardcoded-forever constant.
- [ ] Red/Green: `amfi_market_cap_client.py`, same frozen-`*RefreshResult` shape as
      `amfi_ter_client.py`, writing `market_cap_classifications (isin, rank, bucket,
      effective_date)`.
- [ ] Red: a test asserting the effective-dated join picks the classification row whose
      `effective_date <= holdings_as_of`, not `<= today` — construct a case where the two
      dates would pick different rows if implemented wrong.
- [ ] Green: cap-allocation aggregation reading `LookthroughTable` + the classification table,
      with the "% of total portfolio" vs. "% of equity only" toggle (two different
      denominators — test both explicitly).
- [ ] Red/Green: `CapAllocationSection.tsx` — donut + legend + mini bars, per spec §4 /
      visual-map §03.
- [ ] Commit.

## Task 4 — Attribute 10: fund-pair overlap + concentration curve

- [ ] Red: `compute_fund_pair_overlap()` test using the spec's own worked numbers (two funds,
      42% overlap across HDFC Bank/Reliance/ICICI Bank/Infosys/TCS + 11 others) — explicitly
      assert it reads raw per-scheme `pct_to_nav`, **not** `LookthroughTable.exposure_pct`
      (a regression test for the exact mistake the spec's §5 calls out as tempting but wrong).
- [ ] Red: symmetry test — `overlap(A, B) == overlap(B, A)`, computed once per unordered pair.
- [ ] Green: `overlap.py`, returning both the overlap % and the common-stock list as one
      result (so the heatmap-cell tap-through needs no second query).
- [ ] Red/Green: the concentration-curve half, reading `LookthroughTable` directly (top-N
      stocks summed) — a genuinely separate code path from the heatmap half, per spec §5.
- [ ] Red/Green: `OverlapSection.tsx` — heatmap + concentration-curve headline, per visual-map
      §04.
- [ ] Commit.

## Task 5 — Attribute 13: asset allocation (depends on Task 1's amendment)

- [ ] Red: a test grouping `scheme_holdings` by `asset_type` per scheme, asserting the
      3-fund worked example (95/0/0/5, 65/30/0/5, 0/0/100/0 → 76.5/9.0/10.0/4.5 client-level)
      from the spec/PDF exactly.
- [ ] Red: assert `NULL`-ISIN asset-class lines (CBLO/TREPS, Net Receivables) correctly sum
      into their bucket across funds — the opposite rule from attribute 06's same rows, called
      out explicitly in spec §6 so this isn't accidentally implemented the same way as 06.
- [ ] Green: asset-allocation aggregation module.
- [ ] Red/Green: `AssetAllocationSection.tsx` — two-ring donut, equity-ring drill-down chaining
      into attribute 02 then 06 (shared drill-down path, not three separate ones), per spec §6
      / visual-map §05.
- [ ] Commit.

## Task 6 — Attribute 15: stock fundamentals ingestion + P/E, P/B (both in full scope, integration fully speced)

- [x] **Feasibility spike — done 2026-10-13, revised same day.** Live-verified per spec §7.2 and
      `Docs/analytics/investigations/2026-10-13-attribute-15-pe-pb-sourcing-feasibility.md`:
      index-level P/E/P/B (niftyindices.com `BackPage`), per-stock P/E
      (`nsearchives.nseindia.com/content/equities/peDetail/PE_<DDMMYY>.csv`), the
      symbol→ISIN mapping needed to join it (`content/cm/NSE_CM_security_<DDMMYYYY>.csv.gz`,
      `SctySrs == "EQ"` rows), **and per-stock P/B** (Yahoo Finance's unofficial `quoteSummary`
      API via a cookie+crumb handshake, cross-validated against screener.in's server-rendered
      pages) are all free, live, real sources. **Nothing is deferred.**
- [x] **ToS-sourcing-preference — finalized 2026-10-13, no longer open.** NSE's own data for
      everything it covers (P/E, symbol→ISIN mapping, both index-level figures). For P/B: Yahoo
      is the live runtime primary source; screener.in is a per-ISIN fallback only (not fetched
      in parallel for every stock); both failing → `NULL` + disclosed footnote. See
      `decisions.md`'s 2026-10-06 entry's same-day addendum and spec §7.2.
- [x] **Integration architecture — speced 2026-10-13, see spec §7.3.** `stock_master` is a
      second, independent daily reference-data pipeline (`stock_fundamentals_client.py`, same
      `*RefreshResult` family as `amfi_ter_client.py`), not a stage of the AMC disclosure
      engine — the two never block each other; `valuation.py` is the only place they meet,
      joining `LookthroughTable` and `stock_master` by ISIN at read time.
- [ ] Red/Green: ISIN-universe query — the union of (a) every distinct non-`NULL` ISIN
      currently in `scheme_holdings` and (b) the Nifty 50 + Nifty 500 constituent ISINs,
      de-duplicated, re-derived every refresh (per spec §7.3) — test asserts a client-held ISIN
      outside the Nifty 500 and a Nifty 500 ISIN no client holds are *both* included.
- [ ] Red/Green: `stock_fundamentals_client.py`'s symbol-resolution fallback chain (spec §7.3),
      one test per branch: (a) ISIN resolves via NSE security master → NSE CSV for `pe_ratio` +
      Yahoo `quoteSummary` for `pb_ratio`, both `source` tagged correctly; (b) ISIN absent from
      NSE's current security master (delisted/merged, e.g. a pre-2023 HDFC Ltd ISIN) → both
      ratios `NULL` with a "delisted/merged" footnote, no BSE fallback attempted; (c) ISIN
      resolves but Yahoo 404s/omits `priceToBook` → screener.in fallback for that ISIN only,
      `source = SCREENER`; (d) both Yahoo and screener.in fail → `pb_ratio NULL` + footnote,
      same mechanism as the loss-making-stock exclusion below, not a new one.
- [ ] Red/Green: one cookie+crumb handshake reused across the whole run, with a mid-run
      re-handshake if a request starts 401-ing again (crumb went stale) — test simulates a
      stale-crumb response partway through a multi-stock batch and asserts one re-handshake,
      not a full-run abort, and that one bad ISIN doesn't fail the rest of the batch.
- [ ] Red/Green: `stock_master` refresh succeeds end-to-end with zero `disclosure_batches`
      activity that day — proves the pipeline independence claim in spec §7.3 rather than
      assuming it.
- [ ] Red: harmonic-mean formula test using the spec's worked example (25.0x / 3.35x vs.
      Nifty 50's 22.8x / 3.10x), including the re-scale-to-100%-equity step and the
      loss-making-stock exclusion-with-footnote behavior, exercising both P/E and P/B with real
      fetched data — no placeholder/null P/B path needed, both ratios are populated the same
      way.
- [ ] Green: `valuation.py` aggregation module.
- [ ] Red: cache-invalidation test — a `disclosure_batches` row reaching `WRITTEN` with no new
      `stock_master` data, and a fresher `stock_master.as_of_date` with no new disclosure, each
      *independently* invalidate attribute 15's cached result (spec §7.3 — this is a second,
      separate trigger from the other four attributes' single disclosure-driven one).
- [ ] Red/Green: `ValuationSection.tsx` — two horizontal bar comparisons + plain-language
      delta, per spec §7 / visual-map §06.
- [ ] Commit.

---

## Sequencing note

Tasks 2-6 are listed in the spec's own dependency order (06 is the foundation; 02/10/13/15
each add one further aggregation or one further ingestion on top of it), but 02, 10, and 13 are
mutually independent of each other once Task 2 lands — they can be reordered or parallelized
across sessions without changing any other task's design. Task 6 is the only one with an
upstream spike gating it and should not block the other four.
