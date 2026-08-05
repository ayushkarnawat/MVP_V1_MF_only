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

*(Updated 2026-08-05. See `session.md` at repo root for full detail — this is the
one-paragraph pointer for a fresh session.)*

**Phase 0, Phase 1 (backend + frontend), and Phase 2 (backend) are all
complete and merged to `main`.** Phase 1 built CAS import end to end
(`backend/app/services/import_/`, `frontend/src/features/import/`). Phase 2
backend built phone+OTP auth (`backend/app/services/auth/`,
`POST /auth/otp/request|verify`, `GET`/`PATCH /auth/me`,
`POST /auth/session/refresh`) and household-member CRUD
(`backend/app/services/dashboard/household_members.py`,
`POST`/`GET /household-members`) — a `get_current_user` FastAPI dependency
is the real security boundary for authenticated endpoints, resolving the
acting user strictly from a bearer session token, never a client-supplied
id. Test suites on `main`: backend 92 passing, frontend 23 passing.

**Mid-Phase-2b scope pivot (2026-08-05):** a team brainstorm surfaced real
gaps in the onboarding design — a landing (Sign Up/Log In) screen before
phone entry, revisitable/back-navigable onboarding questions, and a **Family
CAS Upload** flow (per-member independent upload cards, never merged; a
client-side upload queue; a single "Parse Files" batch action; sequential
review/confirm reusing the existing Import Review screen once per file).
Docs updated first, then a backend gap the new flow depends on:
- **Docs, done and committed:** `PRD-02-Signup-Onboarding.md` v1.3 (new FR-2b,
  FR-7a, FR-10-FR-14), `App-Flow-Unifolio.md` v1.2 (S23-S26 + new diagrams),
  `PRD-01-CAS-Parser-v2.md` v1.4 (cross-reference note only).
- **Backend, done and committed:** `/imports/parse` and `/imports/confirm`
  now require `Depends(get_current_user)`; `/confirm` validates
  `household_member_id` belongs to the caller (closes the IDOR gap noted
  below); added `GET /auth/me`; `PATCH /auth/me` can now set
  `onboarding_completed` (forward-only). **Known consequence:** the Phase 1b
  Import Review frontend has no login step yet, so it can't call these
  endpoints until Phase 2b's frontend wires real auth in — expected, not a
  regression.

**Not yet pushed** — `main` is 2 commits ahead of `origin/main` (the doc
pivot + auth-wiring fix above); `origin/main` did catch up to the earlier
Phase 2 backend merge at some point this session. No TTY for credentials in
this sandbox; push manually.

**Resolved / still open:**
1. ~~`/imports/confirm` had no ownership check (IDOR)~~ — fixed, see above.
2. `confirm_import`'s plan-type override has no server-side 409 backstop
   (unlike the AMFI-confidence check) — still open, pre-existing Phase 1
   backend code untouched since.

**ADR-001 — resolved.** Corrected via an Amendment section (Decision
unchanged) — the CAS Parser frontend was never existing React work.

**Phase 2b (Onboarding frontend) is next, scope now includes the pivot
above** — not started. Needs a design brainstorm covering the landing
screen, back-navigation, and the full Family CAS Upload subsystem (queue,
batch parse, per-member cards, sequential reuse of `ReviewTable`) before
`writing-plans` → `subagent-driven-development`. PRD-03 (Main Dashboard) and
PRD-04 (Analytics) remain fully unbuilt beyond that.
