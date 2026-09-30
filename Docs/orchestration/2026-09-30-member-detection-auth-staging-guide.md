# CAS Member Detection + Auth Redesign — Staging Deploy Guide

**What ships:** two features, both on `feat/enhanced-ui`:
- **Auth flow redesign** (phone-first sequential signup, direct phone entry on the landing
  screen, device-ID fallback, final-review fixes). Last commit `af92286` and the ones
  before it. Adds migration `0017_otp_request_metadata` and one new Python dependency,
  `user-agents==2.2.0`.
- **CAS member detection** (plan `Docs/superpowers/plans/2026-09-29-cas-member-detection.md`):
  every holder in a CAS detected by PAN, people popup, per-person ribbon review, locked
  members with unlock/merge/delete. Adds migration `0018_cas_member_detection`.

**Same shape as `2026-09-23-ses-cutover-execution-guide.md`**, with three differences
worth knowing before you start:
1. **There are schema migrations this time (`0017`, `0018`)**, run through the SSM
   bastion tunnel the same way as `Docs/2026-09-19-cas-s3-postmark-secrets-infra.md` D2.
2. **No Terraform changes.** Neither feature touches `infra/` or backend config
   (`app/config.py` is unchanged since the SES cutover). The ECS task definition uses the
   `:latest` tag, so `terraform apply` would find nothing to change and **would not roll out
   the new image**. The rollout is `aws ecs update-service --force-new-deployment`.
   `terraform plan` is still run, as a drift check, and should say `No changes`.
3. **The frontend must be rebuilt and uploaded too** (both features are mostly frontend).
   Same commands as `2026-09-19-...` D7.

Everything below runs on **your manager's laptop** (Terraform, AWS CLI, Docker and AWS
credentials already set up there per `ses-terraform-deploy-runbook.md` Step 0/1).

**Order matters:** migrate → roll out the backend immediately after → publish the frontend.
Between the migration and the new backend being live (a few minutes), the *old* backend
can't create household members, because `0018`'s new constraints need fields it doesn't
set. Signups and "add member" fail in that window; everything else keeps working. That's
acceptable for staging, but don't pause between Steps 4 and 5.

---

## Step 0 — Pre-flight on the manager's laptop (no AWS changes)

### 0a. Confirm the code is committed, pushed and pulled

```bash
cd MVP_V1_MF_only
git checkout feat/enhanced-ui
git pull
git status --short          # expected: empty
git log --oneline -1 -- backend/alembic/versions/0018_cas_member_detection.py
grep -c "Backfill" backend/alembic/versions/0018_cas_member_detection.py   # expected: 1 or more
grep -c -e "background_tasks=BackgroundTasks()" -e "user_id, member_id, import_id" \
  backend/tests/functional_postgres/test_cascade_deletes.py                  # expected: 2
```
**Expected:** `git log` prints the commit that added 0018, and the first `grep` finds the
**backfill**. If it prints `0`, the 2026-09-30 backfill fix wasn't committed: **stop**.
Without it, `alembic upgrade` fails on staging (see Step 4).

The second `grep` checks for the Postgres test fix (commit `d2e9bc4`, see 0b). If it prints
`0`, this checkout is older than that commit: re-run `git pull`. Don't hand-edit the file,
because this step needs `git status` to stay empty.

### 0b. Run the Postgres-only tests once (they had never run anywhere before 2026-09-30)

The implementation was built on a machine without Docker, so the tests for 0018's
Postgres behaviour had never actually run: enum types, the never-relock trigger, and the
backfill against existing rows. This laptop has Docker, so it's a two-minute check that
catches a bad migration before it reaches staging's RDS.

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
**Expected:** 9 tests, each printed with `PASSED`, ending in `9 passed in Ns` (N is roughly
30–90). Verified on 2026-09-30 against a real Postgres 16.9 (runs of 33 s and 52 s).
- `test_member_detection_postgres.py`: **the two that matter for this release** are
  `test_0018_round_trip_and_never_relock_trigger_on_postgres` and
  `test_0018_backfills_preexisting_members_on_postgres`
- `test_partitioning.py`: 5 tests
- `test_cascade_deletes.py`: 2 tests

**Expected output** (a real run, paths adjusted to this laptop):
```
============================= test session starts ==============================
platform linux -- Python 3.14.x, pytest-9.0.x, pluggy-1.6.0 -- /mnt/d/Unifolio code/backend/.venv/bin/python
rootdir: /mnt/d/Unifolio code/backend
configfile: pytest.ini
plugins: anyio-4.x.x
collecting ... collected 9 items

tests/functional_postgres/test_cascade_deletes.py::test_hard_delete_expired_accounts_cascades_cleanly_on_postgres PASSED [ 11%]
tests/functional_postgres/test_cascade_deletes.py::test_delete_household_import_cascades_cleanly_on_postgres PASSED [ 22%]
tests/functional_postgres/test_member_detection_postgres.py::test_0018_round_trip_and_never_relock_trigger_on_postgres PASSED [ 33%]
tests/functional_postgres/test_member_detection_postgres.py::test_0018_backfills_preexisting_members_on_postgres PASSED [ 44%]
tests/functional_postgres/test_partitioning.py::test_transactions_and_nav_history_are_partitioned PASSED [ 55%]
tests/functional_postgres/test_partitioning.py::test_transaction_orm_insert_round_trips_on_partitioned_table PASSED [ 66%]
tests/functional_postgres/test_partitioning.py::test_enum_drift_values_are_writable_after_migration PASSED [ 77%]
tests/functional_postgres/test_partitioning.py::test_upsert_nav_history_is_conflict_safe_on_postgres PASSED [ 88%]
tests/functional_postgres/test_partitioning.py::test_household_members_one_self_row_per_user_on_postgres PASSED [100%]

============================== 9 passed in 52.45s ==============================
```
The header lines (Python/pytest/plugin versions, paths) and the timing can differ. What
must match: `collected 9 items`, all 9 test names, every one `PASSED`, and the final
`9 passed` line. A warnings summary between the test lines and the final line is fine.

**Any failure: stop and send me the full output.** Don't run the migration on staging.

**If the output is different:**
- **`9 skipped`:** the tests didn't run, so this isn't a pass. `TEST_DATABASE_URL=...` has
  to be on the same command line as `pytest`, exactly as written above.
- **`connection refused` / `could not connect`:** Postgres isn't healthy yet. Re-check
  `docker compose ps` and re-run.
- **One `F` in `test_cascade_deletes.py` with `ObjectDeletedError`, then no progress for
  minutes:** this checkout is older than commit `d2e9bc4`. The first run on 2026-09-30 hit
  exactly this: two stale tests (never run before) failed, and the failed test left a
  database connection open holding locks, so the next test's `alembic downgrade base`
  waited on it forever. Press Ctrl+C, run `git pull`, redo the 0a `grep` check, and repeat
  0b from `docker compose down`.
- **Stuck with no progress for more than 2 minutes on the current code:** don't wait for
  the 10-minute timeout. In a second terminal, run this and send me the output:
  ```bash
  docker compose exec postgres psql -U unifolio -d unifolio_test -c \
    "select pid, state, wait_event_type, left(query, 100) from pg_stat_activity where datname = 'unifolio_test';"
  ```

### 0c. Optional: full suites

```bash
(cd backend && .venv/bin/python -m pytest -q | tail -2)       # expected 963 passed, 10 skipped
(cd frontend && npm ci && npx tsc --noEmit && npx vitest run | tail -4)
```

---

## Step 1 — Verify AWS identity

```bash
aws sts get-caller-identity
```
**Expected:** `Account: "811364789032"`. If this errors, fix credentials first.

```bash
cd infra/envs/staging
terraform init
```
**Expected:** `Terraform has been successfully initialized!` (fast, no provider changes).

---

## Step 2 — Drift check: `terraform plan` should show no changes

Re-export the PAN keys **from Secrets Manager** (never generate new ones: a different
value silently breaks decryption of every stored PAN), plus the same delivery-mode vars
as the SES cutover:

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
- **If it shows changes:** someone changed staging by hand, or a Terraform change landed
  that this guide doesn't know about. **Stop, don't apply**, and send me the plan output.
  Nothing in this release needs a Terraform change.
- **If it prompts for a variable:** a `TF_VAR_*` above is missing. Re-run the exports in
  this same terminal.

Save the outputs this guide needs later (same terminal):
```bash
REPO_ROOT=$(git rev-parse --show-toplevel)
BASTION_ID=$(terraform output -json networking | python3 -c "import json,sys; print(json.load(sys.stdin)['bastion_instance_id'])")
DB_HOST=$(terraform output -raw db_address)
DB_NAME=$(terraform output -raw db_name)
echo "$BASTION_ID $DB_HOST $DB_NAME"
```
**Expected:** a bastion id (`i-0b67d40d9b58b7814` last time), the `staging-rds....`
hostname, and `unifolio`.

---

## Step 3 — Build and push the backend image

```bash
cd "$REPO_ROOT/backend"
docker build -t unifolio-staging-backend .
```
**Expected:** build completes. On `failed to xattr .pytest_tmp: permission denied`:
`sudo rm -rf .pytest_tmp` and retry.

```bash
aws ecr get-login-password --region ap-south-1 | \
  docker login --username AWS --password-stdin \
  811364789032.dkr.ecr.ap-south-1.amazonaws.com

docker tag unifolio-staging-backend:latest \
  811364789032.dkr.ecr.ap-south-1.amazonaws.com/unifolio-staging-backend:latest
docker push 811364789032.dkr.ecr.ap-south-1.amazonaws.com/unifolio-staging-backend:latest
```
**Expected:** `Login Succeeded`, then a push ending in `latest: digest: sha256:...`.

Pushing a new `:latest` does **not** change what's running yet. The ECS service keeps the
old image until Step 5 forces a new deployment. Note the **current** task-definition
revision now, for rollback:
```bash
aws ecs describe-services --cluster unifolio-staging --services unifolio-staging-backend \
  --query "services[0].taskDefinition" --output text
```
Write down the number at the end (e.g. `...:unifolio-staging-backend:7` → `7`).

---

## Step 4 — Run migrations `0017` + `0018` on staging RDS

**Terminal A**, open the tunnel. It uses local port **5434**, not 5433, so it can't
collide with the `docker compose` Postgres from Step 0b:
```bash
aws ssm start-session \
  --target "$BASTION_ID" \
  --document-name AWS-StartPortForwardingSessionToRemoteHost \
  --parameters "{\"host\":[\"$DB_HOST\"],\"portNumber\":[\"5432\"],\"localPortNumber\":[\"5434\"]}"
```
(If `$BASTION_ID`/`$DB_HOST` aren't set in this terminal, paste the values from Step 2.)
**Expected:** `Waiting for connections...`. Leave it open.

**Terminal B**, fetch the master password. Keep it in an env var, never a literal: the real
password contains `$` characters that bash mangles inside a double-quoted literal.
```bash
export PGPASSWORD=$(aws secretsmanager get-secret-value \
  --secret-id "$(aws secretsmanager list-secrets --query "SecretList[?starts_with(Name, 'rds!db-')].Name" --output text)" \
  --query SecretString --output text | python3 -c "import json,sys; print(json.load(sys.stdin)['password'])")

cd MVP_V1_MF_only/backend
export DATABASE_URL="postgresql://unifolio:${PGPASSWORD}@localhost:5434/unifolio"
.venv/bin/alembic current
```
**Expected:** `0016 ...` (or `0017` if the auth migration was already applied separately).
- **Anything older than 0016:** stop. Staging missed an earlier deploy's migrations, and
  that needs looking at first.
- **Already `0018 (head)`:** skip to Step 5.

```bash
.venv/bin/alembic upgrade head
.venv/bin/alembic current      # expected: 0018 (head)
```
**Expected:** `Running upgrade 0016 -> 0017` (if pending) and `Running upgrade 0017 -> 0018`,
then `0018 (head)`.

**What 0018 does to existing data:**
- Every existing household member is backfilled as **complete (unlocked)**, with
  `details_completed_at` set from its `created_at`.
- Self members get `origin = onboarding`; everyone else gets `manual`.
- Members holding a permanent PAN get `pan_source = cas`, verified.
- Nobody existing becomes locked. New tables, a trigger and one index are added.

**If `upgrade` fails:**
- Postgres runs each migration in a transaction, so a failed 0018 leaves the database at
  0017 with nothing half-applied.
- Copy the full error, don't retry, and send it to me.
- The old backend is still running and still compatible at 0017, so staging keeps working.

Quick sanity query (optional, any Postgres client on `localhost:5434`):
```sql
SELECT count(*) FILTER (WHERE details_completed_at IS NULL) AS locked,
       count(*) AS total
FROM household_members;          -- expected: locked = 0
```

Close the tunnel in Terminal A (Ctrl-C) once done. **Go straight to Step 5.**

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
curl -s https://staging-api.unifolio.in/health
```
**Expected:** `rollout` reaches `COMPLETED`, `running == desired`, `/health` healthy, and
no crash loop or import errors in the logs (e.g. a missing `user_agents` module would show
up here).

The scheduled job task definitions share the same `:latest` image, so their next
EventBridge run picks up the new code automatically. No action needed.

---

## Step 6 — Build and publish the frontend

```bash
cd "$REPO_ROOT/frontend"
npm ci
VITE_API_BASE_URL=https://staging-api.unifolio.in npm run build
aws s3 sync dist/ "s3://$(terraform -chdir="$REPO_ROOT/infra/envs/staging" output -raw s3_bucket_name)/" --delete
aws cloudfront create-invalidation \
  --distribution-id "$(terraform -chdir="$REPO_ROOT/infra/envs/staging" output -raw cloudfront_distribution_id)" \
  --paths "/*"
```
**Expected:** build succeeds, the sync lists uploads/deletes, and the invalidation returns an
`Id` with `Status: InProgress`. It takes a few minutes, so hard-refresh before testing.
No `VITE_GOOGLE_OAUTH_CLIENT_ID` (deliberately unset for staging, unchanged).

---

## Step 7 — Verify on https://staging.unifolio.in

**Auth (redesign):**
1. Sign up phone-first on a fresh number. The OTP is dev-echoed in stub mode.
2. Enter a phone number directly on the landing screen.
3. Email OTP login on an existing account (SES, as since the cutover).
4. An existing account still logs in normally.

**Existing data after the migration:**
5. Log into an account that had family members before today. Every member is
   selectable, none shows a lock icon, and the dashboards load (no 403s).

**CAS member detection:**
6. Fresh account → onboarding asks for **"Full name as per PAN"** and has **no "Just me /
   Family too" step**; privacy page → straight to upload.
7. Upload a **multi-person family CAS**:
   - a "people found" popup appears, Me first;
   - PANs are masked as first two + last two characters (`BX******8L`);
   - after Continue there is one ribbon per person, and **Confirm imports** enables only
     once every ribbon is reviewed.
8. After confirm, the detected people appear **locked** in the member dropdown. Pick one,
   enter relationship + PAN, and they unlock and their dashboard opens.
9. Upload a **single-person CAS**: it goes straight to review (no people popup).
10. Profile → Import History:
    - the family statement is grouped as one entry;
    - "Delete" offers "only X's funds" vs "everyone in this statement";
    - "Delete all funds" on a member works.
11. **Real statements:** do steps 7–9 with **one real CAMS and one real KFintech**
    statement. Holder-name reading has only been tested on synthetic lines. On KFintech,
    a person with an unreadable name should show as "Person 2" with an editable name,
    **never** a neighbour's name.
12. **Mobile:** repeat 7–8 on a phone. The ribbon review reuses the desktop layout and
    hasn't had visual QA yet.
13. S3: `aws s3 ls s3://<cas-files-bucket>/<user_id>/`. A family upload creates **one**
    `<upload_group_id>.pdf`, not one file per person.

---

## If something goes wrong

**Backend crash-loops or behaves badly after Step 5.** Re-point the service at the revision
you noted in Step 3:
```bash
aws ecs update-service --cluster unifolio-staging --service unifolio-staging-backend \
  --task-definition unifolio-staging-backend:<previous-revision-number>
```
**Caveat:** the previous image expects the 0016/0017 schema. At 0018 it runs, but can't
create household members, because of the new constraints. Signups and add-member stay
broken until you either fix forward or downgrade the schema (below).

**Downgrading the schema** (only together with the rollback above):
```bash
# tunnel + PGPASSWORD + DATABASE_URL as in Step 4, then:
.venv/bin/alembic downgrade 0017
```
- This works only while **no locked (detected) member exists yet**. Downgrade makes
  `relationship` required again, and a detected member has none.
- If someone already confirmed a family CAS, the downgrade fails harmlessly: it runs in a
  transaction, so nothing is changed. **Fix forward instead**, and send me the error and
  logs.

**Frontend looks broken:** re-run Step 6 from the previous commit (`git checkout af92286`
for the auth-only build), then `git checkout feat/enhanced-ui` again.

**Never** run a bare `terraform destroy`. Nothing here needs Terraform at all.

---

## After it's green

- `session.md` / `CLAUDE.md` Session State: note both features are live on staging, and
  which of Step 7's checks 11–12 passed.
- Report back any Step 7 failure with the exact screen and the `aws logs tail` excerpt.

*Written 2026-09-30 after checking the repo:*
- *`infra/` and `app/config.py` have not changed since the SES cutover;*
- *the task definition uses `image_tag = "latest"`;*
- *the only new Python dependency is `user-agents`.*

*The 0018 backfill was added the same day with a SQLite test (passing) and a Postgres
test (Step 0b is its first real run).*
