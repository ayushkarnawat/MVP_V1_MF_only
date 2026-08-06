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

## Session State

*(Updated 2026-08-06. See `session.md` at repo root for full detail — this is the
one-paragraph pointer for a fresh session.)*

**Phase 0, Phase 1 (backend + frontend), Phase 2 (backend), Phase 2b
(Onboarding frontend), and Phase 3 (Main Dashboard backend) are all complete
and merged to `main`.** Phase 1 built CAS import end to end. Phase 2 backend
built phone+OTP auth and household-member CRUD, `get_current_user` as the
real security boundary. Phase 2b built the full Onboarding frontend —
landing screen, back-navigable questionnaire, and a Family CAS Upload
subsystem (per-member upload cards, client-side queue, strictly sequential
batch parsing, one aggregate payoff). Phase 3 built the Main Dashboard
backend (`backend/app/services/dashboard/`): a FIFO holdings engine with
hand-built known-answer test fixtures, on-demand NAV fetch-and-cache
(standing in for the real scheduled job, deployment-phase infra not built
yet), allocation/SIP/cash-flow/monthly-snapshot views, and placeholder-aware
family aggregation — 10 new `GET` routes, one implementation per concern
parameterized by a list of member IDs (no separate family/per-member code
paths). Test suites on `main`: backend 142 passing, frontend 81 passing
(17 files), `tsc -b --noEmit` clean.

**Both Phase 2b's and Phase 3's final whole-branch reviews caught real
issues before merge — full detail in `session.md`.** Phase 2b: 5 issues,
most notably a permanent onboarding dead-end and the family roster not
surviving a page reload. Phase 3: 3 real bugs, two rooted in already-shipped
Phase 1 parsing code — (1) `casparser` represents redemption/switch-out
units and amounts as **negative**; the parser passed them through
unnormalized, which would have made every real redemption a silent no-op in
the new FIFO engine (fixed at the root cause: `abs()` at the parser
boundary, your explicit call over defending in the engine); (2) same-date
transaction ordering was nondeterministic (`Transaction.id` is a random
UUID), so a same-day purchase+redemption could silently under-consume —
fixed with a purchase-before-redemption tiebreak, applied identically in
both the holdings engine and the snapshot backfill (which runs its own
separate query); (3) the final review caught a transient-NAV-outage bug
permanently caching a wrong snapshot value — fixed to stay retryable
instead.

**Not yet pushed** — `main` is ahead of `origin/main`; no TTY for
credentials in this sandbox, push manually.

**Transaction dedupe-key migration — resolved this session.** The
time-sensitive follow-up Phase 3's final review flagged (dedupe key
missing `type`, making a same-day purchase+redemption of equal magnitude
collide and silently drop after fix (1) above) is fixed and merged —
`transactions`' key is now `(folio_id, date, amount, units, type)` in the
migration, the ORM model, and `confirm_import`. Two real gaps found and
closed mid-execution: the ORM model needed widening too (this project's
test suite builds schema via `create_all`, not Alembic — the plan wrongly
assumed the two "agree by construction"), and the plan's own prescribed
SQLite migration approach (`PRAGMA index_list`) was fundamentally broken,
replaced with the documented Alembic pattern. Full detail in `session.md`.

**Still open:**
1. A held scheme with no obtainable NAV silently vanishes from
   holdings/allocation/aggregates, no error or placeholder — a Phase 3
   design choice, worth revisiting once the Phase 3 frontend decides the
   "NAV unavailable" UI treatment.
2. `confirm_import`'s plan-type override has no server-side 409 backstop —
   pre-existing Phase 1 backend code.
3. No DB uniqueness constraint on the "self" `household_members` row —
   Phase 2b's frontend mitigates client-side; real fix is a migration.

**ADR-001 — resolved.** Corrected via an Amendment section (Decision
unchanged) — the CAS Parser frontend was never existing React work.

**Distributor Comparison (PRD-03 FR-11) is next**, per explicit instruction
— was deferred out of Phase 3 during brainstorming, now scheduled as its
own small phase before the frontend. `arn_directory` already exists from
Phase 0. **Phase 3b (Main Dashboard frontend) follows** — the screens
consuming Phase 3's routes plus distributor comparison.
`DashboardPlaceholder` (`frontend/src/features/dashboard/`) is an
intentional stub to replace outright, not extend. PRD-04 (Analytics)
remains fully unbuilt beyond that.
