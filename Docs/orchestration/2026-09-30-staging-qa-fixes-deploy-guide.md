# Staging QA Fixes — Staging Deploy Guide

**What ships:** the fixes for the six issues found testing the auth redesign and CAS member
detection on staging (30 Sep 2026). Findings and decisions:
`Docs/orchestration/2026-09-30-staging-qa-findings-map.html`. Plan:
`Docs/superpowers/plans/2026-09-30-staging-qa-fixes.md`. All on `feat/enhanced-ui`.

1. Sign Up with an already-registered phone is rejected before a code is sent; Log In with an
   unknown phone or email is rejected before a code is sent.
2. "What brings you to Unifolio?" becomes multi-select (new column `users.primary_goals`).
3. Review screen: the per-member grid is capped at 3 columns; members with nothing to fix
   confirm themselves.
4. Wrong PAN at unlock opens a popup (use the statement's PAN, or upload a different statement).
5. Duplicate family members (the "three Kavitas" bug) no longer get created; existing
   duplicates can now be merged.
6. Import history shows the statement period, including for old imports.

**Same shape as `2026-09-30-member-detection-auth-staging-guide.md`**, with these differences:
1. **Two new migrations, `0019` and `0020`**, run through the SSM bastion tunnel as before.
   **This time they run *before* the image push** (Step 3 migrate, Step 4 push). Pushing
   first would let a scheduled job or a restarting task start the new code on the old schema.
   - `0019` adds `users.primary_goals` and copies each user's existing goal into it. The
     old column `primary_goal` is kept on purpose.
   - `0020` is data only: it fills in the statement dates on existing imports.
2. **No broken window this time.** Both migrations only *add*: the old column stays, and no
   constraint touches existing code paths. So the **old** backend keeps working after the
   migration. The **new** backend needs `0019`, though, so the order is: migrate (Step 3),
   push the image (Step 4), roll out (Step 5).
3. **The backend rollout has a few minutes of downtime.** Staging runs one backend task, and
   ECS stops the old task before the new one is healthy. Anyone in the middle of reviewing a
   CAS import must upload it again, because review sessions live in memory.
4. **No Terraform, config, Dockerfile, Python-dependency or npm-dependency changes.**
   `terraform plan` is only a drift check and should say `No changes`.
5. **The frontend must be rebuilt and uploaded** (Step 6): 4 of the 6 fixes are visible there.

Everything below runs on **your manager's laptop** (Terraform, AWS CLI, Docker and AWS
credentials already set up, as for the previous guide).

---

## Step 00 — Before handing over (Aditi, on your machine)

The fixes are **not committed yet**. Commit and push them first, including the new
(untracked) files.

```bash
git status --short | grep '^??'
```
**Expected:** the new files that belong to this release:
```
?? Docs/orchestration/2026-09-30-staging-db-verification-guide.md
?? Docs/orchestration/2026-09-30-staging-qa-findings-map.html
?? Docs/orchestration/2026-09-30-staging-qa-fixes-deploy-guide.md
?? Docs/superpowers/plans/2026-09-30-staging-qa-fixes.md
?? backend/alembic/versions/0019_user_primary_goals.py
?? backend/alembic/versions/0020_import_statement_period_backfill.py
?? frontend/src/features/dashboard/members/DetectedPanMismatchDialog.tsx
?? frontend/src/features/import/prompts/SamePersonDialog.test.tsx
```
The two migrations and `DetectedPanMismatchDialog.tsx` **must** be committed:
- without the migrations, Step 3 has nothing to run;
- without the dialog, Step 6's build fails.

After committing, `git push` and tell your manager the last commit hash.

---

## Step 0 — Pre-flight on the manager's laptop (no AWS changes)

### 0a. Confirm the code is committed, pushed and pulled

```bash
cd MVP_V1_MF_only
git checkout feat/enhanced-ui
git pull
git status --short          # expected: empty
git log --oneline -1        # expected: the hash Aditi sent
ls backend/alembic/versions/ | grep -E "^00(19|20)_"
grep -c "use_detected_pan" backend/app/services/dashboard/member_details.py
```
**Expected:**
- the `ls` prints both files:
  ```
  0019_user_primary_goals.py
  0020_import_statement_period_backfill.py
  ```
- the `grep` prints a number of **2 or more**.

If either migration is missing, or the `grep` prints `0`, the fixes weren't committed or
pushed. **Stop** and ask Aditi.

### 0b. Run the Postgres-only tests (0019 has never run on Postgres)

These fixes were built on a machine without Docker. The Postgres half of `0019` has
therefore only been desk-checked, never run. That half covers the JSONB column, the rule
limiting it to the four goal values, and the copy of existing goals. This laptop has Docker,
so it's a two-minute check before touching staging's RDS.

```bash
docker compose down                  # fresh database: the container has no data volume
docker compose up -d postgres        # local test Postgres on localhost:5433
docker compose ps                    # wait until the postgres line says "healthy" (~10 s)
cd backend
python3 -m venv .venv 2>/dev/null; .venv/bin/pip install -q -r requirements.txt
TEST_DATABASE_URL=postgresql+psycopg2://unifolio:unifolio@localhost:5433/unifolio_test \
  timeout 600 .venv/bin/python -m pytest -v --tb=short -m postgres tests/functional_postgres
cd ..
docker compose stop postgres
```
**Expected:** 10 tests, each `PASSED`, ending in `10 passed in Ns` (N roughly 30–120). That's
last time's 9, plus one new test for 0019:
```
collecting ... collected 10 items

tests/functional_postgres/test_cascade_deletes.py::test_hard_delete_expired_accounts_cascades_cleanly_on_postgres PASSED [ 10%]
tests/functional_postgres/test_cascade_deletes.py::test_delete_household_import_cascades_cleanly_on_postgres PASSED [ 20%]
tests/functional_postgres/test_member_detection_postgres.py::test_0018_round_trip_and_never_relock_trigger_on_postgres PASSED [ 30%]
tests/functional_postgres/test_member_detection_postgres.py::test_0018_backfills_preexisting_members_on_postgres PASSED [ 40%]
tests/functional_postgres/test_member_detection_postgres.py::test_0019_primary_goals_check_constraint_on_postgres PASSED [ 50%]
tests/functional_postgres/test_partitioning.py::test_transactions_and_nav_history_are_partitioned PASSED [ 60%]
tests/functional_postgres/test_partitioning.py::test_transaction_orm_insert_round_trips_on_partitioned_table PASSED [ 70%]
tests/functional_postgres/test_partitioning.py::test_enum_drift_values_are_writable_after_migration PASSED [ 80%]
tests/functional_postgres/test_partitioning.py::test_upsert_nav_history_is_conflict_safe_on_postgres PASSED [ 90%]
tests/functional_postgres/test_partitioning.py::test_household_members_one_self_row_per_user_on_postgres PASSED [100%]

============================== 10 passed in 58.12s ==============================
```
The header lines (Python/pytest versions, paths), the order within a file and the timing can
differ. What must match: `collected 10 items`, all 10 names, every one `PASSED`, and the
final `10 passed`. A warnings summary before the last line is fine.

**The one that matters for this release** is
`test_0019_primary_goals_check_constraint_on_postgres`. It upgrades a real Postgres to the
new head (so `0019` and `0020` both run), then checks the goal rule:
- a valid goal list is accepted;
- a bad value (`["foo"]`), an empty list and a plain string are all rejected.

**Any failure: stop and send Aditi the full output.** Don't run the migration on staging.

**If the output is different:**
- **`10 skipped`:** the tests didn't run, so this isn't a pass. `TEST_DATABASE_URL=...` has
  to be on the same command line as `pytest`, exactly as written.
- **`collected 9 items`:** this checkout doesn't have the new test. Re-run `git pull` and
  redo 0a.
- **`connection refused` / `could not connect`:** Postgres isn't healthy yet. Re-check
  `docker compose ps` and re-run.
- **Stuck with no progress for more than 2 minutes:** press Ctrl+C. Run this in a second
  terminal and send the output:
  ```bash
  docker compose exec postgres psql -U unifolio -d unifolio_test -c \
    "select pid, state, wait_event_type, left(query, 100) from pg_stat_activity where datname = 'unifolio_test';"
  ```

### 0c. Full suites (recommended)

```bash
(cd backend && .venv/bin/python -m pytest -q -p no:cacheprovider | tail -1)
```
**Expected:** `1003 passed, 16 skipped` (plus a warnings count and the time). The 16 skips
are normal:
- 10 Postgres tests (0b already ran them);
- 5 tests that need the synthetic CAS PDFs, which aren't in the repo;
- 1 test that needs the frontend dev server running.

Any `failed`: stop and send the output.

```bash
(cd frontend && npm ci && npx tsc -b && echo "TSC OK" && npx vitest run --maxWorkers=2 | tail -4)
```
**Expected:** `TSC OK`, then:
```
 Test Files  89 passed (89)
      Tests  630 passed (630)
```
- Use `npx tsc -b`, not `npx tsc --noEmit`: only `-b` really checks, and it's what Step 6's
  build runs.
- `--maxWorkers=2` avoids a harmless but noisy failure mode on slower machines, where vitest
  reports `Timeout waiting for worker to respond` / `Failed to start forks worker`. Those
  are startup timeouts, not test failures. If they still show up, re-run just the files it
  names.

---

## Step 1 — Verify AWS identity

```bash
aws sts get-caller-identity
```
**Expected:** `"Account": "811364789032"`. If this errors, fix credentials first.

```bash
cd infra/envs/staging
terraform init
```
**Expected:** `Terraform has been successfully initialized!`

---

## Step 2 — Drift check: `terraform plan` should show no changes

Re-export the PAN keys **from Secrets Manager**. Never generate new ones: a different
value silently breaks decryption of every stored PAN.

```bash
SECRET=$(aws secretsmanager get-secret-value \
  --secret-id unifolio-staging-pan-keys \
  --region ap-south-1 \
  --query SecretString --output text)

export TF_VAR_pan_encryption_key=$(echo "$SECRET" | python3 -c "import json,sys; print(json.load(sys.stdin)['PAN_ENCRYPTION_KEY'])")
export TF_VAR_pan_lookup_pepper=$(echo "$SECRET" | python3 -c "import json,sys; print(json.load(sys.stdin)['PAN_LOOKUP_PEPPER'])")

export TF_VAR_otp_delivery_mode="stub"
export TF_VAR_email_delivery_mode="ses"
export TF_VAR_ses_from_email="no-reply@unifolio.in"
export TF_VAR_ses_identity_arn="arn:aws:ses:ap-south-1:811364789032:identity/unifolio.in"

terraform plan
```
**Expected:** `No changes. Your infrastructure matches the configuration.`
- **If the only change is the RDS `engine_version`:** the database module tracks the latest
  Postgres 16.x minor release, and AWS published a new one. That has nothing to do with this
  release. **Don't apply it**: it would restart the database right away. Carry on with
  Step 3, and mention it to Aditi.
- **If it shows any other changes:** staging was changed by hand, or an unrelated Terraform change
  landed. **Stop, don't apply**, and send the plan output. Nothing in this release needs
  Terraform.
- **If it prompts for a variable:** one of the `TF_VAR_*` exports is missing. Re-run them in
  this same terminal.

Save the values later steps need (same terminal):
```bash
REPO_ROOT=$(git rev-parse --show-toplevel)
BASTION_ID=$(terraform output -json networking | python3 -c "import json,sys; print(json.load(sys.stdin)['bastion_instance_id'])")
DB_HOST=$(terraform output -raw db_address)
DB_NAME=$(terraform output -raw db_name)
echo "$BASTION_ID $DB_HOST $DB_NAME"
```
**Expected:** three values:
- a bastion id (`i-0b67d40d9b58b7814` last time);
- the `staging-rds....` hostname;
- `unifolio`.

---

## Step 3 — Run migrations `0019` + `0020` on staging RDS

**Migrate before pushing the image.** Once the new image is pushed as `:latest`, anything that
starts a task uses it: the scheduled jobs at 06:00, 06:30 and 08:00 UTC, or a backend task
restarting. The new code needs `0019`'s column, so the schema must already be there. The old
backend runs fine on the migrated schema, so migrating first is safe.

**Terminal A**: open the tunnel on local port **5434**. That's not 5433, so it can't collide
with the Step 0b Postgres.
```bash
aws ssm start-session \
  --target "$BASTION_ID" \
  --document-name AWS-StartPortForwardingSessionToRemoteHost \
  --parameters "{\"host\":[\"$DB_HOST\"],\"portNumber\":[\"5432\"],\"localPortNumber\":[\"5434\"]}"
```
(If `$BASTION_ID`/`$DB_HOST` aren't set in this terminal, paste the values from Step 2.)
**Expected:** `Starting session with SessionId: ...`, then `Port 5434 opened for sessionId ...`
and `Waiting for connections...`. Leave it open.

**Terminal B**: fetch the master password into an env var, never a literal. The real
password contains `$` characters that bash mangles.
```bash
export PGPASSWORD=$(aws secretsmanager get-secret-value \
  --secret-id "$(aws secretsmanager list-secrets --query "SecretList[?starts_with(Name, 'rds!db-')].Name" --output text)" \
  --query SecretString --output text | python3 -c "import json,sys; print(json.load(sys.stdin)['password'])")

cd MVP_V1_MF_only/backend        # the same checkout as Step 0a (use its full path if needed)
# URL-encode the password: a # ? or % in it would otherwise break the connection string.
export DATABASE_URL="postgresql://unifolio:$(python3 -c "import os,urllib.parse; print(urllib.parse.quote_plus(os.environ['PGPASSWORD']))")@localhost:5434/unifolio"
.venv/bin/alembic current
```
**Expected:** `0018 (head)`, since staging was migrated to 0018 in the previous deploy.
Alembic's `INFO  [alembic.runtime.migration] Context impl PostgresqlImpl.` line before it is
normal.
- **`0019` or `0020 (head)` already:** part or all of this step was done before. If
  `0020 (head)`, skip to the sanity queries below.
- **Anything older than `0018`:** stop. The previous deploy's migrations are missing there.
  Send the output.

First, **record the numbers before the migration**. The sanity check below compares
against them.
```bash
.venv/bin/python - <<'EOF'
import os, sqlalchemy as sa
with sa.create_engine(os.environ["DATABASE_URL"]).connect() as c:
    print("users with a goal:", c.execute(sa.text("SELECT count(*) FROM users WHERE primary_goal IS NOT NULL")).scalar())
    print("imports total / with period:", c.execute(sa.text("SELECT count(*), count(statement_from_date) FROM imports")).one())
EOF
```
**Expected:** two lines, e.g. `users with a goal: 14` and `imports total / with period: (37, 0)`.
The second number of the second line should be **0**: nothing ever wrote the statement
period before this fix. Write both lines down.

Now migrate:
```bash
.venv/bin/alembic upgrade head
.venv/bin/alembic current
```
**Expected:**
```
INFO  [alembic.runtime.migration] Context impl PostgresqlImpl.
INFO  [alembic.runtime.migration] Will assume transactional DDL.
INFO  [alembic.runtime.migration] Running upgrade 0018 -> 0019, users.primary_goals (expand phase): multi-select onboarding goal
INFO  [alembic.runtime.migration] Running upgrade 0019 -> 0020, imports statement period backfill (data only)
```
then `0020 (head)`.

**What this does to existing data:**
- `0019`:
  - adds `users.primary_goals`;
  - copies each user's one existing goal into it as a one-item list (e.g.
    `["family_management"]`);
  - adds a check that only allows lists of 1–4 of the four known goals.
  - `primary_goal` is **not** removed.
- `0020`: reads the statement period out of each confirmed import's stored parse output
  and fills in `statement_from_date` / `statement_to_date`. Imports with no stored period
  stay empty: CAMS email requests that never uploaded a file, and manual coverage-gap
  entries.

**If `upgrade` fails:**
- Postgres runs each migration in its own transaction. A failed `0019` leaves the database
  at `0018`; a failed `0020` leaves it at `0019`, with nothing half-applied.
- Copy the full error, don't retry, and send it.
- The old backend is still running and is fine at either version, so staging keeps working.

**Sanity check after the migration:**
```bash
.venv/bin/python - <<'EOF'
import os, sqlalchemy as sa
with sa.create_engine(os.environ["DATABASE_URL"]).connect() as c:
    print("old/new goal columns:", c.execute(sa.text(
        "SELECT count(*) FILTER (WHERE primary_goal IS NOT NULL), count(*) FILTER (WHERE primary_goals IS NOT NULL) FROM users")).one())
    print("goal check exists:", c.execute(sa.text(
        "SELECT count(*) FROM pg_constraint WHERE conname = 'ck_users_primary_goals_allowed'")).scalar())
    print("imports total / with period:", c.execute(sa.text("SELECT count(*), count(statement_from_date) FROM imports")).one())
    print("sample:", c.execute(sa.text(
        "SELECT statement_from_date, statement_to_date FROM imports WHERE statement_from_date IS NOT NULL LIMIT 3")).all())
EOF
```
**Expected:**
- **`old/new goal columns: (N, N)`**: both numbers the same, and equal to the "users with a
  goal" count from before.
- **`goal check exists: 1`**
- **`imports total / with period: (T, P)`**: T is the same total as before, and P is now
  close to T. The gap is only the CAMS-request and manual entries.
- **`sample:`** real dates, e.g. `[(datetime.date(2025, 4, 1), datetime.date(2025, 9, 30)), ...]`.

If the goal counts differ, or P is still 0 while T is not, stop and send the output. The
migration itself is still safe to leave in place.

Close the tunnel in Terminal A (Ctrl+C). Continue with Step 4. There's no rush: the running (old) backend is fine on the migrated schema.

---

## Step 4 — Build and push the backend image (after Step 3 reached `0020 (head)`)

```bash
cd "$REPO_ROOT/backend"
docker build -t unifolio-staging-backend .
```
**Expected:** the build completes (`naming to docker.io/library/unifolio-staging-backend`).
If it fails with `failed to xattr .pytest_tmp: permission denied`, run
`sudo rm -rf .pytest_tmp` and retry.

**Save the currently running image first. This is your rollback point.**
- Every task uses the `:latest` tag, so pointing ECS at an older task-definition revision
  would just pull the new image again.
- Pushing a new `:latest` also leaves the old image untagged, and ECR expires untagged
  images after 14 days.
- So give the current image a second, permanent tag before pushing:
```bash
MANIFEST=$(aws ecr batch-get-image --repository-name unifolio-staging-backend --region ap-south-1 \
  --image-ids imageTag=latest --query 'images[0].imageManifest' --output text)
aws ecr put-image --repository-name unifolio-staging-backend --region ap-south-1 \
  --image-tag pre-qa-fixes --image-manifest "$MANIFEST" --query 'image.imageId' --output json
```
**Expected:** JSON with `"imageDigest": "sha256:..."` and `"imageTag": "pre-qa-fixes"`.
- If it says `ImageAlreadyExistsException`, that tag already points at this same image.
  That's fine: continue.
- Any other error: stop. Without this tag there's no clean rollback.

Now push the new image:
```bash
aws ecr get-login-password --region ap-south-1 | \
  docker login --username AWS --password-stdin \
  811364789032.dkr.ecr.ap-south-1.amazonaws.com

docker tag unifolio-staging-backend:latest \
  811364789032.dkr.ecr.ap-south-1.amazonaws.com/unifolio-staging-backend:latest
docker push 811364789032.dkr.ecr.ap-south-1.amazonaws.com/unifolio-staging-backend:latest
```
**Expected:** `Login Succeeded`, then a push ending in `latest: digest: sha256:... size: ...`.

Pushing does **not** change what's running: that happens in Step 5.

---

## Step 5 — Roll out the new backend image

```bash
aws ecs update-service --cluster unifolio-staging --service unifolio-staging-backend \
  --force-new-deployment --query "service.deployments[0].status" --output text
```
**Expected:** `PRIMARY`.

Watch it (two terminals):
```bash
watch -n 5 'aws ecs describe-services --cluster unifolio-staging --services unifolio-staging-backend \
  --query "services[0].{running:runningCount,desired:desiredCount,rollout:deployments[0].rolloutState}"'
```
```bash
aws logs tail /ecs/staging-backend --follow
```
**Expected:**
- `rollout` goes `IN_PROGRESS`, then `COMPLETED`, usually within 3–6 minutes, with
  `running` equal to `desired`.
- The logs show the app starting (`Uvicorn running on ...` / `Application startup complete.`),
  with no tracebacks and no crash loop.

A traceback mentioning `primary_goals` means Step 3 didn't reach `0019` on this database: go
back to Step 3.

```bash
curl -s https://staging-api.unifolio.in/health
```
**Expected:** a healthy response, e.g. `{"status":"ok"}`.

**Quick API check that the new code is live** (safe: it sends no code and writes nothing):
```bash
curl -s -X POST https://staging-api.unifolio.in/auth/otp/request \
  -H "Content-Type: application/json" \
  -d '{"phone_number":"+910000000001","flow":"login"}'
```
**Expected:**
`{"detail":"No account found for that phone number — sign up instead."}`

If instead it returns `{"message":"OTP sent.", ...}`, the old backend is still serving:
- wait until `rollout` says `COMPLETED`, then retry;
- only use this unregistered test number, since a code only goes out on the old backend.

The scheduled job tasks share the `:latest` image and pick up the new code on their next
run. No action needed.

---

## Step 6 — Build and publish the frontend

Two blocks. **Only start 6b after 6a prints `BUILD OK`.**

**6a. Build (nothing leaves the laptop yet):**
```bash
cd "$REPO_ROOT/frontend" && \
  rm -rf dist && \
  npm ci && \
  VITE_API_BASE_URL=https://staging-api.unifolio.in npm run build && \
  test -f dist/index.html && echo "BUILD OK"
```
**Expected:** the last line is `BUILD OK`.
- Vite's `Measured inside the callback...` plugin timings before it are informational.
- `npm ci`'s "N vulnerabilities" notice doesn't block anything.
- **No `BUILD OK`, or any `error TS...` line:** stop, don't run 6b, and send the output.

**6b. Publish (only after `BUILD OK`):**
```bash
aws s3 sync dist/ "s3://$(terraform -chdir="$REPO_ROOT/infra/envs/staging" output -raw s3_bucket_name)/" --delete && \
aws cloudfront create-invalidation \
  --distribution-id "$(terraform -chdir="$REPO_ROOT/infra/envs/staging" output -raw cloudfront_distribution_id)" \
  --paths "/*"
```
**Expected:**
- the sync prints `upload: dist/...` lines, plus `delete: s3://...` for old hashed asset files;
- the invalidation returns JSON with an `"Id"` and `"Status": "InProgress"`.

The invalidation takes a few minutes, so hard-refresh (Ctrl+Shift+R) before testing.

---

## Step 7 — Verify on https://staging.unifolio.in

The OTP is echoed on screen for phone (stub mode). Email codes arrive by SES as before. Use
an incognito window for the fresh-account checks.

**1. Sign-up / log-in checks (issue 1)**
- a. **Sign Up** with the phone number of an account that already exists.
  **Expected:** "An account with this phone number already exists." with a **Log in
  instead** button. **No code screen appears.**
- b. Click **Log in instead**. **Expected:** the landing page in Log In mode.
- c. **Log In** with a phone number that has no account (e.g. `9000000001`).
  **Expected:** "No account found for that phone number — sign up instead." with a
  **Sign up instead** button. No code screen.
- d. Same with **email** login for an unregistered email. **Expected:** "No account found
  for that email — sign up instead."
- e. Normal Log In with an existing phone and an existing email still works. Normal Sign Up
  with a brand-new number still goes phone → email → onboarding.

**2. Multi-select goal (issue 2)**
- On a fresh account, the "What brings you to Unifolio?" step:
  - options can be ticked and unticked, several at once;
  - **Continue** stays disabled until at least one is ticked;
  - Skip still works.
- An existing account's saved goal is kept. Nothing in the UI shows it back, so Step 3's
  sanity numbers are the check for this.

**3. Review screen (issue 3)**
- Upload a CAS where at least one person needs an AMFI code or plan type, and another
  person needs nothing:
  - the person with nothing to fix shows a green **Confirmed** badge on the closed ribbon,
    without being opened;
  - they can still be opened;
  - the other person still needs fixing before **Confirm imports** enables.
- Open a ribbon on a desktop-width window:
  - the fund cards sit **at most 3 per row**;
  - the folio chip and the "Action needed" label stay inside each card;
  - scheme names aren't cut to one word.

**4. Wrong PAN at unlock (issue 4)**
- Open a locked detected member, choose a relationship, and type a PAN that differs from
  their statement. **Expected:** a **popup** titled "This PAN doesn't match your statement",
  showing both PANs masked, with two buttons:
  - **The one on the statement (BN******8L)**: the member unlocks and their dashboard opens;
  - **The one I entered (…)**: nothing is saved, the member stays locked, and the upload
    screen opens.
- Closing the popup with **×** returns to the form, with the typed PAN still there.

**5. Duplicate family members (issue 5)**
Replay the original sequence on a **fresh account** with the two synthetic family
statements, `family_cas_1.pdf` and `family_cas_2.pdf` (password `MF@123`; Aditi has
copies):
- a. Sign up as **Aditi Shanbhag**, upload `family_cas_1.pdf`, confirm. **Expected:**
  Aditi, Rohan, and Kavita (locked, "PAN not on statement").
- b. Unlock **Rohan**: relationship, PAN `BNZPS5678L`.
- c. **Add data for Rohan** with `family_cas_2.pdf`. **Expected:** a popup "Is this the
  Kavita Shanbhag you already have?". Choose **Yes, same person**, then confirm.
- d. **Add data for Rohan** with `family_cas_1.pdf` again, then again with
  `family_cas_2.pdf`, confirming each time.
- **Expected after every step:** **exactly one Kavita Shanbhag** in the member dropdown.
  Aarav appears once, from file 2.

On the **old account** that already has three Kavitas: open one of the locked Kavitas and
unlock her with PAN `BNZPK4321M`. Then open each other Kavita, enter the same PAN, and
choose **Merge them**. **Expected:**
- each merge popup tells the two apart, e.g. "Kavita Shanbhag (BN******1M, 1 fund) and
  Kavita Shanbhag (already on your dashboard)…";
- the merge completes;
- one Kavita remains.

**6. Statement period (issue 6)**
- Profile → **Import History**. **Expected:** each statement shows its period, e.g.
  "1 Apr 2025 – 30 Sep 2025", instead of "Statement period unavailable".
  - This includes imports made **before** today (filled in by `0020`).
  - It includes new ones too.
  - Not every import will show one: CAMS email requests and manual opening-balance entries
    have no statement period, so they still show "Statement period unavailable".
- On a phone-width window, the same dates show in the mobile history.

**7. Mobile (quick look)**
- Repeat check 3 and check 4 on a phone. Neither has had phone-width visual QA yet.

---

## If something goes wrong

**Backend crash-loops or misbehaves after Step 5.** Put the saved image back as `:latest`
and redeploy:
```bash
MANIFEST=$(aws ecr batch-get-image --repository-name unifolio-staging-backend --region ap-south-1 \
  --image-ids imageTag=pre-qa-fixes --query 'images[0].imageManifest' --output text)
aws ecr put-image --repository-name unifolio-staging-backend --region ap-south-1 \
  --image-tag latest --image-manifest "$MANIFEST" --query 'image.imageId' --output json
aws ecs update-service --cluster unifolio-staging --service unifolio-staging-backend \
  --force-new-deployment --query "service.deployments[0].status" --output text
```
**Expected:** JSON with `"imageTag": "latest"`, then `PRIMARY`. Watch the rollout as in Step 5.
- The scheduled jobs pick up the rolled-back `:latest` on their next run.
- **The old backend works with the migrated schema:** `0019` kept `primary_goal`, and `0020`
  only filled in dates. So a backend rollback needs **no** schema downgrade. Leave the
  database at `0020`.

**Downgrading the schema** (only if Aditi asks; normally not needed):
```bash
# tunnel + PGPASSWORD + DATABASE_URL as in Step 3, then:
.venv/bin/alembic downgrade 0018
```
**Expected:** `Running downgrade 0020 -> 0019` and `Running downgrade 0019 -> 0018`.
- `0020`'s downgrade does nothing: the filled-in dates stay, and are harmless.
- `0019`'s downgrade drops `primary_goals`. Only goals picked **after** this deploy would be
  lost, and only if a user picked more than one: the first goal is always also saved in
  `primary_goal`.

**Frontend looks broken:** rebuild and publish from the previous commit:
```bash
git checkout <previous-commit>        # the commit staging was on before this release
# re-run Step 6a and 6b
git checkout feat/enhanced-ui
```
**Old/new mismatches during the rollout:** both sides are deployed within minutes, but
between Step 5 and Step 6 users may run a mix.
- **Old frontend + new backend:** everything works. The old single-goal answer is still
  accepted and saved.
- **New frontend + old backend** (only during a backend rollback): two things fail.
  - Multi-select goals aren't saved.
  - "The one on the statement" in the wrong-PAN popup fails with a validation error.

  If you roll the backend back, roll the frontend back too.

**Never** run `terraform apply` or `terraform destroy` for this release. Nothing here needs
Terraform.

---

## After it's green

- Tell Aditi which Step 7 checks passed, especially check 5 (the Kavita replay and the old
  account's merge) and check 7 (mobile).
- For any failure, send the exact screen and an `aws logs tail /ecs/staging-backend` excerpt
  from around that time.
- Aditi then updates `session.md` / `CLAUDE.md` Session State to note the fixes are live on
  staging.

*Written 2026-09-30 after checking the working tree:*
- *`infra/`, `backend/app/config.py`, `backend/Dockerfile`, `backend/requirements.txt` and
  `frontend/package.json` are unchanged by this release.*
- *Local results: backend `1003 passed, 16 skipped` (no fixtures, no Postgres); frontend
  `630 passed` in 89 files; `tsc -b` clean.*
- *`npm run lint` reports one error, but in `MobileFundDetailSheet.tsx`, a file this release
  doesn't touch. It was there before and doesn't affect the build.*
- *Postgres: the 10 Step 0b tests and a full upgrade/downgrade/upgrade of `0019`/`0020` on seeded data passed against a real Postgres 16.2 on 2026-09-30 (go-live audit). Step 0b is a re-check on the manager's machine.*
