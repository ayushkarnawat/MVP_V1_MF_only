# Staging Deploy Guide — CAS import fixes (+ the 5 Oct small fixes + the 7 Oct changes)

**One deploy that brings staging fully up to date** with branch `feat/enhanced-ui`.

Run it on **your manager's laptop**, as usual. It needs:
- WSL with `git`, `python3`, Docker Desktop, the AWS CLI and the Session Manager plugin;
- `terraform`, `psql` and `node`/`npm`;
- the AWS credentials for account `811364789032`.

**When:** between **09:00 and 18:30 IST**.
- Staging's RDS, backend and NAT are stopped every night from 21:00 to 05:00 IST.
- Scheduled jobs start their own tasks from the `:latest` image at 06:00, 06:15 (new), 06:30, 08:00 and 19:00 IST, so keep clear of those times.

**The bastion is kept stopped.** Every database step goes through an SSM tunnel via the bastion, so Step 2 starts it first, and Step 13 stops it again at the end (the rollback path stops it too).

**Time:** about 90 minutes. Staging is **down for about 20 minutes**, from Step 5 to the end of Step 8.

**Nothing in this guide has been run against AWS yet.**
- It was written from the repo, the earlier guides (`2026-09-30-staging-qa-fixes-deploy-guide.md`, `2026-10-01-consent-release-deploy-guide.md`) and the infra code.
- Every expected output for a command that touches AWS is what the code says should happen.
- Where something can't be known in advance, the guide says so ("check before running").

---

## What ships

**Already live on staging, not part of this deploy** (checked on 7 October against the live staging API, and confirmed by Aditi):
- the 30 September staging QA fixes;
- the 1 October consent / onboarding / profile release (`/legal/documents` answers, the new profile route exists, the old `/details` route is gone). That is migrations up to `0023`.

**A. The 5 October small fixes** (committed after the 1 October deploy; staging still serves PAN disclaimer version `pan-disclaimer-placeholder-2026-10-01`, the repo has `…-2026-10-05`):
- The PAN disclaimer text is simplified, with a new version (`pan-disclaimer-placeholder-2026-10-05`). Its tick box is replaced by a line under Upload (E3 below).
- The Profile terms section is cleaned up (no "You agreed to version…" lines), and checkboxes are styled for light and dark mode. The consent tick boxes themselves are gone in E3; the people-popup and delete-portfolio checkboxes keep the new style.
- Statement names with special characters (a hyphen, brackets, "&") no longer block "Yes, that’s me".
- Stale CAMS requests expire, and request placeholders are hidden from Import history.

**B. The CAS import fixes** (Phases 1–6 plus Phase 7 preparation). The dashboard now equals the CAS for every lookback and upload order. Detail: `session.md` 2026-10-06, `decisions.md` 2026-10-06.
- The CAS opening balance is saved. This was the cause of the 10-year value gap.
- Twin same-day rows. Reversal, gift, bonus and segregation rows. Folio-number spacing variants.
- Deleting an import no longer drops rows that another statement still contains.
- Funds are identified from AMFI's official list by ISIN, refreshed daily. Direct/Regular comes from AMFI, never from the ARN.
- A held fund that isn't in any list imports as an "unlisted fund", valued at the NAV the statement prints, with a "Statement price" badge.
- Realised gains for sold funds and a "Sold funds" section. XIRR with switches. Today's gain.
- SIPs:
  - stopped after more than 3 missed months;
  - twin SIPs shown "× 2";
  - stamp duty no longer splits one SIP into two;
  - a "Show stopped SIPs" toggle.
- A new **Portfolio history** page: a desktop tab, and on mobile it opens from the value card. Partial months are flagged.
- Distributor comparison:
  - a Regular folio without an ARN is labelled Regular, not Direct;
  - per-fund TER savings are shown;
  - the misleading TER "Save ~x%" line is gone.
- A review session survives a backend restart or deploy.
- A clear message for demat (NSDL/CDSL) statements.
- A staging-only **Import health** page (Profile → Import health).
- **The Import Review screen is still there, on purpose.** It's removed only after this staging round passes and the screenshots are checked.
- Migrations `0025`, `0026`, `0027`, `0028` and `0029`. There is no `0024`. (E adds `0030`, so this deploy migrates to `0030`.)

**E. The 7 October changes** (plan page: https://claude.ai/artifact/UH899y4fhr6BbDdYE4Q9aU; `decisions.md` 2026-10-07):
1. **Logout asks first:** "Log out of Unifolio?" with Cancel / Yes, log out (desktop Profile and the mobile header).
2. **Sign-in email:** the highlighted words use the brand green `#22C55E`; "you can safely ignore this email" becomes "contact us at support@unifolio.in" (HTML and plain text).
3. **Consent by continuing, no tick boxes:**
   - Sign-up (Get OTP), new Google accounts (Continue), the "We’ve updated our Terms" prompt (Agree) and reactivation (Reactivate) show "By continuing, you agree to our Terms & Conditions and Privacy Policy". The links open new public pages, `/legal/terms` and `/legal/privacy`, in a new tab.
   - The upload page shows "Your data is encrypted and safe with us." and, on the next line, "By continuing, you agree to our privacy policy."; the link opens the PAN disclaimer with an Ok button.
   - **Phone sign-up consent is recorded at the Get OTP click** (it used to be at code verification). Migration **`0030`** adds one nullable column, `otp_requests.consent_snapshot`.
   - **Request from CAMS records no consent** (no box, no line). The PAN consent is recorded only at upload.
4. **Account deletion grace period is 30 days** (was 5).
5. **Member dropdowns show the name only**: no "(relationship)", no "(Me)", no %.

**C. One Terraform change.** A new daily job, `scheme-master-daily`, at 06:15 IST, loads AMFI's fund list.

**D. The staging database is wiped first.** Everything uploaded so far was saved under the old, buggy rules. This deletes every staging account, so **testers sign up again** afterwards. Reference data (funds, NAVs, TER, benchmarks) is kept.

**No new secret, no new environment variable, and no `requirements.txt`, `Dockerfile` or `package.json` change.**

### Order of steps

| Step | What | Staging |
|---|---|---|
| 0 | Commit and push (Aditi) | up |
| 1 | Pre-flight: Postgres-only tests on the laptop | up |
| 2 | Connection values, **start the bastion**, the database tunnel | up |
| 3 | Which migration staging is on | up |
| 4 | Build the new backend image and save rollback points (no push) | up |
| 5 | Stop the backend | **down** |
| 6 | Wipe the user data | down |
| 7 | Migrate to `0030` | down |
| 8 | Push the image and start the new backend | down → **up** |
| 9 | Publish the frontend | up |
| 10 | Terraform: add the `scheme-master-daily` job | up |
| 11 | Load AMFI's fund list once, now (and the TER job once) | up |
| 12 | Checks | up |
| 13 | **Stop the bastion** | up |

---

## Step 0 — Commit and push (Aditi, on your machine)

```bash
git status --short
```

**Everything** under `backend/`, `frontend/`, `infra/`, `scripts/` and `Docs/` for this release must be committed, **including untracked files** (lines starting `??`). For example:
- `backend/alembic/versions/0028_scheme_master_and_plan_verified.py` and `0029_snapshot_fields_and_preview_sessions.py`
- `backend/app/services/import_/identify.py`, `preview_store.py`
- `backend/app/services/analytics/scheme_master.py`
- `backend/scripts/jobs/refresh_scheme_master_daily.py` and `backend/scripts/reclassify_folio_plans.py`
- `frontend/src/features/history/` (the whole folder) and `frontend/src/mobile/features/history/`
- `frontend/src/features/dashboard/SoldFundsSection.tsx`, `distributorChannel.ts`, `navPriceBadge.ts`
- the changed `scripts/clean-staging-db.sh` and `.gitignore`
- the 7 October changes (E), already committed: check the pushed commit has `backend/alembic/versions/0030_otp_request_consent_snapshot.py`, `frontend/src/features/legal/ConsentNotice.tsx`, `frontend/src/features/legal/LegalPage.tsx` and `frontend/src/features/profile/LogoutConfirmDialog.tsx`, and no longer has `frontend/src/features/legal/ConsentCheckbox.tsx`
- this guide

**Never commit the real CAS statements.** `.gitignore` now ignores `Docs/CAS Files/*.pdf` (the top-level files only; the synthetic ones in `Docs/CAS Files/synthetic/` are fine to commit). Check:
```bash
git status --short --untracked-files=all "Docs/CAS Files" | grep -v synthetic/
```
**Good looks like:** no output. Any `CAS*.pdf` or `family_cas*.pdf` line means stop: don't add it.

Then:
```bash
git add -A && git commit -m "..." && git push
git log -1 --format=%h
```
Tell your manager that commit hash.

---

## Step 1 — Pre-flight on the laptop: Postgres-only tests

These run the migrations and the Postgres-specific behaviour against a throwaway local Postgres:
- migrations `0019` to `0030` (the round-trip tests upgrade to head, now `0030`);
- the partitioned `transactions` table;
- the consent triggers;
- cascade deletes.

They passed on 2026-10-06 (14 passed, Postgres 16.2), and `0030` was round-tripped (`0029 → 0030 → 0029 → 0030`) on Postgres 16.2 on 2026-10-07. Re-run them on the exact commit you're deploying.

**1a.** Start Docker Desktop on Windows and wait for "Engine running". In WSL, Docker Desktop's WSL integration must be on (Settings → Resources → WSL integration).

**1b.** From the repo root:
```bash
cd MVP_V1_MF_only
git checkout feat/enhanced-ui
git pull
git log -1 --format=%h        # expected: the hash Aditi sent
git status --short            # expected: empty

docker compose down
docker compose up -d postgres
docker compose ps             # wait until the postgres line says "healthy" (~10 s)
cd backend
python3 -m venv .venv 2>/dev/null; .venv/bin/pip install -q -r requirements.txt
TEST_DATABASE_URL=postgresql+psycopg2://unifolio:unifolio@localhost:5433/unifolio_test \
  timeout 900 .venv/bin/python -m pytest -v --tb=short -m postgres tests/functional_postgres
cd ..
docker compose stop postgres
```

**Good looks like:**
- `collected 14 items`;
- every line `PASSED`;
- the last line `14 passed in Ns` (N roughly 40–150);
- warnings before the last line are fine.

**If it isn't good:**
- **Any `FAILED`:** stop. Send Aditi the output.
- **`14 skipped`:** the tests didn't run. `TEST_DATABASE_URL=...` must be on the same command line as `pytest`.
- **Fewer than 14 collected:** the checkout is old. Re-run `git pull`.
- **`connection refused`:** Postgres isn't healthy yet. Check `docker compose ps`.

---

## Step 2 — Connection values, start the bastion, and the database tunnel

These commands are read-only: `terraform init` and `terraform output` change nothing.
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

**Good looks like:**
- `"Account": "811364789032"`;
- then a bastion id (`i-...`), the `staging-rds....` hostname and `unifolio`.

If the first command errors, fix the credentials first.

**Start the bastion** (it's kept stopped; the tunnel below and the wipe script in Step 6 both go through it). Same terminal:
```bash
aws ec2 describe-instances --instance-ids "$BASTION_ID" \
  --query "Reservations[0].Instances[0].State.Name" --output text
aws ec2 start-instances --instance-ids "$BASTION_ID" \
  --query "StartingInstances[0].CurrentState.Name" --output text
aws ec2 wait instance-running --instance-ids "$BASTION_ID"
echo "running; waiting for SSM..."
until [ "$(aws ssm describe-instance-information \
          --filters "Key=InstanceIds,Values=$BASTION_ID" \
          --query "InstanceInformationList[0].PingStatus" --output text)" = "Online" ]; do
  sleep 10
done
echo "bastion ready"
```
**Good looks like:**
1. `stopped` (its normal state). `running` is fine too: someone started it already.
2. `pending` (or `running` if it was already up).
3. The wait returns within about a minute, then `running; waiting for SSM...`.
4. `bastion ready`, usually 1–3 minutes after starting. The SSM agent needs a moment after boot.

**If it isn't good:**
- **The `until` loop runs for more than 5 minutes:** press Ctrl+C and check `aws ssm describe-instance-information --filters "Key=InstanceIds,Values=$BASTION_ID"`. An empty list means the agent hasn't registered yet: wait two more minutes and re-run the loop. Still nothing: send Aditi the output.
- **`IncorrectInstanceState`:** the instance is `stopping`. Wait a minute and re-run the block.

**Terminal A:** open the tunnel on local port **5434**.
```bash
aws ssm start-session \
  --target "$BASTION_ID" \
  --document-name AWS-StartPortForwardingSessionToRemoteHost \
  --parameters "{\"host\":[\"$DB_HOST\"],\"portNumber\":[\"5432\"],\"localPortNumber\":[\"5434\"]}"
```
**Good looks like:** `Starting session ...`, `Port 5434 opened ...`, `Waiting for connections...`. Leave it open. If `$BASTION_ID`/`$DB_HOST` are empty in this terminal, re-run the values block above in it.

**Terminal B:** put the password in an environment variable. Never type it out: it contains `$` characters.
```bash
export PGPASSWORD=$(aws secretsmanager get-secret-value \
  --secret-id "$(aws secretsmanager list-secrets --query "SecretList[?starts_with(Name, 'rds!db-')].Name" --output text)" \
  --query SecretString --output text | python3 -c "import json,sys; print(json.load(sys.stdin)['password'])")
cd "$REPO_ROOT/backend"      # or the full path to MVP_V1_MF_only/backend
export DATABASE_URL="postgresql://unifolio:$(python3 -c "import os,urllib.parse; print(urllib.parse.quote_plus(os.environ['PGPASSWORD']))")@localhost:5434/unifolio"
```
**Good looks like:** no output. The two `export`s are silent.

---

## Step 3 — Which migration is staging on? (Terminal B)

```bash
.venv/bin/alembic current
```

**Good looks like** one of these two. Write it down: it's your **rollback revision**.

| Shows | Means | Rollback revision `R` |
|---|---|---|
| `0023` | **Expected.** The 1 October release is live (confirmed 7 October). | `0023` |
| `0020`–`0022` | Unexpected: the 1 October release isn't (fully) live after all. Stop and ask Aditi before going on. | — |

The `INFO ... Context impl PostgresqlImpl.` line before it is normal.

- **`0025` or higher (up to `0030`):** stop and ask Aditi. Part of this deploy has already run.
- **Older than `0020`:** stop. An earlier deploy's migrations are missing. Send the output.

---

## Step 4 — Build the image and save rollback points (nothing changes on AWS yet)

**Terminal C:**
```bash
cd "$REPO_ROOT/backend"
docker build -t unifolio-staging-backend .
```
**Good looks like:** the build ends with `naming to docker.io/library/unifolio-staging-backend`. If it fails with `failed to xattr .pytest_tmp: permission denied`, run `sudo rm -rf .pytest_tmp pytest_tmp` and retry.

**Rollback point 1: tag the image that's running now.**
```bash
MANIFEST=$(aws ecr batch-get-image --repository-name unifolio-staging-backend --region ap-south-1 \
  --image-ids imageTag=latest --query 'images[0].imageManifest' --output text)
aws ecr put-image --repository-name unifolio-staging-backend --region ap-south-1 \
  --image-tag pre-cas-fixes --image-manifest "$MANIFEST" --query 'image.imageId' --output json
```
**Good looks like:** JSON with `"imageTag": "pre-cas-fixes"`. `ImageAlreadyExistsException` is fine. Any other error means stop: there would be no clean rollback.

**Rollback point 2: copy the frontend that's live now.**
```bash
mkdir -p ~/staging-frontend-backup-$(date +%F)
aws s3 sync "s3://$(terraform -chdir="$REPO_ROOT/infra/envs/staging" output -raw s3_bucket_name)/" ~/staging-frontend-backup-$(date +%F)/
ls ~/staging-frontend-backup-$(date +%F)/index.html
```
**Good looks like:** `download: s3://...` lines, then the path of `index.html` printed back.

**Log in to ECR and tag the new image. Don't push yet.**
```bash
aws ecr get-login-password --region ap-south-1 | \
  docker login --username AWS --password-stdin 811364789032.dkr.ecr.ap-south-1.amazonaws.com
docker tag unifolio-staging-backend:latest \
  811364789032.dkr.ecr.ap-south-1.amazonaws.com/unifolio-staging-backend:latest
```
**Good looks like:** `Login Succeeded`. Pushing `:latest` before the migrations run would let any task that starts (a restart or a scheduled job) run the new code on the old schema.

---

## Step 5 — Start the window: stop the backend

> **Staging is down from here until Step 8 finishes (about 20 minutes).** Tell the testers.

```bash
aws ecs update-service --cluster unifolio-staging --service unifolio-staging-backend \
  --desired-count 0 --query "service.desiredCount" --output text
```
**Good looks like:** `0`.

Then:
```bash
watch -n 5 'aws ecs describe-services --cluster unifolio-staging --services unifolio-staging-backend \
  --query "services[0].{running:runningCount,desired:desiredCount}"'
```
**Good looks like:** `running` reaches `0`, usually within a minute. Then Ctrl+C.

---

## Step 6 — Wipe the user data (runs on the old schema, before migrating)

This step deletes every staging account, member, import, transaction, folio and history row. Reference data is kept: funds, NAVs, TER, AAUM, benchmarks, the ARN directory and scores. Consent records are kept on purpose, because they're append-only. The wipe happens before the migrations, so they run on an empty set of user data.

**Terminal C**, from the repo root:
```bash
cd "$REPO_ROOT"
./scripts/clean-staging-db.sh
```
The script opens its own tunnel on port 5439 (Terminal A's 5434 tunnel is separate) and runs everything in one transaction.

**Good looks like:**
1. `Bastion: i-...` and `RDS endpoint: staging-rds....`.
2. `=== BEFORE ===`: a table of row counts, with `household_member_merges` and `household_member_name_changes` included (new in this version of the script). Write down `users` and `transactions`.
3. `=== RUNNING CLEANUP ===`: `BEGIN`, a list of `DELETE n` lines, `COMMIT`.
4. `=== AFTER (user-domain, should be all 0) ===`: every count is `0`.
5. `=== AFTER (reference data, should remain intact) ===`: `schemes`, `nav_history` and the other reference tables are non-zero, as before.
6. `Done.`

**If it isn't good:**
- **Any `ERROR:` line before `COMMIT`:** the transaction rolled back, so nothing was deleted. Copy the error and send it. You can still continue with Steps 7–8: the migrations work on existing data too (they were tested on seeded data). The re-upload test in Step 12 then runs on top of old data, so tell Aditi.
- **`Could not find a running 'staging-bastion' instance`:** the bastion isn't running (Step 2 should have started it). Re-run the **Start the bastion** block from Step 2, then re-run the script.
- **`psql: command not found`:** run `sudo apt-get install -y postgresql-client`, then re-run.

---

## Step 7 — Migrate to `0030` (Terminal B, tunnel still open in Terminal A)

```bash
.venv/bin/alembic upgrade head
.venv/bin/alembic current
```

**Good looks like (staging is on `0023`, as expected):**
```
INFO  [alembic.runtime.migration] Running upgrade 0023 -> 0025, transactions.origin and transactions.cost_source (#1 opening balance)
INFO  [alembic.runtime.migration] Running upgrade 0025 -> 0026, twin same-day rows (balance_units, occurrence) and new row types (#2, #3)
INFO  [alembic.runtime.migration] Running upgrade 0026 -> 0027, folios.folio_key (+ duplicate merge) and transaction_imports (#4, #5)
INFO  [alembic.runtime.migration] Running upgrade 0027 -> 0028, AMFI scheme master and verified folio plans.
INFO  [alembic.runtime.migration] Running upgrade 0028 -> 0029, Snapshot history fields and encrypted review sessions.
INFO  [alembic.runtime.migration] Running upgrade 0029 -> 0030, otp_requests.consent_snapshot: phone sign-up consent captured at "Get OTP"
```
Then `0030 (head)`.

Going `0023 -> 0025` (skipping `0024`) is correct: `0024` is reserved for a deferred change.

**Sanity check:**
```bash
.venv/bin/python - <<'EOF'
import os, sqlalchemy as sa
q = lambda c, s: c.execute(sa.text(s)).scalar()
with sa.create_engine(os.environ["DATABASE_URL"]).connect() as c:
    print("new transaction columns:", q(c, "SELECT count(*) FROM information_schema.columns WHERE table_name='transactions' AND column_name IN ('origin','cost_source','balance_units','occurrence')"))
    print("folio columns:", q(c, "SELECT count(*) FROM information_schema.columns WHERE table_name='folios' AND column_name IN ('folio_key','plan_verified')"))
    print("transaction_imports table:", q(c, "SELECT count(*) FROM information_schema.tables WHERE table_name='transaction_imports'"))
    print("scheme master columns:", q(c, "SELECT count(*) FROM information_schema.columns WHERE table_name='schemes' AND column_name IN ('isin_reinvest','base_name','plan_type','is_active','source')"))
    print("snapshot columns:", q(c, "SELECT count(*) FROM information_schema.columns WHERE table_name='portfolio_snapshots' AND column_name IN ('invested_value','is_partial','missing_scheme_ids','data_version')"))
    print("imports.preview_state:", q(c, "SELECT count(*) FROM information_schema.columns WHERE table_name='imports' AND column_name='preview_state'"))
    print("consent_records table:", q(c, "SELECT count(*) FROM information_schema.tables WHERE table_name='consent_records'"))
    print("otp_requests.consent_snapshot:", q(c, "SELECT count(*) FROM information_schema.columns WHERE table_name='otp_requests' AND column_name='consent_snapshot'"))
    print("users left:", q(c, "SELECT count(*) FROM users"))
EOF
```
**Good looks like:**
```
new transaction columns: 4
folio columns: 2
transaction_imports table: 1
scheme master columns: 5
snapshot columns: 4
imports.preview_state: 1
consent_records table: 1
otp_requests.consent_snapshot: 1
users left: 0
```
(`users left` is `0` only if Step 6 succeeded.)

**If `upgrade` fails:** each migration runs in its own transaction, so the database stays at the last one that worked.
- Copy the full error and don't retry.
- Run `.venv/bin/alembic current` and note what it says.
- Go to **"If something goes wrong" → backend rollback**, which brings staging back on the old image.

Close the tunnel in Terminal A (Ctrl+C) once the sanity check is good.

---

## Step 8 — Push the image and start the new backend (Terminal C)

```bash
docker push 811364789032.dkr.ecr.ap-south-1.amazonaws.com/unifolio-staging-backend:latest
```
**Good looks like:** a push ending in `latest: digest: sha256:...`. If the authorization token expired, re-run the `aws ecr get-login-password ... docker login` line from Step 4 and push again.

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
**Good looks like:**
- `rollout` goes `IN_PROGRESS` → `COMPLETED` (3–6 minutes);
- `running` equals `desired`;
- the logs show `Uvicorn running on ...` and `Application startup complete.`, with no traceback.

**If the task keeps restarting:** a traceback about a missing column or table (for example `otp_requests.consent_snapshot`) means the database isn't at `0030 (head)`. Re-check Step 7, or use the rollback.

**Is the new code live?** These are read-only; no token is sent.
```bash
curl -s https://staging-api.unifolio.in/health
curl -s https://staging-api.unifolio.in/legal/documents | head -c 200; echo
curl -s -o /dev/null -w "%{http_code}\n" https://staging-api.unifolio.in/dev/status
curl -s -o /dev/null -w "%{http_code}\n" -X PUT https://staging-api.unifolio.in/household-members/00000000-0000-0000-0000-000000000000/profile
curl -s -X POST https://staging-api.unifolio.in/auth/otp/request -H "Content-Type: application/json" \
  -d '{"phone_number":"+910000000001","flow":"signup","accepted_documents":[{"document_type":"terms_of_service","document_version":"old"}]}'; echo
```
**Good looks like:**
1. `{"status":"ok"}`.
2. JSON that starts with the legal documents list (the 1 October release).
3. `401`: the new staging-only `/dev` routes exist and need a login. A `404` means the old backend is still serving: wait for `COMPLETED` and retry.
4. `401` or `403` (the 1 October profile route).
5. A `422` with `"code":"consent_required"` and `"missing":["terms_of_service", ...]`: the new backend checks the Terms version at Get OTP (E3) and sends no code. `{"message":"OTP sent.", ...}` means the old backend is still serving: wait for `COMPLETED` and retry. (Phone OTP is in stub mode on staging and this number isn't registered, so nothing reaches anyone.)

**The window ends here.** Go straight to Step 9: an old cached frontend breaks against the new backend (sign-up and upload get `422`).

---

## Step 9 — Build and publish the frontend (right away)

**9a. Build** (nothing leaves the laptop):
```bash
cd "$REPO_ROOT/frontend" && \
  rm -rf dist && \
  npm ci && \
  VITE_API_BASE_URL=https://staging-api.unifolio.in npm run build && \
  test -f dist/index.html && echo "BUILD OK"
```
**Good looks like:** the last line is `BUILD OK`. The "N vulnerabilities" notice and Vite's timing lines don't matter. Any `error TS...`, or no `BUILD OK`: stop, don't run 9b, and send the output.

**9b. Publish** (only after `BUILD OK`):
```bash
aws s3 sync dist/ "s3://$(terraform -chdir="$REPO_ROOT/infra/envs/staging" output -raw s3_bucket_name)/" --delete && \
aws cloudfront create-invalidation \
  --distribution-id "$(terraform -chdir="$REPO_ROOT/infra/envs/staging" output -raw cloudfront_distribution_id)" \
  --paths "/*"
```
**Good looks like:** `upload: dist/...` lines (plus `delete: s3://...` for old assets), then JSON with an `"Id"` and `"Status": "InProgress"`.

**Tell every tester to hard-refresh (Ctrl+Shift+R) or close and reopen their staging tabs.**

---

## Step 10 — Terraform: add the `scheme-master-daily` job

The repo has **one infra change**: a new scheduled job in `infra/modules/scheduler/main.tf`. It also needs the same `terraform.tfvars` that the 2026-10-01 apply used (it holds the live email/SES settings). Check that it's present before planning:
```bash
cd "$REPO_ROOT/infra/envs/staging"
ls terraform.tfvars && grep -c "=" terraform.tfvars
```
**Good looks like:** `terraform.tfvars` and a number above 0.
- **`No such file`:** stop. Copy the `terraform.tfvars` from the machine that ran the last apply. Without it, the plan would turn live email back to stub mode. Don't apply.

**PAN keys for Terraform.** Without these, the plan stops and asks for `var.pan_encryption_key`. They're read from Secrets Manager and never typed or saved.
```bash
SECRET_JSON=$(aws secretsmanager get-secret-value --secret-id unifolio-staging-pan-keys --query SecretString --output text)
export TF_VAR_pan_encryption_key=$(echo "$SECRET_JSON" | python3 -c "import json,sys; print(json.load(sys.stdin)['PAN_ENCRYPTION_KEY'])")
export TF_VAR_pan_lookup_pepper=$(echo "$SECRET_JSON" | python3 -c "import json,sys; print(json.load(sys.stdin)['PAN_LOOKUP_PEPPER'])")
```

**Plan:**
```bash
terraform plan -out=scheme-master.tfplan
```
**Good looks like** these resources, and nothing else:
```
  # module.scheduler.aws_cloudwatch_log_group.jobs["scheme_master_daily"] will be created
  # module.scheduler.aws_ecs_task_definition.jobs["scheme_master_daily"] will be created
  # module.scheduler.aws_iam_role_policy.scheduler will be updated in-place
  # module.scheduler.aws_scheduler_schedule.jobs["scheme_master_daily"] will be created

Plan: 3 to add, 1 to change, 0 to destroy.
```
- **Seen on the real run (7 Oct): `4 to add, 1 to change, 0 to destroy`.** The fourth is `module.scheduler.aws_sns_topic_subscription.ops_alerts_email["siddharth.surve@unifolio.in"] will be created`. That's fine. AWS deletes an unconfirmed email subscription after 3 days, so Terraform re-creates it; Siddharth gets a new confirmation email and should click it.
- `data "aws_iam_policy_document" "scheduler" will be read during apply` is also normal. It's the policy for the in-place update, computed once the new task definition exists.
- The `dynamodb_table` and `network_interface` "deprecated" warnings are old notices, not changes.
- The in-place update adds the new task definition to the list of tasks the scheduler may run.
- The `aws_ecs_task_definition` for the backend service is **not** in the list, because the image tag is `latest` and doesn't change.

**If the plan shows anything else:** any other resource changing or being destroyed (especially the backend task definition's environment, the RDS instance, `ses`/email variables, or the bastion) means stop. Don't apply. Send the full plan output to Aditi. (The bastion `associate_public_ip_address` false alarm was fixed on 2026-10-01, so it shouldn't appear.)

**Apply** (only if the plan matched):
```bash
terraform apply scheme-master.tfplan
```
**Good looks like:** `Apply complete! Resources: 3 added, 1 changed, 0 destroyed.` (or `4 added` with the SNS subscription above).

**Check the schedule:**
```bash
aws scheduler get-schedule --name unifolio-staging-job-scheme-master-daily \
  --query "{state:State,cron:ScheduleExpression,tz:ScheduleExpressionTimezone}"
```
**Good looks like:**
```
{ "state": "ENABLED", "cron": "cron(15 6 * * ? *)", "tz": "Asia/Kolkata" }
```

---

## Step 11 — Load AMFI's fund list once, now

The schedule's first run would only be tomorrow at 06:15 IST. Until the list is loaded, funds in new uploads aren't identified and would all land on the review screen as needing a choice. So run the job once by hand, with exactly the task and network the schedule uses.

```bash
cd "$REPO_ROOT/infra/envs/staging"
SUBNETS=$(terraform output -json networking | python3 -c "import json,sys; print(','.join(json.load(sys.stdin)['private_app_subnet_ids']))")
ECS_SG=$(terraform output -json networking | python3 -c "import json,sys; print(json.load(sys.stdin)['ecs_security_group_id'])")
TASK_ARN=$(aws ecs run-task --cluster unifolio-staging \
  --task-definition unifolio-staging-job-scheme-master-daily --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[$SUBNETS],securityGroups=[$ECS_SG],assignPublicIp=DISABLED}" \
  --query "tasks[0].taskArn" --output text)
echo "$TASK_ARN"
aws ecs wait tasks-stopped --cluster unifolio-staging --tasks "$TASK_ARN"
aws ecs describe-tasks --cluster unifolio-staging --tasks "$TASK_ARN" \
  --query "tasks[0].containers[0].{exit:exitCode,reason:reason}"
aws logs tail /ecs/staging-job-scheme-master-daily --since 15m
```
**Good looks like:**
- An `arn:aws:ecs:ap-south-1:811364789032:task/unifolio-staging/...` line.
- The wait returns after 1–3 minutes.
- `{ "exit": 0, "reason": null }`.
- A log line like:
  ```
  INFO:__main__:refresh_scheme_master_daily: rows=14356 inserted=... updated=... deactivated=...
  ```
  `rows` should be around **14,000–15,000** (14,356 on 6 October). `inserted + updated` should be about `rows`. `deactivated` is small (a handful to a few hundred), or `0`. (Check before running: the exact numbers depend on that day's AMFI file.)

**If it isn't good:**
- **`exit` isn't `0`:** send the log output.
- **A timeout or connection error to `portal.amfiindia.com`:** the NAT may not be up yet (after 05:00 IST it should be). Wait five minutes and re-run the `run-task` block.

**Then run the TER job once too.** It now matches TER by AMFI's plan type, which needs the list just loaded.
```bash
TASK_ARN=$(aws ecs run-task --cluster unifolio-staging \
  --task-definition unifolio-staging-job-ter-monthly --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[$SUBNETS],securityGroups=[$ECS_SG],assignPublicIp=DISABLED}" \
  --query "tasks[0].taskArn" --output text)
aws ecs wait tasks-stopped --cluster unifolio-staging --tasks "$TASK_ARN"
aws ecs describe-tasks --cluster unifolio-staging --tasks "$TASK_ARN" --query "tasks[0].containers[0].exitCode"
aws logs tail /ecs/staging-job-ter-monthly --since 15m
```
**Good looks like:** `0`, and log lines ending in a summary of TER rows written. (Check before running: the exact log text isn't pinned in this guide; any `exitCode` of `0` is a pass.)

**Database check** (optional; re-open the Terminal A tunnel and Terminal B as in Step 2):
```bash
.venv/bin/python - <<'EOF'
import os, sqlalchemy as sa
with sa.create_engine(os.environ["DATABASE_URL"]).connect() as c:
    print(c.execute(sa.text("SELECT source::text, count(*), count(plan_type) FROM schemes GROUP BY 1 ORDER BY 1")).all())
EOF
```
**Good looks like:** a row like `('amfi', 14xxx, 14xxx)` (almost every AMFI row has a plan type). There may also be `casparser` rows from before. No `cas_only` rows yet, because no upload has happened.

---

## Step 12 — Checks on https://staging.unifolio.in

Use an incognito window after a hard refresh. **Every account is new** (Step 6 wiped them), so each tester signs up again.

### 12a. The 5 October small fixes

1. **PAN disclaimer:** "privacy policy" on the upload screen (E3) opens the short disclaimer text.
2. **Checkboxes** look right in both light and dark mode: "Include in family total" in the people popup and the box in the delete-portfolio dialog. (The consent tick boxes are gone, E3.)
3. **Profile → Terms of Service** lists the three documents, each with a View button, and no "You agreed to version…" line.
4. **Import history** shows no "requested" placeholder rows for CAMS requests.

The 1 October checks (five-section Profile, % complete nudge, Complete profile popup) were done at that deploy. A quick look while doing 12b is enough. Its sign-up consent box is replaced by E3.

### 12b. CAS import: real statements and Import health (the Phase 7 gate, Step 2)

For each file:
1. Sign up with a **new phone number** and the investor's own name, as on the statement.
2. Upload the file. The review screen shows one ribbon per person.
3. Press **Confirm imports**.
4. Open **Profile → Import health** (marked STAGING).

| File | Expected on the review screen | Expected on Import health |
|---|---|---|
| `Docs/CAS Files/CAS_01042016-23092026_CP225296748_23092026061510511.pdf` | 4 funds, all confirmed, nothing to choose | every row ✓, NAV check passed |
| `Docs/CAS Files/CAS 10 Yr.pdf` | 13 funds, all confirmed | every row ✓ |
| **1–2 real KFintech statements** (not yet tested anywhere) | all funds confirmed, or at most a "choose the fund" row for a fund that isn't in AMFI's list | every row ✓ |
| `Docs/CAS Files/synthetic/kfin_pk_10yr.pdf` (password `MF@123`, name `RAHUL VENKAT IYER`) | 5 funds, including the Franklin segregated portfolio as its own fund | every row ✓ |

**If any row is not ✓:** screenshot the Import health page (it shows counts and fund names only) and send it. Don't delete the account.

### 12c. The C1–C14 frontend checklist

The checklist is in `Docs/investigations/2026-10-05-cas-import-fix-plan-final.html`, section "Frontend checklist".
- Run it **on staging instead of localhost**. Skip its "Setup" block: there's nothing to start locally.
- Sign up as in 12b. Files are in `Docs/CAS Files/synthetic/`, password `MF@123`. Error files are in `errors/`.
- Name the screenshots as listed (`C1-a.png`, …).

**What "fixed" looks like.** Values are approximate, because staging uses that day's NAVs.

| Check | Expected now |
|---|---|
| C1 review screen (`p20_20yr`, VIKRAM ANAND MEHTA) | no fund unclassified; the old HDFC Liquid shows as a closed fund under its own name (not IDFC); the merged small-cap fund under its own name (not UTI); all ribbons confirmed |
| C2 dashboard after import | value about ₹20 Cr; a Realised gain block and a "Sold funds" section; Today’s gain; Current XIRR about 15.5%, Lifetime about 14.7% |
| C3 plan badges | Direct badges green; Regular grey; no unclassified |
| C4 one fund, two numbers | the table row and the fund popup show the same unrealised gain |
| C5 SIPs | the 2013 HDFC Flexi Cap SIP is not under Upcoming (it appears under "Show stopped SIPs"); Parag Parikh shows "× 2"; no fake stopped SIPs from 2020 (exact list: check D1 below) |
| C6 distributor + analytics | no-ARN Regular folios labelled "Regular (no ARN on statement)"; per-fund "Saves x% a year vs Regular"; no "Save ~x%" line in TER (check D2 below); the duplicate category labels and the liquid-fund benchmark are known, deferred (#24) |
| C7 mobile | green Direct badges; XIRR, Realised and Today’s gain in the hero; Upcoming SIPs card; "History ›" opens Portfolio history; allocation order Equity, Debt, Hybrid, Other |
| C8 FY → 7-year → delete FY (`p7_*`, ARJUN SURESH NAIR) | after FY about ₹12 Cr (not ₹28 L); after 7-year the same about ₹12 Cr; after deleting FY still about ₹12 Cr |
| C9 family (`fam_10yr`) | popup shows 2 people; filtering to NEHA changes the hero to her figures; her PPFAS row opens her numbers |
| C10 KFintech + STP (`kfin_pk_10yr`) | no pending Franklin row; Current XIRR about 15.2% (not 38.8%) |
| C11 rare types (`px_14yr`, KAVYA SURESH RAO) | total about ₹3.0 Cr (not ₹16 Cr); the minor's folio still sits under the guardian (known, deferred as #25) |
| C12 error files | each shows a clear message; `err_nsdl` → "Demat statements aren’t supported yet…"; `err_truncated` → "This file looks incomplete…"; `err_unencrypted` imports normally |
| C13 review survives a restart (`p3_FY`, ISHA MOHAN VERMA) | on staging, instead of Ctrl+C: stop at the review screen, then run `aws ecs update-service --cluster unifolio-staging --service unifolio-staging-backend --force-new-deployment --query "service.deployments[0].status" --output text` and wait for `COMPLETED` (Step 8's watch); then press Confirm imports → it saves (no "This review has expired") |
| C14 two tabs (`p7_1yr`) | tab B should say "This statement was already imported", not "A household member was removed" (check before running: not verified locally; screenshot whatever tab B shows) |

#### Two checks for the 6 October decisions (same `p20_20yr` account as C1–C6)

**D1. Stamp duty no longer splits a SIP.**

1. On the desktop dashboard, open the SIP section, **Upcoming** tab.
2. Screenshot it as `D1-a.png`.
3. Press **Show stopped SIPs** and screenshot again as `D1-b.png`.

| | Expected |
|---|---|
| Upcoming, default (`D1-a`) | exactly 4 SIPs: HDFC Flexi Cap Direct ₹53,709.81 · Parag Parikh Flexi Cap ₹42,967.85 **× 2** · Nippon India Nifty 50 ₹64,451.78 · Axis Large Cap Regular ₹16,112.94. "Monthly SIP total" counts Parag Parikh twice. |
| With "Show stopped SIPs" (`D1-b`) | the same 4, plus **one** row with a **Stopped** badge: HDFC Flexi Cap Regular ₹21,485 (last paid Dec 2013). **5 rows in total.** |
| Not acceptable | any **Stopped** row whose last payment is **June 2020**, e.g. ₹53,712.50 or ₹42,970.00. That is the old split back. |

Then the **This Month** tab:
1. Press **←** back to **August 2020**. Screenshot it as `D1-c.png`. Expected: HDFC Flexi Cap Direct **₹53,709.81** (the amount paid then, after stamp duty).
2. Go back further to **March 2020**. Screenshot it as `D1-d.png`. Expected: HDFC Flexi Cap Direct **₹53,712.50** (before stamp duty).

Amounts are from the synthetic statement, so they're exact; they don't depend on NAVs.

**D2. The TER card has no "Save" line.**

1. Open **Analytics**, then the TER section's "Direct vs. Regular Fee Comparison" card.
2. Screenshot it as `D2-a.png`.
3. On the dashboard, open **Distributor Comparison** and expand the "Direct Plan (No Broker)" row.
4. Screenshot it as `D2-b.png`.

| | Expected |
|---|---|
| TER card (`D2-a`) | "Direct Plans TER x%" and "Regular Plans TER y%" with their two bars, Direct value / Regular value, Portfolio coverage. **No green "Save ~…% per year with Direct" text anywhere.** A missing value shows "—", not ₹0. |
| Distributor Comparison (`D2-b`) | under some Direct funds, a line "Saves x% a year vs Regular". It appears only where the same fund's Regular plan costs more; it never shows a negative number. |
| Not acceptable | any "Save ~" text on the TER card, or a negative "Saves" figure. |

On mobile (phone width, as in C7), repeat D1 (the Upcoming SIPs card shows the same 4, Parag Parikh "× 2") and D2 (the Analytics TER card, no "Save" line).

Also check the **new Portfolio history page** (desktop: the History tab; mobile: "History ›" on the value card). It shows one point per month, a hollow dot for a partial month, and range chips (desktop 1Y/3Y/5Y/All, mobile 1Y/5Y/All).

### 12e. The 7 October changes (E)

Do these on desktop and at phone width (incognito, after a hard refresh), with a new phone number.

| # | Do | Expected |
|---|---|---|
| E1 | Profile → **Logout**; then the mobile header's logout icon | A popup "Log out of Unifolio?" with Cancel and Yes, log out. **Cancel** closes it and you stay where you were; **Yes, log out** logs out. |
| E2 | Sign up with a real email you can read; open the code email | "verification code" in green `#22C55E`; the note says "If you didn't request it, contact us at support@unifolio.in…"; no "safely ignore this email". |
| E3a | Sign-up screen (phone) | **No tick box.** Under **Get OTP**: "By continuing, you agree to our Terms & Conditions and Privacy Policy." Get OTP works without ticking anything. |
| E3b | Click **Terms & Conditions**, then **Privacy Policy** | Each opens in a **new tab** at `staging.unifolio.in/legal/terms` / `/legal/privacy` and shows the document, without logging in. |
| E3c | Upload screen | No tick box. Under **Upload Statement**: "Your data is encrypted and safe with us." then "By continuing, you agree to our privacy policy." **privacy policy** opens the PAN disclaimer with an **Ok** button. Upload works without ticking. |
| E3d | **Request from CAMS** screen | No box and no consent line; **Request statement on CAMS** works straight away. |
| E4 | Profile → Preferences → **Delete account**, on a throwaway account | The copy says "30-day grace period" and "deleted in 30 days". After confirming, the pending-deletion screen shows a date **30 days** from today, with "By reactivating, you agree to…" above **Reactivate** (no box). Reactivate it afterwards. |
| E5 | Dashboard → **Per Member**, open the member dropdown (needs a family statement, e.g. `fam_10yr` from 12c) | Names only, e.g. "Vikram Anand Mehta": no "(Me)", no "(spouse)", no %. The "N% complete" chip under the picker is still there. |

**Database check for E3** (optional; tunnel and Terminal B as in Step 2), after the E3a sign-up is complete. Put that phone number in place of `+91XXXXXXXXXX`:
```bash
.venv/bin/python - <<'EOF'
import os, sqlalchemy as sa
with sa.create_engine(os.environ["DATABASE_URL"]).connect() as c:
    print(c.execute(sa.text("""SELECT c.document_type::text, c.surface, c.recorded_at, u.created_at
        FROM consent_records c JOIN users u ON u.id = c.user_id
        WHERE u.phone_number = '+91XXXXXXXXXX' ORDER BY c.recorded_at""")).all())
EOF
```
**Good looks like:** three rows (`terms_of_service`, `privacy_policy` twice), `surface` `signup_phone`, and every `recorded_at` **earlier** than `created_at`, by about the time it took to enter the code and verify the email: the consent is timed at the Get OTP click.

### 12d. Send to Aditi

Send:
- the 12b Import health screenshots;
- the C1–C14 screenshots and D1/D2 (`D1-a` … `D1-d`, `D2-a`, `D2-b`);
- which E1–E5 checks passed, with screenshots of E1, E3a, E3c and E5;
- any failure, with the time it happened;
- an `aws logs tail /ecs/staging-backend --since 30m` excerpt around any failure.

Aditi then confirms the gate. **Only after that** is the review screen removed, in a later, separate deploy.

---

## Step 13 — Stop the bastion

Do this once all the database work is finished: after the Step 11 and Step 12e database checks (or when you've decided to skip them). Close every tunnel first (Ctrl+C in Terminal A).
```bash
aws ec2 stop-instances --instance-ids "$BASTION_ID" \
  --query "StoppingInstances[0].CurrentState.Name" --output text
aws ec2 wait instance-stopped --instance-ids "$BASTION_ID"
aws ec2 describe-instances --instance-ids "$BASTION_ID" \
  --query "Reservations[0].Instances[0].State.Name" --output text
```
**Good looks like:** `stopping`, then (after up to a couple of minutes) `stopped`.

If `$BASTION_ID` is empty in this terminal, re-run the values block at the top of Step 2 first.

Need the database again later (a re-check, a rollback)? Start the bastion again with the Step 2 block, and stop it again afterwards.

---

## If something goes wrong

### Backend rollback (the new backend crash-loops or misbehaves)

The old image can't run on the new schema. A rollback is: stop the backend, downgrade to your **rollback revision `R`** from Step 3, then put the old image back.

1. **Stop the backend:**
```bash
aws ecs update-service --cluster unifolio-staging --service unifolio-staging-backend \
  --desired-count 0 --query "service.desiredCount" --output text
```
2. **Clear what blocks the downgrade.** If you already stopped the bastion (Step 13), start it again with the Step 2 **Start the bastion** block. Then open the tunnel and Terminal B as in Step 2. `0028`'s downgrade refuses while any fund has no AMFI code, and the new code creates such funds for unlisted or closed CAS-only funds. Everything on staging is test data, so wipe again and remove those funds:
```bash
cd "$REPO_ROOT" && ./scripts/clean-staging-db.sh
cd "$REPO_ROOT/backend" && .venv/bin/python - <<'EOF'
import os, sqlalchemy as sa
with sa.create_engine(os.environ["DATABASE_URL"]).begin() as c:
    ids = "SELECT id FROM schemes WHERE amfi_code IS NULL"
    for t in ("nav_history", "scheme_ter", "scheme_aaum", "fund_scores"):
        c.execute(sa.text(f"DELETE FROM {t} WHERE scheme_id IN ({ids})"))
    print("CAS-only funds removed:", c.execute(sa.text("DELETE FROM schemes WHERE amfi_code IS NULL")).rowcount)
EOF
```
3. **Downgrade to `0023`** (the revision Step 3 showed):
```bash
.venv/bin/alembic downgrade 0023
.venv/bin/alembic current
```
**Good looks like:** `Running downgrade 0030 -> 0029`, `0029 -> 0028`, `0028 -> 0027`, `0027 -> 0026`, `0026 -> 0025` and `0025 -> 0023`, then `0023`. **Never go below `0023`:** the old (1 October) backend needs `0023`, and `0022`'s downgrade would drop the `consent_records` table and every consent collected.
4. **Put the old image back and start it:**
```bash
MANIFEST=$(aws ecr batch-get-image --repository-name unifolio-staging-backend --region ap-south-1 \
  --image-ids imageTag=pre-cas-fixes --query 'images[0].imageManifest' --output text)
aws ecr put-image --repository-name unifolio-staging-backend --region ap-south-1 \
  --image-tag latest --image-manifest "$MANIFEST" --query 'image.imageId' --output json
aws ecs update-service --cluster unifolio-staging --service unifolio-staging-backend \
  --desired-count 1 --force-new-deployment --query "service.deployments[0].status" --output text
```
**Good looks like:** JSON with `"imageTag": "latest"`, then `PRIMARY`. Watch it as in Step 8.

5. **Put the old frontend back too** (a new frontend on the old backend misbehaves):
```bash
aws s3 sync ~/staging-frontend-backup-$(date +%F)/ "s3://$(terraform -chdir="$REPO_ROOT/infra/envs/staging" output -raw s3_bucket_name)/" --delete
aws cloudfront create-invalidation --distribution-id "$(terraform -chdir="$REPO_ROOT/infra/envs/staging" output -raw cloudfront_distribution_id)" --paths "/*"
```
(If the backup folder has another date, use that folder's name.)

6. **Stop the bastion** as in Step 13.

### Only the frontend looks broken

Leave the backend alone and run step 5 above. Data stays as it is.

### The scheme-master job fails (Step 11)

Nothing else is affected: uploads still work, but funds may land on the review screen as needing a choice. Send the log. The job can be re-run any time with the Step 11 block, and it also runs on its own at 06:15 IST.

### Terraform plan doesn't match (Step 10)

Don't apply. Everything else in this guide works without Step 10. Only the daily refresh is missing: run Step 11 using the **nav-daily** task with an override instead, then send Aditi the plan:
```bash
aws ecs run-task --cluster unifolio-staging --task-definition unifolio-staging-job-nav-daily --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[$SUBNETS],securityGroups=[$ECS_SG],assignPublicIp=DISABLED}" \
  --overrides '{"containerOverrides":[{"name":"staging-job-nav-daily","command":["python","scripts/jobs/refresh_scheme_master_daily.py"]}]}' \
  --query "tasks[0].taskArn" --output text
```
Its log goes to `/ecs/staging-job-nav-daily`: `aws logs tail /ecs/staging-job-nav-daily --since 15m`.

---

## After it's green

- Tell Aditi:
  - what Step 3 showed (expected `0023`);
  - the Step 6 before/after counts;
  - the Step 11 `rows=` line;
  - which Step 12 checks passed, including 12e;
  - that the bastion is `stopped` again (Step 13).
- Aditi updates `session.md` and `CLAUDE.md` Session State to say the CAS import fixes and the 7 October changes are live on staging.

---

*Written 2026-10-06 from the repo at branch `feat/enhanced-ui` (working tree), plus the 2026-09-30 and 2026-10-01 guides, `infra/` and `scripts/clean-staging-db.sh`.*
- *Checked against the code:*
  - *the migration chain (`0020` → `0021` → `0022` → `0023` → `0025` … `0029`, no `0024`) and each migration's message;*
  - *the scheduler resource names and the `cron(15 6 * * ? *)` Asia/Kolkata schedule in `infra/modules/scheduler/main.tf`;*
  - *the job's log line in `backend/scripts/jobs/refresh_scheme_master_daily.py`;*
  - *`/dev/status` exists only when `ENVIRONMENT=staging` (`backend/app/api/dev_health.py`; the backend task sets `ENVIRONMENT=staging`);*
  - *no `requirements.txt`/`Dockerfile`/`package.json`/config change since the 2026-10-01 commit `892c85e`.*
- *`scripts/clean-staging-db.sh` was updated the same day: it now clears `household_member_merges` (it points at `users` without a cascade and would have stopped the wipe) and shows two more counts. Syntax-checked; not yet run against AWS.*
- *Local results: Postgres `tests/functional_postgres` 14 passed (0028↔0029 round trip clean); the synthetic gate (46 scenarios × normal/mfapi-blocked) and the two real CAMS statements pass. See `Docs/orchestration/2026-10-06-cas-import-baseline.md` "Phase 7 gate — FINAL".*
- *Updated 2026-10-07 for the 7 October changes (E): migration `0030` (checked against `backend/alembic/versions/0030_otp_request_consent_snapshot.py`; round-tripped on local Postgres 16.2), the Get OTP `422 consent_required` check (from `request_otp` in `backend/app/api/auth.py`) and checks 12e. The affected backend tests and the 22 affected frontend test files pass; `tsc -b` clean. Not yet checked in a browser.*
- *Updated 2026-10-07: the bastion is kept stopped, so Step 2 starts it (and waits for SSM `Online`) before the first tunnel, and Step 13 / the rollback stop it again.*
- *No command in this guide has been run against AWS.*
