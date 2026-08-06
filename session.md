# Session state — 2026-08-06 (updated)

Working notes for picking this project back up cold. Not a planning doc — see
`Docs/superpowers/plans/` for those. This file tracks *where things stand*,
gets overwritten each session, and isn't meant to accumulate history.

**Read this file, then `CLAUDE.md`'s Session State section, before re-deriving
anything by re-reading the whole repo.**

## Phase 0, Phase 1 (backend + frontend), Phase 2 (backend), and Phase 2b (frontend) are all complete, merged to `main`

**Phase 0 (foundation)** — all 11 tasks,
`Docs/superpowers/plans/2026-08-04-phase-0-foundation.md`.

**Phase 1 backend — CAS import tightening + monolith port.** All 9 tasks,
`Docs/superpowers/plans/2026-08-04-phase-1-cas-import-backend.md`. Ported the
CAS-parser prototype into `backend/app/services/import_/`, live at
`POST /imports/parse` / `POST /imports/confirm`.

**Phase 1b — Import Review frontend.** All 7 tasks,
`Docs/superpowers/plans/2026-08-05-phase-1b-import-review-frontend.md`.
Five-screen flow in `frontend/src/features/import/` (`UploadForm`,
`ParsingIndicator`, `ReviewTable`, `ImportError`, `ImportConfirmed`), design
tokens (`frontend/src/styles/tokens.css`) and a shared `Badge` component.

**Phase 2 (backend) — Auth + Onboarding.** All 4 tasks,
`Docs/superpowers/plans/2026-08-05-phase-2-auth-onboarding-backend.md`.
Phone+OTP auth (`POST /auth/otp/request|verify`, `GET`/`PATCH /auth/me`,
`POST /auth/session/refresh`) and household-member CRUD
(`POST`/`GET /household-members`), all scoped to a `get_current_user`
bearer-session dependency.

**Mid-Phase-2b scope pivot (2026-08-05):** a team brainstorm added a landing
screen (Sign Up/Log In) before phone entry, onboarding back-navigation/revisit
(FR-7a), and a full **Family CAS Upload** subsystem — per-member independent
upload cards, a client-side upload queue, a single "Parse Files" batch action,
sequential review/confirm reusing the existing Import Review screens once per
file. Docs updated first (`PRD-02-Signup-Onboarding.md` v1.3,
`App-Flow-Unifolio.md` v1.2, `PRD-01-CAS-Parser-v2.md` v1.4 cross-reference),
then a backend prerequisite: `/imports/parse`/`/imports/confirm` wired to
real auth (`get_current_user`, IDOR ownership check via a new
`get_household_member_for_user` scoped lookup), `GET /auth/me` added,
`PATCH /auth/me` extended to set `onboarding_completed`.

**Phase 2b (Onboarding frontend) — 11 tasks + 1 final-review fix wave, all
complete.** Plan: `Docs/superpowers/plans/2026-08-06-phase-2b-onboarding-frontend.md`
(design: `Docs/superpowers/specs/2026-08-06-phase-2b-onboarding-frontend-design.md`).
Built entirely in `frontend/src/features/auth/` (new) plus small, scoped
touches to already-shipped `frontend/src/features/import/` files:

- **Session layer:** `lib/apiClient.ts` (shared `ApiError`/`parseErrorDetail`,
  extracted from Phase 1b's `import/api.ts`), `auth/session.ts` (token
  storage), `auth/api.ts` (all backend calls), `AuthContext.tsx`/`useAuth()`
  (session resume via `GET /auth/me`, `login`/`logout`/`updateMe`) —
  `App.tsx` is now a pure composition root: no session → `AuthEntryFlow`;
  session + onboarding incomplete → `OnboardingFlow`; session + complete →
  `DashboardPlaceholder` (a stub — PRD-03's real dashboard is a separate,
  unbuilt phase).
- **Auth entry (S23-S1):** `Landing.tsx` (Sign Up/Log In, both leading to the
  identical phone+OTP flow per FR-2b), `PhoneEntry.tsx`, `OtpVerify.tsx`,
  composed by `AuthEntryFlow.tsx`.
- **Questionnaire (S2-S7):** `onboardingHistory.ts` — a pure, fully unit-tested
  history-array reducer (`goNext`/`goBack`/`skipToNext`/`markAnswered`) is
  what makes FR-7a's back-navigation/revisit real, not just forward-skip.
  `OnboardingFlow.tsx` is a thin wrapper around it, rendering `TrustPrimer`,
  `Q1Name`...`Q4Household`, `AddFamilyMembers`. Q2/Q3 answers persist to
  `PATCH /auth/me` (`investor_type`/`primary_goal`) as each is answered.
- **Solo CAS path (S8):** `SoloCasUpload.tsx` resolves the account holder's
  own `household_members` row via **list-then-create** (never blind-create —
  there's no `PATCH /household-members`, so a mid-onboarding reload must
  reuse the existing row, not duplicate it), then reuses Phase 1b's
  `ImportFlow` unchanged except two new optional props (`ctaLabel`, `onDone`)
  that let onboarding end with "Continue" → `onboarding_completed: true`
  instead of resetting to a blank upload form (S16's Ongoing Data Addition
  keeps its original default behavior).
- **Family CAS Upload (S24-S26):** `FamilyCasUpload.tsx` (per-member
  Not-Uploaded/Uploaded cards), `UploadMyCas.tsx` (Now/Later), `ParseQueue.tsx`,
  orchestrated by `FamilyImportFlow.tsx` — fetches its roster live from
  `GET /household-members` (not a prop, so it's resume-safe), queues files
  client-side without auto-parsing, processes the queue **strictly
  sequentially** (never parallel — the backend's in-memory preview-session
  store isn't safe under concurrent parses) by calling `parseImport`/
  `confirmImport`/`ReviewTable`/`ImportError` directly, and shows **one
  aggregate `ImportConfirmed`** at the end (not once per member — a
  deliberate product decision from design review).

Test suites on `main` as of this session: **backend 92 passing**, **frontend
81 passing** (17 files), `tsc -b --noEmit` clean.

**Not yet pushed to GitHub** — `main` is ahead of `origin/main` (this sandbox
has no TTY for HTTPS credentials, the same limitation every session). Push
manually: `git push origin main`.

## What the final whole-branch review caught (all fixed, not deferred)

Every task passed its own task-scoped review; the final review (dispatched on
the most capable available model, per the session's model policy) caught five
issues only visible from the whole-branch view, all fixed in one combined
wave before merge:

1. **Critical:** a family-onboarding user who skipped every member and chose
   "Upload Later" with nothing queued hit a permanent dead end (disabled
   "Parse Files", no other control, `onboarding_completed` never set).
2. Resuming into the family path showed zero member cards — the roster came
   from `OnboardingFlow`'s local React state (a prop), which doesn't survive
   reload. Fixed by having `FamilyImportFlow` fetch its own roster from the
   backend on mount instead — this also fixed #1 (empty queue → straight to
   the aggregate "done" screen).
3. Q2/Q3 answers (`investor_type`/`primary_goal`) were captured locally but
   never sent to `PATCH /auth/me` — silently dropped despite the backend
   columns already existing.
4. The family path's Confirm button had no in-flight guard (hardcoded
   `confirming={false}`), unlike the solo path — a double-click could race
   two `confirmImport` calls and misattribute a stale error notice to the
   wrong member's screen.
5. React StrictMode's dev-mode double-invoked mount effect could create two
   `relationship: "self"` household-member rows in `SoloCasUpload` — fixed
   with a `resolvingRef`/`mountedRef` guard pair (one implementer
   self-correction mid-fix: the initially-instructed guard shape would have
   deadlocked the component under StrictMode's synchronous mount→cleanup→
   remount; caught by an actual failing test run, then independently
   re-verified by the re-reviewer with an empirical probe, not just
   reasoning).

Both the review and the fix-wave re-review ran on the most capable available
model given the stakes (a merge gate, and one genuinely subtle React
lifecycle bug). Five residual Minor items were logged and left as-is (odd
"0 new transactions" copy on the empty-import path, no in-app retry on a
roster-fetch failure, a momentarily-stale `me` object under concurrent
`updateMe` calls, an unhandled rejection if the final `onboarding_completed`
PATCH fails, an inert effect dependency) — none block correctness.

## Follow-up items, not yet actioned

1. **Plan-type override has no server-side backstop.**
   `backend/app/services/import_/service.py`'s `confirm_import` blocks a
   low-confidence AMFI match via `SchemeConfidenceError` (409) but silently
   accepts `plan_type=UNCLASSIFIED` with no equivalent check — the
   frontend's Confirm-gating is the *only* enforcement for plan type.
   Pre-existing since Phase 1 backend, still open.
2. **Schema indexing gaps** (Phase 0, not any later phase's fault):
   `sessions.session_token_hash` and `otp_requests.phone_number` have no DB
   index. Needs a migration; harmless at current scale.
3. **No server-side uniqueness constraint on the "self" household-member
   row** (`household_members(user_id) WHERE relationship = 'self'`) — the
   frontend's list-then-create pattern is a client-side mitigation only;
   two browser tabs or overlapping devices could still race a duplicate.
   Surfaced during Phase 2b's final review; a DB constraint is the real fix.
4. **`OnboardingFlow.tsx`'s step-persist effect has no `.catch`** on its
   `updateMe` call — a transient network failure becomes an unhandled
   promise rejection (console warning only, no crash; worst case is a stale
   resume step next session). Same pattern exists in `SoloCasUpload`'s and
   `FamilyImportFlow`'s `onboarding_completed` PATCH on the final "Continue"
   click. Minor, flagged twice during Phase 2b review, not yet fixed.
5. Various Minor UI polish items from Phase 2b's task reviews (never
   blocking): `Q1Name`'s duplicate visible label text, wording inconsistency
   between two different "skip" button labels, a stale OTP-verify error that
   persists across "Resend code", missing `role="alert"` on one error
   message where a sibling component has it, no in-app retry on a
   roster-fetch failure.

## What's next

**PRD-03 (Main Dashboard) and PRD-04 (Analytics) remain fully unbuilt** — the
two modules after Onboarding in the natural build order. `DashboardPlaceholder`
(`frontend/src/features/dashboard/DashboardPlaceholder.tsx`) is an
intentional stub to be replaced outright when PRD-03 is built, not extended
in place.

**Also worth doing, smaller:**
- Follow-up #3 above (DB uniqueness constraint on the self household-member
  row) — small, backend-only, closes a real (if narrow) gap the frontend
  can only mitigate, not fully close.
- Follow-up #1 (plan-type override 409 backstop) — small, backend-only,
  pre-existing since Phase 1.

## Context/token usage

Not tracked this session — run `/context` directly in the CLI if needed.
