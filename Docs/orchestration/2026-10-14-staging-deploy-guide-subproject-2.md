# Staging Deploy + QA Guide — Sub-project 2 (look-through: stock holdings, cap allocation, asset allocation, overlap, valuation, PDF)

**One deploy that brings staging up to date** with branch `feat/enhanced-ui` after the 13 October Sub-project 1 deploy (staging is on migration `0038`).

Part 1 is the deploy (your manager runs it). Part 2 is the QA you run on https://staging.unifolio.in afterwards. Part 3 is the next-day, monthly and half-yearly routine.

Run Part 1 on **your manager's laptop**, as usual. It needs:
- WSL with `git`, `python3`, Docker Desktop, the AWS CLI and the Session Manager plugin;
- `terraform`, `psql` and `node`/`npm`;
- the AWS credentials for account `811364789032`;
- the **manual-AMC portfolio files** from Step 0b (7 fund houses, downloaded in a normal browser).

**When:** start by **10:00 IST** on a weekday.
- Staging's RDS, backend and NAT stop every night from 21:00 to 05:00 IST.
- Scheduled jobs start at 05:45, 06:00, 06:15, 06:20, 06:30, 08:00 and 19:00 IST. Keep clear of those.
- Step 12 runs four long one-off jobs. They must all finish before 21:00.

**The bastion is kept stopped.** Step 2 starts it; Step 14 stops it (the rollback path stops it too).

**Time:** about 3–4 hours, most of it waiting on Step 12. Staging is **down for about 15 minutes**, from Step 5 to the end of Step 9. **There is no data wipe in this deploy** (Sub-project 2 adds tables; it changes no user data).

**Nothing in this guide has been run against AWS yet.**
- It was written from the repo, the Sub-project 1 guide (`2026-10-10-staging-deploy-guide-subproject-1.md`) and the infra code.
- Expected outputs for AWS commands are what the code says should happen.
- The migrations were round-tripped on a real Postgres 16 (up, down, up; also with production-like rows in the tables). `terraform validate` passes. The Terraform plan has not been run (it needs the AWS account), so Step 10 lists what it should show.
- **Expected numbers for the QA screens are not filled in yet.** They come from the synthetic CAS harness run, which is still to do (see Part 2).

---

## What ships

| | What users see | Backend / data |
|---|---|---|
| **Stock holdings** | New Analytics section: the stocks held through the funds, weighted by the portfolio, "stacked by fund", searchable table | Migration **`0039`**: `disclosure_batches`, `scheme_holdings`. Fed by the **portfolio-disclosure job** (45 fund houses automatic, 7 by hand) |
| **Cap allocation** (attribute 02) | Large / Mid / Small / Other donut, both denominators, drill-down | Migration **`0040`**: `market_cap_classifications` (AMFI half-yearly lists, 4 loaded at first run) |
| **Asset allocation** (attribute 13) | Look-through equity / debt / gold / cash donut with the equity cap split and an arbitrage-as-cash toggle | Computed in Analytics |
| **Fund overlap** (attribute 10) | Fund-pair heatmap, pairs above 20%, stock concentration curve | Computed in Analytics |
| **Valuation** (attribute 15) | Portfolio P/E and P/B against Nifty 50 and Nifty 500 | Migration **`0041`**: `stock_master`, and `pe`/`pb` added to the return types of `benchmark_index_history`. Fed by the **stock-fundamentals job** (NSE, Yahoo) |
| **PDF export** | The PDF now prints the five new sections and Investment & Withdrawal | Frontend only |

**Infra (one Terraform change, 21 resources to add):**
- three scheduled jobs: `portfolio-disclosures-daily` (05:45, days 1–20), `stock-fundamentals-daily` (05:45 daily), `market-cap-half-yearly` (05:45, days 1–15 of January and July), each **2 GB**;
- a dedicated task role and a private S3 bucket for failed disclosure files (365-day expiry);
- three CloudWatch metric filters and alarms that email the existing ops-alerts topic.

**One dependency change since 13 October:** `backend/requirements.txt` gained `openpyxl==3.1.5` and `xlrd==2.0.2` (reading AMC Excel files). Step 4 rebuilds the image, so nothing extra to do; it is why the backend image must be rebuilt for this deploy. No new secret, no new backend environment variable (the one new variable, the failed-file bucket name, is set on the disclosure job by Terraform), no `Dockerfile` or `package.json` change.

**Known and accepted** (details in `DEFERRED_FEATURES.md`, "Sub-project 2 follow-ups"):
- 7 fund houses publish only through pages we cannot automate: Edelweiss, Mahindra Manulife, Invesco, ITI, JM Financial, HSBC, Bandhan. They are imported by hand each month (Step 12c). Until a fund house's file is imported, funds in it show as "not available from this fund house" in the coverage banner. Invesco has so far only a PDF, and no PDF reader exists.
- **A new half-year of AMFI market-cap data needs one code edit** (the URL table in `amfi_market_cap_client.py`). Next due January 2027. Until then the July 2026 list is used.
- REITs and InvITs are counted as equity in the look-through asset allocation (shown under "Other" in its equity ring). The manager has not confirmed this yet.
- Nobody has looked at the five new screens in a real browser yet (tests only). Part 2 does that.

### Order of steps

| Step | What | Staging |
|---|---|---|
| 0 | Commit and push; collect the manual-AMC files (Aditi) | up |
| 1 | Pre-flight: Postgres tests on the laptop | up |
| 2 | Connection values, **start the bastion**, the database tunnel | up |
| 3 | Which migration staging is on (expect `0038`) | up |
| 4 | Build the image, save rollback points (no push) | up |
| 5 | Stop the backend | **down** |
| 6 | (no data wipe in this deploy) | down |
| 7 | Migrate to `0041` and sanity-check | down |
| 8 | Push the image and start the new backend | down → **up** |
| 9 | Build and publish the frontend (right away) | up |
| 10 | Terraform: three jobs, bucket, role, three alarms | up |
| 11 | Confirm the ops-alerts email subscription | up |
| 12 | Data: market cap → disclosures → manual AMCs → stock fundamentals → recompute | up |
| 13 | Database checks | up |
| 14 | **Stop the bastion** | up |
| — | Part 2: QA on staging (testers) | up |

---

# Part 1 — Deploy

## Step 0 — Commit, push, and collect the files (Aditi)

**0a. Commit and push**
```bash
git status --short
```
Everything for this release must be committed, including untracked files (`??`). In particular:
- `backend/alembic/versions/0039_*.py`, `0040_*.py`, `0041_*.py`;
- `backend/scripts/jobs/refresh_portfolio_disclosures_daily.py`, `import_manual_portfolio_disclosures.py`, `refresh_market_cap_half_yearly.py`, `refresh_stock_fundamentals_daily.py`;
- `backend/tests/fixtures/portfolio_disclosures/`, `market_cap/`, `stock_fundamentals/` (public AMC and exchange files, about 46 MB: this is intended, they are the tests' real-file samples);
- `infra/modules/scheduler/main.tf`, `infra/modules/storage/`, `infra/envs/staging/main.tf`;
- `frontend/src/features/analytics/`.

**Never commit real CAS statements:**
```bash
git status --short --untracked-files=all | grep -i "CAS Files" | grep -vi "synthetic"
```
**Good looks like:** no output. Then `git add -A && git commit -m "..." && git push` and send the manager `git log -1 --format=%h`.

**0b. Collect the manual-AMC files (needed for Step 12c)**

Download each in a normal browser **on the deploy day or the day before**. The importer checks the file's own date; a file more than 45 days old needs `--allow-old`. Use the **latest completed month-end** (in October: 30 September 2026). Page links and the exact commands are in `Docs/orchestration/portfolio-disclosure-manual-import-guide.md`.

| Fund house (exact name) | File | State of our samples |
|---|---|---|
| Edelweiss Mutual Fund | Consolidated monthly workbook | September file verified |
| Mahindra Manulife Mutual Fund | Monthly workbook | The file supplied so far is unusable XML; **a real XLS/XLSX/ZIP is still needed** |
| Invesco Mutual Fund | Scheme-wise monthly holdings, Excel | Only a PDF so far; **Excel still needed** |
| ITI Mutual Fund | Monthly consolidated workbook | The file supplied is August; get September |
| JM Financial Mutual Fund | One workbook per scheme (Large Cap, Mid Cap, …) | September Large Cap and Mid Cap verified |
| HSBC Mutual Fund | All scheme-wise monthly spreadsheets | **Not collected yet** |
| Bandhan Mutual Fund | Monthly holdings workbook | **Not collected yet** (decision pending whether Bandhan stays manual) |

The files are in `D:\Portfolio Disclosures` on the manager's laptop. WSL sees that drive as `/mnt/d/Portfolio Disclosures` (note the space: always quote the path). Check the names once:
```bash
DISC="/mnt/d/Portfolio Disclosures"
ls -la "$DISC"
```
**Good looks like:** the `.xls`, `.xlsx` or `.zip` files for the fund houses collected. No copying is needed: Step 12c reads them from there. A missing file is not a blocker: that fund house just shows "not available" until it is imported. The synthetic CAS statements for QA are in the repo (`Docs/CAS Files/synthetic/pdfs/realistic/`, password `MF@123`).

---

## Step 1 — Pre-flight on the laptop: Postgres tests

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
**Good looks like:** the last line `N passed` with **no `failed` and no `skipped`** (the Postgres functional tests plus every migration's round trip, now up to `0041`).

**If it isn't good:** any `FAILED` → stop and send Aditi the output. `skipped` → `TEST_DATABASE_URL=...` must be on the same line as `pytest`.

---

## Step 2 — Connection values, start the bastion, and the database tunnel

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
**Good looks like:** `"Account": "811364789032"`, the three values, then `bastion ready` within 1–3 minutes. (If the start fails with `InsufficientInstanceCapacity`, see `session.md`'s 2 October entry: the bastion now lives in `ap-south-1b`.)

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
| `0038` | **Expected.** Carry on. |
| `0039`–`0041` | Part of this deploy already ran. Stop and ask Aditi. |
| Older than `0038` | The Sub-project 1 deploy isn't live. Stop and ask Aditi. |

---

## Step 4 — Build, and save rollback points (nothing changes on AWS yet)

**Terminal C:**
```bash
cd "$REPO_ROOT/backend"
docker build -t unifolio-staging-backend .
```
**Good looks like:** `naming to docker.io/library/unifolio-staging-backend`. (The build now installs `openpyxl` and `xlrd`.)

**Rollback point 1, the running backend image:**
```bash
MANIFEST=$(aws ecr batch-get-image --repository-name unifolio-staging-backend --region ap-south-1 \
  --image-ids imageTag=latest --query 'images[0].imageManifest' --output text)
aws ecr put-image --repository-name unifolio-staging-backend --region ap-south-1 \
  --image-tag pre-subproject-2 --image-manifest "$MANIFEST" --query 'image.imageId' --output json
```
**Good looks like:** JSON with `"imageTag": "pre-subproject-2"`. Any error other than `ImageAlreadyExistsException`: stop.

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

> **Staging is down from here until Step 9 finishes (about 15 minutes).** Tell the testers.

```bash
aws ecs update-service --cluster unifolio-staging --service unifolio-staging-backend \
  --desired-count 0 --query "service.desiredCount" --output text
watch -n 5 'aws ecs describe-services --cluster unifolio-staging --services unifolio-staging-backend \
  --query "services[0].{running:runningCount,desired:desiredCount}"'
```
**Good looks like:** `running` reaches `0` within about a minute. Ctrl+C.

---

## Step 6 — No data wipe in this deploy

Nothing to run. Existing accounts keep their data. Their new sections fill in after the recompute in Step 12e (or at the next 06:30 recompute).

---

## Step 7 — Migrate to `0041` (Terminal B, tunnel open)

```bash
.venv/bin/alembic upgrade head
.venv/bin/alembic current
```
**Good looks like** three lines, then `0041 (head)`:
```
Running upgrade 0038 -> 0039, disclosure_batches, scheme_holdings: look-through engine ingestion (sub-project 2, section 00)
Running upgrade 0039 -> 0040, AMFI effective-dated market-cap reference data.
Running upgrade 0040 -> 0041, Stock fundamentals and index valuation series (attribute 15).
```
`0041` adds `pe` and `pb` to the `benchmarkreturntype` enum with `ALTER TYPE ... ADD VALUE`. That is quick, needs no table rewrite, and was checked on Postgres 16.

**Sanity check:**
```bash
.venv/bin/python - <<'EOF'
import os, sqlalchemy as sa
q = lambda c, s: c.execute(sa.text(s)).all()
with sa.create_engine(os.environ["DATABASE_URL"]).connect() as c:
    print("new tables:", q(c, "SELECT table_name FROM information_schema.tables WHERE table_name IN ('disclosure_batches','scheme_holdings','market_cap_classifications','stock_master') ORDER BY 1"))
    print("return types:", q(c, "SELECT unnest(enum_range(NULL::benchmarkreturntype))"))
    print("benchmark rows by type:", q(c, "SELECT return_type, count(*) FROM benchmark_index_history GROUP BY 1 ORDER BY 1"))
    print("new tables empty:", q(c, "SELECT (SELECT count(*) FROM disclosure_batches), (SELECT count(*) FROM scheme_holdings), (SELECT count(*) FROM market_cap_classifications), (SELECT count(*) FROM stock_master)"))
EOF
```
**Good looks like:** the four table names; `price`, `tri`, `pe`, `pb`; existing `price` and `tri` rows unchanged; `[(0, 0, 0, 0)]`.

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

The old frontend doesn't know the new payloads (the sections would render as unavailable), so publish straight after Step 8.
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

## Step 10 — Terraform: three jobs, the failed-file bucket, a task role, three alarms

```bash
cd "$REPO_ROOT/infra/envs/staging"
ls terraform.tfvars && grep -c "=" terraform.tfvars
SECRET_JSON=$(aws secretsmanager get-secret-value --secret-id unifolio-staging-pan-keys --query SecretString --output text)
export TF_VAR_pan_encryption_key=$(echo "$SECRET_JSON" | python3 -c "import json,sys; print(json.load(sys.stdin)['PAN_ENCRYPTION_KEY'])")
export TF_VAR_pan_lookup_pepper=$(echo "$SECRET_JSON" | python3 -c "import json,sys; print(json.load(sys.stdin)['PAN_LOOKUP_PEPPER'])")
terraform plan -out=subproject-2.tfplan
```
**Good looks like** exactly these, and nothing else:
```
  # module.scheduler.aws_cloudwatch_log_group.jobs["market_cap_half_yearly"] will be created
  # module.scheduler.aws_cloudwatch_log_group.jobs["portfolio_disclosures_daily"] will be created
  # module.scheduler.aws_cloudwatch_log_group.jobs["stock_fundamentals_daily"] will be created
  # module.scheduler.aws_ecs_task_definition.jobs["market_cap_half_yearly"] will be created
  # module.scheduler.aws_ecs_task_definition.jobs["portfolio_disclosures_daily"] will be created
  # module.scheduler.aws_ecs_task_definition.jobs["stock_fundamentals_daily"] will be created
  # module.scheduler.aws_scheduler_schedule.jobs["market_cap_half_yearly"] will be created
  # module.scheduler.aws_scheduler_schedule.jobs["portfolio_disclosures_daily"] will be created
  # module.scheduler.aws_scheduler_schedule.jobs["stock_fundamentals_daily"] will be created
  # module.scheduler.aws_iam_role.portfolio_disclosures_job will be created
  # module.scheduler.aws_iam_role_policy.portfolio_disclosures_job will be created
  # module.scheduler.aws_cloudwatch_log_metric_filter.market_cap_alerts will be created
  # module.scheduler.aws_cloudwatch_log_metric_filter.portfolio_disclosure_alerts will be created
  # module.scheduler.aws_cloudwatch_log_metric_filter.stock_fundamentals_alerts will be created
  # module.scheduler.aws_cloudwatch_metric_alarm.market_cap_alerts will be created
  # module.scheduler.aws_cloudwatch_metric_alarm.portfolio_disclosure_alerts will be created
  # module.scheduler.aws_cloudwatch_metric_alarm.stock_fundamentals_alerts will be created
  # module.storage.aws_s3_bucket.portfolio_disclosure_failed will be created
  # module.storage.aws_s3_bucket_lifecycle_configuration.portfolio_disclosure_failed will be created
  # module.storage.aws_s3_bucket_public_access_block.portfolio_disclosure_failed will be created
  # module.storage.aws_s3_bucket_server_side_encryption_configuration.portfolio_disclosure_failed will be created
  # module.scheduler.aws_iam_role_policy.scheduler will be updated in-place

Plan: 21 to add, 1 to change, 0 to destroy.
```
- The in-place update adds the three new task definitions (and the new task role for `PassRole`) to what the scheduler may run.
- In the three new task definitions: `memory = "2048"`; only `portfolio_disclosures_daily` has the `PORTFOLIO_DISCLOSURE_ARCHIVE_BUCKET` environment variable and the dedicated task role.
- `aws_sns_topic_subscription.ops_alerts_email[...] will be created` as well is fine (an unconfirmed email subscription that AWS deleted).
- **Anything else** (the backend task definition, any *existing* job's task definition, RDS, the bastion): stop, don't apply, send Aditi the plan. Everything except the schedules and alarms works without this step, but Step 12 needs the three task definitions, so Step 12 cannot start until the apply is done.

**Apply, then remove the saved plan** (it holds the PAN key in readable form):
```bash
terraform apply subproject-2.tfplan
for s in portfolio-disclosures-daily stock-fundamentals-daily market-cap-half-yearly; do
  aws scheduler get-schedule --name unifolio-staging-job-$s \
    --query "{state:State,cron:ScheduleExpression,tz:ScheduleExpressionTimezone}"
done
rm -f subproject-2.tfplan
unset TF_VAR_pan_encryption_key TF_VAR_pan_lookup_pepper SECRET_JSON
```
**Good looks like:** `Apply complete! Resources: 21 added, 1 changed, 0 destroyed.`, then three `ENABLED` schedules in `Asia/Kolkata` with:
- `cron(45 5 1-20 * ? *)` (disclosures: the first 20 days of every month),
- `cron(45 5 * * ? *)` (stock fundamentals: daily),
- `cron(45 5 1-15 1,7 ? *)` (market cap: the first 15 days of January and July).

---

## Step 11 — Check the ops-alerts email subscription

The three new alarms email the existing `ops-alerts` topic. Its subscriptions were `PendingConfirmation` on 1 October.
```bash
TOPIC=$(aws sns list-topics --query "Topics[?contains(TopicArn,'ops-alerts')].TopicArn" --output text)
aws sns list-subscriptions-by-topic --topic-arn "$TOPIC" --query "Subscriptions[].{email:Endpoint,arn:SubscriptionArn}"
```
**Good looks like:** each email with a real `arn:aws:sns:...` ARN. **`PendingConfirmation`** means nobody gets the alerts: the address owner must click "Confirm subscription" in the AWS email (resend with `aws sns subscribe --topic-arn "$TOPIC" --protocol email --notification-endpoint <address>`).

---

## Step 12 — Data: market cap, disclosures, manual AMCs, stock fundamentals, recompute

**Why you run these by hand.** The schedules would fill this data later, but too slowly for staging:
- the market-cap job's own schedule only runs in January and July, so without Step 12a the cap chart shows every stock as "Other / Unclassified" until **1 January 2027**;
- the disclosure and stock-fundamentals jobs run at 05:45 tomorrow, and the stock-fundamentals job needs the disclosure data first (it fetches ratios for the stocks the funds hold), so on tomorrow's first run it would only cover the Nifty 50 and 500.

Run them in this order (Terminal C). This helper runs a command in a job's task definition and waits for it:
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
**Exit `137` or reason `OutOfMemoryError`** at any step means the job ran out of memory (2 GB): stop that step and send Aditi the output.

### 12a. AMFI market-cap lists (a few minutes)
```bash
run_job market-cap-half-yearly '["python","scripts/jobs/refresh_market_cap_half_yearly.py"]'
aws logs tail /ecs/staging-job-market-cap-half-yearly --since 20m | grep -E "refresh_market_cap|PORTFOLIO_DISCLOSURE_ALERT"
```
**Good looks like:** exit `0` and `refresh_market_cap_half_yearly: success=True loaded=4 failed=0 rows=21053` (the four lists effective 1 Jan 2025, 1 Jul 2025, 1 Jan 2026 and 1 Jul 2026, 5,097 + 5,157 + 5,372 + 5,427 rows). A rerun says `loaded=0` (every period already complete).

**If exit `1`:** a list could not be downloaded or its row count changed (AMFI moved a file). The log line names the period. The cap chart still works with the periods that did load. Send Aditi the line.

### 12b. Portfolio disclosures (the long one, 20–60 minutes)

Downloads each automatic fund house's latest monthly file and writes one holdings batch per scheme. Memory-careful (one file at a time). Measured locally on 13 October from a development machine: 39 fund houses in about 7.5 minutes (that was before the later fixes; allow longer from AWS).
```bash
run_job portfolio-disclosures-daily '["python","scripts/jobs/refresh_portfolio_disclosures_daily.py"]'
aws logs tail /ecs/staging-job-portfolio-disclosures-daily --since 90m | grep -E "refresh_portfolio_disclosures_daily|PORTFOLIO_DISCLOSURE_ALERT" | cut -c1-220
```
**Good looks like:** exit `0` (the job itself does not fail the task when single fund houses fail) and a line like
`refresh_portfolio_disclosures_daily: success=True amcs_processed=<about 40> amcs_failed=<a few at most> amcs_not_onboarded=0 schemes_written=<thousands> pruned=0 seconds=...`
- `amcs_not_onboarded` must be `0`.
- Read the `PORTFOLIO_DISCLOSURE_ALERT` lines: each names the fund house and a reason (`no_file_found`, `parse_error`, `unmatched_scheme`, `failed_sum_check`, …). On a non-alert day only real failures print. A few `unmatched_scheme` lines for ETF and gold-fund sheets are expected (listed in `Docs/analytics/investigations/2026-10-13-sub-project-2-capture-log.md`).
- **`no_file_found` for many fund houses at once** means AWS addresses are refused by those sites (the egress check on 13 October found nothing blocked, but sites change). Send Aditi the list; the app works with whatever loaded.
- **ICICI's file is a 25 MB ZIP;** the 2 GB size is for that.

### 12c. The 7 manual fund houses (Terminal B, tunnel open)

From `backend/` on the laptop, with `DATABASE_URL` set (Step 2). The commands are in `Docs/orchestration/portfolio-disclosure-manual-import-guide.md`; in bash they look like (replace names and dates with the real downloads):
```bash
DISC="/mnt/d/Portfolio Disclosures"      # the folder from Step 0b; keep the quotes, the path has a space
.venv/bin/python scripts/jobs/import_manual_portfolio_disclosures.py --amc "Edelweiss Mutual Fund" --file "$DISC/<Edelweiss file>" --as-of 2026-09-30
.venv/bin/python scripts/jobs/import_manual_portfolio_disclosures.py --amc "JM Financial Mutual Fund" --file "$DISC/<JM Large Cap file>" --file "$DISC/<JM Mid Cap file>" --as-of 2026-09-30
# ...one command per fund house whose file is in the folder (ITI, HSBC, Invesco, Mahindra, Bandhan)
```
**Good looks like:** each command prints `matched=N unmatched=M schemes_written=K`. The importer checks the file type, every member and every date **before writing anything**, and commits one fund house's call as a whole. Unknown names stay unmatched (never guessed). `schemes_written` counts failed batches too: Step 13 shows the statuses. A file refused for its type or date writes nothing and says why.

**If a file is the wrong date** (for example ITI's August workbook): do not relabel it. Import it with its true date and `--allow-old`, or wait for the right file.

### 12d. Stock fundamentals: P/E and P/B (15–40 minutes)

Run **after** 12b: it fetches ratios for every equity ISIN the funds hold, plus the Nifty 50 and 500 lists.
```bash
run_job stock-fundamentals-daily '["python","scripts/jobs/refresh_stock_fundamentals_daily.py"]'
aws logs tail /ecs/staging-job-stock-fundamentals-daily --since 60m | grep -E "stock_fundamentals_daily|STOCK_FUNDAMENTALS_ALERT" | cut -c1-200
```
**Good looks like:** exit `0` and `stock_fundamentals_daily success=True universe=<about 1,500–2,500> written=<most of them> failed=<small> seconds=...`. A few `pb_unavailable isin=...` lines are normal (new listings, gaps in Yahoo's data); they do **not** raise the alarm.
- **Exit `1`** means the bulk NSE file or the whole stock refresh failed. NSE publishes per trading day; the job steps back up to 7 days. Send Aditi the `STOCK_FUNDAMENTALS_ALERT` line.
- `index_refresh_incomplete` or `index_failed` means the Nifty 50 / 500 P/E and P/B comparison is missing (niftyindices.com refused). The portfolio's own P/E and P/B still show, without the comparison bars. Re-run once after five minutes.

### 12e. Recompute analytics for everyone
```bash
run_job analytics-recompute-daily '["python","scripts/run_analytics_recompute.py","--all"]'
aws logs tail /ecs/staging-job-analytics-recompute-daily --since 30m | grep -iE "recompute|Traceback" | tail -8
```
**Good looks like:** exit `0`, a line per household, no `Traceback`. One section failing for one household is logged and does not stop the others.

---

## Step 13 — Database checks (Terminal B)

```bash
.venv/bin/python - <<'EOF'
import os, sqlalchemy as sa
q = lambda c, s: c.execute(sa.text(s)).all()
with sa.create_engine(os.environ["DATABASE_URL"]).connect() as c:
    print("batches by status:", q(c, "SELECT status, count(*) FROM disclosure_batches GROUP BY 1 ORDER BY 1"))
    print("holdings:", q(c, "SELECT count(*), count(DISTINCT batch_id) FROM scheme_holdings"))
    print("awaiting manual upload:", q(c, "SELECT amc_name, count(*) FROM disclosure_batches WHERE status='awaiting_manual_upload' GROUP BY 1 ORDER BY 1"))
    print("failed batches by AMC:", q(c, "SELECT amc_name, count(*) FROM disclosure_batches WHERE status='failed' GROUP BY 1 ORDER BY 2 DESC LIMIT 10"))
    print("market cap rows / periods:", q(c, "SELECT count(*), count(DISTINCT effective_date) FROM market_cap_classifications"))
    print("stock_master:", q(c, "SELECT count(*), count(pe_ratio), count(pb_ratio), max(as_of_date) FROM stock_master"))
    print("index valuation rows:", q(c, "SELECT index_name, return_type, count(*), max(date) FROM benchmark_index_history WHERE return_type IN ('pe','pb') GROUP BY 1,2 ORDER BY 1,2"))
    print("price/tri untouched:", q(c, "SELECT return_type, count(*) FROM benchmark_index_history WHERE return_type IN ('price','tri') GROUP BY 1 ORDER BY 1"))
EOF
```
**Good looks like:**
- `batches by status`: mostly `written`; some `awaiting_manual_upload` for fund houses whose file you did not import; few or no `failed`.
- `holdings`: hundreds of thousands of rows (about 414,000 on the 13 October local run).
- `awaiting manual upload`: only the 7 manual fund houses, and only those not imported in 12c.
- `market cap rows / periods`: `[(21053, 4)]`.
- `stock_master`: `count` in the low thousands, `count(pe)` and `count(pb)` most of it, `max(as_of_date)` the latest NSE file date.
- `index valuation rows`: 4 combinations (Nifty 50 and 500, `pe` and `pb`) with a few rows each, latest date within the last few trading days.
- `price/tri`: counts at least what Step 7 showed (daily jobs may have added a row).

---

## Step 14 — Stop the bastion

Close every tunnel (Ctrl+C in Terminal A), then:
```bash
aws ec2 stop-instances --instance-ids "$BASTION_ID" --query "StoppingInstances[0].CurrentState.Name" --output text
aws ec2 wait instance-stopped --instance-ids "$BASTION_ID"
aws ec2 describe-instances --instance-ids "$BASTION_ID" --query "Reservations[0].Instances[0].State.Name" --output text
```
**Good looks like:** `stopping`, then `stopped`.

---

## Rollback

**1. Old backend image:**
```bash
MANIFEST=$(aws ecr batch-get-image --repository-name unifolio-staging-backend --region ap-south-1 \
  --image-ids imageTag=pre-subproject-2 --query 'images[0].imageManifest' --output text)
aws ecr put-image --repository-name unifolio-staging-backend --region ap-south-1 \
  --image-tag latest --image-manifest "$MANIFEST" --query 'image.imageId' --output json
aws ecs update-service --cluster unifolio-staging --service unifolio-staging-backend \
  --desired-count 1 --force-new-deployment --query "service.deployments[0].status" --output text
```
The new tables (`0039`–`0041`) are ignored by the old code, and the old code never reads `pe`/`pb` benchmark rows because it asks for price and TRI explicitly, so **no downgrade is needed** just to put the old image back. The three new schedules would fail on the old image: disable them with `aws scheduler update-schedule` (state `DISABLED`; copy the existing schedule's target and expression from `aws scheduler get-schedule`) or leave them: a failed task only logs an alert.

**2. Old frontend:**
```bash
aws s3 sync ~/staging-frontend-backup-$(date +%F)/ "s3://$(terraform -chdir="$REPO_ROOT/infra/envs/staging" output -raw s3_bucket_name)/" --delete
aws cloudfront create-invalidation --distribution-id "$(terraform -chdir="$REPO_ROOT/infra/envs/staging" output -raw cloudfront_distribution_id)" --paths "/*"
```

**3. Only if you must go back to `0038`:** with the backend stopped, `.venv/bin/alembic downgrade 0038`. It deletes the `pe`/`pb` benchmark rows, rebuilds the return-type enum, and drops the four new tables and their data (verified on Postgres 16: price and TRI rows survive, and a re-upgrade works).

**4. Terraform:** the new resources are additive. To remove them, `terraform destroy -target` each new resource, or revert the commit and apply. Nothing existing was changed except the scheduler's in-place policy.

**5. Stop the bastion** (Step 14).

**A data step failing (Step 12) is not a reason to roll back.** The app works without it: the sections show "no data available" or a coverage banner listing what is missing. Fix and re-run the step.

---

# Part 2 — QA on https://staging.unifolio.in

Use the **real-life synthetic statements in the repo**: `Docs/CAS Files/synthetic/pdfs/realistic/` (password `MF@123`; who is in each file: `Docs/CAS Files/synthetic/README.md`). Sign up with a new phone number for each file, using the first investor's name. Don't use `pdfs/regression/` for QA (extreme edge cases on purpose). Check **desktop and mobile**, and **light and dark** mode, on every new screen. Screenshot each check and send them to Aditi.

> **Still to fill in:** the expected numbers per statement. They come from the synthetic CAS harness checks (value checks per section), which are the next step after this guide. Until then the checks below are about structure and consistency, not exact figures.

| ID | Do | Expected |
|---|---|---|
| **S1** | Open Analytics for a family import (`r2_couple…`, then `big_family…`) | Five new sections appear after Allocation: Look-through asset allocation, Market-cap allocation, Overall stock holdings, Fund overlap, Portfolio valuation. None is stuck on a skeleton. |
| **S2** | Read the coverage banner in each new section | "Based on N% of your portfolio" is the **same number** in every section. Funds without published holdings are listed by name under "not published yet" or "not available from this fund house". |
| **S3** | Compare the "Derivative and other positions excluded" line across sections | The **same** percentage in every section (this was a real bug found in review). |
| **S4** | Overall stock holdings: top stocks, "View all", search, tap a stock | Bars split by fund with a legend; search filters the table; a stock opens its fund breakdown. "Top N stocks" shows the real N. |
| **S5** | Market-cap allocation: switch "% of total portfolio" / "% of equity only"; tap each bucket | Donut and legend change; each bucket lists its stocks. "Other / Unclassified" splits into "Not equity" and "Equity not in AMFI list". If a list is cut, it says "Showing the largest N of M". |
| **S6** | Look-through asset allocation: tick "Treat arbitrage funds as cash-like"; open the equity ring | With an arbitrage fund in the household the cash-like share rises; without one the note says so. The equity drill-down shows the cap split. |
| **S7** | Fund overlap: tap heatmap cells, the "pairs above 20%" list, the concentration curve | A pair shows its common stocks; the curve jumps to the full stock table. The note about a 70%-equity fund capping at 70% is visible. A single-fund household says overlap needs two funds. |
| **S8** | Portfolio valuation | P/E and P/B bars against Nifty 50 and Nifty 500 with a plain-language difference, and the source line (P/E from NSE, P/B from Yahoo). If under 70% of equity has a ratio it says "not enough data" and lists what is missing. |
| **S9** | Download PDF (family and a large household) | The PDF opens, shows the five new sections in that order plus Investment & Withdrawal after the fund managers, with no toggles or "View all" buttons, and finishes within about 15 seconds. **If it times out, note the household and tell Aditi; do not retry repeatedly.** |
| **S10** | A household with a fund from a manual fund house you did not import | That fund is named in the banner as "not available from this fund house"; nothing else breaks. |
| **S11** | Mobile and dark mode on S1–S8 | No horizontal page scroll, readable donuts, banner text legible. |

**Ops checks (manager, after Step 12):**
- Step 13's database output matches "Good looks like".
- `aws logs tail` for each of the three new job log groups shows no `Traceback`.
- The three alarms exist and are `OK`: `aws cloudwatch describe-alarms --alarm-name-prefix unifolio-staging --query "MetricAlarms[?contains(AlarmName,'disclosure') || contains(AlarmName,'market-cap') || contains(AlarmName,'stock-fundamentals')].{n:AlarmName,s:StateValue}"`.

**What to send Aditi:** the Step 7, 10, 12 and 13 outputs, the alarm states, and the QA screenshots.

---

# Part 3 — Next day, and each month

**The next morning** (after 06:30 IST):
```bash
aws logs tail /ecs/staging-job-portfolio-disclosures-daily --since 6h | grep refresh_portfolio_disclosures_daily
aws logs tail /ecs/staging-job-stock-fundamentals-daily --since 6h | grep stock_fundamentals_daily
```
- Both lines should say `success=True`. Before a fund house publishes the new month, the disclosure job quietly does nothing for it (no download, no alert) until its file appears.
- No alarm email unless something is genuinely wrong.

**Every month (the hand import):**
1. Around the 10th–15th, download the 7 fund houses' newest files (Step 0b table).
2. Start the bastion and the tunnel (Step 2), run the Step 12c commands with the new `--as-of` month-end, check the Step 13 `awaiting manual upload` query, stop the bastion (Step 14).
3. **Days 10 and 20 of the month** the job emails about fund houses whose file is late or still waiting for a manual upload. The alert names the fund house.

**Every January and July (market cap):** AMFI publishes the new half-year list in the first days of the month. The job runs daily on days 1–15 but only knows the URLs in `VERIFIED_PERIODS` (`backend/app/services/analytics/amfi_market_cap_client.py`). **Someone must add the new list's URL and row counts before the first run**, otherwise the market-cap alarm emails and the chart keeps using the previous list. This needs a code change and a backend rebuild.

**Before production:**
- Decide the open items: whether Bandhan stays manual, what to do about Invesco's PDF-only disclosures, which route to use for HDFC's disclosures, and whether REITs and InvITs stay under equity.
- The AMFI terms of use say "personal and non-commercial use only", the same accepted risk as the TER and AAUM feeds already in production. Yahoo's unofficial endpoint and the screener.in fallback carry the same kind of risk. Revisit all three before launch.

---

*Written 2026-10-14 from branch `feat/enhanced-ui` (HEAD after the final Sub-project 2 review fixes), the Sub-project 1 guide, `infra/` and the scripts named above.*
- *Checked against the code: the migration chain `0038` → `0041` and each migration's message; the three job entries, cron expressions and sizes in `infra/modules/scheduler/main.tf`; the 21 added resources (counted from the Terraform diff); the log lines of the three job scripts; the manual importer's options; `requirements.txt` as the only dependency change.*
- *Local results: migrations round-tripped on Postgres 16 with and without data; `terraform validate` passes; Sub-project 2 passed an independent review of every run and a final two-reviewer Opus review.*
- *Not yet done: the Terraform plan against AWS, the synthetic CAS harness value checks, the print-time check on a large household. No command in this guide has been run against AWS.*
