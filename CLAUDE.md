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

## Session State

*(Updated 2026-08-14. See `session.md` at repo root for the full detailed history —
this section is a current-status pointer, not the record of every past session.)*

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

**Everything before this — Phase 0 (foundation), Phase 1 (CAS import, backend +
frontend), Phase 2 (Auth backend), Phase 2b (Onboarding frontend), Phase 3 (Main
Dashboard backend), Phase 3b (Frontend UI Redesign via Google Antigravity, fully
reviewed — 39/104 failing tests and 6 `tsc` errors found and fixed, real bugs included
an accessibility regression and a silent member-misattribution risk in Add Data
re-entry), and Distributor Comparison (PRD-03 FR-11) — is complete, merged, and fully
detailed in `session.md`.** A full codebase knowledge graph exists at
`.ua/knowledge-graph.json` (see staleness note above) — query it instead of re-scanning
the repo from scratch, once refreshed.


