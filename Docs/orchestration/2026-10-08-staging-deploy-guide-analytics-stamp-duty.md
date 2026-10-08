# Staging Deploy Guide — Analytics speed fix and stamp duty (8 Oct)

**One deploy that brings staging up to date** with branch `feat/enhanced-ui` after the 7 October CAS-fixes deploy.

Run it on **your manager's laptop**, as usual. It needs:
- WSL with `git`, `python3`, Docker Desktop, the AWS CLI and the Session Manager plugin;
- `terraform` and `psql`;
- the AWS credentials for account `811364789032`.

**No frontend change** in this deploy, so there's no `npm` build and no S3 upload.

**When:** between **09:00 and 18:30 IST**.
- Staging's RDS, backend and NAT are stopped every night from 21:00 to 05:00 IST.
- Scheduled jobs start their own tasks from the `:latest` image at 06:00, 06:15, **06:20 (new)**, 06:30, 08:00 and 19:00 IST, so keep clear of those times.

**The bastion is kept stopped.** Step 2 starts it before the first tunnel, and Step 12 stops it again at the end (the rollback path stops it too).

**Time:** about 75 minutes, plus the re-tests. Staging is **down for about 15 minutes**, from Step 5 to the end of Step 8.

**Nothing in this guide has been run against AWS yet.**
- It was written from the repo, the 7 October guide (`2026-10-07-staging-deploy-guide-cas-fixes.md`) and the infra code.
- Every expected output for a command that touches AWS is what the code says should happen.
- Where something can't be known in advance, the guide says so ("check before running").

---

## What ships

Plan: `Docs/superpowers/plans/2026-10-07-analytics-speed-and-stamp-duty.md`. Decisions: `decisions.md` "2026-10-07/08 — Analytics speed fix and stamp duty".

**A. Analytics is much faster** (it used to take 30–60+ minutes on staging):
- Analytics never downloads TER itself any more. Only the TER job writes TER.
- The TER job runs **daily at 06:20 IST** (it was monthly), renamed `ter-monthly` → **`ter-daily`**.
- TER is linked to each fund by **SEBI's scheme code**, by exact name, **never fuzzily**. On 7 October fuzzy matching gave about 1,040 funds another fund's TER (for example Kotak Business Cycle got Tata Business Cycle's), so this deploy **clears TER once** and rebuilds it.
- The 06:00 NAV job also warms the comparison funds (category peers) Analytics needs.
- A stuck Analytics run is retried after **15 minutes** (was 2 hours).
- NSE index history counts as fresh within 4 days, so Analytics doesn't re-download it every run.
- Migration **`0031`**: three nullable columns on `schemes` (`ter_scheme_code`, `ter_link_source`, `ter_linked_at`) and an index.

**B. Total Invested includes stamp duty**, so it equals the CAS's cost column:
- Stamp duty (0.005% since 1 July 2020) is attached to the purchase it was charged on.
- It counts in fund cost, cash flows, XIRR and the benchmark.
- On "CAS 10 Yr" the gap was ₹186; locally it now matches within ₹0.02.
- Migration **`0032`**: one nullable column, `transactions.stamp_duty NUMERIC(14,2)`.

**C. One Terraform change:** the `ter-monthly` schedule is replaced by `ter-daily`.

**D. The staging user data is wiped**, as decided. Data saved before `0032` isn't backfilled with stamp duty. Testers sign up again. Reference data (funds, NAVs, benchmarks) is kept, except TER, which Step 7 clears on purpose.

**No new secret, no new environment variable, and no `requirements.txt`, `Dockerfile` or `package.json` change.**

**Known and accepted** (`DEFERRED_FEATURES.md`):
- How long Analytics takes depends on mfapi.in on the day. The 06:00 job asks for ~1,500 comparison funds at once, and mfapi drops about a third. That fix (fewer at once, plus one retry) is deferred.
- A fund house that hasn't published this month's TER yet shows last month's TER. A fund whose name doesn't match AMFI's TER list exactly shows no TER ("TER Exclusions"). It never shows another fund's TER.

### Order of steps

| Step | What | Staging |
|---|---|---|
| 0 | Commit and push (Aditi) | up |
| 1 | Pre-flight: Postgres tests on the laptop | up |
| 2 | Connection values, **start the bastion**, the database tunnel | up |
| 3 | Which migration staging is on (expect `0030`) | up |
| 4 | Build the new backend image and save a rollback point (no push) | up |
| 5 | Stop the backend | **down** |
| 6 | Wipe the user data | down |
| 7 | Migrate to `0032`, then clear TER once | down |
| 8 | Push the image and start the new backend | down → **up** |
| 9 | Terraform: `ter-monthly` → `ter-daily` | up |
| 10 | Rebuild TER (two runs), check the links, then the checks | up |
| 11 | Re-tests on https://staging.unifolio.in | up |
| 12 | **Stop the bastion** | up |

---

## Step 0 — Commit and push (Aditi, on your machine)

```bash
git status --short
```

**Everything** for this release must be committed, **including untracked files** (lines starting `??`). Check these in particular:
- `backend/alembic/versions/0031_scheme_ter_link.py` and `0032_transaction_stamp_duty.py` (new)
- `backend/scripts/jobs/refresh_ter_daily.py` (new) and the **deletion** of `backend/scripts/jobs/refresh_ter_monthly.py`
- `infra/modules/scheduler/main.tf`
- `backend/app/…`, `backend/tests/…` (the changed files in `git status`)
- `Docs/CAS Files/synthetic/` (`gen_scenarios.py`, `gen_gate_scenarios.py`, `truth.json`, `harness/test_deep.py`, `harness/test_real_check.py`, the new `harness/tools/` folder)
- the docs: this guide, `decisions.md`, `DEFERRED_FEATURES.md`, `session.md`, `log.md`, `backend.md`, `database.md`, `CLAUDE.md`, `Docs/orchestration/…`, `Docs/superpowers/plans/2026-10-07-analytics-speed-and-stamp-duty.md`

**Never commit the real CAS statements:**
```bash
git status --short --untracked-files=all "Docs/CAS Files" | grep -i "\.pdf"
```
**Good looks like:** no output.

Then:
```bash
git add -A && git commit -m "..." && git push
git log -1 --format=%h
```
Tell your manager that commit hash.

**Also send your manager the regenerated synthetic statements.** They live outside the repo, in `Desktop\Unifolio\CAS Files\synthetic\`, and were **regenerated on 8 October**:
- they now print cost **including** stamp duty, like real CAMS;
- a bounced SIP is now handled like CAMS does.

The re-tests in Step 11 compare Total Invested with the statement's cost, so they need the new files. With the old ones, Total Invested is off by the stamp duty.

---

## Step 1 — Pre-flight on the laptop: Postgres tests

These run the migrations (now up to `0032`) and the Postgres-specific behaviour, including the partitioned `transactions` table, against a throwaway local Postgres. They passed on 8 October (43 passed, Postgres 16, round trip `0030 → 0032 → 0030 → 0032` clean). Re-run them on the exact commit you're deploying.

**1a.** Start Docker Desktop on Windows and wait for "Engine running".

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
  timeout 900 .venv/bin/python -m pytest -q --tb=short tests/functional_postgres tests/test_migrations.py
cd ..
docker compose stop postgres
```

**Good looks like:** the last line `43 passed in Ns` (N roughly 100–250). Warnings before it are fine.

**If it isn't good:**
- **Any `FAILED`:** stop. Send Aditi the output.
- **`skipped` instead of `passed`:** `TEST_DATABASE_URL=...` must be on the same command line as `pytest`.
- **`connection refused`:** Postgres isn't healthy yet. Check `docker compose ps`.

---

## Step 2 — Connection values, start the bastion, and the database tunnel

Exactly as in the 7 October guide (Step 2). These commands are read-only:
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
**Good looks like:** `"Account": "811364789032"`, then a bastion id (`i-...`), the `staging-rds....` hostname and `unifolio`.

**Start the bastion** (same terminal):
```bash
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
**Good looks like:** `pending` (or `running`), then `running; waiting for SSM...`, then `bastion ready` within 1–3 minutes. If the loop runs over 5 minutes, see the 7 October guide, Step 2, "If it isn't good".

**Terminal A:** the tunnel on local port **5434**. Leave it open.
```bash
aws ssm start-session \
  --target "$BASTION_ID" \
  --document-name AWS-StartPortForwardingSessionToRemoteHost \
  --parameters "{\"host\":[\"$DB_HOST\"],\"portNumber\":[\"5432\"],\"localPortNumber\":[\"5434\"]}"
```
**Good looks like:** `Port 5434 opened ...`, `Waiting for connections...`. If `$BASTION_ID`/`$DB_HOST` are empty in this terminal, re-run the values block above in it.

**Terminal B:** the password goes into an environment variable. Never type it: it contains `$` characters.
```bash
export PGPASSWORD=$(aws secretsmanager get-secret-value \
  --secret-id "$(aws secretsmanager list-secrets --query "SecretList[?starts_with(Name, 'rds!db-')].Name" --output text)" \
  --query SecretString --output text | python3 -c "import json,sys; print(json.load(sys.stdin)['password'])")
cd "$REPO_ROOT/backend"      # or the full path to MVP_V1_MF_only/backend
export DATABASE_URL="postgresql://unifolio:$(python3 -c "import os,urllib.parse; print(urllib.parse.quote_plus(os.environ['PGPASSWORD']))")@localhost:5434/unifolio"
```
**Good looks like:** no output.

---

## Step 3 — Which migration is staging on? (Terminal B)

```bash
.venv/bin/alembic current
```

| Shows | Means | Rollback revision `R` |
|---|---|---|
| `0030` | **Expected.** The 7 October deploy is live. | `0030` |
| `0031` or `0032` | Part of this deploy has already run. Stop and ask Aditi. | — |
| Anything older than `0030` | The 7 October deploy isn't (fully) live. Stop and ask Aditi. | — |

The `INFO ... Context impl PostgresqlImpl.` line before it is normal.

---

## Step 4 — Build the image and save a rollback point (nothing changes on AWS yet)

**Terminal C:**
```bash
cd "$REPO_ROOT/backend"
docker build -t unifolio-staging-backend .
```
**Good looks like:** the build ends with `naming to docker.io/library/unifolio-staging-backend`. If it fails with `failed to xattr .pytest_tmp: permission denied`, run `sudo rm -rf .pytest_tmp pytest_tmp` and retry.

**Rollback point: tag the image that's running now.**
```bash
MANIFEST=$(aws ecr batch-get-image --repository-name unifolio-staging-backend --region ap-south-1 \
  --image-ids imageTag=latest --query 'images[0].imageManifest' --output text)
aws ecr put-image --repository-name unifolio-staging-backend --region ap-south-1 \
  --image-tag pre-analytics-stamp-duty --image-manifest "$MANIFEST" --query 'image.imageId' --output json
```
**Good looks like:** JSON with `"imageTag": "pre-analytics-stamp-duty"`. `ImageAlreadyExistsException` is fine. Any other error: stop, because there would be no clean rollback.

**Log in to ECR and tag the new image. Don't push yet.**
```bash
aws ecr get-login-password --region ap-south-1 | \
  docker login --username AWS --password-stdin 811364789032.dkr.ecr.ap-south-1.amazonaws.com
docker tag unifolio-staging-backend:latest \
  811364789032.dkr.ecr.ap-south-1.amazonaws.com/unifolio-staging-backend:latest
```
**Good looks like:** `Login Succeeded`.

**Why wait:** pushing `:latest` before the migrations would let any task that starts (a restart or a scheduled job) run the new code on the old schema. The new code reads `transactions.stamp_duty` and `schemes.ter_scheme_code`, which don't exist until Step 7.

---

## Step 5 — Start the window: stop the backend

> **Staging is down from here until Step 8 finishes (about 15 minutes).** Tell the testers.

```bash
aws ecs update-service --cluster unifolio-staging --service unifolio-staging-backend \
  --desired-count 0 --query "service.desiredCount" --output text
watch -n 5 'aws ecs describe-services --cluster unifolio-staging --services unifolio-staging-backend \
  --query "services[0].{running:runningCount,desired:desiredCount}"'
```
**Good looks like:** `0`, then `running` reaches `0` within about a minute. Then Ctrl+C.

---

## Step 6 — Wipe the user data

This deletes every staging account, member, import, transaction, folio and history row. Reference data (funds, NAVs, TER, AAUM, benchmarks, the ARN directory, scores) is kept. Consent records are kept on purpose.

**Terminal C**, from the repo root:
```bash
cd "$REPO_ROOT"
./scripts/clean-staging-db.sh
```
The script opens its own tunnel on port 5439 and runs everything in one transaction.

**Good looks like:**
1. `Bastion: i-...` and `RDS endpoint: staging-rds....`.
2. `=== BEFORE ===` with row counts. Write down `users` and `transactions`.
3. `=== RUNNING CLEANUP ===`: `BEGIN`, `DELETE n` lines, `COMMIT`.
4. `=== AFTER (user-domain, should be all 0) ===`: every count `0`.
5. `=== AFTER (reference data, should remain intact) ===`: non-zero counts as before, including `scheme_ter`. Step 7 clears that one.
6. `Done.`

**If it isn't good:**
- **Any `ERROR:` line before `COMMIT`:** nothing was deleted. Send the error. You can still continue, but the re-tests then run on top of old data, so tell Aditi.
- **`Could not find a running 'staging-bastion' instance`:** re-run the "Start the bastion" block from Step 2, then the script.
- **`psql: command not found`:** `sudo apt-get install -y postgresql-client`, then re-run.

---

## Step 7 — Migrate to `0032`, then clear TER once (Terminal B, tunnel open in Terminal A)

```bash
.venv/bin/alembic upgrade head
.venv/bin/alembic current
```
**Good looks like:**
```
INFO  [alembic.runtime.migration] Running upgrade 0030 -> 0031, schemes.ter_scheme_code: link to the SEBI scheme code in AMFI's TER feed (8 Oct)
INFO  [alembic.runtime.migration] Running upgrade 0031 -> 0032, transactions.stamp_duty: stamp duty charged on a purchase (7 Oct)
```
Then `0032 (head)`. Both are quick: they only add nullable columns. On Postgres, `0032` adds the column to the partitioned `transactions` table and every partition at once, without rewriting rows.

**Sanity check, then clear TER once:**
```bash
.venv/bin/python - <<'EOF'
import os, sqlalchemy as sa
q = lambda c, s: c.execute(sa.text(s)).scalar()
with sa.create_engine(os.environ["DATABASE_URL"]).begin() as c:
    print("schemes TER-link columns:", q(c, "SELECT count(*) FROM information_schema.columns WHERE table_name='schemes' AND column_name IN ('ter_scheme_code','ter_link_source','ter_linked_at')"))
    print("transactions.stamp_duty on parent + partitions:", q(c, "SELECT count(*) FROM pg_attribute a JOIN pg_class t ON t.oid=a.attrelid WHERE a.attname='stamp_duty' AND NOT a.attisdropped AND t.relname LIKE 'transactions%'"))
    print("users left:", q(c, "SELECT count(*) FROM users"))
    # The 7 October run saved ~1,040 wrong (fuzzy-matched) TERs. Cleared once; Step 10 rebuilds TER by SEBI code.
    print("scheme_ter rows cleared:", c.execute(sa.text("DELETE FROM scheme_ter")).rowcount)
EOF
```
**Good looks like:**
```
schemes TER-link columns: 3
transactions.stamp_duty on parent + partitions: 9
users left: 0
scheme_ter rows cleared: <a number in the thousands>
```
- `9` is the parent table plus 8 yearly partitions, which is what local Postgres had. A different number above 1 is fine if staging has another number of partitions; `0` or `1` is not.
- Check before running: the exact `scheme_ter` count depends on what earlier runs saved.

**If `upgrade` fails:** each migration runs in its own transaction, so the database stays at the last one that worked. Copy the full error, don't retry, and go to **"If something goes wrong" → backend rollback**.

Leave the tunnel open: Step 10 uses it again.

---

## Step 8 — Push the image and start the new backend (Terminal C)

```bash
docker push 811364789032.dkr.ecr.ap-south-1.amazonaws.com/unifolio-staging-backend:latest
aws ecs update-service --cluster unifolio-staging --service unifolio-staging-backend \
  --desired-count 1 --force-new-deployment --query "service.deployments[0].status" --output text
```
**Good looks like:** a push ending in `latest: digest: sha256:...`, then `PRIMARY`. If the authorization token expired, re-run the `docker login` line from Step 4 and push again.

Watch it:
```bash
watch -n 5 'aws ecs describe-services --cluster unifolio-staging --services unifolio-staging-backend \
  --query "services[0].{running:runningCount,desired:desiredCount,rollout:deployments[0].rolloutState}"'
aws logs tail /ecs/staging-backend --follow
```
**Good looks like:**
- `rollout` goes `IN_PROGRESS` → `COMPLETED` (3–6 minutes);
- `running` equals `desired`;
- the logs show `Application startup complete.`, with no traceback.

Then:
```bash
curl -s https://staging-api.unifolio.in/health
```
**Good looks like:** `{"status":"ok"}`.

**If the task keeps restarting:** a traceback about a missing column (`stamp_duty`, `ter_scheme_code`) means the database isn't at `0032 (head)`. Re-check Step 7, or roll back.

**The window ends here.**

---

## Step 9 — Terraform: `ter-monthly` → `ter-daily`

`terraform.tfvars` must be the one the 7 October apply used: it holds the live email/SES settings.
```bash
cd "$REPO_ROOT/infra/envs/staging"
ls terraform.tfvars && grep -c "=" terraform.tfvars
SECRET_JSON=$(aws secretsmanager get-secret-value --secret-id unifolio-staging-pan-keys --query SecretString --output text)
export TF_VAR_pan_encryption_key=$(echo "$SECRET_JSON" | python3 -c "import json,sys; print(json.load(sys.stdin)['PAN_ENCRYPTION_KEY'])")
export TF_VAR_pan_lookup_pepper=$(echo "$SECRET_JSON" | python3 -c "import json,sys; print(json.load(sys.stdin)['PAN_LOOKUP_PEPPER'])")
terraform plan -out=ter-daily.tfplan
```
**Good looks like** these resources, and nothing else:
```
  # module.scheduler.aws_cloudwatch_log_group.jobs["ter_daily"] will be created
  # module.scheduler.aws_cloudwatch_log_group.jobs["ter_monthly"] will be destroyed
  # module.scheduler.aws_ecs_task_definition.jobs["ter_daily"] will be created
  # module.scheduler.aws_ecs_task_definition.jobs["ter_monthly"] will be destroyed
  # module.scheduler.aws_iam_role_policy.scheduler will be updated in-place
  # module.scheduler.aws_scheduler_schedule.jobs["ter_daily"] will be created
  # module.scheduler.aws_scheduler_schedule.jobs["ter_monthly"] will be destroyed

Plan: 3 to add, 1 to change, 3 to destroy.
```
- The in-place policy update swaps the old job's task definition for the new one in the list the scheduler may run.
- Destroying the old log group deletes the old monthly job's logs. That's expected.
- If you see `4 to add` with `aws_sns_topic_subscription.ops_alerts_email[...] will be created`, that's fine. AWS deletes an unconfirmed email subscription after 3 days, as on 7 October.
- `data "aws_iam_policy_document" "scheduler" will be read during apply` and the "deprecated" warnings are normal.

**If the plan shows anything else:** anything else changing or being destroyed (especially the backend task definition, RDS, the `ses`/email variables or the bastion) means stop. Don't apply; send the full plan to Aditi. Everything else in this guide works without Step 9. Without it, the daily TER refresh simply doesn't run until the apply is done.

**Apply** (only if the plan matched):
```bash
terraform apply ter-daily.tfplan
aws scheduler get-schedule --name unifolio-staging-job-ter-daily \
  --query "{state:State,cron:ScheduleExpression,tz:ScheduleExpressionTimezone}"
```
**Good looks like:** `Apply complete! Resources: 3 added, 1 changed, 3 destroyed.` (or `4 added`), then:
```
{ "state": "ENABLED", "cron": "cron(20 6 * * ? *)", "tz": "Asia/Kolkata" }
```

**Then delete the saved plan.** A saved plan stores every variable's value in readable form, including the PAN key and pepper exported above:
```bash
rm -f ter-daily.tfplan scheme-master.tfplan
unset TF_VAR_pan_encryption_key TF_VAR_pan_lookup_pepper SECRET_JSON
```

---

## Step 10 — Rebuild TER (two runs) and check the links

TER was cleared in Step 7. It's rebuilt in two runs:
1. **September first.** AMFI fills each month gradually as fund houses file. On 8 October, HDFC, Kotak and Nippon hadn't filed October yet. September's feed is complete, so this run links every fund it can and saves a TER for everyone.
2. **Then the latest month.** That adds October's TER where it's published already; the others keep September's.

**Terminal C:**
```bash
cd "$REPO_ROOT/infra/envs/staging"
SUBNETS=$(terraform output -json networking | python3 -c "import json,sys; print(','.join(json.load(sys.stdin)['private_app_subnet_ids']))")
ECS_SG=$(terraform output -json networking | python3 -c "import json,sys; print(json.load(sys.stdin)['ecs_security_group_id'])")
run_ter() {   # $1 = extra args as a JSON list, e.g. '["--month","09-2026"]' or '[]'
  TASK_ARN=$(aws ecs run-task --cluster unifolio-staging \
    --task-definition unifolio-staging-job-ter-daily --launch-type FARGATE \
    --network-configuration "awsvpcConfiguration={subnets=[$SUBNETS],securityGroups=[$ECS_SG],assignPublicIp=DISABLED}" \
    --overrides "{\"containerOverrides\":[{\"name\":\"staging-job-ter-daily\",\"command\":$(python3 -c "import json,sys; print(json.dumps(['python','scripts/jobs/refresh_ter_daily.py']+json.loads(sys.argv[1])))" "$1")}]}" \
    --query "tasks[0].taskArn" --output text)
  echo "$TASK_ARN"
  aws ecs wait tasks-stopped --cluster unifolio-staging --tasks "$TASK_ARN"
  aws ecs describe-tasks --cluster unifolio-staging --tasks "$TASK_ARN" --query "tasks[0].containers[0].exitCode"
  aws logs tail /ecs/staging-job-ter-daily --since 20m | grep "refresh_ter"
}
run_ter '["--month","09-2026"]'
```
**Good looks like:** a task ARN, then after a few minutes `0` and a line like:
```
refresh_ter_daily: success=True month=09-2026 schemes=… matched=… no_match=… new_links=… seconds=…
```
- `schemes` is about 8,600 (Direct and Regular plans; 8,661 on 8 October).
- `new_links` is several thousand (7,041 links on 8 October locally, made from the then-partial October feed; September's complete feed may give more).
- `matched` is close to `new_links`.
- Check before running: the exact numbers depend on that day's AMFI feed.

**If it isn't good:**
- **`success=False`:** AMFI's TER site timed out (it serves about 600 pages). Wait five minutes and re-run `run_ter '["--month","09-2026"]'`. It's safe to re-run.
- **`waiter TasksStopped failed: Max attempts exceeded`:** the run took over 10 minutes. Re-run just the `aws ecs wait ...` line, then the last two lines.
- **A timeout to `portal.amfiindia.com`:** the NAT may not be up yet. Wait five minutes and retry.

**Then the latest month:**
```bash
run_ter '[]'
```
**Good looks like:** `0` and `refresh_ter_daily: success=True month=10-2026 …` with a small `new_links` (often `0`).

**Check that no fund borrowed another fund house's TER** (Terminal B, tunnel open):
```bash
.venv/bin/python - <<'EOF'
import os, sqlalchemy as sa
with sa.create_engine(os.environ["DATABASE_URL"]).connect() as c:
    print("linked schemes:", c.execute(sa.text("SELECT count(*) FROM schemes WHERE ter_scheme_code IS NOT NULL")).scalar())
    print("codes shared across fund houses:", c.execute(sa.text(
        "SELECT count(*) FROM (SELECT ter_scheme_code FROM schemes WHERE ter_scheme_code IS NOT NULL "
        "GROUP BY 1 HAVING count(DISTINCT amc_name) > 1) x")).scalar())
    print("TER rows by month:", c.execute(sa.text(
        "SELECT reference_period, count(*), count(ter_value) FROM scheme_ter GROUP BY 1 ORDER BY 1")).all())
EOF
```
**Good looks like:**
- `linked schemes`: several thousand (the `new_links` total from both runs).
- `codes shared across fund houses: 0`. This is the check that the Kotak → Tata problem is gone.
- `TER rows by month`: a September row and an October row. In each, the second number (rows with a TER value) is smaller than the first, because unlinked funds get an empty row on purpose.

**If `codes shared across fund houses` isn't `0`:** don't fix anything by hand. Send the number to Aditi; Analytics still works.

**No need to run the NAV job now.** It warms comparison funds for the categories people **hold**, and after the wipe nobody holds anything. It runs on its own at 06:00 IST.

---

## Step 11 — Re-tests on https://staging.unifolio.in

These are the checks this deploy affects. Use the **new synthetic statements** from Step 0 (password `MF@123`) and the real statements as before.

**11a. Real statements: Total Invested equals the statement** (the 7 October 12b rows A1 and A2)

For each file: sign up with a new phone number and the investor's own name, upload, press **Confirm imports**, then open the dashboard.

| Check | File | Expected |
|---|---|---|
| A1 | `CAS_01042016-23092026_CP225296748_….pdf` | Total Invested equals the sum of the statement's "Cost" column for the open funds, within ₹1 |
| A2 | `CAS 10 Yr.pdf` | Total Invested **₹37,22,637** (±₹1), the same as the statement's total cost. It used to show ₹37,22,451. |

**11b. Analytics loads, and how long it takes** (C2/C6/D2, on the `p20_20yr` synthetic account, investor `VIKRAM ANAND MEHTA`)

1. Sign up, upload `p20_20yr.pdf`, press **Confirm imports**. Note the time.
2. Open **Analytics**. It shows "calculating" first, then every section: Allocation, TER, Direct vs Regular, Benchmark, Category ranking, Score.
3. Note the time when the last section appears. That's the **first (cold) run**. The comparison funds' NAVs aren't cached yet after the wipe, so this one downloads them itself.

To get the exact run time (Terminal C):
```bash
FAM=unifolio-staging-backend-analytics-recompute
for t in $(aws ecs list-tasks --cluster unifolio-staging --family $FAM --desired-status STOPPED --query "taskArns[]" --output text); do
  aws ecs describe-tasks --cluster unifolio-staging --tasks $t \
    --query "tasks[0].{created:createdAt,started:startedAt,stopped:stoppedAt,exit:containers[0].exitCode}" --output json
done
aws logs tail /ecs/staging-analytics-recompute --since 30m | grep -E "warm_nav_history|category_ranking|Traceback|ERROR" | tail -20
```
- `stopped − created` is the whole run, including about 30–60 s for AWS to start the container.
- `exit` should be `0`.
- The `warm_nav_history` lines show how many comparison funds were downloaded and how long that took.

**Expected (estimates, not measured on staging yet):**
- **First (cold) run** on `p20_20yr`: a few minutes, possibly up to ~10 (it downloads ~1,500 comparison funds itself).
- **A later run** (the next morning's 06:30 run, or a second upload the next day after the 06:00 NAV job): about **1–6 minutes**, mostly 1–3, depending on mfapi.in that day.
- A typical real household: about **1–2 minutes**.
- Before this deploy: 30–60+ minutes.
- Anything over **15 minutes** means stop and send the logs: the run would be treated as stuck.

Then the screens (screenshots named as before):

| Check | Expected now |
|---|---|
| C2 dashboard | value about ₹20 Cr; a Realised gain block and a "Sold funds" section; Today’s gain; Current XIRR about 15.5%, Lifetime about 14.7%. **Total Invested equals the statement's total cost (±₹1)** |
| C6 distributor + analytics | no-ARN Regular folios labelled "Regular (no ARN on statement)"; per-fund "Saves x% a year vs Regular"; **Analytics loaded, every section filled** |
| D2 TER card | "Direct Plans TER x%" and "Regular Plans TER y%" with bars; no green "Save ~…% per year with Direct" text; a missing value shows "—", not ₹0. **No fund shows another fund house's TER.** |
| TER Exclusions | a short list is fine (funds whose name differs from AMFI's TER list, or whose house hasn't filed). It must not list most of your funds. |

**11c. Send to Aditi**
- A1 and A2 results (Total Invested vs the statement), counts only;
- the 11b run times (cold and, the next day, warm) and the `exit` codes;
- the C2, C6 and D2 screenshots;
- the Step 10 `refresh_ter_daily` lines and the link check numbers;
- any failure, with the time and an `aws logs tail /ecs/staging-backend --since 30m` excerpt.

---

## Step 12 — Stop the bastion

After the Step 10 checks (and any database re-check), close every tunnel first (Ctrl+C in Terminal A).
```bash
aws ec2 stop-instances --instance-ids "$BASTION_ID" \
  --query "StoppingInstances[0].CurrentState.Name" --output text
aws ec2 wait instance-stopped --instance-ids "$BASTION_ID"
aws ec2 describe-instances --instance-ids "$BASTION_ID" \
  --query "Reservations[0].Instances[0].State.Name" --output text
```
**Good looks like:** `stopping`, then `stopped`. If `$BASTION_ID` is empty in this terminal, re-run the values block at the top of Step 2 first.

---

## If something goes wrong

### Backend rollback (the new backend crash-loops or misbehaves)

The old image runs fine on the new schema: `0031` and `0032` only add nullable columns the old code ignores. So a rollback **doesn't need a downgrade**:

1. **Put the old image back and restart:**
```bash
MANIFEST=$(aws ecr batch-get-image --repository-name unifolio-staging-backend --region ap-south-1 \
  --image-ids imageTag=pre-analytics-stamp-duty --query 'images[0].imageManifest' --output text)
aws ecr put-image --repository-name unifolio-staging-backend --region ap-south-1 \
  --image-tag latest --image-manifest "$MANIFEST" --query 'image.imageId' --output json
aws ecs update-service --cluster unifolio-staging --service unifolio-staging-backend \
  --desired-count 1 --force-new-deployment --query "service.deployments[0].status" --output text
```
**Good looks like:** JSON with `"imageTag": "latest"`, then `PRIMARY`. Watch it as in Step 8.

2. **If Step 9 was applied**, the old image has no `refresh_ter_daily.py`, so the new 06:20 job would fail every morning. That's harmless but noisy. Revert the schedule by checking out the previous `infra/modules/scheduler/main.tf` and re-running Step 9's plan/apply (expect the mirror image: `3 to add, 1 to change, 3 to destroy`).

3. **TER is empty** until a TER job runs, because Step 7 cleared it. Be aware that the old image's Analytics refreshes TER **itself** again. That's the old, slow (30+ minute), fuzzy-matching behaviour this deploy removes, so it will save wrong TERs again. A rollback is a stop-gap only; tell Aditi straight away.

4. **Only if you must go back to `0030`** (not normally needed): with the backend stopped and the tunnel open, `.venv/bin/alembic downgrade 0030`. That drops `transactions.stamp_duty` and the three `schemes` columns, and loses no user data, because staging was wiped. **Never go below `0030`.**

5. **Stop the bastion** as in Step 12.

### The TER job keeps failing (Step 10)

Nothing else is affected. Analytics shows "—" for TER until a run succeeds, and the job runs on its own at 06:20 IST every day. Send the log (`aws logs tail /ecs/staging-job-ter-daily --since 30m`).

### Terraform plan doesn't match (Step 9)

Don't apply. Everything else works. Only the daily TER refresh is missing: run Step 10 using the **nav-daily** task with an override instead, and send Aditi the plan:
```bash
aws ecs run-task --cluster unifolio-staging --task-definition unifolio-staging-job-nav-daily --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[$SUBNETS],securityGroups=[$ECS_SG],assignPublicIp=DISABLED}" \
  --overrides '{"containerOverrides":[{"name":"staging-job-nav-daily","command":["python","scripts/jobs/refresh_ter_daily.py","--month","09-2026"]}]}' \
  --query "tasks[0].taskArn" --output text
```
Its log goes to `/ecs/staging-job-nav-daily`. Run it again without `"--month","09-2026"` afterwards.

---

## After it's green

- Tell Aditi:
  - what Step 3 showed (expected `0030`);
  - the Step 6 before/after counts;
  - the Step 10 `refresh_ter_daily` lines and link check;
  - the Step 11 results and run times;
  - that the bastion is `stopped` again (Step 12).
- Aditi updates `session.md` and `CLAUDE.md` Session State to say the analytics speed fix and stamp duty are live on staging.
- The next morning, check the 06:20 job ran on its own:
```bash
aws logs tail /ecs/staging-job-ter-daily --since 6h | grep refresh_ter_daily
```
  Expect `success=True`.

---

*Written 2026-10-08 from the repo at branch `feat/enhanced-ui` (working tree), the 7 October guide, `infra/` and `scripts/clean-staging-db.sh`.*
- *Checked against the code:*
  - *the migration chain `0030` → `0031` → `0032` and both migrations' messages;*
  - *the scheduler's `ter_daily` job (slug `ter-daily`, `cron(20 6 * * ? *)`, Asia/Kolkata) and the IAM policy that lists each job's task definition (hence `1 to change`);*
  - *the job's `--month MM-YYYY` argument and its log line in `backend/scripts/jobs/refresh_ter_daily.py`;*
  - *the Analytics task family and log group in `infra/modules/backend/main.tf`.*
- *Local results (8 Oct):*
  - *592 affected backend tests pass;*
  - *Postgres round trip `0030 → 0032 → 0030 → 0032` clean, and 43 Postgres/migration tests pass;*
  - *the synthetic gate passes 88/88;*
  - *real "CAS 10 Yr" Total Invested equals the CAS cost within ₹0.02;*
  - *the final independent review approved, with its fixes made.*
- *No command in this guide has been run against AWS.*
