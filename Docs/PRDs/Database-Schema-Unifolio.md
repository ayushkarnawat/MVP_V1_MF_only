---
artifact: database-schema
version: "1.9"
created: 2026-07-22
updated: 2026-10-06
status: draft
product: Unifolio
target: "AWS RDS for PostgreSQL (ADR-003)"
---

# Database Schema: Unifolio

## Purpose

Consolidates every data requirement from PRDs 1–4 and ADRs 1–4 into one schema,
targeting PostgreSQL per ADR-003. This is the last document before the TDD — the TDD
assumes this schema rather than re-deriving it.

## Design Principles (carried from upstream documents)

1. **Two clearly separated data domains**: *user data* (household members, folios,
   transactions, imports — private, per-user) and *reference data* (scheme master, NAV
   history, TER, AAUM, benchmark indices, ARN directory — public, shared platform-wide,
   never duplicated per user). This distinction was implicit across PRD-01/03/04 and made
   explicit here because it directly shapes table design: reference tables have no
   user/household foreign key at all.
2. **Imports are repeatable events, not a one-time onboarding artifact** — per PRD-01's
   Ongoing Data Addition and PRD-03's Add Data entry point (ADR discussion), the schema
   models `imports` as a table a household member can have many of, not a flag on the
   member record.
3. Raw CAS PDF and PAN are retained in bounded, encrypted form only — the
   source PDF for 30 days (outside the primary DB, deleted after), and PAN
   as `household_members.pan_encrypted` (AES-256-GCM) plus
   `household_members.pan_lookup_hash` (HMAC-SHA256, for matching only).
   Reopened from the original "never persisted" decision — see ADR-004 and
   `Docs/superpowers/specs/2026-09-18-pan-cas-attribution-design.md`.
4. **`NUMERIC`, never `FLOAT`, for all money/units/NAV fields** — per PRD-01's Decimal-
   math constraint, carried through literally into column types.
5. **Family aggregate default (App Flow v1.1) is computed, not stored** — whether a
   household member's dashboard defaults to family-aggregate or per-member view
   depends on whether other household members exist, which is derivable from a simple
   count query. No `default_view` column is needed and one is deliberately not included,
   to avoid a piece of stored state silently going stale relative to the actual family
   composition.

## Entity Relationship Diagram

```mermaid
%% Core relationships only — full column lists are in the Entity Definitions section below
erDiagram
    USERS ||--o{ HOUSEHOLD_MEMBERS : "owns"
    USERS ||--o{ SESSIONS : "has"
    USERS ||--o{ AUTH_IDENTITIES : "has"
    HOUSEHOLD_MEMBERS ||--o{ IMPORTS : "has"
    HOUSEHOLD_MEMBERS ||--o{ FOLIOS : "holds"
    IMPORTS ||--o{ TRANSACTIONS : "introduces"
    FOLIOS ||--o{ TRANSACTIONS : "contains"
    IMPORTS ||--o{ TRANSACTION_IMPORTS : "linked to every row it contained"
    TRANSACTIONS ||--o{ TRANSACTION_IMPORTS : "linked from"
    SCHEMES ||--o{ FOLIOS : "held via"
    SCHEMES ||--o{ NAV_HISTORY : "has"
    SCHEMES ||--o{ SCHEME_TER : "has"
    SCHEMES ||--o{ SCHEME_AAUM : "has"
    SCHEMES ||--o{ FUND_SCORES : "has"
    ARN_DIRECTORY ||--o{ FOLIOS : "resolves name for"
    HOUSEHOLD_MEMBERS ||--o{ PORTFOLIO_SNAPSHOTS : "has monthly"
```

*Note: `OTP_REQUESTS` and `PENDING_IDENTITY_VERIFICATIONS` are standalone, transient tables
keyed on phone number or token hash, not yet tied to a `USERS` row at creation time. `SCHEMES`,
`NAV_HISTORY`, `SCHEME_TER`, `SCHEME_AAUM`, `BENCHMARK_INDEX_HISTORY`, `ARN_DIRECTORY`,
and `FUND_SCORES` are reference data — no household/user foreign key, shared
platform-wide, per Design Principle 1.*

## Entity Definitions

### `users`
The account holder — phone-number-authenticated, per PRD-02's auth decision.

| Column | Type | Notes |
|---|---|---|
| `id` | `UUID` PK | |
| `phone_number` | `VARCHAR` UNIQUE NOT NULL | Mandatory verified phone, per PRD-02 FR-2 (login resolution source of truth is `auth_identities`) |
| `email` | `VARCHAR` NULLABLE | Denormalized highest-precedence email claim (Google > Email) per PRD-02 |
| `created_at` | `TIMESTAMPTZ` | |
| `onboarding_step` | `VARCHAR` NULLABLE | For resume, per PRD-02 FR-8; null once complete |
| `onboarding_completed_at` | `TIMESTAMPTZ` NULLABLE | |
| `investor_type` | `ENUM('self_directed','advisor_assisted','mixed','beginner')` NULLABLE | Q2 answer, PRD-02 FR-4 — personalization only, never advice input |
| `primary_goal` | `ENUM('consolidated_view','understand_holdings','family_management','performance_comparison')` NULLABLE | Q3 answer, PRD-02 FR-5. **Deprecated 2026-09-30**: dual-written (first goal) until migration 0021 drops it |
| `primary_goals` | `JSONB` (Postgres) / `JSON` (SQLite) NULLABLE, CHECK `ck_users_primary_goals_allowed` (Postgres: array of 1–4 items, each one of the four goal values) | Q3 answers, multi-select (migration 0019, 2026-09-30) |

### `household_members`
One row per person whose portfolio is tracked — **including the primary account holder**
(`relationship = 'self'`), so aggregation logic treats every member uniformly rather than
special-casing the account owner. This directly supports the App Flow's computed
family-aggregate-default logic (Design Principle 5).

| Column | Type | Notes |
|---|---|---|
| `id` | `UUID` PK | |
| `user_id` | `UUID` FK → `users.id` NOT NULL | Household owner (who's logged in) |
| `name` | `VARCHAR` NOT NULL | |
| `relationship` | `ENUM('self','spouse','parent','child','sibling','other')` NULLABLE | Made nullable by migration 0018 (a detected person has no relationship until the user adds one in the Complete profile popup; the old CHECK `ck_member_relationship_when_complete` was dropped by 0023). Previously NOT NULL.  Fixed enum, not free text — keeps family-grouping/analytics consistent (no "Wife" vs "spouse" vs "Spouse" fragmentation). `'self'` for the account holder. |
| `relationship_other_label` | `VARCHAR` NULLABLE | Free-text only when `relationship = 'other'` — covers real cases (grandparent, in-law, etc.) without the enum sprawling |
| `created_at` | `TIMESTAMPTZ` | |
| `pan_encrypted` | `VARCHAR` NULLABLE | Added migration 0015 — AES-256-GCM envelope-encrypted PAN (nonce + ciphertext, base64), written at upload time by the first import whose parsed CAS carries this member's PAN (pending until Confirm, see `pan_pending_until`). Never returned by any API. See ADR-004 (reopened 2026-09-18) |
| `pan_lookup_hash` | `VARCHAR` NULLABLE | Added migration 0015 — HMAC-SHA256 of the normalized PAN (one-way, deterministic), used only for equality matching during attribution so the app never needs to decrypt another household's PAN to check for a collision |
| `origin` | `ENUM('onboarding','manual','cas_detected')` NOT NULL DEFAULT `'manual'` | Added migration 0018 — how the member row came to exist |
| `name_source` | `ENUM('user_entered','cas','user_edited')` NOT NULL DEFAULT `'user_entered'` | Added migration 0018; `user_edited` added by 0023 (name changed in the Complete profile popup; a later CAS applies the normal CAS-name rules to it, unlike `user_entered`, which a CAS replaces silently). `name_source` is the provenance of `name`; a name only ever gets more complete (I9) |
| `name_updated_at` | `TIMESTAMPTZ` NULLABLE | Added migration 0018 |
| `pan_source` | `ENUM('cas','user_entered')` NULLABLE | Added migration 0018 — provenance of the stored PAN; a user-typed PAN stays `user_entered` / unverified |
| `pan_verified_at` | `TIMESTAMPTZ` NULLABLE | Added migration 0018 |
| `detected_pan_encrypted` | `VARCHAR` NULLABLE | Added migration 0018 — since 0023 used **only for a PAN another Unifolio account already holds** (same encryption as `pan_encrypted`); a detected member's own PAN is stored in `pan_encrypted` like Self's. Released into `pan_encrypted` when the other account lets go |
| `detected_pan_hash` | `VARCHAR` NULLABLE | Added migration 0018 — lookup hash of the above; CHECK `ck_member_detected_pan_pair` keeps the two columns null together. Non-unique index `ix_member_user_detected_pan_hash (user_id, detected_pan_hash)` |
| `pan_conflict` | `ENUM('other_account')` NULLABLE | Added migration 0023 — set when the detected PAN is held by another account (kept in `detected_pan_*`); CHECK `ck_member_pan_conflict_has_pan` requires the detected PAN pair. The PAN never counts toward profile completion; refreshed on `GET /household-members` |
| `detected_from_import_id` | `UUID` FK → `imports.id` ON DELETE SET NULL, NULLABLE | Added migration 0018 |
| `pan_pending_until` | `TIMESTAMPTZ` NULLABLE | Added migration 0016 — non-null = the PAN above is a pending upload-time claim (finalized on Confirm Import, released on discard or after 65 minutes). NULL with a PAN set = permanent. See `app/services/import_/pan_claims.py` |

**Migration 0018 CHECK constraints and trigger** (CAS member detection): `ck_member_relationship_when_complete` (`relationship IS NOT NULL OR details_completed_at IS NULL`), `ck_member_other_label`, `ck_member_lock_reason` (locked iff `lock_reason` set), `ck_member_detected_pan_pair`. Trigger `trg_member_never_relock` (SQLite `BEFORE UPDATE`; Postgres function `member_never_relock()`) aborts with `member_already_unlocked` on any update that would re-lock an unlocked member.

**Migration 0023 (2026-10-01, member profile completion):** dropped `ck_member_relationship_when_complete`, `ck_member_lock_reason` and trigger `trg_member_never_relock` together with `details_completed_at` / `lock_reason`. `ck_member_other_label` and `ck_member_detected_pan_pair` remain; `ck_member_pan_conflict_has_pan` added.

Partial unique index on `(user_id) WHERE relationship = 'self'` (migration 0011) enforces
at most one account-holder row per user; `create_household_member` also pre-checks this
and returns 409 rather than surfacing a raw constraint violation.

### `household_member_name_changes` (audit)
Added migration 0018. One row per change to a member's name.

| Column | Type | Notes |
|---|---|---|
| `id` | `UUID` PK | |
| `household_member_id` | `UUID` FK → `household_members.id` ON DELETE CASCADE NOT NULL | |
| `old_name` / `new_name` | `VARCHAR` NOT NULL | |
| `reason` | `ENUM('cas_variant','user_corrected_to_cas','user_edit')` NOT NULL | |
| `import_id` | `UUID` FK → `imports.id` ON DELETE SET NULL, NULLABLE | |
| `changed_at` | `TIMESTAMPTZ` NOT NULL | |

### `household_member_merges` (audit)
Added migration 0018. One row per merge of a name-only detected member into another (M11). Deliberately no FKs to the two member ids so the record survives the removed member's deletion.

| Column | Type | Notes |
|---|---|---|
| `id` | `UUID` PK | |
| `user_id` | `UUID` FK → `users.id` NOT NULL | |
| `kept_member_id` / `removed_member_id` | `UUID` NOT NULL | |
| `removed_member_name` | `VARCHAR` NOT NULL | |
| `folios_moved` / `transactions_dropped` | `INTEGER` NOT NULL | |
| `merged_at` | `TIMESTAMPTZ` NOT NULL | |

### `imports`
A single CAS upload-and-confirm event — repeatable per member, per PRD-01's Ongoing
Data Addition requirement.

| Column | Type | Notes |
|---|---|---|
| `id` | `UUID` PK | |
| `household_member_id` | `UUID` FK → `household_members.id` NOT NULL | |
| `status` | `ENUM('pending','confirmed','failed','not_started','requesting_cas','waiting_for_user','upload_started','password_required','validation_failed','processing','retry_pending','import_successful','import_failed','expired','previewing')` NOT NULL | Widened from the original 3-value set (migration 0003) to the full lifecycle-state machine (Updated-CAS-PRD FR-5); `pending`/`confirmed`/`failed` remain as legacy values, not removed — Postgres enums can't cheaply drop a value. `previewing` added migration 0029 (`ALTER TYPE importstatus ADD VALUE`): an in-progress review session persisted as a transient `imports` row; `processing` (already in the set) doubles as the claimed-for-confirm state of such a row. Migration 0029's downgrade deletes `previewing` rows but Postgres keeps the enum value |
| `source_cas_type` | `ENUM('cams','kfintech')` NULLABLE | Set once parsing succeeds |
| `raw_parser_output` | `JSONB` NULLABLE | Full `casparser` output, per PRD-01 FR-4, for debugging — not the source PDF |
| `error_type` | `ENUM('wrong_password','scanned_pdf','wrong_cas_type','generic')` NULLABLE | Populated on failure, drives PRD-01 FR-12–14's specific messaging |
| `error_code` | `VARCHAR` NULLABLE | Added migration 0003 — machine-readable failure code alongside `error_type`, for lifecycle-state error surfacing |
| `error_message` | `VARCHAR` NULLABLE | Added migration 0003 — human-readable failure detail |
| `source_tab` | `VARCHAR` NULLABLE | Added migration 0003 — which CAS-request UI tab/flow this import originated from |
| `statement_from_date` | `DATE` NULLABLE | Added migration 0003 — CAS statement period start. Written at Confirm and backfilled for older rows since migration 0020 (2026-09-30); before that nothing wrote it |
| `statement_to_date` | `DATE` NULLABLE | Added migration 0003 — CAS statement period end |
| `expires_at` | `TIMESTAMPTZ` NULLABLE | Added migration 0003 — lifecycle-state expiry (e.g. an unconfirmed CAS request going stale) |
| `new_transactions_count` | `INTEGER` NULLABLE | Populated on confirm, PRD-01 FR-9 |
| `duplicate_transactions_count` | `INTEGER` NULLABLE | Populated on confirm, PRD-01 FR-9 |
| `uploaded_at` | `TIMESTAMPTZ` NOT NULL | |
| `confirmed_at` | `TIMESTAMPTZ` NULLABLE | |
| `file_reference` | `VARCHAR` NULLABLE | Added migration 0015 — opaque storage key for the retained source CAS PDF (local-disk path in dev; S3 object key in production); `NULL` once expired/deleted |
| `upload_group_id` | `UUID` NULLABLE, indexed (`ix_imports_upload_group_id`) | Added migration 0018 — shared by every per-person `imports` row created from one multi-person upload; drives grouped Import History and group-scope delete |
| `file_expires_at` | `TIMESTAMPTZ` NULLABLE | Added migration 0015 — set to upload time + 30 days on store; the expiry sweep (see `app/services/import_/file_storage.py::expire_stored_files`) deletes the underlying file and nulls both this and `file_reference` once past this timestamp |
| `preview_state` | `TEXT` NULLABLE | Added migration 0029 — encrypted (`encrypt_bytes`, same envelope as PAN) JSON of the in-progress review session while `status` is `previewing`/`processing`; written through by `app/services/import_/preview_store.py` so a review survives a deploy, crash or the nightly stop. `expires_at` carries the session TTL. `NULL` on every real (confirmed/failed) import |

**Note on PAN**: the CAS PDF password is the user's PAN, but per PRD-01's constraint the
*password itself* is never stored. The investor-info PAN parsed *from inside* the CAS
(FR-2) is now persisted — encrypted, per household member, on `household_members.pan_encrypted`
— per ADR-004, reopened 2026-09-18 (this is a reversal of the schema's original transient-only
resolution; see Open Questions below and `Docs/superpowers/specs/2026-09-18-pan-cas-attribution-design.md`).

### `schemes` (reference data)
Master scheme list — the AMFI `NAVAll` master (refreshed daily by `scripts/jobs/refresh_scheme_master_daily.py`, `app/services/analytics/scheme_master.py`), shared across all users, not duplicated per household. Funds that appear on a CAS but not in the AMFI master (closed/merged) get a `cas_only` row so folios never orphan.

| Column | Type | Notes |
|---|---|---|
| `id` | `UUID` PK | |
| `amfi_code` | `VARCHAR` UNIQUE NULLABLE | Nullable since migration 0028 — `cas_only` (closed-fund) schemes have no AMFI code; the UNIQUE constraint stays (multiple NULLs allowed). Migration 0028's downgrade refuses to run while any NULL row exists |
| `isin` | `VARCHAR` NULLABLE, indexed (`ix_schemes_isin`) | Not all schemes have one uniformly populated; index added migration 0028 |
| `isin_reinvest` | `VARCHAR` NULLABLE, indexed (`ix_schemes_isin_reinvest`) | Added migration 0028 — the AMFI master's second ISIN (dividend reinvestment), so a CAS printing either ISIN identifies the scheme |
| `base_name` | `VARCHAR` NULLABLE | Added migration 0028 — scheme name with plan/option words stripped; with `amc_name` forms `ix_schemes_amc_base` (sibling-plan lookup for direct/regular classification) |
| `name` | `VARCHAR` NOT NULL | |
| `amc_name` | `VARCHAR` NOT NULL | PRD-04 FR-1 (AMC allocation) |
| `sebi_category` | `VARCHAR` NOT NULL | PRD-04 FR-2/FR-3 (category allocation, ranking) |
| `plan_name_variant` | `ENUM('direct','regular','unresolved')` NULLABLE | Scheme-name-pattern signal feeding PRD-01 FR-5, distinct from the per-folio classification below |
| `plan_type` | `ENUM('direct','regular')` NULLABLE | Added migration 0028 (Postgres type `schemeplantype`; `VARCHAR(16)` on SQLite) — plan from the AMFI master's plan column, else the scheme name; authoritative input to `identify.classify_plan` |
| `is_active` | `BOOLEAN` NOT NULL DEFAULT `true` | Added migration 0028 — `false` once a scheme drops out of the daily AMFI master (history and CAS-only identities are preserved, never deleted) |
| `source` | `ENUM('amfi','casparser','cas_only')` NOT NULL DEFAULT `'amfi'` | Added migration 0028 (Postgres type `schemesource`) — where the row came from |

### `folios`
A specific holding: one household member's position in one scheme, via one folio
number (a scheme can have multiple folios per member if bought through different
distributors — see PRD-03 FR-11).

| Column | Type | Notes |
|---|---|---|
| `id` | `UUID` PK | |
| `household_member_id` | `UUID` FK → `household_members.id` NOT NULL | |
| `scheme_id` | `UUID` FK → `schemes.id` NOT NULL | |
| `folio_number` | `VARCHAR` NOT NULL | |
| `arn_code` | `VARCHAR` NULLABLE | PRD-01 FR-7/FR-8 — captured per folio, not collapsed across folios |
| `folio_key` | `VARCHAR` NOT NULL | Added migration 0027 — `folio_number` with all whitespace stripped (CAMS and KFintech print one folio with and without spaces around "/"). Python default derives it from `folio_number`; migration 0027 backfilled it and merged same-member/scheme/key duplicate folios (most rows kept; twin rows' import links moved) |
| `plan_type` | `ENUM('direct','regular','unclassified')` NOT NULL DEFAULT `'unclassified'` | Resolved per PRD-01 FR-5/FR-6, combining `schemes.plan_name_variant` and this folio's `arn_code` presence. Since the CAS-import fixes, import-time classification comes from the scheme (`schemes.plan_type`, else name) via `identify.classify_plan` and is no longer left `unclassified` |
| `plan_verified` | `BOOLEAN` NOT NULL DEFAULT `false` | Added migration 0028 — whether the plan was established from the AMFI master/name (or NAV check) rather than guessed |
| `has_coverage_gap` | `BOOLEAN` NOT NULL DEFAULT `false` | Added migration 0003 — flags a folio with a detected transaction-history coverage gap (Updated-CAS-PRD FR-7) |
| `coverage_gap_details` | `JSONB` NULLABLE | Added migration 0003 — detail payload for the flagged gap |
| UNIQUE | `(household_member_id, scheme_id, folio_key)` (`uq_folio_member_scheme_key`) | Prevents duplicate folio rows on re-import. Replaced `uq_folio_member_scheme_number` on `folio_number` in migration 0027 so spacing differences can no longer create a second folio |

### `transactions`
Every parsed transaction line — the ledger everything else (holdings, XIRR, cash flow,
SIP detection) is computed from. **Partitioned by `RANGE (date)`, yearly**, from MVP
launch — not deferred. Postgres requires the partition key in every unique constraint on
a partitioned table, which is why `id` alone can no longer be the sole primary key (see
below); the dedupe constraint already includes `date` so it partitions cleanly as-is.
Since migration 0027 every import that contained a row is also recorded in `transaction_imports`; `import_id` below is only the first writer.

| Column | Type | Notes |
|---|---|---|
| `id` | `UUID` | Generated, not globally unique alone once partitioned — see composite PK |
| `folio_id` | `UUID` FK → `folios.id` NOT NULL | |
| `import_id` | `UUID` FK → `imports.id` NOT NULL | Which import introduced this row — enables audit/debugging without needing the source PDF |
| `type` | `ENUM('purchase','purchase_sip','redemption','switch_in','switch_out','dividend_payout','dividend_reinvest','segregation','stt','stamp_duty','misc','opening_balance','reversal','gift_in','gift_out','bonus')` NOT NULL | Per PRD-01 FR-3; `reversal`, `gift_in`, `gift_out`, `bonus` added migration 0026 (the CHECK was rebuilt on Postgres; the native `transactiontype` type, if present, gets `ADD VALUE`). `segregation` already existed; `opening_balance` added migration 0003 (Updated-CAS-PRD FR-7's coverage-gap opening-balance row). On Postgres this column is `VARCHAR` + `CHECK (type IN (...))`, not a native enum type — migration 0001's `_create_transactions_postgres()` deliberately avoids a separate `CREATE TYPE` lifecycle for the partitioned table; the CHECK constraint was widened for `opening_balance` by migration 0010, not 0003 (0003's own attempted `ALTER TYPE` for this column was dead code, since no native type ever existed here) |
| `date` | `DATE` NOT NULL | Partition key |
| `amount` | `NUMERIC(14,2)` NOT NULL | |
| `units` | `NUMERIC(14,3)` NOT NULL | |
| `nav` | `NUMERIC(10,4)` NOT NULL | |
| `raw_description` | `VARCHAR` NULLABLE | Preserves original text for `misc`-typed rows, per PRD-01 FR-3 |
| `origin` | `VARCHAR(16)` NOT NULL DEFAULT `'cas_row'`, CHECK `IN ('cas_row','cas_opening','manual')` | Added migration 0025 — `cas_opening` is the opening-balance row synthesised from a CAS's opening units; `manual` is the user-entered OpeningBalanceModal row (migration 0025 marked every pre-existing `opening_balance` row `manual`). The earliest-statement rule replaces only `cas_opening` rows, never `manual` ones |
| `cost_source` | `VARCHAR(16)` NULLABLE, CHECK `IS NULL OR IN ('cas_cost','nav_on_start','manual')` | Added migration 0025 — how an opening-balance row's cost was derived (CAS valuation cost, NAV on the statement start date, or user-entered); `NULL` for ordinary rows |
| `balance_units` | `NUMERIC(18,3)` NULLABLE | Added migration 0026 — the CAS's running unit balance printed after this row; `NULL` for legacy rows and rows without one. Used by confirm's balance/occurrence matcher to tell genuine identical same-day rows from overlap duplicates (existing rows are healed on overlap) |
| `occurrence` | `SMALLINT` NOT NULL DEFAULT `1` | Added migration 0026 — 1-based index separating genuinely identical same-day rows (twins) inside the dedupe key |
| PRIMARY KEY | `(id, date)` | Composite because `date` (the partition key) must be part of every unique index on a partitioned table — `id` alone remains the practical row identifier for foreign-key references from elsewhere if ever needed |
| UNIQUE | `(folio_id, date, amount, units, type, occurrence)` (`uq_transactions_folio_date_amount_units_type_occ`) | **The dedupe key** — PRD-01 FR-9, PRD-03's re-upload edge case. Already includes `date`, so it partitions cleanly with no redesign needed. (`type` added v1.2: `amount`/`units` are stored as positive magnitudes, so a same-day purchase and redemption of equal size would otherwise collide and one be dropped as a false duplicate. `occurrence` added v1.9, migration 0026: two genuine identical same-day rows no longer collapse into one. Replaced `uq_transactions_folio_date_amount_units_type`) |
| Partitions | `transactions_2020` ... `transactions_2026`, `transactions_default` | Yearly range partitions; a `DEFAULT` partition catches anything outside the defined ranges (e.g., a very old transaction from a long-held fund) rather than failing the insert — new yearly partitions get added routinely as time passes, a small recurring ops task rather than a redesign |

### `transaction_imports`
Link table: every import whose statement contained a given transaction row. `transactions.import_id` keeps only the *first* writer (NOT NULL), so without this table deleting one of two overlapping imports would either drop rows the other still needs or leave rows behind. Deleting an import removes only the rows no other import holds (`app/services/import_/deletion.py`), then `opening_restore.py` rebuilds opening balances from the remaining statements. Added migration 0027.

| Column | Type | Notes |
|---|---|---|
| `transaction_id` | `UUID` NOT NULL | Part of the composite FK to `transactions` |
| `transaction_date` | `DATE` NOT NULL | Partition key — the FK to `transactions(id, date)` must be composite because `transactions` is `RANGE`-partitioned on Postgres (FKs to partitioned tables need Postgres 12+; staging runs 16). `ON DELETE CASCADE` |
| `import_id` | `UUID` FK → `imports.id` NOT NULL, `ON DELETE CASCADE` | |
| PRIMARY KEY | `(transaction_id, import_id)` | |
| INDEX | `ix_transaction_imports_import_id` on `(import_id)` | Supports "which rows does this import hold" during delete |

Migration 0027 seeded one link per existing row (its `import_id`) and then added links for every `cas_row` row inside an import's statement period for folios listed in that import's stored `raw_parser_output`.

### `nav_history` (reference data)
NAV per scheme per date — covers the *full scheme universe*, not just what any user
holds, per PRD-04's category-ranking requirement (FR-3/FR-4) and PRD-03's monthly
snapshot backfill (FR-8). **Partitioned by `RANGE (date)`, yearly, from MVP launch** —
this is genuinely the largest table in the schema even before any real users exist,
since it's reference data spanning the entire scheme universe (thousands of schemes ×
years of daily NAV), not something that grows only with adoption.

| Column | Type | Notes |
|---|---|---|
| `scheme_id` | `UUID` FK → `schemes.id` | |
| `date` | `DATE` | Partition key |
| `nav` | `NUMERIC(10,4)` NOT NULL | |
| PRIMARY KEY | `(scheme_id, date)` | Already includes the partition key, partitions cleanly with no redesign |
| Partitions | `nav_history_2015` ... `nav_history_2026`, `nav_history_default` | Same yearly-range approach as `transactions`; a wider historical range here since `mfapi.in`'s backfill (PRD-03 FR-8) reaches further back than any user's transaction history |

### `scheme_ter` (reference data)
| Column | Type | Notes |
|---|---|---|
| `scheme_id` | `UUID` FK → `schemes.id` | |
| `reference_period` | `DATE` | Month the TER applies to, per AMFI's disclosure cadence (PRD-04 Research) |
| `ter_value` | `NUMERIC(5,2)` NULLABLE | Percentage. Made nullable migration 0009 — `NULL` means "checked this scheme against this period's AMFI feed, found no usable TER" (e.g. a matured FMP no longer in AMFI's feed), distinct from no row at all ("never checked"); avoids re-triggering a full AMFI rescan forever for a scheme that will never match |
| PRIMARY KEY | `(scheme_id, reference_period)` | |

### `scheme_aaum` (reference data)
| Column | Type | Notes |
|---|---|---|
| `scheme_id` | `UUID` FK → `schemes.id` | |
| `reference_period` | `DATE` | Quarterly per PRD-04's AAUM research finding |
| `aaum_value` | `NUMERIC(18,2)` NOT NULL | |
| PRIMARY KEY | `(scheme_id, reference_period)` | |

### `benchmark_index_history` (reference data)
| Column | Type | Notes |
|---|---|---|
| `index_name` | `ENUM('nifty_50','nifty_500','nifty_largemidcap_250','nifty_midcap_150')` | Per PRD-04's confirmed index mapping |
| `date` | `DATE` | |
| `value` | `NUMERIC(12,2)` NOT NULL | |
| PRIMARY KEY | `(index_name, date)` | |

### `arn_directory` (reference data)
| Column | Type | Notes |
|---|---|---|
| `arn_code` | `VARCHAR` PK | |
| `distributor_name` | `VARCHAR` NULLABLE | Null until resolved, per PRD-03 FR-11b's graceful fallback |
| `status` | `ENUM('active','suspended','invalid','unresolved')` NOT NULL DEFAULT `'unresolved'` | Per PRD-03 FR-11c |
| `last_checked_at` | `TIMESTAMPTZ` NULLABLE | |

### `portfolio_snapshots`
Month-end value per household member — backfillable from `transactions` + `nav_history`
per PRD-03 FR-8, so this table can be populated retroactively, not just going forward.

| Column | Type | Notes |
|---|---|---|
| `household_member_id` | `UUID` FK → `household_members.id` | |
| `snapshot_month` | `DATE` | Stored as the month's last day |
| `total_value` | `NUMERIC(18,2)` NOT NULL | |
| `computed_at` | `TIMESTAMPTZ` | |
| `invested_value` | `NUMERIC(18,2)` NULLABLE | Added migration 0029 — FIFO cost of the units held at month end; `NULL` on rows written before 0029 |
| `is_partial` | `BOOLEAN` NOT NULL DEFAULT `false` | Added migration 0029 — `true` when at least one held scheme had no NAV on or before the month end, so `total_value` omits it; partial months are recomputed on the next read |
| `missing_scheme_ids` | `JSONB` NULLABLE (generic `JSON` on SQLite) | Added migration 0029 — list of `schemes.id` (as strings) missing a NAV that month; `NULL` when complete. Resolved to names at read time |
| `data_version` | `BIGINT` NOT NULL DEFAULT `0` | Added migration 0029 — epoch milliseconds of the member's latest confirmed import `confirmed_at` at compute time; a snapshot older than the current version is stale and rebuilt |
| PRIMARY KEY | `(household_member_id, snapshot_month)` | |

### `fund_scores` (reference data — fund-level, not per-user)
The scorer (PRD-04 FR-5–FR-7) is computed per scheme within its category, not per user
— a fund's score is the same for every user who holds it. Portfolio-level scores (FR-6)
are an AUM-weighted roll-up computed on read from a member's holdings plus this table,
not separately stored, since they'd otherwise go stale independently of the underlying
fund scores.

| Column | Type | Notes |
|---|---|---|
| `scheme_id` | `UUID` FK → `schemes.id` | |
| `computed_at` | `TIMESTAMPTZ` | |
| `risk_adjusted_tier` | `INTEGER` NOT NULL | 1–5, per PRD-04 FR-5a's percentile bucketing |
| `cost_adjustment` | `NUMERIC(3,2)` NOT NULL | Signed nudge value, per FR-5b |
| `final_score` | `NUMERIC(5,2)` NOT NULL | |
| PRIMARY KEY | `(scheme_id, computed_at)` | Keeps score history rather than overwriting, allowing "score changed over time" to be answerable later without a design change |

### `auth_identities`
Stores one row per linked authentication identity per user (Phone OTP, Email OTP, Google). Login resolution matches on `(provider, provider_subject)`.

| Column | Type | Notes |
|---|---|---|
| `id` | `UUID` PK | |
| `user_id` | `UUID` FK → `users.id` NOT NULL | |
| `provider` | `ENUM('phone_otp','email_otp','google','email_password')` NOT NULL | `email_password` kept in the enum but unused going forward (Postgres can't cheaply drop an enum value) — password-based auth was removed migration 0008; every live identity today is `phone_otp`, `email_otp`, or `google` |
| `provider_subject` | `VARCHAR` NOT NULL | Method-specific subject (normalized phone, normalized email, or Google `sub`) |
| `email` | `VARCHAR` NULLABLE | Verified email associated with this identity (if any) |
| `identifier_verified_at` | `TIMESTAMPTZ` NOT NULL | When ownership of this identifier was proven |
| `last_used_at` | `TIMESTAMPTZ` NOT NULL | Updated on each login |
| `created_at` | `TIMESTAMPTZ` NOT NULL | |
| UNIQUE | `(provider, provider_subject)` | Prevents duplicate identity claims across accounts |

`password_hash` and `email_confirmed_at` (present in v1.3) were dropped by migration 0008
when password-based auth was removed in favor of email+OTP — see
`Docs/orchestration/remove-password-auth-handoff.md`.

### `pending_identity_verifications`
Holds an independently-verified identity temporarily during the mandatory phone-gate signup or step-up account-linking flow.

| Column | Type | Notes |
|---|---|---|
| `id` | `UUID` PK | |
| `token_hash` | `VARCHAR` UNIQUE NOT NULL | SHA-256 hash of the bearer token returned in `phone_required` / `link_required` |
| `provider` | `ENUM('phone_otp','email_otp','google','email_password')` NOT NULL | Never `phone_otp` in practice — a phone-first verification completes signup on its own, without a pending record |
| `provider_subject` | `VARCHAR` NOT NULL | |
| `email` | `VARCHAR` NULLABLE | |
| `email_verified` | `BOOLEAN` NOT NULL | True only if provider proved email ownership |
| `matched_user_id` | `UUID` FK → `users.id` NULLABLE | Non-null for step-up linking to existing account |
| `expires_at` | `TIMESTAMPTZ` NOT NULL | 10-minute TTL |
| `used_at` | `TIMESTAMPTZ` NULLABLE | |
| `created_at` | `TIMESTAMPTZ` NOT NULL | |

`password_hash` (present in v1.3) was dropped by migration 0008 alongside password auth.

`password_reset_tokens` and `email_confirmation_tokens` (both present in v1.3) no longer
exist — `email_confirmation_tokens` was dropped outright by migration 0007 when email+OTP
replaced link-based email confirmation, and `password_reset_tokens` was dropped by
migration 0008 when password auth was removed entirely (both tables backed a mechanism
that was deleted, not toggled off).

### `otp_requests`
Foundational schema for PRD-02's phone+OTP auth (FR-2) and the email+OTP signup flow
(migration 0007) — transient, short-lived records, not a full auth/security spec
(rate-limiting policy, lockout rules, etc. remain a future Auth/Security PRD per PRD-02's
FR-2a note).

| Column | Type | Notes |
|---|---|---|
| `id` | `UUID` PK | |
| `phone_number` | `VARCHAR` NULLABLE | Not yet necessarily tied to a `users` row — OTP is requested before an account is confirmed to exist |
| `email` | `VARCHAR` NULLABLE | Added migration 0007, for the email+OTP signup flow's inline confirmation step |
| CHECK | exactly one of `phone_number`/`email` set | `ck_otp_requests_exactly_one_identifier`, migration 0007 — phone and email OTPs share this one table |
| `otp_hash` | `VARCHAR` NOT NULL | Hashed, never the raw OTP |
| `expires_at` | `TIMESTAMPTZ` NOT NULL | Short-lived (5 min), per standard OTP practice |
| `verified_at` | `TIMESTAMPTZ` NULLABLE | |
| `attempt_count` | `INTEGER` NOT NULL DEFAULT `0` | Rate-limiting tracker |
| `created_at` | `TIMESTAMPTZ` NOT NULL | |

### `sessions`
Foundational session record following successful auth verification.

| Column | Type | Notes |
|---|---|---|
| `id` | `UUID` PK | |
| `user_id` | `UUID` FK → `users.id` NOT NULL | |
| `session_token_hash` | `VARCHAR` NOT NULL | Hashed, never the raw token |
| `auth_method` | `ENUM('phone_otp','email_otp','google','email_password')` NOT NULL | Method that established this session |
| `created_at` | `TIMESTAMPTZ` NOT NULL | |
| `expires_at` | `TIMESTAMPTZ` NOT NULL | 30-day sliding TTL |
| `last_active_at` | `TIMESTAMPTZ` NOT NULL | |
| `device_info` | `VARCHAR` NULLABLE | Foundational only — full device-management UX is future Auth/Security PRD scope |

## Data Classification & Security

| Data | Classification | Handling |
|---|---|---|
| `transactions`, `folios`, `portfolio_snapshots` | Sensitive (financial) | Standard RDS encryption at rest; no special masking needed, these are the user's own numbers |
| Parsed PAN | Highly sensitive | Persisted on `household_members.pan_encrypted` (AES-256-GCM, application-level envelope encryption) plus `pan_lookup_hash` (HMAC-SHA256, one-way, used only for equality matching). Never returned by any API — masked display (`ABCDE****F`) only. See ADR-004 (reopened 2026-09-18). |
| `phone_number` | Sensitive (PII, also the auth credential) | Standard encryption at rest; rate-limit any lookup path |
| Reference tables (`schemes`, `nav_history`, `scheme_ter`, etc.) | Public data | No special handling — this is all already-public AMFI/NSE data |
| CAS PDF | Highly sensitive | Retained 30 days from upload for dispute/re-parse support, then deleted — local disk in dev, private SSE-KMS-encrypted S3 bucket with a Lifecycle expiry rule in production. Per ADR-004, reopened 2026-09-18. |

## Indexing Notes

- `transactions(folio_id, date)` — supports the holdings-table and XIRR queries that
  dominate PRD-03/04's read patterns.
- `nav_history(scheme_id, date)` — supports both current-NAV lookups and the historical
  range scans PRD-03's monthly snapshot backfill needs.
- `household_members(user_id)` — supports the family-aggregate query (Design
  Principle 5's computed default) with a simple existence/count check.
- `household_members(user_id) WHERE relationship = 'self'` (unique, migration 0011) —
  enforces one account-holder row per user; doubles as the existence check the
  application-layer 409 guard also performs before insert.
- `ix_household_members_pan_lookup_hash` on `household_members(pan_lookup_hash)` (unique,
  migration 0015) — supports the attribution lookup ("has any household member,
  anywhere, already claimed this PAN?") and enforces the system-wide "one PAN, one
  member" invariant at the database level; unique on a nullable column so the many
  members with no PAN backfilled yet (`NULL`) don't collide with each other, while any
  two non-null hashes are still guaranteed distinct.
- `ix_transaction_imports_import_id` on `transaction_imports(import_id)` (migration 0027) — import delete/restore lookups.
- `ix_schemes_isin`, `ix_schemes_isin_reinvest`, `ix_schemes_amc_base` on `schemes` (migration 0028) — fund identification by either ISIN and sibling-plan lookup.

## What This Document Doesn't Cover

- **Full auth/security policy** (rate-limiting rules, lockout thresholds, session-expiry
  policy specifics, device-management UX) — `otp_requests` and `sessions` above are the
  foundational tables so login works at MVP, but the policy layer on top of them remains
  the future Auth/Security PRD's job, per PRD-02's FR-2a note.
- Caching layer design (e.g., Redis) on top of this schema for hot read paths — an
  implementation detail for the TDD, not a schema-level decision.
- Ongoing partition-maintenance automation (adding next year's partition ahead of time)
  — an operational runbook item for the TDD, not a schema design question.

## Open Questions

Both items from the initial draft are resolved:
- **PAN persistence**: not stored anywhere — confirmed transient-only, discarded like the
  source PDF (see Data Classification & Security).
- **`relationship` field shape**: fixed enum (`self`/`spouse`/`parent`/`child`/`sibling`/`other`)
  plus a free-text fallback label for `'other'` — structured enough for consistent
  family-grouping logic, flexible enough not to force awkward edge cases into the wrong
  bucket.

**Reopened 2026-09-18:** the "PAN persistence: not stored anywhere" resolution above was itself reopened — see ADR-004's 2026-09-18 update and `Docs/superpowers/specs/2026-09-18-pan-cas-attribution-design.md`. PAN is now stored, encrypted, per household member.

None remaining from this pass.

## Appendix

### Related Documents
- PRD-01, PRD-02, PRD-03, PRD-04 — source of every column and constraint above
- ADR-003 (RDS/PostgreSQL), ADR-004 (S3 scope, no PDF storage)
- App Flow: Unifolio — source of the computed-default-view design principle

### Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-22 | Claude (PM partner) | Initial draft |
| 1.1 | 2026-07-22 | Claude (PM partner) | PAN confirmed never persisted; `relationship` changed to structured enum + other-label fallback; `transactions` and `nav_history` now partitioned by `RANGE(date)`, yearly, from MVP launch (not deferred); added foundational `otp_requests` and `sessions` tables for PRD-02's phone+OTP auth |
| 1.2 | 2026-08-06 | Claude (PM partner) | `transactions` dedupe key widened to `(folio_id, date, amount, units, type)` — with amounts/units normalized to positive magnitudes, equal-magnitude same-day purchase+redemption pairs were no longer sign-distinguishable and collided under the 4-column key; matches migration 0002 |
| 1.3 | 2026-08-17 | Claude (PM partner) | Updated for multi-method auth (migrations 0004-0006): added `auth_identities`, `pending_identity_verifications`, `password_reset_tokens`, `email_confirmation_tokens`; added `sessions.auth_method`; narrowed `otp_requests` back to phone-only; updated `users.phone_number` and ERD to reflect `auth_identities` as auth source of truth |
| 1.4 | 2026-09-02 | Claude (PM partner) | Reconciled against migrations 0003, 0007-0010 (this doc had gone stale by 3-4 migrations, caught by the sqlite-postgres-migration-compliance-audit): `imports.status` widened to the full 14-value lifecycle enum, added `imports.error_code`/`error_message`/`source_tab`/`statement_from_date`/`statement_to_date`/`expires_at`; added `folios.has_coverage_gap`/`coverage_gap_details`; `transactions.type` gained `opening_balance` (and noted it's a `VARCHAR`+CHECK column on Postgres, never a native enum type); `scheme_ter.ter_value` made nullable with a documented meaning; dropped `password_reset_tokens` and `email_confirmation_tokens` entirely (removed by migrations 0007/0008) and `password_hash`/`email_confirmed_at` from `auth_identities`/`pending_identity_verifications` (removed by 0008); documented `otp_requests.email` and its exactly-one-identifier CHECK (added back by 0007) |
| 1.5 | 2026-09-02 | Claude (PM partner) | F3 (compliance audit): `household_members` gained a partial unique index on `(user_id) WHERE relationship = 'self'` (migration 0011), enforcing one account-holder row per user — a gap this doc had never specified even before the code caught up; documented in both the `household_members` entity and Indexing Notes |
| 1.6 | 2026-09-29 | Claude | CAS member detection (migration 0018): `household_members` gained `origin`, `name_source`, `name_updated_at`, `details_completed_at`, `lock_reason`, `pan_source`, `pan_verified_at`, `detected_pan_encrypted`, `detected_pan_hash`, `detected_from_import_id`, and `relationship` became nullable; 4 CHECK constraints and the never-relock trigger; `imports.upload_group_id`; new audit tables `household_member_name_changes` and `household_member_merges`. Postgres enum type names follow the codebase convention (`memberorigin`, `membernamesource`, `memberpansource`, `memberlockreason`, `namechangereason`), not the spec's snake_case. Also supersedes the migration-0016 sync note: doc is current through 0018. |
| 1.7 | 2026-09-30 | Claude | Staging QA fixes: `users.primary_goals` (0019, JSONB + CHECK on Postgres; `primary_goal` deprecated, dropped by the pending 0021); `imports.statement_from_date`/`statement_to_date` are now written at Confirm and backfilled by data migration 0020. No other schema change: the duplicate-member fixes reuse `household_members.detected_pan_*` and `household_member_merges`. Current through 0020. |
| 1.8 | 2026-10-01 | Claude | Member profile completion (migration 0023): `household_members` lost `details_completed_at` / `lock_reason` (detected-member lock removed); gained `pan_conflict`; `name_source` gained `user_edited`; `detected_pan_*` now holds only a PAN another account holds |
| 1.9 | 2026-10-06 | Claude | CAS import fixes (migrations 0025-0029): `transactions` gained `origin`, `cost_source` (0025), `balance_units`, `occurrence` and four type values `reversal`/`gift_in`/`gift_out`/`bonus`, dedupe key now includes `occurrence` (0026); `folios.folio_key` with new unique key `(household_member_id, scheme_id, folio_key)` and new `transaction_imports` link table (0027); `schemes` master columns `isin_reinvest`, `base_name`, `plan_type`, `is_active`, `source`, nullable `amfi_code`, plus `folios.plan_verified` (0028); `portfolio_snapshots.invested_value`/`is_partial`/`missing_scheme_ids`/`data_version`, `imports.preview_state` and `imports.status` value `previewing` (0029). Current through 0029 (0024 is reserved for the deferred `users.primary_goal` drop; 0025 chains from 0023). |
