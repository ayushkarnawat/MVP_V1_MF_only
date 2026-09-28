# Auth Flow Redesign — Database Schema Changes

**Status:** Draft for review — no code or migrations have been written yet.
**Target environment:** AWS staging (RDS PostgreSQL, ECS Fargate, per ADR-003/005) —
this analysis assumes staging is the live, current environment (confirmed 2026-09-28),
not localhost/SQLite.

## Purpose

The stakeholder supplied a plain-language auth flow (phone → OTP → email → OTP →
registration, with staging tables named "phone unverified user," "phone verified user,"
"phone verified email unverified user," and "registered user"). This document translates
that into concrete schema changes against the tables that actually exist today, and
states plainly what's new, what's altered, and — importantly — what is **not** touched.

Companion documents:
- `Docs/orchestration/../PRDs/PRD-05-Auth-Flow-Redesign.md` — full PRD (goals, functional
  requirements, the known phone-login bug, open questions)
- `2026-09-28-auth-flow-redesign-tables-changed.md` — a short table-by-table summary
  mapping the stakeholder's plain-language names to real tables

## Context — what exists today

Full detail was pulled from the live codebase (`backend/app/models/`,
`backend/alembic/versions/`), not just the schema doc, since the schema doc can drift
(it was already caught 3-4 migrations stale once, per its own revision history). Current
migration head: `0016_pending_pan_claims.py`.

Today's signup model (`PRD-02` FR-2/2a/2b, built by migrations 0004-0008) is
**entry-method-first, phone-gate-second**: a user can start with email+OTP, Google, or
phone+OTP; whichever they start with, phone is normally required as a mandatory second
step — **except** phone+OTP itself, which today completes signup on its own the moment
it's verified (see PRD-05's "Related Issue" section — this is also the source of a known,
currently-deferred bug).

The mechanism behind this is `pending_identity_verifications`: a short-lived (10-minute
TTL) staging row holding an already-verified identity (email or Google) while a second,
required identity (phone) is collected. Once the second identity verifies, a real `users`
row and two `auth_identities` rows are created, and the pending row is deleted. **This is
structurally the same shape as what the stakeholder is asking for** — just run in the
opposite order (email/Google first, phone second, instead of phone first, email second).

Key existing tables (full column list in `Docs/PRDs/Database-Schema-Unifolio.md` §"auth
tables"):
- `users` — final registered-user record
- `auth_identities` — verified identity, one row per (provider, subject), source of truth
  for login resolution
- `pending_identity_verifications` — the staging mechanism described above
- `otp_requests` — one shared table for both phone and email OTP codes (hash, expiry,
  attempt count); a `CHECK` constraint enforces exactly one of `phone_number`/`email` per
  row
- `sessions` — post-login session record

None of these were built with phone-first sequencing, IP/device capture, or a persistent
(non-expiring) abandoned-signup list in mind — hence the changes below.

## Proposed Changes

### 1. `otp_requests` — ALTERED (new columns only, nothing removed)

Add request-metadata columns so every OTP send (phone step 4, email step 7 in the
stakeholder's flow) records where it came from:

| Column | Type | Notes |
|---|---|---|
| `ip_address` | `VARCHAR(45)` NULLABLE | From the request's source IP (works for IPv4 and IPv6-mapped addresses); captured server-side, no client cooperation needed. Tells you network/geographic origin — **not** device type (see purpose note below) |
| `user_agent` | `TEXT` NULLABLE | Raw `User-Agent` header, kept verbatim as the source of truth even after parsing (a parsing library's output can change/improve over time; the raw string never needs re-capturing) |
| `device_type` | `VARCHAR` NULLABLE | Parsed from `user_agent` at write time: `mobile` / `tablet` / `desktop` / `other` |
| `os_family` | `VARCHAR` NULLABLE | Parsed: `iOS` / `Android` / `Windows` / `macOS` / `Linux` / etc. |
| `os_version` | `VARCHAR` NULLABLE | Parsed, e.g. `17.5` |
| `browser_family` | `VARCHAR` NULLABLE | Parsed: `Safari` / `Chrome` / `Edge` / etc. |
| `browser_version` | `VARCHAR` NULLABLE | Parsed, e.g. `128.0` |
| `device_id` | `VARCHAR` NULLABLE | Client-generated random UUID, persisted client-side (cookie/localStorage) and sent with the request — identifies "this browser again," unrelated to device *type* |

No existing column changes, no constraint changes. Purely additive — safe, backward
compatible, no backfill needed (existing rows just have `NULL` in the new columns).

**Scope decision (2026-09-28): store raw `ip_address` only, defer GeoIP parsing.** A
prior pass of this discussion considered adding parsed geolocation columns
(`ip_country`/`ip_region`/`ip_city`/`ip_isp`, mirroring the UA parsing below, via a
MaxMind GeoLite2 lookup) so the IP could support a "where are signups coming from"
breakdown alongside the device breakdown. Decided to hold off — `ip_address` is stored
raw for now, with no lookup/enrichment step. Since the raw value is retained (see the
retention note below), GeoIP parsing can be added and backfilled against existing rows
later without losing any data; nothing about this decision is a one-way door.

**Purpose correction (2026-09-28): this is for device/platform analytics, not fraud
prevention — which changes which field actually matters.** You clarified the real goal
is answering "what are our users using to sign up — phone, tablet, Windows, Mac?" That
reframes the MAC-address substitute discussion below: **neither MAC address nor IP
address would have answered that question even if MAC were obtainable.** A MAC address
identifies a network *interface* (hardware), not a device type or OS — it doesn't encode
"this is an iPhone" in any usable way. An IP address tells you network/geographic origin
(roughly which city/ISP) — two different phones and a laptop on the same office Wi-Fi
all share one IP. **The field that actually answers the question is `user_agent`**,
parsed into `device_type`/`os_family`/`browser_family` above — this is standard,
well-established practice for exactly this kind of analytics (it's what every "browser
usage" or "mobile vs. desktop traffic" dashboard is built from). `ip_address` is kept
here because it was in the stakeholder's original diagram and *can* still support a
separate, secondary breakdown (which regions/cities signups come from) — just flagging
plainly that it answers a different question than "what device," so it shouldn't be
read as redundant with the parsed User-Agent fields.

**Parsing implementation:** parse `user_agent` once, at write time, using a standard
library (Python: the `user-agents` PyPI package is a common choice — exposes
`.is_mobile`/`.is_tablet`/`.is_pc`, `.os.family`/`.os.version_string`,
`.browser.family`/`.browser.version_string` directly) rather than re-parsing the raw
string later for every query. Storing the parsed result as columns (per your confirmed
preference) means a dashboard/analytics query is a plain `GROUP BY device_type` — no
string parsing needed at query time. A modern supplement worth knowing about but not
required for v1: Chromium browsers also send structured `Sec-CH-UA-*` "Client Hints"
headers, which are more reliable than parsing the User-Agent string for those browsers
specifically — worth adopting later if UA-string parsing proves inaccurate in practice,
not a blocker for this design.

**On "MAC address":** the stakeholder's flow asks for MAC address capture on every OTP
request. This is not something a web page can do, at any step, ever — no browser API
exposes the hardware MAC address to a web page (deliberate, universal browser privacy
restriction), and modern OSes randomize it anyway even for native apps without special
entitlements. This isn't a sequencing problem (there's no "better step" to capture it at)
— it's a hard platform limitation for anything running in a browser. The closest
practically-available substitute, and what these columns capture instead, is: **server-
observed IP address** (geographic/network origin, not device type) + **User-Agent,
parsed into `device_type`/`os_family`/`browser_family`** (this is the field that actually
tells you phone vs. tablet vs. Windows vs. Mac — see the purpose note above) + a
**client-generated `device_id`** (closest analog to "identify this device again later,"
but only as durable as the
browser's local storage — cleared by private browsing or clearing site data, unlike a
real hardware MAC). If Unifolio ever ships a native mobile app, that app could read a
platform device identifier (Android ID / iOS `identifierForVendor`) — still not a literal
MAC (both platforms block that for apps too, for the same privacy reasons), but a closer
per-install identifier. Flagged as an explicit deviation in PRD-05.

**How each of the three substitute fields is actually captured (staging environment):**

- **`ip_address` (server-observed, no client cooperation needed).** This is the source
  address the request appears to come from — not something the client sends on purpose,
  it's inherent to the network connection. The one wrinkle specific to this deployment:
  the backend sits behind an ALB (ADR-005), so FastAPI's raw `request.client.host` would
  return the **ALB's** internal IP, not the real caller's. The ALB instead puts the
  actual client IP in the `X-Forwarded-For` header (format: `client, proxy1, proxy2, ...`
  — the first entry is the original client). Implementation: read
  `request.headers.get("x-forwarded-for")` and take the first address; enable Uvicorn's
  `--proxy-headers` / `ProxyHeadersMiddleware` so `request.client.host` resolves
  correctly too. This header is only trustworthy because ECS tasks aren't reachable
  directly (all traffic is forced through the ALB) — the app should not trust a
  client-supplied `X-Forwarded-For` in any deployment where the app is directly
  internet-facing.
- **`user_agent` (client-declared, but sent automatically — no frontend code needed) →
  parsed into `device_type`/`os_family`/`os_version`/`browser_family`/`browser_version`.**
  Every browser attaches a `User-Agent` header to every HTTP request by default,
  describing browser/version/OS. Implementation: read
  `request.headers.get("user-agent")`, store it verbatim in `user_agent`, then run it
  through a parsing library (e.g. Python's `user-agents` package) once at write time and
  store the structured result in the five parsed columns — this is the field that
  actually answers "phone vs. tablet vs. Windows vs. Mac," per the purpose note above.
  Spoofable (any client can set an arbitrary value), which is fine for the
  analytics/re-engagement use case here, just not something to treat as tamper-proof if
  it's ever used for security decisions later.
- **`device_id` (the one that needs actual frontend work — nothing gives us this for
  free).** Unlike the two above, no browser API hands this over automatically; it has to
  be a value the frontend invents and asks the browser to remember. Implementation: on
  first use, frontend JS generates a random ID (`crypto.randomUUID()`), stores it in
  `localStorage` (or a long-lived cookie), and reuses the stored value on every
  subsequent call instead of generating a new one; the frontend sends it explicitly,
  e.g. as an `X-Device-Id` header. This is best understood as "a self-issued marker the
  browser cooperates in carrying around," not a hardware identifier — clearing browser
  data, private/incognito mode, or switching browsers on the same physical device all
  produce a fresh ID, which is a materially weaker guarantee than a real device ID would
  be, and worth keeping in mind if this field is ever used for anything beyond
  informational/marketing purposes.

**Retention decision, superseded 2026-09-28: application-logic cleanup, no scheduled job,
no AWS infrastructure.** The original "leave it as-is" resolution (further up this file's
git history) is replaced by a concrete three-part mechanism, entirely in application code
that already runs today — no new EventBridge/ECS Fargate job, no Terraform, no migration
beyond the columns already in this section. **None of this touches
`pending_identity_verifications`'s 10-minute TTL or its own deletion behavior — that
mechanism is completely separate and unaffected; see item 2 below.**

1. **Upsert on resend/retry, instead of a new row per attempt.** Today, every "Send OTP"
   click inserts a fresh row (confirmed: `create_otp_request` never reuses one). The
   60-second resend-throttle check already looks up the most recent unverified row for
   that identifier (`otp.py`) — this is the same lookup an upsert needs, so no new query
   is required. Change: if that lookup finds an existing **unverified** row for the
   identifier, **update it in place** (new `otp_hash`, `expires_at` reset to now + 5 min,
   `attempt_count` reset to 0, the new metadata columns overwritten with the latest
   request's values) instead of inserting a second row. If no such row exists, insert as
   today. Effect: at most one *unverified* row per phone/email at any time, regardless of
   how many times someone retries — bounds the "someone resent 10 times" case to one row,
   for free, using a lookup that already runs. No schema change (no unique constraint
   needed — this is an application-level SELECT-then-UPDATE-or-INSERT, not a DB-level
   `ON CONFLICT` upsert), and the row keeps the same `id` across resends.
2. **Delete on signup completion, by value match — same spirit as
   `pending_identity_verifications`, different mechanism.** `pending_identity_
   verifications` is deleted by a direct row reference (its `token_hash` points at
   exactly one row — see item 2 below). `otp_requests` has no such per-attempt pointer
   (and, per the upsert change above, no FK to `users` either — see the "How is
   `otp_requests` connected to `users`" note below), so the equivalent action is a
   value-match delete: inside the *same transaction* that already creates `users` +
   `auth_identities` and deletes the `pending_identity_verifications` row, add
   `DELETE FROM otp_requests WHERE phone_number = :phone` and
   `DELETE FROM otp_requests WHERE email = :email`, using the phone/email values already
   in scope at that point. This removes every historical attempt (including anything the
   upsert change didn't already collapse) for that identifier the moment it becomes a
   real, verified account. No new column, no FK — matched entirely on the existing
   `phone_number`/`email` columns.
3. **30-day sweep for unverified rows, riding on real traffic instead of a schedule.**
   `create_otp_request` runs on every OTP-send request already; add one unconditional
   statement to that same function: `DELETE FROM otp_requests WHERE verified_at IS NULL
   AND expires_at < now() - interval '30 days'`. Ordinary signup/login traffic becomes
   the trigger instead of EventBridge Scheduler — no new schedule, no new ECS task, no
   Terraform. Scoped to unverified rows only (matches your instruction): a verified row
   either gets removed immediately by item 2 above (if it led to a completed signup), or
   is a verified *login* attempt for an existing account (lower privacy concern — it's
   that account's own already-known number) and is left alone by this sweep.

**How `otp_requests` is "connected" to `users` for this — it isn't, by foreign key.**
There is no `user_id` column and none is being added. Items 2 and 3 above both work by
matching on the existing `phone_number`/`email` values already in scope at the moment of
cleanup, exactly the same reason this table has no FK to `users` in the first place (most
rows never correspond to an account at all). Adding a `user_id` FK would add schema
surface for no benefit over a plain `WHERE phone_number = :phone` match.

**Net effect:** every phone/email anyone types in is bounded to at most one lingering row
for 30 days if never verified, cleaned up immediately if it completes a signup, and left
alone (unbounded) only for the narrower case of a verified login on an existing account's
own number — a meaningfully smaller retention footprint than the original "keep
everything forever" state, achieved with zero new infrastructure.

### 2. `pending_identity_verifications` — NO SCHEMA CHANGE to this table; the completion function that reads it needs a real code change

The `provider` enum (`phone_otp`, `email_otp`, `google`, `email_password`) **already
includes `phone_otp`** as a valid DB value — the current restriction ("never `phone_otp`
in practice") is an application-level choice: no code path ever calls
`create_pending_verification` with `phone_otp`, and the explicit "Never PHONE_OTP"
comment documenting that choice lives on the model itself
(`backend/app/models/auth.py:60-61`), not enforced anywhere in
`backend/app/services/auth/identity.py`. Making phone the first verified leg instead of
the second requires no migration: the same row shape (`provider`, `provider_subject`,
`email`, `email_verified`, `matched_user_id`, `token_hash`, `expires_at`) already
supports "phone verified, waiting on email" — it's simply never been used that way.

**Correction after independent review — this table needs no schema change, but the
function that *completes* signup from it does.** `complete_phone_gate_signup`
(`backend/app/services/auth/identity.py:269-300`) hardcodes two fixed roles today: its
explicit `phone_number` parameter is always recorded as the `PHONE_OTP` identity, and
`pending.provider`/`pending.provider_subject` (today always `EMAIL_OTP` or `GOOGLE`) is
recorded as the *other* identity — this only works because `pending.provider` is never
`PHONE_OTP` today. Once FR-3 sets `pending.provider = 'phone_otp'` for a phone-first
signup, calling this function unchanged at the email-verification step would either write
a duplicate `(PHONE_OTP, <phone number>)` row (violating `auth_identities`'s unique
constraint on `(provider, provider_subject)`) or misuse the `phone_number` parameter to
hold an email address — either way, no `EMAIL_OTP` identity row would ever get created.
This function needs a real parameter-shape change (or a dedicated sibling function for
the phone-first direction); it is **not** a drop-in reuse. See PRD-05's Integration
Points section, corrected to say so explicitly. This doesn't change the schema-change
picture above (still zero migrations for this table) — only the effort estimate for the
application code that reads it.

This is still the single biggest reason the recommended design (below, in "Approaches
Considered") is the cleanest option relative to Option B/C: the pending-verification
*data model* the stakeholder is describing already exists, just wired in reverse — what's
needed on top is a contained, single-function change, not a new parallel system.

No change to the 10-minute TTL for this table — it remains a short-lived, security-
critical bearer-token record, deleted on completion exactly as it is today, **completely
unaffected by the `otp_requests` cleanup mechanism above.** On abandonment (phone
verified, email never completed), the row is still not deleted — once `expires_at`
passes the token simply stops being accepted, but nothing purges the row itself. Left
as-is deliberately: unlike `otp_requests`, this table has no ordinary-traffic hook to
piggyback a sweep on (a request against an *expired* token is exactly the case that
should be rejected, not the case that runs cleanup logic), so an equivalent zero-infra
fix isn't as natural here. Lower priority than the `otp_requests` case in any event — an
abandoned `pending_identity_verifications` row is one row per abandoned attempt (not one
per retry), and it holds a hashed token, not the same repeated-typo/wrong-number PII
surface `otp_requests` does.

### 3. `signup_funnel_leads` — DROPPED FROM SCOPE (2026-09-28)

**This table is no longer part of the design.** It existed solely to serve the
marketing/re-engagement use case (a persistent list of people who verify their phone but
never finish signup). You decided (2026-09-28) to set the marketing angle aside for this
pass, which removes the table's only reason to exist — tracked as a deferred feature in
`DEFERRED_FEATURES.md` under PRD-05 rather than built now.

For the record, the analysis that led here: this table was never strictly *required*
even for the marketing use case — the same information was derivable from `otp_requests`
(never deleted today) plus a soft-convert change to `pending_identity_verifications`
(`converted_at` instead of a hard delete). The dedicated table was the more isolated
choice (keeps marketing tooling away from a table that also holds `token_hash`, a
security-sensitive column), at the cost of one more table and one more thing to keep in
sync. With marketing out of scope, neither version is needed — there's no consumer left
to design storage for. If this is revisited later, this section's alternative (reusing
`otp_requests` + soft-convert) is the cheaper starting point; the original plan (a
dedicated `stage`-enum table) is in this file's git history if the isolation argument
ends up mattering once a real consumer (e.g., an automated marketing tool) exists.

### 4. `users`, `auth_identities`, `sessions`, `household_members` — NO CHANGES

- `users`: final registration still writes the same row shape (per stakeholder step 9,
  "recorded in the registered user table like done at present"). No new columns.
- `auth_identities`: same two-rows-on-completion pattern (phone_otp + email_otp) that
  today's phone-gate-completion code already does — this redesign just triggers it from
  the opposite starting identity, not a new pattern.
- `sessions`: unaffected.
- `household_members` (PAN storage): unrelated to this flow, unaffected.

**Nothing is deleted.** No table and no existing column is removed by this design — see
`2026-09-28-auth-flow-redesign-tables-changed.md` for the explicit before/after per table.

## Approaches Considered

**Option A — Extend existing tables, no new table (recommended, described above).**
Reuses `otp_requests` and `pending_identity_verifications` exactly as designed, just
allowing `phone_otp` as the initial leg (an application-logic change, zero schema risk to
existing rows). Smallest possible diff; no duplicate OTP-hashing/expiry/attempt-count
logic; the existing Google/email collision-detection code in `identity.py`
(`PROVIDER_PRECEDENCE`, `resolve_email_collision`) continues to be the single source of
truth for identity conflicts, rather than a second parallel system.

**Option B — Build the stakeholder's three named tables literally**
(`phone_unverified_users`, `phone_verified_users`,
`phone_verified_email_unverified_users`), independent of `otp_requests`/
`pending_identity_verifications`. Matches the diagram most literally. Rejected because it
duplicates OTP-hash/expiry/attempt-count handling in new tables, and creates a second,
parallel identity-collision system that has to be kept consistent with `auth_identities`
by hand — meaningfully more surface area to maintain and more ways for the two systems to
drift, for no behavioral benefit over Option A.

*(An earlier draft of this document also weighed a dedicated marketing/funnel-tracking
table — Option C in that draft — as part of this decision. That requirement was set
aside on 2026-09-28 (see item 3 above and `DEFERRED_FEATURES.md`), so it's no longer part
of this comparison; the reasoning is preserved in this file's git history if it's
revisited.)*

Recommendation: **Option A.**

## Migration Plan (proposed, not applied)

Current head: `0016_pending_pan_claims.py`. Proposed:

1. **`0017_otp_request_metadata.py`** — add `ip_address`, `user_agent`, `device_type`,
   `os_family`, `os_version`, `browser_family`, `browser_version`, `device_id`
   (all nullable) to `otp_requests`. Purely additive, reversible by dropping the columns.

That's the entire migration plan — one migration. No migration is needed for the
`pending_identity_verifications` behavior change (item 2 above) — that's an
application-code change in `backend/app/services/auth/identity.py`, not a schema change.
(A second migration for `signup_funnel_leads` was in an earlier draft of this document;
dropped along with that table — see item 3 above.)

This migration is additive-only and reversible; it doesn't touch existing data, so
there's no backfill step and no risk to current staging data.

## Data Classification & Security addendum

No new PII surface is introduced by this design — `otp_requests`'s new columns
(`ip_address`, `user_agent` and its parsed fields, `device_id`) are operational/analytics
metadata on an already-existing table, not a new category of stored personal data beyond
what `Database-Schema-Unifolio.md` already classifies for `phone_number`/`email`.
(An earlier draft flagged a marketing-consent/compliance question here, tied to the now-
dropped `signup_funnel_leads` table — moot with that table out of scope.)

**Retention:** `otp_requests` (including its new metadata columns) is bounded by the
three-part application-logic mechanism in item 1 above — resent attempts collapse into
one row, a completed signup's history is deleted immediately, and unverified rows are
swept after 30 days. `pending_identity_verifications` is unchanged: deleted on
completion, left in place (unpurged) on abandonment.

## Related Documents

- `Docs/PRDs/Database-Schema-Unifolio.md` — current schema of record (§ `auth_identities`,
  `pending_identity_verifications`, `otp_requests`, `sessions`)
- `Docs/superpowers/specs/2026-08-14-multi-method-auth-design.md` — original design of the
  pending-identity/phone-gate mechanism this redesign reuses
- `Docs/PRDs/PRD-02-Signup-Onboarding.md` — FR-2/2a/2b, the current auth requirements this
  redesign amends
- `Docs/PRDs/PRD-05-Auth-Flow-Redesign.md` — full PRD, functional requirements, known-bug
  analysis, open questions
- `2026-09-28-auth-flow-redesign-tables-changed.md` — companion summary table

## Revision History

| Version | Date | Author | Changes |
|---|---|---|---|
| 1.0 | 2026-09-28 | Claude (PM partner) | Initial draft for stakeholder/PM review |
| 1.1 | 2026-09-28 | Claude (PM partner) | Independent review caught that `complete_phone_gate_signup` is not a drop-in reuse for the reversed direction (hardcodes phone as a fixed role, no email-argument slot) — §2 corrected to describe the required function-level change instead of implying a free reversal; fixed an imprecise file attribution for the "never phone_otp" restriction |
| 1.2 | 2026-09-28 | Claude (PM partner) | Added implementation detail for the three MAC-address substitute fields in §1: the ALB/`X-Forwarded-For` handling needed for a correct server-observed IP in this deployment, and the frontend work required for `device_id` (not automatic like IP/User-Agent) |
| 1.3 | 2026-09-28 | Claude (PM partner) | Purpose correction: clarified the real goal is device/platform analytics (phone vs. tablet vs. Windows vs. Mac), not fraud prevention — neither MAC nor IP address would answer that even if MAC were obtainable. Replaced the flat `user_agent` column with a raw `user_agent` + parsed `device_type`/`os_family`/`os_version`/`browser_family`/`browser_version` columns (on both `otp_requests` and `signup_funnel_leads`), added a parsing-implementation note (`user-agents` PyPI package), and updated the migration plan accordingly. Capture scope stays as originally set (OTP-request steps only, per the stakeholder's diagram), not extended to `sessions.device_info` |
| 1.4 | 2026-09-28 | Claude (PM partner) | Dropped `signup_funnel_leads` entirely — its only purpose (marketing/re-engagement) was set aside per your decision, tracked in `DEFERRED_FEATURES.md` under PRD-05 instead. Migration plan now has just one migration (`0017`); simplified "Approaches Considered" and the Data Classification section accordingly. Zero new tables in this design now — only `otp_requests` (altered) and an application-logic change to `pending_identity_verifications` |
| 1.5 | 2026-09-28 | Claude (PM partner) | Two decisions recorded: (1) `ip_address` stays raw-only for this pass — GeoIP parsing (`ip_country`/`ip_region`/`ip_city`/`ip_isp` via MaxMind GeoLite2) considered and deferred, not a one-way door since the raw value is retained; (2) confirmed no cleanup/purge job for `otp_requests` or abandoned `pending_identity_verifications` rows — indefinite retention accepted as-is for this pass, deviating from the stakeholder's literal "delete from all tables" wording, tracked as a deferred item |
| 1.6 | 2026-09-28 | Claude (PM partner) | Superseded 1.5's "leave otp_requests retention as-is" — replaced with a concrete, zero-infrastructure, application-logic mechanism: upsert-on-resend (bounds repeat attempts to one row), delete-on-signup-completion by phone/email value match (no FK), and a 30-day sweep for unverified rows riding on existing OTP-request traffic instead of a scheduled job. Clarified `otp_requests` has no FK to `users` and none is being added — cleanup works by value match, same reasoning as why this table never had an FK in the first place. `pending_identity_verifications`'s 10-minute TTL and deletion behavior confirmed completely unaffected |
