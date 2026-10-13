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
revision, and the feasibility/integration/ToS work closed out above. That constraint is
gone: Ayush has explicitly asked for this plan (plus the sibling engine/ingestion plan) to
be handed to an intern to execute, and every research/design question this plan depended on
is closed (ToS sourcing call, AMFI verification, integration architecture — see
`decisions.md`). **Tasks 0-6 below are cleared to start, no further sign-off needed.**

Task 0's checklist (below) is a plain build-order mechanic, not an open question: Tasks 1-6
compute aggregates over `scheme_holdings`, so they need that table to hold real rows before
there's anything to test against — the same reason you'd write the producer before the
consumer in any pipeline. It is not a pending decision, and not blocked on anything this plan
or its sibling specs still need to resolve. Run Task 0's checklist, and once it passes, start
Task 1 directly.

---

## Task 0 — Gate: confirm real ingested data exists before building consumers

- [ ] Confirm at least one AMC's `disclosure_batches` row is `WRITTEN` with real
      `scheme_holdings` rows (from the ingestion plan's own build-out, not this plan).
- [ ] If not yet true, stop here — do not build Tasks 1-6 against an empty table; there is
      nothing to TDD a real aggregation against beyond trivial empty-input cases, and the
      amendment in Task 1 needs real section-header data to verify against.

## Task 1 — `scheme_holdings.asset_type` — verification step only (revised 2026-10-13)

**Revised 2026-10-13 (resolves engine.html Q8/Q13 — see the ingestion plan's Task 1 "Decided
2026-10-13" note and `decisions.md`):** this task is no longer a second migration. The
ingestion plan's own Task 1 now creates `scheme_holdings.asset_type` with the full 8-value
`AssetType` enum (`DERIVATIVE`/`OTHER` included) from the start, and Task 2 stamps it via
section-aware parsing — there is nothing left for this task to build. It survives only as a
gate check that this task's two assumptions actually held once the engine is built.

- [x] Get explicit user sign-off on the amendment to the already-written 2026-10-09 engine
      spec (new `AssetType` enum column on `scheme_holdings`, populated by the Parse stage from
      disclosure section headers) — approved 2026-10-12 and written into the engine spec's
      `SchemeHolding` model, per the spec's own §7.1 note.
- [ ] Verify (no new migration, no new code): `scheme_holdings.asset_type` exists and is
      `NOT NULL` on the 8-value enum, not the 6-value one — read the ingestion plan's applied
      migration, don't re-derive it.
- [ ] Verify: at least one real `WRITTEN` batch (Task 0's gate) has a `DERIVATIVE` or `OTHER`
      row if the source AMC's sheet contains one, confirming Parse's section-aware stamping
      ran on real data, not just the ingestion plan's synthetic fixtures.
- [ ] Commit only if either check above required a fix; otherwise this task closes with no diff.

## Task 2 — Shared `lookthrough.py` service + Attribute 06 (build together — 06 has no logic beyond reading the shared table)

**Decided 2026-10-13 (resolves a06 Q17 — does the stock table show only stocks? — see
`decisions.md`):** option A. `StockHoldingsSection` filters the shared `LookthroughTable` to
`asset_type in (EQUITY_DOMESTIC, EQUITY_INTERNATIONAL)` only; the shared table itself stays
unfiltered (every other consumer attribute reads the full set). A one-line summary under the
top-10 states the combined debt/gold/cash/derivative share, linking to attribute 13 for detail
— matches both the "overall stock holdings" heading and the PDF's worked example.

**Decided 2026-10-13 (resolves a06 Q18 — how old can a fund's holdings be before we say so? —
see `decisions.md`):** option C, with one refinement. A fund's holdings are tagged "older than
60 days" (not dropped, not excluded from the count) in the coverage notice and the drill-down
when its newest `WRITTEN` batch's `as_of_date` is more than 60 days before the computed-as-of
date — 60, not the artifact's own inconsistent "50"/"60" wording, chosen because it covers two
full monthly cycles plus the ~10-day publication lag the issue text itself names, so a normally-
late AMC isn't flagged every month. The refinement: an AMC on an accepted non-monthly cadence
(Taurus/Monarch Networth, per the ingestion plan's Task 5 registry notes) is never tagged
"older than 60 days" for being on-cadence — it is tagged "on `<cadence>` cycle" instead, so a
genuinely-current Half-Yearly disclosure doesn't read as stale data every single month.

**Decided 2026-10-13 (resolves a06 Q19 — is a sector breakdown part of this release? — see
`decisions.md`):** option A. No sector chart or normalisation table this release;
`sector_raw` shows as a column in "View all" exactly as the spec already says, and the gap is
recorded in `DEFERRED_FEATURES.md`. Not deferred for lack of a free source — option C's two
sources (NSE's Nifty 500 Industry column, already live-verified for Q21/a02; Yahoo's
`assetProfile`) are real and free — deferred because a label-normalisation table is a second,
separable piece of work this release doesn't need to carry. The `DEFERRED_FEATURES.md` entry
must name both sources so a future session doesn't re-run the same spike.

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

**Decided 2026-10-13 (resolves a02 Q20 — which AMFI list applies to a holding, and how far
back do we load? — see `decisions.md`). Live-verified, not assumed:** option A. AMFI's
semi-annual list is effective the day *after* its averaging period ends, confirmed against
the real-world pattern of the SEBI 2017 circular's operation — the Jul-Dec average becomes
effective 1 Jan, the Jan-Jun average becomes effective 1 Jul (funds then get a separate
~30-day window to actually rebalance, which is about portfolio composition, not about which
classification list Unifolio should look up — the lookup itself uses the day-after-period-end
date). So the file named for "the six months ended 30 Jun 2026" gets `effective_date =
2026-07-01`. Load the last 4 lists (two years) at first deploy, per option A's other half.

**Decided 2026-10-13 (resolves a02 Q21 — the Nifty 500 comparison strip needs data nobody
has sourced — see `decisions.md`). Checked, not just deferred:** option A — drop the strip
this release, spec already marks it optional. Checked today whether a free weight-based
alternative exists before deferring: NSE's factsheet (`ind_nifty_500.pdf`) publishes only
top-10 holdings and sector weights, not a full 500-constituent weight file; no free,
machine-readable per-constituent weight CSV was found on `nseindia.com` or
`niftyindices.com` (both host the unweighted constituent list already used elsewhere in this
plan). A count-based strip (option B) remains available later without new sourcing if the
weight-based version never turns up free — record both facts in `DEFERRED_FEATURES.md` so
a future session doesn't re-run this spike.

**Decided 2026-10-13 (resolves a02 Q22 — what goes in "Other / Unclassified"? — see
`decisions.md`):** option C. The donut keeps one "Other / Unclassified" slice exactly as
drawn in the PDF and visual map; the drill-down splits it into "Not equity (debt, cash,
gold, REITs)" and "Equity not in AMFI list" so the two meanings are never conflated, without
changing the headline chart's shape.

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

**Decided 2026-10-13 (resolves a10 Q23 — overlap across all common instruments, or stocks
only? — see `decisions.md`):** option A, consistent with a06 Q17's equity-only treatment of
the same shared table. `compute_fund_pair_overlap` filters to `asset_type in
(EQUITY_DOMESTIC, EQUITY_INTERNATIONAL)` before taking the per-ISIN minimum; the result is a
share of each fund's net assets (so a 70%-equity fund caps out at 70% overlap with anything),
and the UI states that explicitly rather than implying 100% is reachable.

**Decided 2026-10-13 (resolves a10 Q24 — where do the overlap bands live? — see
`decisions.md`):** option C. The 20%/40% thresholds are constants in one shared module
(backend and frontend each import from it, not two copies), not a config table — two numbers
don't earn Sub-project 1's `ranking_weights`-style table yet. Move to a table only on
explicit request to change the values.

**Decided 2026-10-13 (resolves a10 Q25 — how many funds before the heatmap becomes
unreadable? — see `decisions.md`):** option C. The compute step itself caps the heatmap at
the 12 largest holdings by value per scope (bounding both the UI grid and the stored JSON
payload — same mechanism overview.html's Q4 storage-scope question depends on), labelled
"top 12 funds by value," plus an uncapped "pairs above 20%" list underneath so a high-overlap
pair involving a smaller holding is never silently dropped.

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

**Decided 2026-10-13 (resolves a13 Q26 — how is the hedged-arbitrage "cash-like" toggle
built? — see `decisions.md`):** option A. The toggle acts on `schemes.sebi_category ==
"Arbitrage Fund"` — a field that already exists, no new ingestion — moving that fund's
entire holding to cash-like when switched on. Option C (extend the same treatment to Equity
Savings funds' hedged portion) is correctly left for later: it needs a rule nobody has
written yet (how much of an Equity Savings fund's equity is actually hedged isn't derivable
from today's disclosure fields), so building it now would mean inventing a heuristic, not
applying one. Record the gap in `DEFERRED_FEATURES.md`.

**Decided 2026-10-13 (resolves a13 Q27 — what is the outer ring of the donut for debt, gold
and cash? — see `decisions.md`):** option A. Only the equity ring gets an outer level
(Large/Mid/Small/Other, reusing attribute 02's classification directly); debt, gold and cash
each stay one undivided segment. Option B (debt by credit-rating bucket) needs a
`credit_rating` field Parse doesn't capture today — flagged in `DEFERRED_FEATURES.md` as
cheaper than it looks (the rating string, e.g. "AAA"/"SOV", is already present in most AMCs'
raw sheets, often inside the instrument name or an adjacent column Parse already walks past
section-aware since Q8/Q13's decision) but still a second piece of parsing work this release
doesn't need to carry.

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

**Decided 2026-10-13 (resolves a15 Q28 — which P/E, and are P/E and P/B comparable? — see
`decisions.md`). The untested comparison the artifact flagged is now reasoned through, not
left open:** option A — P/E from NSE's `SYMBOL P/E` column, P/B from Yahoo, with the source
line shown under the chart. Researched which NSE per-stock column actually matches the
index-level methodology before picking: NSE's own per-stock `ADJUSTED P/E` specifically
excludes exceptional items (one-off gains/losses) from earnings; `SYMBOL P/E` uses the raw
reported trailing-4-quarter net profit. NSE Indices' published Nifty 50 index P/E is an
aggregate of constituent market cap over aggregate constituent trailing earnings — a raw
aggregation, with no per-stock exceptional-item adjustment folded in. `SYMBOL P/E` is
therefore the methodologically consistent column for a portfolio-level aggregate meant to
sit next to that index figure; `ADJUSTED P/E` would silently mix two different earnings
definitions into one "comparison." P/B still comes from a different vendor than P/E (Yahoo),
so the two ratios still answer slightly different questions — recorded as the source-line
caveat per option A, not hidden.

**Decided 2026-10-13 (resolves a15 Q29 — compare against Nifty 50 only, or Nifty 500 too? —
see `decisions.md`):** option B. Both indices are drawn as two rows on each bar — same
endpoint, same request shape, the fetch universe already includes both lists per the
feasibility spike above, so there's no new sourcing cost to showing the closer Nifty 500
comparison alongside the spec's original Nifty 50.

**Decided 2026-10-13 (resolves a15 Q30 — how much of the equity must have data before we
show P/E and P/B? — see `decisions.md`):** option B. The ratio shows only once at least 70%
of equity exposure (by value) has it; below that, the section shows "not enough data" and
lists which holdings are missing it (delisted/merged, BSE-only, no Yahoo P/B, loss-making
excluded from P/E), rather than publishing a number built from under a third of the
portfolio. 70% is a chosen threshold, not a measured one — it is a named constant, not
buried in logic, so it can be revisited without a code change.

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
