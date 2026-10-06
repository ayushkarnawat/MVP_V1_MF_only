# Database Changelog

> Running changelog of database/schema changes only — tables/columns added or changed, migrations, index/constraint changes. Distinct from `Docs/PRDs/Database-Schema-Unifolio.md`, which stays the current schema as it stands today, not a change history. This file records changes that have actually been migrated, not designed/planned changes still awaiting implementation — see `backend.md`/`decisions.md` for in-progress schema work not yet landed. Backfilled 2026-08-14; append new entries at the bottom, dated, never rewrite past ones.

## 2026-08-04 — Migration 0001: initial schema

`0001_initial_schema` — every table from the Database Schema doc's v1.1: `users`, `household_members`, `imports`, `schemes`, `folios`, `transactions` (partitioned by `RANGE(date)`, yearly), `nav_history` (partitioned, yearly), `scheme_ter`, `scheme_aaum`, `benchmark_index_history`, `arn_directory`, `portfolio_snapshots`, `fund_scores`, `otp_requests`, `sessions`. `users.phone_number`: `UNIQUE NOT NULL` from day one. All money/units/NAV columns `NUMERIC`, never `FLOAT`. PAN is now persisted on `household_members.pan_encrypted`/`pan_lookup_hash` (migration `0015`); the raw CAS PDF is retained 30 days then deleted, outside the primary DB. ADR-004 reopened 2026-09-18 — see Docs/superpowers/specs/2026-09-18-pan-cas-attribution-design.md.

## 2026-08-06 — Migration 0002: transaction dedupe constraint widened

`0002_transaction_dedupe_includes_type` — `transactions`' dedupe unique constraint widened from `(folio_id, date, amount, units)` to `(folio_id, date, amount, units, type)`. No data transformation; existing rows untouched, only the duplicate-detection rule going forward changes. Dialect-aware migration (SQLite batch-mode table recreation vs. Postgres `DROP`/`ADD CONSTRAINT`).

## 2026-08-1X — Migration 0003: CAS import lifecycle and coverage gaps

`0003_cas_import_lifecycle_and_coverage_gaps` — `imports` gains `error_code`, `error_message`, `source_tab`, `statement_from_date`, `statement_to_date`, `expires_at` (all nullable). `folios` gains `has_coverage_gap` (`BOOLEAN NOT NULL`, default false) and `coverage_gap_details` (JSON — Postgres `JSONB`, SQLite generic `JSON`; note this predates the Migration Plan guardrail doc's explicit "no dialect-specific JSON literal" guidance being checked against new work, see `decisions.md`'s 2026-08-14 entry on the multi-method-auth schema being the first design explicitly confirmed compliant). New `TransactionType` enum value: `opening_balance`.

## 2026-08-14 — Migration 0004 landed: multi-method auth schema

Built, tested, and committed as Task 1 of `Docs/superpowers/plans/2026-08-14-multi-method-auth-backend-plan.md` (commit `39db87d`, migration `0004_multi_method_auth_identities`), with an upgrade/downgrade round-trip test. Actual changes:
- New table `auth_identities` — one row per linked auth method (`phone_otp`/`email_otp`/`google`) per user; `UNIQUE(provider, provider_subject)`.
- New table `pending_identity_verifications` — holds a verified-but-not-yet-attached Google/email identity during the mandatory phone-gate or account-linking step-up flow.
- `otp_requests`: `phone_number` becomes nullable, new nullable `email` column, new check constraint enforcing exactly one of the two is set.
- `sessions`: new `auth_method` column (`NOT NULL`, backfilled to `phone_otp` for pre-existing rows).
- `users.phone_number` is explicitly **unchanged** — stays `UNIQUE NOT NULL` as it has been since migration 0001 (an earlier design draft would have loosened this; reversed before implementation — see `decisions.md`).

Landing this migration also removed every OTP/session-related route's old direct-phone-lookup code path (Task 9) — every login now resolves through `auth_identities`. That created a real gap the implementation plan itself missed: **no migration was ever written to backfill existing `users` rows into `auth_identities`.** Flagged as Critical Finding 2 of the final whole-branch review (see `backend.md` and `log.md`'s 2026-08-14 entries) and closed in the same session: migration `0005_backfill_phone_otp_identities.py` now does the one-time backfill (Core-literals-only, re-runnable, documented no-op downgrade), landed as part of commit `2784b61`, independently re-verified clean.

**Local-dev gotcha confirmed 2026-08-15:** a pre-existing `unifolio_dev.db` (SQLite) that predates this feature stays pinned at whatever revision it was last migrated to — starting the backend against it does NOT auto-apply new migrations. This surfaced as a real `/auth/otp/request` failure for the email channel (`otp_requests.email` didn't exist on disk yet, `alembic current` showed `0003` against a `0005` head). Fixed by running `alembic upgrade head`, confirmed directly against the SQLite schema (not just alembic's own bookkeeping) — `otp_requests` gained `email`/lost its `phone_number NOT NULL`, both new tables and `sessions.auth_method` all present. Then confirmed end-to-end against the running server: a genuine pre-2026-08-14 user (created before this feature existed) logged in successfully via phone — direct proof the 0005 backfill correctly protects real, not just synthetic, data — and a fresh email signup correctly triggered `phone_required`. **Why this matters:** anyone picking up `authsetup` fresh with an existing dev DB needs `alembic upgrade head` before testing this feature, not just `pip install`+ run.

## 2026-08-17 — Migration 0006: email+password auth (Superseded)

`0006_email_password_auth` — added `EMAIL_PASSWORD` to enum, `password_hash` columns, and password reset/email confirmation tables. *(Superseded by migrations 0007/0008 below).*

## 2026-08-17/18 — Migration 0007 & 0008: Email-OTP Signup and Full Password Removal

- **`0007_email_otp_signup`**: Widened `otp_requests` check constraint to support both email and phone channels; generalized `otp_requests` for inline email OTP verification.
- **`0008_remove_password_auth`**: Fully dropped `password_reset_tokens` and `email_confirmation_tokens` tables. Dropped `password_hash` and `email_confirmed_at` from `auth_identities` and `pending_identity_verifications`.
- Enum state: `EMAIL_OTP` is active; `EMAIL_PASSWORD` remains defined in the DB enum as an unused benched value (since Postgres cannot cheaply drop enum values).
- Schema is 100% clean, verified with `alembic upgrade head` and 449 passing tests.

## 2026-09-02 — Migrations 0009-0011: compliance-audit fixes (F5/F3), Postgres JSON idiom

- **`0009_scheme_ter_nullable_value`**: no schema-shape change beyond documenting `scheme_ter.ter_value`'s existing nullability as "checked, no match" rather than "not yet checked."
- **`0010_widen_import_and_transaction_enums`**: widens the `importstatus` native Postgres enum and rebuilds the `transactions_type_check` CHECK constraint to include `opening_balance` — closes a real enum-drift gap (migration 0003 added the value to the ORM/SQLite CHECK but never to the Postgres-native enum type).
- **`0011_household_members_one_self_row`**: partial unique index on `household_members(user_id) WHERE relationship = 'self'`, via `sqlite_where=`/`postgresql_where=` on one `op.create_index` call. A read-only check against the dev DB first confirmed zero existing violations, so no data-migration remediation was needed. Paired with a `DuplicateSelfMemberError` → 409 application guard.

## 2026-09-10 — Migrations 0012/0013/0014: Analytics precompute, account deletion, recompute generation tracking

- **`0012_analytics_sections`**: backing tables for the Analytics precompute contract (`GET /analytics/{scope}` replacing the 14 deleted per-section endpoints).
- **`0013_account_deletion_grace_period`**: schema for the investor-batch account-deletion feature (5-day grace period + exit survey + household cascade).
- **`0014_analytics_recompute_generation`**: generation/versioning column(s) so a stale precompute-cache row can be detected and invalidated rather than served forever.

## 2026-09-18/24 — Migrations 0015/0016: PAN persistence, CAS file retention, upload-time PAN claims (ADR-004 reopened)

- **`0015_pan_and_cas_file_storage`**: `household_members` gains `pan_encrypted` (AES-256-GCM envelope-encrypted, base64) and `pan_lookup_hash` (HMAC-SHA256, deterministic, for equality matching without decrypting another household's PAN) — the lookup-hash index was made `UNIQUE` in a same-day review fix (nullable-safe on both dialects; only non-null hashes are constrained distinct). `imports` gains `file_reference` (opaque storage key for the retained CAS PDF; local disk in dev, S3 in production) and `file_expires_at` (30 days from upload, swept by a manual CLI entry point). Supersedes the original ADR-004 "no PAN, no raw file" decision — see `decisions.md`.
- **`0016_pending_pan_claims`**: `household_members.pan_pending_until` — non-null means the PAN above is an upload-time claim not yet finalized by Confirm Import (released on discard or after a 65-minute timeout). Moves the PAN check/claim from Confirm-time to upload-time; see `decisions.md`'s 2026-09-24 entry.

`Database-Schema-Unifolio.md` stays synced through 0016 (checked current as of this pass).

## 2026-09-29 — Migration 0018: CAS member detection (uncommitted at time of writing)

- **`0018_cas_member_detection`**: `household_members` gains `origin`, `name_source` (both NOT NULL with server defaults `manual` / `user_entered`), `name_updated_at`, `details_completed_at`, `lock_reason`, `pan_source`, `pan_verified_at`, `detected_pan_encrypted`, `detected_pan_hash`, `detected_from_import_id` (FK to `imports`, `ON DELETE SET NULL`); `relationship` becomes nullable. Four CHECK constraints (`ck_member_relationship_when_complete`, `ck_member_other_label`, `ck_member_lock_reason`, `ck_member_detected_pan_pair`) and index `ix_member_user_detected_pan_hash (user_id, detected_pan_hash)`. `imports` gains `upload_group_id` (indexed). New audit tables `household_member_name_changes` and `household_member_merges`.
- **Never-relock trigger** `trg_member_never_relock` (SQLite trigger; Postgres function `member_never_relock()` plus trigger) rejects any update that clears `details_completed_at` or sets `lock_reason` on an unlocked member (I15). Created after the batch block because the SQLite batch rebuild drops triggers; SQL is a frozen copy of `app/db/member_trigger_sql.py`.
- **Postgres specifics**: the four `household_members` enum types are created explicitly (`op.add_column` does not emit `CREATE TYPE`) and named by the codebase convention (`memberorigin`, `membernamesource`, `memberpansource`, `memberlockreason`, `namechangereason`), not the spec's snake_case. On SQLite, the nullability change, CHECKs and the FK go through one `batch_alter_table` (plain `add_column` silently skips the FK).
- **No backfill**: the DB is wiped before testing (M20); the CHECKs would reject pre-existing member rows. Downgrade assumes no locked members.
- **Not verified on Postgres**: `tests/functional_postgres` was never run (no Docker in WSL). Run it once against a local Postgres before merge.

`Database-Schema-Unifolio.md` is synced through 0018 (v1.6).


## 2026-09-30 — Migrations 0019, 0020 (staging QA fixes)

- **`0019_user_primary_goals`** (expand phase): `users.primary_goals` — JSONB on Postgres with CHECK `ck_users_primary_goals_allowed` (array of 1–4 items, contained in the four allowed goals; written as a CASE so a scalar fails the CHECK instead of raising), JSON on SQLite. Backfilled from `primary_goal`; `primary_goal` is kept for rolling deploys. **Not run on Postgres** (no TEST_DATABASE_URL).
- **`0020_import_statement_period_backfill`** (data only): fills `imports.statement_from_date` / `statement_to_date` from `raw_parser_output.statement_period` (`from_` or `from`, `DD-Mon-YYYY` or ISO); unreadable rows stay NULL. Downgrade is a no-op.
- **Pending, later release — `0023`** (was reserved as "0021"): re-backfill `primary_goals` from `primary_goal` for rows old tasks wrote during the rollout, then drop `users.primary_goal` and the `primarygoal` enum type.

`Database-Schema-Unifolio.md` synced through 0020 (v1.7).


## 2026-10-01 — Migrations 0021, 0022 (consent, onboarding and profile changes) — uncommitted, awaiting review

- **`0021_member_contact_fields`**: `household_members.phone_number` and `email` (nullable strings; contact info only, unverified — Q8). Self member shows the account phone/email read-only (Q9). No backfill (QE).
- **`0022_consent_records`**: new table `consent_records` (append-only audit trail): `id`, `user_id`, `action` (given/withdrawn), `purpose_code`, `document_type` (tos/privacy/pan_disclaimer), `document_version`, `document_sha256`, `recorded_at`, `surface`, `ip_truncated` (IPv4 /24, IPv6 /48), `ip_hmac` (HMAC-SHA256 under a key derived from `PAN_LOOKUP_PEPPER` with a fixed label; raw IPs are never stored), `user_agent`, `device_id`, `related_import_id`, `related_file_sha256`. Index on `(user_id, purpose_code, recorded_at)`. **Deliberately no foreign keys**, so a user hard-delete neither cascades into nor is blocked by these rows; per Q6 they are kept indefinitely (no retention job).
- **Append-only triggers**: SQLite `trg_consent_no_update` / `trg_consent_no_delete`; Postgres function `consent_records_append_only()` plus trigger `trg_consent_append_only` (BEFORE UPDATE OR DELETE). SQL is a frozen copy of `app/db/consent_trigger_sql.py`. The model also attaches the triggers via `after_create` so `create_all` test DBs get them.
- **`pending_identity_verifications.consent_snapshot`**: the sign-up consent the user accepted is held here until the OTP verifies, then written as `consent_records` rows.
- **Not verified on Postgres**: `tests/functional_postgres` (cascade deletes, trigger test) could not be run — no Postgres available in the session. Run once before merge.
- Pending, now numbered **0023**: drop `users.primary_goal` (see `DEFERRED_FEATURES.md`; it was reserved as "0021").

## 2026-10-01 — Migration 0023: member profile completion

`0023_member_profile_completion` (down_revision `0022`) — written and tested on SQLite only; not yet applied anywhere. Postgres paths unverified (`functional_postgres` skipped, no `TEST_DATABASE_URL`): run before deploy.
- `household_members`: drops `details_completed_at`, `lock_reason`, `ck_member_relationship_when_complete`, `ck_member_lock_reason` and the never-relock trigger (SQLite `trg_member_never_relock` / Postgres `member_never_relock()`). Adds `pan_conflict` (`memberpanconflict`, `other_account`) with CHECK `ck_member_pan_conflict_has_pan`. `MemberNameSource` gains `user_edited`.
- **Backfill:** a locked row's `detected_pan_*` is copied into `pan_encrypted` / `pan_lookup_hash` (`pan_source='cas'`, verified now), only for the earliest row per hash and only when no row already holds that hash; rows whose PAN another account holds (and later same-account duplicates) keep `detected_pan_*` and are flagged `pan_conflict='other_account'`.
- Downgrade restores the columns and trigger from a frozen SQL copy.
- The deferred `users.primary_goal` drop is renumbered 0023 -> **0024** (`DEFERRED_FEATURES.md`).

## 2026-10-06 — Migration 0025: transaction origin and cost source

`0025_transaction_origin_cost_source` (down_revision `0023`; 0024 stays reserved for the deferred `users.primary_goal` drop) — `transactions` gains `origin` (`VARCHAR(16)` NOT NULL DEFAULT `'cas_row'`, CHECK `cas_row`/`cas_opening`/`manual`) and `cost_source` (`VARCHAR(16)` NULLABLE, CHECK `cas_cost`/`nav_on_start`/`manual`). VARCHAR + CHECK on Postgres to match the partitioned table's existing convention (see 0010); `ADD COLUMN` on the parent propagates to every partition. Data step: every existing `opening_balance` row becomes `origin='manual'`, `cost_source='manual'` (only the manual modal wrote them before). Downgrade deletes `cas_opening` rows first. Postgres path unverified here (plan checkpoint: run on staging).

## 2026-10-06 — Migration 0026: twin same-day rows and new row types

`0026_twin_rows_and_row_types` — `transactions` gains `balance_units` (`NUMERIC(18,3)` NULLABLE, the CAS running balance after the row) and `occurrence` (`SMALLINT` NOT NULL DEFAULT 1). Unique key `uq_transactions_folio_date_amount_units_type` replaced by `uq_transactions_folio_date_amount_units_type_occ` on `(folio_id, date, amount, units, type, occurrence)` (still contains partition key `date`). `TransactionType` gains `reversal`, `gift_in`, `gift_out`, `bonus` (`segregation` already existed): the Postgres CHECK is rebuilt, and `ALTER TYPE transactiontype ADD VALUE` runs only if a native type exists. No backfill: existing rows get occurrence 1 and a NULL balance, healed on overlap by confirm's matcher. Downgrade deletes twins (`occurrence > 1`) and new-type rows.

## 2026-10-06 — Migration 0027: folio_key and transaction_imports

`0027_folio_key_and_transaction_imports` — `folios.folio_key` (whitespace-stripped `folio_number`, backfilled, then NOT NULL); unique constraint `uq_folio_member_scheme_number` replaced by `uq_folio_member_scheme_key` on `(household_member_id, scheme_id, folio_key)`. Existing duplicate folios (same member, scheme, key) are merged in the migration: the folio with most rows is kept, rows it already has are dropped with their import links moved, the rest are re-pointed, and each kept folio's CAS opening rows are normalised (earliest only, none when real rows predate it). New table `transaction_imports` `(transaction_id, transaction_date, import_id)`, PK `(transaction_id, import_id)`, composite FK to `transactions(id, date)` (partitioned parent; Postgres 12+), `import_id` FK `ON DELETE CASCADE`, index `ix_transaction_imports_import_id`. Seeded with one link per existing row, then with a `raw_parser_output`-driven backfill (each import gets every `cas_row` row of its listed folios inside its statement period). Helper logic is frozen copies of app code. Downgrade drops the table and restores the old unique key; merged folios stay merged.

## 2026-10-06 — Migration 0028: AMFI scheme master and plan_verified

`0028_scheme_master_and_plan_verified` — `schemes` gains `isin_reinvest`, `base_name`, `plan_type` (`direct`/`regular`, Postgres enum `schemeplantype`, `VARCHAR(16)` on SQLite), `is_active` (BOOLEAN NOT NULL DEFAULT true), `source` (`amfi`/`casparser`/`cas_only`, enum `schemesource`, NOT NULL DEFAULT `amfi`); `schemes.amfi_code` becomes NULLABLE (closed funds seen only on a CAS; UNIQUE kept). New indexes `ix_schemes_isin`, `ix_schemes_isin_reinvest`, `ix_schemes_amc_base (amc_name, base_name)`. `folios.plan_verified` (BOOLEAN NOT NULL DEFAULT false). No data backfill here: the master is populated by the daily `refresh_scheme_master` job. Downgrade raises if any scheme has a NULL `amfi_code`.

## 2026-10-06 — Migration 0029: snapshot history fields and encrypted review sessions

`0029_snapshot_fields_and_preview_sessions` — `portfolio_snapshots` gains `invested_value` (`NUMERIC(18,2)` NULLABLE), `is_partial` (BOOLEAN NOT NULL DEFAULT false), `missing_scheme_ids` (JSONB on Postgres / JSON on SQLite, NULLABLE) and `data_version` (`BIGINT` NOT NULL DEFAULT 0; epoch ms of the member's latest confirmed import). `imports` gains `preview_state` (`TEXT` NULLABLE, encrypted JSON of an in-progress review session) and the `ImportStatus` value `previewing` (`ALTER TYPE importstatus ADD VALUE` on Postgres). No backfill: old snapshots have `data_version` 0 and are rebuilt on next read. Downgrade deletes `previewing` rows; the Postgres enum value stays (0010 precedent).

`Docs/PRDs/Database-Schema-Unifolio.md` synced through 0029 (v1.9). Verified on local Postgres 16 (2026-10-06): 0028↔0029 down/up round-trip clean, `tests/functional_postgres` 14 passed (0025–0028 were round-tripped in Phases 3–5). Not yet run on staging.
