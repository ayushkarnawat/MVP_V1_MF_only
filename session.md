# Session state — 2026-10-13

Working notes for picking this project back up cold. Not a planning doc — see
`Docs/superpowers/plans/` for those. This file tracks *where things stand*,
gets overwritten each session, and isn't meant to accumulate history — the
permanent, append-only record is `log.md` (session-by-session),
`backend.md`/`database.md` (backend/schema changes only), and `decisions.md`.
Earlier "Latest" sections (2026-09-30 staging QA fixes, 2026-09-24 PAN-at-upload, the
2026-09-15..24 backfill, the 2026-09-07..12 condensed sessions) were dropped from here on
2026-10-01; their full detail lives in `log.md`.

**Read this file, then `CLAUDE.md`'s Session State section, before re-deriving
anything by re-reading the whole repo.**

## ⚠ FIRST — Priority 1 open item (deadline 10 Nov 2026, 06:00 IST)

**Fund-manager factsheet access gaps (attribute 04).** When asked "what's left / what do I need to do", lead with this.
- 10 fund houses need a monthly hand import (ICICI, Kotak, HDFC ×2 files, Axis, Bandhan, Invesco, WhiteOak, ITI, JM, Trust; 689 live funds); 5 have no factsheet (Bajaj, AlphaGrep, IL&FS, Lakshya, Monarch; 33 funds).
- Must be settled before the first automatic run on **10 Nov 2026**: (1) first staging import + record alerts; (2) decide on any fund house AWS blocks; (3) build a missed-month alert; (4) admin upload screen instead of the CLI; (5) test HDFC's passive file; (6) decide the long-term fix (ask AMCs for access / vendor data quote); (7) confirm the ops-alerts email subscriptions; (8) the monthly routine itself.
- Detail and the ordered to-do table: `DEFERRED_FEATURES.md` (top section). Background and options: `Docs/orchestration/subproject1-execution/a04-factsheet-access-gaps.html` (https://claude.ai/artifact/STCA9eNZwWZ4ZYYGzmpkTL).

## Latest (2026-10-22): Scorer V2 planning PAUSED, at Ayush's request

Too many open judgment calls stacking up at once alongside other priorities. All four
Scorer V2 planning docs moved into one dedicated folder, `Docs/Scorer-V2/` (was scattered
across `Docs/` and `Docs/orchestration/`); repo-wide cross-references updated to the new
paths. Items 1-7 and 9 of the open-questions annex are resolved; item 8 (peer-set
widening) stopped one sub-question short of done (Sectoral/Thematic reclassifier —
Ayush already said build it, still open whether it fixes the shared `canonical_category()`
used by 4 other live features, or is scoped to Scorer V2 only); Section B/C of the annex
and tasks #10-12 (frontend, data architecture, `jugaad-data`) not started at all.
**Before resuming:** read `Docs/Scorer-V2/00-RESUME-HERE.md` first — it has the exact
stopping point and the live decisions already made, so the next session doesn't re-derive
any of it. One side-finding, not scorer-specific, logged separately: `DEFERRED_FEATURES.md`'s
"Added 2026-10-22 (category-alias data bug)" — affects the live V1 scorer too, independent
of whether/when Scorer V2 resumes.

## Latest (2026-10-20, analytics UX fixes): built and committed, not deployed

All six phases of `Docs/superpowers/plans/2026-10-19-analytics-ux-fixes-plan.md` are built, reviewed (Codex plus Opus on the risky runs) and committed on `feat/leapswitch-staging`, one commit per task; pushed to `origin/feat/leapswitch-staging` on 2026-10-20 together with the merge of PR #8 (the Chandra fix), so the next deploy carries both. **Next:** (1) the user's browser checks (tier badges light/dark, allocation toggle, scenario dates, Investment & Withdrawal toggle and bar tap, History hover/click/keyboard/phone first-and-second tap/family filter, print has no toggle); (2) run the PostgreSQL roundtrip test for migrations 0042/0043; (3) deploy via `Docs/orchestration/2026-10-20-leapswitch-staging-deploy-guide-analytics-and-chandra.md` (this one guide covers the analytics work AND the Chandra fix; it replaces the Chandra-only guide) (scenario duplicate cleanup is a separate user-confirmed step; `compute_all_scenarios.py` after 0042); (4) re-measure the History month-detail click time on staging PostgreSQL (limit 1 s; stored per-month rows if over); (5) decide the score-methodology document vs code disagreement (explainer follows the code). Detail: `log.md` and `backend.md` 2026-10-20, the plan's execution notes, `Docs/orchestration/ux-fixes-handoff.md`.

## Latest (2026-10-20, later): Chandra Tripathi fix BUILT — PR #8 open into `feat/leapswitch-staging`, awaiting manager review/merge

**Built** on branch `fix/chandra-opening-cost-xirr-disclaimer` (worktree `..\MVP_V1_MF_only-chandra`): Root Cause A (`opening_balance.py`), Root Cause B backend (`dashboard/xirr.py` + schemas/endpoints) and the frontend popup (desktop + mobile), all in one PR. Two independent reviews and the manager's PR review each found real bugs, all fixed test-first; the deviations from the plans are listed in "Implementation record" at the end of the Root Cause B plan. Backend filtered regression 964 passed / 5 skipped; frontend typecheck clean, suite green.
**Real-file gate run 2026-10-20 on the real `chandra.pdf`:** both root causes confirmed (invested gap 1,082,539.38 -> 0.91, 2 funds over tolerance -> 0; disclaimer fires for both members: 186.2% -> -6.6% and 127.5% -> -7.4%); identical to the synthetic reproduction.
**Still open:** (1) the harness's -5.59% drift check prints NOT PASS because the August statement is stale: refresh that baseline as its own follow-up (no clean PASS transcript exists until then); (2) merge only when the user says so; (3) known, not fixed: shared `Modal` has no focus management, the mobile info icon is 14px, a fully-sold opening lot builds no disclaimer.

### Earlier the same day (superseded by the above): pre-execution review of the plans

**Context:** two documentation-only plans exist — Root Cause A (opening-cost plausibility
guard, `backend/app/services/import_/opening_balance.py`) and Root Cause B (XIRR
opening-balance-dating disclaimer, `backend/app/services/dashboard/xirr.py`). Both were
previously declared fully planned and signed off; `a15f07c` (2026-10-19) updated Root Cause
B's plan/HTML to drop the old `opening_cost_share >= 25%` trigger floor after a 27-scenario
empirical grid run against the real `portfolio_xirr()` code found it silently missed cases
where a 10–24% opening-lineage cost share still swings a blended XIRR 2–8x past its true
rate — the new trigger compares `alt_rate` (XIRR with the undated opening lineage excluded)
directly against the same 35% sanity ceiling, no share floor. Ship-immediately (no staged
rollout) was also locked in for the frontend disclaimer popup per Ayush's explicit override,
since Unifolio has no real users yet and the DB is routinely wiped.

**What happened next:** the intern's own Claude Code session, reviewing both plans before
executing them, surfaced three questions this session had NOT flagged as open:
1. Whether `test_real_check.py` (the real-CAS acceptance gate, run against the real
   `Docs/CAS Files/chandra.pdf`) needs re-running after implementation as a named acceptance
   step — it wasn't written into either plan as an explicit task.
2. A real correctness gap in Root Cause B: `_opening_lineage()`'s FIFO lot replay runs on
   `transaction_rows`, which is filtered to `_FUND_RELEVANT_TYPES` for a different purpose
   (building XIRR cash flows) — that filter excludes `DIVIDEND_REINVEST`/`BONUS`/
   `SEGREGATION`, all genuine `LOT_ADDING_TYPES` in `lot_rules.py`. Since `REVERSAL` consumes
   newest-lot-first (not oldest-first like every other consuming type), a missing newer lot
   could make the lineage tracer misattribute units/cost to the opening lot. Confirmed real
   via direct code reading, not hypothetical.
3. Root Cause A's plan doc has two genuine test-count arithmetic errors: "14/14 (10+1 flip)"
   doesn't sum (should be 11), and "15/15 (11+1+3)" omits Task 4's fourth new test despite
   the same sentence claiming Tasks 2–4 are all applied (should be 16/16 if Task 4 ships).

Asked directly whether both plans were "110% solid" with no open questions as previously
claimed — the honest answer was no. Two of the three (the lineage gap, the arithmetic
errors) were real misses in this session's own work, not natural implementer questions; the
third (no named re-verification step) was a real omission from the acceptance criteria.

**Second-order catch, same pattern, one level down:** this session's own proposed one-line
fix for the lineage gap (widen the DB query's type filter to include the three missing
types) was itself under-audited — it didn't account for `current_transactions` having no
independent type filter of its own (it silently relies on the SQL query already being
narrow). Widening the query naively would have let those three types flow into
`current_transactions` and corrupt `current_holdings_xirr` for any household with such a
row. The intern's Claude session caught this during its own implementation-prep pass, not
this session. Agreed fix: add `_LINEAGE_QUERY_TYPES = _FUND_RELEVANT_TYPES | {DIVIDEND_REINVEST, BONUS, SEGREGATION}`
for the query only; explicitly re-filter `transactions` and `current_transactions` back down
to `_FUND_RELEVANT_TYPES` in Python; only `_opening_lineage_by_scheme` sees the unfiltered
rows; add tests proving `current_holdings_xirr` is unchanged by a bonus/reinvest row, and
that a `REVERSAL` after one attributes to the correct lot.

**Status — still documentation only, by design:** per the standing rule that Root Cause A
and B's actual code fixes land together only once both are fully signed off, **this session
made no edits to either plan doc or to `opening_balance.py`/`xirr.py`.** The three fixes
above (lineage-query widening + re-filter, A's count corrections, the named real-file-gate
task) were handed to the intern's own Claude Code session as the detail to apply to the plan
docs and then execute — a separate checkout, not this one. Full detail of the exchange
(exact code, exact reasoning): this session's transcript; nothing new was written to
`Docs/superpowers/plans/` from this side.

**What this does and doesn't fix, for the actual Chandra Tripathi household:** Root Cause A
should make the portfolio's total value/cost basis correct again (the opening-lot cost
plausibility guard). Root Cause B does **not** make the headline lifetime XIRR number
numerically "correct" — the true purchase dates behind an old opening balance are
fundamentally unknowable from a CAS statement — it makes a probably-distorted number visibly
flagged via a disclaimer instead of silently wrong. The real-file gate
(`test_real_check.py` against `chandra.pdf`) is the step that will actually confirm both
land correctly on the real data; it hasn't been re-run since either plan changed.

**Lesson logged to memory** ([[feedback_planning_closing_audit_discipline]]): validating a
plan's headline design decision rigorously (the 27-scenario grid) is not the same as the
plan being solid — every variable a new code block reuses or widens needs its own
downstream-consumer audit, repeated for every subsequent patch to that code, not just the
original block.

## Previous (2026-10-13): Sub-project 2 sixth-pass audit closed + attribute 15's P/E/P/B fully resolved (110% — nothing deferred, revised same day) + full attribute-coverage audit closed + integration architecture speced + AMFI re-verified to 110% + ToS call finalized

**Context:** a zero-open-items audit pass over the entire look-through ingestion system
(continuing straight from the 2026-10-12 session below), followed by the two items that
session had explicitly left open. **Still no implementation — research/docs only,** confirmed
via `git log`/`find` as before.

- **Full-system audit (four-document reconciliation): done.** Three real corrections found and
  fixed, not just re-confirmed: (1) **Kotak Mahindra** resolved from `BOT_BLOCKED` to
  `STATIC_REGEX` — a Wayback CDX query against its CDN found the real current portfolio-disclosure
  path; (2) **AlphaGrep** — not actually broken, a false alarm from an earlier pass; the real URL
  template just uses a 2-digit year-range format (`FY-{YY}-{YY+1}`) instead of the 4-digit one
  this project's own docs had recorded; (3) **HSBC's row** in the spike-consolidated doc had a
  self-contradictory tier label (said `STATIC_REGEX` while its own description said
  `Standing manual-fetch`) — corrected to match its actual, already-decided status. Final AMC
  count, now internally consistent across the engine spec and the spike-consolidated doc: 44
  machine-fetchable + 1 (WhiteOak) research-gap + 6 standing-manual-fetch + 1 different-grain
  (Monarch) + 5 expected-no-content = 57. Detail:
  `Docs/analytics/investigations/2026-10-09-amc-portfolio-disclosure-spike-consolidated.md`'s new
  "Sixth pass" section; `Docs/analytics/plans/2026-10-10-sub-project-2-lookthrough-ingestion-plan.md`
  updated to match.
- **`asset_type` amendment sign-off: resolved.** Ayush approved it (see `decisions.md`); the
  column is written into the engine spec's `SchemeHolding` model. The "needs sign-off" framing
  removed from the consumer spec (§7.1, §9) and plan (Task 1) — both now read "approved
  2026-10-12," not "pending."
- **Attribute 15's P/E/P/B data source: fully resolved, nothing deferred.** Full write-up:
  `Docs/analytics/investigations/2026-10-13-attribute-15-pe-pb-sourcing-feasibility.md`.
  - Confirmed first (per the format-survey doc) that `scheme_holdings`' SEBI-mandated fields
    cannot derive P/E/P/B themselves — no EPS/book-value/price field exists in that format.
  - **Index-level P/E, P/B, Div Yield (Nifty 50/500 benchmark): ✅ free, live-verified** —
    `niftyindices.com/BackPage/getpepbHistoricaldataDBtoString`, same endpoint family already
    used by `nse_indices_client.py`.
  - **Per-stock P/E: ✅ free, live-verified** — NSE's daily
    `nsearchives.nseindia.com/content/equities/peDetail/PE_<DDMMYY>.csv` report.
  - **Symbol→ISIN mapping (needed to join that file against `scheme_holdings`): ✅ free,
    live-verified** — NSE's own security master,
    `content/cm/NSE_CM_security_<DDMMYYYY>.csv.gz`, `SctySrs == "EQ"` rows; spot-checked against
    RELIANCE and THERMAX's real, known ISINs.
  - **Per-stock P/B: ✅ resolved, revised same day.** A first pass wrongly called this a
    confirmed dead end after checking only NSE (full daily-reports catalog has no P/B report,
    sibling file-path guesses `pbDetail/`/`pbrDetail/` 404) and BSE (bot-blocked SPA). Ayush
    pushed back — nothing should move to "deferred" until 110% sure, and named three untried
    sources. All three were live-checked: **Yahoo Finance's unofficial `quoteSummary` API**
    (cookie+crumb handshake against `fc.yahoo.com`→`finance.yahoo.com`→
    `query2.finance.yahoo.com/v1/test/getcrumb`→`query2.finance.yahoo.com/v10/finance/
    quoteSummary/<SYM>.NS`) returns both `trailingPE` and `priceToBook`/`bookValue` in one call,
    HTTP 200, no rate-limiting across 14-15 sequential requests. **screener.in**'s
    `/company/<SYMBOL>/consolidated/` pages are plain server-rendered HTML with `Stock P/E` and
    `Book Value` fields, cross-validating Yahoo's RELIANCE figures to the rupee (P/B 1.74 both
    ways). **Google Finance** was checked and correctly ruled out (its old API is dead; its live
    quote page has a P/E field but no book-value field anywhere — confirmed via direct string
    search, not assumed).
  - **Nothing deferred. No product decision needed on scope.** The only remaining item is a
    non-blocking ToS-sourcing-preference call for Ayush — which free source to prefer for P/B
    (NSE has none either way, so this doesn't change *whether* attribute 15 is buildable, only
    *which* vendor's page gets scraped). The consumer spec (§7.2) and plan (Task 6) are updated
    to drop all "defer"/"P/E-only" framing.
- **Full sub-project 2 attribute-coverage audit (the second half of Ayush's 2026-10-13
  instruction): closed, zero open items remain.** All 5 consumer attributes (02/06/10/13/15)
  confirmed to have dedicated sections in the spec, plan, and visual-map — contrary to Ayush's
  stated belief that this work hadn't been done. A full-text scan (not just headings) of the
  consumer spec/plan/visual-map found exactly one genuine gap: the visual-map's open item 4,
  AMFI's semi-annual market-cap list exact URL/format (attribute 02's classification source).
  **Live-verified and resolved:** current period at `portal.amfiindia.com/spages/
  AverageMarketCapitalization30Jun2026.pdf` (HTTP 200, real PDF — ISIN, AMFI rank by row order,
  `Large/Mid/Small Cap` column, exactly what `market_cap_classifications` needs). Flagged, not
  silently assumed stable: the host/filename convention has drifted twice historically (older
  periods on `www.amfiindia.com/Themes/Theme1/downloads/...` with a longer name) — documented as
  needing the same twice-yearly re-verification as any `STATIC_REGEX` AMC entry, not a
  hardcoded-forever URL. Spec §4, plan Task 3, and visual-map item 4 all updated. The engine-level
  ingestion plan's own "Open items carried forward" section was checked and left as-is — those
  are already individually justified, named technical gaps (research-gap AMCs, confirmed
  bot-blocks), not unexplored "TBD" items, so nothing there needed fixing.
- **Both halves of Ayush's 2026-10-13 instruction are now done:** attribute 15's P/E/P/B is
  110%-verified feasible with nothing deferred, and sub-project 2's remaining attributes
  (02/06/10/13/15) have complete spec/plan/visual-map coverage with zero open items left. Both
  plans (`2026-10-10-sub-project-2-lookthrough-ingestion-plan.md` and
  `2026-10-12-attributes-02-06-10-13-15-lookthrough-consumers-plan.md`) are ready to hand to an
  implementation session.
- **Follow-up round, same day: Ayush pushed back on two things in the above — both now closed.**
  (1) proving a data source exists isn't the same as specifying how it integrates into the
  existing AMC-disclosure system ("how are we planning to integrate this... let's make sure
  that the integration is working correctly"); (2) the AMFI market-cap verification wasn't deep
  enough ("Are we sure that we have fixed this or not? Because I need this to be 110%
  accurate"). Also: fix the ToS-sourcing-preference item now rather than leave it open, and do a
  second/third full-text pass across all 5 attributes' docs.
  - **Integration architecture — written as new spec §7.3** (not just a feasibility note):
    `stock_master` is a second, independent daily reference-data pipeline
    (`stock_fundamentals_client.py`, same frozen-`*RefreshResult` family as
    `amfi_ter_client.py`), explicitly **not** a stage of the AMC disclosure engine — the two
    pipelines never block each other; `valuation.py` is the only place they intersect, joining
    `LookthroughTable` and `stock_master` by ISIN at read time. ISIN universe to fetch = every
    distinct ISIN in `scheme_holdings` ∪ Nifty 50/500 constituents, re-derived every refresh.
    Refresh cadence is daily (price moves daily even though EPS/book-value only changes
    quarterly), which means attribute 15 gets a **second, independent cache-invalidation
    trigger** (a fresher `stock_master.as_of_date`) alongside the existing
    `disclosure_batches`-reaches-`WRITTEN` trigger the other 4 attributes share — either
    independently invalidates the cache. Full 4-step per-ISIN symbol-resolution fallback chain
    (NSE security master → NSE CSV + Yahoo `quoteSummary` → screener.in on a Yahoo miss only →
    `NULL` + footnote if both fail, e.g. HDFC Ltd's 2023 merger) also specified, plus fetch
    mechanics at real scale (one cookie+crumb handshake reused all run, mid-run re-handshake on
    a stale-crumb 401, one bad ISIN never fails the batch). Propagated into plan Task 6's new
    TDD checkboxes and the visual-map's attribute-15 callout + shared-data-flow table row.
  - **ToS-sourcing-preference — finalized, not left open.** NSE's own data preferred wherever it
    covers the need (all of P/E, the symbol→ISIN mapping, both index-level figures). For P/B
    specifically: Yahoo's `quoteSummary` is the live runtime primary; screener.in is a per-ISIN
    fallback only, not fetched in parallel for every stock; both failing → `NULL` + footnote,
    same mechanism as P/E's loss-making-stock exclusion. Written into `decisions.md` (addendum
    to the 2026-10-06 attribute 15 entry), spec §7.2, plan Task 6, visual-map open item 2 — none
    of these still read "flagged for Ayush"/"non-blocking question remains."
  - **AMFI market-cap list re-verified to the 110% standard Ayush demanded** — the earlier
    HTTP-200-plus-plausible-columns check wasn't enough. Full 48-page PDF parsed (5,427 data
    rows, the whole listed-companies universe, not just top-500); every row's rank/category pair
    checked — exactly 3 category-transition points, at rank 1→Large Cap, 101→Mid Cap,
    251→Small Cap, an exact structural match to the SEBI circular's own 1-100/101-250/251+
    definition (not a coincidence a malformed parse could produce). `robots.txt` checked on both
    `www.amfiindia.com` (disallows only `/admin/`/`/login/`/`/search/`, none relevant) and
    `portal.amfiindia.com` (404, no restriction). **One real caveat found and disclosed, not
    hidden:** AMFI's terms-of-use page restricts site use to "personal and non-commercial use
    only" — flagged honestly, treated consistently with the project's own already-live use of
    AMFI data elsewhere (`amfi_ter_client.py`/`amfi_aaum_client.py`), not a blocker. Written into
    spec §4, plan Task 3, visual-map open item 4, and `decisions.md` (new attribute 02 bullet).
  - **Second/third full-text pass over all 5 attributes' docs: done, zero further gaps found.**
    Re-read the visual-map's attribute 02/06/10/13 sections and the plan's Tasks 2, 4, 5 in full
    (not just headings) — no stale cross-references, no unspecified details, nothing left open.
    Grepped all three documents (spec/plan/visual-map) for TBD/open-question/unresolved/
    non-blocking language — the only hits remaining are either closed-status prose (e.g. "this
    doesn't block the build" describing an already-accepted ToS caveat) or this round's own new
    content, not a live open item.
  - **Bar met:** all 5 consumer attributes' docs (spec, plan, visual-map) now contain the
    integration mechanism, not just data-source feasibility, with zero remaining research or
    design decisions — ready to hand to an intern where the only remaining work is
    implementation and testing, per Ayush's explicit end-state ask.

## Previous (2026-10-12): Sub-project 2 (look-through engine) — AMC reconciliation closed, Playwright go/no-go decided, attributes 02/06/10/13/15 now fully speced/planned/mapped

**Context:** continues the same cross-session sub-project 2 work (second account/session
picking up cold where a credit-cutoff left off). **Nothing has been implemented (no
code).** Everything across both sessions is research/docs only — still confirmed via
`git log`/`find`: no `portfolio_disclosure_*`/`lookthrough.py`/`overlap.py` module exists
in `backend/` yet. This entry supersedes the previous "in progress" one below — all 5
items of that session's task list ("continue straight through 1→5") are now done.

- **AMC reconciliation (item 1): closed.** All 16 AMCs the 2026-10-10 plan had deferred as
  "needs Playwright" were live-rechecked (`curl`/Playwright). Final tally: **13 need no
  Playwright at all** (each needed only a one-time Playwright trace to find the real
  current JSON/AJAX endpoint, then plain `curl`/`httpx` replay forever after — Trust MF,
  SBI, Bank of India, Taurus, Mirae Asset, LIC, Axis, Aditya Birla Sun Life, plus 5 found
  in earlier passes); **1 (HSBC)** genuinely needs a browser (no replayable JSON API found
  under its WAF); **2 (Invesco, ITI)** are confirmed `BOT_BLOCKED` even against a real
  headless browser; **1 (JM Financial)** is a confirmed encrypted-API false positive.
  Evidence: `Docs/analytics/investigations/2026-10-12-amc-disclosure-reconciliation-fifth-
  pass.md` (status: CLOSED).
- **Doc corrections (item 2): done.** The 2026-10-09 consolidated spike doc's tier counts
  and master table, and the 2026-10-10 ingestion plan's "Open items carried forward" /
  Task 5 adapter-registry section, are corrected to match the fifth-pass findings (each
  corrected row annotated inline, nothing silently rewritten).
- **Playwright go/no-go (item 3): decided — no.** Not added as a production runtime
  dependency; HSBC becomes a 16th standing-manual-fetch AMC instead (joining Edelweiss,
  Mahindra Manulife, JM Financial). Recorded in `decisions.md`'s "2026-10-12" entry.
- **Attributes 02/06/10/13/15 (item 4): spec + plan + visual-map written — one consolidated
  triad, not five separate ones, since all five are explicitly scoped together as the
  engine's own consumers and share one compute table.**
  - Spec: `Docs/analytics/2026-10-12-attributes-02-06-10-13-15-lookthrough-consumers-spec.md`
    — one shared `compute_lookthrough_table()` function (fund weight × stock weight,
    grouped by ISIN) feeding 06 directly and 02/13/15 + half of 10 after further
    aggregation; 10's fund-pair heatmap half reads raw `scheme_holdings` instead (fund-level
    %, a genuinely different grain — flagged as a specific thing-not-to-get-wrong).
  - Visual map: `Docs/analytics/artifacts/2026-10-12-attributes-02-06-10-13-15-
    lookthrough-consumers-visual-map.html` — shared data-flow table + one mockup per
    attribute (tokens.css-styled), plus an explicit "open items" section.
  - Plan: `Docs/analytics/plans/2026-10-12-attributes-02-06-10-13-15-lookthrough-
    consumers-plan.md` — 6 tasks in dependency order (06 first as the foundation, then
    02/10/13 independently, 15 last since it's gated on its own feasibility spike).
  - **Two things flagged open in this session — both resolved 2026-10-12/13, see the
    "Latest" section above:** (a) the `asset_type` amendment — approved by Ayush, written
    into the engine spec; (b) attribute 15's exact fetch mechanism — resolved in full,
    P/E and P/B both, via NSE (index + per-stock P/E + symbol→ISIN mapping) plus Yahoo
    Finance/screener.in (per-stock P/B) — nothing deferred.
- **Next for sub-project 2:** see the "Latest (2026-10-13)" section above — the
  attribute-coverage audit is what's left before handing both plans to an implementation
  session.

## Previous (2026-10-10): Sub-project 1 built, reviewed, committed and closed out — final Opus review next

- **Done:** A14, A12, A09; A04 Runs 1–9 + close-out (`9c64f77` PDF memory leak fix, `5f2f779` job 2 GB, hand import verified on all 10 real files, synthetic gate 8/8 with new A04 checks); A11 Runs 1–2 (`4ee7afe`…`0290c76`). Real-life synthetic CAS set committed in the repo (`095c793`: `Docs/CAS Files/synthetic/pdfs/{realistic,regression,errors}`; r1/r2/big_family pass every harness check). AMC factsheets moved out of `Docs/` to `Desktop/Unifolio/Factsheets/2026-10/` (README there; never commit them).
- **A11 close-out, done:** migration **0038** (`nav_history.nav` NUMERIC(14,4); IL&FS IDF NAVs overflowed); full local backfill 14,056 funds / 51 min; 29 scenarios computed in 81 s, 0 failed; R2's portfolio through the engine looks right (COVID −28.5% vs Nifty −30.2%; 2024 election −5.71%, not 0). Deploy guide numbers filled. Found: 3 pre-2006 scenarios have no fund data (open decision, DEFERRED_FEATURES.md).
- **Next:** the **final Opus review** across all five attributes, then staging with `Docs/orchestration/2026-10-10-staging-deploy-guide-subproject-1.md`.
- **Waiting on the user:** OK to wipe staging user data (guide Step 6); an HDFC passive factsheet; decide on the pre-2006 scenarios (hide / index-only / leave); decide whether to fix the pre-2020 rounding (purchases without stamp duty are costed units × NAV, so a high-NAV fund's invested drifts a few rupees from the CAS — R3 HDFC Flexi Cap ₹3.88) or defer it; whether a minor's folio should become its own member (today it imports under the guardian); commit the Docs changes.

## Previous (2026-10-08): Analytics speed fix + stamp duty — built, gated and reviewed

Plan `Docs/superpowers/plans/2026-10-07-analytics-speed-and-stamp-duty.md` is complete up to the deploy. Round-by-round record: `Docs/orchestration/analytics-speed-stamp-duty-handoff.md`. Decisions: `decisions.md` "2026-10-07/08". Deploy: **`Docs/orchestration/2026-10-08-staging-deploy-guide-analytics-stamp-duty.md`**.

- **Built:**
  - Analytics never refreshes TER.
  - TER is linked by SEBI scheme code, exact names only (migration **0031**).
  - The `ter-daily` job runs at 06:20 IST.
  - The NAV job warms category peers.
  - The stuck-run limit is 15 minutes.
  - NSE history counts as fresh within 4 days.
  - Stamp duty is stored (migration **0032**) and counted in cost and cash flows.
- **Verified locally:**
  - 592 affected backend tests pass.
  - The Postgres 0030↔0032 round trip and 43 Postgres/migration tests pass.
  - The synthetic gate is 88/88.
  - Real files pass, except the known empty CP219252880. "CAS 10 Yr" Total Invested equals the CAS within ₹0.02.
  - A fresh final review approved, with its fixes made.
- **Analytics time:** 47 s–3.3 min locally on the largest test file, depending on mfapi.in that day. Staging is estimated at 1–6 minutes (typical household 1–2), not yet measured. Before: 30–60+ minutes.
- **Next:**
  1. The user commits.
  2. The user sends the regenerated synthetic PDFs to the manager.
  3. Staging deploy with the guide: wipe, 0031+0032, Terraform `ter-monthly`→`ter-daily`, clear TER, rebuild it in two runs, then re-test A1, A2, C2, C6 and D2 and time Analytics.
- **Deferred by the user** (`DEFERRED_FEATURES.md`):
  - limit and retry the morning job's mfapi downloads (the remaining Analytics speed fix);
  - data saved before 0032 (staging is wiped).
- **Found and logged:** for funds re-coded after a merger, a genuine pre-merger opening cost can be rejected by the plausibility check.
- **Found on staging, fixed, deployed to staging 8 Oct (user-confirmed working; rollback tag `pre-blank-plan-fix`):** funds whose AMFI row has a blank Plan/Option (e.g. Motilal Oswal Midcap Fund) showed "Regular · unverified" and a name ending "- -"; the statement's plan now decides (`identify.py`, `confirm_people.py`, `scheme_universe.py`, 5 new tests, review clean). Deploy = backend rebuild/push/restart only; re-import to correct existing labels. TER for these funds still missing (not fixed). Detail: `log.md`.
- **Phase 7 Task 3 done (uncommitted, not deployed):** the Import Review screen is removed (gate confirmed by the user, incl. KFintech). Built by Codex, verified (132 tests, tsc clean), reviewed (one onboarding-retry finding fixed, re-review closed). PRD-01 v1.6 and App-Flow v1.5 updated: **the user reviews the PRD-01 diff**, then commits. Next: Task 6 staging (frontend + backend deploy; wipe only with the user's OK; one full upload through the new flow). Handoff: `Docs/orchestration/review-screen-removal-handoff.md`.
- **Still open, unchanged:** the empty-statement dead end (CP219252880), "Other" in Portfolio Allocation, no real KFintech statement.

## Previous (2026-10-07): staging bastion `InsufficientInstanceCapacity` fixed (AZ swap), committed

Full narrative: `log.md`'s 2026-10-07 entry.

- Starting the stopped-by-default staging bastion (Scenario A) started failing with
  `InsufficientInstanceCapacity`. Confirmed via CloudTrail: an AZ-wide `t4g`-family shortage in
  `ap-south-1a`, not instance-size-specific (nano→micro didn't fix it). Fixed by moving the
  bastion to `ap-south-1b` (`subnet_id` change — forces destroy+create, since it's immutable).
  New instance `i-0b3f2f75cfef2465d`, verified running/SSM-online.
- Bundled in the same targeted apply (had to go together, same instance-ID references): a
  9PM-only stop schedule for the bastion (no auto-start, on-demand access) and its IAM wiring.
- Committed: the 5 infra files only. **Not committed**, left as-is: `decisions.md`'s
  unrelated sub-project-1 planning entry, 3 untracked `Docs/*` files, and
  `infra/envs/staging/scheme-master.tfplan` (a separate, not-yet-decided
  `scheme_master_daily`/SNS deploy — plan file excluded, likely contains sensitive data).
- **Still open:** whether to proceed with that `scheme_master_daily`/SNS deploy at all — not
  yet answered by the user.

## Previous (2026-10-06): CAS import fixes — Phases 1–6 + Phase 7 prep built, local gate passed; review screen still in (uncommitted, not deployed)

Full narrative: `log.md`'s 2026-10-05/06 entry. Decisions: `decisions.md` (2026-10-06 entries). Plans: `Docs/superpowers/plans/2026-10-06-cas-import-fixes-*.md`. Round-by-round record and every open/closed carry-over: `Docs/orchestration/cas-import-fixes-handoff.md`. Numbers: `Docs/orchestration/2026-10-06-cas-import-baseline.md` ("Phase 7 gate — FINAL").

- **Everything before staging is done.** That means Phases 1–6 and Phase 7 Tasks 2 and 4, migrations 0025–0029 (Postgres round-trip OK), the synthetic gate (46 scenarios × 2 modes), two real CAMS statements, independent reviews, and docs. **The review screen is still in, on purpose:** the user wants it removed only after staging and their screenshots. The removal was built and then restored; `confirmBody.ts` and `UnidentifiedFundsDialog.tsx` are prepared and unused.
- **Left, all on or after staging:**
  1. The user commits (nothing is committed) and reviews PRD-01 v1.5 (the FR-5 amendment only).
  2. Wipe staging with `scripts/clean-staging-db.sh` (user's go-ahead).
  3. Deploy; migrations 0025–0029 run on deploy.
  4. Run `scripts/jobs/refresh_scheme_master_daily.py` once as a one-off ECS task, and confirm the `scheme-master-daily` schedule is ENABLED.
  5. Upload a synthetic file and the two real files, plus **1–2 real KFintech statements** (not yet tested anywhere). Import health must be all ✓.
  6. The C1–C14 frontend checklist screenshots (Phase 6 Task 12 Step 3).
  7. Phase 1 Task 10 Step 3 (staging Import health check).
  8. After the user confirms the gate: Phase 7 Task 3 (remove the review screen, wiring in the prepared pieces) and its PRD-01 FR-10 / App-Flow edits.
- **Harness:** `Docs/CAS Files/synthetic/harness/`. `test_deep.py` takes `SEQ` / `MASTER_FILE` / `SNAP` / `MFAPI_BLOCKED`. `test_real_check.py` runs real files and prints counts only.
- **Stale items closed:**
  - `FamilyImportFlow.tsx`'s `member_mismatch` gap: that component was removed in `0fbafe5`.
  - The 10-year CAS discrepancy: root-caused (opening balance never saved) and fixed.

## Previous (2026-10-01): Member profile completion built (Tasks 3-10 uncommitted, not deployed)

Full narrative: `log.md`'s "Member profile completion built" entry. Decisions: `decisions.md`'s
2026-10-01 "Member profile completion" entry. Plan: `Docs/superpowers/plans/2026-10-01-member-profile-completion.md`;
spec: `Docs/orchestration/member-profile-completion-map.html`. Ledger (all rulings, deferred minors):
`.superpowers/sdd/2026-10-01-member-profile-completion/progress.md`.

- The detected-member lock is gone. Detected members open directly; a profile nudge, dropdown % and
  the Complete profile popup (`PUT /household-members/{id}/profile`) collect name, PAN,
  relationship, phone and email (5 x 20%, computed on read). PAN on another account shows a red banner
  and a second warning on Save (`pan_conflict`, max 80%). Name and PAN are saved at Confirm like Self's;
  no upload-time PAN reservation for non-Self members. Name is editable (`name_source=user_edited`).
- Migration `0023_member_profile_completion` (drops `details_completed_at`/`lock_reason`/trigger, adds
  `pan_conflict`, backfills detected PANs). The deferred `primary_goal` drop is now 0024.
- All 10 tasks implemented. Tasks 1-2 are committed (`0a0152a`, `3268765`, `696ac1f`, `3a4852e`); the
  Task 2 fix round and Tasks 3-10 are **uncommitted** in the working tree (user commits manually). Nothing is deployed. Final whole-branch review (Opus) done: one fix wave (stuck
  `refresh_pan_conflicts` on same-hash conflict rows, rename cache invalidation, "Change in Account Info"
  now renders only with a callback — so not on mobile, plus minors), scoped re-review clean. Parked: rare
  Add-data dead end with a typed conflict PAN (M-3), Self no-PAN nudge copy (M-8), no UI path to merge two
  same-PAN conflict rows. Ledger: `.superpowers/sdd/2026-10-01-member-profile-completion/progress.md`.
- **Postgres verified (2026-10-01, later):** all of `tests/functional_postgres` (11 passed, covers 0018-0023)
  ran against a throwaway local Postgres 16.2, plus a scratch 0022→0023→0022→0023 round trip with the
  backfill data shapes (promote, duplicate, cross-user, other-account) — all OK. One test fix:
  `test_member_detection_postgres.py` round-trip test now deletes its NULL-relationship rows before
  downgrading below 0018 (0018's downgrade restores `relationship NOT NULL`).
- **Not verified:** no test covers "Add data" for a name-only member whose statement PAN another account already holds (the review now starts and Confirm stores it as `pan_conflict`, no 409); no browser visual QA; only affected test files were run per
  task, no full suites.
- `.ua/knowledge-graph.json` is still stale (as of `35fedd3`); re-run `/understand` incrementally.
- Prior "Latest" (AWS staging cost-reduction Scenario A, applied and verified, $91.78 -> $68.46/mo,
  Scenario B held off): see `log.md`'s 2026-10-01 (cont'd) entry and `decisions.md`.

## Previous (2026-10-01, earlier session): staging DB-access tooling, no app code changed

No implementation work that session — DB-access setup, repeated staging wipes, and two
diagnoses. Full detail: `log.md`'s 2026-10-01 entry.

- Staging RDS access via an SSM port-forwarding tunnel (through the SSM-only bastion) +
  `psql`/DBeaver, used for several full user-domain wipes during stakeholder fresh-signup
  testing rounds. Now a self-serve script: `scripts/clean-staging-db.sh` — resolves the
  bastion/RDS endpoint/Secrets Manager ARN dynamically, deletes in one FK-safe
  transaction, prints before/after counts, leaves reference/platform tables untouched.
- **New, unfixed bug found:** `frontend/src/features/auth/FamilyImportFlow.tsx`'s
  `handleConfirm` never checks for the `member_mismatch` 409 code and has no
  override-retry UI — unlike `frontend/src/features/import/ImportFlow.tsx`, which has the
  full `memberMismatch` state + "Continue anyway"/"Switch to X" buttons. Every family
  member's first-ever CAS import after a DB wipe hits a dead end with no way to proceed.
  The fix is bounded: mirror `ImportFlow.tsx`'s `memberMismatch` state + buttons into
  `FamilyImportFlow.tsx`'s `handleConfirm`/render for the `review` stage. Not yet built —
  pick this up first in a future session.
- Progressed (not resolved) the 10-year CAS statement value-discrepancy investigation —
  confirmed no Unifolio code branches on statement year-span, narrowed suspicion to
  `casparser`'s page/fund-boundary detection, still unconfirmed. Handoff doc for a
  dedicated session: `Docs/investigations/2026-10-01-cas-10-year-parsing-discrepancy-handoff.md`.
- Corrected stale status: the 2026-09-29 CAS member detection build and the 2026-09-30
  staging QA fixes were both marked "uncommitted" in this file, `CLAUDE.md`, and `log.md`
  — confirmed via `git log` that both are in fact fully committed. Fixed in all three
  places this session.

## Previous (2026-10-01, consent/onboarding/profile session, merged from a parallel branch push): consent, onboarding and profile changes + staging DB tooling

Branch `feat/enhanced-ui`. Consent, onboarding, and profile changes committed on this branch (along with staging DB-access tooling and the 10-year CAS parsing investigation handoff, both superseded/incorporated above). Plan: `Docs/superpowers/plans/2026-10-01-consent-onboarding-profile.md` and `Docs/orchestration/2026-10-01-onboarding-consent-profile-changes-plan.md`.

1. Onboarding privacy screen removed; name saved at the name step (self member created
   then, provisional until the CAS); `/auth/me` has `self_name` and `consent_outdated`.
2. "Why choose? All of it." goal shortcut (stores all 4); `scripts/report_onboarding_goals.py`.
3. Name and PAN come from the CAS: unlock is relationship-only (PAN only if the statement
   had none); `PATCH /household-members/{id}` edits relationship/phone/email; 422
   `field_not_editable` / `name_not_editable`.
4. Consent: migrations 0021 (member phone/email) and 0022 (`consent_records`, append-only
   triggers, `consent_snapshot`); `/legal/*`; sign-up/upload/CAMS/reactivate consent;
   placeholder legal texts; `scripts/consent_trail.py`.
5. OTP email: no logo, green text. Profile restructured into 5 sections.
6. Staging DB wipe script: `scripts/clean-staging-db.sh` — resolves bastion/RDS endpoint dynamically, wipes user-domain data cleanly in one FK-safe transaction for testing rounds.
7. Progressed 10-year CAS statement value-discrepancy investigation; handoff doc at `Docs/investigations/2026-10-01-cas-10-year-parsing-discrepancy-handoff.md`.
8. Confirmed that both the 2026-09-29 CAS member detection build and 2026-09-30 staging QA fixes are committed.

**Before deploying:** no new secret and no `terraform apply` needed for *this* change
specifically — the consent IP-hash key is derived from the existing `PAN_LOOKUP_PEPPER`
(decision 2026-10-01). (Scenario A above did separately need, and has already had, a real
`terraform apply`.) Follow `Docs/orchestration/2026-10-01-consent-release-deploy-guide.md`
(Postgres tests first, then migrate, push the backend image, publish the frontend).

**Open for this change:**
- `tests/functional_postgres` (cascade deletes, consent trigger, migrations 0019-0023 on
  Postgres): now run, 11 passed (2026-10-01, local Postgres 16.2).
- Family-CAS fixture-backed tests skip (fixtures absent; set `UNIFOLIO_QA_FIXTURES`).
- No browser visual QA of the new onboarding/profile screens.
- Legal texts are placeholders; retention (Q6), withdraw-consent (Q11) and final text wait
  on the lawyer (`DEFERRED_FEATURES.md`). The old "0021" primary_goal drop is now 0023.
- The 2026-09-30 retest list (staging QA fixes) still applies once deployed: it is Step 7 of
  `Docs/orchestration/2026-09-30-staging-qa-fixes-deploy-guide.md`.
- `FamilyImportFlow.tsx` confirm handler `member_mismatch` 409 handling diagnosed (needs override-retry UI like `ImportFlow.tsx`).

## Still open, carried forward from earlier phases, not yet revisited

**Open, specific to the CAS member detection change (2026-09-29):**
1. `backend/tests/functional_postgres`: now run, 11 passed on a local Postgres 16.2 (2026-10-01).
2. Holder-name extraction (`parser.py`) was verified only on synthetic CAMS/KFintech
   lines; no real PDFs were on disk (plan Task 4 Step 6 skipped). Test with real
   multi-PAN family CAS files from both RTAs before trusting it.
3. The mobile ribbon review reuses the desktop styling as-is and needs phone visual QA.
4. **Corrected 2026-10-01**: this work is in fact committed (`af92286`..`b40f52b`), not
   uncommitted as this line previously said.

**New, specific to this session (2026-10-01):**
1. `FamilyImportFlow.tsx`'s missing `member_mismatch` override-retry UI (see "Latest"
   above) — diagnosed, not fixed.


*(Moved here from `CLAUDE.md` 2026-08-24 — that file's Session State section is a
short pointer only, per its own header note; this is the detail it points to.)*

1. **RESOLVED 2026-09-03 (= compliance audit F8).** A held scheme with no obtainable NAV
   silently vanished from holdings/allocation/aggregates, no error or placeholder.
   **Product call resolved 2026-09-02**: user chose (b) — a degraded row with a visible
   "NAV unavailable" flag, NAV-dependent fields null, FIFO-derived fields (units held,
   invested, realized gain) always populated. Design: `Docs/orchestration/
   f8-nav-unavailable-degraded-row-handoff.md` (`distributor_comparison.py`'s identical
   sibling bug explicitly flagged as a separate, out-of-scope follow-up, not silently
   fixed alongside this). Implemented across 2 review rounds: round 1 fixed an
   understated "Total Invested" and a missing caption; round 2 caught (via adversarial
   review, independently confirmed) that `gainPercentage` mixed populations — dividing
   valued-only profit by an all-holdings invested total, understating the return — fixed
   by adding a `valuedInvestedVal` (valued-holdings-only) denominator in both
   `DashboardView.tsx` and `MobileDashboardView.tsx`. Status: DONE, committed.
2. **RESOLVED 2026-09-02 (= compliance audit F3).** No DB uniqueness constraint on the
   "self" `household_members` row — frontend-mitigated client-side only; real fix needed
   a migration (confirmed missing — migrations `0001`-`0010` existed, none touched this).
   **Read-only violation check run 2026-09-02** against the local dev SQLite DB
   (`backend/unifolio_dev.db`) first: 39 `self`-relationship rows across 46 distinct
   users, **zero users with more than one** — no existing dirty data to remediate,
   simplifying the fix to a straight constraint-add + API guard with no data-migration
   remediation strategy needed. Fixed: migration `0011_household_members_one_self_row.py`
   adds a partial unique index on `household_members(user_id) WHERE relationship =
   'self'`, expressed once via SQLAlchemy's `sqlite_where=`/`postgresql_where=` kwargs on
   a single `op.create_index` call (no runtime dialect branch needed, unlike F6's fix);
   `create_household_member` (`services/dashboard/household_members.py`) gained a
   pre-check raising `DuplicateSelfMemberError`, mapped to a 409 in the
   `/household-members` route (`api/dashboard.py`). Verified: new unit tests
   (`tests/services/dashboard/test_household_members.py`), an API 409 test
   (`tests/api/test_dashboard_routes.py`), a new Postgres functional test proving the
   `postgresql_where` branch enforces the constraint against a real server
   (`tests/functional_postgres/test_partitioning.py::test_household_members_one_self_row_per_user_on_postgres`),
   and the full 587-test SQLite suite plus 5 Postgres-marked tests, all green.
   `Docs/PRDs/Database-Schema-Unifolio.md` bumped to v1.5 documenting the new index.

   User separately raised a PAN-based idea for a related-but-distinct problem (detecting
   the same real person across multiple household-member/CAS-upload records), stating a
   belief that PAN is "currently persisted." At the time this conflicted with this
   codebase's explicit, test-guarded rule — no PAN persistence, ever
   (`tests/models/test_no_pan_field.py`, `Docs/PRDs/Database-Schema-Unifolio.md`'s Data
   Classification section) — flagged back to the user 2026-09-02 per CLAUDE.md's "stop
   and say so" rule rather than silently built or silently dropped. **Note added
   2026-09-26**: that invariant was itself superseded 2026-09-18 when ADR-004 reopened to
   allow encrypted PAN persistence — `test_no_pan_field.py` was rewritten (not deleted)
   to guard the new invariant instead (no *unencrypted* PAN-shaped column on any mapped
   model). Read as historical: at the time this paragraph was written, PAN persistence
   genuinely didn't exist yet.

   **Resolved 2026-09-02**: user confirmed no PAN persistence, sign-off given for a
   non-PAN alternative, design left to Claude, explicitly asked to be "extensive." Design:
   split into two cases with different privacy remedies. Same-user cross-household-member
   duplicates get a new `(folio_number, amc_name)` signal added to `resolve_attribution`'s
   existing within-household matching (prioritized over its existing weaker name/email
   signal, safe to auto-offer a redirect since same tenant). Cross-user duplicates (two
   different Unifolio accounts holding the same real person's data) get a new, separate,
   advisory-only `detect_cross_account_duplicate` check — never blocks, never merges,
   never leaks the other account's identity, folio-match primary / name-match weaker
   secondary signal. Full design + rationale + rejected alternatives:
   `Docs/orchestration/non-pan-duplicate-person-detection-handoff.md`. **RESOLVED
   2026-09-03**: round 2 wired the design into the actual production import paths —
   a shared `enforce_attribution_confirmation` gate added to `attribution.py` and
   called at all 3 backend commit sites, a structured `member_mismatch` 409, and
   desktop/mobile confirmation UI. This wiring surfaced a standalone architectural gap —
   two parallel import backends had independently drifted to need the identical fix wired
   in twice — documented at `Docs/orchestration/two-parallel-import-backends-architectural-gap.md`.
   **Superseded 2026-09-18/24**: `attribution.py` was itself later deleted and replaced
   by PAN-based `pan_claims.py` once ADR-004 reopened (see "Latest" above) — the non-PAN
   duplicate-detection logic this item describes predates that rework; check current
   `pan_claims.py` before assuming this exact code path still exists verbatim. Status:
   DONE, committed.
3. `HoldingsTable.tsx` references a dead `row.return_percentage_1y` field that doesn't
   exist on the real API type — harmless (client-computed fallback always runs), never
   cleaned up.
4. `category_ranking.py`'s `_bulk_nav_on_or_before` (BUG-001 fix, 2026-08-18): the
   per-scheme N+1 query pattern is gone (one `MAX(date) GROUP BY` query per target date,
   bounded by a 15-min per-category cache), but the DB-side scan to compute each
   `MAX(date)` still isn't index-seek-bounded without a `LATERAL` join — a primitive
   unused elsewhere in this codebase and unverifiable via query plan on SQLite. Accepted
   as a documented limitation rather than a third fix round (correctness-safe, cost
   already bounded by the cache). Full follow-up action and rationale:
   `Docs/PRDs/Migration-Plan-SQLite-to-Postgres.md`'s "Deferred Postgres-Only
   Optimizations" section — revisit with `EXPLAIN ANALYZE` once Postgres is live (real
   AWS RDS Postgres has been live in staging since 2026-09-09 — worth actually revisiting
   this rather than treating it as still hypothetical).
5. `DashboardView.tsx`'s SIP Upcoming/This Month segmented control (`sip-tab-upcoming`/
   `sip-tab-month`) always renders both tab buttons' `aria-controls` IDs, but only the
   active tab's `role="tabpanel"` actually exists in the DOM — the inactive tab's
   `aria-controls` points at an ID that doesn't resolve, an incomplete ARIA tabs IDREF
   pattern. Accepted as a documented limitation rather than a third fix round, per the
   model-orchestration skill's stopping heuristic — negligible real-world screen-reader
   impact since the tab/panel pairing is already correctly conveyed via
   `role`/`aria-selected`/`aria-labelledby` on the panel that does exist, and a full fix
   means always mounting both panels (one `hidden`) instead of one conditionally-rendered
   panel. Revisit only if a real accessibility-audit or user complaint surfaces it as an
   actual usability problem. Full review-round detail: `Docs/orchestration/
   delegation-log.md`'s 2026-08-19 entries.
6. **RESOLVED 2026-09-02 (= compliance audit F7).** `compute_holdings`'s per-folio
   `Transaction` N+1 query pattern (`backend/app/services/dashboard/holdings.py`) —
   discovered as a side effect of the 2026-08-21 distributor-comparison-portfolio-level
   rewrite, confirmed pre-existing and explicitly out of scope for that change at the
   time. Fixed: one batched `Transaction` query across all folios (`folio_id.in_(...)`),
   grouped by `folio_id` in Python preserving per-folio chronological order (the FIFO lot
   processor requires it). Status: DONE, committed.
7. **RESOLVED 2026-08-27, commit `bb5225f`.** A colleague's AMFI TER `ReadTimeout`s were
   root-caused to event-loop starvation from a blocking `db.commit()` inside an
   `async def` (this backend's SQLAlchemy engine is fully synchronous, single
   worker/event loop) — not AMFI slowness. `bb5225f` added `commit_off_loop` (routes
   `db.commit()` through `asyncio.to_thread`) and rewired every reachable commit across
   all 8 affected service files, with a regression test. Full narrative: `log.md`'s
   2026-08-25/26 entry.
8. **RESOLVED 2026-09-03 (= compliance audit F4), partially.** ADR-006's EventBridge
   Scheduler background jobs (daily NAV refresh, monthly TER, quarterly AAUM, daily
   benchmark) — piece (a), the 4 job-entrypoint scripts + wiring `amfi_aaum_client
   .refresh_aaum_data` into a real caller, is done and committed
   (`backend/scripts/jobs/`, `backend/tests/scripts/`). **Still not built**: piece (b),
   the actual EventBridge Scheduler + ECS Fargate Terraform module — deliberately
   deferred to the infra-authoring phase. An AWS account, ECR repo, and ECS cluster now
   all exist in staging (since 2026-09-08/09) so this is no longer blocked on
   infrastructure existing — it's just not been picked up yet.
9. **RESOLVED 2026-09-30 (staging QA fix 1): unknown numbers/emails are now rejected at request time on Log In, and registered numbers on Sign Up.** Original note: **Phone-login OTP verify silently creates a new account for an unrecognized phone
   number, instead of erroring like the email channel does.** Found by the user
   2026-09-11 manually smoke-testing staging: logging in with a phone number that has no
   matching account still goes through the OTP-send/verify flow and ends by creating a
   brand-new account, rather than telling the user no account exists and directing them
   to sign up. **Independently re-checked against current code 2026-09-26 — still
   present, unchanged.**

   Root cause, confirmed against the code: `backend/app/api/auth.py`'s
   `verify_otp_route` (phone-OTP channel), in the branch that handles a verify call with
   no `pending_token` (i.e. a plain login attempt, not part of an in-progress signup/
   phone-gate flow) — `find_or_backfill_phone_identity` returning `None` falls straight
   through to an unconditional new-`User` INSERT. The equivalent email-OTP branch,
   `verify_email_otp`'s no-`pending_token` path, already does the right thing:
   `find_identity_by_subject` returning `None` raises a 401 ("No account found for that
   email — sign up instead.") instead of creating an account. The two channels'
   identical-shaped branches have simply diverged. **Distinct from the 2026-09-22
   phone-gate collision fix** (`c8a4a8e`/`31e112a`), which only touches the
   `pending_token`-present branch — that fix did not incidentally resolve this one.

   Frontend-side, confirmed this is a clean single-sided gap, not a shared code path:
   `Landing.tsx` only renders the "Continue with Phone" button in **login mode**; signup
   mode offers email + Google only, with no direct phone-signup entry point anywhere in
   the UI. So the phone no-`pending_token` verify branch is *only* ever reached from a
   genuine login attempt — fixing it to 401 like email can't break a legitimate
   phone-signup flow, because that flow doesn't exist.

   **Also worth carrying forward for whoever picks this up**: even the email channel
   doesn't fully match the UX the user described as ideal. Today, email's existence
   check happens at **verify time** — the OTP is still requested and sent, and the user
   still lands on the "enter your code" screen, before the 401 fires. The user's stated
   expectation implies the check should happen at **request time**
   (`/email-otp/request` / `/otp/request`), before any OTP is sent at all, for both
   channels — not just bringing phone's verify-time behavior in line with email's
   verify-time behavior. Moving the check to request time is a slightly larger change
   (touches both `request_*` handlers, not just both `verify_*` handlers) and has one
   real tradeoff worth surfacing to the user before building it: an unauthenticated
   "does this identifier have an account" check at request time is a mild
   account-enumeration surface (probeable without ever completing an OTP). Low stakes
   for this product, but a deliberate tradeoff, not a free improvement.

   **Explicitly deferred, not fixed, by user decision 2026-09-11**: the user judged this
   redundant work right now, reasoning that once a real OTP provider is attached later,
   invalid/nonexistent phone numbers will need to be handled as part of that integration
   anyway. **Note added 2026-09-26**: real OTP/email delivery (SES) has since gone live
   (2026-09-17/22/23) — worth checking with the user whether that changes the deferral
   calculus now that "the real provider" referenced in the original deferral reasoning
   actually exists.
