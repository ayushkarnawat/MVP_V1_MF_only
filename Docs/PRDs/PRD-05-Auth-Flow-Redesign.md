# PRD: Auth Flow Redesign (Phone-First, Sequential Signup)

**Status:** Draft for review. No code has been written. Per explicit
instruction, this document (plus its two companions) is the deliverable for this pass —
implementation begins only after review and a separate go-ahead.

## Overview

### Problem Statement

The stakeholder supplied a plain-language signup flow diagram (phone number → OTP →
email → OTP → registration), with an explicit expectation of which data lands in which
"table" at each step, including IP/device metadata on every OTP send and a persistent
list of people who verify their phone but never finish signing up (for marketing
follow-up — **descoped 2026-09-28**, see below).

Today's actual signup flow (`PRD-02` FR-2/2a/2b, built 2026-08-14 → 2026-08-17) is
**entry-method-first**: a user can start with email+OTP, Google, or phone+OTP, and
(except for phone, see "Related Issue" below) is then required to verify phone as a
mandatory second step before an account exists. This doesn't match the stakeholder's
mental model of a single, sequential phone→email path, and doesn't capture any
request/device metadata today.

### Solution Summary

Make phone-first, sequential (phone verified → email verified → registered) the primary
signup path, reusing the existing `pending_identity_verifications`/phone-gate mechanism
in reverse (it already does almost exactly this shape, just starting from email/Google
instead of phone). Add IP/User-Agent/device-ID capture on OTP requests. Google sign-in
is kept, untouched, for future use. Full schema detail:
`Docs/superpowers/specs/2026-09-28-auth-flow-redesign-database-schema-changes.md` and
`...-tables-changed.md`.

**Scope change, 2026-09-28:** the marketing/re-engagement drop-off list (a new
`signup_funnel_leads` table in earlier drafts of this PRD) is set aside for this pass, per
your decision — tracked in `DEFERRED_FEATURES.md` under PRD-05 rather than built now.
This drops the design to **zero new tables**: one existing table altered
(`otp_requests`), one application-logic change (`pending_identity_verifications`).

### Target Users

Same as PRD-02: first-time retail and HNI investors signing up for Unifolio, on the AWS
staging environment (RDS Postgres, ECS Fargate, SES) — this is not a localhost-only
design.

## Goals & Success Metrics

### Goals
- Match the stakeholder's phone-first, sequential mental model exactly, without
  duplicating or destabilizing the existing (already-tested) multi-method auth
  infrastructure.
- Give the business a device/platform breakdown of who's signing up (phone vs. tablet vs.
  Windows vs. Mac) — clarified 2026-09-28: this is the actual purpose behind the
  stakeholder's IP/MAC-address request, not fraud prevention. See FR-2 and the schema
  doc's §1 purpose note for why User-Agent (not IP or MAC) is the field that answers this.
- Do this with the smallest possible schema footprint: no existing table or column
  removed, minimal new surface area. (Direct response to "the cleanest way to do this
  without breaking anything else.")

### Non-Goals (this pass)
- Full rate-limiting/abuse-prevention policy (IP-based blocking, device reputation) —
  the new columns capture the data; acting on it is explicitly deferred, matching the
  schema doc's existing "future Auth/Security PRD" carve-out.
- Choosing or integrating a production SMS/OTP provider — staying in stub mode for this
  pass, decided 2026-09-28, same as today's practice. See Technical Considerations.
- Signup drop-off tracking / marketing re-engagement outreach — descoped 2026-09-28, see
  Out of Scope below.
- GeoIP enrichment of `ip_address` (country/region/city/ISP parsing via MaxMind
  GeoLite2) — considered, deferred 2026-09-28; `ip_address` is stored raw for now. Not a
  one-way door: the raw value is retained (see retention note below), so parsing can be
  added and backfilled later.
- A scheduled/infrastructure-based cleanup job (EventBridge Scheduler, etc.) — not
  needed. `otp_requests` retention is instead handled by application-logic changes (see
  FR-9), not new infrastructure. Cleanup for abandoned `pending_identity_verifications`
  rows remains out of scope — see Explicit Deviations below.

## Scope

### In Scope
- Reordering the mandatory signup sequence to phone-first, email-second.
- Request-metadata capture (IP, User-Agent, device ID) on OTP sends.
- Root-causing and proposing (not yet implementing) a fix for the known phone-login
  silent-account-creation bug, since the new sequential design directly interacts with it.

### Out of Scope
- Any change to Google sign-in's behavior (kept exactly as-is, per stakeholder answer).
- Any change to `users`, `auth_identities`, `sessions`, or PAN/household-member tables.
- **Signup drop-off / marketing re-engagement tracking** (the stakeholder diagram's
  "phone verified, app abandoned" list) — descoped 2026-09-28 per your decision to set
  the marketing angle aside for this pass. Tracked in `DEFERRED_FEATURES.md` under
  PRD-05. If revisited, the schema doc's now-removed §3 has the design analysis
  (available in that file's git history).
- Implementation itself — this document plus its two schema companions are the review
  artifact; a separate go-ahead is required before any code or migration is written.

## Solution Design

### Research Summary

Full current-state findings (file paths, migration history) are in the companion schema
document's "Context — what exists today" section, sourced directly from
`backend/app/models/`, `backend/alembic/versions/`, `backend/app/api/auth.py`,
`backend/app/services/auth/`, and `Docs/PRDs/Database-Schema-Unifolio.md`. The single
most load-bearing finding: `pending_identity_verifications.provider`'s enum **already
includes `phone_otp`** as a valid database value — the current restriction against using
it that way ("never `phone_otp` in practice," per the schema doc) is an application-code
choice, not a schema limitation. This is why the recommended design needs no schema
change for the core sequencing flip, only for the metadata columns on `otp_requests`.

### Functional Requirements

Mapped directly to the stakeholder's numbered steps:

- **FR-1 (steps 1-3):** Sign-up screen asks for phone number first. No DB write until
  OTP is requested — matches the stakeholder's "Nothing" annotation and today's existing
  behavior.
- **FR-2 (step 4):** On "Send OTP," write an `otp_requests` row (phone, OTP hash, 5-min
  expiry — reusing existing logic unchanged) with its new `ip_address`/`user_agent`
  (raw + parsed `device_type`/`os_family`/`browser_family`)/`device_id` columns
  populated. **Purpose clarified 2026-09-28:** the goal here is a device/platform
  breakdown of signups (phone vs. tablet vs. Windows vs. Mac), not fraud prevention or
  literal MAC capture — the parsed User-Agent fields are what answer that; IP address
  instead gives a separate, geographic breakdown. See the companion schema doc's §1 for
  why literal MAC-address capture isn't possible on the web, and the full parsing
  approach.
- **FR-3 (step 5):** On OTP verification, create a `pending_identity_verifications` row
  with `provider='phone_otp'` (newly-allowed direction) instead of completing signup
  immediately — this is the behavior change that also resolves the "Related Issue" bug
  below, since a bare phone verification no longer unconditionally creates a `users` row.
- **FR-4 (steps 6-7):** Ask for email; on "Send OTP," write an `otp_requests` row for the
  email (existing mechanism, unchanged, same metadata columns as FR-2) and update the
  `pending_identity_verifications` row with the email.
- **FR-5 (step 8):** On email OTP verification, complete signup using the *shape* of the
  existing phone-gate-completion logic (`complete_phone_gate_signup` in
  `backend/app/services/auth/identity.py:269-300`): create `users`, two `auth_identities`
  rows (phone_otp + email_otp), delete the `pending_identity_verifications` row.
  **Correction after independent review: the function itself is not a drop-in reuse.**
  It hardcodes its `phone_number` parameter as the `PHONE_OTP` identity and
  `pending.provider`/`pending.provider_subject` as the *other* identity — that only works
  because `pending.provider` is never `PHONE_OTP` today. Once FR-3 sets
  `pending.provider='phone_otp'`, this function needs a real parameter-shape change (or a
  dedicated sibling function) to accept the email as its own argument and write it as the
  `EMAIL_OTP` identity, rather than being called "unchanged" — see the Integration Points
  item below and the schema doc's §2.
- **FR-6 (step 9):** Onboarding questionnaire (name, investor type, goal, etc.) continues
  writing to `users` exactly as today — explicitly confirmed unchanged by the
  stakeholder's own note ("like done at present").
- **FR-7 (Google, amended per your answer):** Google sign-in is **not removed**. Its
  existing behavior (verify via Google → mandatory phone-gate second step, using the
  same `pending_identity_verifications` mechanism it already uses today) is left
  completely untouched. **UI treatment (confirmed 2026-09-28):** hide the Google button
  from the signup screen for now, to match the stakeholder's single-path diagram, without
  deleting any backend code — a UI-only change to re-enable it later.
- **FR-8 (amends PRD-02 FR-2b):** FR-2b (2026-08-17, `Docs/PRDs/PRD-02-Signup-
  Onboarding.md:212-217`) states that the Sign-Up/Log-In landing screen's "both buttons
  lead to the identical phone+OTP flow... a new `User` row is created on first OTP
  verification" — written back when phone+OTP was the only method, before today's
  email/Google options existed. Under this redesign, phone verification **no longer
  independently completes signup** —
  it's always followed by a mandatory email step for new signups. FR-2b is superseded by
  FR-3/FR-5 above for the signup case; FR-8a below defines the separate login case.
- **FR-8a (login, unchanged in shape, only the "unrecognized number" behavior changes):**
  Returning-user login via phone+OTP continues to work as today for *recognized* numbers.
  See "Related Issue" for the *unrecognized*-number case, which is where the known bug
  lives.
- **FR-9 (`otp_requests` retention, added 2026-09-28, applies to both phone and email
  OTP sends, both signup and login):** Three application-logic changes, no new
  infrastructure, no schema change:
  1. **Upsert on resend.** If an unverified `otp_requests` row already exists for the
     identifier being requested (the same lookup the 60-second resend-throttle check
     already does), update it in place (new hash, `expires_at` reset, `attempt_count`
     reset) instead of inserting a second row.
  2. **Delete on signup completion.** Inside the same transaction that creates `users`
     and deletes `pending_identity_verifications` (FR-5), also delete every
     `otp_requests` row matching the now-verified phone number and email, by value —
     no `user_id` column is added; `otp_requests` still has no FK to `users`, for the
     same reason it never has: most rows never correspond to an account.
  3. **30-day sweep for unverified rows.** Add one unconditional statement to the
     OTP-request endpoint: delete `otp_requests` rows where `verified_at IS NULL` and
     `expires_at` is more than 30 days old. Ordinary traffic is the trigger — no
     schedule, no new job.
  **Explicitly unaffected: `pending_identity_verifications`'s 10-minute TTL and its own
  deletion-on-completion behavior** — this FR only touches `otp_requests`. See the
  schema doc's item 1 for full reasoning, including why this is a materially smaller
  retention footprint than the original "keep everything forever" state, without any
  AWS infrastructure.

## Related Issue: Phone-Login Silent Account Creation

You asked for this documented in full here, for your review before deciding whether/how
to fix it.

**Symptom:** Entering a phone number that has no existing account and completing OTP
verification silently creates a new account, rather than returning an error the way the
equivalent email flow does.

**Where:** Backend only. `backend/app/api/auth.py`, `verify_otp_route`
(lines 192-247), specifically the branch taken when there's no `pending_token` on the
request:

```python
# Phone never collision-checks (no email claim to collide with) —
# brand-new phone number always completes signup immediately.
now = datetime.now(timezone.utc)
user = User(phone_number=body.phone_number, created_at=now)
db.add(user)
db.flush()
record_identity(db, user.id, AuthIdentityProvider.PHONE_OTP, body.phone_number, None, now)
db.commit()
return _session_response(user.id, AuthIdentityProvider.PHONE_OTP, db)
```

The equivalent email path (`verify_email_otp`, no `pending_token`, no matching identity)
instead returns **HTTP 401 "No account found for that email — sign up instead."**
(auth.py:154-158). The two paths are inconsistent today.

**Root cause:** This was originally *intentional*, not a bug — PRD-02 FR-2b (2026-08-17)
explicitly documents "a new `User` row is created on first OTP verification" as the
decided design, because at the time phone+OTP was a fully standalone signup method with
no separate login/signup UI distinction. The frontend has since moved away from that
model: `Landing.tsx` today only offers "Continue with Phone" in **login** mode; signup
mode offers only email + Google. So in practice, every hit on this backend branch today
comes from someone typing a phone number while explicitly in *login* mode — the frontend
already implies "unrecognized number here should error," but the backend was never
updated to match. This is exactly the kind of PRD-vs-implementation drift flagged by
project convention: PRD-02's FR-2b text is stale relative to both the frontend and to
`session.md`'s own characterization of this as a bug (found on staging 2026-09-11,
re-confirmed 2026-09-26, explicitly deferred by prior user decision). This document
doesn't resolve that conflict unilaterally — it's flagged here for your call.

**Why this redesign is the natural point to fix it:** Under the new sequential design, a
bare phone verification (FR-3 above) never completes signup by itself anymore for *any*
caller — it always creates a `pending_identity_verifications` row and waits for email.
That means the current "no `pending_token` → create a `users` row unconditionally"
branch has no valid signup caller left at all once this redesign ships; it would only
ever be reached by a genuine login attempt. Implementing FR-3 as designed effectively
retires the buggy branch as a side effect — but making the fix explicit (rather than
implicit/accidental) is safer and clearer.

**Proposed fix approach:**
1. Give the frontend an explicit way to declare intent on the phone-OTP-verify call
   (e.g., a `flow: "signup" | "login"` field, or splitting into two endpoints/params) —
   today, "signup vs. login" is inferred only from whether a `pending_token` is present,
   which is exactly the ambiguity that caused the drift.
2. Backend: for `flow="login"` with no matching `auth_identities` row, return 401 "No
   account found for that phone number — sign up instead," mirroring the email path
   exactly.
3. Backend: for `flow="signup"` with no `pending_token` yet (i.e., this is the very
   first phone-verify of a brand-new sequential signup), create the
   `pending_identity_verifications` row per FR-3, not a `users` row.
4. Remove the unconditional-user-creation branch (auth.py:239-247) entirely — under the
   new design it has no legitimate caller.

**Steps to fix (once approved):**
1. Add `flow` to the phone-OTP-verify request schema (backend `schemas.py` + frontend
   `api.ts` call site).
2. Update `verify_otp_route` per steps 2-4 above.
3. Update `Landing.tsx`/`AuthEntryFlow.tsx` to send the correct `flow` value (should
   already know which mode it's in, per the existing signup/login screen split).
4. Add regression tests for both branches (login-with-unrecognized-number → 401;
   signup-with-new-number → pending record, not an account).

**Table/schema impact:** None beyond what's already proposed above (FR-3's
`pending_identity_verifications` usage). This fix is an API-contract and
application-logic change, not a schema change.

**This is analysis only** — per your request, no code has been changed. Please review
and tell me whether/how you'd like this actioned (as part of this redesign, or tracked
separately).

## Technical Considerations

### Constraints (staging environment, not localhost)

- **SMS/OTP provider: staying in stub mode, decided 2026-09-28.** `backend/app/services/
  auth/otp.py` has an `otp_delivery_mode` setting mirroring the email pattern, but **no
  `SmsProvider` implementation exists anywhere in the codebase** (confirmed by search —
  no SNS, Twilio, MSG91, or similar integration) — `otp_delivery_mode` stays `"stub"`,
  same as it works today, with no change needed for this redesign. The abstraction
  itself (a swappable delivery mode, mirroring how email moved from stub → SES) already
  exists and needs no rework to slot a real provider in later — that remains future work,
  not something this PRD blocks on or solves. **Practical implication to be aware of:**
  in stub mode, no real SMS is sent — the OTP is only logged/stubbed, not delivered to an
  actual handset. That's sufficient for functional/dev testing on staging (same as it is
  today), but a genuine outside user attempting to sign up on staging with their own
  phone won't receive a usable code until a real provider is wired in. Since phone is now
  the mandatory first step of the only signup path (rather than one of three optional
  entry methods), that limitation applies to the *entire* signup flow now, not just the
  phone-specific branch it used to gate. Flagging this so it's a known, accepted
  limitation rather than a surprise once staging testing starts.
- Email OTP delivery is already live via Amazon SES (Postmark fully removed) — no gap
  there.
- `AGENTS.md` currently states "AWS deployment happens once [the Migration-Plan-SQLite-
  to-Postgres] checklist is met, not before" as a non-negotiable. This is stale — AWS
  staging (RDS Postgres, ECS Fargate, ap-south-1) has been live since 2026-09-08/09, per
  `CLAUDE.md` and `session.md`, confirmed current. Flagging this doc-drift here since it
  directly affects "build for staging" instructions; recommend fixing `AGENTS.md`
  separately (unrelated to this PRD's scope, not blocking).

### Integration Points
- `backend/app/services/auth/identity.py` — collision/precedence logic, needs the
  phone-first pending-verification path added alongside the existing email/Google one.
- `backend/app/services/auth/identity.py:269-300`
  (`complete_phone_gate_signup`) — **needs a real code change, not just a new caller.**
  Confirmed by independent review: this function hardcodes its `phone_number` parameter
  as the `PHONE_OTP` identity and `pending.provider`/`pending.provider_subject` as the
  other identity, which silently breaks once `pending.provider` can itself be
  `phone_otp` (FR-3). Needs either a generalized parameter shape (accept both identifiers
  explicitly, don't infer roles from which field is `phone_number`) or a dedicated
  phone-first sibling function. Scope this explicitly in the implementation plan — don't
  treat it as already solved by FR-3's `pending_identity_verifications` change.
- `backend/app/api/auth.py` — route changes for FR-3/FR-8a's `flow` parameter.
- `frontend/src/features/auth/{Landing.tsx, AuthEntryFlow.tsx, OtpVerify.tsx, api.ts}` —
  sequential phone→email UI instead of method-choice UI; Google button hidden per FR-7.
- `backend/app/services/auth/otp.py` (`create_otp_request`) — FR-9's upsert-on-resend
  (reuse the existing resend-throttle lookup instead of always inserting) and the 30-day
  unverified-row sweep both land here. Applies to every OTP send system-wide (phone and
  email, signup and login), not just the new phone-first path.
- The signup-completion function from the `complete_phone_gate_signup` item above — FR-9's
  delete-on-success (`otp_requests` cleared by phone/email value match) belongs in the
  same transaction as that function's other changes.

### Data Requirements
See both companion schema documents for full detail. Summary: 8 new nullable columns on
`otp_requests` (raw + parsed User-Agent, IP, device ID), 1 application-logic change to
`pending_identity_verifications` usage (no schema change), 3 application-logic changes to
`otp_requests`'s write path for retention (FR-9, no schema change). Zero new tables, zero
new AWS infrastructure.

## Dependencies & Risks

### Dependencies
- Resolution of the open questions below before migrations are written.

### Risks
- **Login/signup UI split correctness:** FR-8a's fix depends on the frontend reliably
  declaring `flow`; if that regresses, the same class of bug could recur in a new form.
  Mitigated by the regression tests proposed in the "Related Issue" section.

## Explicit Deviations (flagging, not silently resolving)

- **Google is retained**, not removed — deviates from the stakeholder's diagram (which
  shows no Google branch at all) per your explicit instruction. UI-hidden-but-code-intact
  is the confirmed treatment (2026-09-28).
- **MAC address is substituted with IP + User-Agent + a client-generated device ID** —
  literal MAC-address capture isn't possible from a web browser at any step, not just
  the OTP step (this is a browser platform restriction, not a design gap). See the
  schema doc's item 1 for the full explanation and the closest available alternative.
- **The stakeholder's "phone verified, app abandoned" persistent list is not being
  built** — its only purpose was marketing re-engagement, which you set aside for this
  pass. See Out of Scope above and `DEFERRED_FEATURES.md`.
- **`otp_requests` retention is bounded, but not to zero — and not the way the
  stakeholder's diagram literally describes.** FR-9 (added 2026-09-28) means resent
  attempts collapse to one row, a completed signup's history is deleted immediately, and
  unverified rows are swept after 30 days — a real fix, achieved with zero AWS
  infrastructure. What's still *not* built: an abandoned `pending_identity_
  verifications` row (phone verified, email never finished) is still never purged — see
  Open Questions and `DEFERRED_FEATURES.md` if that gap needs closing too.

## Open Questions

1. **`AGENTS.md`'s stale "local-first, AWS after checklist" line** — unrelated to this
   PRD's content but discovered while confirming the target environment; worth a
   separate, small fix so future sessions don't get the wrong instruction.

*(SMS provider choice and Google button UI treatment were open questions here —
both resolved 2026-09-28: stub mode stays for this pass (see Technical Considerations),
and Google is confirmed hidden-but-intact (see FR-7, Explicit Deviations). This is the
only open question left in this document.)*

*(Three items previously listed here — funnel-lead hard-delete-vs-soft-convert,
re-attempt handling, and marketing-outreach consent — are moot now that the funnel/lead
table itself is out of scope; see Out of Scope above.)*

## Appendix

### Related Documents
- `Docs/superpowers/specs/2026-09-28-auth-flow-redesign-database-schema-changes.md` —
  full schema/migration detail
- `Docs/superpowers/specs/2026-09-28-auth-flow-redesign-tables-changed.md` — table-by-
  table summary
- `Docs/PRDs/PRD-02-Signup-Onboarding.md` — FR-2/2a/2b, amended by this PRD's FR-8
- `Docs/superpowers/specs/2026-08-14-multi-method-auth-design.md` — original design of
  the pending-identity/phone-gate mechanism this redesign reuses
- `Docs/PRDs/Database-Schema-Unifolio.md` — schema of record
- `Docs/PRDs/ADR-Technical-Stack-Decisions.md` — ADR-003 (RDS Postgres), ADR-005
  (ECS/staging deployment)
- `session.md` item 9 — prior documentation of the known phone-login bug

### Revision History

| Version | Date | Author | Changes |
|---|---|---|---|
| 1.0 | 2026-09-28 | Claude (PM partner) | Initial draft for stakeholder/PM review |
| 1.1 | 2026-09-28 | Claude (PM partner) | Independent review caught that FR-5's "unchanged" reuse of `complete_phone_gate_signup` was incorrect (the function hardcodes phone as a fixed role with no email-argument slot) — FR-5 and Integration Points corrected to call out the required function-level change explicitly; FR-8's FR-2b citation corrected from a loose paraphrase to an accurate quote/attribution |
| 1.2 | 2026-09-28 | Claude (PM partner) | Clarified the actual purpose behind IP/MAC-address capture is device/platform analytics (phone vs. tablet vs. Windows vs. Mac), not fraud prevention — added a Goals bullet and updated FR-2 accordingly; full field-level detail in the schema doc |
| 1.3 | 2026-09-28 | Claude (PM partner) | Descoped the marketing/re-engagement drop-off list (`signup_funnel_leads`) per your decision — removed from Goals, Scope, FRs, Data Requirements, Risks, Deviations, and Open Questions; moved to `DEFERRED_FEATURES.md` under PRD-05. This design now touches zero new tables |
| 1.4 | 2026-09-28 | Claude (PM partner) | SMS/OTP provider: resolved as staying in stub mode for this pass (matching current practice) per your decision — no longer a blocking dependency; removed from Non-Goals/Dependencies/Open Questions framing and replaced with the practical stub-mode limitation to be aware of, in Technical Considerations |
| 1.5 | 2026-09-28 | Claude (PM partner) | Google button UI treatment confirmed (hidden from signup screen, backend intact, UI-only re-enable later) — FR-7 and Explicit Deviations updated from "proposed/please confirm" to confirmed; only one open question remains (`AGENTS.md`'s stale local-first line) |
| 1.6 | 2026-09-28 | Claude (PM partner) | Two decisions recorded, both added to Non-Goals and Explicit Deviations: (1) `ip_address` stays raw-only, GeoIP parsing deferred; (2) no cleanup/purge job for `otp_requests`/abandoned `pending_identity_verifications` — indefinite retention accepted as-is, deviating from the stakeholder's literal "delete from all tables" wording. Both tracked in `DEFERRED_FEATURES.md` |
| 1.7 | 2026-09-28 | Claude (PM partner) | Superseded 1.6's "indefinite retention accepted as-is" for `otp_requests` — added FR-9: upsert-on-resend, delete-on-signup-completion by phone/email value match, and a 30-day sweep for unverified rows, all application-logic only, zero AWS infrastructure. Updated Non-Goals, Explicit Deviations, Data Requirements, and Integration Points accordingly. `pending_identity_verifications`'s abandoned-row gap remains open (lower priority, no natural zero-infra hook) |
| 1.8 | 2026-09-30 | Claude | Staging QA fix: FR-1–FR-3 only described a new number. Added the known-number rule: Sign Up with a phone that already has an account is rejected at `/auth/otp/request` (409, "An account with this phone number already exists.", no code sent, "Log in instead" shortcut) and again at verify; Log In with an unknown phone or email is rejected at request time (404, "No account found … sign up instead."). Resolves the "Related Issue" / session.md item 9 at request time. Requests carry `flow`. See `Docs/orchestration/2026-09-30-staging-qa-findings-map.html`. |
