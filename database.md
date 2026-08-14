# Database Changelog

> Running changelog of database/schema changes only — tables/columns added or changed, migrations, index/constraint changes. Distinct from `Docs/PRDs/Database-Schema-Unifolio.md`, which stays the current schema as it stands today, not a change history. This file records changes that have actually been migrated, not designed/planned changes still awaiting implementation — see `backend.md`/`decisions.md` for in-progress schema work not yet landed. Backfilled 2026-08-14; append new entries at the bottom, dated, never rewrite past ones.

## 2026-08-04 — Migration 0001: initial schema

`0001_initial_schema` — every table from the Database Schema doc's v1.1: `users`, `household_members`, `imports`, `schemes`, `folios`, `transactions` (partitioned by `RANGE(date)`, yearly), `nav_history` (partitioned, yearly), `scheme_ter`, `scheme_aaum`, `benchmark_index_history`, `arn_directory`, `portfolio_snapshots`, `fund_scores`, `otp_requests`, `sessions`. `users.phone_number`: `UNIQUE NOT NULL` from day one. All money/units/NAV columns `NUMERIC`, never `FLOAT`. No PAN column anywhere; no raw-CAS-PDF table or column anywhere.

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
