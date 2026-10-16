# LeapSwitch/CloudPe staging deploy

Plain-VM equivalent of AWS staging (ECS + RDS + ALB + EventBridge), for the
single `a.gp1.16g` CloudPe VM. Full rationale, decisions and open items:
`Docs/orchestration/leapswitch-staging-plan.html`. Additive only — nothing
here changes AWS staging or production.

## Layout

- `docker-compose.yml` — postgres, backend, worker (D2's worker-container
  recompute dispatcher), caddy (reverse proxy + automatic HTTPS + static
  frontend host).
- `Caddyfile` — `ls-staging.unifolio.in` (frontend) and
  `ls-staging-api.unifolio.in` (backend) site blocks.
- `.env.example` — copy to `.env` on the VM (`chmod 600`, root-only), fill in
  real values. Never commit the real `.env`.
- `crontab.leapswitch` — replaces AWS's 11 EventBridge-scheduled jobs with
  plain cron, via `scripts/run-job.sh`.
- `scripts/run-job.sh` — runs one job, emails a failure alert on nonzero exit
  (reuses the existing SES email provider — see `backend/scripts/
  send_job_failure_alert.py`).
- `scripts/deploy.sh` — builds the frontend static bundle and
  `docker compose up -d --build`s the stack. Tags the previous backend/worker
  images `:previous` first so `scripts/rollback.sh` can undo it.
- `scripts/rollback.sh` — retags `:previous` back to `:latest` and restarts,
  no rebuild. Undoes the backend/worker image only — see its header comment
  for what it doesn't cover.
- `scripts/backup.sh` / `scripts/restore.sh` — nightly Postgres logical
  backup to CloudPe object storage (cron entry already in
  `crontab.leapswitch`, 7-day retention, alerts on failure), and restoring
  one back in.
- Full step-by-step deploy guide, with exact commands and expected output for
  every step: `Docs/orchestration/leapswitch-staging-deploy-guide.md`.

## First-time setup on the VM (Phase 2+, needs the CloudPe dashboard first)

1. Clone this repo, `cd deploy/leapswitch`.
2. `cp .env.example .env`, fill in every value (DB password, PAN keys, SES
   credentials, object storage credentials once CloudPe confirms encryption —
   see the plan's D3/D4/D5 sections for what's safe to fill in before that).
3. `./scripts/deploy.sh` — first run builds the frontend and brings up
   postgres/backend/worker/caddy. Caddy requests its Let's Encrypt
   certificates automatically on first request to each domain (DNS must
   already point at this VM's floating IP).
4. `crontab crontab.leapswitch` (after editing its `RUN=` path to match where
   this repo actually lives on the VM) to install the job schedule.
5. Run database migrations once: `docker compose run --rm backend alembic upgrade head`
   (check `backend/alembic.ini`/the migrations folder for the exact command
   this repo uses, if different).

## Re-deploying after a code change

`git pull && ./scripts/deploy.sh` — rebuilds the backend/worker image and the
frontend bundle, restarts anything that changed. Postgres data persists in
the `pgdata` named volume across this. If there's a DB migration, or anything
risky, use the full checklist instead:
`Docs/orchestration/leapswitch-staging-deploy-guide.md`.

If the deploy goes bad, `./scripts/rollback.sh` reverts the backend/worker
image to the one running before the last `deploy.sh` run, no rebuild needed.

## Resetting before a real-data test round

`scripts/clean-db.sh` implements D5's third standing condition (see the
plan): wipes all user-domain data (users, household members, imports,
folios, transactions, etc.) so every signup during the round is genuinely
new, leaving reference/platform data untouched. Run on the VM before each
real-data round starts:

```
sudo ./scripts/clean-db.sh
```

## Backups

`scripts/backup.sh` is a logical (`pg_dump`) backup, independent of whatever
CloudPe's block-volume snapshot story turns out to be (open item in the
plan — needs an OpenStack application credential to test directly). Already
scheduled nightly at 1 AM IST via `crontab.leapswitch` (`BACKUP=` line),
before the 05:45 batch-job window — no separate cron setup needed. Keeps 7
days of dumps in CloudPe object storage and emails on failure. Run it
manually before anything risky with `./scripts/backup.sh`.

## Reverting to AWS staging

If this doesn't work out, see the plan's "The other direction: abandoning
CloudPe and going back to AWS staging" section — `scripts/staging-state.sh
minimal` plus a DNS edit, nothing here needs to be undone first.
