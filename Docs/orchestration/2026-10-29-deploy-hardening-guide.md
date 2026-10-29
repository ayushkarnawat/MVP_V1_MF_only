# Staging VM deploy hardening (H1 to H4, cache cap, one image)

Written 2026-10-29 after the staging disk-full incident (register C185, `log.md` 2026-10-29). Branch `feat/deploy-hardening`, built from `leapswitch-redesign`. Read this before any staging deploy on the LeapSwitch VM. The disk resize runbook is `2026-10-29-vm-disk-resize-runbook.md`; this guide is the fix that should make the resize unnecessary.

## 1. What went wrong, in short

A front-end-only change was deployed with `--full`. The backend and worker images rebuilt from scratch (about 2 GB each) on a disk of about 27 GB that also holds Postgres. Free space fell from 3.5 GB to 239 MB and the build failed. The new front end was already live, because the old script built it first.

**What the VM showed on 29 Oct (read-only commands).** `df`: 29 GB, 25 GB used, 3.5 GB free. `docker system df`: images 7.1 GB (2.2 GB reclaimable), build cache 8.4 GB (2.0 GB private, 6.4 GB shared with running images), volumes 3.2 GB (the database). The cache held four separate ~2 GB pip layers made 5 days, 36 h, 21 h and 20 h ago, and `requirements.txt` has not changed since 13 Oct. So the cache was NOT evicted; every deploy still made a new copy of the same layer. The real reason is not proven. The fix below does not depend on it: the backend is simply not rebuilt unless `backend/` changed.

## 2. What was built

| Item | What it does | Where |
|---|---|---|
| H1 | Warns (never silently refuses) when free space on the Docker disk is under 10 GB before a backend build, or under 1 GB before a front-end-only deploy. Asks y/N; with no terminal it stops unless `--force`. | `scripts/lib-deploy.sh` `check_free_space`, used by `deploy.sh` and `deploy-redesign.sh` |
| H2 | `--full` rebuilds the backend only if `backend/` differs from the last deployed commit (committed, uncommitted or untracked changes all count). Rebuilds whenever in doubt: no record, no `leapswitch-backend:latest`, recorded commit unknown to this clone. `--rebuild-backend` forces it. | `lib-deploy.sh` `backend_needs_build` |
| H3 | The worker container runs the backend's image (`image: leapswitch-backend:latest`, `pull_policy: never`); only one image is built. | `docker-compose.yml` |
| H4 | The backend image is built BEFORE the new front end goes live. A failed build exits before the front end, restores `:latest` to the image that was running, and does not record the commit. `:previous` is tagged only after a successful build. | `deploy.sh` |
| Cache cap | After a successful backend build: `docker image prune -f` (dangling images only) and `docker builder prune --keep-storage 3GB -f` (old build layers beyond the newest 3 GB). Never volumes, containers or tagged images. | `deploy.sh` |

Not built (needs the owner's go because it changes the crontab): an alert at about 80% disk use.

**State record.** `/var/lib/unifolio-deploy/last-backend-commit` holds the commit of the last successful backend build. It lives outside the repo because the main clone and the redesign worktree deploy the same image. Seeded on 29 Oct with `1e1af905`.

**Tests.** `sh deploy/leapswitch/tests/test-deploy.sh` (fake `docker` and `df`, a throwaway git repo; 32 checks: skip when unchanged, build when changed or uncommitted or untracked, build order, low-disk warning and `--force`, failed-build behaviour). Not a substitute for one real `--full` on the VM after merging.

## 3. The worker image, and why one image is enough

An **image** is the installed program (files on disk). A **container** is a running copy of it. The backend and the worker are two containers; they always ran the same code, differing only in the start command (`uvicorn app.main:app` vs `uvicorn app.worker_server:app`). The old compose file built the same Dockerfile twice by default, giving two identical-purpose ~2 GB images. The staging plan itself says "a second container from the same image".

What stays the same: both containers keep running; the worker keeps its limits (1 CPU, 3 GB, at most 3 recompute jobs at once); the backend keeps its 3 uvicorn workers. How many people use the app at once, and how large a portfolio is, depend on those settings and the data, not on how many image copies sit on disk. Only the duplicate copy of the files goes away (about 2.2 GB).

**Order of removal (do not skip):**
1. Merge/pull this branch in `/opt/unifolio-redesign`.
2. `sudo docker compose up -d` there (no build): the worker container is recreated from `leapswitch-backend:latest`.
3. Confirm `sudo docker compose ps` shows all four healthy and the health URLs return 200.
4. Only then `sudo docker rmi leapswitch-worker:latest leapswitch-worker:previous` (Docker refuses while a container still uses it).

**Caution.** `/opt/unifolio` (the main clone, `ls-staging`) still has the old compose file with a worker `build:` until it gets this change. Backend and worker deploys run only from the redesign worktree (handoff rule), and `docker compose up` from the main clone before it is updated would try to rebuild the worker. Do not run it.

### 3a. The main clone and the old worker build (READ BEFORE ANY `ls-staging` DEPLOY)

Until `/opt/unifolio` (the main clone, branch `feat/leapswitch-staging`, serves `ls-staging`) contains this change, its `docker-compose.yml` still gives the worker its own `build:`. Running `docker compose up -d --build`, or `deploy.sh` from that old checkout, would rebuild a separate ~2 GB worker image: the exact disk problem again, and a worker built from the old compose file.

Rules until the main clone has this branch:
1. Backend and worker deploys run only from `/opt/unifolio-redesign` (existing handoff rule).
2. Do not run `docker compose up` or `deploy.sh` from `/opt/unifolio`.
3. When the redesign is merged into `feat/leapswitch-staging` (section 6), that merge carries this compose change, so the main clone gets it. Before the FIRST deploy from the main clone after that merge, run `grep -n -A3 "worker:" deploy/leapswitch/docker-compose.yml` there and confirm it shows `image: leapswitch-backend:latest` and no `build:`.
4. Never delete `/var/lib/unifolio-deploy/last-backend-commit`; if the main clone's `git cat-file` does not know the recorded commit it will rebuild (safe, but check disk first).

### 3b. Do I need `--full` at all? (decide before typing it)

`--full` is for a backend change only. Before choosing it, run in the clone you deploy from:
`git diff --stat $(sudo cat /var/lib/unifolio-deploy/last-backend-commit) HEAD -- backend`
- Empty output: front-end-only (or docs/deploy-script) change. Use the no-flag form. No `--full`.
- Not empty: a backend change. Use `--full`; the script re-checks this itself and prints why it builds or skips.
A changed `deploy/leapswitch/` script or compose file is not a backend change; the no-flag form plus `sudo docker compose up -d` applies it. Nothing needs to be deployed at all when only docs changed.

## 4. Safe cleanup on 29 Oct (reclaims about 4 GB, no resize)

**Done by the owner on the VM, 29 Oct:** `docker rmi leapswitch-backend:pre-redesign` (untagged and deleted) and `docker builder prune -f` (4.05 GB reclaimed). `df -h /`: 29 GB, 20 GB used, **8.7 GB free (70% used)**, up from 3.5 GB. The state record was seeded with `1e1af905`. Still to do: remove the old `leapswitch-worker` tags after step 4 of section 3.

Each step reversible except as noted; none touches the database volume `leapswitch_pgdata`.

1. `sudo docker rmi leapswitch-backend:pre-redesign`: removes the pre-redesign backend (2.2 GB reclaimable). Owner's call: the redesign backend is the one in use and the database is already at migration 0046, so this image is no longer a practical rollback target. A rebuild from git recreates it if ever needed.
2. `sudo docker builder prune -f`: unused build cache (about 2.0 GB private).
3. `df -h /` to record the result.

Never: `docker system prune -a`, `docker volume prune`, removing `:latest`/`:previous` of the backend, or anything under `/var/lib/docker` by hand.

## 5. Rules for every future deploy

1. Front-end-only change: `sudo sh ./scripts/deploy-redesign.sh` (no flag). Needs about 1 GB.
2. Backend changed: `sudo sh ./scripts/deploy-redesign.sh --full`. The script decides whether `backend/` really changed and says so. Needs about 10 GB free.
3. A low-disk warning is a stop sign for the person at the keyboard, not a formality: free space first (section 4), or pass `--force` knowingly.
4. After a failed `--full`, check `docker images` tags and that the live site still matches the running containers; the front end is not built until the backend build succeeded.
5. Migrations while two links share one database (until the old link is retired): additive only (new columns/tables); no drops or renames; payload shape changes must keep the old front end working (register G6).

## 6. Retiring the old link, and the road to `staging.unifolio.in`

Three environments: **AWS staging** (`staging.unifolio.in`, untouched by this work), **`ls-staging`** (VM, old front end) and **`ls-redesign`** (VM, redesign front end); the two VM links share one backend, worker and Postgres. The agreed plan (execution strategy G12): test everything on `ls-redesign`, then merge `leapswitch-redesign` into `feat/leapswitch-staging` (staging merged into it first, fast-forward-only, with the T6/T7 checks).

Recommended order once the redesign is signed off:
1. Merge into `feat/leapswitch-staging` as planned; point `ls-staging` at the redesign bundle (or retire `ls-redesign`). From that moment there is no old front end on the VM, so the additive-only rule ends and drops/renames become possible.
2. Then promote to AWS staging with the existing AWS deploy process: backend image to ECR/ECS, migrations 0044 to 0046 on RDS, front end. The AWS database is separate data, so run the migrations there and compare synthetic-CAS numbers as in T6/T7. The AWS deploy steps were not re-read for this guide; confirm them before the promotion.
Retiring `ls-staging` first (the reverse) gains nothing: the redesign is the future and the old link is only the comparison reference.

## 7. Disk alert (`scripts/check-disk.sh`)

Emails the ops address (SES, same path as `check-memory.sh`) when the Docker disk is 80% used or more; subject `[LeapSwitch staging] disk-usage failed (exit <percent>)`, body has `df -h` and `docker system df`. Cron lines in `crontab.leapswitch`: 09:00 and 18:00 IST. At most two mails a day while the disk stays above the threshold.

**Installing it changes root's crontab, so do it by hand and keep a backup.** The cron file hard-codes `/opt/unifolio/...` (the main clone), which does not have the script until the redesign is merged into `feat/leapswitch-staging`. Until then, point the line at the redesign worktree. Do NOT reinstall the whole `crontab.leapswitch` from the redesign branch: it may differ from what is installed.

```
sudo crontab -l > ~/crontab.backup-$(date +%Y%m%d)
sudo crontab -l | head -3
```
Check that the installed crontab already has `CRON_TZ=Asia/Kolkata` near the top (cron applies it to every line below it). If it does, append only the job line; if it does not, append the `CRON_TZ` line first. Per-line variables are not supported by cron, so never put `CRON_TZ=` on the same line as a job.

```
( sudo crontab -l; echo '0 9,18 * * * /opt/unifolio-redesign/deploy/leapswitch/scripts/check-disk.sh >> /var/log/unifolio-disk.log 2>&1' ) | sudo crontab -
sudo crontab -l | tail -3
```

Test without waiting: `sudo /opt/unifolio-redesign/deploy/leapswitch/scripts/check-disk.sh 1` (threshold 1% forces an alert; check the inbox, then nothing else changes).
When the main clone has the script, change the path in the cron line to `/opt/unifolio/...` or reinstall from the merged crontab file.

## 8. Verification on the VM after PR #37 is merged

Run in `/opt/unifolio-redesign` as `deploy`:
1. `git pull` then `git log --oneline -1` (expect the merge of the hardening PR).
2. `sudo docker compose config | grep -A4 "worker:"` shows `image: leapswitch-backend:latest`, no `build`.
3. `sudo docker compose up -d` (builds nothing). Expect the worker line `Recreated`.
4. `sudo docker compose ps`: postgres, backend, worker, caddy all Up/healthy.
5. `for u in https://ls-staging-api.unifolio.in/health https://ls-redesign.unifolio.in/ https://ls-staging.unifolio.in/; do curl -s -o /dev/null -w "%{http_code}\n" "$u"; done`: `200` three times.
6. `sudo docker compose run --rm -T backend alembic current`: `0046 (head)`.
7. Only then: `sudo docker rmi leapswitch-worker:latest leapswitch-worker:previous`, then `df -h /` (expect about 2 GB more free).
8. Dry check of the guard: `sudo sh ./scripts/deploy-redesign.sh --full` should print `backend: skipping the rebuild (backend/ is unchanged since 1e1af905)` ONLY IF `backend/` is unchanged since that commit, and then stop after building the front end. Skip this step if you do not want a front-end rebuild now; nothing else needs `--full`.
