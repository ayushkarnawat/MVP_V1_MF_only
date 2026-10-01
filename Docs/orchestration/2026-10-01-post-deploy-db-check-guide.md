# Post-Deploy DB Check Guide: Consent + Member Profile Completion

**Purpose.** These are read-only SQL checks to run against the staging database:
- during the deploy in `2026-10-01-consent-release-deploy-guide.md` (Part 1), to see what
  each step did to the schema;
- afterwards (Parts 2–4), while you click through staging, to see exactly what each action
  writes.

**Sources.** Table and column names and expected values come from the code on
`feat/enhanced-ui` (2026-10-01). Every query below was run against a local Postgres 16
migrated to `0023`, so none fails on a wrong column name. The *expected values* describe
what the code writes. They have not been seen on staging yet.

**Safety.** The connection in Part 0 is **read-only**: Postgres refuses any write in that
session. Nothing in this guide changes data. Raw PANs are never in the database (only
encrypted values and hashes), and nothing here decrypts them.

---

## Part 0. Setup (once per session)

Run this on **your manager's laptop**, the same machine as the deploy guide.

### 0.1 Tunnel (Terminal A, leave it open)

```bash
cd MVP_V1_MF_only
BASTION_ID=$(terraform -chdir=infra/envs/staging output -json networking | python3 -c "import json,sys; print(json.load(sys.stdin)['bastion_instance_id'])")
DB_HOST=$(terraform -chdir=infra/envs/staging output -raw db_address)
aws ssm start-session \
  --target "$BASTION_ID" \
  --document-name AWS-StartPortForwardingSessionToRemoteHost \
  --parameters "{\"host\":[\"$DB_HOST\"],\"portNumber\":[\"5432\"],\"localPortNumber\":[\"5434\"]}"
```
**Expected:** `Waiting for connections...`

> **During the deploy:** reuse the deploy guide's tunnel (same port 5434). Don't open a
> second one.

### 0.2 Read-only psql (Terminal B)

If `psql --version` fails, install the client once with
`sudo apt-get update && sudo apt-get install -y postgresql-client`.

Fetch the password fresh each session, because RDS rotates it:
```bash
export PGPASSWORD=$(aws secretsmanager get-secret-value \
  --secret-id "$(aws secretsmanager list-secrets --query "SecretList[?starts_with(Name, 'rds!db-')].Name" --output text)" \
  --query SecretString --output text | python3 -c "import json,sys; print(json.load(sys.stdin)['password'])")

PGOPTIONS="-c default_transaction_read_only=on" psql -h localhost -p 5434 -U unifolio -d unifolio
```
**Expected:** a `unifolio=>` prompt. Check it's read-only:
```sql
SHOW default_transaction_read_only;   -- expected: on
```

> **Night stop:** staging's RDS is stopped from 21:00 to 05:00 IST. Outside those hours,
> `connection refused` through a working tunnel usually means RDS is still starting up
> (wait 5 minutes).

### 0.3 Set your test identity (inside psql, every session)

Use the exact phone and email you'll type in the app. Phone numbers are stored as `+91` plus 10 digits.
```sql
\set phone '+919209298772'
\set email 'you+test1@example.com'
\x auto
```
Every query below uses `:'phone'` / `:'email'`, so you never paste IDs by hand.

### 0.4 The member view (handy after any step)

Shows each household member of your test account with the fields this release cares about.
The `pct` column is the same "% complete" the app shows:
- five fields at 20% each: name, PAN, relationship, phone and email;
- Self's phone and email come from the account;
- a PAN on another account doesn't count.

```sql
SELECT m.name,
       m.relationship::text                       AS rel,
       m.origin::text,
       m.name_source::text,
       m.pan_source::text,
       (m.pan_lookup_hash IS NOT NULL)             AS has_pan,
       (m.pan_pending_until IS NOT NULL)           AS pan_pending,
       (m.detected_pan_hash IS NOT NULL)           AS has_detected_pan,
       m.pan_conflict::text,
       m.phone_number                              AS phone,
       m.email,
       20 * ( 1
            + CASE WHEN m.pan_lookup_hash IS NOT NULL AND m.pan_conflict IS NULL THEN 1 ELSE 0 END
            + CASE WHEN m.relationship IS NOT NULL THEN 1 ELSE 0 END
            + CASE WHEN COALESCE(CASE WHEN m.relationship = 'self' THEN u.phone_number ELSE m.phone_number END, '') <> '' THEN 1 ELSE 0 END
            + CASE WHEN COALESCE(CASE WHEN m.relationship = 'self' THEN u.email ELSE m.email END, '') <> '' THEN 1 ELSE 0 END
            )                                      AS pct,
       (SELECT count(*) FROM folios f WHERE f.household_member_id = m.id) AS folios
FROM household_members m JOIN users u ON u.id = m.user_id
WHERE u.phone_number = :'phone'
ORDER BY m.created_at;
```
To spot-check that a PAN is stored **encrypted and hashed** without revealing it:
```sql
SELECT m.name, left(m.pan_encrypted, 12) || '…' AS pan_encrypted_prefix,
       length(m.pan_lookup_hash) AS hash_len, m.pan_verified_at
FROM household_members m JOIN users u ON u.id = m.user_id
WHERE u.phone_number = :'phone' ORDER BY m.created_at;
```
**Expected for any member with a PAN:**
- `pan_encrypted_prefix` is a long opaque string, never a 10-character PAN like `ABCDE1234F`;
- `hash_len` is 64.

---

## Part 1. During the deploy: what each step did to the schema

Run these in the read-only session alongside the deploy guide. They're safe while the
backend is stopped.

### 1.1 Before Step 2 (expect `0020`)

```sql
SELECT version_num FROM alembic_version;
SELECT column_name FROM information_schema.columns
WHERE table_name = 'household_members'
  AND column_name IN ('phone_number','email','lock_reason','details_completed_at','pan_conflict')
ORDER BY 1;
SELECT to_regclass('consent_records') AS consent_table;
```
**Expected:**
- `0020`;
- columns: `details_completed_at`, `lock_reason` (no `phone_number`, `email` or
  `pan_conflict`);
- `consent_table` is empty (NULL).

**Record the lock state now.** Part 3 compares against it:
```sql
SELECT lock_reason::text, count(*) FROM household_members GROUP BY 1 ORDER BY 1;
SELECT count(*) AS members_total FROM household_members;
SELECT count(*) AS detected_pan_rows FROM household_members WHERE detected_pan_hash IS NOT NULL;
```

### 1.2 After Step 2 (`0021` + `0022`, expect `0022`)

```sql
SELECT version_num FROM alembic_version;
SELECT column_name FROM information_schema.columns
WHERE table_name = 'household_members' AND column_name IN ('phone_number','email') ORDER BY 1;
SELECT to_regclass('consent_records') AS consent_table,
       (SELECT count(*) FROM consent_records) AS consent_rows;
SELECT tgname FROM pg_trigger WHERE tgrelid = 'consent_records'::regclass AND NOT tgisinternal;
SELECT column_name FROM information_schema.columns
WHERE table_name = 'pending_identity_verifications' AND column_name = 'consent_snapshot';
```
**Expected:**
- `0022`;
- `email` and `phone_number`;
- `consent_records` with `0` rows;
- one or more trigger names (the append-only guards);
- `consent_snapshot`.

The lock columns are still there: the old backend still runs on them.

### 1.3 After Step 3c (`0023`, expect `0023`)

```sql
SELECT version_num FROM alembic_version;
SELECT column_name FROM information_schema.columns
WHERE table_name = 'household_members'
  AND column_name IN ('lock_reason','details_completed_at','pan_conflict') ORDER BY 1;
SELECT count(*) AS never_relock_trigger FROM pg_trigger WHERE tgname = 'trg_member_never_relock';
SELECT typname FROM pg_type WHERE typname IN ('memberlockreason','memberpanconflict') ORDER BY 1;
SELECT count(*) AS members_total FROM household_members;
```
**Expected:**
- `0023`;
- only `pan_conflict`;
- `never_relock_trigger` `0`;
- only `memberpanconflict`;
- `members_total` the same as in 1.1.

Then run **Part 3** to see what happened to the formerly locked members.

### 1.4 After Step 3e (new backend live)

```sql
SELECT count(*) AS consent_rows, max(recorded_at) AS latest FROM consent_records;
```
Still `0` until someone signs up, uploads or re-consents (Part 2).

---

## Part 2. After the deploy: what each user action writes

Set `:phone` / `:email` (0.3) to the account you're testing.

### 2.1 Sign-up with the consent box: before the account exists

After entering the phone OTP, before the email step finishes:
```sql
SELECT provider::text, email, created_at,
       consent_snapshot -> 'surface'                         AS surface,
       jsonb_array_length(consent_snapshot -> 'documents')   AS docs
FROM pending_identity_verifications
ORDER BY created_at DESC LIMIT 3;
```
**Expected:** your pending row at the top, with `surface` = `"signup_phone"` (or
`"signup_email"` / `"signup_google"`) and `docs` = `2` (Terms + Privacy). If `docs` is NULL,
the sign-up came from an old cached frontend: hard-refresh.

### 2.2 Sign-up finished: account and consent rows

```sql
SELECT id, phone_number, email, onboarding_step, onboarding_completed_at, created_at
FROM users WHERE phone_number = :'phone';

SELECT c.document_type::text, c.document_version, c.purpose_code::text, c.action::text,
       c.surface, c.recorded_at, (c.ip_hmac IS NOT NULL) AS has_ip_hmac
FROM consent_records c JOIN users u ON u.id = c.user_id
WHERE u.phone_number = :'phone' ORDER BY c.recorded_at, c.document_type;
```
**Expected:** one user row, and **3 consent rows**, all `given`, with the same `surface` as
2.1:
- `terms_of_service` / `service_agreement`;
- `privacy_policy` / `account_and_authentication`;
- `privacy_policy` / `portfolio_tracking_analytics`.

Versions are the placeholder ones (`…-placeholder-2026-10-01`).

### 2.3 Onboarding: name saved at the name step

```sql
SELECT u.onboarding_step, m.name, m.relationship::text, m.origin::text, m.name_source::text
FROM users u LEFT JOIN household_members m ON m.user_id = u.id AND m.relationship = 'self'
WHERE u.phone_number = :'phone';
```
**Expected:** right after the name step there is a Self row with your typed name,
`origin = onboarding` and `name_source = user_entered`. That name is provisional: the
first CAS replaces it silently. Goals: `SELECT primary_goals FROM users WHERE phone_number = :'phone';`.
"All of it" gives all four.

### 2.4 Upload a CAS (PAN disclaimer ticked), before Confirm

```sql
SELECT c.document_type::text, c.purpose_code::text, c.surface, c.recorded_at
FROM consent_records c JOIN users u ON u.id = c.user_id
WHERE u.phone_number = :'phone' AND c.document_type = 'pan_disclaimer'
ORDER BY c.recorded_at DESC;
```
**Expected:** one new `pan_disclaimer` / `cas_pan_processing` row per upload, with
`surface` `onboarding_upload`, `import_upload` or `mobile_upload`.

Then run **0.4**:
- **Self** (first upload only): `has_pan = t` and `pan_pending = t`. Self's PAN is reserved
  at upload, but only temporarily.
- **Family members on the statement: nothing yet.** Decision A: other members' PANs are
  never reserved at upload. They are written only at Confirm.
- **`imports`:** no new row yet. The review lives in the backend's memory until Confirm.

### 2.5 Confirm imports

```sql
SELECT i.status::text, m.name, i.statement_from_date, i.statement_to_date,
       i.new_transactions_count, i.confirmed_at
FROM imports i JOIN household_members m ON m.id = i.household_member_id
JOIN users u ON u.id = m.user_id
WHERE u.phone_number = :'phone' ORDER BY i.uploaded_at DESC;
```
**Expected:** one `confirmed` import row per person confirmed.

Then run **0.4**:

| Who | Expected |
|---|---|
| **Self** | `has_pan = t`, `pan_pending = f` (now permanent), `pan_source = cas`. Name replaced by the CAS name if it was the onboarding name. |
| **Each detected family member** (new) | `origin = cas_detected`, `name_source = cas`, `rel` empty, `pan_source = cas`, `has_pan = t`, `pan_conflict` empty, `has_detected_pan = f`, folios > 0, **`pct = 40`** (name + PAN; no relationship, phone or email yet). |
| **A family member whose PAN another account holds** | `has_pan = f`, `has_detected_pan = t`, `pan_conflict = other_account`, folios > 0, `pct = 20` (the PAN doesn't count). The app shows the red banner. |
| **A family member with no PAN on the statement** | `has_pan = f`, `has_detected_pan = f`, `pan_source` empty. The popup will ask for a PAN. |

There are no lock columns any more. "Every dashboard opens" is the absence of anything to
check here.

Also run the **encryption spot-check** in 0.4 for the detected members.

### 2.6 Complete profile popup → Save

After saving, for example, only a relationship:
```sql
SELECT m.name, m.relationship::text, m.relationship_other_label, m.phone_number, m.email,
       m.name_source::text, m.name_updated_at, m.pan_source::text, (m.pan_lookup_hash IS NOT NULL) AS has_pan
FROM household_members m JOIN users u ON u.id = m.user_id
WHERE u.phone_number = :'phone' ORDER BY m.created_at;
```
**Expected:** only the fields you entered changed. Others stay as they were: Save writes
only what was typed. Then re-run **0.4**: `pct` goes up 20 per field, matching the app's chip.

**Name edited in the popup:**
```sql
SELECT m.name AS member_now, nc.old_name, nc.new_name, nc.reason::text, nc.import_id, nc.changed_at
FROM household_member_name_changes nc
JOIN household_members m ON m.id = nc.household_member_id
JOIN users u ON u.id = m.user_id
WHERE u.phone_number = :'phone' ORDER BY nc.changed_at DESC;
```
**Expected:**
- one row with `reason = user_edit` and `import_id` empty;
- the member's `name_source` is now `user_edited`.
- A case-only change (e.g. `ramesh` → `Ramesh`) writes **no** row.

**PAN typed for a member who had none:**
- the member now has `has_pan = t` and `pan_source = user_entered`;
- if that PAN is on another account: `has_pan = f`, `has_detected_pan = t` and
  `pan_conflict = other_account`. The app shows the second warning popup.

**Self:** only the name can change. Phone and email stay on `users`:
```sql
SELECT phone_number, email FROM users WHERE phone_number = :'phone';
```

### 2.7 A later CAS for a member whose name you edited

Upload another CAS containing that person, then:
- **completely different name on the statement:** the review asks (rename or keep). If you
  keep it, the name and `name_source = user_edited` are unchanged, and no new
  name-change row is written.
- **longer variant** (e.g. "Ramesh Sharma" → "Ramesh Kumar Sharma"): the name updates
  automatically. A name-change row with `reason = cas_variant` appears (query in 2.6).

### 2.8 Existing user re-consents ("We've updated our Terms")

```sql
SELECT c.document_type::text, c.purpose_code::text, c.surface, c.recorded_at
FROM consent_records c JOIN users u ON u.id = c.user_id
WHERE u.phone_number = :'phone' AND c.surface = 'reconsent' ORDER BY c.recorded_at;
```
**Expected:** the same 3 Terms/Privacy rows as 2.2, with `surface = reconsent`. Agreeing a
second time is impossible: the prompt doesn't come back, so there are no duplicates.

### 2.9 Merge from the popup (typed PAN already on another of *your* members)

```sql
SELECT mg.kept_member_id, mg.removed_member_name, mg.folios_moved, mg.transactions_dropped, mg.merged_at
FROM household_member_merges mg JOIN users u ON u.id = mg.user_id
WHERE u.phone_number = :'phone' ORDER BY mg.merged_at DESC;
```
**Expected:** one row per merge. The removed member disappears from 0.4, and its folios
move to the kept member.

### 2.10 Delete a member's last import

- **Detected member you never touched** (no relationship, phone, email, edited name or typed
  PAN): after the delete, the member is gone from 0.4.
- **Detected member you started filling in** (any of those set): the member **stays** in
  0.4, with `folios = 0`.

---

## Part 3. What happened to members who existed before the deploy

Run once after Step 3c and compare with the numbers recorded in 1.1.

```sql
SELECT count(*)                                                                    AS members_total,
       count(*) FILTER (WHERE pan_conflict IS NOT NULL)                            AS pan_conflicts,
       count(*) FILTER (WHERE detected_pan_hash IS NOT NULL AND pan_conflict IS NULL) AS unpromoted_duplicates,
       count(*) FILTER (WHERE origin = 'cas_detected' AND pan_lookup_hash IS NOT NULL) AS detected_with_real_pan,
       count(*) FILTER (WHERE origin = 'cas_detected' AND relationship IS NULL)    AS detected_no_relationship
FROM household_members;
```
**Expected:**
- **`members_total`:** unchanged from 1.1.
- **`pan_conflicts`:** at least the old `pan_on_other_account` count, and possibly a little
  higher. Locked rows whose PAN another user already held are flagged too.
- **`unpromoted_duplicates`:** usually `0`. A number here means the same user had two
  members with the same PAN. Only the earliest was promoted, and the other can be merged.
- **`detected_with_real_pan`:** about the old `details_needed` count, plus already-unlocked
  detected members.

List the conflicts and leftovers by account:
```sql
SELECT u.phone_number, m.name, m.pan_conflict::text, (m.pan_lookup_hash IS NOT NULL) AS has_pan, m.created_at
FROM household_members m JOIN users u ON u.id = m.user_id
WHERE m.pan_conflict IS NOT NULL OR (m.detected_pan_hash IS NOT NULL AND m.pan_conflict IS NULL)
ORDER BY u.phone_number, m.created_at;
```

---

## Part 4. Health checks: run any time, all should return 0 rows or 0

```sql
-- 1. No PAN hash claimed twice (the unique index guarantees it; a non-zero here means the index is missing).
SELECT pan_lookup_hash, count(*) FROM household_members
WHERE pan_lookup_hash IS NOT NULL GROUP BY 1 HAVING count(*) > 1;

-- 2. Every conflict row still carries its encrypted detected PAN (CHECK ck_member_pan_conflict_has_pan).
SELECT count(*) FROM household_members WHERE pan_conflict IS NOT NULL AND detected_pan_hash IS NULL;

-- 3. No member holds both a real PAN and a conflict flag.
SELECT count(*) FROM household_members WHERE pan_conflict IS NOT NULL AND pan_lookup_hash IS NOT NULL;

-- 4. No detected member's PAN reserved "pending" (decision A: only Self is ever pending).
SELECT count(*) FROM household_members
WHERE pan_pending_until IS NOT NULL AND (relationship IS DISTINCT FROM 'self');

-- 5. Every user has exactly one Self row.
SELECT u.phone_number, count(m.id) FROM users u
LEFT JOIN household_members m ON m.user_id = u.id AND m.relationship = 'self'
GROUP BY u.phone_number HAVING count(m.id) <> 1;

-- 6. Every user created after the deploy has sign-up consent (3 rows).
--    Replace the timestamp with the time Step 3e finished (UTC).
SELECT u.phone_number, count(c.id) AS signup_consents FROM users u
LEFT JOIN consent_records c ON c.user_id = u.id AND c.surface LIKE 'signup_%'
WHERE u.created_at > '2026-10-02 06:00:00+00'
GROUP BY u.phone_number HAVING count(c.id) <> 3;
```
- **Check 4** can briefly show Self rows from users mid-upload. Anything else is a bug.
- **Check 5** may list accounts that never finished onboarding: those have 0 Self rows,
  which is fine.
- Any other non-empty result: send the output to Aditi.

---

*Written 2026-10-01 from the code on `feat/enhanced-ui`. Not yet run against staging.*
