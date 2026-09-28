# Auth Flow Redesign — Tables Changed (Summary)

**Status:** Draft for review — no code or migrations have been written yet.

Purpose of this document: a fast, at-a-glance answer to "what tables do we already have
that can be reused, what's new, and what gets deleted" — bridging the stakeholder's
plain-language table names to the real technical tables. Full column-level detail is in
`2026-09-28-auth-flow-redesign-database-schema-changes.md`.

## Headline answer: nothing is deleted

The stakeholder's flow describes data moving between tables and old rows being deleted
once someone reaches "registered user." The current schema already has a mechanism that
does almost exactly this (`pending_identity_verifications` → `users`, with the pending row
deleted on completion) — it's just wired to start from email/Google instead of phone.
**No existing table or column is removed, and — as of 2026-09-28 — no new table either.**
The marketing/re-engagement drop-off list (a new table in earlier drafts of this doc) was
set aside per your decision; see `DEFERRED_FEATURES.md`. The changes are now: eight new
nullable columns on `otp_requests`, plus **two separate application-logic changes with no
schema impact** — (1) `pending_identity_verifications` now accepts `phone_otp` as the
first verified leg, and (2) `otp_requests` gained a retention mechanism (upsert on
resend, delete on signup completion, a 30-day sweep for unverified rows) — see FR-9 in
PRD-05 and schema doc §1 for the full design. No AWS infrastructure either way.

## Stakeholder's tables mapped to real tables

| Stakeholder's name (from the diagram) | Real table | Status | What actually happens |
|---|---|---|---|
| *(sign-up screen, phone prompt — "Nothing" in DB)* | — | No change | No table involved, matches today |
| "Phone unverified user" (step 4) | `otp_requests` (existing) | **Altered** | `otp_requests` already stores the phone number + OTP hash while unverified; gains `ip_address`, raw `user_agent`, parsed `device_type`/`os_family`/`os_version`/`browser_family`/`browser_version`, and `device_id` columns (raw `ip_address` only — GeoIP parsing deferred; the User-Agent fields are what actually answer "phone vs. tablet vs. Windows vs. Mac" — see schema doc §1). A retry/resend now **updates this same row** instead of inserting a new one (FR-9) — bounds repeat attempts to one row per phone number. No separate funnel-tracking row is written — that table was dropped, see below |
| "Phone verified user" (step 5) | `pending_identity_verifications` (existing, reused differently) | **Logic change** | `pending_identity_verifications` gets its first-ever `phone_otp`-as-initial-provider row (schema already supports this — see schema-changes doc §2) |
| *(email prompt — "Nothing" in DB)* | — | No change | Matches today |
| "Phone verified, email unverified user" (step 7) | `otp_requests` (existing, email row) **+** `pending_identity_verifications` (existing) | **Altered** + **Logic change** | Email OTP sent via the same `otp_requests` table (already supports email rows); `pending_identity_verifications` row updated with the email |
| "Registered user" (step 8) | `users` + `auth_identities` (schema unchanged; completion function needs a code change) | **No table/column change; function-level change** | Same target shape as today's phone-gate completion: `users` row created, two `auth_identities` rows written (phone_otp + email_otp), `pending_identity_verifications` row **deleted**. **Correction after review:** the actual completion function (`complete_phone_gate_signup`) hardcodes phone as one fixed role and has no slot for an email argument, so it needs a real parameter-shape change (or a sibling function) to run in the reverse direction — not a literal "just triggered from the opposite identity" reuse. **New this pass (FR-9):** the same transaction now also deletes every `otp_requests` row matching the verified phone/email, by value — not a foreign key, since this table has never had one to `users`. See PRD-05's Integration Points and the schema doc's §1-§2 for detail |
| Next steps: name, reason, background, etc. (step 9) | `users` (+ onboarding tables, unaffected) | **No change** | Explicitly "like done at present" per the stakeholder's own note |

## Full table inventory (every auth-related table, changed or not)

| Table | Change type | One-line reason |
|---|---|---|
| `otp_requests` | **Altered + retention behavior (FR-9)** | + `ip_address` (raw only), `user_agent` (raw), `device_type`/`os_family`/`os_version`/`browser_family`/`browser_version` (parsed), `device_id` — all nullable, additive. Plus: upsert on resend, delete on signup completion, 30-day sweep for unverified rows — all application logic, no schema/AWS impact |
| `pending_identity_verifications` | **Behavior change, no schema change** | Now also accepts `phone_otp` as the *first* verified identity, not only the second-step gate |
| `users` | Unchanged | Final registration record, same shape |
| `auth_identities` | Unchanged | Same two-identities-on-completion pattern, same collision rules |
| `sessions` | Unchanged | Not part of this flow's staging mechanics |
| `household_members` | Unchanged | Unrelated (PAN/family data) |
| `account_deletion_surveys` | Unchanged | Unrelated |
| ~~`password_reset_tokens`~~ (migration 0008) / ~~`email_confirmation_tokens`~~ (migration 0007) | Already removed, prior work | Not touched by this redesign — noted here only so it's clear these were dropped by earlier, unrelated work, not by this change |

## Resolved decisions (confirmed 2026-09-28)

- **Google sign-in stays exactly as it is today**, code and tables untouched — kept for
  future use, not removed. **Confirmed UI treatment:** hidden from the signup screen,
  backend left fully intact, re-enabled later with a UI-only change.
- **SMS/OTP provider stays in stub mode** for this pass, matching current practice — no
  provider exists in the codebase; choosing/wiring one is out of scope here.
- **`ip_address` is stored raw only** — GeoIP parsing (country/region/city/ISP) was
  considered and deferred, not a one-way door since the raw value is retained.

## What's explicitly NOT changing

- **`otp_requests`'s OTP hashing, 5-minute expiry, and attempt-count/lockout logic are
  unchanged** — the new phone-first flow reuses this exactly as-is for both phone and
  email OTPs.
- **No rate-limiting or IP-based abuse prevention is being added** by this change — the
  new `ip_address`/`user_agent`/`device_id` columns are captured and stored, but nothing
  in this design *acts* on them (no blocking, no throttling beyond today's existing
  60-second resend cooldown and 5-attempt lockout). Using them for abuse prevention is
  explicitly deferred to the "future Auth/Security PRD" the schema doc already calls out
  — see PRD-05's Open Questions.
- **`pending_identity_verifications`'s 10-minute TTL and its own deletion behavior** —
  completely unaffected by FR-9's `otp_requests` retention mechanism above. An abandoned
  `pending_identity_verifications` row (phone verified, email never finished) still isn't
  cleaned up — see `DEFERRED_FEATURES.md`.

## Related Documents

- `2026-09-28-auth-flow-redesign-database-schema-changes.md` — full column-level detail,
  migration plan, approaches considered
- `Docs/PRDs/PRD-05-Auth-Flow-Redesign.md` — full PRD, functional requirements, known-bug
  analysis
- `Docs/PRDs/Database-Schema-Unifolio.md` — schema of record

## Revision History

| Version | Date | Author | Changes |
|---|---|---|---|
| 1.0 | 2026-09-28 | Claude (PM partner) | Initial draft for stakeholder/PM review |
| 1.1 | 2026-09-28 | Claude (PM partner) | Corrected `email_confirmation_tokens`'s drop migration (0007, not 0008); corrected the "Registered user" row — the completion function needs a real code change, not a free reuse in the reverse direction |
| 1.2 | 2026-09-28 | Claude (PM partner) | Clarified the purpose is device/platform analytics: `user_agent` is now raw + parsed into `device_type`/`os_family`/`os_version`/`browser_family`/`browser_version`, since neither MAC nor IP address would have answered "phone vs. tablet vs. Windows vs. Mac" even if MAC were obtainable — see schema doc for full detail |
| 1.3 | 2026-09-28 | Claude (PM partner) | Dropped `signup_funnel_leads` from every row and the table inventory — marketing/re-engagement use case set aside per your decision, tracked in `DEFERRED_FEATURES.md`. This design now adds zero new tables |
| 1.4 | 2026-09-28 | Claude (PM partner) | Brought current with PRD-05/schema-doc: added FR-9's `otp_requests` retention mechanism (upsert-on-resend, delete-on-completion, 30-day sweep) throughout; converted the Google/SMS/IP items from "proposed, pending confirmation" to a new "Resolved decisions" section now that all three are confirmed |
