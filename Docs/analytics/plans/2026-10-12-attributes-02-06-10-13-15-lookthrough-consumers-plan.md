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
elsewhere, not to be reintroduced here), and no new route (F9).

**Tech Stack:** Python/FastAPI/SQLAlchemy/Alembic (existing backend stack), reusing
`compute_holdings` plus one new `scheme_values` helper for fund weights (F8: `allocation.py`'s calculation is inline, not a reusable function).
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
`decisions.md`). **Tasks 0-7 below are written to be executed once the user gives an explicit go (2026-10-13: "I will tell you when to start execution").**

Task 0's checklist (below) is a plain build-order mechanic, not an open question: Tasks 1-6
compute aggregates over `scheme_holdings`, so they need that table to hold real rows before
there's anything to test against — the same reason you'd write the producer before the
consumer in any pipeline. It is not a pending decision, and not blocked on anything this plan
or its sibling specs still need to resolve. Run Task 0's checklist, and once it passes, start
Task 1 directly.

---

## Revision 2026-10-13 — shared rules, decisions applied, one new task

Added after the Q3–Q30 decisions and the plan-fix approvals (`decisions.md`, 2026-10-13;
artifacts in `Docs/analytics/artifacts/subproject2-execution/`). Where older wording below
conflicts with this block, this block wins. Nothing has been built.

**Start condition.** Execution starts only when the user gives an explicit go. Task 0 below is
a build-order check (a consumer needs real rows to be tested against), not a pending decision.

**Order.** `0 → 1 → 2 → 3 → 5 → 4 → 6 → 7`. Task 3 (attribute 02) goes before Task 5
(attribute 13) because Q27's outer ring reuses attribute 02's Large/Mid/Small classification
directly, so 13 cannot be built first. (The execution overview's earlier suggestion of 13
before 02 is corrected to match.) Task 4 (attribute 10) is independent of both. Runs are serial (the tasks share `reference.py`, `schemas.py`, `recompute.py` and the
Analytics views). Task 2 is committed in two parts, backend after its run and frontend after
the next, because the two are separate runs (confirmed 2026-10-13: this is the standing pattern for
any task that spans more than one run, with a gate and a commit per run); every other task is one commit. Attribute work
can start as soon as one AMC has a real `WRITTEN` batch; it does not wait for all 57.

**Shared rules for Tasks 2–6 (F7–F11, applied once here, not repeated in each task):**

1. *Signature (F7).* Every compute function is
   `async def compute_x(db: Session, household_member_ids: list[uuid.UUID])` on the app's
   **synchronous** SQLAlchemy `Session`, the shape `_SectionSpec.compute` is typed for. The
   spec's `AsyncSession` and `client_id` do not exist in this codebase (`grep AsyncSession
   app/services/analytics` returns nothing). `LookthroughTable` carries the member ids it was
   built for instead of `client_id`. `recompute_household_analytics` runs each section once
   for the combined scope and once per member, so a 4-member household builds the table 5
   times.
2. *Share the table within a run (F7).* The five sections of one scope must not each rebuild
   the table. `get_lookthrough_table(db, ids)` memoizes on `db.info["lookthrough"]` keyed by
   `tuple(sorted(ids))`. The `Session` is created per recompute run, so the cache lives
   exactly one run. A test proves two sections in one run build the table once. (This is a
   design choice of this revision; the existing per-process caches in `category_ranking.py`
   and `scorer.py` are the precedent.)
3. *Fund weights (F8).* There is no reusable weight function in `allocation.py`; its
   calculation is inline in `compute_category_allocation` (lines 36–63). The shared piece is
   `compute_holdings(db, household_member_ids)` in `services/dashboard/holdings.py`, whose
   rows are per folio with `current_value` as a string or `None`. Add one helper next to the
   new `lookthrough.py`: `scheme_values(holdings) -> (dict[UUID, Decimal], Decimal,
   list[UUID])` (value per scheme summed across folios, the total, and the schemes with no
   value, for the coverage notice). Do not refactor `allocation.py`.
4. *No new endpoint (F9).* `GET /analytics/{scope}` already returns every stored section; the
   section name is not validated on the server. For each attribute: add the schema classes
   (plus an `Aggregate…Response` wrapper for the combined scope) in
   `services/analytics/schemas.py`, add one `_SectionSpec(name, compute, wrap_combined)` to
   `_SECTIONS` in `recompute.py`, and nothing else on the backend.
5. *Frontend file list (F10).* Per attribute: a `<X>Section.tsx` and its test;
   `features/analytics/types.ts` (the name in `ANALYTICS_SECTION_NAMES` and the payload
   interface); `features/analytics/AnalyticsView.tsx` (an entry in `AGGREGATE_FIELD`, the
   unwrap call, the loading flag, the JSX); `mobile/features/analytics/MobileAnalyticsView.tsx`
   (it keeps its own copy of the field map and unwrap logic). Tests to run, per the repo's
   affected-tests rule: the new section's test, `AnalyticsView.test.tsx`,
   `MobileAnalyticsView.test.tsx`, `useAnalyticsScope.test.ts`, and on the backend
   `tests/services/analytics/test_recompute.py` plus the attribute's own test file. The PDF
   export is Task 7.
6. *Cadence (F6).* The consumer takes, per fund, the newest `WRITTEN` batch at or before the
   NAV date and tags its age; it never drops an old batch. A half-yearly fund's old batch is
   used and tagged "on its half-yearly cycle" (Task 2 has the test).
7. *Wording fixes (F11),* applied below: the gate paragraph, the sequencing note, and Task 1.

**Cross-cutting decisions applied:**

| Decision | Applied as |
|---|---|
| Q3, option C | No trigger code. Both data jobs run at 05:45 IST, before the 06:30 recompute, so a new disclosure shows the next morning. Revisit only if next-morning proves too slow, or once the daily stock feed makes same-day freshness wanted. |
| Q4, option B | `LOOKTHROUGH_MAX_ROWS = 100`: the stored table keeps the top 100 stocks per scope and says "shorter than your full portfolio". Check the cut against the first real `WRITTEN` batch at execution. |
| Q5, option C | Task 7. |
| Q6, option A | The engine plan's Task 0. Attribute 15 depends on its result for NSE, Yahoo and screener.in. |
| Q7, option B | The shared table computes one coverage figure by value; every section shows the banner; headline sentences hide below 50% (`HEADLINE_MIN_COVERAGE`). |

*Reading of Q7 (confirmed 2026-10-13):* the two reasons are derived from the engine registry. A scheme
with no `WRITTEN` batch is "not available from this AMC" when its AMC has no registry row
(the five no-content AMCs) or is a manual AMC that has never had a `WRITTEN` batch, and
"not published yet" otherwise.

---

## Task 0 — Gate: confirm real ingested data exists before building consumers

- [ ] Confirm at least one AMC's `disclosure_batches` row is `WRITTEN` with real
      `scheme_holdings` rows (from the ingestion plan's own build-out, not this plan).
- [ ] Confirm the engine plan's Task 0 result (sources reachable from AWS) is recorded; Task 6 depends on it for NSE, Yahoo and screener.in.
- [ ] If not yet true, stop here — do not build Tasks 1-7 against an empty table; there is
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

**Revised 2026-10-13 — this task now follows the shared rules above (signature, fund-weight
helper, no endpoint, frontend file list) and carries the Q4, Q7 and Q18 behaviour.**

- [ ] Red: `scheme_values()` helper (F8) — two folio rows of one scheme sum together; a row
      whose `current_value` is `None` is excluded and its scheme is reported; the total equals
      the sum of scheme values; a string `scheme_id` becomes a `uuid.UUID`.
- [ ] Red: `compute_lookthrough_table(db, household_member_ids)` test — 3 synthetic funds,
      synthetic `scheme_holdings` rows, assert the Reliance 8%/6%/5% → 6.55% worked example
      from the spec/PDF exactly (the naive-sum trap this whole engine exists to prevent).
- [ ] Red: `NULL`-ISIN rows (cash/CBLO/TREPS/Net Receivables) appear as distinct rows per
      originating fund, never merged across funds.
- [ ] Red: coverage by value (Q7) — a held scheme with no `WRITTEN` batch contributes to
      `total_portfolio_value` but zero stock rows; `coverage.covered_value_pct` is computed by
      value, not by fund count; the uncovered schemes are split into `not_published_yet` and
      `not_available_from_amc` using the registry rule in the Revision block; with covered
      value under `HEADLINE_MIN_COVERAGE` (0.50) the table sets `hide_headlines = True`.
- [ ] Red: age tags (Q18, F6) — a fund whose newest `WRITTEN` batch is more than 60 days
      before the computed-as-of date is tagged `older_than_60_days`; a Taurus-style half-yearly
      batch inside its own cycle is tagged `on_cycle` (the cadence comes from the registry
      entry's `cadence` field, engine Task 11) and is not called stale; the old batch is used,
      not dropped, and counts toward coverage.
- [ ] Red: storage cap (Q4) — a scope with 150 distinct stocks stores the top 100 by exposure
      (`LOOKTHROUGH_MAX_ROWS`), sets `truncated = True` and `total_stock_count = 150`; a scope
      with 40 stocks stores all 40 and `truncated = False`.
- [ ] Red: equity-only stock section (Q17) — `StockHoldingsSection`'s builder keeps only
      `EQUITY_DOMESTIC` and `EQUITY_INTERNATIONAL` rows; the one-line summary under the top 10
      states the combined debt/gold/cash/derivative share; the shared table itself stays
      unfiltered.
- [ ] Red: sharing (F7) — computing two sections for one scope in one `Session` runs the
      table query once (assert with a query counter or a spy on the builder).
- [ ] Green: `backend/app/services/analytics/lookthrough.py` — `scheme_values`,
      `LookthroughStockRow`, `LookthroughTable` (with `coverage`, `truncated`,
      `total_stock_count`, `hide_headlines`), `get_lookthrough_table` (the `db.info` memo),
      `compute_lookthrough_table`.
- [ ] Wire (F9): schema classes (`StockHoldingsSummary`, `AggregateStockHoldingsResponse`) in
      `schemas.py`; `_SectionSpec("stock_holdings", compute_stock_holdings, …)` appended to
      `_SECTIONS` in `recompute.py`. No route change.
- [ ] Run (backend): `cd backend && pytest tests/services/analytics/test_lookthrough.py tests/services/analytics/test_recompute.py -v`.
- [ ] Commit (backend part).
- [ ] Red/Green (frontend, F10): `CoverageBanner.tsx` (shared by all five sections: "Based on
      N% of your portfolio", the two reasons, and the "older than 60 days" / "on its
      half-yearly cycle" tags), `StockHoldingsSection.tsx` (top-10 stacked-by-fund view, "View
      all" searchable table with `sector_raw` as a column, the "shorter than your full
      portfolio" note when `truncated`, headline sentences hidden when `hide_headlines`),
      `types.ts`, `AnalyticsView.tsx`, `MobileAnalyticsView.tsx`, per spec §3 / visual-map §02.
- [ ] Run (frontend): `cd frontend && npx vitest run src/features/analytics/StockHoldingsSection.test.tsx src/features/analytics/CoverageBanner.test.tsx src/features/analytics/AnalyticsView.test.tsx src/mobile/features/analytics/MobileAnalyticsView.test.tsx src/features/analytics/useAnalyticsScope.test.ts`.
- [ ] Commit (frontend part).


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
**Revised 2026-10-13 (F12 — the plan went from the spike straight to the client with no model,
migration, job or schedule; and the spike's `pypdf` is not pinned, while `requirements.txt` has
`pypdfium2==5.12.1` for the CAS import).** The steps below add what was missing, then the
tests and UI as before.

- [ ] Prove PDF text extraction on the real file first: download
      `https://portal.amfiindia.com/spages/AverageMarketCapitalization30Jun2026.pdf` and extract
      its 5,427 data rows with `pypdfium2`. Only if that cannot reproduce the rank and
      category columns, pin `pypdf` (and run the CAS import tests afterwards, since the pin
      touches their dependency set). Record the outcome in the commit message.
- [ ] Red/Green: model and enum — `MarketCapBucket` (`LARGE`, `MID`, `SMALL`) in `enums.py`;
      `MarketCapClassification` in `reference.py` (`id`, `isin`, `rank`, `bucket`,
      `effective_date`, `source_period`, unique on `(isin, effective_date)`, index on `isin`),
      with no foreign keys.
- [ ] Red/Green: migration (the next sequential number — run `alembic heads` at build time;
      it is not `0039` by assumption) plus a `tests/test_migrations.py` test in the file's
      existing pattern, and the table name added to `test_alembic_upgrade_creates_all_tables`.
- [ ] Red/Green: `amfi_market_cap_client.py`, same frozen-`*RefreshResult` shape as
      `amfi_ter_client.py`, writing `market_cap_classifications (isin, rank, bucket,
      effective_date)`. `effective_date` is the day after the averaging period ends (Q20:
      the file for the six months ended 30 Jun 2026 gets 2026-07-01). First deploy loads the
      last 4 lists. A changed host or filename is a failure to alert on (a
      `PORTFOLIO_DISCLOSURE_ALERT`-style line), never a silent empty table.
- [ ] Red/Green: job script `scripts/jobs/refresh_market_cap_half_yearly.py` and a scheduler
      entry in `infra/modules/scheduler/main.tf`: `cron(45 5 1-15 1,7 ? *)` — daily at 05:45 IST for
      the first 15 days of January and July, skipping once the period's list is loaded (the
      same retry-until-found idea as the disclosure job; AMFI's publication date varies). `terraform fmt -check` and `terraform validate` only; nothing is
      applied (staging happens once, at the end).
- [ ] Red: the effective-dated join picks the classification row whose `effective_date <=
      holdings_as_of`, not `<= today` — a case where the two dates would pick different rows.
- [ ] Red: Q22 — the donut has one "Other / Unclassified" slice; its drill-down lists "Not
      equity (debt, cash, gold, REITs)" and "Equity not in AMFI list" separately, and the two
      sum to the slice. Q21 — there is no Nifty 500 comparison strip.
- [ ] Green: cap-allocation aggregation reading `LookthroughTable` + the classification table,
      with the "% of total portfolio" vs. "% of equity only" toggle (two different
      denominators — test both explicitly). Wire per shared rules 4 (schemas and a
      `_SectionSpec("cap_allocation", …)`).
- [ ] Run (backend): `cd backend && pytest tests/services/analytics/test_amfi_market_cap_client.py tests/services/analytics/test_cap_allocation.py tests/services/analytics/test_recompute.py tests/test_migrations.py -k "market_cap or cap_allocation or recompute or creates_all_tables" -v`.
- [ ] Red/Green: `CapAllocationSection.tsx` — donut + legend + mini bars, per spec §4 /
      visual-map §03, using `CoverageBanner`; plus the shared-rules-5 files.
- [ ] Run (frontend): the new section's test plus the three shared view tests from rule 5.
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

**Revised 2026-10-13 (F7, F9, F10 and Q23–Q25 as above).** Where the thresholds live (Q24):
the two numbers are constants in `overlap.py` (`OVERLAP_BAND_LOW = 20`,
`OVERLAP_BAND_HIGH = 40`) and the stored payload carries them (`bands: {low, high}`), so the
frontend reads them from the payload instead of keeping a second copy. (A backend and a
frontend cannot import one module, so this is how "one shared place" is met here.)

- [ ] Red: `compute_fund_pair_overlap()` test using the spec's own worked numbers (two funds,
      42% overlap across HDFC Bank/Reliance/ICICI Bank/Infosys/TCS + 11 others) — explicitly
      assert it reads raw per-scheme `pct_to_nav`, **not** `LookthroughTable.exposure_pct`
      (a regression test for the exact mistake the spec's §5 calls out as tempting but wrong).
- [ ] Red: equity-only (Q23) — a debt or cash line common to two funds adds nothing to their
      overlap; a derivative row adds nothing; the result is a share of each fund's net assets, so
      two funds that are each 70% equity cannot exceed 70%.
- [ ] Red: symmetry — `overlap(A, B) == overlap(B, A)`, computed once per unordered pair.
- [ ] Red: heatmap cap (Q25) — a household with 15 funds stores a 12-fund heatmap (the 12
      largest holdings by value, labelled "top 12 funds by value"), and a separate uncapped
      `pairs_above_low` list contains a high-overlap pair that involves a fund outside the 12.
- [ ] Green: `overlap.py`, returning the overlap %, the common-stock list, the bands, the
      12-fund matrix and `pairs_above_low` as one result (so a heatmap-cell tap-through needs
      no second query).
- [ ] Red/Green: the concentration-curve half, reading `LookthroughTable` directly (top-N stocks
      summed) — a genuinely separate code path from the heatmap half, per spec §5. Hidden when
      `hide_headlines` is set (Q7).
- [ ] Wire per shared rule 4: schemas, `_SectionSpec("overlap", …)`.
- [ ] Run (backend): `cd backend && pytest tests/services/analytics/test_overlap.py tests/services/analytics/test_recompute.py -v`.
- [ ] Red/Green: `OverlapSection.tsx` — heatmap + concentration-curve headline, per visual-map
      §04, with the "70%-equity fund caps at 70%" explanation and `CoverageBanner`; plus the
      shared-rules-5 files.
- [ ] Run (frontend): the new section's test plus the three shared view tests.
- [ ] Commit.

## Task 5 — Attribute 13: asset allocation (depends on Task 1 and on Task 3's classification)

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

**Revised 2026-10-13 (F13, F7, F9, F10 and Q26–Q27 as above).** The asset-class tests use the
final 8-value enum from the engine plan's Task 1; there is no OTHER backfill.

- [ ] Red: grouping `scheme_holdings` by `asset_type` per scheme, asserting the 3-fund worked
      example (95/0/0/5, 65/30/0/5, 0/0/100/0 → 76.5/9.0/10.0/4.5 client-level) from the
      spec/PDF exactly.
- [ ] Red: `NULL`-ISIN asset-class lines (CBLO/TREPS, Net Receivables) correctly sum into their
      bucket across funds — the opposite rule from attribute 06's same rows, called out
      explicitly in spec §6 so this isn't accidentally implemented the same way as 06.
- [ ] Red (F13): `DERIVATIVE` and `OTHER` rows are excluded from every class sum and are counted
      in the coverage note instead; an arbitrage-fund fixture with futures lines inside its
      equity section does not inflate the equity share.
- [ ] Red: the hedged-arbitrage toggle (Q26) acts on `schemes.sebi_category == "Arbitrage
      Fund"` only — on, that fund's whole holding moves to cash-like; off, it is as disclosed;
      an Equity Savings fund is unaffected either way.
- [ ] Red: the outer ring (Q27) splits only the equity ring into Large/Mid/Small/Other using
      attribute 02's classification (so Task 3 must be done); debt, gold and cash are single
      segments.
- [ ] Green: asset-allocation aggregation module; wire per shared rule 4
      (`_SectionSpec("asset_allocation", …)`).
- [ ] Run (backend): `cd backend && pytest tests/services/analytics/test_asset_allocation_lookthrough.py tests/services/analytics/test_recompute.py -v`.
- [ ] Red/Green: `AssetAllocationSection.tsx` — two-ring donut, equity-ring drill-down chaining
      into attribute 02 then 06 (shared drill-down path, not three separate ones), per spec §6
      / visual-map §05, with `CoverageBanner`; plus the shared-rules-5 files.
- [ ] Run (frontend): the new section's test plus the three shared view tests.
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
**Revised 2026-10-13 (F14, F15, F16, F7, F9, F10 and Q28–Q30 as above).**

Facts added by F15, checked 2026-10-13 from a development machine (Task 0 of the engine plan
repeats them from AWS): the Nifty 500 list is
`https://archives.nseindia.com/content/indices/ind_nifty500list.csv` (HTTP 200, 32,785 bytes)
and the Nifty 50 list is `https://www.niftyindices.com/IndexConstituent/ind_nifty50list.csv`
(HTTP 200, 3,344 bytes). Both have the columns `Company Name, Industry, Symbol, Series, ISIN
Code`. They carry no weights (Q21) but do carry NSE's industry label.

- [ ] Red/Green: model and migration for `stock_master` (F14) — `StockMaster` in
      `reference.py` with the spec's columns (`isin` primary key, `name`, `sector`, `pe_ratio`,
      `pb_ratio`, `as_of_date`, `source`) plus two additions (confirmed 2026-10-13): `pb_source`
      (`YAHOO` or `SCREENER`, because one `source` column cannot name both ratios' vendors; the
      P/E source is always NSE) and `footnote` (the delisted/merged, loss-making or no-P/B
      reason), no foreign keys; the
      migration takes the next sequential number at build time (not assumed to be `0040`),
      with its `tests/test_migrations.py` test and the table name in
      `test_alembic_upgrade_creates_all_tables`.
- [ ] Red/Green: ISIN-universe query — the union of (a) every distinct non-`NULL` ISIN currently
      in `scheme_holdings` and (b) the Nifty 50 + Nifty 500 constituent ISINs (from the two
      files above, with a few-row fixture committed for the test), de-duplicated, re-derived
      every refresh (per spec §7.3) — test asserts a client-held ISIN outside the Nifty 500
      and a Nifty 500 ISIN no client holds are *both* included.
- [ ] Red/Green: `stock_fundamentals_client.py`'s symbol-resolution fallback chain (spec §7.3),
      one test per branch: (a) ISIN resolves via NSE security master → NSE CSV `SYMBOL P/E`
      for `pe_ratio` (Q28: not `ADJUSTED P/E`) + Yahoo `quoteSummary` for `pb_ratio`, both
      `source` tagged correctly; (b) ISIN absent from NSE's current security master
      (delisted/merged, e.g. a pre-2023 HDFC Ltd ISIN) → both ratios `NULL` with a
      "delisted/merged" footnote, no BSE fallback attempted; (c) ISIN resolves but Yahoo
      404s/omits `priceToBook` → screener.in fallback for that ISIN only, `source = SCREENER`;
      (d) both Yahoo and screener.in fail → `pb_ratio NULL` + footnote, same mechanism as the
      loss-making-stock exclusion below, not a new one. A failed fetch never overwrites a
      good existing row.
- [ ] Red/Green: one cookie+crumb handshake reused across the whole run, with a mid-run
      re-handshake if a request starts 401-ing again (crumb went stale) — test simulates a
      stale-crumb response partway through a multi-stock batch and asserts one re-handshake,
      not a full-run abort, and that one bad ISIN doesn't fail the rest of the batch.
- [ ] Red/Green: `stock_master` refresh succeeds end-to-end with zero `disclosure_batches`
      activity that day — proves the pipeline independence claim in spec §7.3 rather than
      assuming it.
- [ ] Red/Green: job script `scripts/jobs/refresh_stock_fundamentals_daily.py` (one
      `StockFundamentalsRefreshResult` dataclass, same shape as `amfi_ter_client.py`) and a
      scheduler entry (F14) at **05:45 IST daily** with `memory = "2048"`, ahead of the 06:30
      recompute (Q3). Planning figure, not a measurement: at about 0.3 s per request, 3,000
      stocks take about 15 minutes. `terraform fmt -check` and `terraform validate` only.
- [ ] Red: harmonic-mean formula test using the spec's worked example (25.0x / 3.35x vs.
      Nifty 50's 22.8x / 3.10x), including the re-scale-to-100%-equity step and the
      loss-making-stock exclusion-with-footnote behavior, exercising both P/E and P/B with
      real fetched data.
- [ ] Red: Q29 — the result carries both a Nifty 50 and a Nifty 500 comparison (two rows per
      bar, same endpoint).
- [ ] Red: Q30 — when stocks with a ratio cover less than 70% of equity exposure by value
      (`VALUATION_MIN_COVERAGE = Decimal("0.70")`, a named constant), the result is "not
      enough data" plus the list of missing holdings and why (delisted/merged, BSE-only, no
      Yahoo P/B, loss-making excluded from P/E); at or above 70% it publishes the ratio.
      Also hidden when the shared `hide_headlines` is set (Q7).
- [ ] Green: `valuation.py` aggregation module; wire per shared rule 4
      (`_SectionSpec("valuation", …)`).
- [ ] Red (F16, replacing the four-trigger tests, because Q3 was answered C): one test that
      the scheduler's `stock_fundamentals_daily` and `portfolio_disclosures_daily` entries both
      run before `analytics_recompute_daily` (parse `infra/modules/scheduler/main.tf`, compare
      the cron times). No event hook is built.
- [ ] Run (backend): `cd backend && pytest tests/services/analytics/test_stock_fundamentals_client.py tests/services/analytics/test_valuation.py tests/services/analytics/test_recompute.py tests/test_migrations.py -k "stock or valuation or recompute or creates_all_tables" -v`.
- [ ] Red/Green: `ValuationSection.tsx` — two horizontal bar comparisons (portfolio vs Nifty 50
      and Nifty 500) + plain-language delta + the source line under the chart (Q28: P/E from
      NSE, P/B from Yahoo), per spec §7 / visual-map §06, with `CoverageBanner`; plus the
      shared-rules-5 files.
- [ ] Run (frontend): the new section's test plus the three shared view tests.
- [ ] Commit.

## Task 7 — PDF export: the five new sections, plus `investment_withdrawal` (new, Q5 option C)

**Decided 2026-10-13 (Q5).** The PDF is built in the browser: `AnalyticsView.handleDownloadPdf`
assembles an `AnalyticsExportPayload` from the loaded sections and POSTs it to
`/analytics/export/pdf`; the backend stores it under a single-use token and a headless browser
renders `PrintAnalyticsView` from it (`pdf_export.py`), waiting up to 15 seconds for
`data-print-ready`. There is no backend schema for the payload. Sub-project 1's
`investment_withdrawal` section was never added, so the export already omits one live
section; this task closes that gap in the same edit. Attribute print views follow the
`FundManagerSection` precedent (`printMode`, optional payload field).

**Files:**
- Modify: `frontend/src/features/analytics/types.ts` (`AnalyticsExportPayload` gains six optional fields: `stockHoldings`, `capAllocation`, `overlap`, `assetAllocation`, `valuation`, `investmentWithdrawal`)
- Modify: `frontend/src/features/analytics/AnalyticsView.tsx` (the payload built in `handleDownloadPdf`)
- Modify: `frontend/src/features/analytics/print/PrintAnalyticsView.tsx` and `print.css`
- Modify: each new section component and `InvestmentWithdrawalSection.tsx` to honour `printMode` (charts at fixed size, no scroll areas, "View all" tables collapsed to the stored top rows)
- Test: `frontend/src/features/analytics/print/PrintAnalyticsView.test.tsx`, `AnalyticsView.test.tsx`

- [ ] Red: with all six new payload fields present, `PrintAnalyticsView` renders six more
      `.print-section` blocks in a stated order (after Allocation: asset allocation, cap
      allocation, stock holdings, overlap, valuation; `investment_withdrawal` after the fund
      manager block), and `data-print-ready` is still set.
- [ ] Red: an export saved without these fields (older payload, as the existing optional
      fields allow) renders exactly as before — no new block, no crash.
- [ ] Red: `handleDownloadPdf` includes each new section's loaded result in the payload, and a
      section that failed or is still loading is omitted rather than blocking the button's other
      sections (the button waits on `allSectionsLoaded`; a test that a failed new section does
      not block the others).
- [ ] Green: implement; print CSS gives each large block `break-inside: avoid` and the heatmap
      and donuts a fixed width.
- [ ] Check (not a test): the 15-second print wait with every section present on a large
      household, using the synthetic harness (MF@123); if the export times out, report it
      rather than raising the timeout.
- [ ] Run: `cd frontend && npx vitest run src/features/analytics/print/PrintAnalyticsView.test.tsx src/features/analytics/AnalyticsView.test.tsx`.
- [ ] Commit.

---

## Sequencing note

Task 2 is the foundation (the shared table, the helper, the coverage banner); 3 (02), 4 (10) and
5 (13) add one aggregation each, with one dependency: Task 5's outer ring reads Task 3's
classification, so 3 comes before 5 (4 is independent of both). Task 6 (15) depends on the
engine plan's Task 0 (sources reachable from AWS) and on the Q28 column decision recorded
above (`SYMBOL P/E`, not `ADJUSTED P/E`), not on an open spike: the spike items above are
done. Task 7 (PDF) comes last because it prints all five. The engine's later tasks (11–15)
and the AMC onboarding they carry run alongside this plan; nothing here waits for all 57
AMCs, only for the first real `WRITTEN` batch (Task 0).
