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
  `docker compose up -d --build`s the stack.
- `scripts/backup.sh` / `scripts/restore.sh` — daily Postgres logical backup
  to CloudPe object storage, and restoring one back in.

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
the `pgdata` named volume across this.

## Backups

`scripts/backup.sh` is a logical (`pg_dump`) backup, independent of whatever
CloudPe's block-volume snapshot story turns out to be (open item in the
plan — needs an OpenStack application credential to test directly). Run it
from cron too, or manually before anything risky:

```
0 2 * * * cd /opt/unifolio/deploy/leapswitch && ./scripts/backup.sh
```

## Reverting to AWS staging

If this doesn't work out, see the plan's "The other direction: abandoning
CloudPe and going back to AWS staging" section — `scripts/staging-state.sh
minimal` plus a DNS edit, nothing here needs to be undone first.
