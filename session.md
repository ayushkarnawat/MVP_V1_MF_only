# Session state — 2026-08-05

Working notes for picking this project back up cold. Not a planning doc — see
`Docs/superpowers/plans/` for those. This file tracks *where things stand*,
gets overwritten each session, and isn't meant to accumulate history.

**Read this file, then `CLAUDE.md`'s Session State section, before re-deriving
anything by re-reading the whole repo.**

## Phase 1 (backend + frontend) and Phase 2 backend are complete, merged to `main`

**Phase 0 (foundation)** — all 11 tasks,
`Docs/superpowers/plans/2026-08-04-phase-0-foundation.md`.

**Phase 1 backend — CAS import tightening + monolith port.** All 9 tasks,
`Docs/superpowers/plans/2026-08-04-phase-1-cas-import-backend.md`. Ported the
CAS-parser prototype into `backend/app/services/import_/`, live at
`POST /imports/parse` / `POST /imports/confirm`. Whole-branch review caught
and fixed a real production bug (dedupe race hidden by a test/production
`autoflush` mismatch) plus a data-persistence defect.

**Phase 1b — Import Review frontend.** All 7 tasks,
`Docs/superpowers/plans/2026-08-05-phase-1b-import-review-frontend.md`
(design: `Docs/superpowers/specs/2026-08-05-import-review-frontend-design.md`).
Five-screen flow in `frontend/src/features/import/`, design tokens
(`frontend/src/styles/tokens.css`) and a shared `Badge` component
implementing `Design-Schema-Unifolio.md` for the first time. Every task
passed review with zero fix rounds.

**Phase 2 (backend) — Auth + Onboarding.** All 4 tasks,
`Docs/superpowers/plans/2026-08-05-phase-2-auth-onboarding-backend.md`
(design: `Docs/superpowers/specs/2026-08-05-phase-2-auth-onboarding-backend-design.md`).
Built on the schema Phase 0 already had (`otp_requests`, `sessions`,
`users`, `household_members` — no migration needed):
- `POST /auth/otp/request`, `POST /auth/otp/verify` (creates `User`+`Session`
  on first login), `POST /auth/session/refresh`, `PATCH /auth/me` (onboarding
  fields) — all in `backend/app/services/auth/` + `backend/app/api/auth.py`.
- `POST`/`GET /household-members`, scoped to the authenticated user — in
  `backend/app/services/dashboard/household_members.py` + a corrected
  `backend/app/api/dashboard.py` (Phase 0 had wrongly prefixed it
  `/dashboard/...`; `TDD-Unifolio.md`'s real API design has no service-name
  prefix on this endpoint — fixed).
- A `get_current_user` FastAPI dependency (bearer token → hash → `Session` →
  `User`) is the security boundary every authenticated route depends on —
  every write in this phase resolves the acting user from the token, never
  a client-supplied `user_id`.
- OTP delivery is a dev-only "stub" (echoes the OTP in the API response) —
  no SMS provider chosen yet. **Guarded**: `create_otp_request` raises if
  stub mode is active against a non-SQLite database, so this can't silently
  leak OTPs if ever pointed at a real deployment target by accident.
- A real, independently-reproduced bug surfaced and got fixed identically in
  two places: SQLite reads `DateTime(timezone=True)` columns back as
  **naive** datetimes, breaking comparisons against
  `datetime.now(timezone.utc)`. Fixed with a tag-without-shift
  (`.replace(tzinfo=timezone.utc)`, never `.astimezone()`) in both
  `services/auth/otp.py` and `services/auth/session.py` — verified
  instant-preserving, no-op on Postgres.
- Final whole-branch review ran on `sonnet` (bumped from the `fable` used for
  task-level work, given this is a security boundary) and came back "Ready
  to merge: With fixes" — one Important finding (see below), fixed and
  re-verified, zero residual findings.

All three branches: built via `superpowers:subagent-driven-development` in
isolated worktrees, merged locally to `main`, worktrees/branches cleaned up.
**Model policy for Phase 2 onward:** `fable` for implementer/reviewer
dispatches by default (user's explicit token-budget priority), `sonnet` only
when a task is genuinely security/complexity-sensitive enough to warrant it
(e.g. the Phase 2 final review) — not a blanket policy, a per-dispatch call.

Test suites on `main` as of this session: **backend 80 passing** (2
postgres-marked deselected in this sandbox), **frontend 23 passing**.

**Not yet pushed to GitHub** — `main` is 6 commits ahead of `origin/main`
(this sandbox has no TTY for HTTPS credentials, same limitation every
session). Push manually: `git push origin main`.

## Follow-up items surfaced during review, not yet actioned

1. **`/imports/confirm` still doesn't use the new auth system.** Phase 2
   built `get_current_user` and real sessions, but Phase 1's Import Service
   endpoints (`/imports/parse`, `/imports/confirm`) were not touched by this
   phase — they still take `household_member_id` from the request body via
   the Phase 1 dev-seed script (`backend/scripts/seed_dev_household_member.py`),
   not from a session token. The IDOR gap is technically still open on
   *those* endpoints specifically, even though the auth infrastructure to
   fix it now exists. Wiring `Depends(get_current_user)` into
   `backend/app/api/imports.py` (and removing the dev-seed dependency) is a
   small, well-scoped follow-up — not done yet.
2. **Plan-type override has no server-side backstop.**
   `backend/app/services/import_/service.py`'s `confirm_import` blocks a
   low-confidence AMFI match via `SchemeConfidenceError` (409) but silently
   accepts `plan_type=UNCLASSIFIED` with no equivalent check — the
   frontend's Confirm-gating is the *only* enforcement for plan type.
   Discovered in Phase 1b's review, still not fixed (pre-existing Phase 1
   backend code, outside every phase built since).
3. **Schema indexing gaps** (Phase 0, not any later phase's fault):
   `sessions.session_token_hash` and `otp_requests.phone_number` have no DB
   index — every authenticated request and every OTP request/verify does a
   full table scan. Needs a migration; harmless at current scale, worth
   fixing before any real load.
4. **Minor, low-priority items**, deferred rather than fixed (cosmetic/
   coverage, not correctness): `ReviewTable`'s `parse_warnings` list keys by
   raw string (collision risk on identical text); `POST /household-members`
   returns 200 not 201; `onboarding_step` accepts any string with no
   closed-set validation (reasonable until Phase 2b's UI locks the actual
   step names); a redundant `db.flush()` before `db.commit()` in
   `verify_otp_route`.

## What's next

**Phase 2b — Onboarding frontend.** The natural next step: the questionnaire
UI (Trust Primer, Q1-Q4, family setup) that calls the endpoints this phase
just built. Matches the Phase 1 → Phase 1b pattern. Needs its own
brainstorm/design pass — PRD-02's Design Handoff Alignment section has the
locked structural requirements (no gamification mechanics, one flow not
two, four questions + family step in order, phone+OTP first screen, CAS
import as the emotional payoff).

**Also worth doing, smaller, either before or alongside Phase 2b:**
- Follow-up #1 above (wire real auth into Import Service, retire the
  dev-seed script) — this is the natural moment, since Phase 2b's frontend
  will need to call `/auth/otp/verify` before `/imports/parse` anyway, so
  the dev-seed's reason for existing goes away regardless.
- PRD-03 (Main Dashboard) and PRD-04 (Analytics) remain fully unbuilt and
  are the two modules after Onboarding in the natural build order.

## Context/token usage

Not tracked this session — run `/context` directly in the CLI if needed.
