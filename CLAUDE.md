# CLAUDE.md — Unifolio (MF MVP)

## What this project is

Unifolio is a mutual fund portfolio tracking and wealth-management platform for the
Indian market — a genuinely superior, free-core alternative to Mprofit. This build
covers the MF-only MVP: CAS import, onboarding, a main holdings dashboard, and an
analytics dashboard. Every product and technical decision behind this build already
exists in `/Docs` — this file tells you where to look, not what to re-derive.

## Read this first, every session

Before writing any code in a fresh session, read in this order:
1. `/Docs/Database-Schema-Unifolio.md` — the schema, exact and final
2. `/Docs/TDD-Unifolio.md` — architecture, API surface, external integrations
3. `/Docs/ADR-Technical-Stack-Decisions.md` — six Accepted ADRs (stack is locked, don't relitigate)
4. The specific PRD for whatever module you're working on (`PRD-01` through `PRD-04`)
5. `/Docs/App-Flow-Unifolio.md` — screen-to-screen navigation for the module
6. `/Docs/Design-Brief-Unifolio.md` and `/Docs/Design-Schema-Unifolio.md` — for anything UI

`/App Flow References` contains Mprofit screenshots — reference for proven functional
*patterns* (table layout, allocation views), never for visual style. Unifolio's visual
identity is `/Docs/Design-Schema-Unifolio.md`, full stop — do not imitate Mprofit's look.

The CAS parser (scaffold, `casparser` wrapper, `mfapi.in` enrichment, parse/confirm API
routes) has been ported per PRD-01 and lives in `backend/app/services/import_/`
(`parser.py`, `enrich.py`, `service.py`, `schemas.py`) — the standalone prototype backend
it was ported from no longer exists on this branch. `CAS Parsers/mf-import/frontend`
(vanilla TS prototype) is unaffected and still there as reference.

## Non-negotiables

- **Test-driven, always.** Red (failing test) → green (minimal passing code) → refactor.
  No implementation code without a failing test first. This is enforced by the
  `superpowers` plugin's TDD skill if installed — don't bypass it.
- **The stack is decided, not up for debate mid-build.** React + Vite (no Next.js, no
  micro-frontends), FastAPI (no Django), AWS RDS PostgreSQL, scoped S3, ECS Express
  Mode, EventBridge Scheduler. If a real blocker makes one of these wrong, stop and
  flag it explicitly rather than silently deviating.
- **`Decimal`, never `float`**, for every money/units/NAV value. This is a repeated,
  explicit requirement across every PRD — a `float` anywhere in the money path is a bug.
- **No raw CAS PDF storage, ever.** No PAN persistence, ever. Both are final decisions
  (ADR-004, Database Schema) — don't add a "just in case" column or temp file that
  outlives the parse.
- **Build for the schema that exists**, including `transactions`/`nav_history` partitioning
  and the reference-data vs. user-data separation — don't simplify the schema during
  implementation without flagging why first.
- **Local development first.** SQLite (dev) + a local Postgres container (functional-test
  parity) per `/Docs/Migration-Plan-SQLite-to-Postgres.md` — AWS deployment happens once
  that document's Readiness Checklist is met, not before. Alembic migrations from the
  first schema change, no hand-edited dev schema.
- **This is an MVP prototype, not an enterprise system.** Foundation must be solid and
  genuinely scalable in the specific ways the docs call out (partitioning, reference-data
  separation, monolith-not-microservices at this team size) — but don't gold-plate
  features the PRDs explicitly deferred (cap-wise composition, stock overlap, HNI-specific
  flows, full auth/security policy beyond the foundational tables). Build what's scoped,
  build it well, don't build what isn't scoped yet.

## Commands

*(Fill in once the project scaffold exists — placeholders below, update on first setup)*
- Backend test: `pytest`
- Backend run (local): `uvicorn app.main:app --reload`
- Frontend dev: `npm run dev`
- Frontend test: `npm test`
- Migrations: `alembic revision --autogenerate -m "<message>"` then `alembic upgrade head`
- Local Postgres for functional tests: `docker compose up postgres`

## Architecture at a glance

Backend: one FastAPI application, four logical services (Auth, Import, Dashboard,
Analytics) — not four deployments. Frontend: one React/Vite SPA. Full detail in
`/Docs/TDD-Unifolio.md`. Do not introduce a second backend framework, a second
frontend framework, or a service split not already in that document.

## Working style

- Ask before assuming on anything the docs mark as an open question or "needs your
  input" — check `/Docs` for unresolved items before guessing.
- When a PRD, ADR, or the schema seems to conflict with what you're about to build, stop
  and say so — don't silently resolve the conflict in either direction.
- Explain non-obvious decisions inline as code comments where the *why* isn't in the
  docs (e.g., a specific edge case handled a specific way) — don't restate what's already
  in `/Docs`.

## Skill Observation

At the start of any task-oriented session — any interaction where you will
use tools and produce deliverables — invoke the task-observer skill before
beginning work. This ensures skill improvement opportunities are captured
throughout the session.

When loading any skill, check the observation log for OPEN observations
tagged to that skill. Apply their insights to the current work, even if
the skill file hasn't been updated yet. This enables immediate application
of observations before they're permanently integrated during the weekly
review.

## Model Orchestration

When delegating non-trivial implementation, refactor, boilerplate, or
research/lookup work — or dispatching parallelizable independent
subtasks that would otherwise mean multiple Claude subagents — invoke
the model-orchestration skill first. It governs the Claude
(orchestrator) / Codex (default worker) split, the mandatory per-task
handoff doc, and the mandatory adversarial-review gate before any
Codex-implemented change is considered done. Full design:
`Docs/superpowers/specs/2026-08-12-model-orchestration-skill-design.md`.

## Agent skills

### Issue tracker

GitHub Issues on `ayushkarnawat/MVP_V1_MF_only`, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Domain docs

Not the generic `CONTEXT.md`/`docs/adr/` layout — points at this repo's existing `/Docs`
system (schema, TDD, ADRs, PRDs, dated specs under `Docs/superpowers/`, `session.md`)
instead. See `docs/agents/domain.md`.

## Session State

*(Updated 2026-08-18. See `session.md` at repo root for the full detailed history —
this section is a current-status pointer, not the record of every past session.)*

**BUG-001/DATA-001 implementation is fully complete — all 7 items DONE
(2026-08-18).** Worked from `Docs/orchestration/bug-001-data-001-implementation-prompt.md`
on branch `bug-001-data-001-implementation` (worktree, off `feat/enhanced-ui`):
Item 1 (XIRR ×100 display fix), Item 2 (Scorer caching + bounded series
query), Item 3 (TER negative-cache/backoff — 4 review→fix rounds:
deadlock → cross-thread backoff race → flawed regression test), Item 4
(Category Ranking bulk query + alternating-timing investigation), Item 5
(NSE `follow_redirects=True` — fixed then correctly reverted after live
reproduction falsified the original premise, re-fixed with a narrower
`decimal.InvalidOperation` catch), Item 6 (TER silent-zero + Scorer
cost-adjustment sentinel — 2 rounds: ingestion zero-skip + None sentinel →
stale-zero-row deletion), and Item 7 (import identity validation
tightening — `enrich.py`'s `resolve_scheme()` cross-checks a CAS-supplied
AMFI code against its canonical master-list name instead of trusting the
pairing blindly, `confirm_import()` gained a 409 backstop on both an
override `amfi_code` absent from the master list and a `plan_type_override`
contradicting an anchored "Direct Plan"/"Regular Plan" name match, closing
the previously-open "no server-side 409 backstop on plan-type override"
item; 2 review rounds — a plan-designator false-positive risk, a recurred
stale-`.cache/mfapi/` test-isolation gap, and a `SequenceMatcher("", "")`
blank-name edge case, all fixed). Every item went through
`model-orchestration`'s full mandatory adversarial-review gate, TDD
throughout (RED confirmed before every fix). Full backend suite: 412
passed, 2 skipped (started at 401/2). `tsc -b --noEmit` clean. Not yet
merged into `feat/enhanced-ui` — this worktree/branch is ready for that
next. Full per-item detail: `Docs/orchestration/delegation-log.md` and
the per-item handoff docs under `Docs/orchestration/`.

**Two small BUG-001/DATA-001 follow-ups, same branch (2026-08-19):**
(1) Item 4's "accept the per-scheme full-history scan as a documented
limitation" decision was previously backed only by a theoretical
"`LATERAL` would be faster, unverifiable on SQLite" claim — now backed by
a direct benchmark against the real dev DB: the current `GROUP BY
MAX(date)` approach measured ~3.5s total (3 real target dates, 143-scheme
category), a hand-written `LATERAL`-equivalent correlated-subquery
reformulation measured **slower**, ~4.6s — confirmed via `EXPLAIN QUERY
PLAN` it does perform the intended per-scheme index-seek shape. Doesn't
overturn the deferral (SQLite's planner isn't Postgres's), but replaces
"unverifiable" with data, and flags that the `LATERAL`-is-faster
assumption should itself be re-measured when Postgres's `EXPLAIN ANALYZE`
step finally runs (see `Docs/PRDs/Migration-Plan-SQLite-to-Postgres.md`'s
"Deferred Postgres-Only Optimizations" section). (2) A user-referenced
doc, `Docs/Analytics-Dashboard-Internal-Correction-Plan.md`, was initially
(and incorrectly) reported as not existing anywhere in this repo — that
search covered only this worktree's tree plus git's committed history,
which can never surface an uncommitted file. The user corrected this: the
doc is real, sitting uncommitted in the main checkout's working tree
(`feat/enhanced-ui`, a sibling worktree at `/mnt/d/Unifolio code`) —
confirmed by reading it directly at that path. See
`Docs/orchestration/analytics-correction-plan-status.md` for the full
22-item cross-reference against this codebase. The underlying technical
point independently verified and fixed ahead of that cross-reference:
`nse_indices_client.py`'s
`_fetch_index_history` had no validation that a response's parsed dates
actually fell within the requested `[start_date, end_date]` — a gap
outside the scope of Item 5's 4 already-closed review rounds (redirects
and `Decimal` parsing only). Fixed via TDD (RED confirmed, then a single
inclusive-range check raising `ValueError`, caught by the existing
broad-except degrade-to-stale-cache path); full suite 413 passed/2
skipped; live-verified against the real endpoint (zero false-positive
rejections); adversarially reviewed, APPROVE/zero findings. Full detail:
`Docs/orchestration/delegation-log.md`'s `item4-lateral-benchmark` and
`item5-p2.8-followup*` entries.

**Analytics Dashboard Internal Correction Plan — 22-item cross-reference, investigation
only, no code changed (2026-08-19):** cross-referenced every P0/P1/P2 requirement in
`Docs/Analytics-Dashboard-Internal-Correction-Plan.md` against this branch's actual code.
Full detail, evidence, and classification (DONE / confirmed gap / conflicts with an
existing decision / unchecked): `Docs/orchestration/analytics-correction-plan-status.md`.
Headline findings: **P0.2** (Category Ranking's CAGR return is never ×100'd — same bug
class as the already-fixed Item 1 XIRR bug, in an untouched code path — "0.12%" displayed
instead of "12.00%") and **P2.4** (Scorer's `final_score` has no `[0, 100]` clamp after
the ±0.25 TER adjustment) are both clean, low-risk, high-confidence fixes with no product
decision attached — good next TDD targets. **P0.3** (benchmark comparison's NSE index
names carry no TRI designation, and the doc requires the benchmark identifier/series type
to be explicitly recorded and displayed — neither happens today; whether the underlying
NSE feed's actual values are price-only or already total-return is unconfirmed, since
nothing here inspects the retrieved figures against known TRI/price benchmarks) is
confirmed as a naming/disclosure gap but needs a data-sourcing feasibility pass before any
fix, not a same-file code change. **P1.4** surfaced a direct conflict with an existing, already-documented PRD
decision: the PRD's Edge Cases table says thin categories (<5 peers) are "still shown, but
flagged," while this doc requires hard suppression below 5 peers for the same threshold —
flagged per CLAUDE.md's "stop and say so," not resolved either way. Also newly confirmed:
**P1.10** (mixed direct/regular plan holdings of the same scheme collapse into one
ambiguous aggregated row in `dashboard/holdings.py`), P0.4/P1.1/P1.5/P1.6/P1.7 (all
confirmed gaps with code evidence in the status doc). Several P2 items (P2.1, P2.2, P2.3,
P2.5) remain unchecked. Nothing here has been implemented yet — awaiting direction on
priority/scope before further work.

**Analytics Dashboard Internal Correction Plan — round 2 (implementation), DONE
(2026-08-19):** the user reviewed the 22-item status doc above and gave an explicit
per-item disposition — full table and rationale in
`Docs/orchestration/analytics-correction-plan-status.md`'s "Final Decision" section.
Five items were fixed this round: **P0.2** (Category Ranking's CAGR now runs through
`frontend/src/lib/decimal.ts`'s existing `toPercentString` before display, reusing the
Item-1 XIRR precedent instead of a new helper), **P2.4** (Scorer's `final_score` clamped
to `[0.00, 100.00]` after the TER adjustment), **P1.10** (`dashboard/holdings.py`'s
grouping key extended to `(household_member_id, scheme_id, plan_type)`, so mixed
direct/regular holdings of the same scheme now render as separate rows;
`HoldingsTable.tsx`'s React key extended to match), **P0.3** (labeled all 4 benchmark
index names "(Price Return)" in `BenchmarkSection.tsx` rather than sourcing a TRI feed —
full deferred-implementation plan, feasibility questions, and revisit trigger in
`Docs/orchestration/tri-benchmark-deferred-plan.md` per the user's explicit
documentation requirement), and **P1.6** (fund-level XIRR now includes switch
transactions — `benchmark.py` gained `_fund_level_transactions` plus an
`extra_debit_types` parameter threaded through the existing XIRR helpers so SWITCH_IN
is treated as a debit like a purchase and SWITCH_OUT as a credit like a redemption,
scoped to fund-level only; portfolio-level XIRR is untouched — the user explicitly
authorized "fix this properly" over an artificially narrow scope, and the orchestrator
determined the correct scope was this bounded parameterization, not a larger redesign).
**P0.4** (hard-fail on incomplete cash flows) was explicitly declined — it fights this
codebase's established graceful-degrade pattern (`nav.py`/`ter.py`/`amfi_ter_client.py`
all degrade rather than hard-fail). **P1.3** (Scorer methodology sign-off) and **P1.4**
(keep the existing soft-flag over hard-suppression for thin categories) were
decision-confirmed with no code change. **P1.1, P1.5, P1.7, P1.8, P1.9 (broader scope),
P2.1, P2.2, P2.3, P2.5, P2.7** were deferred/skipped with documented rationale in the
status doc's Final Decision table — pre-Postgres-migration production-hardening, not MVP
scope, per CLAUDE.md's "don't gold-plate" principle. Went through the full
model-orchestration TDD + adversarial-review cycle: implementation dispatched to Codex
(handoff doc `Docs/orchestration/correction-plan-round2-handoff.md`), round-1 review
returned REQUEST-CHANGES with 1 Medium finding (`compute_fund_vs_benchmark`'s
early-return guard checked only the switch-excluding transaction list before
`_fund_level_transactions()` was queried, so a switch-only household got zero fund
rows — the exact case P1.6 was meant to fix) and 1 Low finding (a test's `console.error`
spy not restored in `try`/`finally`), both fixed directly by the orchestrator and
confirmed via a scoped round-2 re-review returning **APPROVE, zero findings**. Full
backend suite: 418 passed, 2 skipped (was 413/2 pre-round). `tsc -b --noEmit` clean.
Full detail: `Docs/orchestration/delegation-log.md`'s `correction-plan-round2*` entries.

**Post-implementation performance assessment, DONE (2026-08-19):** before merging this
branch into `feat/enhanced-ui`, the user asked for a grounded check of the Analytics
dashboard's loading time, scalability, and efficiency across all sections, incorporating
everything fixed across this branch's history. Investigation only, no code changed — a
fresh re-read (not a memory recall) of every Analytics service file plus both
orchestration layers confirmed every original BUG-001 performance cause has a
verified-in-place fix: per-section independent fetch/loading in `AnalyticsView.tsx` (no
waterfall, no shared spinner — a slow section like Category Ranking/Scorer can never
block a fast one like Allocation/TER/Benchmark), a 15-minute category-wide TTL cache
shared across Category Ranking and Scorer, bulk/bounded SQL (`_bulk_nav_on_or_before`'s
per-target-date `GROUP BY`, Scorer's per-distinct-category-not-per-fund rescan)
replacing every previously-documented N+1 pattern, and a connection-pooled/single-flight-
deduplicated shared `httpx.AsyncClient` for NAV fetches. Two new, low-severity,
not-previously-flagged observations surfaced (not fixed, not blockers — optional
follow-ups per this file's "don't gold-plate" principle): `nse_indices_client.py` opens a
fresh `httpx.AsyncClient` per call instead of reusing a shared client like `nav.py` does,
and `scheme_universe.py`'s in-process memoization means its 24h disk-cache TTL is only
re-checked once per process lifetime. Full detail:
`Docs/orchestration/bug-001-data-001-post-implementation-performance-assessment.md`.

**First-login/signup dashboard load-time fix, merged (2026-08-18):** user-reported
follow-up to `dashboard-nav-perf-handoff.md` — first dashboard load right after
CAS-upload signup was still ~30s despite that earlier round of fixes. Root-caused two
independent, sibling bottlenecks via live benchmarking against the real `api.mfapi.in`
(network egress confirmed, not assumed):
1. **Dashboard NAV fetch** (`backend/app/services/dashboard/nav.py`) — `_fetch_nav_history`
   opened a brand-new `httpx.AsyncClient` per call, and its 3 real callers (background
   prefetch, `/holdings`, `/allocation`) raced on identical scheme codes with zero
   de-duplication. Fixed with a lazy double-checked-locked shared client
   (`httpx.Limits(max_connections=100, max_keepalive_connections=100)`) plus per-`amfi_code`
   single-flight dedup via an in-flight `asyncio.Task` registry (`asyncio.shield`-protected
   against a cancelled waiter cancelling the shared fetch).
2. **CAS-upload preview** (`backend/app/services/import_/{enrich,service}.py`) —
   `build_import_preview` resolved schemes in a fully sequential loop (no concurrency at
   all), `MfApiClient` opened a new client per call, and `get_scheme_category` fetched the
   *full* NAV-history endpoint just to read one metadata field (`/latest` returns the
   identical `meta` block with a tiny payload — live-confirmed). Fixed with a shared client,
   the `/latest` endpoint, and `asyncio.gather`-based concurrent resolution preserving input
   order. Live-benchmarked 7.74s → 0.31s (~25x) for 30 schemes.

Both fixes went through `model-orchestration`'s full Codex-dispatch + mandatory
adversarial-review gate cycle (2 review rounds each). The import-preview parallelization
review caught a genuine new race the naive `asyncio.gather` conversion introduced —
concurrent no-AMFI schemes could all stampede `get_scheme_list()`'s uncached first-fetch
path simultaneously (the old sequential loop had serialized this as a side effect) —
closed with a double-checked `asyncio.Lock`, confirmed by a second scoped re-review after
the first one returned a stale, contradicted-by-direct-read verdict (see
`skill-observations/log.md` Observation 2 in the stable Claude Code workspace project
folder — not tracked in this repo). Both branches merged into one combined branch
(`perf/dashboard-load-time`) and shipped as
[PR #4](https://github.com/ayushkarnawat/MVP_V1_MF_only/pull/4) against
`feat/enhanced-ui` — **merged 2026-08-18.** Full backend suite on the combined branch:
374 passed, 2 skipped, zero regressions. Handoff docs (full root-cause detail, rejected
alternatives, live-benchmark numbers): `Docs/orchestration/nav-fetch-connection-reuse-handoff.md`,
`Docs/orchestration/import-preview-concurrency-handoff.md`. All worktrees/branches/Codex
work clones from this task have been cleaned up — nothing left to prune.

**BUG-001 (Analytics dashboard hang) and DATA-001 (AUM/beta/TER/XIRR correctness)
investigations are complete — investigation only, no application code changed.**
Findings: `Docs/orchestration/bug-001-findings.md` (three independent performance
causes — TER's missing negative-cache full-feed refetch, Category Ranking's
sequential per-scheme loop with an unexplained alternating-timing pattern, and
Scorer's synchronous full-category-universe series build that never gets cheap on
repeat calls) and `Docs/orchestration/data-001-findings.md` (confirmed XIRR ×100
display bug — root cause of the ad-hoc "+0.10% XIRR looks wrong" complaint —
plus TER silent-zero handling, an unvalidated CAS-import name/AMFI-code pairing
risk, and Beta/AAUM-refresh both confirmed unimplemented). Both docs went through
`model-orchestration`'s full mandatory adversarial-review gate (9 findings, all
resolved). Shipped as [PR #3](https://github.com/ayushkarnawat/MVP_V1_MF_only/pull/3)
against `feat/enhanced-ui` — **merged 2026-08-17.** Two other PRs merged into
`feat/enhanced-ui` around the same time, unrelated to this work: PR #4
(dashboard/CAS-import perf, touches `nav.py`/`enrich.py`/`service.py`) and
BUG-002's dashboard-stuck-loading fix (PRs #1/#2, unrelated to Analytics,
already fixed — see `Docs/investigations/BUG-002-dashboard-return-loading.md`).
A follow-up doc-only pass re-verified the implementation prompt's fix items
2, 4, and 7 against PR #4's changes (only line numbers shifted, no
root-cause impact) and cross-referenced BUG-002, shipped as
[PR #5](https://github.com/ayushkarnawat/MVP_V1_MF_only/pull/5) — **merged
2026-08-18.** Nothing is blocking implementation anymore — the next session
should implement the fixes directly: a ready-to-paste implementation prompt
with priority order, per-fix file/line pointers, and constraints is saved
at `Docs/orchestration/bug-001-data-001-implementation-prompt.md`.

**Post-Phase-2 bug fixes, same day (2026-08-14):** once the Analytics frontend below
was merged and tested on localhost, four real bugs were found and fixed in sequence —
an AMFI TER feed crash (`d366af6`), a multi-minute Analytics dashboard hang from
sequential NAV fetching + single shared loading state (`15c03e1`), a deeper TER
"Data Unavailable" bug where AMFI's `data`/`meta` envelope was mis-parsed so **zero**
TER rows had ever actually been ingested despite the crash-fix appearing to resolve
things (`2c48723`), and a repeat-navigation loading-speed fix (`warm_nav_history` TTL
cache in `nav.py` + a 60s GET-response cache in `frontend/src/lib/apiClient.ts`, not
yet committed as of this writing — see `Docs/orchestration/dashboard-nav-perf-handoff.md`'s
"Round 5" section for full root-cause detail). Full narrative and verification numbers
for all four: `session.md`'s "Post-Phase-2 bug fixes" section.

**CAS Review screen "Unclassified" plan-type bug, same day (2026-08-14):** Direct-named
schemes were showing "Unclassified" on the Import Review screen despite the scheme name
saying "Direct Plan," inconsistently across otherwise-similar schemes. Root cause:
casparser's `Scheme.advisor` field can hold non-ARN placeholder text (e.g. a literal
`"DIRECT"`) printed by some AMC/RTA CAS templates for folios with no real distributor;
`parser.py` treated any non-empty `advisor` value as a genuine ARN, so FR-5's
name+ARN-disagreement rule wrongly fired. Fixed by validating `arn_code` actually
matches an `ARN-xxxx`/`INAxxxx` shape before treating it as a real distributor signal —
a single fix point that also prevents the same corruption in the Distributor Comparison
AMFI lookup. TDD (failing test first); backend suite 363 passed, 2 skipped. Not yet
committed as of this writing. Full detail: `session.md`'s "CAS Review screen
'Unclassified' plan-type bug" section.

**PRD-04 (Analytics) Phase 2 frontend is built via Google Antigravity (Gemini 3.6 Flash)**, reviewed
and fixed by Claude Code, on branch `feat/enhanced-ui`. Completes PRD-04 frontend with Fund &
Portfolio Scorer (FR-5/FR-6/FR-7), Benchmark Comparison (FR-8/FR-9), and Fund Score Detail Modal
(S20) across Web (S18/S19/S20) and Mobile (`MobileAnalyticsView.tsx`). Uses exact `Decimal`-string
arithmetic (`sumDecimalStrings`, `diffDecimalStrings`, `formatIndianCurrency` from
`frontend/src/lib/decimal.ts`), hand-rolled SVG/Tailwind chart primitives, and Radix `Dialog`
primitives. Zero bare numbers displayed; zero backend code modified. Claude Code's review found
both of the completion report's "clean" claims false — same failure mode as Phase 1 — 7 `tsc`
errors (unused imports/types, one invalid `Badge` variant), 3 failing tests (all ambiguous
`getByText` matches, a test-authoring bug not a UI bug), a High-severity `Decimal` violation
(`BenchmarkSection.tsx`'s Portfolio-vs-Index diff used float subtraction instead of the file's own
`diffDecimalStrings` pattern used elsewhere in the same file), a currency-formatting inconsistency,
and a missed-optimization (`FundScoreDetailModal`'s unused `initialData` prop forcing an avoidable
re-fetch on every open). All fixed directly. Final state: `tsc -b --noEmit` clean; full suite is
flaky at full-parallelism in this sandbox (different unrelated files crash on `vitest` worker-pool
timeouts each run — sandbox contention, not a regression) but every executed test passed across two
full runs (194/194, 192/192); a scoped run of all 5 analytics test files passed cleanly, 13/13
tests. Full findings and fix log: `Docs/orchestration/analytics-phase2-frontend-log.md`.

**PRD-04 (Analytics) Phase 1 frontend is built via Google Antigravity (Gemini 3.6 Flash)**, reviewed
and fixed by Claude Code, on git branch `feat/analytics-phase1` off `feat/enhanced-ui` (uncommitted
working-tree changes, no commits yet on that branch). Covers Allocation (FR-1/FR-2), Cost/TER
(FR-10/FR-11), Category Ranking (FR-3/FR-4) for Web (S18/S19) and Mobile (`MobileAnalyticsView.tsx`).
Reuses `AllocationDonut` unchanged; TER and Category Ranking use hand-rolled `<div>` bars, **not**
Bklit UI or `@visx` — Bklit was never actually used despite the brief calling for it, and installing
it properly (would overwrite `src/lib/utils.ts`, dropping `toTitleCase`) is deferred as a separate
task. Claude Code's review found and fixed a build-breaking bug (`formatIndianCurrency` imported
from `@/lib/decimal` but never exported there — confirmed crashing 3 test files at runtime, not just
a type error), 7 `tsc` errors, two float-subtraction-then-display spots (now exact `Decimal` string
arithmetic via a new `diffDecimalStrings` helper), an incidental deleted code comment, a flaky
un-`waitFor`-wrapped test assertion, and one stale pre-existing `App.test.tsx` assertion (expected
the mobile Analytics button disabled, from before this phase enabled it). `tsc -b --noEmit` clean;
full suite 51/51 files, 197/197 tests passing. Full findings and fix log:
`Docs/orchestration/analytics-phase1-frontend-log.md`. Phase 2 (Scorer/Benchmark comparison) briefed
separately, not yet dispatched — gated on this Phase 1 fix pass being accepted.

**PRD-04 (Analytics) backend is now fully complete — all 5 parts, including the
Scorer.** Category allocation (Part 1), AMFI TER+AAUM → weighted TER (Part 2), NSE
Indices → benchmark comparison (Part 3), category-universe ranking (Part 4), and the
Scorer — composite fund quality score, portfolio roll-up, full breakdown (Part 5,
FR-5/FR-6/FR-7) — are all built, tested, and merged. The Scorer was Ayush's one hard
product requirement: genuinely differentiated from Morningstar/CRISIL/PowerUp, not a
clone of any single agency's formula (fixed 45% Return / 30% downside-only Risk / 25%
rolling-12-month category-beat Consistency weighting, resolved 2026-08-13; full
methodology in `Docs/Scorer-Methodology-Unifolio.md`, a stakeholder-facing plain-language
doc, not just code comments). Delegated to Codex via `model-orchestration`; the mandatory
adversarial-review gate against the full branch diff caught 3 real findings (1 High:
`compute_portfolio_score` was redundantly re-scoring each held fund's full category
universe independently; 2 Medium: a Feb-29 `date.replace(year=...)` crash, a racy
check-then-insert on daily `FundScore` persistence) — all fixed in one round
(`d732fce`), confirmed via scoped re-review. **Backend suite: 357 passing, 2 skipped.**
Only PRD-04's *frontend* (the Analytics dashboard UI) remains unbuilt — nothing else is
outstanding on Analytics.

**Substantial intern-authored work has landed on `feat/enhanced-ui`/`dev_intern` and is
NOT yet independently code-reviewed by Claude Code** (unlike the Phase 3b Antigravity
redesign, which got a full review pass before merge — see below). This includes: the
shadcn/Tailwind UI foundation and mobile app shell; a full CAS import redesign (an
11-state import lifecycle engine + Alembic migration `0003`, coverage-gap detection,
opening-balance resolution, a CAMS-portal mailback URL generator, and matching frontend
lifecycle views — a two-path CAS import UI, coverage-gap banner, import history); and a
Badge/Select componentry refactor (Radix `Select` adopted across `ReviewTable`,
`AttributionModal`, `AddFamilyMembers`, mobile dashboard filters). Every commit here is
authored by the intern (`aditishanbhag`), not Claude Code or Ayush. **Verified passing
as a final branch-reconciliation check this session** — full suites green (357/2
backend, 190/190 frontend across 49 files, `tsc -b --noEmit` clean) — but "tests pass"
is not the same claim as "independently reviewed for correctness against CLAUDE.md's
non-negotiables (`Decimal`-never-`float`, no raw CAS PDF storage, no PAN persistence)."
The CAS import lifecycle engine in particular touches money/state-machine logic and has
had no Claude Code review pass yet — treat as an open item, not as verified-correct.

**Branch state: `dev_intern` and `feat/enhanced-ui` are identical**, both at `7426047`
(a merge commit reconciling the intern's own incoming push with this session's earlier
work). Confirmed via `git merge-base --is-ancestor` equivalence and matching `git log -1`
on both. **This sandbox has no git push credentials** — push both branches (already
fast-forward-mergeable, no force needed) from a machine that does. `main` remains
untouched, per standing instruction to hold off until the Analytics dashboard
(frontend) is complete.

**Knowledge graph is stale** — `.ua/knowledge-graph.json` was last refreshed at
`gitCommitHash 35fedd38f968e5b763269a67dbe8d16eff44e9ed` (**661 nodes / 1657 edges / 10
layers / 15 tour steps**), which predates the Scorer, the CAS import lifecycle redesign,
and the UI/Select refactor entirely. Re-run `/understand` (incremental) before trusting
it for anything in `analytics/scorer.py`, `analytics/risk_metrics.py`,
`import_/state_machine.py`, or the new frontend lifecycle views.

**Still open, carried forward from earlier phases, not yet revisited:**
1. A held scheme with no obtainable NAV silently vanishes from
   holdings/allocation/aggregates, no error or placeholder — a Phase 3
   design choice, worth revisiting once the "NAV unavailable" UI treatment is decided.
2. No DB uniqueness constraint on the "self" `household_members` row —
   frontend-mitigated client-side only; real fix is a migration (confirmed still
   missing — only migrations `0001`–`0003` exist, none touch this).
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
   Optimizations" section — revisit with `EXPLAIN ANALYZE` once Postgres is live.

**Everything before this — Phase 0 (foundation), Phase 1 (CAS import, backend +
frontend), Phase 2 (Auth backend), Phase 2b (Onboarding frontend), Phase 3 (Main
Dashboard backend), Phase 3b (Frontend UI Redesign via Google Antigravity, fully
reviewed — 39/104 failing tests and 6 `tsc` errors found and fixed, real bugs included
an accessibility regression and a silent member-misattribution risk in Add Data
re-entry), and Distributor Comparison (PRD-03 FR-11) — is complete, merged, and fully
detailed in `session.md`.** A full codebase knowledge graph exists at
`.ua/knowledge-graph.json` (see staleness note above) — query it instead of re-scanning
the repo from scratch, once refreshed.


