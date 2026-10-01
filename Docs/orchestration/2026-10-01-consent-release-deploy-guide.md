# Consent / Onboarding / Profile + Member Profile Completion — Staging Deploy Guide

**Two releases in one deploy:**
- **A. Consent / onboarding / profile** (migrations `0021`, `0022`).
- **B. Member profile completion** (migration `0023`): the detected-member lock and its
  unlock popup are gone, and a "% complete" nudge opens one Complete-profile popup.

Same shape as `2026-09-30-staging-qa-fixes-deploy-guide.md` (same tunnel, same image and
frontend commands). Where a step is identical, this guide repeats the command so you don't
have to flip between files.

**This deploy needs no new secret and no `terraform apply`: infra is unchanged.**

**The order matters, and it is different from earlier deploys.** `0023` *removes* columns
the currently running backend reads (`details_completed_at`, `lock_reason`). The old
backend therefore breaks the moment `0023` runs, and the new backend breaks on a database
without it. So:
1. Run `0021` + `0022` while the old backend is still serving. They only add, so this is safe.
2. Build the new image (don't push yet).
3. **Maintenance window, about 10 minutes:** stop the backend, run `0023`, push the image,
   then start the backend.
4. Publish the frontend straight away.

**When to deploy:** between **09:00 and 18:30 IST**.
- Staging's RDS and backend are stopped every night from 21:00 to 05:00 IST.
- Scheduled jobs start their own tasks from `:latest` at 06:00, 06:30, 08:00 and 19:00 IST,
  so keep clear of those times.

Everything runs on **your manager's laptop** (AWS CLI, Docker, AWS credentials).

---

## Step 0 — What's in this release, and commit it first

**What ships** (details: `session.md` "Latest", plan
`Docs/orchestration/2026-10-01-onboarding-consent-profile-changes-plan.md`):

1. The onboarding privacy screen is gone. The name is saved at the name step.
2. A new goal shortcut, "Why choose? All of it." (picks all four goals).
3. Name and PAN now come from the statement. Unlocking a member only asks for the
   relationship (PAN only if the statement had none). Profile can edit relationship, phone
   and email of a member.
4. Consent: a tick-box at sign-up, a PAN disclaimer on every upload / CAMS request, a
   one-time "We've updated our Terms" prompt for existing users. Every consent is stored in a
   new append-only table.
5. The OTP email has no logo. Profile has five sections.

**Release B, member profile completion** (spec `Docs/orchestration/member-profile-completion-map.html`,
plan `Docs/superpowers/plans/2026-10-01-member-profile-completion.md`):

6. **No more locked members.** Every family member's dashboard opens straight away. There is
   no unlock popup and no "Add details first".
   - A detected member's name and PAN are saved at **Confirm imports**, encrypted exactly like
     the account holder's PAN.
   - A PAN that is already on another Unifolio account is kept, still encrypted, and the member
     shows a **red banner**.
7. **A "% complete" nudge** on each member opens one **Complete profile** popup: name
   (editable), PAN (typed only if the member has none), relationship, phone and email.
   - Exit asks "Skip completing…?".
   - At 100% the popup shows a success state.
   - The same popup opens from Profile → Family members.
8. The API route `PUT /household-members/{id}/profile` replaces `POST …/details` and
   `PATCH /household-members/{id}`. Those two old routes are removed. This supersedes item 3's
   "unlock only asks for the relationship".

**Database:** three new migrations.
- `0021`: member phone/email columns. Only adds.
- `0022`: the consent table and its triggers. Only adds.
- `0023`: drops the member lock: `details_completed_at`, `lock_reason`, their checks and
  the never-relock trigger. It adds `pan_conflict`, and moves each detected PAN into the
  real PAN columns (or marks it `pan_conflict='other_account'`). **It is not compatible
  with the old backend**, hence the maintenance window in Step 3.

**You commit manually, so do this first (Aditi, on your machine):**
```bash
git status --short
```
Everything under `backend/`, `frontend/`, `infra/` and the new `Docs/` files for this release
must be committed, **including untracked files** (lines starting `??`). In particular:
`backend/alembic/versions/0021_member_contact_fields.py`,
`backend/alembic/versions/0022_consent_records.py`, `backend/app/services/legal/` (the
`documents/*.md` texts too), `backend/scripts/consent_trail.py`,
`backend/tests/functional_postgres/test_consent_trigger_postgres.py`.

For release B, also (all currently untracked, `??`):
- `backend/app/services/dashboard/member_profile.py`
- `backend/tests/api/test_member_profile_routes.py`
- `backend/tests/services/dashboard/test_member_profile.py`
- `frontend/src/features/dashboard/members/CompleteProfileDialog.tsx`
- `frontend/src/features/dashboard/members/PanConflictBanner.tsx`
- `frontend/src/features/dashboard/members/ProfileCompleteSuccess.tsx`
- `frontend/src/features/dashboard/members/ProfileNudge.tsx`
- `frontend/src/features/dashboard/members/profileForm.ts`
- `frontend/src/features/dashboard/members/profileNudge.test.tsx`
- `frontend/src/mobile/features/members/memberLabel.ts`
- this guide itself

Also commit the **deletions** (`git add -A` picks them up):
- `member_update.py`
- `MemberDetailsDialog.tsx`, `EditMemberDialog.tsx`, `memberDetailsForm.tsx`
- `AddDetailsFirstDialog.tsx`, `LockedMember.tsx`
- `test_member_details*.py`

Without the new frontend files, Step 4's build fails.

Then:
```bash
git push
```
Tell your manager the last commit hash.

---

## Step 1 — Pre-flight: Postgres-only tests

These tests cover the consent triggers, migrations 0019-0023 and cascade deletes.
- They passed (11/11) on 2026-10-01 against a throwaway local Postgres 16.2 on the build
  machine.
- `0023` was also run there 0022 → 0023 → 0022 → 0023 on seeded data, all OK.

Re-run them here anyway, as a check of the exact commit you're deploying. They must pass
before anything touches staging.

**1a. Start Docker Desktop on Windows** and wait until it says "Engine running". If you use
WSL, make sure Docker Desktop's WSL integration is on (Settings -> Resources -> WSL
integration).

**1b. Start the test Postgres and run the tests** (from the repo root):
```bash
cd MVP_V1_MF_only
git checkout feat/enhanced-ui
git pull
git status --short          # expected: empty

docker compose down                  # fresh database
docker compose up -d postgres        # test Postgres on localhost:5433
docker compose ps                    # wait until the postgres line says "healthy" (~10 s)
cd backend
python3 -m venv .venv 2>/dev/null; .venv/bin/pip install -q -r requirements.txt
TEST_DATABASE_URL=postgresql+psycopg2://unifolio:unifolio@localhost:5433/unifolio_test \
  timeout 600 .venv/bin/python -m pytest -v --tb=short -m postgres tests/functional_postgres
cd ..
docker compose stop postgres
```
**Good looks like:** `collected 11 items`, every line `PASSED`, final line `11 passed in Ns`
(N roughly 30-120). Warnings before the last line are fine.

(11 = 2 cascade-delete + 1 consent-trigger + 3 member-detection + 5 partitioning tests. The
member-detection round-trip test now also checks that `0023` dropped the lock enum and
trigger.)

**If it isn't good:**
- **Any `FAILED`:** stop. Send Aditi the full output. Don't continue.
- **`11 skipped`:** the tests didn't run, so this isn't a pass. `TEST_DATABASE_URL=...` has to
  be on the same command line as `pytest`.
- **`collected 10 items`:** your checkout is missing the consent-trigger test. Re-run
  `git pull`.
- **`connection refused`:** Postgres isn't healthy yet. Re-check `docker compose ps`.
- **Stuck for more than 2 minutes:** Ctrl+C, then send the output of
  `docker compose logs postgres | tail -30`.

*Optional:* the full suites (`backend` pytest, `frontend` `npx tsc -b` and `npx vitest run
--maxWorkers=2`) as in the 09-30 guide Step 0c. Counts will differ from that guide; any
`failed` still means stop.

---

## Step 2 — Run migrations `0021` + `0022` on staging RDS (old backend keeps serving)

**Stop at `0022`. Don't run `alembic upgrade head` in this step:** `head` is now `0023`,
which must wait for Step 3's maintenance window.

First get the connection values (read-only; `terraform init` and `terraform output` change nothing):
```bash
aws sts get-caller-identity
cd infra/envs/staging
terraform init
REPO_ROOT=$(git rev-parse --show-toplevel)
BASTION_ID=$(terraform output -json networking | python3 -c "import json,sys; print(json.load(sys.stdin)['bastion_instance_id'])")
DB_HOST=$(terraform output -raw db_address)
DB_NAME=$(terraform output -raw db_name)
echo "$BASTION_ID $DB_HOST $DB_NAME"
```
**Good looks like:** `"Account": "811364789032"`, then a bastion id (`i-...`), the
`staging-rds....` hostname, and `unifolio`. If the first command errors, fix credentials first.

Migrations are manual (the Dockerfile doesn't copy `alembic/`).
- **Run `0021` + `0022` now, before building the image.** Both only add (nullable columns
  plus a new table), so the old backend that's running right now keeps working on the
  migrated database.
- The new backend needs all three, `0021`-`0023`.

**Terminal A**: open the tunnel on local port **5434** (not 5433, so it can't clash with
Step 1's Postgres):
```bash
aws ssm start-session \
  --target "$BASTION_ID" \
  --document-name AWS-StartPortForwardingSessionToRemoteHost \
  --parameters "{\"host\":[\"$DB_HOST\"],\"portNumber\":[\"5432\"],\"localPortNumber\":[\"5434\"]}"
```
**Good looks like:** `Starting session ...`, `Port 5434 opened ...`, `Waiting for
connections...`. Leave it open. (If `$BASTION_ID`/`$DB_HOST` aren't set in this terminal,
re-run the values block at the top of this step.)

**Terminal B**: password into an env var, never typed out (it contains `$` characters):
```bash
export PGPASSWORD=$(aws secretsmanager get-secret-value \
  --secret-id "$(aws secretsmanager list-secrets --query "SecretList[?starts_with(Name, 'rds!db-')].Name" --output text)" \
  --query SecretString --output text | python3 -c "import json,sys; print(json.load(sys.stdin)['password'])")

cd MVP_V1_MF_only/backend        # the same checkout as Step 1 (use its full path if needed)
# URL-encode the password: a # ? or % in it would otherwise break the connection string.
export DATABASE_URL="postgresql://unifolio:$(python3 -c "import os,urllib.parse; print(urllib.parse.quote_plus(os.environ['PGPASSWORD']))")@localhost:5434/unifolio"
.venv/bin/alembic current
```
**Good looks like:** `0020 (head)` (staging was migrated to 0020 in the last deploy). The
`INFO ... Context impl PostgresqlImpl.` line before it is normal.
- **`0021` or `0022` already:** part of this step was done before. If `0022`, skip to the
  sanity check.
- **`0023` already:** stop and ask Aditi. It must not have run before the new backend is
  ready.
- **Anything older than `0020`:** stop. The previous deploy's migrations are missing. Send
  the output.

Migrate **to `0022` only** (not `head`):
```bash
.venv/bin/alembic upgrade 0022
.venv/bin/alembic current
```
**Good looks like:**
```
INFO  [alembic.runtime.migration] Running upgrade 0020 -> 0021, ...
INFO  [alembic.runtime.migration] Running upgrade 0021 -> 0022, ...
```
then `0022`. It won't say `(head)`, because `0023` is still to come. That's expected.

**What this does:**
- `0021`: adds nullable `phone_number` and `email` to `household_members`.
- `0022`: adds a nullable `consent_snapshot` column to `pending_identity_verifications`,
  creates the `consent_records` table (with its enum types and indexes), and adds triggers
  that make that table append-only (no edits, no deletes).

**Sanity check:**
```bash
.venv/bin/python - <<'EOF'
import os, sqlalchemy as sa
with sa.create_engine(os.environ["DATABASE_URL"]).connect() as c:
    print("consent_records rows:", c.execute(sa.text("SELECT count(*) FROM consent_records")).scalar())
    print("triggers on consent_records:", c.execute(sa.text(
        "SELECT count(*) FROM pg_trigger WHERE tgrelid = 'consent_records'::regclass AND NOT tgisinternal")).scalar())
    print("member contact columns:", c.execute(sa.text(
        "SELECT count(*) FROM information_schema.columns WHERE table_name='household_members' AND column_name IN ('phone_number','email')")).scalar())
EOF
```
**Good looks like:** `consent_records rows: 0`, `triggers on consent_records:` a number of
**1 or more** (check before running: the exact trigger count isn't confirmed; any number
above 0 is fine), `member contact columns: 2`.

**If `upgrade` fails:** each migration runs in its own transaction, so a failure leaves the
database at the last version that worked, nothing half-applied. Copy the full error, don't
retry, and send it. The old backend is still running and is fine at `0020`, `0021` or
`0022`.

**Keep the tunnel (Terminal A) and Terminal B open.** Step 3 runs `0023` through them.
If you do close them, re-open them exactly as above before Step 3c.

---

## Step 3 — Build the image, then the maintenance window: `0023` + new backend

### 3a. Build the image (nothing changes on AWS yet)

In a third terminal, Terminal C:
```bash
cd "$REPO_ROOT/backend"     # or the full path to MVP_V1_MF_only/backend
docker build -t unifolio-staging-backend .
```
**Good looks like:** the build completes (`naming to docker.io/library/unifolio-staging-backend`).
If it fails with `failed to xattr .pytest_tmp: permission denied`, run
`sudo rm -rf .pytest_tmp` and retry.

**Save the currently running image first. This is your rollback point.**
```bash
MANIFEST=$(aws ecr batch-get-image --repository-name unifolio-staging-backend --region ap-south-1 \
  --image-ids imageTag=latest --query 'images[0].imageManifest' --output text)
aws ecr put-image --repository-name unifolio-staging-backend --region ap-south-1 \
  --image-tag pre-consent-release --image-manifest "$MANIFEST" --query 'image.imageId' --output json
```
**Good looks like:** JSON with `"imageTag": "pre-consent-release"`. `ImageAlreadyExistsException`
is fine (the tag already points at this image). Any other error: stop, there'd be no clean
rollback.

Log in to ECR now, so the push in 3d is quick:
```bash
aws ecr get-login-password --region ap-south-1 | \
  docker login --username AWS --password-stdin \
  811364789032.dkr.ecr.ap-south-1.amazonaws.com
docker tag unifolio-staging-backend:latest \
  811364789032.dkr.ecr.ap-south-1.amazonaws.com/unifolio-staging-backend:latest
```
**Good looks like:** `Login Succeeded`. **Don't push yet.** Pushing `:latest` before `0023`
runs would let any task that starts (a restart, a scheduled job) run the new code on the
old schema.

### 3b. Start the maintenance window: stop the backend

> **Staging is down from here until 3e finishes (about 10 minutes).** Anyone in the middle
> of reviewing a CAS import must upload it again.

```bash
aws ecs update-service --cluster unifolio-staging --service unifolio-staging-backend \
  --desired-count 0 --query "service.desiredCount" --output text
```
**Good looks like:** `0`. Wait until no task is running:
```bash
watch -n 5 'aws ecs describe-services --cluster unifolio-staging --services unifolio-staging-backend \
  --query "services[0].{running:runningCount,desired:desiredCount}"'
```
**Good looks like:** `running` reaches `0` (usually under a minute). Then Ctrl+C.

### 3c. Run `0023` (Terminal B, tunnel still open in Terminal A)

First record the numbers before the migration:
```bash
.venv/bin/python - <<'EOF'
import os, sqlalchemy as sa
with sa.create_engine(os.environ["DATABASE_URL"]).connect() as c:
    print("members by lock state:", c.execute(sa.text(
        "SELECT lock_reason::text, count(*) FROM household_members GROUP BY 1 ORDER BY 1")).all())
    print("members total:", c.execute(sa.text("SELECT count(*) FROM household_members")).scalar())
EOF
```
**Good looks like:** e.g. `members by lock state: [('details_needed', 3), ('pan_on_other_account', 1), (None, 12)]`
and `members total: 16`. `None` means unlocked. Write both lines down.

Migrate:
```bash
.venv/bin/alembic upgrade head
.venv/bin/alembic current
```
**Good looks like:**
```
INFO  [alembic.runtime.migration] Running upgrade 0022 -> 0023, Member profile completion: drop the detected-member lock
```
then `0023 (head)`.

**What this does to existing data:**
- Every locked member with a statement PAN gets that PAN moved into the real, unique PAN
  columns. The PAN stays encrypted: this is a column copy, nothing is decrypted.
- If another account already holds that PAN, the member is marked
  `pan_conflict='other_account'` instead. Their dashboard shows the red banner.
- If two of one user's members share a PAN (old duplicates), only the earliest is promoted.
  The other is left for a merge.
- The lock columns and the never-relock trigger are removed.

**If `upgrade` fails:**
- `0023` runs in one transaction, so the database stays at `0022`.
- Copy the full error and don't retry.
- **Bring the old backend back:** `aws ecs update-service --cluster unifolio-staging
  --service unifolio-staging-backend --desired-count 1 --query "service.desiredCount"
  --output text`. Don't push the image.
- Staging is then back exactly as before this step. Send Aditi the error.

**Sanity check after `0023`:**
```bash
.venv/bin/python - <<'EOF'
import os, sqlalchemy as sa
with sa.create_engine(os.environ["DATABASE_URL"]).connect() as c:
    print("members total:", c.execute(sa.text("SELECT count(*) FROM household_members")).scalar())
    print("pan conflicts:", c.execute(sa.text(
        "SELECT count(*) FROM household_members WHERE pan_conflict IS NOT NULL")).scalar())
    print("unpromoted leftovers (duplicates to merge):", c.execute(sa.text(
        "SELECT count(*) FROM household_members WHERE detected_pan_hash IS NOT NULL AND pan_conflict IS NULL")).scalar())
    print("lock columns left:", c.execute(sa.text(
        "SELECT count(*) FROM information_schema.columns WHERE table_name='household_members'"
        " AND column_name IN ('lock_reason','details_completed_at')")).scalar())
    print("never-relock trigger left:", c.execute(sa.text(
        "SELECT count(*) FROM pg_trigger WHERE tgname='trg_member_never_relock'")).scalar())
EOF
```
**Good looks like:**
- `members total:` the same number as before. No member is deleted.
- `pan conflicts:` at least the `pan_on_other_account` count from before. It can be a
  little higher, because locked rows whose PAN another user holds are flagged too.
- `unpromoted leftovers:` usually `0`. A number here means old duplicate members of one
  user. They're harmless and can be merged later.
- `lock columns left: 0` and `never-relock trigger left: 0`.

If `members total` changed, or `lock columns left` isn't `0`, stop. Bring the backend back
with the **rollback** below (it includes downgrading `0023`) and send the output.

Close the tunnel in Terminal A (Ctrl+C).

### 3d. Push the new image (Terminal C)

```bash
docker push 811364789032.dkr.ecr.ap-south-1.amazonaws.com/unifolio-staging-backend:latest
```
**Good looks like:** a push ending in `latest: digest: sha256:...`. If it says the
authorization token expired, re-run the `aws ecr get-login-password ... docker login` line
from 3a and push again.

### 3e. Start the new backend: the window ends when it's healthy

```bash
aws ecs update-service --cluster unifolio-staging --service unifolio-staging-backend \
  --desired-count 1 --force-new-deployment --query "service.deployments[0].status" --output text
```
**Good looks like:** `PRIMARY`.

Watch it:
```bash
watch -n 5 'aws ecs describe-services --cluster unifolio-staging --services unifolio-staging-backend \
  --query "services[0].{running:runningCount,desired:desiredCount,rollout:deployments[0].rolloutState}"'
```
```bash
aws logs tail /ecs/staging-backend --follow
```
**Good looks like:** `rollout` goes `IN_PROGRESS` then `COMPLETED` (3-6 minutes), `running`
equals `desired`, and the logs show `Uvicorn running on ...` / `Application startup
complete.` with no tracebacks.

**If the task keeps stopping and restarting:** open the logs. A traceback about a missing
column or table (`phone_number`, `consent_snapshot`, `consent_records`, `pan_conflict`) means
the database isn't at `0023 (head)`: re-check Step 2 and Step 3c. Fix that, or use the
rollback in "If something goes wrong".

```bash
curl -s https://staging-api.unifolio.in/health
```
**Good looks like:** `{"status":"ok"}`.

Quick check that the new code is live (read-only):
```bash
curl -s https://staging-api.unifolio.in/legal/documents
```
**Good looks like:** JSON listing the legal documents and versions. This route is public on
purpose: the sign-up screen reads it before any account exists. A `404` means the old
backend is still serving: wait for `COMPLETED` and retry.

Check the new profile route exists (read-only: no token is sent, so nothing is saved):
```bash
curl -s -o /dev/null -w "%{http_code}\n" -X PUT \
  https://staging-api.unifolio.in/household-members/00000000-0000-0000-0000-000000000000/profile
```
**Good looks like:** `401` or `403`, meaning the route exists and needs a login. A `404` or
`405` means the old backend is still serving.

---

## Step 4 — Build and publish the frontend (right after Step 3)

Do this immediately. Between Step 3 and Step 4, an **old** (cached) frontend breaks in two ways:
- It gets `422` errors on sign-up, uploading a statement, requesting a CAMS statement and
  reactivating an account.
- Its "unlock member" and "edit member" popups fail with `404`/`405`, because those routes
  are gone.

Log-in, dashboard and analytics are unaffected.

Two blocks. **Only start 4b after 4a prints `BUILD OK`.**

**4a. Build (nothing leaves the laptop yet):**
```bash
cd "$REPO_ROOT/frontend" && \
  rm -rf dist && \
  npm ci && \
  VITE_API_BASE_URL=https://staging-api.unifolio.in npm run build && \
  test -f dist/index.html && echo "BUILD OK"
```
**Good looks like:** the last line is `BUILD OK`. The "N vulnerabilities" notice and Vite's timing
lines don't matter. No `BUILD OK`, or any `error TS...`: stop, don't run 4b, send the output.

**4b. Publish:**
```bash
aws s3 sync dist/ "s3://$(terraform -chdir="$REPO_ROOT/infra/envs/staging" output -raw s3_bucket_name)/" --delete && \
aws cloudfront create-invalidation \
  --distribution-id "$(terraform -chdir="$REPO_ROOT/infra/envs/staging" output -raw cloudfront_distribution_id)" \
  --paths "/*"
```
**Good looks like:** `upload: dist/...` lines (and `delete: s3://...` for old asset files), then
JSON with an `"Id"` and `"Status": "InProgress"`.

The invalidation takes a few minutes. **Tell every tester to hard-refresh (Ctrl+Shift+R) or
close and reopen their tabs.** A tab left open keeps the old JavaScript and will hit the 422
errors above.

---

## Step 5 — What existing users will see

- **A one-time "We've updated our Terms" prompt** the first time they open the app after
  onboarding. They must tick to agree, then it never comes back. This is expected: there are
  no consent records yet for existing accounts. The legal texts are **placeholders** until the
  lawyer's versions replace them.
- **Anyone in the middle of signing up during the deploy** (code entered or not, but not yet
  done) must **start sign-up again once**. Their half-finished sign-up was created by the old
  backend, without a consent record.
- Users with a deletion pending are not shown the prompt: they see the "pending deletion"
  screen, and reactivating records their consent.
- **Locked family members are unlocked.** Every member's dashboard opens. A detected member
  shows a "% complete" chip instead of a lock. A member whose PAN is on another account shows
  a red banner.

---

## Step 6 — Post-deploy smoke checklist on https://staging.unifolio.in

Use an incognito window for the fresh-account checks, after a hard refresh.

1. **Sign-up with the consent box.** On Sign Up, the box for Terms and Privacy is present and
   Continue stays blocked until it's ticked. Sign up with a brand-new phone, then email.
2. **Onboarding has no privacy screen.** After the email step you go straight to the questions.
   The name question is first.
3. **"Why choose? All of it."** appears on the goal step. Tapping it selects all four goals.
4. **The upload screen shows the PAN disclaimer** (a box to tick). Upload is blocked until it's
   ticked. A CAS upload with it ticked works.
5. **Profile has five sections.** Open Profile and check all five show and open.
6. **The OTP email has no logo** (green text only). Request an email code and check the
   message.
7. **An existing user sees re-consent once.** Log in as an existing account: the "We've
   updated our Terms" prompt appears, agree, reload: it doesn't come back.
8. **No locked members (release B).** Upload a family CAS and confirm it. Then:
   - Every detected member's dashboard opens straight away from the member picker, with no
     unlock popup and no lock icon.
   - Members that were locked before the deploy open straight away too.
9. **The % nudge and Complete profile popup.** On a detected member's dashboard:
   - A "N% complete" chip shows. Click it: the "Complete {name}’s profile" popup opens.
   - The name is editable. The PAN is greyed (from the statement).
   - Relationship, phone and email are optional.
   - Change only the relationship and **Save**: the % goes up and the popup stays open
     showing its result.
   - Fill the rest to reach 100%: a success state shows.
   - Open it again and press **Exit**: it asks "Skip completing …?".
10. **Self's popup:** phone and email are read-only. On desktop, "Change in Account Info"
    takes you to Profile → Account Info. On mobile, no such link shows.
11. **Profile → Family members:** each card shows its %, and Complete profile / Edit profile
    opens the same popup.
12. **PAN on another account (needs two test accounts):** upload the same CAS on a second
    account. The family member whose PAN the first account already holds opens with a red
    "PAN is on another Unifolio account" banner. Saving their popup shows a second warning.
13. **Rename sticks:** rename a member in the popup and Save. The holdings tables show the
    new name after the page refreshes, not the old one.
14. **Mobile:** repeat checks 8, 9 and 12 at phone width. Phone-width visual QA hasn't been
    done for this release.
15. **Old tester tabs:** if anything shows a "422" / "Tick the box" error on a normal action, it
   is an old cached frontend: hard-refresh.

**Pulling a consent trail** (for one user: what they agreed to, when, which version). Set up
the tunnel, `PGPASSWORD` and `DATABASE_URL` exactly as in Step 2, then, from `backend/`:
```bash
.venv/bin/python -m scripts.consent_trail --phone +91XXXXXXXXXX
```
**Good looks like:** a list of that user's consent rows (document, version, given/withdrawn,
time). Needs `--phone` with the number in `+91...` form, only while the account exists; for a
deleted account use `--user <user-uuid>` instead.
(check before running: the 09-30 guide has no example of running a script, so this uses the
same environment as `alembic` in Step 2. I confirmed the `--phone` / `--user` options in
`backend/scripts/consent_trail.py`, not that it prints cleanly against staging.)

After a few sign-ups, run it for a test account you made in check 1: it should show the
Terms and Privacy being given at sign-up.

---

## If something goes wrong

**Backend crash-loops or misbehaves after Step 3.** The old backend can't run on `0023`, so a
backend rollback has **three parts**: stop the backend, downgrade `0023` → `0022`, then put
the old image back.

1. Stop the backend:
```bash
aws ecs update-service --cluster unifolio-staging --service unifolio-staging-backend \
  --desired-count 0 --query "service.desiredCount" --output text
```
2. Open the tunnel, `PGPASSWORD` and `DATABASE_URL` exactly as in Step 2, then from `backend/`:
```bash
.venv/bin/alembic downgrade 0022
.venv/bin/alembic current
```
**Good looks like:** `Running downgrade 0023 -> 0022`, then `0022`. Downgrade to `0022`
only, **never lower** (see below).
3. Put the saved image back and start it:
```bash
MANIFEST=$(aws ecr batch-get-image --repository-name unifolio-staging-backend --region ap-south-1 \
  --image-ids imageTag=pre-consent-release --query 'images[0].imageManifest' --output text)
aws ecr put-image --repository-name unifolio-staging-backend --region ap-south-1 \
  --image-tag latest --image-manifest "$MANIFEST" --query 'image.imageId' --output json
aws ecs update-service --cluster unifolio-staging --service unifolio-staging-backend \
  --desired-count 1 --force-new-deployment --query "service.deployments[0].status" --output text
```
**Good looks like:** JSON with `"imageTag": "latest"`, then `PRIMARY`. Watch it as in Step 3e.

**What the `0023` downgrade does to data.** It's best effort, but nothing is deleted:
- members get the lock columns back, and members with a PAN conflict, or with no
  relationship, become locked again;
- names edited in the popup become ordinary "user entered" names;
- PANs, phones, emails and relationships saved since the deploy stay.

The downgrade was tested on Postgres with seeded data (0023 → 0022 → 0023), but not with
data created by the new app.

**Lighter alternative when only the release-B UI misbehaves:** leave the backend alone and
roll back only the frontend, as below. That keeps working on the new backend except for the
member unlock/edit popups.

**Frontend looks broken:** rebuild and publish from the previous commit:
```bash
git checkout <previous-commit>        # the commit staging was on before this release
# re-run Step 4a and 4b
git checkout feat/enhanced-ui
```
If you roll the backend back, roll the frontend back too. A new frontend on the old backend
gets a `404` from `/legal/documents`, which disables the sign-up box and the PAN disclaimer.

**Migrations: leave `0021` and `0022` in place on rollback.** They only add, and the old
backend works fine with them. Only `0023` must be downgraded, and only together with a
backend rollback (above). **Do not downgrade `0022` on staging:** its downgrade drops the
`consent_records` table, which deletes every consent record that has been collected. (The
append-only triggers don't stop a table drop.) Only downgrade if Aditi explicitly says so.

---

## After it's green

- Tell Aditi which Step 6 checks passed.
- For any failure, send the exact screen and an `aws logs tail /ecs/staging-backend` excerpt
  from around that time.
- Aditi then updates `session.md` / `CLAUDE.md` Session State to note the consent release is
  live on staging.

*Written 2026-10-01 from the deploy-readiness audit
(`.superpowers/sdd/2026-10-01-consent-onboarding-profile/deploy-audit.md`) and the repo. No command in this guide has been run against AWS.*

*Extended the same day for release B (member profile completion, migration `0023`):*
- *Checked against the working tree:*
  - *`0023`'s upgrade and downgrade code;*
  - *`/legal/documents` is public (`backend/app/api/legal.py`);*
  - *the new `PUT /household-members/{id}/profile` route;*
  - *the scheduler times in `infra/modules/scheduler/main.tf` (Asia/Kolkata).*
- *Postgres: `tests/functional_postgres` 11 passed, plus a seeded 0022 → 0023 → 0022 → 0023
  round trip, on local Postgres 16.2.*
- *No command in this guide has been run against AWS.*
- *Release B adds no Terraform, config, Dockerfile, `requirements.txt` or `package.json`
  change.*
