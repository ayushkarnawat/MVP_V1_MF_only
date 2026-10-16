# LeapSwitch/CloudPe Staging Deploy Guide

The CloudPe equivalent of the AWS staging deploy guides (e.g.
`2026-10-14-staging-deploy-guide-subproject-2.md`) — same rigor, every
command, every expected output, every known failure. This one isn't tied to
one feature: re-run it, unchanged, for every future push to
`ls-staging.unifolio.in`. Full migration rationale/decisions:
`Docs/orchestration/leapswitch-staging-plan.html`.

**Needs:** SSH access to `deploy@202.66.174.251` (your IP must be in
CloudPe's `unifolio-web` security group — see the plan's Troubleshooting
section if SSH times out), the repo cloned locally to run `git push` from.

**Not yet exercised live, as of 16 Oct 2026:** the `:previous` tagging in
`deploy.sh` and `rollback.sh` itself were written and pulled onto the VM,
but deliberately not run against the live stack to test them — testers are
already using this environment, and a live rehearsal would mean an
unnecessary restart. Their first real exercise will be whatever deploy
(Step 3/5 below) and, if ever needed, whatever rollback actually come next.
If that first real run of either doesn't match "Good looks like" below,
treat this note as the reason why, not the script.

**When:** any time — there's no bastion to start, no scheduled-job window to
dodge the way AWS staging has. Just avoid the 00:55–06:35 IST cron window
(`crontab.leapswitch`) if you can, since a restart there could land mid-job.

**Time:** 5–15 minutes for a no-migration change (most of it is `npm ci`).
Add 2–3 minutes if there's a migration. No separate "push the image"
step — it's built directly on the VM, so build time **is** deploy time.

**Downtime:** `docker compose up -d --build` recreates `backend`/`worker`
with a brief gap (a few seconds, once the new image is built) between the
old container stopping and the new one passing its healthcheck. Caddy queues
requests during this, it doesn't go down itself. If there's a migration, see
Step 4 — that one does have a deliberate, longer stop.

**Why this is so much shorter than the AWS guide:** no bastion/tunnel (SSH
is direct), no ECR push (image is built where it runs), no Terraform (there
is no infra layer here — a `docker-compose.yml`/`Caddyfile`/
`crontab.leapswitch` edit *is* the infra change), no S3+CloudFront for the
frontend (Caddy reads `frontend/dist` straight off disk). The AWS guide's
steps 2, 8, 9's CloudFront half, and 10 simply don't exist on CloudPe.

## Order of steps

| Step | What | Site |
|---|---|---|
| 0 | Commit, push | — |
| 1 | SSH in, `git pull` | up |
| 2 | Check current migration (expect it matches what you shipped last time) | up |
| 3 | Build the new backend/worker images (tags the old ones `:previous` first) | up |
| 4 | **Only if there's a migration:** stop backend/worker, migrate, note the gap | down |
| 5 | Build + deploy frontend, bring the stack up | up |
| 6 | Health check | up |
| 7 | One-off data jobs, if any (`run-job.sh`) | up |
| — | Rollback (if Step 5/6 goes bad) | — |

---

## Step 0 — Commit and push

```bash
git status --short
```

**Good looks like:** nothing you want in this deploy left as `??`/unstaged.
Then:

```bash
git add -A && git commit -m "..." && git push
```

**Never commit a real `.env` or a real CAS statement.** If this deploy
touches `deploy/leapswitch/`, double check:

```bash
git status --short --untracked-files=all | grep -i "deploy/leapswitch/.env"
```

**Good looks like:** no output.

---

## Step 1 — SSH in, pull

```bash
ssh deploy@202.66.174.251
cd /opt/unifolio/deploy/leapswitch
git pull
```

**Good looks like:**

```
Updating bc46d0b..<new commit>
Fast-forward
 ...
```

**If it says `Already up to date.`:** your push from Step 0 didn't land, or
you're pulling before GitHub's finished — re-check `git log -1` locally vs.
here.

**If `git pull` fails with local changes/conflicts:** something was edited
directly on the VM outside git (shouldn't happen — `.env` is the only file
meant to differ, and it's gitignored). Run `git status` here and `git stash`
before retrying, don't `git checkout -- .` blind.

---

## Step 2 — Check the current migration

```bash
sudo docker compose run --rm -T backend alembic current
```

**Good looks like:**

```
INFO  [alembic.runtime.migration] Context impl PostgresqlImpl.
INFO  [alembic.runtime.migration] Will assume transactional DDL.
0041 (head)
```

Use `docker compose run`, not `exec` — `exec` targets the already-running
`backend` container, which can be stale relative to `docker-compose.yml` (it
won't pick up a newly added bind mount, for instance, until it's recreated).
`run` always builds a fresh container from the current compose file, so it's
the only one you can trust here.

Note the revision shown — if your change includes a new migration, the
**old** revision shown here is what Step 4's `alembic upgrade head` is
starting from. Confirm it matches what the previous deploy actually shipped
(check the previous entry in this guide's own revision history, or the last
deploy's git log).

---

## Step 3 — Build the new images

```bash
for svc in backend worker; do
	sudo docker image inspect "leapswitch-${svc}:latest" >/dev/null 2>&1 && \
		sudo docker tag "leapswitch-${svc}:latest" "leapswitch-${svc}:previous"
done
sudo docker compose build backend worker
```

(This is also done automatically inside `scripts/deploy.sh` — shown here
broken out so a migration, if any, can sit between build and restart. If
there's no migration this step and Step 5 collapse into just running
`scripts/deploy.sh` — see "The short path" below.)

**Good looks like:** ends with

```
 => => naming to docker.io/library/leapswitch-worker:latest
```

for both images, no `ERROR` lines. Building doesn't touch the running
containers yet — `backend`/`worker` keep serving the old code until Step 5's
`docker compose up`.

**If the build fails** (missing dependency, syntax error, etc.): nothing
live is affected. Fix it, `git pull` again if you pushed a fix, and re-run
this step. The `:previous` tag already taken is untouched.

---

## Step 4 — Only if this deploy includes a migration

Skip this step entirely if it doesn't — go straight to Step 5.

```bash
sudo docker compose stop backend worker
sudo docker compose run --rm -T backend alembic upgrade head
```

**Good looks like:**

```
INFO  [alembic.runtime.migration] Running upgrade 0041 -> 0042, <message>
```

one line per migration applied, ending back at a clean exit (no traceback).
Verify:

```bash
sudo docker compose run --rm -T backend alembic current
```

should now show your new revision as `(head)`.

**If the migration fails partway:** Alembic runs each revision in its own
transaction, so a failed one rolls back cleanly — `alembic current` will
still show the old revision. Fix the migration file, `git pull`, retry this
step. Do **not** proceed to Step 5 with `backend`/`worker` stopped and a
half-applied migration; the site stays down until this resolves, same as the
AWS guide's equivalent step.

**Downtime note:** the site is down (502 from Caddy) from the `stop` above
until Step 5's `up` finishes healthchecking the new containers. Keep this
window short — have the migration tested locally first the way the AWS
guide's Step 1 pre-flight does (same `pytest`/local Postgres run, no CloudPe
equivalent needed since it's just local Docker either way).

---

## Step 5 — Build + deploy the frontend, bring the stack up

```bash
./scripts/deploy.sh
```

This re-tags `:previous` (a no-op if Step 3 already did it), builds the
frontend (`npm ci && npm run build`, writing straight into
`../../frontend/dist` on the VM's disk — no S3/CloudFront, Caddy reads this
path directly per the Caddyfile's `root * /srv/frontend`), then
`docker compose up -d --build`.

**Good looks like:** the npm build ends with

```
✓ built in <N>s
```

then:

```
 Container leapswitch-postgres-1  Running
 Container leapswitch-backend-1   Started
 Container leapswitch-worker-1    Started
 Container leapswitch-caddy-1     Started
```

(`caddy` usually says `Running`, not `Started`, if its config didn't
change — that's fine.)

**If `npm ci` fails** (registry timeout, lockfile mismatch): nothing was
deployed yet — `backend`/`worker` are still on the old image (or stopped, if
you're mid-Step-4). Fix and re-run `./scripts/deploy.sh`.

**If `docker compose up` reports a container unhealthy/restarting:** check

```bash
sudo docker compose logs backend --tail 50
```

Common cause: a migration Step 4 should have caught wasn't actually needed
by the new code (i.e., you skipped Step 4 but should've run it). Go to
Rollback below.

---

## Step 6 — Health check

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://ls-staging-api.unifolio.in/health
curl -s -o /dev/null -w "%{http_code}\n" https://ls-staging.unifolio.in/
```

**Good looks like:** `200` for both. Then actually load
`https://ls-staging.unifolio.in` in a browser and confirm the feature you
shipped is there — curl only proves the process answers, not that your
change works (same caveat as the AWS guide).

**If the API returns `502`:** `backend` container isn't up yet or crashed —
re-check `docker compose logs backend`.

**If the frontend returns `200` but shows old content:** the browser cached
the old bundle — hard refresh. Vite's build hashes filenames, so this should
be rare; if `index.html` itself is cached (shouldn't be — no explicit
cache-control is set in the Caddyfile beyond `encode gzip`), that's worth
fixing separately, not a deploy-process problem.

---

## Step 7 — One-off data jobs, if any

Same pattern as the AWS guide's data-loading step, just run directly instead
of via a bastion:

```bash
sudo ./scripts/run-job.sh <job-name> scripts/jobs/<script>.py
```

**Good looks like:** the script's own log output, ending in a clean exit
(`echo $?` → `0`). On nonzero exit, `run-job.sh` already emails
`OPS_ALERT_EMAIL` via SES automatically — you don't need to watch the
terminal for this part the way the AWS guide's Step 12 does.

---

## Rollback

If Step 5 or 6 goes bad and the fix isn't quick:

```bash
./scripts/rollback.sh
```

Retags `leapswitch-backend:previous`/`leapswitch-worker:previous` back to
`:latest` (the images Step 3 saved before building) and restarts — no
rebuild, so it's fast.

**Good looks like:**

```
 Container leapswitch-backend-1  Started
 Container leapswitch-worker-1   Started
```

then Step 6's health check passing again.

**What this does not cover:**
- **The frontend bundle.** `rollback.sh` only retags Docker images; the
  frontend is static files on disk, already overwritten by Step 5's build.
  To revert it: `git checkout <previous-commit> -- frontend` on the VM, then
  re-run the frontend half of `scripts/deploy.sh` (the `docker run ... npm
  run build` block), then `git checkout <new-commit> -- frontend` once
  you're ready to retry forward.
- **A migration.** There is no `alembic downgrade` step here by design —
  same reasoning as the AWS guide: downgrades are rarely tested and risk
  losing data written under the new schema. If Step 4 ran and needs
  undoing, that's a deliberate, hand-written downgrade migration, not a
  rollback-script job.
- **Only one previous image is kept.** `:previous` is overwritten every time
  Step 3 runs — this undoes the *last* deploy, not an arbitrary earlier one.
  For anything older, `git checkout` the old commit and rebuild.

---

## The short path (most deploys: no migration)

Steps 1, 3, 5, 6 collapse to:

```bash
ssh deploy@202.66.174.251
cd /opt/unifolio/deploy/leapswitch
git pull
./scripts/deploy.sh
curl -s -o /dev/null -w "%{http_code}\n" https://ls-staging-api.unifolio.in/health
```

(`deploy.sh` already does Step 3's tagging and build itself — Step 3 is
only broken out above so a migration can be slotted in between build and
restart.)

---

## Part 2 — Database checks, backups, restores

Same SQLAlchemy/`psql` sanity queries as the AWS guide, just run directly
over SSH instead of a bastion tunnel:

```bash
sudo docker compose exec -T postgres psql -U "$DB_USERNAME" "$DB_NAME" -c "\dt" | wc -l
```

**Good looks like:** the table count you expect after this deploy's
migrations (57 as of 16 Oct 2026, before any new migration in this deploy).

Backups run nightly on their own (`crontab.leapswitch`'s `BACKUP=` line, 1 AM
IST, 7-day retention, alerts on failure — see `scripts/backup.sh`). Before
anything you're unsure about, take one by hand:

```bash
sudo ./scripts/backup.sh
```

To restore a dump — **never into the live `postgres` service** — spin up a
disposable container instead:

```bash
docker run -d --name restore-scratch -e POSTGRES_USER="$DB_USERNAME" \
	-e POSTGRES_PASSWORD="$DB_PASSWORD" -e POSTGRES_DB="$DB_NAME" postgres:16-alpine
# wait for it to accept connections, then:
gunzip -c <dump>.sql.gz | docker exec -i restore-scratch psql -U "$DB_USERNAME" "$DB_NAME"
docker rm -f restore-scratch
```

`scripts/restore.sh` itself targets the live service and is destructive
(drops/recreates tables) — only run it as-is against a VM you've already
decided to fully reset, never casually.

---

## Part 3 — Things that aren't "a deploy" but come up

- **Editing the cron schedule:** edit `crontab.leapswitch` in the repo,
  commit/push/pull as usual, then `sudo crontab deploy/leapswitch/crontab.leapswitch`
  on the VM (no service restart needed — cron re-reads on the next minute
  tick after a `crontab` install).
- **Editing the Caddyfile** (new subdomain, routing change): edit, pull,
  then `sudo docker compose up -d caddy` — Caddy reloads its config on
  restart and re-requests Let's Encrypt certs automatically if a new domain
  was added (DNS must already point here).
- **"Infra" changes in general:** there's no Terraform layer to plan/apply.
  A new background service, a new scheduled job, a new domain — all of it is
  a hand-edit to `docker-compose.yml`/`crontab.leapswitch`/`Caddyfile` in
  this same repo, deployed the same way as any other code change (Steps 1,
  3, 5).
- **Resetting before a real-data/tester round:** `sudo ./scripts/clean-db.sh`
  wipes user-domain data only (users, imports, folios, etc.), leaving
  reference/platform data untouched — see the README's "Resetting before a
  real-data test round" section.
