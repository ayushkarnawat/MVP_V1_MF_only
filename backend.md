# Backend Changelog

> Running changelog of backend changes only — endpoints added/changed, services touched, migrations run, dependencies added. Distinct from `Docs/PRDs/TDD-Unifolio.md`, which stays the current-state architecture reference, not a change history. Backfilled 2026-08-14 from `session.md` and `Docs/superpowers/plans/`/`specs/`; append new entries at the bottom, dated, never rewrite past ones.

## 2026-08-04 — Phase 0: foundation

Project scaffold, `Decimal`-safe `calc.py`, SQLAlchemy models, `Base`/`SessionLocal` setup, Alembic wired from day one.

## 2026-08-04 — Phase 1: CAS import backend

`casparser` wrapper, `mfapi.in` enrichment client, two-phase parse/confirm API routes (`backend/app/services/import_/`, `backend/app/api/imports.py`). Migration `0001_initial_schema` — full initial schema (all reference + user-data tables per Database Schema doc, including `otp_requests`/`sessions` as foundational auth tables even though Phase 2's auth logic hadn't landed yet).

## 2026-08-05 — Phase 2: Auth + Onboarding backend

`backend/app/services/auth/` (`otp.py`, `session.py`, `schemas.py`), `backend/app/api/auth.py`: `POST /auth/otp/request`, `POST /auth/otp/verify`, `POST /auth/session/refresh`, `GET`/`PATCH /auth/me`. `POST`/`GET /household-members` (owned by Dashboard service per the TDD's API-ownership table, not Auth). Session tokens: opaque bearer, SHA-256-hashed, 30-day TTL refreshed on activity. OTP: 6-digit, SHA-256-hashed, 5-min expiry, dev-stub delivery mode (`otp_delivery_mode` setting) gating whether the raw code is echoed in the API response.

## 2026-08-06 — Phase 3: Main Dashboard backend

Holdings/allocation compute services and routes (FIFO engine, Decimal throughout).

## 2026-08-06 — Migration 0002: transaction dedupe key widened

`0002_transaction_dedupe_includes_type` — dedupe unique constraint widened to `(folio_id, date, amount, units, type)`, fixing a real duplicate-detection bug (see `decisions.md`).

## 2026-08-07 — Distributor comparison (PRD-03 FR-11)

`GET /household-members/{id}/schemes/{scheme_id}/distributor-comparison` and ARN-directory resolution logic.

## 2026-08-10 to 2026-08-13 — Phase 4: Analytics backend, all 5 parts

- **Part 1 (allocation, FR-1/FR-2):** `analytics/allocation.py`, `analytics/schemas.py`; `GET /analytics/household-members/{id}/allocation`, `GET /analytics/household/aggregate/allocation`.
- **Part 2 (TER/AAUM, FR-10/FR-11):** `analytics/amfi_ter_client.py`, `analytics/amfi_aaum_client.py`, `analytics/ter.py`; `GET .../ter`, `.../ter/direct-regular` (+ aggregate variants).
- **Part 3 (NSE benchmark, FR-8/FR-9):** `analytics/nse_indices_client.py`, `analytics/xirr.py` (pure-Decimal Newton-Raphson, no numpy), `analytics/benchmark.py`; `GET .../benchmark`, `.../benchmark/funds` (+ aggregate variants).
- **Part 4 (category ranking, FR-3/FR-4):** `analytics/scheme_universe.py` (AMFI bulk `NAVAll.txt` ingestion), `analytics/category_ranking.py`; `GET .../category-ranking` (+ aggregate variant).
- **Part 5 (Scorer, FR-5/FR-6/FR-7):** `analytics/risk_metrics.py`, `analytics/scorer.py` (composite fund score + portfolio roll-up); `GET /funds/{scheme_id}/score`, `GET /household-members/{id}/score`, `GET /household/aggregate/score`.

Backend suite grew 156 → 357 passing (2 skipped) across all five parts, verified after each.

## 2026-08-1X — CAS Import lifecycle redesign (intern-authored)

`backend/app/services/import_/state_machine.py` — 11-state import lifecycle enforcing legal transitions; a buffer cache, lifecycle service, and member-attribution logic; coverage-gap detection and opening-balance resolution; a CAMS-portal mailback URL generator and pending-request lifecycle. New `OPENING_BALANCE` transaction type. Migration `0003_cas_import_lifecycle_and_coverage_gaps`. **Not yet independently reviewed by Claude Code** against CLAUDE.md's non-negotiables (Decimal-never-float; PAN now persisted encrypted per ADR-004 as reopened 2026-09-18 — see migration 0015 and Docs/superpowers/specs/2026-09-18-pan-cas-attribution-design.md) — passes the test suite, which is a distinct claim from "reviewed."

## 2026-08-13/14 — Dashboard load-time performance fixes

`backend/app/api/imports.py`'s `confirm_import_route`: background `BackgroundTasks` NAV prefetch on import confirm (Fix A). `backend/app/services/dashboard/nav.py`: new batch function `get_navs_on_or_before`, parallelizing only the pure-network fetch leg via `asyncio.gather` while keeping all DB reads/writes sequential on one `Session` (Fix B); dialect-native `ON CONFLICT DO NOTHING` upsert closing a concurrent-insert race. `backend/app/services/dashboard/holdings.py`: process-local per-day cache for `compute_holdings`, keyed by `(household_member_ids, date.today())`, with a generation-counter + single process-local lock spanning capture/publish/invalidate, and a bounded 15-minute self-healing TTL (Fix D — took 4 review rounds to close correctly, see `decisions.md`/`log.md`). Fix C (the real fix — ADR-006's scheduled recurring NAV-refresh job) remains deferred to deployment phase. Backend suite grew 156 → 326 passing, 2 skipped, across all four rounds.

## 2026-08-14 — Multi-method auth (planned, not yet implemented)

Design finalized (`Docs/superpowers/specs/2026-08-14-multi-method-auth-design.md`) and a full TDD implementation plan written (`Docs/superpowers/plans/2026-08-14-multi-method-auth-backend-plan.md`), covering: new `auth_identities` and `pending_identity_verifications` tables; widened `otp_requests` (nullable `phone_number`/`email`, exactly-one check constraint); new `Session.auth_method` column; a generalized `otp.py` (phone + email channels, one shared code path); a new `EmailProvider` protocol with only a `StubEmailProvider` implementation (Postmark deferred, see `decisions.md`); Google ID-token verification (`google-auth` — new dependency, no client secret needed); an identity/collision-resolution service implementing the account-linking policy and Google > Email > Phone precedence; a mandatory phone-gate signup-completion flow; a new `POST /auth/oauth/google` route; widened `/auth/otp/request`/`/auth/otp/verify` routes; and per-identifier OTP-request throttling. **Not yet executed as of this entry** — this is a plan, not a shipped change; update this entry (or add a new one) once the plan is actually implemented and merged.

## 2026-08-14 — Multi-method auth backend plan: finalized (still unexecuted); five design refinements folded in

The backend implementation plan referenced in the entry above is now complete and self-reviewed (11 tasks) — still not executed as of this entry. Refinements folded into the design before the plan was written: Postmark confirmed as the email provider (SES-vs-Postmark closed, wiring still deferred but now a firm prerequisite before this feature reaches Postgres/production, not open-ended); `pending_identity_verifications` uses one shared ~10-minute TTL for both its triggers; `Session.auth_method` is now a firm part of the plan (Task 4), not an optional follow-up. See `decisions.md` for each "why." The companion frontend implementation plan (`Docs/superpowers/plans/2026-08-14-multi-method-auth-frontend-plan.md`) is also complete — out of this file's backend-only scope, see `log.md`.

## 2026-08-14 — Multi-method auth backend: all 11 tasks implemented via subagent-driven-development

All 11 tasks from the backend plan built via TDD, fresh-subagent-per-task, task-scoped review, on branch `authsetup`: `39db87d` (schema/migration 0004), `0486e64` (`EmailProvider` abstraction, stub-only), `c79757d` (OTP service generalized to email+phone), `c93d0d4` (`Session.auth_method`), `4492202`→`20398d0` (identity resolution + precedence, one fix round for a non-atomic commit bug — see below), `a79ea25`→`cefa32e` (Google ID-token verification, one CRLF fix), `851dab9` (three-way verify-outcome schemas), `332fe6c` (OTP request/verify routes rewrite), `76ee569` (Google OAuth route + dedup), `35781ee` (per-identifier OTP throttling). A small out-of-plan fix (`6165403`, explicitly approved by the user rather than decided unilaterally) updated 3 CAS-import test fixtures still calling the old 2-arg `create_session` signature.

Two review findings worth recording as real bugs, not process noise:
- **Task 6 (identity resolution) — Critical, fixed same-task:** `complete_phone_gate_signup`/`attach_pending_identity` were not atomic — each call inside them independently committed, so a failure partway through could leave a user row without its identity row. Fixed by adding an optional `commit: bool = True` param to `record_identity`/`refresh_denormalized_email` so callers can defer the commit to one outer transaction; verified with a regression test forcing a real unique-constraint failure mid-flow and confirming full rollback.
- **Task 8 (schemas) — a false positive worth remembering:** a reviewer claimed `MeResponse` had been dropped entirely, based on a `git diff -U10` hunk that only *looked* like it omitted the class (limited context window, not actual absence). Verified via direct `git show`/`wc -l` that the class was present all along. Lesson carried into every later reviewer dispatch: never conclude "class X is absent" from a context-limited diff alone — confirm with `git show` first.

**Final whole-branch review** (dispatched on the most capable available model per the skill's model-selection rule) found 2 Critical + 4 Important findings that no single task's review could have caught, since they only emerge across tasks:
- **Critical 1 — unverified-email auto-link laundering:** a Google account with an *unverified* email claim could get that email written into `AuthIdentity.email` during phone-gate completion. Since `resolve_email_collision` treats any matching `AuthIdentity.email` as proof of verified ownership, a later legitimate owner's real email-OTP signup would silently auto-link into the attacker's account instead of creating its own. Fix: gate both write sites in `complete_phone_gate_signup` (and `attach_pending_identity`, extended the same way) on `pending.email_verified`.
- **Critical 2 — no backfill migration for pre-existing users:** the design spec explicitly called for backfilling existing users into `auth_identities` as a one-time migration, flagged there as "planning-phase work, not built here" — but this never actually became a plan task. Combined with Task 9 removing the old direct-phone-lookup path, any pre-existing user would 500 on next login against real data. This is a genuine gap in the plan itself, not an implementer slip — see `database.md`'s 2026-08-14 migration-0004 entry. Fix: new migration `0005_backfill_phone_otp_identities.py`.
- 4 Important findings bundled into the same fix wave: an overly-strict guard in `attach_pending_identity` created a dead end for an existing user's *first* Google sign-in; total absence of email normalization (case/whitespace) defeated the collision-matching system entirely; `create_otp_request` committed the OTP row before attempting the email send, so a provider failure left an orphaned row that self-throttled the user's retry; and 4 of the design spec's own §7 test scenarios had zero actual coverage, contradicting the plan's Final Verification claim.

## 2026-08-14 — Multi-method auth backend: fix wave complete, final review CLEAN, plan done

All 6 findings from the final whole-branch review (2 Critical, 4 Important) fixed in commit `2784b61` (12 files, +1118/-24, 33 net new tests) and independently re-verified twice — once directly by the controller (full suite re-run, direct diff read of every touched file, CRLF check), once by an independent scoped re-review dispatched per the skill's no-second-fix-wave rule. Both passes confirmed all 6 findings genuinely closed, not just claimed closed:
- Critical 1 (unverified-email laundering): every `users.email`/`AuthIdentity.email` write site enumerated and confirmed guarded on `email_verified`.
- Critical 2 (no backfill): new migration `0005_backfill_phone_otp_identities.py` (Core-literals-only, re-runnable, documented no-op downgrade) plus a runtime `find_or_backfill_phone_identity` safety net wired into both phone-channel route lookups.
- The 4 Important findings (dead-end guard, no email normalization, commit-before-send, missing §7 test coverage) all fixed with real, non-vacuous regression tests.
- One additional latent bug found and fixed beyond the 6 findings' literal text: `attach_pending_identity` never flushed before `refresh_denormalized_email` queried for the identity it had just added (both prod and test sessions are `autoflush=False`), so linking silently never updated `users.email` — fixed with an explicit `db.flush()`, which also corrected a second bug where linking a higher-precedence Google identity onto an existing lower-precedence email identity left `users.email` stuck on the old value.

The re-review surfaced 4 new Minor findings in the fix-wave diff itself (a duplicate-pending-token edge case now 500s instead of a clean 401; a narrow check-then-insert race in the new backfill safety net; a real transient email-provider failure would still 500 instead of 503, currently unreachable since Postmark isn't wired up; one cosmetic dead assertion in a new test). All 4 explicitly assessed as not load-bearing and parked with rulings in the SDD ledger rather than triggering a second fix wave, per the skill's process. **Backend suite: 441 passed, 2 skipped, 0 failed, 0 errors.** Full plan (11 tasks + 1 out-of-plan fixture fix + the final review's fix wave) is complete — no further backend work outstanding on this plan. The companion frontend implementation plan remains unexecuted (see `log.md`).

**Clarification confirmed against the frontend plan's assumptions (2026-08-14):** the 503/`NoEmailProviderConfiguredError` path referenced just above is correctly described as "currently unreachable" — verified this is true under the app's actual default config, not just true in principle. `otp_delivery_mode` defaults to `"stub"` and is one setting shared by both channels; in stub mode `create_otp_request` never calls into `EmailProvider` at all (same short-circuit phone's channel already takes), so email's stub behavior is byte-for-byte identical to phone's — OTP generated, stored, and returned in the response's `otp` field, a 200 every time. The 503 only fires if `OTP_DELIVERY_MODE` is deliberately set to a real value (exercised only via explicit test monkeypatching). See `decisions.md`'s matching 2026-08-14 entry for the full trace — the frontend plan needs no special-case error handling for this case as a result.

## 2026-08-17 — `requests` declared as an explicit backend dependency

`backend/app/services/auth/google_oauth.py` imports `google.auth.transport.requests`, which needs the `requests` package — it had only ever been present as `google-auth`'s transitive dependency, never pinned directly in `requirements.txt`. Added `requests>=2.31.0` explicitly (commit `5bb63c3`), verified with a genuinely fresh virtualenv (not the existing dev environment): clean `pip install -r requirements.txt`, then a full `uvicorn` boot with zero `ImportError`s. **Why:** relying on a transitive dependency for something a module directly imports is fragile — a future `google-auth` version could drop or restructure that dependency without warning, silently breaking Google sign-in in a way `pip install` wouldn't catch until runtime.

## 2026-08-17 — Multi-method auth frontend plan: complete, final review clean

All 10 tasks + 1 out-of-plan `App.test.tsx` fix + the final whole-branch review's 1 Critical/6 Important findings, fixed and independently re-verified twice. Full detail in `log.md`'s 2026-08-15–17 entry and `decisions.md`. **Both multi-method-auth plans (backend and frontend) are now fully complete** — the auth remodel started earlier this session is done end to end: Google Sign-In, email+OTP, and phone+OTP all work as equal entry points, backed by the mandatory phone-gate invariant and step-up-only account linking, verified end-to-end against a real running backend with real (pre-existing, non-synthetic) user data.

## 2026-08-17 — Email+password auth backend complete (Superseded)

Replaces email+OTP with email+password (Google and phone+OTP unchanged).
New: `password.py` (bcrypt hashing), `password_reset.py` and
`email_confirmation.py`. Migration `0006_email_password_auth`.
*(Superseded by 2026-08-17/18 reversal below).*

## 2026-08-17/18 — Pure Email-OTP Auth restoration & Password removal

Reversed password auth completely across all backend routes and schema.
Migration `0007_email_otp_signup` and `0008_remove_password_auth`:
- Reactivated `EMAIL_OTP` as the active email auth provider in `AuthIdentity`.
- Removed `password.py`, `password_reset.py`, `email_confirmation.py`, and dropped `password_reset_tokens` / `email_confirmation_tokens` tables.
- Generalized `otp.py` across email and phone channels with SHA-256 hashed 6-digit codes and per-identifier 60s cooldowns.
- Endpoints: `POST /auth/signup/email` (initiates email OTP send), `POST /auth/email-otp/request`, `POST /auth/email-otp/verify` (verifies code, attaches identity or transitions to mandatory phone gate).
- Step-up account linking verified with `peek_pending_matched_user_id` security check against pre-emptive identity takeover.
- Backend suite: 449 passed, 2 skipped, 0 failed.

## 2026-08-19 — CORS Multi-Port Dev Support & Regex Configuration

Updated `backend/app/main.py` `CORSMiddleware`:
- Added `allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$"` alongside the standard origin list (`http://localhost:5173`, `http://localhost:5174`, `http://localhost:5175`, `http://localhost:3000`).
- Prevents CORS preflight `OPTIONS` failure when the frontend dev server auto-allocates port 5174 or 5175.
- Automated tests added to `backend/tests/test_health.py` covering multi-port preflight headers.

## 2026-08-24/26 — AMFI TER concurrency lowered to 5; PDF export Allocation section fixed; `commit_off_loop` event-loop fix

`_TER_FETCH_CONCURRENCY` 20→5 (AMFI's TER-page endpoint 429s above that). `AllocationSection.tsx` gained a `printMode` prop (mirroring `BenchmarkSection`'s existing pattern) and `AllocationDonut`/`PieSlice` gained a non-animated static render path, fixing the PDF export's donut/AMC-breakdown bugs. Root-caused a colleague's AMFI TER `ReadTimeout`s to event-loop starvation from a blocking `db.commit()` inside an `async def` (this backend's SQLAlchemy engine is fully synchronous, single worker) — added `commit_off_loop` (`asyncio.to_thread`) and rewired every reachable commit across 8 service files. Full detail: `log.md`.

## 2026-09-02/03 — Compliance-audit remediation: N+1 fix, self-member uniqueness, PAN-based attribution v1

`compute_holdings`'s per-folio `Transaction` query batched into one query across all folios (F7). `DuplicateSelfMemberError` 409 guard added to `create_household_member` (F3, migration 0011). ADR-006's 4 job-entrypoint scripts added (daily NAV refresh, monthly TER, quarterly AAUM, daily benchmark) plus `amfi_aaum_client.refresh_aaum_data` wired to a real caller (F4 piece a — the EventBridge/ECS Terraform itself stays deferred). NAV-unavailable degraded row shipped for holdings/allocation/aggregates (F8) — a held scheme with no obtainable NAV now shows a flagged row instead of silently vanishing. `attribution.py` gained a non-PAN duplicate-person design: same-user cross-household-member dedup via a `(folio_number, amc_name)` signal, plus an advisory-only `detect_cross_account_duplicate` check that never blocks or merges. Round 2 wired this into both parallel import backends (`service.py` and `lifecycle_service.py`) via a shared `enforce_attribution_confirmation` gate.

## 2026-09-10 — Analytics precompute contract; account deletion; import history/delete

`GET /analytics/{scope}` replaces the 14 per-section analytics routes, backed by migrations 0012/0014's precompute-cache tables with cold-start/recompute-generation tracking. Account deletion (5-day grace period, exit survey, household cascade, migration 0013), email/phone change via OTP, import history + delete-import, and several smaller dashboard additions (header XIRR, allocation sort toggle, AMC/asset-class drill-down) shipped as part of the investor 10-item batch.

## 2026-09-12 — Fund Score API fields extended for the card redesign

`FundScoreRow` gained new raw-evidence fields (kept optional/nullable so a stale precompute-cache row missing them entirely — not null — doesn't break the frontend's loose-equality checks). Score itself is unchanged server-side (raw 0-100); the /10 display and reversed tier convention are frontend-only.

## 2026-09-17 — Real email delivery: PostmarkEmailProvider; independent `email_delivery_mode`

First real (non-stub) `EmailProvider` implementation, `PostmarkEmailProvider`, added behind the existing protocol from the 2026-08-14 multi-method-auth design. `email_delivery_mode` split into its own setting, independent of phone/SMS's `otp_delivery_mode` — an autouse test fixture now guards every test against picking up a live local `.env` value for either.

## 2026-09-18 — ADR-004 reopened: PAN persisted encrypted, CAS file retained; attribution rewritten to match by PAN

New `backend/app/services/import_/crypto.py` (AES-256-GCM envelope encryption + HMAC-SHA256 lookup hash for PAN). New local CAS file storage with a 30-day expiry sweep (migration 0015). `ParsedInvestor` now carries the raw PAN through parsing for attribution matching. `attribution.py` rewritten: PAN match within the same household auto-attributes; a PAN already claimed by a different account raises `CrossAccountPanBlockedError`; falls back to folio+AMC matching when the CAS has no PAN; `backfill_pan_if_missing()` captures PAN on first successful match. Wired into both the sync confirm path and the async CAS-upload path. `tests/models/test_no_pan_field.py`'s guard broadened (not removed) to assert PAN only ever lives in the two new encrypted/hashed columns, on every mapped model.

## 2026-09-19 — Cross-account PAN block surfaced as a popup instead of a silent freeze

Family's CAS upload flow previously froze with no explanation when `CrossAccountPanBlockedError` fired; now surfaces an explicit "Import blocked" popup.

## 2026-09-22 — Phone-gate collision fixed; SES email provider added; Postmark's send-failure path hardened

Signup's phone gate no longer silently signs a caller into an unrelated existing account on a phone match — now a 409 "already exists, log in instead," matching email's behavior, checked at `otp/request` time instead of `otp/verify` time. `SesEmailProvider` added behind the existing `EmailProvider` abstraction (IAM-role `boto3` auth, no new secret store). Both Postmark and SES now raise a shared `EmailSendError` on any send failure, caught once per route and mapped to a `502` (was an unhandled `500`); a failed send no longer leaves behind a persisted `OtpRequest` row.

## 2026-09-23 — Postmark provider removed entirely; HTML email templates added

`PostmarkEmailProvider` and its Terraform secrets/variables deleted (SES is now the sole real provider) — a deliberate "don't keep it dormant" simplicity choice, not a cost-driven one (dormant cost would have been $0). Responsive HTML templates added for both the email-OTP-verification and email-OTP-signup emails, with unit tests; a desktop alignment bug in the template fixed the next day.

## 2026-09-24 — PAN attribution moved from Confirm-time to upload-time

`attribution.py` replaced by `backend/app/services/import_/pan_claims.py`. `/imports/parse` now takes `household_member_id` and claims the parsed PAN as *pending* for that member immediately (migration 0016's `pan_pending_until`); conflicts return a 409 (`cross_account_pan_blocked` / `pan_belongs_to_other_member` / `pan_mismatch_for_member`) right after upload rather than at Confirm. `/imports/confirm` only finalizes — no `confirmed_member_override`, no prompts. New `POST /imports/sessions/{id}/discard` releases an abandoned pending claim. `/cas-imports` claims permanently inline. Fix-round findings: the PAN claim was moved to *after* mfapi enrichment so SQLite's write lock isn't held across the network call; a lost unique-index race now retries instead of 500ing. **Known gap, not yet built** (drafted as a plan, no code written): a family CAS statement covering several people is only ever attributed to the *first* folio's PAN holder — `casparser` exposes PAN per-folio but folios carry no holder name, so a multi-person statement silently imports everyone's funds under one member. See `Docs/superpowers/plans/2026-09-24-per-pan-statement-splitting.md`.

## 2026-09-29 — CAS member detection backend (Tasks 1-13; uncommitted at time of writing)

Spec: `Docs/orchestration/cas-member-detection-map.html`. Plan: `Docs/superpowers/plans/2026-09-29-cas-member-detection.md`. Schema: migration `0018` (see `database.md`).

**Import flow changes (`backend/app/api/imports.py`):**
- `POST /imports/parse` now returns a preview listing every person found (`people[]`, `unassigned[]`, name check). Its only write is the pending PAN claim for the self member; `household_member_id` is the upload target. A cross-account PAN can 409 `cross_account_pan_blocked` with the session kept (U7/U8).
- `POST /imports/confirm` accepts `people: [{person_key, name?, include?, scheme_confirmations[], moved_funds[]}]` (plus `session_id`); the old single-member body (`household_member_id` + `scheme_confirmations`) is still accepted for a one-person file. One transaction for the whole file; one recompute claim for the household. An expired/locked session is now 410 `session_expired` (previously 404).
- New session-scoped prompt routes, all plain `def` and returning the refreshed preview: `POST /imports/sessions/{id}/resolve-name`, `/resolve-self`, `/resolve-pan`, `/resolve-same-person`, and `/acknowledge` (a deviation from the spec, see `decisions.md`). `POST /imports/sessions/{id}/discard` unchanged.
- `GET /imports/history` stays a flat list, now with `upload_group_id`, `member_name`, `group_people_count`; the frontend groups by `upload_group_id` (spec deviation F26).
- `DELETE /imports/{import_id}?scope=person|group` (default `person`); response `DeleteImportResponse` gained `removed_member_ids` and `deleted_file`.

**Member routes (`backend/app/api/dashboard.py`):**
- `POST /household-members/{member_id}/details` — unlock (relationship, name, PAN; L1-L8 error codes) and later edits (L9). 409 on PAN conflicts, 422 on validation.
- `POST /household-members/{member_id}/merge-into/{target_id}` — merge a name-only detected member into another; returns `{folios_moved, transactions_dropped}`.
- `DELETE /household-members/{member_id}/portfolio?remove_member=bool` — delete a member's whole portfolio (M17).
- Member-scoped reads and the analytics export/pdf member scope are server-side gated: a locked member answers 403 `member_details_required` (I12).

**`POST /cas-imports`** (`backend/app/api/cas_imports.py`) no longer imports anything; it answers 409 `review_required` so no path skips people detection (M18). Hard-delete file removal lives in the expired-account job `hard_delete_expired_accounts` (via `account_deletion.py`), not in the `/account` route itself; it now also deletes stored CAS files.

**New modules:** `services/import_/{name_match,people,people_resolution,confirm_people,deletion}.py`, `services/dashboard/{member_details,member_merge}.py`, `models/member_history.py`, `db/member_trigger_sql.py`. `pan_claims.py`, `parser.py` (holder-name extraction), `file_storage.py` (group-level PDF sharing/cleanup) and `service.py` extended.

**Verification caveats:** `tests/functional_postgres` never run (no Docker in WSL); holder-name extraction validated only on synthetic CAMS/KFintech lines (no real PDFs on disk).


## 2026-09-30 — Staging QA fixes

- **Auth (`api/auth.py`, `services/auth/schemas.py`):** `OtpRequestBody.flow` ("signup"/"login") and `EmailOtpRequestBody.flow` ("login"). With no `pending_token`, `/auth/otp/request` returns 409 for a registered phone on sign-up and 404 for an unknown phone on login; `/auth/email-otp/request` returns 404 for an unknown email on login. `/auth/otp/verify` with `flow="signup"` and a registered phone is now 409 instead of logging in.
- **`/auth/me`:** `primary_goals: list[PrimaryGoal]` replaces `primary_goal` in `MeResponse` and `UpdateMeBody` (deduped, 1–4 items); `PATCH` also writes `primary_goal` = first item until migration 0023 (the primary_goal drop).
- **Unlock (`POST /household-members/{id}/details`):** `pan` optional, new `use_detected_pan`; exactly one required, else 422 `invalid_member_details`. `pan_belongs_to_other_member` details gain `source_pan_label`; `can_merge` is also true when the locked source's detected PAN equals the holder's PAN. `merge-into` allows that source too and marks the target's typed PAN verified.
- **People resolution (`people_resolution.py`, `service.py`, `confirm_people.py`):** `find_member_by_exact_name` (PAN-less person → one exact-name member, `PersonPlan.matched_by_name`), `find_name_only_member` + `has_no_pan` (PAN person → name-only member, asked via `SamePersonPrompt` with new `kind` / `member_fund_count` / `statement_name`). `resolve-same-person` "Yes" links a locked name-only member (detected PAN written at Confirm) or claims a pending PAN on an unlocked one. `_resolve_member` repeats the exact-name lookup at Confirm.
- **Parser / confirm:** `ParseResult.statement_from` / `statement_to` from casparser's `statement_period` (`parse_statement_date`); every `Import` row now gets `statement_from_date` / `statement_to_date`.
- **Tests:** the fixture-PDF tests read `UNIFOLIO_QA_FIXTURES` (default `Docs/orchestration/qa-fixtures/synthetic-cas`) and skip when the PDFs aren't on disk.
- **Final-review fixes:** `find_member_by_exact_name` / `find_name_only_member` exclude `relationship = self`; `_advance` lets the upload target replace a `matched_by_name` plan; `_confirm_claimed` raises `ConfirmInvalidError` if a locked member's detected PAN differs from the linked person's PAN; `parse_statement_date` (and 0020's copy) accept ISO datetimes. Four new synthetic route tests cover 5B without the fixture PDFs.


## 2026-10-01 — Consent, onboarding and profile changes (uncommitted, awaiting review)

- **No new secret.** `consent_records.ip_hmac` uses a key derived from `PAN_LOOKUP_PEPPER` (`HMAC-SHA256(pepper, "unifolio/consent-ip-hmac/v1")`, `app/services/legal/consent.py`), so staging needs no Secrets Manager/Terraform change. (An earlier draft used a separate `CONSENT_IP_HMAC_KEY`; dropped 2026-10-01.) Test-only setting `legacy_unflowed_phone_signup`.
- **Legal (`app/services/legal/{registry,consent}.py`, placeholder texts in `documents/*.md`; versions `tos-placeholder-2026-10-01`, `privacy-placeholder-2026-10-01`, `pan-disclaimer-placeholder-2026-10-01`):** `GET /legal/documents`, `POST /legal/consents` (re-consent), `GET /legal/consents/me`.
- **Consent enforcement:** sign-up bodies (phone, email, Google) take `accepted_documents`; missing/stale → 422 `consent_required`. A flow-less phone sign-up is 400 `flow_required` (unless `legacy_unflowed_phone_signup`). Upload takes form field `pan_disclaimer_version` and header `X-Upload-Surface` (`onboarding_upload` / `import_upload` / `mobile_upload`; default `import_upload`); CAMS request body takes `pan_disclaimer_version`; both 422 `consent_required` when stale. `/auth/reactivate` requires `accepted_documents`. Scheduling account deletion writes `withdrawn` rows; consent rows are never updated or deleted by app code.
- **`/auth/me`:** gains `self_name` and `consent_outdated` (documents needing re-consent). Name is saved at the onboarding name step (self member created then; provisional rename on re-submit, replaced by the CAS name later — QA). Frontend `resumeStep` in `OnboardingFlow` decides where an unfinished user resumes.
- **Members — name and PAN come from the CAS:** `POST /household-members/{id}/details` is unlock-only: relationship, plus PAN only when the statement carried none (QC); 422 `field_not_editable` for anything else, name edits included (`name_not_editable` comes only from the people-popup/confirm path). New `PATCH /household-members/{id}` edits relationship/phone/email only. `plan_member_name_update` (`people_resolution.py`) applies the statement name; resolve-name uses the statement name.
- **Scripts:** `backend/scripts/report_onboarding_goals.py` (goal report; "Why choose? All of it." is a UI shortcut that stores all 4 goals — Q7), `backend/scripts/consent_trail.py` (print a user's consent rows).
- **OTP email:** logo removed, green text instead of a highlight.
- **Verification caveats:** `functional_postgres` tests not run (no Postgres); family-CAS fixture-backed tests skip (fixtures absent).

## 2026-10-01 — Member profile completion (replaces the detected-member lock)

Plan `Docs/superpowers/plans/2026-10-01-member-profile-completion.md`; spec `Docs/orchestration/member-profile-completion-map.html`. Built subagent-driven in 10 tasks (Tasks 1-2 committed as `0a0152a`..`3a4852e`; the rest uncommitted at the time of writing).

- **New route:** `PUT /household-members/{id}/profile` (plain `def`, `member_profile.py`: `MemberProfileRequest`, `save_member_profile`). Optional name, PAN, relationship, phone, email. 422 `pan_required` (nothing written) when the member has no PAN of any kind and none is typed; 409 on a duplicate PAN with `can_merge` (merge only for `origin=cas_detected` sources); a PAN another account holds is saved as `pan_conflict`, not rejected. Self: phone/email read-only (from `users`), relationship fixed, only the name editable.
- **Removed:** `POST /household-members/{id}/details` and `PATCH /household-members/{id}` (`member_update.py` deleted, `complete_member_details` and `MemberLockReason` gone); the 403 `member_details_required` read gate (`require_unlocked_member` replaced by `require_member`, 404 only); the import prompts tied to the lock.
- **Response shape:** `HouseholdMemberResponse` drops `lock_reason`, `details_required`, `pan_on_statement`; gains `missing_profile_fields`, `completion_percent` (5 fields x 20%, computed on read, `profile_completion.py`), `pan_editable`, `pan_conflict`, `removed_with_last_import`. `GET /household-members` runs `refresh_pan_conflicts` (promotes a released other-account PAN, survives a lost unique-index race).
- **Import:** Confirm saves each detected member's name and PAN through `store_detected_pan` (same encryption/columns as Self's); no upload-time PAN reservation for non-Self members (Add data included), so an other-account PAN starts the review and becomes `pan_conflict`. A popup-edited name (`name_source=user_edited`) follows the normal CAS name rules on later imports. Deleting a detected member's last import keeps the member once it has profile data.
- **Verification caveats:** migration 0023's Postgres paths unverified (`functional_postgres` skipped, no `TEST_DATABASE_URL`); run before deploy. Not deployed.
