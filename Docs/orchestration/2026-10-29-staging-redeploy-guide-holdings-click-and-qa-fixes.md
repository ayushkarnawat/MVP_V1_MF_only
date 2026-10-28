# Staging Redeploy Guide: holdings click opens the fund page, plus QA fixes (`leapswitch-redesign`) on `ls-redesign.unifolio.in`

A **continuation** of `2026-10-29-staging-deploy-guide-individual-fund.md`. The VM is already at commit `10571908f1705c13026818b430f6d22fd66228fa` (Individual Fund release deployed 28 to 29 Oct; alembic `0046 (head)`). This run brings it to the new tip of **`leapswitch-redesign`**, finishes the timing check that the first run could not complete (T14 tier 3, and tier 2 under its new limits) and continues B5. Commands are copied from the original guide; the two T14 commands are the corrected ones.

## What changed since the last run

| Item | Last run (28 to 29 Oct) | This run |
|---|---|---|
| Deployed commit | `10571908f1705c13026818b430f6d22fd66228fa` | New tip of `leapswitch-redesign` (includes PR #36, `d8b9ae3c`, and the docs commits) |
| Front end | Fund Details pop-up on Mutual Funds Overview opened the fund page through an "Open fund page" link | PR #36 (`fix/holdings-open-fund-page`): clicking a holdings row or fund name on Overview opens the Individual Fund page directly; the pop-up and its link are removed from that page (the legacy Dashboard keeps its pop-up) |
| Backend / migration | alembic `0046` | No backend change, no migration; head stays `0046` |
| T14 command, tier 3 | `--include-score` alone aborted on the read-only write guard | Needs `--simulate-fresh-cache` too (original guide step 17 corrected) |
| T14 limits | tier 1 under 300 ms; tier 2 each call under 50 ms; tier 3 first open under 5 s, second under 300 ms | Tier 1 unchanged (under 300 ms). Tier 2 **first call per fund under 100 ms**, steady calls still under 50 ms. Tier 3 **first open under 5.5 s**, second open unchanged (under 300 ms). The owner accepted the 28 to 29 Oct misses as Lows (tier 2 first calls 77 to 97 ms; tier 3 first open of fund 1 at 5,108.9 ms) |
| Disk | Not a problem at the start | Only 1.8 GB free (94% used): cleanup gate (step 5) before the build |
| B5 | Waiting on the manager | Continues in step 15 |

Not repeated: V5 (ok), V7 (gaps only in arbitrage and equity-savings funds; the owner decides D7 later), the analytics recompute (6 min 25 s; the backend is unchanged, so the stored sections stay valid; step 3 shows the diff to prove it).

## Prompt for the manager's Claude

Paste the whole block below into the manager's Claude (in the WSL terminal on the laptop) as the first message.

```text
You are executing the staging redeploy guide "2026-10-29-staging-redeploy-guide-holdings-click-and-qa-fixes.md" (folder Docs/orchestration of the repo) on the LeapSwitch VM. This CONTINUES the previous run of "2026-10-29-staging-deploy-guide-individual-fund.md" (the VM was left at commit 10571908f1705c13026818b430f6d22fd66228fa, alembic 0046 (head)). You are the only executor: you run every command yourself, no one else types commands. The manager reads your output and approves gates.

FIRST: read the whole redeploy guide and the whole QA checklist "2026-10-29-staging-qa-checklist-individual-fund.md" before running anything. Then confirm in one line that you have read both. Because this continues the previous run, your first VM action (guide step 4) is to re-confirm that the VM is still at 10571908f1705c13026818b430f6d22fd66228fa and that nothing changed on the VM since the previous run; if it is not, or something changed, STOP and report.

HOW YOU CONNECT: from this laptop's WSL, with the SSH key held there: ssh deploy@202.66.174.251. The Windows side is refused: if you are not in WSL, stop and tell the manager. For every VM command use the bash -s here-document form, never an inline quoted string: start with  ssh deploy@202.66.174.251 'bash -s' <<'EOF'  then the lines  cd /opt/unifolio-redesign/deploy/leapswitch  and the guide's command, then a line containing only EOF. Write any output file you need under /tmp or the home folder (on the VM or in WSL), never to a Windows path. An SSH timeout (not a refusal) means the CloudPe Security Group IP allowlist: stop and report.

HOW YOU WORK:
1. Run ONE step of the guide at a time. For each step paste to the manager: the exact command, the full output, and your verdict "matches expected" or "does NOT match expected" with the reason. You may run consecutive steps that have no GATE and no STOP condition hit without waiting; otherwise wait for the manager.
2. STOP and ask the manager for an explicit yes at every step marked GATE: the disk cleanup (the manager approves the exact list of images), the backup, the deploy, and the T14 timing run. Never carry one yes over to another gate.
3. STOP immediately, run nothing else, and report if a step's STOP condition is met or the output does not match expected.
4. Never improvise commands that are not in the guide. If something unexpected happens, report it and ask; do not fix it yourself.
5. Database: only the read-only SQL listed in the guide (select statements). No inserts, updates, deletes, drops, and no alembic upgrade (this release has no migration).
6. No deletes of any file, image, container or volume, except the disk cleanup in guide step 5, and only the exact images and build cache the manager approved at that GATE. No changes to .env (the guide makes none). No crontab change (the guide makes none).
7. Never create accounts, never type or store passwords, OTPs or keys. Sign-in, sign-up, OTP and deleting a throwaway user are the manager's job in the browser: tell the manager exactly what to do and wait.
8. Never push, commit, edit or check out anything in the repo on the laptop or the VM, other than the git pull --ff-only in step 6. The deploy branch is leapswitch-redesign ONLY: never main, never feat/leapswitch-staging. If the branch on the VM is anything else, stop.
9. Use sudo exactly as written in the guide. If sudo asks for a password, stop; do not type one.

WHEN FINISHED: stop and give the final report in this exact format:
| Item | Value |
|---|---|
| Previous deployed commit re-confirmed (expect 10571908f1705c13026818b430f6d22fd66228fa) | |
| New deployed commit (git rev-parse HEAD on the VM) | |
| Disk free before and after cleanup; what was removed | |
| alembic current (must print 0046 (head)) | |
| Backup file name in object storage | |
| Containers (docker compose ps: each service, state and health) | |
| Health URLs (3 codes, expect 200 200 200) | |
| T14 tier 1 / tier 2 (first call per fund and steady calls) / tier 3 first open / tier 3 second open (values and PASS/FAIL against the new limits) | |
| Rows written by the tier 3 run (fund_scores for today and peer rows, as the script reports) | |
| Backend and worker error grep result | |
| B5 result (count, and the time it was run) | |
| Steps with a mismatch or STOP, and what you did | |
Then say: "Technical steps done; hand the QA checklist to the owner." Do not fill in the QA checklist yourself.
```

## Before you start

| Item | Needed in | Who |
|---|---|---|
| The household's user UUID (`<USER_UUID>`), the same as on 28 to 29 Oct | Steps 12 and 13 | Owner gives it to the manager, who gives it to Claude |
| The merge hash of PR #36 (`d8b9ae3c`) | Step 2 | Filled in by the orchestrator |
| Free disk of 3 GB or more (the build needs about 2.5 GB) | Step 4 | Claude checks; the cleanup gate (step 5) if under 3 GB |
| A throwaway user the manager can delete in the browser, and the time of deletion | Step 15 | Manager |

## Steps

Each step lists the expected output and a **STOP** condition. Steps 1 to 3 run on the laptop (WSL, in the repo clone), the others on the VM in `/opt/unifolio-redesign/deploy/leapswitch` unless the step says otherwise.

| Step | What | Gate |
|---|---|---|
| 1 to 3 | Laptop: tip, merges, CI, no migration | |
| 4 | VM: re-confirm the previous run, pre-checks, disk | |
| 5 | Disk cleanup | GATE (only if free disk is under 3 GB, or the manager asks) |
| 6 | Pull | |
| 7 to 9 | Backup and current migration | GATE before 7 |
| 10 to 11 | `deploy-redesign.sh --full`, containers, health | GATE before 10 |
| 12 to 13 | T14 timings | GATE before 12 |
| 14 | Error grep | |
| 15 | B5 continuation | |
| 16 | Browser smoke check (manager) | |
| 17 | Final report | |

### Step 1 (laptop): the tip
```bash
git fetch origin && git log -1 --format=%h origin/leapswitch-redesign
```
Expected: one short hash; record it as the tip. **STOP** if the fetch fails.

### Step 2 (laptop): the merges are in
```bash
for c in ce10451d f8db102e f0982132 18044571 4cdf12a9 d8b9ae3c; do git merge-base --is-ancestor $c origin/leapswitch-redesign && echo "$c in"; done
```
Expected: six `... in` lines. **STOP** if any is missing.

### Step 3 (laptop): CI, and the diff since the last deploy
```bash
gh run list --branch leapswitch-redesign --limit 3
```
Expected: green on the last code commit (a docs-only push may show no new run). **STOP** if the last code commit is red.
```bash
git diff --stat 10571908f1705c13026818b430f6d22fd66228fa origin/leapswitch-redesign -- backend/alembic
```
Expected: prints nothing (no migration). **STOP** if it lists a revision file.
```bash
git diff --stat 10571908f1705c13026818b430f6d22fd66228fa origin/leapswitch-redesign -- backend
```
Expected: prints nothing or only test and script files; paste it. The expected change is the front end and docs. A change to backend application code is not a STOP, but report it to the manager (the stored analytics sections may then need the recompute of the original guide, step 15).

### Step 4 (VM): re-confirm the previous run, then pre-checks, one command each
```bash
git rev-parse --abbrev-ref HEAD
```
Expected: `leapswitch-redesign`. **STOP** on anything else.
```bash
git -C /opt/unifolio-redesign rev-parse HEAD
```
Expected: `10571908f1705c13026818b430f6d22fd66228fa`. Record it as `<LAST-DEPLOYED-COMMIT>` (rollback). **STOP** if it differs: someone changed the VM since the previous run.
```bash
git -C /opt/unifolio-redesign status --short
```
Expected: prints nothing. **STOP** if it lists files.
```bash
sudo docker compose ps
```
Expected: postgres, backend, worker, caddy running, none restarting or unhealthy. **STOP** otherwise.
```bash
ls -l .env
```
Expected: a symlink to `/opt/unifolio/deploy/leapswitch/.env`.
```bash
grep -E "^(LS_REDESIGN_DOMAIN|MAIN_FRONTEND_DIST|REDESIGN_FRONTEND_DIST|ALLOWED_ORIGINS)=" .env
```
Expected: `REDESIGN_FRONTEND_DIST=/opt/unifolio-redesign/frontend/dist` and `MAIN_FRONTEND_DIST=/opt/unifolio/frontend/dist` (different); `ALLOWED_ORIGINS` contains `https://ls-staging.unifolio.in` and `https://ls-redesign.unifolio.in`. **STOP** if the two paths are equal or an origin is missing. Never print other lines of `.env`.
```bash
df -h / | tail -1
```
Expected: at least 3 GB available (the 28 to 29 Oct run ended with 1.8 GB free, 94% used). **STOP** below 3 GB unless the cleanup gate (step 5) has run and brought it to 3 GB or more.
```bash
free -g | head -2
```
Expected: about 16 GB total.

### Step 5 (VM): disk cleanup. GATE: the manager approves the exact list. Only if step 4 showed under 3 GB, or the manager asks
Background: on 27 Oct 1.5 GB was freed by removing the unused `pre-ux` images (register row C175); the 27 Oct redesign guide (section 1) notes that `sudo docker builder prune -f` frees build cache safely. Never remove the `:latest`, `:previous` or `:pre-redesign` tags of `leapswitch-backend` and `leapswitch-worker`: `:previous` is the rollback target.
```bash
sudo docker images
```
```bash
sudo docker system df
```
Expected: the image list and a size summary. Claude proposes a list of **only** images that no container uses (dangling images, old tags such as `pre-ux`, images unrelated to a running service) and that are not `:latest`, `:previous` or `:pre-redesign` of the two leapswitch images, and says how much each frees. Claude also proposes `sudo docker builder prune -f` (build cache) and says how much `docker system df` reports as reclaimable. **Wait for the manager to approve the exact list.** Then run only what was approved, for example:
```bash
sudo docker image rm <approved-image-id-or-tag>
```
```bash
sudo docker builder prune -f
```
```bash
df -h / | tail -1
```
Expected: at least 3 GB available. **STOP** if still under 3 GB after the approved cleanup: report; do not remove anything else.

### Step 6 (VM): pull (run in `/opt/unifolio-redesign`)
```bash
cd /opt/unifolio-redesign && git pull --ff-only
```
Expected: `Fast-forward` or `Already up to date.` **STOP** if it refuses.
```bash
cd /opt/unifolio-redesign && git rev-parse HEAD
```
Expected: the full hash starts with the tip from step 1. **Record it as the deployed commit** (QA checklist header and row A2). **STOP** if it differs.

### Step 7 (VM): backup. GATE: ask the manager's yes first
```bash
sudo ./scripts/backup.sh < /dev/null; echo "backup exit: $?"
```
Expected: no script output, then `backup exit: 0`. The dump is uploaded to the CloudPe object-storage bucket (prefix `postgres/`), not kept on the VM disk. Keep `< /dev/null`. **STOP** on a non-zero exit.

### Step 8 (VM): the dump is there
```bash
sudo sh -c '. ./.env; aws --profile cloudpe --endpoint-url "$OBJECT_STORAGE_ENDPOINT_URL" s3 ls "s3://$BACKUP_BUCKET_NAME/postgres/" | tail -3'
```
Expected: a dump stamped with the current time (the previous one was `unifolio-20261028T102739Z.sql.gz`); record its file name. **STOP** if no fresh dump is listed.

### Step 9 (VM): current migration
```bash
sudo docker compose run --rm -T backend alembic current
```
Expected: `0046 (head)`. Use `run`, not `exec`. **STOP** on anything else.

### Step 10 (VM): deploy. GATE: ask the manager's yes first
`--full` tags the running images `:previous` (they are the 10571908 images, the rollback target), builds the front end, then runs `docker compose up -d --build`:
```bash
sudo sh ./scripts/deploy-redesign.sh --full
```
Expected: the build ends `built in <N>s`, then `Container leapswitch-backend-1   Started` and `Container leapswitch-worker-1    Started` (`caddy` and `postgres` usually `Running`); about 3 to 4 minutes. Run it **exactly** like this: the file is committed non-executable and `deploy` is not in the docker group. Do **not** run a separate `docker tag ... :previous` first, and do **not** run `--full` twice in a row if a rollback may be needed (`deploy.sh` overwrites `:previous`). **STOP** if the build fails (nothing live changed; report, do not rerun without the manager's yes).

### Step 11 (VM): containers, images, health
```bash
sudo docker compose ps
```
Expected: postgres, backend, worker, caddy running, none restarting or unhealthy. **STOP** if unhealthy: run `sudo docker compose logs backend --tail 80`, report, and offer rollback (section "Rollback"); no rollback without the manager's yes.
```bash
sudo docker image ls | grep -E "leapswitch-(backend|worker)"
```
Expected: `:previous` and `:latest` for both.
```bash
sudo docker compose run --rm -T backend alembic current
```
Expected: `0046 (head)` still.
```bash
for u in https://ls-staging-api.unifolio.in/health https://ls-redesign.unifolio.in/ https://ls-staging.unifolio.in/; do curl -s -o /dev/null -w "%{http_code}\n" "$u"; done
```
Expected: `200` three times. **STOP** on anything else.

### Step 12 (VM): T14 tiers 1 and 2. GATE: ask the manager's yes first
Read only (exits non-zero if a session commits); prints counts and milliseconds only.
```bash
sudo docker compose run --rm -T backend python scripts/measure_fund_page_staging.py --user-id <USER_UUID> --scheme-filtered --schemes 4 --runs 3 --simulate-fresh-cache
```
Expected, under the **new limits**: tier 1 under 300 ms; tier 2 **first call on each fund under 100 ms**, every later (steady) call under 50 ms. The script's own `PASS`/`FAIL` lines may still print the old 50 ms limit for the first call: judge the first-call lines by 100 ms and say so in the verdict. (28 to 29 Oct for comparison: tier 1 312 to 322 ms cold; tier 2 first calls 77 to 97 ms.) **STOP** on a first call of 100 ms or more, a steady call of 50 ms or more, tier 1 of 300 ms or more, a non-zero exit or a write error; paste the whole output.

### Step 13 (VM): T14 tier 3
```bash
sudo docker compose run --rm -T backend python scripts/measure_fund_page_staging.py --user-id <USER_UUID> --scheme-filtered --schemes 4 --runs 3 --simulate-fresh-cache --include-score
```
Expected: first open of a category under **5.5 s**, second open under 300 ms (28 to 29 Oct: first opens 3.8 to 5.1 s, second opens 3.2 to 4.8 ms). This run may write up to one `fund_scores` row per fund for today plus peer rows (the script says so); this is expected: record how many rows the script reports. `--simulate-fresh-cache` is required, otherwise the read-only write guard aborts before tier 3 is timed. The script's own tier 3 line may print the old 5 s limit: judge by 5.5 s and say so. **STOP** on a first open of 5.5 s or more, a second open of 300 ms or more, or a non-zero exit; report to the orchestrator (BDF13, month-end rows chosen in SQL, comes before touching the cache design).

### Step 14 (VM): errors since the deploy
```bash
sudo docker compose logs --since 30m backend worker | grep -i -E "error|traceback|exception" | head -30
```
Expected: nothing, or lines Claude can explain (paste them). **STOP** on an unexplained traceback.

### Step 15 (VM): B5 continuation, the deletion check (V6)
The manager deletes a **throwaway** user in the browser (never a real account) and gives Claude the deleted user id and the time. Claude never signs in or deletes anything. The nightly account-deletion job runs at 08:00 IST.
```bash
set -a; . ./.env; set +a
sudo docker compose exec -T postgres psql -U "$DB_USERNAME" "$DB_NAME" -c "select count(*) from analytics_sections where user_id = '<deleted user>'"
```
Expected: `0`. If the count is **not 0**, Claude reports the number and the time and does **not** guess a reason (the 08:00 job may not have run yet); the manager and orchestrator decide. **STOP** on a non-zero count.

### Step 16 (manager, browser): smoke check
Claude tells the manager exactly what to do and waits; Claude never signs in.
1. Private window, `https://ls-redesign.unifolio.in`, hard refresh, sign in (the manager enters any OTP). Mutual Funds, Overview: click a holdings row and a fund name; each opens that fund's Individual Fund page directly, with no pop-up.
2. `https://ls-staging.unifolio.in` in a second profile: Dashboard, Analytics, History unchanged; the legacy Dashboard still opens its Fund Details pop-up; no CORS errors in the console.

Expected: both load, no errors. A CORS error means `ALLOWED_ORIGINS` lacks `https://ls-redesign.unifolio.in`: report; do not edit `.env`.

### Step 17: final report
Claude posts the table from the prompt, then hands over to the owner with the QA checklist.

## Rollback (only on the manager's explicit yes)

```bash
sudo sh ./scripts/rollback.sh
```
Retags `leapswitch-backend:previous` and `leapswitch-worker:previous` (the 10571908 images after step 10) to `:latest` and runs `docker compose up -d`; no rebuild. Expected: `Container leapswitch-backend-1 Started` and `leapswitch-worker-1 Started`; then `curl -s -o /dev/null -w "%{http_code}\n" https://ls-staging-api.unifolio.in/health` prints `200`. **STOP** on `no leapswitch-...:previous image found`.

Not covered by it: the front end is static files on disk. Revert: `git -C /opt/unifolio-redesign checkout 10571908f1705c13026818b430f6d22fd66228fa -- frontend`, then `sudo sh ./scripts/deploy-redesign.sh` (front end only), then check the new commit out again when retrying; this edits the repo, so the manager must say yes. The database needs nothing: no migration, and the only new writes are the tier 3 `fund_scores` rows. Only one `:previous` image exists; every `deploy.sh` run overwrites it.

## Sources and gaps

Sources: `2026-10-29-staging-deploy-guide-individual-fund.md` (steps 4 to 19, rollback); `2026-10-27-staging-deploy-guide-redesign.md` (section 1, disk and `docker builder prune`); register row C175 (1.5 GB freed by removing unused `pre-ux` images); the 28 to 29 Oct QA report as relayed by the owner.

Gaps:
1. Whether the merged commits contain any backend application change: step 3 shows it. This guide assumes none (as stated), so no recompute is run.
2. The exact image names to remove in step 5 are unknown until `sudo docker images` is read; the manager approves the list.
3. The script's built-in PASS/FAIL lines may still use the old limits (50 ms first call, 5 s tier 3); the new limits are applied by Claude's reading. Changing the script is a separate Backend task.

## Known pitfalls (added after the 29 Oct redeploy: read before any deploy)
- **Front-end-only releases use the no-flag form:** `sudo sh ./scripts/deploy-redesign.sh` (no `--full`) builds only the front end and touches no containers. Use `--full` only when something under `backend/` changed (`git diff --stat <deployed commit> <tip> -- backend` is not empty). The 29 Oct redeploy used `--full` for a front-end-only change; the backend rebuilt from scratch (about 2 GB per image, the build cache was cold), the disk filled up (239 MB free), the build failed, and the new front end had already gone live.
- **A failed `--full` does NOT mean nothing live changed:** the front end is built first and goes live at once; only then do the backend and worker build. `:previous` and `:latest` can end up pointing at the same image, so `rollback.sh` is then a no-op for the backend, and there is no front-end rollback.
- **Disk:** `--full` needs at least 10 GB free (two images of about 2 GB, the old tagged copies, database headroom); a front-end-only deploy needs about 1 GB. The disk (27 GB, shared with the database) must be resized in the CloudPe dashboard before the next `--full`.
- **After a failed build,** check `sudo docker images --no-trunc` before anything else: `:latest` may point at a half-unpacked image, and any `docker compose run` or cron job would use it. Retag `:latest` to the running image only with the manager's yes.

