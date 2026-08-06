# Session state — 2026-08-06 (updated)

Working notes for picking this project back up cold. Not a planning doc — see
`Docs/superpowers/plans/` for those. This file tracks *where things stand*,
gets overwritten each session, and isn't meant to accumulate history.

**Read this file, then `CLAUDE.md`'s Session State section, before re-deriving
anything by re-reading the whole repo.**

## Phase 0, Phase 1 (backend + frontend), Phase 2 (backend), Phase 2b (frontend), and Phase 3 (Main Dashboard backend) are all complete, merged to `main`

**Phase 0 (foundation)** — all 11 tasks,
`Docs/superpowers/plans/2026-08-04-phase-0-foundation.md`.

**Phase 1 backend — CAS import tightening + monolith port.** All 9 tasks,
`Docs/superpowers/plans/2026-08-04-phase-1-cas-import-backend.md`. Ported the
CAS-parser prototype into `backend/app/services/import_/`, live at
`POST /imports/parse` / `POST /imports/confirm`.

**Phase 1b — Import Review frontend.** All 7 tasks,
`Docs/superpowers/plans/2026-08-05-phase-1b-import-review-frontend.md`.
Five-screen flow in `frontend/src/features/import/`, design tokens
(`frontend/src/styles/tokens.css`) and a shared `Badge` component.

**Phase 2 (backend) — Auth + Onboarding.** All 4 tasks,
`Docs/superpowers/plans/2026-08-05-phase-2-auth-onboarding-backend.md`.
Phone+OTP auth and household-member CRUD, all scoped to a `get_current_user`
bearer-session dependency.

**Phase 2b (Onboarding frontend) — 11 tasks + 1 final-review fix wave.**
`Docs/superpowers/plans/2026-08-06-phase-2b-onboarding-frontend.md`. Landing
screen, back-navigable questionnaire, solo CAS-upload path, and a full
Family CAS Upload subsystem — per-member upload cards, client-side queue,
strictly sequential batch parsing, one aggregate payoff screen. Final
review caught and fixed a permanent dead-end (a family user who skipped
every upload could never finish onboarding) plus 3 other real issues before
merge — see `CLAUDE.md`'s Session State for the short version, or `git log`
on that plan's commits for full detail.

**Phase 3 (Main Dashboard backend) — 7 tasks + 3 real bug fixes, all
complete.** Plan: `Docs/superpowers/plans/2026-08-06-phase-3-main-dashboard-backend.md`
(design: `Docs/superpowers/specs/2026-08-06-phase-3-main-dashboard-backend-design.md`).
Covers PRD-03 FR-1 through FR-10a — the first "view your portfolio" backend
in the app, built entirely on tables Phase 0 already created (no migration):

- **`backend/app/services/dashboard/nav.py`** — on-demand NAV fetch-and-cache,
  a new, separate client from Import Service's existing `mfapi.in` client
  (which explicitly scopes itself to scheme metadata, never valuation
  history). Stands in for the real scheduled EventBridge refresh job, which
  is deployment-phase infrastructure not built yet per this project's
  local-development-first non-negotiable.
- **`holdings.py`** — a FIFO (first-in-first-out) lot-tracking engine
  computing real holdings, realized/unrealized gains from parsed transaction
  history, with hand-built known-answer test fixtures (not just round-trip
  tests) given the algorithmic risk of getting real money math wrong.
- **`allocation.py`, `sip.py`, `cash_flow.py`, `snapshots.py`, `aggregate.py`**
  — shallow asset-class/AMC allocation (lives in Dashboard Service, not the
  unbuilt Analytics service — corrected a TDD documentation slip), active-SIP
  detection (40-day window), investment cash flow, monthly value snapshots
  (historically backfillable), and placeholder-aware family aggregation
  (a member with zero imports shows as a clear placeholder, per FR-10).
- **One implementation per concern** — every compute function takes
  `household_member_ids: list[uuid.UUID]`; the exact same code serves a
  single person's view and a family's combined view, never two code paths.
- 10 new `GET` routes in `backend/app/api/dashboard.py`, all behind
  `Depends(get_current_user)`; per-member routes additionally
  ownership-checked via the existing `get_household_member_for_user`.

Test suites on `main` as of this session: **backend 142 passing**, frontend
81 passing.

**Not yet pushed to GitHub** — `main` is ahead of `origin/main`; no TTY for
credentials in this sandbox, push manually (`git push origin main`).

## Three real bugs found and fixed during Phase 3's execution — read this before touching CAS import or the FIFO engine again

1. **Redemption/switch-out sign bug (root-caused to Phase 1, already-shipped
   code).** `casparser` (the underlying parsing library) represents
   redemption/switch-out transaction `units` and `amount` as **negative** —
   confirmed by reading the library's own balance-reconciliation source.
   `backend/app/services/import_/parser.py` passed these through
   unnormalized; the new FIFO engine assumes `units` is always a
   non-negative magnitude with `transaction.type` as the sole direction
   signal. Left unfixed, every real user's redemption would have silently
   become a no-op — holdings permanently inflated, realized gains always
   zero. **Fixed at the root cause**, per your explicit decision: `abs()` on
   both `amount` and `units` at the single parser normalization boundary,
   not defended against downstream in the FIFO engine.
2. **Same-date transaction ordering (found in Task 2, recurred in Task 6).**
   `Transaction.id` is a random `uuid4()`, so an `order_by(date, id)` query
   sorts same-day transactions in effectively random order — a same-day
   purchase and redemption could process out of order, silently
   under-consuming the redemption. Fixed with a secondary sort key (lot-adding
   types before lot-consuming types on the same date) in both `holdings.py`
   and `snapshots.py` (which runs its own separate transaction query reusing
   the same FIFO function) — verified structurally identical between the two,
   sharing one constant rather than two independently-maintained copies.
3. **Snapshot caching a permanent wrong value on a transient NAV outage.**
   Caught by the final whole-branch review: if a folio's NAV lookup failed
   for a given month (e.g. mfapi.in down on a member's very first snapshot
   request), the month's understated `total_value` was still persisted and
   cached forever — a transient outage becoming permanently wrong financial
   history. Fixed to skip and leave the month retryable instead.

## Transaction dedupe-key migration — resolved this session

Follow-up #1 above (dedupe key missing `type`) is fixed and merged
(`Docs/superpowers/plans/2026-08-06-transaction-dedupe-type-migration.md`,
2 tasks + a schema-doc fix). `transactions`' dedupe key is now
`(folio_id, date, amount, units, type)` everywhere it's defined: a new
migration (`0002`, `0001` stays frozen), the SQLAlchemy ORM model, and
`confirm_import`'s dedupe check. **A real gap in the plan itself was found
mid-execution and closed:** the plan assumed the ORM model and the
migration "agree by construction," but they're independently maintained in
this codebase — this project's test suite builds its schema via
`Base.metadata.create_all()`, not by running Alembic migrations, so the
model file (not just the migration) had to be widened too, or `confirm_import`'s
own new test would hit a real `IntegrityError` from the stale 4-column
constraint. Also: the plan's own prescribed SQLite migration code
(`PRAGMA index_list` to find a droppable constraint name) turned out to be
fundamentally broken — SQLite/SQLAlchemy reflection nulls out unnamed
constraints' names, so that approach could never work — fixed with the
documented Alembic pattern (`sa.inspect().get_unique_constraints()` +
`naming_convention` on `batch_alter_table`), verified via a full
upgrade→downgrade→re-upgrade cycle. `Database-Schema-Unifolio.md` (v1.2)
updated to match. Postgres path written carefully per the same pattern but
unverified at runtime — no live Postgres in this sandbox; the postgres
functional suite already smoke-runs `alembic upgrade head`, so it gets
exercised in CI even though not here.

## Follow-up items, not yet actioned

1. **A held scheme with no obtainable NAV silently vanishes** from
   holdings, allocation, and family aggregates — no row, no error, no
   placeholder. Matches the plan's own code (a stated design choice, not an
   implementation slip), flagged by Phase 3's final review as worth
   deciding properly once the Phase 3 frontend is built (where the "NAV
   unavailable" UI treatment gets decided anyway).
2. **Plan-type override has no server-side 409 backstop.** Pre-existing
   since Phase 1 backend, still open.
3. **No DB uniqueness constraint on the "self" `household_members` row.**
   Phase 2b's frontend mitigates client-side (list-then-create); a real fix
   is a backend migration. Pre-existing, still open.
4. Various Minor items from Phase 3's task reviews, none blocking:
   `average_nav`/snapshot `total_value` unquantized in API responses (up to
   28 significant digits); over-redemption silently swallowed with no log;
   `date.today()` is server-local, not IST-aware (matters once deployed);
   a few sibling routes missing a cross-user-404 test that an identical,
   already-tested route has.

## What's next

**Distributor Comparison (PRD-03 FR-11)** is next, per your explicit
instruction — was originally deferred out of Phase 3 during brainstorming
(external AMFI ARN-lookup dependency, own risk profile), now scheduled as
its own small follow-up phase before the frontend. `arn_directory` (the
caching table) already exists from Phase 0.

**Phase 3b (Main Dashboard frontend)** comes after Distributor Comparison —
the screens consuming the now-11 (10 + distributor comparison) routes
(App-Flow-Unifolio's S13-S17, S21-S22: per-member/family-aggregate
dashboard, fund detail, distributor comparison, Add Data re-entry, empty
states). Needs its own design brainstorm.

**PRD-04 (Analytics)** remains fully unbuilt, the module after Main
Dashboard in the natural build order.

## Context/token usage

Not tracked this session — run `/context` directly in the CLI if needed.
