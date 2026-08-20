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

*(Updated 2026-08-20. See `session.md` at repo root for the full detailed history —
this section is a current-status pointer, not the record of every past session.)*

**Auth, Onboarding, Validation, Visual Experience, Mobile Auth & CAS Import Flow Redesign (v2) are 100% complete on branch `authsetup`.**
Executed and verified across recent sessions:
- **Mobile Auth Header Typography & Spacing (`AuthShell.tsx`)**: Scaled up mobile brand text (`text-2xl`), logo glyph (`w-5 h-5`), mobile headline (`text-xl`), and subtext (`text-sm`). Balanced vertical spacing (`mt-2 mb-auto lg:my-auto`) to remove the excessive blank gap between the subtext and form inputs on mobile screens.
- **Auth Input & OTP Layout Responsiveness (`otp-input.tsx`, `AuthShell.tsx`, `PhoneEntry.tsx`, `EmailEntry.tsx`)**: Made OTP cells (`flex-1 min-w-0 max-w-[44px] sm:max-w-[48px]`) and input containers fully responsive on 320px–360px mobile viewports up to desktop screens. Removed container-level `overflow-hidden` clipping focus rings (`ring-2 ring-[var(--color-accent)]/20`).
- **Auth Navigation Flow Fix (`AuthEntryFlow.tsx`, `Landing.tsx`, `AuthEntryFlow.test.tsx`)**: Fixed navigation flow so tapping "Change Email" or "Change Phone Number" during login returns to Login entry and backing out returns to the Login page (rather than defaulting to Signup). Preserved Signup flow behavior returning to Signup. 61/61 test files passing.
- **Global Mobile UI/UX Optimization Pass**: Reengineered all mobile screens across onboarding (`Q2Investing.tsx`, `Q3Purpose.tsx`, `Q4Household.tsx`, `TrustPrimer.tsx`), auth (`AuthShell.tsx`), and CAS import (`ImportPathChoice.tsx`, `UploadForm.tsx`, `MobileReviewView.tsx`) to be viewport-aware (320px–375px+). Compacted container vertical spacing (`space-y-3 sm:space-y-5`) and illustration footprints (`w-14 h-14 sm:w-24 sm:h-24`) so decision screens fit 100% inside single viewports without scrolling. Converted choice cards into compact, touch-friendly horizontal cards (`p-2.5 sm:p-3.5`, `min-h-[44px]` targets). Preserved desktop layouts (`lg:`) and all business/API logic completely.
- **CAS Import Flow Illustration-Led Redesign (v2)**: Built the approved entry choice screen (`ImportPathChoice.tsx`) with `<OnboardingIllustration variant="upload" />` hero and choice cards ("Request from CAMS" & "Already have a statement"), refactored `TwoPathImportContainer.tsx` to the `view: "choice" | "request" | "waiting" | "upload" | "history"` model (removing the tab bar), updated `RequestCamsPath.tsx` with consolidated reference card and 3 guided steps transitioning to `waiting`, added back-navigation to `UploadForm.tsx`, restructured `WaitingForCasView.tsx` with collapsed disclosure, migrated `CoverageGapBanner.tsx` to shadcn Button and Tailwind tokens, and established full mobile parity in `MobileImportView.tsx`, `MobileRequestCamsView.tsx`, and `MobileUploadForm.tsx`.
- **Left Auth Showcase Panel Redesign (`AuthShowcasePanel.tsx`)**: Scaled SVG vector wealth architecture asset with responsive containment and unit tests.
- **Comprehensive Auth Validation Engine (`validation.ts`, `validation.test.ts`)**: 30/30 tests passing. Structural email validation, extension reminders, intelligent typo suggestions (e.g. `gmial.com` -> `"Did you mean name@gmail.com?"`), Indian mobile phone validation (10-digit, 6-9 prefix, no decimals/chars) with canonical normalization (`+91XXXXXXXXXX`), dynamic live recovery on blur/change, and friendly error translation (`formatAuthErrorMessage`).
- **Hand-Drawn Hero Illustrations & Option Cards**: Integrated transparent high-res PNGs with subtle Unifolio green accents into `OnboardingIllustration.tsx` with light/dark theme parity and ambient glow. Bespoke hand-drawn option card SVGs in `Q4Household.tsx` and `TrustPrimer.tsx`.
- **Frontend Verification**: **All test suites passing** (272/272 unit tests across 59 test files), `oxlint` clean, `npx tsc -b` clean (0 errors), `npm run build` clean.

**PRD-04 (Analytics) backend is fully complete — all 5 parts, including the Scorer.** Category allocation (Part 1), AMFI TER+AAUM → weighted TER (Part 2), NSE
Indices → benchmark comparison (Part 3), category-universe ranking (Part 4), and the
Scorer — composite fund quality score, portfolio roll-up, full breakdown (Part 5,
FR-5/FR-6/FR-7) — are all built, tested, and merged. Fixed 45% Return / 30% downside-only Risk / 25%
rolling-12-month category-beat Consistency weighting; full methodology in `Docs/Scorer-Methodology-Unifolio.md`.
Only PRD-04's *frontend* (the Analytics dashboard UI) remains unbuilt — ready for Claude Code to execute.

**Substantial intern-authored work on CAS Import Lifecycle is on `feat/enhanced-ui`/`dev_intern`**:
Includes an 11-state import lifecycle engine + Alembic migration `0003`, coverage-gap detection,
opening-balance resolution, and matching frontend lifecycle views.

**Still open, carried forward from earlier phases, not yet revisited:**
1. A held scheme with no obtainable NAV silently vanishes from
   holdings/allocation/aggregates, no error or placeholder — a Phase 3
   design choice, worth revisiting once the "NAV unavailable" UI treatment is decided.
2. `confirm_import`'s plan-type override has no server-side 409 backstop —
   pre-existing Phase 1 backend code.
3. No DB uniqueness constraint on the "self" `household_members` row —
   frontend-mitigated client-side only; real fix is a migration.
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


