# Staging DB Verification Guide: Phone Signup → "Get my first score"

**Purpose.** While you click through staging with the synthetic CAS files, run these
read-only SQL checks against the staging database after each step. Each check lists
exactly what should now be written. Scenarios (wrong OTP, second upload, unlock, merge,
delete…) are in **Part 3**.

**Sources.** Table and column names, and every expected value, come from the code on
`feat/enhanced-ui` (2026-09-30). The per-person counts for the two synthetic files come from
parsing the actual files with the app's own parser. All queries were run against a Postgres
16 database migrated to `0018`, so none will fail on a wrong column name.

**Safety.** The connection below is **read-only**: Postgres refuses any write in that
session. Nothing in this guide changes data.

---

## Part 0. Setup (once per testing session)

Everything runs on **your manager's laptop**, the same way as the deploy guide.

### 0.1 Open the tunnel (Terminal A, leave it open)

Same as Step 4 of `2026-09-30-member-detection-auth-staging-guide.md`:

```bash
cd "/mnt/d/Unifolio code"
BASTION_ID=$(terraform -chdir=infra/envs/staging output -json networking | python3 -c "import json,sys; print(json.load(sys.stdin)['bastion_instance_id'])")
DB_HOST=$(terraform -chdir=infra/envs/staging output -raw db_address)
aws ssm start-session \
  --target "$BASTION_ID" \
  --document-name AWS-StartPortForwardingSessionToRemoteHost \
  --parameters "{\"host\":[\"$DB_HOST\"],\"portNumber\":[\"5432\"],\"localPortNumber\":[\"5434\"]}"
```
**Expected:** `Waiting for connections...`

### 0.2 Connect with psql, read-only (Terminal B)

Install the Postgres client once if `psql --version` fails:
```bash
sudo apt-get update && sudo apt-get install -y postgresql-client
```

Fetch the **current** password. Fetch it again each session: RDS rotates it
automatically, so yesterday's value can stop working.
```bash
export PGPASSWORD=$(aws secretsmanager get-secret-value \
  --secret-id "$(aws secretsmanager list-secrets --query "SecretList[?starts_with(Name, 'rds!db-')].Name" --output text)" \
  --query SecretString --output text | python3 -c "import json,sys; print(json.load(sys.stdin)['password'])")

PGOPTIONS="-c default_transaction_read_only=on" psql -h localhost -p 5434 -U unifolio -d unifolio
```
**Expected:** a `unifolio=>` prompt. Quick check that it's really read-only:
```sql
SHOW default_transaction_read_only;   -- expected: on
```

### 0.3 Set your test identity (inside psql, every session)

Phone numbers are stored as `+91` followed by 10 digits. Use the exact phone and email you'll type
in the app:
```sql
\set phone '+919209298772'
\set email 'you+test1@example.com'
\x auto
```
Every query below uses `:'phone'` / `:'email'`, so you never paste IDs by hand.

> **One fresh phone + email per full run.** A phone or email can only belong to one
> account. Phone OTP is in stub mode (the code shows on screen), so any valid-looking
> Indian mobile number works. Email OTP is real (SES), so you need a mailbox you can
> read. If your mail provider supports `+` addressing, `you+test2@…` gives you a new
> address each run.

### 0.4 One-shot overview query (handy after any step)

```sql
SELECT
  (SELECT count(*) FROM users WHERE phone_number = :'phone')                                AS users,
  (SELECT count(*) FROM otp_requests WHERE phone_number = :'phone' OR email = :'email')      AS otp_rows,
  (SELECT count(*) FROM pending_identity_verifications WHERE provider_subject = :'phone')   AS pending,
  (SELECT count(*) FROM auth_identities a JOIN users u ON u.id = a.user_id WHERE u.phone_number = :'phone') AS identities,
  (SELECT count(*) FROM sessions s JOIN users u ON u.id = s.user_id WHERE u.phone_number = :'phone')        AS sessions,
  (SELECT count(*) FROM household_members m JOIN users u ON u.id = m.user_id WHERE u.phone_number = :'phone') AS members,
  (SELECT count(*) FROM imports i JOIN household_members m ON m.id = i.household_member_id
     JOIN users u ON u.id = m.user_id WHERE u.phone_number = :'phone')                      AS imports,
  (SELECT count(*) FROM analytics_sections s JOIN users u ON u.id = s.user_id WHERE u.phone_number = :'phone') AS analytics_rows;
```
The table in **Part 2** gives the expected value of each column after each step.

---

## Part 1. The happy path, step by step

Use **`family_cas_1.pdf`** (password `MF@123`) from
`Docs/orchestration/qa-fixtures/synthetic-cas/`. At onboarding Q1, type the name
**`Aditi Shanbhag`**. That's the name on the statement, so the app recognises her as "you" with
no extra questions (see scenario 3.9 for what happens with a different name).

> Don't use `CAS 10 Yr.pdf` from that folder: it's a real statement, kept only as the
> layout reference for the synthetic files.

### Step 1. Signup screen: type phone, click **Get OTP**

**Endpoint:** `POST /auth/otp/request`. The OTP appears on screen (stub mode).

```sql
SELECT id, phone_number, email, verified_at, attempt_count, expires_at - created_at AS ttl,
       ip_address, device_type, os_family, browser_family, device_id
FROM otp_requests WHERE phone_number = :'phone';
```
**Expected, 1 row:**

| column | value |
|---|---|
| phone_number | `+919209298772` |
| email | NULL |
| verified_at | NULL |
| attempt_count | `0` |
| ttl | `00:05:00` (the OTP lives 5 minutes) |
| ip_address | your public IP |
| device_type / os_family / browser_family | e.g. `desktop` / `Windows` / `Chrome` |
| device_id | a UUID (same value on every request from this browser) |

```sql
SELECT count(*) FROM users WHERE phone_number = :'phone';   -- expected: 0 (no account yet)
```

### Step 2. OTP screen: enter the code, **Verify & continue**

**Endpoint:** `POST /auth/otp/verify` with `flow: "signup"`.

```sql
SELECT verified_at IS NOT NULL AS verified, attempt_count FROM otp_requests WHERE phone_number = :'phone';
-- expected: verified = t, attempt_count = 0

SELECT provider, provider_subject, email, email_verified, matched_user_id,
       expires_at - created_at AS ttl
FROM pending_identity_verifications WHERE provider_subject = :'phone';
```
**Expected, 1 row:** `provider = phone_otp`, `provider_subject = +919209298772`,
`email` NULL, `email_verified = f`, `matched_user_id` NULL, `ttl = 00:10:00`.

```sql
SELECT count(*) FROM users WHERE phone_number = :'phone';   -- expected: STILL 0
```
The phone is verified, but the account is created only after the email step. You have
**10 minutes** to finish the email step (scenario 3.6 covers what happens if you take longer).

### Step 3. "One more step" screen: type email, **Send code**

**Endpoint:** `POST /auth/email-otp/request`. A real email is sent (SES).

```sql
SELECT provider, email, email_verified FROM pending_identity_verifications WHERE provider_subject = :'phone';
-- expected: phone_otp | you+test1@example.com | f      (the email is now attached)

SELECT phone_number, email, verified_at FROM otp_requests WHERE email = :'email';
-- expected: 1 row: phone_number NULL, email = your email, verified_at NULL
```

### Step 4. Enter the email code

**Endpoint:** `POST /auth/email-otp/verify`. One transaction creates the account.

```sql
SELECT id, phone_number, email, onboarding_step, investor_type, primary_goal,
       onboarding_completed_at, pending_deletion
FROM users WHERE phone_number = :'phone';
```
**Expected, 1 row:** your phone and email; `onboarding_step`, `investor_type`,
`primary_goal`, `onboarding_completed_at` all NULL; `pending_deletion = f`.

```sql
SELECT a.provider, a.provider_subject, a.email
FROM auth_identities a JOIN users u ON u.id = a.user_id
WHERE u.phone_number = :'phone' ORDER BY a.provider;
```
**Expected, 2 rows:**
```
 provider  | provider_subject      | email
-----------+-----------------------+-----------------------
 email_otp | you+test1@example.com | you+test1@example.com
 phone_otp | +919209298772         |
```

```sql
SELECT s.auth_method, s.expires_at - s.created_at AS ttl
FROM sessions s JOIN users u ON u.id = s.user_id WHERE u.phone_number = :'phone';
-- expected: 1 row: email_otp | 30 days

SELECT count(*) FROM pending_identity_verifications WHERE provider_subject = :'phone';  -- expected: 0 (consumed)
SELECT count(*) FROM otp_requests WHERE phone_number = :'phone' OR email = :'email';     -- expected: 0 (cleaned up)
```
The last check is the FR-9 cleanup: completing signup deletes every OTP row for this phone
and email.

### Step 5. Onboarding questions

Each screen saves the current step to `users.onboarding_step`:
```sql
SELECT onboarding_step, investor_type, primary_goal FROM users WHERE phone_number = :'phone';
```
| After you… | onboarding_step | investor_type | primary_goal |
|---|---|---|---|
| land on Q1 (name) | `q1_name` | NULL | NULL |
| submit Q1 | `q2_investing` | NULL | NULL |
| answer Q2 | `q3_purpose` | your answer, e.g. `self_directed` | NULL |
| answer Q3 | `trust_primer` | same | your answer, e.g. `consolidated_view` |
| continue past the trust screen | `cas_upload` | same | same |

- Q2 values: `self_directed`, `advisor_assisted`, `mixed`, `beginner`.
- Q3 values: `consolidated_view`, `understand_holdings`, `family_management`,
  `performance_comparison`.
- Skipping a question leaves that column NULL.

**The Q1 name is not saved at Q1.** `users` has no name column. It's used at Step 6 to
create your "self" member.

### Step 6. CAS upload screen opens

Opening the screen creates your self member:
```sql
SELECT m.name, m.relationship, m.origin, m.name_source, m.lock_reason,
       m.details_completed_at IS NOT NULL AS unlocked,
       m.pan_lookup_hash IS NOT NULL AS has_pan, m.pan_pending_until, m.pan_source
FROM household_members m JOIN users u ON u.id = m.user_id WHERE u.phone_number = :'phone';
```
**Expected, 1 row:**
- `name` = `Aditi Shanbhag`, `relationship` = `self`, `origin` = `onboarding`,
  `name_source` = `user_entered`
- `lock_reason` NULL, `unlocked` = `t`
- `has_pan` = `f`, `pan_pending_until` NULL, `pan_source` NULL

> If you reloaded the page during onboarding, the name typed at Q1 is lost and the member
> is created as `Me`. That's a known limitation, not a failure.

### Step 7. Choose `family_cas_1.pdf`, enter the password, upload

**Endpoint:** `POST /imports/parse`. Parsing happens in memory. **No `imports`, `folios`
or `transactions` rows are written yet.** The one write is a *pending* claim of the
statement's PAN on your self member, so nobody else can grab it while you review:
```sql
SELECT m.name, m.pan_lookup_hash IS NOT NULL AS has_pan,
       m.pan_pending_until > now() AS claim_pending, m.pan_source
FROM household_members m JOIN users u ON u.id = m.user_id
WHERE u.phone_number = :'phone' AND m.relationship = 'self';
-- expected: Aditi Shanbhag | t | t | NULL

SELECT count(*) FROM imports i JOIN household_members m ON m.id = i.household_member_id
JOIN users u ON u.id = m.user_id WHERE u.phone_number = :'phone';   -- expected: 0
```
The pending claim lasts 65 minutes. If you abandon the review, it expires on its own.

**What you should see on screen:** a people popup with **3 people**:
- **Aditi Shanbhag (you)**, PAN `BN******4K`, 2 funds
- **Rohan Shanbhag**, PAN `BN******8L`, 1 fund
- **Kavita Shanbhag**, no PAN (name only), 1 fund

### Step 8. Review the people ribbons, click **Confirm**

**Endpoint:** `POST /imports/confirm`. Everything below is written in one transaction.

**8a. Household members** (now 3):
```sql
SELECT m.name, m.relationship, m.origin, m.name_source, m.lock_reason,
       m.details_completed_at IS NOT NULL AS unlocked,
       m.pan_lookup_hash IS NOT NULL AS has_pan, m.pan_pending_until, m.pan_source,
       m.pan_verified_at IS NOT NULL AS pan_verified,
       m.detected_pan_hash IS NOT NULL AS has_detected_pan,
       m.detected_from_import_id IS NOT NULL AS has_detected_from
FROM household_members m JOIN users u ON u.id = m.user_id
WHERE u.phone_number = :'phone' ORDER BY m.created_at;
```
**Expected:**
```
 name           | relationship | origin       | name_source  | lock_reason    | unlocked | has_pan | pan_pending_until | pan_source | pan_verified | has_detected_pan | has_detected_from
----------------+--------------+--------------+--------------+----------------+----------+---------+-------------------+------------+--------------+------------------+-------------------
 Aditi Shanbhag | self         | onboarding   | user_entered |                | t        | t       |                   | cas        | t            | f                | f
 Rohan Shanbhag |              | cas_detected | cas          | details_needed | f        | f       |                   |            | f            | t                | t
 Kavita Shanbhag|              | cas_detected | cas          | details_needed | f        | f       |                   |            | f            | f                | t
```
- **Your PAN claim is final:** `pan_pending_until` is cleared, and `pan_source = cas`.
- **Rohan and Kavita are locked** (`details_needed`, no relationship yet). Rohan has a
  detected PAN; Kavita doesn't, because her folio carried no PAN.
- PANs are never stored in plain text, only as an encrypted value plus a keyed hash. That's
  why these queries check `IS NOT NULL` rather than showing the PAN.

**8b. Imports** (one row **per person**, not per file):
```sql
SELECT m.name, i.status, i.source_cas_type, i.new_transactions_count AS new,
       i.duplicate_transactions_count AS dup, i.upload_group_id, i.file_reference,
       i.file_expires_at - i.confirmed_at AS file_kept_for
FROM imports i JOIN household_members m ON m.id = i.household_member_id
JOIN users u ON u.id = m.user_id WHERE u.phone_number = :'phone' ORDER BY m.created_at;
```
**Expected, 3 rows:**

| name | status | source_cas_type | new | dup |
|---|---|---|---|---|
| Aditi Shanbhag | `confirmed` | `cams` | `5` | `0` |
| Rohan Shanbhag | `confirmed` | `cams` | `1` | `0` |
| Kavita Shanbhag | `confirmed` | `cams` | `1` | `0` |

All 3 rows share **one** `upload_group_id` and **one** `file_reference`
(`<user_id>/<upload_group_id>.pdf`, the PDF in S3), and `file_kept_for` = `30 days`.

**8c. Schemes, folios and transactions:**
```sql
SELECT m.name, f.folio_number, s.amfi_code, s.name AS scheme, f.plan_type,
       count(t.id) AS txns, string_agg(DISTINCT t.type::text, ',') AS types
FROM folios f
JOIN household_members m ON m.id = f.household_member_id
JOIN users u ON u.id = m.user_id
JOIN schemes s ON s.id = f.scheme_id
LEFT JOIN transactions t ON t.folio_id = f.id
WHERE u.phone_number = :'phone'
GROUP BY m.name, f.folio_number, s.amfi_code, s.name, f.plan_type, m.created_at
ORDER BY m.created_at, f.folio_number;
```
**Expected, 4 rows** (7 transactions in total):

| name | folio_number | amfi_code | scheme | txns | types |
|---|---|---|---|---|---|
| Aditi Shanbhag | `10559078` | `122639` | Parag Parikh Flexi Cap Fund - Direct Plan Growth | 2 | `purchase` |
| Aditi Shanbhag | `91022931304 / 0` | `140228` | Edelweiss Mid Cap Fund - Direct Plan Growth… | 3 | `purchase_sip` |
| Rohan Shanbhag | `477291116705 / 0` | `118741` | NIPPON INDIA INDEX FUND - NIFTY 50 PLAN… | 1 | `purchase` |
| Kavita Shanbhag | `12705694 / 27` | `145724` | Tata Arbitrage Fund-Direct Plan-Growth | 1 | `purchase` |

`plan_type` should be `direct` for all four. The statement's `*** Stamp Duty ***` lines are
**deliberately skipped** (no units or NAV), so there are no `stamp_duty` transactions.

**8d. Background work starts** (right after Confirm, before you click anything):
```sql
SELECT r.started_at, r.generation
FROM analytics_recompute_status r JOIN users u ON u.id = r.user_id WHERE u.phone_number = :'phone';
```
**Expected:** 1 row. `started_at` is **set** while the score is being computed (it runs as a
separate AWS task, typically 1–3 minutes), then goes back to **NULL** when done. `generation`
= `0` for a new account.

### Step 9. Click **Get my first score**

**Endpoint:** `PATCH /auth/me {onboarding_completed: true}`. **This button doesn't compute
the score.** The score was already being computed in the background since Step 8. The button
only marks onboarding as finished and takes you to the dashboard.
```sql
SELECT onboarding_step, onboarding_completed_at IS NOT NULL AS onboarding_done
FROM users WHERE phone_number = :'phone';
-- expected: cas_upload | t
```
`onboarding_step` stays `cas_upload`. The app never writes a final step value; completion
is recorded by `onboarding_completed_at`.

### Step 10. Background results (check 1–3 minutes after Confirm)

**10a. The score and other analytics:**
```sql
SELECT s.scope_key = 'combined' AS is_combined, m.name AS member, s.section,
       s.computed_at IS NOT NULL AS computed, s.failed_at
FROM analytics_sections s
JOIN users u ON u.id = s.user_id
LEFT JOIN household_members m ON m.id = s.household_member_id
WHERE u.phone_number = :'phone'
ORDER BY is_combined DESC, member, s.section;
```
**Expected when finished: 28 rows** = 7 sections × 4 scopes (the household total,
`combined`, plus one per member: Aditi, Rohan, Kavita).
- Sections: `allocation`, `benchmark`, `benchmark_funds`, `category_ranking`, `score`,
  `ter`, `ter_direct_regular`.
- `failed_at` should be NULL everywhere.
- **The first score is the `section = 'score'` row with `is_combined = t`.**

```sql
SELECT s.payload FROM analytics_sections s JOIN users u ON u.id = s.user_id
WHERE u.phone_number = :'phone' AND s.scope_key = 'combined' AND s.section = 'score';
```
**Expected:** a JSON object with the score. It's what the Analytics screen shows.

**If it looks different:**

| You see | Meaning |
|---|---|
| Fewer than 28 rows, `analytics_recompute_status.started_at` set | Still computing. Wait and re-run. |
| 0 rows, `started_at` NULL | The background task didn't start or crashed. Opening the **Analytics** screen retries automatically. Logs: `aws logs tail /ecs/staging-backend --since 15m` and `/ecs/staging-analytics-recompute`. |
| A section missing for one scope, others present | That section failed to compute (it's not stored at all on a first failure). See the `/ecs/staging-analytics-recompute` logs. |
| `failed_at` set on a row | That section failed on a *recompute*; the previous result is kept. |

**10b. Fund prices (NAV) fetched for the 4 funds:**
```sql
SELECT s.amfi_code, count(n.date) AS nav_days, max(n.date) AS latest_nav
FROM schemes s LEFT JOIN nav_history n ON n.scheme_id = s.id
WHERE s.amfi_code IN ('140228','122639','118741','145724')
GROUP BY s.amfi_code ORDER BY s.amfi_code;
```
**Expected:** 4 rows, each with `nav_days` > 0 and `latest_nav` within the last few days.
These are real funds, fetched from mfapi.in. **`nav_days` = 0** means the NAV fetch failed;
look for `NAV prefetch failed` in `/ecs/staging-backend`. Those funds then show no current
value.

### Step 11. Dashboard loads

Monthly portfolio values are computed the first time the dashboard asks for them:
```sql
SELECT m.name, count(p.snapshot_month) AS months, min(p.snapshot_month) AS first_month,
       max(p.snapshot_month) AS last_month
FROM portfolio_snapshots p JOIN household_members m ON m.id = p.household_member_id
JOIN users u ON u.id = m.user_id WHERE u.phone_number = :'phone'
GROUP BY m.name ORDER BY m.name;
```
**Expected:** a row per member, with month-end dates from **2025-04-30** (first transaction
month) onwards, up to the latest month-end. A month is **skipped, not stored as 0**, if a fund
had no NAV for it, so gaps mean missing prices, not a bug.

---

## Part 2. Quick reference: the overview query (0.4) after each step

| After step | users | otp_rows | pending | identities | sessions | members | imports | analytics_rows |
|---|---|---|---|---|---|---|---|---|
| 1 Get OTP | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 |
| 2 Verify phone | 0 | 1 | 1 | 0 | 0 | 0 | 0 | 0 |
| 3 Send email code | 0 | 2 | 1 | 0 | 0 | 0 | 0 | 0 |
| 4 Verify email | 1 | **0** | **0** | 2 | 1 | 0 | 0 | 0 |
| 5 Onboarding | 1 | 0 | 0 | 2 | 1 | 0 | 0 | 0 |
| 6 Upload screen | 1 | 0 | 0 | 2 | 1 | 1 | 0 | 0 |
| 7 Upload + parse | 1 | 0 | 0 | 2 | 1 | 1 | 0 | 0 |
| 8 Confirm | 1 | 0 | 0 | 2 | 1 | 3 | 3 | 0 → 28 |
| 9–11 | 1 | 0 | 0 | 2 | 1 | 3 | 3 | 28 |

---

## Part 3. Scenarios

Each scenario lists the steps, then what should (and shouldn't) be in the DB.

### 3.1 Resend the OTP (or re-submit the same number)

- **Within 60 seconds of the last code:** the screen says "Please wait … before requesting
  another code". **Nothing is written.**
- **After 60 seconds:** the **same row is reused**. Still one row per number, but with fresh
  timestamps:
```sql
SELECT id, created_at, expires_at, attempt_count FROM otp_requests WHERE phone_number = :'phone';
```
**Expected:** still **1 row, same `id`** as before, with `created_at` updated to the new
request time and `attempt_count = 0`.

### 3.2 Wrong OTP, and lockout after 5 wrong tries

```sql
SELECT attempt_count, verified_at FROM otp_requests WHERE phone_number = :'phone';
```
- Each wrong code: `attempt_count` goes up by 1 and the screen says "Incorrect OTP".
- At `attempt_count = 5`, even the **correct** code is refused ("Too many incorrect
  attempts"), and the count stops going up.
- Requesting a new code (after 60 seconds) resets it to `0` (same row).

### 3.3 OTP expired (waited more than 5 minutes)

"OTP has expired. Request a new one." **Nothing is written**; `verified_at` stays NULL.

### 3.4 Log in again later with the same phone

Log in → Continue with Phone → OTP.
```sql
SELECT s.auth_method, s.created_at FROM sessions s JOIN users u ON u.id = s.user_id
WHERE u.phone_number = :'phone' ORDER BY s.created_at;
-- expected: a NEW row with auth_method = phone_otp (the signup one was email_otp)

SELECT verified_at IS NOT NULL AS verified FROM otp_requests WHERE phone_number = :'phone';
-- expected: 1 row, verified = t. Login OTP rows are kept, unlike signup ones.

SELECT count(*) FROM users WHERE phone_number = :'phone';   -- expected: still 1
```

### 3.5 Log in with a phone number that has no account

Log in → Continue with Phone → a **new** number (`\set phone` to it first) → OTP.
- The screen says "No account found for that phone number — sign up instead."
- The DB has **no user, no pending row and no session**. One side effect: the OTP row is
  marked verified (the code itself was correct).
```sql
SELECT count(*) FROM users WHERE phone_number = :'phone';                          -- expected: 0
SELECT verified_at IS NOT NULL FROM otp_requests WHERE phone_number = :'phone';    -- expected: t
```
This is the fix for the old bug where phone login silently created a new account.

### 3.6 Too slow on the email step (more than 10 minutes after verifying the phone)

The screen shows "This verification has expired. Please start over" and drops you back
to the signup screen.
```sql
SELECT count(*) FROM users WHERE phone_number = :'phone';   -- expected: 0 (no account created)
SELECT expires_at < now() AS expired FROM pending_identity_verifications WHERE provider_subject = :'phone';
-- expected: t. The expired row stays; it's harmless and gets replaced on the next attempt.
```
Signing up again with the same phone works normally (a new pending row appears).

### 3.7 Email already used by another account

On the "One more step" screen, use an email that already belongs to an account.
- The screen says "An account with this email already exists."
- **Nothing is written:** no email is attached to the pending row, and no email OTP row.
```sql
SELECT email FROM pending_identity_verifications WHERE provider_subject = :'phone';  -- expected: NULL
```

### 3.8 Wrong CAS password

Upload `family_cas_1.pdf` with a wrong password.
- The screen shows a wrong-password message.
- **No rows at all:** no `imports`, and no pending PAN claim.
```sql
SELECT m.pan_lookup_hash IS NOT NULL AS has_pan FROM household_members m JOIN users u ON u.id = m.user_id
WHERE u.phone_number = :'phone' AND m.relationship = 'self';   -- expected: f (on a first upload)
```

### 3.9 Q1 name different from the statement name

If you typed something other than `Aditi Shanbhag` at Q1, the upload asks you which person
in the file is you, or confirms a name mismatch, before showing the people popup. Once you
answer, everything continues as in Step 7. If you accept the statement's name, the rename is
logged:
```sql
SELECT c.old_name, c.new_name, c.reason FROM household_member_name_changes c
JOIN household_members m ON m.id = c.household_member_id JOIN users u ON u.id = m.user_id
WHERE u.phone_number = :'phone';
-- expected (only if renamed): <your Q1 name> | Aditi Shanbhag | cas_variant (or user_corrected_to_cas)
```

### 3.10 Upload the same file again

Upload `family_cas_1.pdf` a second time and confirm.
```sql
SELECT i.upload_group_id, m.name, i.new_transactions_count AS new, i.duplicate_transactions_count AS dup
FROM imports i JOIN household_members m ON m.id = i.household_member_id
JOIN users u ON u.id = m.user_id WHERE u.phone_number = :'phone' ORDER BY i.uploaded_at, m.name;
```
**Expected:** **3 more import rows** (6 in total) with a **new** `upload_group_id`, and
`new = 0` for all three. `dup` is `5` for Aditi and `1` each for Rohan and Kavita.
- **No new members, folios or transactions:** re-run 8a and 8c; they're unchanged.
- The same people are recognised: Aditi as you; Rohan and Kavita as your existing locked
  members.

### 3.11 Unlock Rohan (add his details)

On the dashboard, open Rohan's locked card → add relationship (e.g. Spouse) and his PAN
**`BNZPS5678L`**.
```sql
SELECT m.name, m.relationship, m.lock_reason, m.details_completed_at IS NOT NULL AS unlocked,
       m.pan_lookup_hash IS NOT NULL AS has_pan, m.pan_source, m.pan_verified_at IS NOT NULL AS pan_verified,
       m.detected_pan_hash IS NOT NULL AS has_detected_pan
FROM household_members m JOIN users u ON u.id = m.user_id
WHERE u.phone_number = :'phone' AND m.name = 'Rohan Shanbhag';
```
**Expected:** `spouse`, lock_reason NULL, unlocked `t`, has_pan `t`, pan_source `cas`
(it matches the PAN seen on the statement), pan_verified `t`, has_detected_pan `f` (moved
into the real PAN columns).
- **Wrong PAN** (any other value): the screen refuses it, and Rohan is unchanged (still
  locked).
- A member can never be re-locked once unlocked; the database itself enforces this.

### 3.12 Upload the follow-up statement `family_cas_2.pdf`

Do this after Part 1 is finished. Unlock Rohan (3.11) first if you want to test the
"existing member" path; skip 3.11 to test the "locked member" path.

**On screen, 4 people:**
- **Aditi**: you.
- **Rohan**: an existing member (if unlocked), or still your locked Rohan.
- **Kavita**: now **with** a PAN, `BN******1M`.
- **Aarav Shanbhag**: new, PAN `BN******7N`.

After Confirm:
```sql
SELECT m.name, m.origin, m.lock_reason, m.detected_pan_hash IS NOT NULL AS has_detected_pan
FROM household_members m JOIN users u ON u.id = m.user_id
WHERE u.phone_number = :'phone' ORDER BY m.created_at;
```
**Expected, 5 members:** Aditi, Rohan, Kavita (the name-only one from file 1), **a second
`Kavita Shanbhag`** (locked, `has_detected_pan = t`), and **Aarav Shanbhag** (locked,
`has_detected_pan = t`).

**Why two Kavitas:** file 1's Kavita had no PAN, so there's nothing to match file 2's PAN
against. The app creates a new locked member. The intended fix is **merge** (scenario 3.13).
If you see only **one** Kavita whose `has_detected_pan` became `t`, that's a different
(name-matching) behaviour from what the code review expected; note it and tell me.

```sql
-- imports for file 2 (the newest upload_group_id)
SELECT m.name, i.new_transactions_count AS new, i.duplicate_transactions_count AS dup
FROM imports i JOIN household_members m ON m.id = i.household_member_id
JOIN users u ON u.id = m.user_id
WHERE u.phone_number = :'phone'
  AND i.upload_group_id = (SELECT i2.upload_group_id FROM imports i2
        JOIN household_members m2 ON m2.id = i2.household_member_id JOIN users u2 ON u2.id = m2.user_id
        WHERE u2.phone_number = :'phone' ORDER BY i2.uploaded_at DESC LIMIT 1)
ORDER BY m.name;
```
**Expected, 4 rows, 9 new transactions in total, 0 duplicates:** Aditi `new = 5`, Rohan `1`,
Kavita `1`, Aarav `2`. None of file 2's transactions repeat file 1's.

The new fund is HDFC Children's Fund (`amfi_code = 119066`, folio `36378526 / 81`) under
Aarav. Analytics recompute afterwards: expect **7 × 6 = 42** `analytics_sections` rows
once finished (combined + 5 members).

### 3.13 Merge the name-only Kavita into the PAN Kavita

On the name-only Kavita's locked card → merge into the other Kavita.
```sql
SELECT g.removed_member_name, g.folios_moved, g.transactions_dropped
FROM household_member_merges g JOIN users u ON u.id = g.user_id WHERE u.phone_number = :'phone';
-- expected: 1 row: Kavita Shanbhag | 1 | 0

SELECT count(*) FROM household_members m JOIN users u ON u.id = m.user_id
WHERE u.phone_number = :'phone' AND m.name = 'Kavita Shanbhag';   -- expected: 1
```
Her Tata folio and its transactions now belong to the remaining Kavita (re-run 8c: the
`12705694 / 27` folio shows under the kept member).
- Merge is only offered when the member being removed is **locked and has no PAN**.
- The recompute `generation` goes up by 1, and analytics recompute runs again.

### 3.14 Delete an import (Profile → Import history)

```sql
SELECT count(*) AS imports FROM imports i JOIN household_members m ON m.id = i.household_member_id
JOIN users u ON u.id = m.user_id WHERE u.phone_number = :'phone';

SELECT count(*) AS analytics_rows FROM analytics_sections s JOIN users u ON u.id = s.user_id
WHERE u.phone_number = :'phone';

SELECT r.generation, r.started_at FROM analytics_recompute_status r JOIN users u ON u.id = r.user_id
WHERE u.phone_number = :'phone';
```
- **Delete the whole upload (all people in that file):** every import row with that
  `upload_group_id` is gone, along with its transactions and any folios left empty.
  **Locked, CAS-detected members with no imports left are deleted.** The PDF in S3 is
  deleted.
- **Delete one person's part:** only that person's import row and transactions. The PDF
  stays while other people in the same upload still point to it.
- **Either way:**
  - your self member is **never** deleted, and keeps its PAN;
  - **all** analytics rows are deleted (then recomputed);
  - `generation` goes up by 1;
  - monthly snapshots are recomputed on the next dashboard load.

### 3.15 The same CAS on a second, different account

Sign up a second account (new phone + email) and upload `family_cas_1.pdf` there too.
- Aditi's PAN is already claimed by account 1, so the upload is **blocked** with a message
  that this statement belongs to another account.
- **Nothing is written for account 2:** no imports and no PAN claim.
```sql
\set phone '+91<second-account-phone>'
SELECT count(*) FROM imports i JOIN household_members m ON m.id = i.household_member_id
JOIN users u ON u.id = m.user_id WHERE u.phone_number = :'phone';   -- expected: 0
```

---

## Part 4. When something doesn't match

1. Re-run the **overview query (0.4)** and compare it with the Part 2 table to see which
   step diverged.
2. Pull the backend error, if any:
   `aws logs tail /ecs/staging-backend --region ap-south-1 --since 30m --format short | grep -A 40 Traceback | tail -60`
3. For analytics problems, check the recompute task's log too:
   `aws logs tail /ecs/staging-analytics-recompute --region ap-south-1 --since 30m --format short | tail -80`
4. **The whole app says "Unable to connect to the server" and every DB-touching call fails:**
   that's the database password rotation issue from 2026-09-30. Restart the backend with
   `aws ecs update-service --cluster unifolio-staging --service unifolio-staging-backend --force-new-deployment --region ap-south-1`.
5. Send me the query, its output, and which step you were on.
