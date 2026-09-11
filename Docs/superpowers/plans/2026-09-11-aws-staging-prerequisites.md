# AWS staging: prerequisites & deployment runbook

**Date:** 2026-09-11
**Status:** Planning/documentation only. No command below has been executed by
Claude — every AWS-state-mutating or credential-bearing step is marked
**[user-run]**, per this project's established division of labor (Claude/Codex
never runs `terraform apply`, `docker push`, `aws ecs update-service`, or any
other state-mutating AWS command).

This supersedes §2's sequencing in
`Docs/superpowers/plans/2026-09-10-feat-enhanced-ui-to-staging-push-plan.md`
now that its step 1 (frontend precompute migration) and step 7 (dispatcher
wiring) are both done — this doc reflects current state and gives exact
commands where the prior doc gave a plan-level description.

## 1. Where things stand right now

**Code — all done, both suites green:**
- Frontend 14→1 analytics-route migration: done (`b972e65`), both desktop and
  mobile consumers use the consolidated `useAnalyticsScope` hook.
- Analytics-recompute dispatcher wired to real ADR-006 ECS infra: done
  (`20a825e`) — Terraform-authored, not yet applied (see §1 Terraform below).
- Google Sign-In hidden client-side pending real OAuth config: done
  (`83a3749`), deliberate 2026-09-11 scope decision, not a bug.
- Investor feature batch (Profile, account deletion, contact-change OTP,
  theme toggle, import history/delete, Dashboard XIRR, allocation sort, AMC
  drill-down) plus this session's PM-gap-analysis follow-ups (XIRR
  lifetime/current toggle replacing the dismiss-less popover, drill-down
  modal subtotal, `functional_postgres` cascade-delete test coverage): all
  done and independently verified this session — backend 649 passed/8
  skipped, frontend 437 passed/79 files, `tsc -b --noEmit` clean.
- Mandatory adversarial-review gate for the two most recent orchestrator-direct
  fix rounds (round-3 P1/P2 fixes, this session's PM-gap fixes) is **deferred,
  not skipped** — Codex was unavailable this session; both rounds are logged
  in `Docs/orchestration/delegation-log.md` and owe a review pass once Codex
  is back.

**Git:**
- `feat/enhanced-ui` is the sole active branch, ahead of `origin/feat/enhanced-ui`
  and not yet pushed. `main`/`production` are confirmed zero-divergence
  fast-forward ancestors (verified 2026-09-10) — no merge-conflict risk when
  promoting, but re-confirm with a fresh `git merge-base` check before Step 1
  below, since more commits have landed since that check.

**AWS — live in `ap-south-1`, account `811364789032`:**
- Phases 1-3 (networking, RDS, ECS/ALB/ECR) applied and healthy, per
  `session.md`'s 2026-09-09 entry.
- **RDS schema is stale.** `alembic current` was last confirmed at `0011`.
  Three migrations have landed since and are NOT yet applied to real RDS:
  `0012_analytics_sections`, `0013_account_deletion_grace_period`,
  `0014_analytics_recompute_generation`. Current local head is `0014`.
- **The deployed ECR image is stale** — built before the precompute merge,
  the frontend migration, the dispatcher wiring, the account-deletion
  feature, and this session's PM-gap fixes. It does not match what's on
  `feat/enhanced-ui` today.
- **Terraform has unapplied changes**, beyond the already-known Phase 4/5:
  - `infra/modules/backend`: a new ECS task definition + IAM task role for
    `EcsRunTaskDispatcher` (from `20a825e`) — authored, reviewed, not applied.
  - `infra/modules/scheduler`: 2 new jobs beyond the original 4
    (`analytics_recompute --all` daily backstop, `delete_expired_accounts_daily`)
    — authored, reviewed, not applied. Only the original 4 jobs are live.
  - `infra/modules/frontend` (Phase 4, S3+CloudFront): authored, reviewed,
    not applied.
  - `infra/modules/dns` (Phase 5, ACM/Route 53/ALB HTTPS): authored,
    reviewed, not applied, gated on Phase 4 being applied first.

## 2. Manual/external prerequisites — verify before running §3

- [ ] **AWS CLI v2 + Terraform 1.16.1 + `aws configure`.** Already set up in
  the 2026-09-09 session. Just confirm credentials are still valid:
  `aws sts get-caller-identity` should return the `ayush-admim` IAM user.
- [ ] **Docker Desktop WSL integration — re-verify, don't assume.** This
  session's WSL distro could not reach `docker` at all (the binary only
  existed at the Windows-side path, `/mnt/c/Program Files/Docker/Docker/
  resources/bin/docker`, and WSL integration was off for this distro). A
  prior session (2026-09-09) successfully ran `docker build`/`push` from a
  WSL terminal, so this is either distro-specific state or was toggled off
  since — don't assume the earlier success still holds. Before Step 3,
  open Docker Desktop → Settings → Resources → WSL Integration and confirm
  the distro you're building from is enabled, or build from a native
  Windows PowerShell/cmd terminal instead.
- [ ] **No concurrent Terraform run against the same state.** S3+DynamoDB
  locking should already prevent this, but worth a sanity check before a
  multi-module apply session touching `backend`, `scheduler`, `frontend`,
  and `dns` in one pass.
- [ ] **Secrets Manager RDS password retrieval — use the safe pattern.**
  Re-read `session.md`'s 2026-09-09 note before typing the migration
  commands in §3 Step 2: the master password contains shell metacharacters
  (`$`), and interpolating it directly into a double-quoted shell string
  will silently corrupt it via bash variable expansion. Always pipe it
  through `python3 -c` reading `os.environ`, never as a literal in a
  quoted string.
- [ ] **Google OAuth stays unconfigured for this pass** — deliberate
  2026-09-11 scope decision, not a prerequisite to fix. Don't accidentally
  re-enable the sign-in button while touching auth-adjacent code.

## 3. Command sequence

Everything below is **[user-run]** — commands to execute yourself, given here
for reference so each step doesn't need to be re-derived live. Placeholder
values (`<...>`) should be pulled fresh via `terraform output` in
`infra/envs/staging` rather than hardcoded from a prior session, since
resource IDs can change across applies.

### Step 1 — Push code, promote branches

```bash
git push origin feat/enhanced-ui
git checkout main && git merge --ff-only feat/enhanced-ui && git push origin main
git checkout production && git merge --ff-only feat/enhanced-ui && git push origin production
git checkout feat/enhanced-ui
```

Re-run `git merge-base main feat/enhanced-ui` and confirm it equals `main`'s
current HEAD immediately before this step — the last confirmation is from
2026-09-10, more commits have landed since.

### Step 2 — Apply RDS schema migrations (0012, 0013, 0014)

Via the same SSM bastion port-forward used for the original Phase 2 migration:

```bash
aws ssm start-session --target <bastion-instance-id> \
  --document-name AWS-StartPortForwardingSessionToRemoteHost \
  --parameters '{"host":["<rds-endpoint>"],"portNumber":["5432"],"localPortNumber":["5433"]}'
```

In a second terminal, fetch the master password safely:

```bash
export DB_PASSWORD=$(aws secretsmanager get-secret-value --secret-id <rds-secret-arn> \
  --query SecretString --output text | python3 -c "import json,sys; print(json.load(sys.stdin)['password'])")
```

Then from `backend/`, with the project `.venv` active:

```bash
export DATABASE_URL="postgresql+psycopg2://<db-user>:${DB_PASSWORD}@127.0.0.1:5433/<db-name>"
python -m alembic upgrade head
python -m alembic current   # confirm 0014 (head)
```

### Step 3 — Rebuild & push the backend Docker image

Only after confirming Docker Desktop WSL integration per §2:

```bash
cd backend
docker build -t unifolio-staging-backend .
aws ecr get-login-password --region ap-south-1 | \
  docker login --username AWS --password-stdin 811364789032.dkr.ecr.ap-south-1.amazonaws.com
docker tag unifolio-staging-backend:latest \
  811364789032.dkr.ecr.ap-south-1.amazonaws.com/unifolio-staging-backend:latest
docker push 811364789032.dkr.ecr.ap-south-1.amazonaws.com/unifolio-staging-backend:latest
```

### Step 4 — Apply Terraform (backend + scheduler changes, then Phase 4, then Phase 5)

```bash
cd infra/envs/staging
terraform init
terraform plan -out=tfplan
```

Review the plan carefully before applying — expect **additive-only** changes:

- `modules/backend`: +1 ECS task definition, +1 IAM task role (dispatcher).
- `modules/scheduler`: +2 EventBridge schedules, +2 task definitions, +2
  CloudWatch log groups (`analytics_recompute --all` backstop,
  `delete_expired_accounts_daily`) — the original 4 jobs are unaffected.
- `modules/frontend`: new S3 bucket + CloudFront distribution (Phase 4).
- `modules/dns`: new ACM certs, Route 53 alias records, ALB HTTPS listener,
  HTTP→HTTPS redirect (Phase 5).

If anything shows as **destroyed**, stop and don't apply — that's not
consistent with the additive changes described above and needs review first.

```bash
terraform apply "tfplan"
```

### Step 5 — Force a fresh ECS deployment

Picks up the new image (Step 3) and the dispatcher's new task-def env vars
(Step 4):

```bash
aws ecs update-service --cluster unifolio-staging \
  --service unifolio-staging-backend --force-new-deployment
```

Verify with the same 4-check bar from the original Phase 3 push
(`session.md`, 2026-09-09): ALB target-group health via
`aws elbv2 describe-target-health`, clean `/ecs/staging-backend` logs, one
real DB-touching request (e.g. `POST /auth/email-otp/request` with
`OTP_DELIVERY_MODE=stub`), and `RUNNING` task with a stable `startedAt`.

### Step 6 — Rebuild & upload the frontend

```bash
cd frontend
VITE_API_BASE_URL=https://staging-api.unifolio.in npm run build
aws s3 sync dist/ s3://<phase-4-bucket-name>/ --delete
aws cloudfront create-invalidation --distribution-id <phase-4-distribution-id> --paths "/*"
```

No `VITE_GOOGLE_OAUTH_CLIENT_ID` — deliberately unset per the 2026-09-11
scope decision (§1).

### Step 7 — One-off seed run for the 2 new scheduled jobs

The original 4 jobs already ran once manually (2026-09-10, confirmed
working after the `min()`/`max()` fix now riding along in Step 3's image).
The 2 new ones need the same one-off confirmation before waiting on their
first real cron fire:

```bash
aws ecs run-task --cluster unifolio-staging \
  --task-definition <analytics-recompute-task-def-arn> --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[<subnet-ids>],securityGroups=[<sg-id>],assignPublicIp=DISABLED}"
# repeat with the delete-expired-accounts task-def-arn
```

Then check `aws logs tail /ecs/staging-job-<slug>` for each to confirm a
clean exit, not just a `RUNNING` state.

### Step 8 — Full smoke-test pass (Phase 6)

Per `AWS Readiness/aws-golive-readiness-report.md` §17/§22 Phase 6: CAS
import incl. password-retry, dashboard/holdings/allocation, analytics
(now backed by the real dispatcher instead of perpetually-pending), PDF
export, empty-state for a brand-new user, confirm RDS automated backups are
enabled, watch CloudWatch live during the pass. Google Sign-In and real OTP
delivery are explicitly excluded from this pass (2026-09-11 scope decision) —
not a gap to chase before beta opens.

### Step 9 — Staging CI/CD pipeline (task #20)

Comes after Step 8, not deferred further. Open design question carried over
unchanged from the 2026-09-10 push plan: how `alembic upgrade head` runs in
the pipeline — leaning toward a pre-deploy one-off ECS `RunTask`, matching
the ADR-006/dispatcher `RunTask` pattern already in this repo. Needs a
decision before drafting; no commands given here since the design isn't
finalized yet.

## 4. Explicitly out of scope for this doc

- **Phase 7 hardening** (moving the 7 in-process caches off single-task-only
  state — flagged in the readiness report as the highest-priority item given
  the ~1,000 MAU target — real Google OAuth/OTP providers, NAT Gateway swap,
  structured logging/error tracking): deferred, scoped separately once
  actually needed, per `AWS Readiness/aws-golive-readiness-report.md` §22
  Phase 7.
- **Exact resource-ID placeholders** (`<bastion-instance-id>`,
  `<rds-endpoint>`, `<rds-secret-arn>`, bucket/distribution IDs): deliberately
  not hardcoded here from a prior session's values — pull fresh via
  `terraform output` in `infra/envs/staging` at execution time, since IDs
  can drift across applies.
