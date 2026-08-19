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

*(Updated 2026-08-19. See `session.md` at repo root for the full detailed history —
this section is a current-status pointer, not the record of every past session.)*

**"This Month" SIP tab feature, Tasks 6-8 (frontend), review gate closed
(2026-08-19):** implements the frontend half of
`Docs/superpowers/plans/2026-08-18-active-sips-cadence-redesign.md` (Tasks
1-5, backend, already `DONE`) — a month-scoped SIP view alongside the
existing Upcoming SIPs list on `DashboardView.tsx`, with a `role="tablist"`
switcher between them. Went through the model-orchestration skill's full
mandatory adversarial-review gate across three rounds: round 0 found 2
Medium + 1 Low (a section-visibility gate that hid the tab switcher
whenever there were no upcoming SIPs, stale monthly rows rendering during
a fetch, missing tab ARIA semantics), fixed at `eeaade0`; round 1's scoped
re-review of that fix found the loading-flash fix was incomplete
(`setMonthlySipsLoading(true)` lived inside a `useEffect`, which fires
after the paint that already shows the new month — one stale frame still
got through) plus a missing `role="tabpanel"` wiring, both fixed at
`8be5230` (the flash fix moved the `setState` call into the synchronous
`onClick` handler so it batches with `setSipMonth` into one render, rather
than reaching for `useLayoutEffect`); round 2's re-review found one
remaining Low (the inactive tab's `aria-controls` IDREF points at a
tabpanel `id` that isn't mounted in the DOM, since only the active panel
renders) — accepted as a documented limitation per explicit user
instruction (fix only if it's a loading/efficiency/scaling issue; this is
a synchronous client-side ARIA-markup gap with no fetch path involved) and
the skill's stopping heuristic (lower severity than round 0, correctness-
safe, a real fix means always-mounting both panels — a bigger structural
change than the finding warrants). Both fix rounds were applied directly
by the orchestrator (not re-delegated to Codex) per the skill's
"Review-loop fix authorship" rule, since both diffs were small and the
touched file was already in context. Full frontend suite independently
verified clean on the closing round: 55/55 files, 218/218 tests, zero
regressions. **Tasks 6-8 review gate: DONE**, final scope `9e25017..8be5230`,
closing commit `a148d42` (also documents the accepted ARIA gap in this
file's "Still open" list, item 5, and mirrors it in
`DEFERRED_FEATURES.md`'s appendix). Full round-by-round detail:
`Docs/orchestration/delegation-log.md`'s 2026-08-19 entries;
`Docs/orchestration/active-sips-frontend-handoff.md`'s `Status` line has
the same summary. Nothing outstanding on this feature.

**`model-orchestration` skill updated to v1.4 (2026-08-19):** added a
mandatory cheap-probe-before-expensive-setup pre-step to
`delegation-rules.md` (write a file, `git add`, `git commit` against any
new Codex dispatch location, before paying a large dependency-tree copy
cost) and documented that `git add`/`git commit` fail inside this
project's `codex:codex-rescue` sandbox even when ordinary source-tree
writes succeed (confirmed across two independent sessions/directories —
scoped as a limitation of this environment's configuration, not a
universal Codex constraint). Codified the resulting default worker split:
Codex implements and self-tests; the orchestrator always handles
staging/commits/merges/worktree management; Codex stays the default
worker for read-only review/adversarial-review regardless, since those
make no file changes. Also added an explicit independent-verification
rule for agent completion (`git log`/`git diff`/tests) whenever a
dispatched agent's terminal notification is missing, premature, or
contradictory. Full changelog entry: `SKILL.md`'s v1.4 note.

**Two Analytics Dashboard methodology docs exist, uncommitted until this
session, awaiting stakeholder sign-off — not a Claude Code review-gate
item:** `Docs/Analytics-Dashboard-Formula-Implementation-Review.md` (a
stakeholder/CA-facing plain-language explanation of every analytics
calculation — AUM, allocation, TER, XIRR, benchmark comparison, the
Scorer — with a literal "Reviewed by" sign-off line) and
`Docs/Analytics-Dashboard-Internal-Correction-Plan.md` (its internal
companion: a prioritized P0/P1 correction plan, including the confirmed
XIRR ×100 display bug from `Docs/orchestration/data-001-findings.md`,
with its own explicit "Completion gate" requiring financial/product-owner
sign-off before any item counts as done). Both predate this session's SIP
tab work — the Correction Plan was last touched earlier today, the
Review doc yesterday — but were never linked from `session.md`,
`CLAUDE.md`, or `delegation-log.md` until now. They're a **planning/
sign-off artifact, not yet an implementation task** — `Docs/orchestration/
bug-001-data-001-implementation-prompt.md` remains the ready-to-paste
prompt for the next session that actually implements DATA-001's fixes;
these two docs are the stakeholder-facing paper trail that should sit
alongside that work, not replace it. Worth reconciling the two the next
time DATA-001 implementation starts, in case the Correction Plan's P0
list has diverged from the implementation prompt's fix list.

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
2. `confirm_import`'s plan-type override has no server-side 409 backstop —
   pre-existing Phase 1 backend code.
3. No DB uniqueness constraint on the "self" `household_members` row —
   frontend-mitigated client-side only; real fix is a migration (confirmed still
   missing — only migrations `0001`–`0003` exist, none touch this).
4. `HoldingsTable.tsx` references a dead `row.return_percentage_1y` field that doesn't
   exist on the real API type — harmless (client-computed fallback always runs), never
   cleaned up.
5. `DashboardView.tsx`'s SIP Upcoming/This Month segmented control (`sip-tab-upcoming`/
   `sip-tab-month`) always renders both tab buttons' `aria-controls` IDs, but only the
   active tab's `role="tabpanel"` actually exists in the DOM — the inactive tab's
   `aria-controls` points at an ID that doesn't resolve, an incomplete ARIA tabs IDREF
   pattern. Confirmed via a second scoped Codex adversarial-review round
   (2026-08-19, `active-sips-cadence-redesign` branch, commit `8be5230`) after two
   earlier rounds closed a stale-row-flash bug and the missing tabpanel wiring itself.
   Accepted as a documented limitation rather than a third fix round, per the
   model-orchestration skill's stopping heuristic — negligible real-world screen-reader
   impact since the tab/panel pairing is already correctly conveyed via
   `role`/`aria-selected`/`aria-labelledby` on the panel that does exist, and a full fix
   means always mounting both panels (one `hidden`) instead of one conditionally-rendered
   panel, which also touches the lazy monthly-SIP-fetch trigger (the `sipTab !== "month"`
   early-return in `DashboardView.tsx`'s fetch effect) — a bigger structural change than
   proportionate to a Low finding. Revisit only if a real accessibility-audit or user
   complaint surfaces it as an actual usability problem. Full review-round detail:
   `Docs/orchestration/delegation-log.md`'s 2026-08-19 entries.

**Everything before this — Phase 0 (foundation), Phase 1 (CAS import, backend +
frontend), Phase 2 (Auth backend), Phase 2b (Onboarding frontend), Phase 3 (Main
Dashboard backend), Phase 3b (Frontend UI Redesign via Google Antigravity, fully
reviewed — 39/104 failing tests and 6 `tsc` errors found and fixed, real bugs included
an accessibility regression and a silent member-misattribution risk in Add Data
re-entry), and Distributor Comparison (PRD-03 FR-11) — is complete, merged, and fully
detailed in `session.md`.** A full codebase knowledge graph exists at
`.ua/knowledge-graph.json` (see staleness note above) — query it instead of re-scanning
the repo from scratch, once refreshed.


