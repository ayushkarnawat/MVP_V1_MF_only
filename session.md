# Session state — 2026-08-05 (updated)

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

Test suites on `main` as of this session: **backend 92 passing** (2
postgres-marked deselected in this sandbox), **frontend 23 passing** — see
the pivot section below for what changed since the 80/23 counts at Phase 2
backend's completion.

**`origin/main` caught up to the Phase 2 backend merge at some point since**
(the earlier "6 commits ahead, no TTY to push" state is resolved — Ayush
must have pushed manually as suggested). `main` is now 2 commits ahead of
`origin/main` again (the doc pivot + auth-wiring fix below) — same no-TTY
limitation applies; push manually: `git push origin main`.

## Mid-Phase-2b scope pivot (2026-08-05): Family CAS Upload + landing screen

A team brainstorm (relayed by Ayush) surfaced real gaps in the Phase 2b
onboarding design mid-brainstorm. Instead of finishing the original "simple
Auth+Onboarding frontend" design, we stopped, updated the authoritative docs
first (per the project's doc-driven philosophy and Ayush's explicit "change
all and any files... official docs" authorization), then closed a related
backend gap, before resuming the frontend design. **Docs and the backend
piece are done; the frontend itself is not built yet — see "What's next."**

New requirements (now captured in the docs, not yet in code):
- A landing screen (Sign Up / Log In) before phone entry — phone entry is no
  longer the true first screen.
- Onboarding back-navigation: skipped questions must be genuinely
  revisitable, not just skippable.
- **Family CAS Upload flow**, inserted after Family Setup: one independent
  upload card per family member (status Not Uploaded/Uploaded), each
  member's upload/data never merges with or overwrites another's.
- After all members are handled: "Upload your own CAS?" (Upload Now / Upload
  Later).
- **Batch parse**: uploads queue client-side (not auto-parsed); a single
  "Parse Files" action parses every queued file, each staying mapped to its
  owning member; review/confirm is sequential, reusing the existing Import
  Review screen once per file — no new combined multi-member review UI.

**Docs updated and committed** (commit `ca1b985`):
- `Docs/PRDs/PRD-02-Signup-Onboarding.md` → v1.3: added FR-2b (landing
  screen), FR-7a (skip/revisit), and a new Family CAS Upload section
  (FR-10-FR-14).
- `Docs/PRDs/App-Flow-Unifolio.md` → v1.2: added S23 (Landing), S24 (Family
  CAS Upload), S25 (Upload My CAS? Now/Later), S26 (Parse Queue); updated
  Primary Flow and Onboarding Questionnaire diagrams; added a dedicated
  Family CAS Upload sub-flow diagram; documented onboarding back-navigation
  and per-item status.
- `Docs/PRDs/PRD-01-CAS-Parser-v2.md` → v1.4: cross-referenced FR-9 — the
  parse endpoint stays single-file; batching/sequencing is a frontend
  concern owned by PRD-02, not a new backend batch mode.

## Follow-up items surfaced during review

1. **DONE (commit `a33ca3c`): `/imports/parse` and `/imports/confirm` now
   require real auth.** Both routes take `Depends(get_current_user)`;
   `/confirm` validates `household_member_id` belongs to the authenticated
   user via a new `get_household_member_for_user()` scoped lookup in
   `backend/app/services/dashboard/household_members.py`, closing the IDOR
   gap. Also added in the same commit (needed regardless, and specifically
   needed by the Family CAS Upload sequential-confirm flow): `GET /auth/me`,
   and `PATCH /auth/me` can now set `onboarding_completed` (forward-only —
   first-completion-wins, no "un-complete" path). Backend suite: **92
   passing** (2 postgres-marked deselected).

   **Known consequence, not a bug:** the Phase 1b Import Review frontend has
   no login step yet, so it can no longer call these endpoints
   unauthenticated (it was relying on `backend/scripts/seed_dev_household_member.py`
   + a `VITE_DEV_HOUSEHOLD_MEMBER_ID` env var, neither of which mint a
   session token). This is expected to stay broken until the Phase 2b
   frontend (below) wires real login ahead of the import flow — that was
   always the plan, not a regression to chase separately. The dev-seed
   script itself is untouched and still works for creating dev fixtures
   manually.

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

**Phase 2b — Onboarding frontend, scope now includes the pivot above.** Not
started yet — design brainstorm is where this session left off. Must cover,
per the updated PRD-02 v1.3 / App-Flow v1.2:
- Landing screen (S23: Sign Up / Log In) before phone entry.
- The existing questionnaire UI (Trust Primer, Q1-Q4, family setup) —
  matches the Phase 1 → Phase 1b pattern, calling the auth endpoints Phase 2
  backend built.
- Onboarding back-navigation/revisit (FR-7a) — a history stack, not just
  forward-only skip.
- **Family CAS Upload subsystem** (S24-S26): per-member independent upload
  cards, "Upload My CAS? Now/Later", a client-side queue (File objects held
  in browser state until "Parse Files" is clicked — confirmed to need no new
  backend beyond what's already shipped), and **sequential** review/confirm
  reusing Phase 1b's existing `ReviewTable`/Import Review screens unchanged,
  once per queued file (user-confirmed decision, not a new combined-review
  UI).

PRD-02's Design Handoff Alignment section has the locked structural
requirements (no gamification mechanics, one flow not two, four questions +
family step in order, CAS import as the emotional payoff) plus the new item
#6 about the Family CAS Upload cards.

**Next concrete action:** resume the `superpowers:brainstorming` design pass
for Phase 2b — 2 sections were already approved before the pivot
(Architecture, part of Screens & Flow) but need revising to fold in S23 and
S24-S26; write the updated spec to
`Docs/superpowers/specs/2026-08-05-phase-2b-onboarding-frontend-design.md`,
get approval, then `writing-plans` → `subagent-driven-development`
(`fable` for implementer/reviewer dispatches by default, per the standing
model-cost policy).

**Also still open:**
- PRD-03 (Main Dashboard) and PRD-04 (Analytics) remain fully unbuilt and
  are the two modules after Onboarding in the natural build order.

## Context/token usage

Not tracked this session — run `/context` directly in the CLI if needed.
