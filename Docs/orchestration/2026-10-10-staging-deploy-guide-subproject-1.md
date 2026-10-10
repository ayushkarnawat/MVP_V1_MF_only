# Staging Deploy + QA Guide — Sub-project 1 analytics (A14, A12, A09, A04, A11)

**One deploy that brings staging up to date** with branch `feat/enhanced-ui` after the 8 October deploy (analytics speed fix + stamp duty, migration `0032`, plus the blank-plan hotfix).

Part 1 is the deploy (your manager runs it). Part 2 is the QA you run on https://staging.unifolio.in afterwards. Part 3 is the next-day and first-month checks.

Run Part 1 on **your manager's laptop**, as usual. It needs:
- WSL with `git`, `python3`, Docker Desktop, the AWS CLI and the Session Manager plugin;
- `terraform`, `psql` and `node`/`npm`;
- the AWS credentials for account `811364789032`;
- the **11 factsheet PDFs** from Step 0b.

**When:** start by **10:00 IST** on a weekday.
- Staging's RDS, backend and NAT stop every night from 21:00 to 05:00 IST.
- Scheduled jobs start their own tasks from `:latest` at 06:00, 06:15, 06:20, 06:30, 08:00 and 19:00 IST. Keep clear of those.
- The one-off NAV backfill (Step 12b) runs for a long time and must finish before 21:00.

**The bastion is kept stopped.** Step 2 starts it; Step 15 stops it (the rollback path stops it too).

**Time:** about 3–4 hours, most of it waiting on Step 12. Staging is **down for about 20 minutes**, from Step 5 to the end of Step 9.

**Nothing in this guide has been run against AWS yet.**
- It was written from the repo, the 8 October guide (`2026-10-08-staging-deploy-guide-analytics-stamp-duty.md`) and the infra code.
- Expected outputs for AWS commands are what the code says should happen.
- Numbers marked **[close-out]** are still being measured locally (A04/A11 close-out). This guide is updated with them before you run it. Don't run it until that's done.

---

## What ships

Plans: `Docs/superpowers/plans/2026-10-0{8,9}-attribute-*.md` (each has its rulings block at the top). Handoffs: `Docs/orchestration/a1{4,2}-*`, `a09-*`, `a04-*`, `a11-*-handoff.md`.

| | What users see | Backend / data |
|---|---|---|
| **Import flow** (Phase 7 Task 3, committed 8 Oct, not deployed yet) | No Import Review screen: upload → confirm people → dashboard | Frontend only |
| **A14 Investment & withdrawal** | New Analytics section: money in vs out by year | Computed in Analytics |
| **A12 Benchmark TRI** | Benchmark comparison uses Nifty **Total Return** indices (dividends reinvested), never price | Migration **`0033`**: `benchmark_index_history.return_type` (`price`/`tri`). The 06:00 benchmark job fetches TRI from 1990 |
| **A09 Fund ranking** | New Analytics section: each fund's 5-factor rank in its SEBI category, with neighbours | Migration **`0034`**: `scheme_rankings`, `ranking_weights` (1 seeded row). Filled by Analytics itself |
| **A04 Fund managers** | New Analytics section: manager cards with the household's money per manager, roles, "managing since" | Migration **`0035`**: `scheme_fund_managers`. New **monthly job** (10th, 06:00 IST) for 40 fund houses; **10 imported by hand** (Step 13); 5 show "not available yet" |
| **A11 Scenarios** | New **Scenarios** tab (desktop + mobile): what past crashes/events would have done to this portfolio | Migrations **`0036`** (tables) + **`0037`** (34 scenarios, 45 hypothetical assumptions). One-off NAV backfill + compute (Step 12). Ongoing scenarios refresh in the 06:00 NAV job. **Hypotheticals stay hidden** (`SCENARIO_HYPOTHETICALS_ENABLED` unset = off) |

**Infra:** one Terraform change: the `fund-managers-monthly` job (**2 GB** memory; the other jobs keep 1 GB), plus a CloudWatch metric filter and alarm on its `FUND_MANAGER_ALERT` lines (emails the ops-alerts topic). Locally the full 40-fund-house run peaked at 937 MB (HSBC's factsheet alone holds ~600 MB), too close to 1 GB.

**No new secret, no new environment variable, and no `requirements.txt`, `Dockerfile` or `package.json` change** since 8 October (checked with `git log`).

**Known and accepted:**
- 10 fund houses need a monthly hand import, and 5 have no factsheet at all. Full story and options: `Docs/orchestration/subproject1-execution/a04-factsheet-access-gaps.html`.
- The 40 automatic fund houses were verified from a normal network, not from AWS. Some may refuse AWS addresses. Step 12d tells you which.
- Nobody has looked at the Scenarios screen in a real browser yet (tests only). Part 2 does that.
- `GET /scenarios/{id}` does its database work on the event loop (same pattern as older code). Fine at staging load.

### Order of steps

| Step | What | Staging |
|---|---|---|
| 0 | Commit and push; collect the 11 factsheets (Aditi) | up |
| 1 | Pre-flight: Postgres tests on the laptop | up |
| 2 | Connection values, **start the bastion**, the database tunnel | up |
| 3 | Which migration staging is on (expect `0032`) | up |
| 4 | Build the image, save rollback points (no push) | up |
| 5 | Stop the backend | **down** |
| 6 | Wipe the user data (**only with Aditi's OK**) | down |
| 7 | Migrate to `0037` and sanity-check | down |
| 8 | Push the image and start the new backend | down → **up** |
| 9 | Build and publish the frontend (right away) | up |
| 10 | Terraform: the `fund-managers-monthly` job + alarm | up |
| 11 | Confirm the ops-alerts email subscription | up |
| 12 | Data: benchmark TRI → NAV backfill → compute scenarios → fund-manager job | up |
| 13 | Hand-import the 10 fund houses' factsheets | up |
| 14 | Database checks | up |
| 15 | **Stop the bastion** | up |
| — | Part 2: QA on staging (testers) | up |

---

# Part 1 — Deploy

## Step 0 — Commit, push, and collect the factsheets (Aditi)

**0a. Commit and push**
```bash
git status --short
```
Everything for this release must be committed, including untracked files (`??`). In particular:
- `backend/alembic/versions/0033_*.py` … `0037_*.py`;
- `backend/scripts/jobs/refresh_fund_managers_monthly.py`, `import_manual_fund_managers.py`, `backfill_scheme_nav_history.py`, `backend/scripts/compute_all_scenarios.py`;
- `backend/tests/fixtures/factsheets/` (small text excerpts only);
- `infra/modules/scheduler/main.tf`;
- `frontend/src/features/scenarios/`.

**Never commit factsheet PDFs or CAS statements:**
```bash
git status --short --untracked-files=all | grep -i "\.pdf"
```
**Good looks like:** no output. Then `git add -A && git commit -m "..." && git push` and send the manager `git log -1 --format=%h`.

**0b. Collect the 11 factsheets for the hand import (Step 13)**

Download each in a normal browser **on the deploy day or the day before**, always the newest month. The import refuses a file whose "as on" date is more than **45 days** old, so August files stop working after 15 October.

| Fund house | Where | File(s) |
|---|---|---|
| HDFC | hdfcfund.com → Downloads → Monthly factsheet | **Two**: the active factsheet and the passive (index/ETF) factsheet |
| ICICI Prudential | icicipruamc.com → Downloads → Factsheet | The complete factsheet (one file, active + passive) |
| Kotak Mahindra | kotakmf.com → Forms & Downloads → Factsheet | Monthly factsheet |
| Axis | axismf.com → Downloads → Factsheet | Monthly factsheet (includes ETFs/index funds) |
| Bandhan | bandhanmutual.com → Downloads → Factsheets | Monthly factsheet (one file, includes ETFs) |
| Invesco | invescomutualfund.com → Literature & Forms → Factsheets | Monthly factsheet |
| WhiteOak Capital | whiteoakamc.com → Downloads | Monthly factsheet |
| ITI | itiamc.com → Downloads → Factsheet | Monthly factsheet |
| JM Financial | jmfinancialmf.com → Downloads → Factsheet | Monthly factsheet |
| Trust | trustmf.com → Downloads → Factsheet | Monthly factsheet |

Rename them `hdfc_active.pdf`, `hdfc_passive.pdf`, `icici.pdf`, `kotak.pdf`, `axis.pdf`, `bandhan.pdf`, `invesco.pdf`, `whiteoak.pdf`, `iti.pdf`, `jm.pdf`, `trust.pdf` and send them to the manager. They go in `~/factsheets/` on the laptop. **Never in the repo.**

The synthetic CAS statements for QA are **in the repo** now (`Docs/CAS Files/synthetic/pdfs/realistic/`, password `MF@123`), so nothing to send.

---

## Step 1 — Pre-flight on the laptop: Postgres tests

These run every migration (now up to `0037`) and the Postgres-specific tests against a throwaway local Postgres. Locally on 10 October, `0035 → 0037 → 0035 → 0037` round-tripped clean (with `text[]` and `numeric(10,2)` columns and 34 scenarios / 45 assumptions seeded).

```bash
cd MVP_V1_MF_only
git checkout feat/enhanced-ui && git pull
git log -1 --format=%h        # expected: the hash Aditi sent
git status --short            # expected: empty
docker compose down
docker compose up -d postgres
docker compose ps             # wait for "healthy"
cd backend
python3 -m venv .venv 2>/dev/null; .venv/bin/pip install -q -r requirements.txt
TEST_DATABASE_URL=postgresql+psycopg2://unifolio:unifolio@localhost:5433/unifolio_test \
  timeout 1200 .venv/bin/python -m pytest -q --tb=short tests/functional_postgres tests/test_migrations.py
cd ..
docker compose stop postgres
```
**Good looks like:** the last line `N passed` with **no `failed` and no `skipped`**. **[close-out]** fills in N.

**If it isn't good:** any `FAILED` → stop and send Aditi the output. `skipped` → `TEST_DATABASE_URL=...` must be on the same line as `pytest`.

---

## Step 2 — Connection values, start the bastion, and the database tunnel

Exactly as the 8 October guide, Step 2:
```bash
aws sts get-caller-identity
cd infra/envs/staging
terraform init
REPO_ROOT=$(git rev-parse --show-toplevel)
BASTION_ID=$(terraform output -json networking | python3 -c "import json,sys; print(json.load(sys.stdin)['bastion_instance_id'])")
DB_HOST=$(terraform output -raw db_address)
DB_NAME=$(terraform output -raw db_name)
SUBNETS=$(terraform output -json networking | python3 -c "import json,sys; print(','.join(json.load(sys.stdin)['private_app_subnet_ids']))")
ECS_SG=$(terraform output -json networking | python3 -c "import json,sys; print(json.load(sys.stdin)['ecs_security_group_id'])")
echo "$BASTION_ID $DB_HOST $DB_NAME"

aws ec2 start-instances --instance-ids "$BASTION_ID" --query "StartingInstances[0].CurrentState.Name" --output text
aws ec2 wait instance-running --instance-ids "$BASTION_ID"
until [ "$(aws ssm describe-instance-information --filters "Key=InstanceIds,Values=$BASTION_ID" \
          --query "InstanceInformationList[0].PingStatus" --output text)" = "Online" ]; do sleep 10; done
echo "bastion ready"
```
**Good looks like:** `"Account": "811364789032"`, the three values, then `bastion ready` within 1–3 minutes.

**Terminal A**, the tunnel on port **5434** (leave open):
```bash
aws ssm start-session --target "$BASTION_ID" --document-name AWS-StartPortForwardingSessionToRemoteHost \
  --parameters "{\"host\":[\"$DB_HOST\"],\"portNumber\":[\"5432\"],\"localPortNumber\":[\"5434\"]}"
```

**Terminal B**, the database password (never type it):
```bash
export PGPASSWORD=$(aws secretsmanager get-secret-value \
  --secret-id "$(aws secretsmanager list-secrets --query "SecretList[?starts_with(Name, 'rds!db-')].Name" --output text)" \
  --query SecretString --output text | python3 -c "import json,sys; print(json.load(sys.stdin)['password'])")
cd "$REPO_ROOT/backend"
export DATABASE_URL="postgresql://unifolio:$(python3 -c "import os,urllib.parse; print(urllib.parse.quote_plus(os.environ['PGPASSWORD']))")@localhost:5434/unifolio"
```

---

## Step 3 — Which migration is staging on? (Terminal B)

```bash
.venv/bin/alembic current
```
| Shows | Means |
|---|---|
| `0032` | **Expected.** Carry on. |
| `0033`–`0037` | Part of this deploy already ran. Stop and ask Aditi. |
| Older than `0032` | The 8 October deploy isn't live. Stop and ask Aditi. |

---

## Step 4 — Build, and save rollback points (nothing changes on AWS yet)

**Terminal C:**
```bash
cd "$REPO_ROOT/backend"
docker build -t unifolio-staging-backend .
```
**Good looks like:** `naming to docker.io/library/unifolio-staging-backend`.

**Rollback point 1, the running backend image:**
```bash
MANIFEST=$(aws ecr batch-get-image --repository-name unifolio-staging-backend --region ap-south-1 \
  --image-ids imageTag=latest --query 'images[0].imageManifest' --output text)
aws ecr put-image --repository-name unifolio-staging-backend --region ap-south-1 \
  --image-tag pre-subproject-1 --image-manifest "$MANIFEST" --query 'image.imageId' --output json
```
**Good looks like:** JSON with `"imageTag": "pre-subproject-1"`. Any error other than `ImageAlreadyExistsException`: stop.

**Rollback point 2, the live frontend:**
```bash
mkdir -p ~/staging-frontend-backup-$(date +%F)
aws s3 sync "s3://$(terraform -chdir="$REPO_ROOT/infra/envs/staging" output -raw s3_bucket_name)/" ~/staging-frontend-backup-$(date +%F)/
ls ~/staging-frontend-backup-$(date +%F)/index.html
```

**Log in to ECR and tag. Don't push yet** (a task started now would run new code on the old schema):
```bash
aws ecr get-login-password --region ap-south-1 | \
  docker login --username AWS --password-stdin 811364789032.dkr.ecr.ap-south-1.amazonaws.com
docker tag unifolio-staging-backend:latest 811364789032.dkr.ecr.ap-south-1.amazonaws.com/unifolio-staging-backend:latest
```

---

## Step 5 — Start the window: stop the backend

> **Staging is down from here until Step 9 finishes (about 20 minutes).** Tell the testers.

```bash
aws ecs update-service --cluster unifolio-staging --service unifolio-staging-backend \
  --desired-count 0 --query "service.desiredCount" --output text
watch -n 5 'aws ecs describe-services --cluster unifolio-staging --services unifolio-staging-backend \
  --query "services[0].{running:runningCount,desired:desiredCount}"'
```
**Good looks like:** `running` reaches `0` within about a minute. Ctrl+C.

---

## Step 6 — Wipe the user data (only with Aditi's OK)

**Recommended**, so every QA account starts clean and every Analytics run includes the three new sections. Without a wipe, existing accounts only get the new sections after the 06:30 Analytics recompute or their next import.

```bash
cd "$REPO_ROOT" && ./scripts/clean-staging-db.sh
```
**Good looks like:** as in the 8 October guide, Step 6: `BEFORE` counts, `COMMIT`, every user-domain count `0`, reference data intact, `Done.`

---

## Step 7 — Migrate to `0037` (Terminal B, tunnel open)

```bash
.venv/bin/alembic upgrade head
.venv/bin/alembic current
```
**Good looks like** five lines, then `0037 (head)`:
```
Running upgrade 0032 -> 0033, benchmark_return_type: add PRICE/TRI dimension to benchmark_index_history (attribute 12)
Running upgrade 0033 -> 0034, scheme_rankings_and_ranking_weights: 5-factor composite fund ranking (attribute 09)
Running upgrade 0034 -> 0035, scheme_fund_managers: per-scheme fund manager attribution (attribute 04)
Running upgrade 0035 -> 0036, scenarios_and_scenario_results: drawdown/stress-test scenario library (attribute 11)
Running upgrade 0036 -> 0037, seed_scenario_library: 31 scenarios + 5 hypothetical assumption sets (attribute 11)
```
`0033` rewrites `benchmark_index_history`'s primary key; it takes a few seconds on a table of tens of thousands of rows.

**Sanity check:**
```bash
.venv/bin/python - <<'EOF'
import os, sqlalchemy as sa
q = lambda c, s: c.execute(sa.text(s)).all()
with sa.create_engine(os.environ["DATABASE_URL"]).connect() as c:
    print("benchmark rows by type:", q(c, "SELECT return_type, count(*) FROM benchmark_index_history GROUP BY 1"))
    print("ranking_weights:", q(c, "SELECT count(*) FROM ranking_weights"))
    print("scenarios:", q(c, "SELECT count(*), count(*) FILTER (WHERE parent_scenario_id IS NULL), count(*) FILTER (WHERE display_rank IS NOT NULL) FROM scenarios"))
    print("assumptions:", q(c, "SELECT count(*) FROM scenario_hypothetical_assumptions"))
    print("freeze column type:", q(c, "SELECT udt_name FROM information_schema.columns WHERE table_name='scenarios' AND column_name='had_redemption_freeze_schemes'"))
    print("fund managers / rankings / scenario results:", q(c, "SELECT (SELECT count(*) FROM scheme_fund_managers), (SELECT count(*) FROM scheme_rankings), (SELECT count(*) FROM scenario_scheme_results)"))
EOF
```
**Good looks like:**
```
benchmark rows by type: [('price', <thousands>)]
ranking_weights: [(1,)]
scenarios: [(34, 31, 8)]
assumptions: [(45,)]
freeze column type: [('_text',)]
fund managers / rankings / scenario results: [(0, 0, 0)]
```

**If `upgrade` fails:** each migration runs in its own transaction, so the database stays at the last good one. Copy the error, don't retry, and go to **Rollback**.

---

## Step 8 — Push the image and start the new backend (Terminal C)

```bash
docker push 811364789032.dkr.ecr.ap-south-1.amazonaws.com/unifolio-staging-backend:latest
aws ecs update-service --cluster unifolio-staging --service unifolio-staging-backend \
  --desired-count 1 --force-new-deployment --query "service.deployments[0].status" --output text
watch -n 5 'aws ecs describe-services --cluster unifolio-staging --services unifolio-staging-backend \
  --query "services[0].{running:runningCount,desired:desiredCount,rollout:deployments[0].rolloutState}"'
aws logs tail /ecs/staging-backend --since 10m | grep -E "startup complete|Traceback" | tail -3
curl -s https://staging-api.unifolio.in/health
```
**Good looks like:** `PRIMARY`; `rollout` → `COMPLETED` (3–6 min); `Application startup complete.`; `{"status":"ok"}`.

---

## Step 9 — Build and publish the frontend (right away)

The old cached frontend doesn't know the new import flow, so publish straight after Step 8.
```bash
cd "$REPO_ROOT/frontend" && rm -rf dist && npm ci && \
  VITE_API_BASE_URL=https://staging-api.unifolio.in npm run build && test -f dist/index.html && echo "BUILD OK"
```
Only after `BUILD OK`:
```bash
aws s3 sync dist/ "s3://$(terraform -chdir="$REPO_ROOT/infra/envs/staging" output -raw s3_bucket_name)/" --delete && \
aws cloudfront create-invalidation \
  --distribution-id "$(terraform -chdir="$REPO_ROOT/infra/envs/staging" output -raw cloudfront_distribution_id)" --paths "/*"
```
**Good looks like:** `upload:` lines, then `"Status": "InProgress"`. **The window ends here.** Tell testers to hard-refresh (Ctrl+Shift+R).

---

## Step 10 — Terraform: the monthly fund-manager job and its alarm

```bash
cd "$REPO_ROOT/infra/envs/staging"
ls terraform.tfvars && grep -c "=" terraform.tfvars
SECRET_JSON=$(aws secretsmanager get-secret-value --secret-id unifolio-staging-pan-keys --query SecretString --output text)
export TF_VAR_pan_encryption_key=$(echo "$SECRET_JSON" | python3 -c "import json,sys; print(json.load(sys.stdin)['PAN_ENCRYPTION_KEY'])")
export TF_VAR_pan_lookup_pepper=$(echo "$SECRET_JSON" | python3 -c "import json,sys; print(json.load(sys.stdin)['PAN_LOOKUP_PEPPER'])")
terraform plan -out=fund-managers.tfplan
```
**Good looks like** exactly these, and nothing else:
```
  # module.scheduler.aws_cloudwatch_log_group.jobs["fund_managers_monthly"] will be created
  # module.scheduler.aws_cloudwatch_log_metric_filter.fund_manager_alerts will be created
  # module.scheduler.aws_cloudwatch_metric_alarm.fund_manager_alerts will be created
  # module.scheduler.aws_ecs_task_definition.jobs["fund_managers_monthly"] will be created
  # module.scheduler.aws_iam_role_policy.scheduler will be updated in-place
  # module.scheduler.aws_scheduler_schedule.jobs["fund_managers_monthly"] will be created

Plan: 5 to add, 1 to change, 0 to destroy.
```
- The in-place policy update adds the new job's task definition to the list the scheduler may run.
- In the task definition's details, `memory = "2048"` (only this job; every other job's task definition is unchanged, so none of them appear in the plan).
- `aws_sns_topic_subscription.ops_alerts_email[...] will be created` as well is fine (an unconfirmed email subscription that AWS deleted).
- **Anything else** (the backend task definition, RDS, the bastion, the `ses`/email variables, a `scheme_master_daily` resource being created or destroyed): stop, don't apply, send Aditi the plan. Everything except the monthly schedule works without this step; Step 12d runs the job by hand either way.

**Apply, then remove the saved plan** (it holds the PAN key in readable form):
```bash
terraform apply fund-managers.tfplan
aws scheduler get-schedule --name unifolio-staging-job-fund-managers-monthly \
  --query "{state:State,cron:ScheduleExpression,tz:ScheduleExpressionTimezone}"
rm -f fund-managers.tfplan
unset TF_VAR_pan_encryption_key TF_VAR_pan_lookup_pepper SECRET_JSON
```
**Good looks like:** `Apply complete! Resources: 5 added, 1 changed, 0 destroyed.`, then `{ "state": "ENABLED", "cron": "cron(0 6 10 * ? *)", "tz": "Asia/Kolkata" }` (06:00 IST on the 10th).

---

## Step 11 — Check the ops-alerts email subscription

The new alarm emails the existing `ops-alerts` topic. Its subscriptions were `PendingConfirmation` on 1 October.
```bash
TOPIC=$(aws sns list-topics --query "Topics[?contains(TopicArn,'ops-alerts')].TopicArn" --output text)
aws sns list-subscriptions-by-topic --topic-arn "$TOPIC" --query "Subscriptions[].{email:Endpoint,arn:SubscriptionArn}"
```
**Good looks like:** each email with a real `arn:aws:sns:...` ARN. **`PendingConfirmation`** means nobody gets the alerts: the address owner must click "Confirm subscription" in the AWS email (resend with `aws sns subscribe --topic-arn "$TOPIC" --protocol email --notification-endpoint <address>`).

---

## Step 12 — Data: benchmark TRI, NAV backfill, scenarios, fund managers

All four run as one-off ECS tasks inside staging (Terminal C). This helper runs a command in a job's task definition and waits for it, however long it takes:
```bash
run_job() {   # $1 = job slug whose task definition to use, $2 = command as a JSON list
  TASK_ARN=$(aws ecs run-task --cluster unifolio-staging --task-definition unifolio-staging-job-$1 --launch-type FARGATE \
    --network-configuration "awsvpcConfiguration={subnets=[$SUBNETS],securityGroups=[$ECS_SG],assignPublicIp=DISABLED}" \
    --overrides "{\"containerOverrides\":[{\"name\":\"staging-job-$1\",\"command\":$2}]}" \
    --query "tasks[0].taskArn" --output text)
  echo "$TASK_ARN"
  while [ "$(aws ecs describe-tasks --cluster unifolio-staging --tasks "$TASK_ARN" --query "tasks[0].lastStatus" --output text)" != "STOPPED" ]; do sleep 30; done
  aws ecs describe-tasks --cluster unifolio-staging --tasks "$TASK_ARN" \
    --query "tasks[0].{exit:containers[0].exitCode,reason:containers[0].reason,stopped:stoppedReason}"
}
```
**Exit `137` or reason `OutOfMemoryError`** at any step means the job ran out of memory (1 GB for `nav-daily`/`benchmark-daily`, 2 GB for `fund-managers-monthly`): stop that step and send Aditi the output.

### 12a. Benchmark TRI history (a few minutes)

A12 compares against Nifty TRI. The 06:00 job would fetch it tomorrow; fetch it now:
```bash
run_job benchmark-daily '["python","scripts/jobs/refresh_benchmark_daily.py"]'
aws logs tail /ecs/staging-job-benchmark-daily --since 20m | grep refresh_benchmark_daily
```
**Good looks like:** exit `0` and `refresh_benchmark_daily: fetches=8 succeeded=8 success=True` (4 indices × price and TRI).

**If `succeeded` < 8:** niftyindices.com refused some. Re-run once after five minutes. Analytics also fetches TRI on demand, so it isn't blocking.

### 12b. NAV history backfill (the long one)

Scenarios need every active fund's NAV history, not just held funds'. This downloads it from mfapi.in for every active fund that has none yet, in batches of 150 with a pause between batches. It aborts by itself if over 25% of a batch fails. It's **resumable**: re-running picks up only what's still missing.

**[close-out]** fills in: how many funds still need history on staging, the measured time per 150 funds locally, and so the expected total run time. Start it only if it will finish before **20:30 IST**.

```bash
run_job nav-daily '["python","scripts/jobs/backfill_scheme_nav_history.py"]'
```
In another terminal, watch progress:
```bash
aws logs tail /ecs/staging-job-nav-daily --follow | grep backfill_scheme_nav_history
```
**Good looks like:** lines like `batch 12/70, 1800/10400 schemes done (17.3%), 3 failures this batch, elapsed=900s`, ending with `backfill_scheme_nav_history: complete, N/N schemes backfilled` and exit `0`.

**If it isn't good:**
- **`failure rate … exceeds 25% threshold, aborting run`:** mfapi.in is struggling. Wait 30 minutes and run the same command again; it continues where it stopped.
- **Running past 20:30 IST:** let it be stopped by the night schedule (or stop the task). Run it again the next morning after 08:30; nothing is lost.

### 12c. Compute every scenario (after 12a and 12b)

```bash
run_job nav-daily '["python","scripts/compute_all_scenarios.py"]'
aws logs tail /ecs/staging-job-nav-daily --since 60m | grep compute_all_scenarios
```
**Good looks like:** one line per scenario, e.g. `compute_all_scenarios: COVID crash real=… proxied=… no_data=…`, then `compute_all_scenarios: done, 29 scenarios, 0 failed` and exit `0`. **[close-out]** fills in the expected counts and run time. Old scenarios (2000, 2004) have fewer `real` funds, because fewer funds existed; that's expected.

**`failed` > 0:** the log names the scenario. Send Aditi the log. The other scenarios still work.

### 12d. Fund-manager job, first run

```bash
run_job fund-managers-monthly '["python","scripts/jobs/refresh_fund_managers_monthly.py"]'
aws logs tail /ecs/staging-job-fund-managers-monthly --since 60m | grep -E "refresh_fund_managers_monthly|FUND_MANAGER_ALERT"
```
**Good looks like:** exit `0` and
```
refresh_fund_managers_monthly: success=True amcs_processed=40 amcs_failed=0 schemes_matched=… schemes_unmatched=… seconds=…
```
Measured locally on 10 October: `amcs_processed=40 amcs_failed=0 schemes_matched=1424 schemes_unmatched=1`, about **2 minutes**, peak memory 937 MB. On AWS, expect a similar `schemes_matched` minus the funds of any fund house that alerts.

**`FUND_MANAGER_ALERT amc=… reason=… detail=…` lines** each name a fund house and why. From AWS, expect some:
- `reason=fetch_failed`: the download was refused or timed out (often a site blocking AWS addresses). Note which fund houses. Aditi decides whether they move to the hand import.
- `reason=stale_month` / `no_factsheet_link`: the site hasn't published a current factsheet, or changed its page.
- `reason=directory_failed`: AMFI's factsheet directory couldn't be read; every fund house that relies on it is skipped. Re-run 12d later.

Send Aditi every `FUND_MANAGER_ALERT` line. One failing fund house never stops the others. The alarm from Step 10 should also email ops within the hour.

---

## Step 13 — Hand-import the 10 fund houses (Terminal B, tunnel open)

From `backend/`, with the 11 PDFs in `~/factsheets/`:
```bash
imp() { .venv/bin/python scripts/jobs/import_manual_fund_managers.py --amc "$1" "${@:2}"; }
F=~/factsheets
imp "HDFC Mutual Fund"              --pdf $F/hdfc_active.pdf --pdf $F/hdfc_passive.pdf
imp "ICICI Prudential Mutual Fund"  --pdf $F/icici.pdf
imp "Kotak Mahindra Mutual Fund"    --pdf $F/kotak.pdf
imp "Axis Mutual Fund"              --pdf $F/axis.pdf
imp "Bandhan Mutual Fund"           --pdf $F/bandhan.pdf
imp "Invesco Mutual Fund"           --pdf $F/invesco.pdf
imp "WhiteOak Capital Mutual Fund"  --pdf $F/whiteoak.pdf
imp "ITI Mutual Fund"               --pdf $F/iti.pdf
imp "JM Financial Mutual Fund"      --pdf $F/jm.pdf
imp "Trust Mutual Fund"             --pdf $F/trust.pdf
```
Each prints `matched=N unmatched=M` within seconds. Expected (measured locally on 10 October with Aditi's files; a newer month can differ by a few funds):

| Fund house | matched about |
|---|---|
| HDFC | 53 from the active file; the passive file adds HDFC's index funds and ETFs (**[close-out]**: not yet tested on a real passive file) |
| ICICI Prudential | 156 |
| Kotak | 112 |
| Axis | 88 |
| Bandhan | 87 |
| Invesco | 44 |
| WhiteOak | 22 |
| ITI | 20 |
| JM Financial | 17 |
| Trust | 11 |

**If it isn't good:**
- **`…: stale … download this month's factsheet and run again`:** the file is older than 45 days, or the wrong file. Nothing was written. Get the newest file.
- **`isn't a manual-import AMC`:** the `--amc` name is mistyped. Copy it from the table above.
- **`matched` far below the table:** the fund house changed its layout. Send Aditi the file name and the output.

**Write the numbers down.** The same command runs every month; the matched count is how you spot a broken month.

---

## Step 14 — Database checks (Terminal B)

```bash
.venv/bin/python - <<'EOF'
import os, sqlalchemy as sa
q = lambda c, s: c.execute(sa.text(s)).all()
with sa.create_engine(os.environ["DATABASE_URL"]).connect() as c:
    print("benchmark rows by type:", q(c, "SELECT return_type, count(*), min(date), max(date) FROM benchmark_index_history GROUP BY 1"))
    print("schemes with NAV history:", q(c, "SELECT count(DISTINCT scheme_id) FROM nav_history"))
    print("scenario results:", q(c, "SELECT count(*), count(*) FILTER (WHERE NOT is_proxied), count(*) FILTER (WHERE pct_change IS NULL) FROM scenario_scheme_results"))
    print("fund-manager rows / schemes / fund houses:", q(c, "SELECT count(*), count(DISTINCT f.scheme_id), count(DISTINCT s.amc_name) FROM scheme_fund_managers f JOIN schemes s ON s.id=f.scheme_id"))
    print("2024 election result (one-day event):", q(c, "SELECT avg(r.pct_change) FROM scenario_scheme_results r JOIN scenarios s ON s.id=r.scenario_id WHERE s.name LIKE '2024 election%' AND NOT r.is_proxied"))
EOF
```
**Good looks like:**
- `benchmark rows by type`: a `price` row and a `tri` row; TRI's `min` in the 1990s.
- `schemes with NAV history`: close to the number of active funds (**[close-out]**).
- `scenario results`: tens of thousands; most `real`.
- `fund-manager rows / schemes / fund houses`: about 50 fund houses (40 automatic + 10 by hand, minus any that alerted in 12d).
- `2024 election result`: a **negative** average, never `0`. It averages every fund, debt included, so it's smaller than the ~−6% equity move. (A non-zero figure is the "close before the start" rule working.)

---

## Step 15 — Stop the bastion

Close every tunnel (Ctrl+C in Terminal A), then:
```bash
aws ec2 stop-instances --instance-ids "$BASTION_ID" --query "StoppingInstances[0].CurrentState.Name" --output text
aws ec2 wait instance-stopped --instance-ids "$BASTION_ID"
aws ec2 describe-instances --instance-ids "$BASTION_ID" --query "Reservations[0].Instances[0].State.Name" --output text
```
**Good looks like:** `stopping`, then `stopped`.

---

## Rollback

**1. Old backend image, plus remove TRI rows.** The old code reads benchmark history without the price/TRI split, so it would mix TRI rows into its price series. Remove them (Terminal B), then put the old image back:
```bash
.venv/bin/python -c "import os,sqlalchemy as sa; e=sa.create_engine(os.environ['DATABASE_URL']); c=e.begin().__enter__(); print(c.execute(sa.text(\"DELETE FROM benchmark_index_history WHERE return_type='tri'\")).rowcount)"
MANIFEST=$(aws ecr batch-get-image --repository-name unifolio-staging-backend --region ap-south-1 \
  --image-ids imageTag=pre-subproject-1 --query 'images[0].imageManifest' --output text)
aws ecr put-image --repository-name unifolio-staging-backend --region ap-south-1 \
  --image-tag latest --image-manifest "$MANIFEST" --query 'image.imageId' --output json
aws ecs update-service --cluster unifolio-staging --service unifolio-staging-backend \
  --desired-count 1 --force-new-deployment --query "service.deployments[0].status" --output text
```
The new tables (`0034`–`0037`) are ignored by the old code, so no downgrade is needed. **But** the 06:15 benchmark job (old image) is fine, while the new `fund-managers-monthly` schedule would fail on the old image: disable it with `aws scheduler update-schedule` or revert Step 10.

**2. Old frontend:**
```bash
aws s3 sync ~/staging-frontend-backup-$(date +%F)/ "s3://$(terraform -chdir="$REPO_ROOT/infra/envs/staging" output -raw s3_bucket_name)/" --delete
aws cloudfront create-invalidation --distribution-id "$(terraform -chdir="$REPO_ROOT/infra/envs/staging" output -raw cloudfront_distribution_id)" --paths "/*"
```

**3. Only if you must go back to `0032`:** with the backend stopped, `.venv/bin/alembic downgrade 0032` (drops the scenario, fund-manager and ranking tables and the TRI rows). **Never below `0032`.**

**4. Stop the bastion** (Step 15).

**A data step failing (Step 12/13) is not a reason to roll back.** The app works without it: Scenarios show "not enough historical data", fund-manager cards show "not available yet". Fix and re-run the step.

---

# Part 2 — QA on https://staging.unifolio.in

Use the **real-life synthetic statements in the repo**: `Docs/CAS Files/synthetic/pdfs/realistic/` (password `MF@123`; who's in each file: that folder's `../../README.md`). Don't use `pdfs/regression/` for QA: those are import edge cases with extreme sizes on purpose. Sign up with a new phone number for each file, using the first investor's name.

| File | Investors | Use it for |
|---|---|---|
| `r1_first_jobber_riya_3yr.pdf` | Riya Anil Sharma | Q1, a small single-investor portfolio |
| `r2_couple_rohan_priya_10yr.pdf` | Rohan + Priya Kulkarni | Q2, A1–A7, S1–S9 (family; HDFC, ICICI, Kotak and Axis funds, so A5 checks the hand-imported managers) |
| `r3_family_minor_suresh_13yr.pdf` | Suresh + Lakshmi Iyer, son Aarav (minor) | Q4 |
| `big_family_ayush_anand_7yr.pdf` | Ayush + Anand Karnawat | Q5, a large household (46 funds) | Check **desktop and mobile**, and **light and dark** mode, on every new screen. Screenshot each check and name it with its ID (e.g. `S3-desktop-dark.png`).

## Q. The import flow (no review screen)

| ID | Do | Expected |
|---|---|---|
| Q1 | Upload `r1_first_jobber_riya_3yr.pdf` | Upload → confirm the person → straight to the dashboard. **No Import Review table.** Total Invested ₹6,14,170 (= the statement's cost); 4 funds incl. a liquid fund |
| Q2 | Upload `r2_couple_rohan_priya_10yr.pdf` | Rohan and Priya each confirmed once; no dead end; both members on the dashboard; Total Invested ₹45,55,616 |
| Q3 | Upload `r2_…` again | No duplicate funds or transactions ("0 added") |
| Q4 | Upload `r3_family_minor_suresh_13yr.pdf` | Suresh and Lakshmi as members; Aarav's HDFC Children's Fund folio shows **under Suresh** (the app has no separate minor member today). HDFC Flexi Cap's invested may show a few rupees less than the statement (known rounding on pre-2020 purchases) |
| Q5 | Upload `big_family_ayush_anand_7yr.pdf` | 46 funds across two members load; the dashboard and Analytics stay usable (Analytics took ~1 min locally) |

## A. Analytics: the three new sections plus TRI

Open **Analytics** on the `r2` (Rohan + Priya) account. Note how long it takes from opening to the last section appearing (it was 1–6 minutes on 8 October; three new sections add a little).

| ID | Section | Expected |
|---|---|---|
| A1 | **Investment & withdrawal** (A14) | Money in and money out per year as bars; the totals agree with the dashboard's Total Invested and the statement's redemptions |
| A2 | **Benchmark** (A12) | Says it compares against **Nifty TRI**. TRI returns are a bit higher than price-index returns would be. Never falls back to a price index |
| A3 | **Fund ranking** (A09) | Each fund shows its rank within its SEBI category, a percentile, and a few neighbours. A fund in a small category says so, instead of claiming "Top 100%". Unranked funds say why |
| A4 | **Fund managers** (A04) | One card per manager: the household's money with them, their funds, their role ("Co-Fund Manager", "Equity portion"…) and "managing since". Funds from Bajaj, AlphaGrep, IL&FS, Lakshya or Monarch show "not available yet", never a wrong name |
| A5 | Fund managers: a hand-imported house | Open a fund from HDFC, ICICI or Kotak: its managers show (only after Step 13 ran) |
| A6 | **PDF export** | The export includes the three new sections; manager cards are all expanded |
| A7 | Mobile Analytics | All three new sections render and scroll; nothing is cut off |

## S. Scenarios (A11)

| ID | Do | Expected |
|---|---|---|
| S1 | Open the **Scenarios** tab (desktop sidebar and mobile bottom bar) | A list of curated scenario cards with quick market/equity/debt stats, and a "More" list with category filters. **No hypothetical scenarios** (Hormuz, rupee depreciation, etc.) appear anywhere |
| S2 | Open **COVID crash** | Portfolio impact %, rupee impact, "Based on ₹X of your ₹Y", a by-fund list, a by-member list, and Nifty TRI comparisons. Numbers are negative |
| S3 | Open **2024 election result** (one day) | A real negative move (around −5% for equity), **not 0%** |
| S4 | Open the **US-Iran war** multi-phase event | The headline covers the **whole event**; the phase list shows each phase's own %; the fund list is labelled **"Current phase"** |
| S5 | Look for an **estimate** | Funds without their own history in a window (newer funds) show `~x%` with an "estimate" label and a tooltip saying which average was used. Only truly missing ones say "Not enough historical data" |
| S6 | **Franklin Templeton wind-up (2020)** | Only meaningful if the account holds one of Franklin's six wound-up debt schemes: those show "Redemptions frozen ~20mo" and are left out of the %. Otherwise it just shows the funds' moves |
| S7 | Keyboard: Tab to a scenario, Enter, then "Back to scenarios" | Focus lands on the "Scenarios" heading each time, not at the top of the page |
| S8 | Wording | Every result shows the "based on actual historical fund performance — not a prediction" line |
| S9 | A family account | By-member figures add up to the total; each member's % is their own |

## O. Ops checks (manager, after Step 12)

| ID | Check | Expected |
|---|---|---|
| O1 | The Step 12d `FUND_MANAGER_ALERT` list | Sent to Aditi; each blocked fund house noted |
| O2 | The alarm email | Arrived at the ops-alerts address if 12d had alerts (needs Step 11 confirmed) |
| O3 | The Step 13 matched counts | Written down for next month |

## What to send Aditi

- Steps 3, 7 and 14 outputs; the Step 10 plan summary.
- Every `run_job` exit code, the 12b total time, the 12c `done` line, the 12d summary line and every `FUND_MANAGER_ALERT` line.
- The Step 13 matched counts.
- Screenshots Q1–Q5, A1–A7, S1–S9; the Analytics time.
- Any failure, with the time and `aws logs tail /ecs/staging-backend --since 30m`.

---

# Part 3 — Next day, and each month

**The next morning** (after 08:30 IST):
```bash
aws logs tail /ecs/staging-job-benchmark-daily --since 6h | grep refresh_benchmark_daily      # success=True
aws logs tail /ecs/staging-job-nav-daily --since 6h | grep -iE "scenario|recompute" | tail -5  # ongoing scenarios refreshed, no Traceback
```
Open the US-Iran war scenario again: its "ongoing" figures may have moved slightly. That's the daily refresh working.

**Every month (the hand import):**
1. Around the 10th–15th, download the 11 newest factsheets (Step 0b table).
2. Start the bastion and the tunnel (Step 2), run the Step 13 commands, compare `matched` with last month, stop the bastion (Step 15).
3. If you skip three months, those fund houses' managers stop showing until the next import.

**On the 10th of each month at 06:00 IST** the automatic job runs. Check the ops-alerts email that day; any alert names the fund house.

**Before production:** `SCENARIO_HYPOTHETICALS_ENABLED` stays unset until someone markets-literate has reviewed the 45 hypothetical assumptions. Turning it on is a backend environment change plus a restart.

---

*Written 2026-10-10 from branch `feat/enhanced-ui` (HEAD after A11 Run 2, `0290c76` + docs), the 8 October guide, `infra/` and the scripts named above.*
- *Checked against the code:*
  - *the migration chain `0032` → `0037` and each migration's message;*
  - *the `fund_managers_monthly` job (`cron(0 6 10 * ? *)`), the metric filter and alarm in `infra/modules/scheduler/main.tf`, and the 1 GB job size;*
  - *the log lines of `refresh_benchmark_daily.py`, `backfill_scheme_nav_history.py`, `compute_all_scenarios.py`, `refresh_fund_managers_monthly.py` and `import_manual_fund_managers.py`;*
  - *`0033`'s downgrade and why a rollback must remove TRI rows.*
- *Local results so far: A04 481 tests and A11 164 + 55 tests pass; Postgres round trips clean; every attribute independently reviewed.*
- ***[close-out]** items are filled in after the A04/A11 close-outs. No command in this guide has been run against AWS.*
