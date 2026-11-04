# Staging Deploy Guide: UI round 2 and the six life goals (`leapswitch-redesign`, final merge) to `ls-redesign.unifolio.in`

Task 7.1 of the UI round 2 plan. **Status (4 Nov 2026): ready to run on the owner's go.** S6 is tagged `ui-s6-done`, the documentation update (D.1) is done and the QA checklist is written. The executor still stops at every GATE below and waits for a yes in the chat. Written 4 Nov 2026 from the real state of staging recorded in `2026-11-03-staging-deploy-record-change-requests.md`. Modelled on `2026-10-29-staging-deploy-guide-individual-fund.md` and `2026-10-31-staging-deploy-guide-change-requests.md` (the manager's real-run fixes are kept: `sudo sh` for the deploy script, the dump goes to object storage, queries go through the compose Postgres container because the host has no `psql`, read `.env` under `sudo`).

## Facts that decide the order of this guide
- **Staging today:** the VM worktree `/opt/unifolio-redesign` is on **`release/change-requests`** at `0dfd1261` (or later: the manager may add QA fixes there). Alembic head on the VM is **`0052`**. The front end is `ls-redesign.unifolio.in`, the shared API is `ls-staging-api.unifolio.in`, and `ls-staging.unifolio.in` (the main link) shares the backend.
- **This release** moves the VM to the **final merge commit on `leapswitch-redesign`**, which holds the change-requests release (already deployed) plus UI round 2: Home allocation funds, new funds after an upload, add-as-family, the Actual XIRR graph and benchmark label, the six life goals, and the redesigned sign-up and sign-in.
- **One migration: `0053`** (`down_revision` `0052`). It sets every user's saved goals to NULL (no old goal maps to a new one), swaps the Postgres CHECK `ck_users_primary_goals_allowed` to the six new codes (1 to 6 items), **drops `users.primary_goal` and the enum type `primarygoal`**. After it, **every user has no saved goals** and is asked again.
- **Old code on the new schema breaks every `users` query** (the old model selects the dropped column). **New code on the old schema works** except saving the new goal codes (the old CHECK refuses them). So the order is: stop the old backend and worker, start the new code, migrate at once, restart. Never leave the old containers running across the migration. (The change-requests deploy ran its migration while old containers still served for about four minutes; this guide does not repeat that.)
- **Deploy branch: `leapswitch-redesign` only**, at the final merge commit. Never `main`, never `feat/leapswitch-staging`, never `release/change-requests` for this release. **Step 0 is the first thing this guide does: it merges `ui-round-2` into `leapswitch-redesign` and pushes it (a GATE).** Nothing else pushes to that branch, and nothing is ever force-pushed.
- **No analytics recompute is required:** no stored analytics section changed. (If a stored field is later found to have changed, add the recompute step and tell the owner.)
- **When.** Weekday, outside the cron windows: avoid 00:55 to 06:35 IST (batch jobs) and 08:00 and 19:00 (account deletion, CAS expiry); `news-refresh` runs at :15 past 07, 10, 13, 16, 19, 22 and 23:30. **Time:** about 30 minutes. The API is down from step 10 until step 14 (about 6 to 10 minutes).
- **Who runs what.** The manager runs the deploy with the owner's go, with Claude as the only executor, from the laptop's WSL (`ssh deploy@202.66.174.251`; the Windows side is refused; an SSH timeout, as opposed to a refusal, is the CloudPe Security Group IP allowlist, see the staging plan's Troubleshooting). Claude runs every VM command itself and pastes each output. Sign-in, sign-up, codes and the deletion of a throwaway user are the owner's job in the browser.

## What ships
- **Backend:** Home `allocation` gains `funds` per class; `GET /imports/{id}/new-funds` and `new_funds` plus `created` on each confirm result; `POST /imports/sessions/{id}/resolve-add-as-family` (the account holder is never changed; a PAN that already belongs to the account holder gives a 409 `pan_belongs_to_other_member`); `benchmark_label` on the fund returns response; `PATCH /auth/me` takes 1 to 6 of the six goal codes (an old code or an empty list gives 422); the contact-change notice is not emailed before sign-up is complete (the event and the 7-day cooling-off are still recorded); **migration `0053`**.
- **Front end:** the above screens, the new sign-up and sign-in flow, the goals screens, and the cached-old-front-end caveat: **an old cached front end sends old goal codes and gets a 422, so hard refresh** (Ctrl+Shift+R) after the deploy.
- **No** new settings, **no** cron change, **no** new job.

## Prompt for the executing Claude
Paste the block below into Claude (WSL terminal on the laptop) as the first message.

```text
You are executing the staging deploy guide "2026-11-04-staging-deploy-guide-ui-round-2.md" (folder Docs/orchestration of the repo) on the LeapSwitch VM. You are the only executor: you run every command yourself; the owner only answers GATEs and uses the browser.

FIRST: read the whole guide and the whole QA checklist before running anything. If the merge in step 0 has not happened yet, read them from the branch: git fetch origin, then git show origin/ui-round-2:Docs/orchestration/2026-11-04-staging-deploy-guide-ui-round-2.md and the same for 2026-11-04-staging-qa-checklist-ui-round-2.md. Confirm in one line that you have read both.

HOW YOU CONNECT: from the laptop's WSL with the SSH key held there: ssh deploy@202.66.174.251. If you are not in WSL, stop and tell the owner. Run each VM command as: ssh deploy@202.66.174.251 "cd /opt/unifolio-redesign/deploy/leapswitch && <command>".

HOW YOU WORK:
1. One step at a time. For each step paste the exact command, the full output, and your verdict "matches expected" or "does NOT match expected" with the reason. Consecutive steps with no GATE and no STOP condition may run together.
2. STOP and ask for an explicit yes at every GATE (before the backup, before stopping the backend, before the deploy, before the migration). Never carry one yes over to another gate.
3. STOP immediately, run nothing else, and report if a step's STOP condition is met or the output does not match.
4. Never improvise commands that are not in the guide. If something unexpected happens, report it and ask.
5. Database: only the statements in the guide. The only write is `alembic upgrade head` in step 12. No inserts, updates, deletes or drops by hand. Do NOT run clean-db.sh, restore.sh or rollback.sh unless the owner gives that exact instruction at that moment.
6. No deletes of files, images, containers or volumes. No change to .env, no crontab change. Never stop a running recompute. Never add --allow-nav-writes.
7. Never create accounts, never type or store passwords, codes or keys. Browser steps are the owner's: tell the owner exactly what to do and wait.
8. Never push, commit or edit anything in the repo on the laptop or the VM, other than: step 0 (the merge commit on a throwaway local branch and ONE normal push of it to origin leapswitch-redesign, after the GATE) and the git fetch and checkout in step 5. Never force-push, never push to any other branch (not main, not feat/leapswitch-staging, not release/change-requests, not ui-round-2). The deploy branch is leapswitch-redesign ONLY.
9. Use sudo exactly as written. If sudo asks for a password, stop.

WHEN FINISHED give the final report in the format of step 20, then say "Technical steps done; hand the QA checklist to the owner." Do not fill in the QA checklist yourself.
```

## Before you start
| Item | Needed in | Who |
|---|---|---|
| **The owner's go** (S6 is tagged `ui-s6-done`, D.1 is done) | Step 0 | Owner |
| **A clone of the repo on the laptop** with push rights to `origin` and a clean working tree (it is used only for step 0 and the laptop checks) | Steps 0 to 3 | Manager |
| **A decision on `clean-db.sh`** (default: **not run**; see step 9) | Step 9 | Owner |
| **Free disk of 10 GB or more** (the deploy script's own guard; the change-requests deploy stopped at 8 GB) | Step 4 | Claude checks; STOP if under 10 GB |
| **A throwaway Google or email account** for the sign-up walk, and one existing account for sign-in | QA | Owner |
| The list of **queries saved outside the repo** (DBeaver, dashboards, spreadsheets) that select `primary_goal` or filter on the four old goal values: they break after step 12 and are the owner's to check | After step 15 | Owner |

## Section 1: steps
| Step | What | Gate |
|---|---|---|
| 0 | Laptop: merge `ui-round-2` into `leapswitch-redesign` and push | GATE before the push |
| 1 to 3 | Laptop: the final commit, one migration, CI | |
| 4 | VM pre-checks | |
| 5 | Switch the worktree to `leapswitch-redesign` | |
| 6 to 8 | Backup, the dump is there, `alembic current` is `0052` | GATE before 6 |
| 9 | Optional wipe (default: skipped) | GATE, owner's own call |
| 10 | Stop backend and worker | GATE |
| 11 | Deploy (build, tag `:previous`, start) | GATE |
| 12 | Migrate (`0053`) at once | GATE (given together with 11) |
| 13 to 15 | Restart, containers, health, schema checks | |
| 16 to 19 | Goals checks, error grep, smoke, the owner's saved queries | |
| 20 | Final report | |

### Step 0 (laptop): the final merge of `ui-round-2` into `leapswitch-redesign`
This is the only push this guide makes. On 4 Nov 2026 `leapswitch-redesign` was still at `8dc7d9ba` (frozen) and `ui-round-2` was 55 commits ahead and contained it, so the merge is a fast-forward in content; it is done as a merge commit (`--no-ff`) so the final merge is one visible, revertable commit. Run in the laptop clone, never on the VM.
```bash
git status --short
```
Expected: prints nothing. **STOP** if it lists files (do not stash or discard).
```bash
git fetch origin && git rev-parse origin/leapswitch-redesign origin/ui-round-2
```
Record both hashes. Expected: `origin/leapswitch-redesign` is `8dc7d9ba...`. **STOP and ask** if it is anything else (someone pushed; the manager decides).
```bash
git merge-base --is-ancestor origin/leapswitch-redesign origin/ui-round-2 && echo contains
```
Expected: `contains`. **STOP** if not.
```bash
git switch -c final-merge origin/leapswitch-redesign && git merge --no-ff origin/ui-round-2 -m "Merge ui-round-2: UI round 2, the six life goals and the sign-up redesign (final merge)"
```
Expected: a merge commit with no conflicts. **STOP** on any conflict: nothing is pushed; report which files. Then:
```bash
git diff --quiet origin/ui-round-2 HEAD && echo "tree identical to ui-round-2"
git log --oneline --graph -4
git diff --stat origin/leapswitch-redesign HEAD | tail -1
```
Expected: `tree identical to ui-round-2` (the merge adds nothing of its own); the graph shows the new merge commit on top; the stat line is the whole of UI round 2. Record `git rev-parse HEAD` as `<FINAL-COMMIT>`.

**GATE: ask the manager's or owner's explicit yes before the push.** Then:
```bash
git push origin final-merge:leapswitch-redesign
```
Expected: `8dc7d9ba..<FINAL-COMMIT>  final-merge -> leapswitch-redesign` (a normal fast-forward update). **STOP** if it is rejected: someone pushed in between; never force. Then:
```bash
git fetch origin && git rev-parse origin/leapswitch-redesign
```
Expected: equals `<FINAL-COMMIT>`. This is the commit every later step deploys.

### Step 1 (laptop): the final commit is on the deploy branch
```bash
git fetch origin && git log -1 --format=%H origin/leapswitch-redesign
```
Expected: one full hash equal to the merge commit pushed in step 0 (`<FINAL-COMMIT>`). **STOP** if the fetch fails or the hash differs.
```bash
for c in 0dfd1261 1aad77c2 9cf80dc8 0bd86f88 4ee95496; do git merge-base --is-ancestor $c origin/leapswitch-redesign && echo "$c in"; done
```
Expected: five `... in` lines (the deployed release head, the merge of the release into UI round 2, the goals migration, the sign-up notice flag, the Self PAN message and share-rounding fix). **STOP** if any is missing.

### Step 2 (laptop): exactly one new migration
```bash
git diff --stat 0dfd1261 origin/leapswitch-redesign -- backend/alembic/versions
```
Expected: one line, `backend/alembic/versions/0053_primary_goals_life_goals.py` (a new file). **STOP** if it lists any other revision or a changed old one.
```bash
git show origin/leapswitch-redesign:backend/alembic/versions/0053_primary_goals_life_goals.py | grep -n "^revision\|^down_revision"
```
Expected: `revision = "0053"` and `down_revision = "0052"`.

### Step 3 (laptop): CI
```bash
gh run list --branch leapswitch-redesign --limit 3
```
Expected: green on `<FINAL-COMMIT>` (a docs-only commit may show no run). Reference results at the merged head `1aad77c2` (4 Nov): backend suite with Postgres 5755 passed, 5 failed, 6 skipped (the five are the known tests that read an untracked cache file `backend/.cache/amfi_navall/nav_all.txt`), one Alembic head `0053`. **STOP** if the last code commit is red.

### Step 4 (VM): pre-checks, one command each
```bash
git rev-parse --abbrev-ref HEAD
```
Expected: `release/change-requests` (the branch staging runs now). **STOP** on anything else.
```bash
git log -1 --format=%h
```
Record as `<LAST-DEPLOYED-COMMIT>` (rollback). Expected `0dfd1261` or a later manager commit.
```bash
df -h / | tail -1
```
Expected: at least 10 GB available. **STOP** if under 10 GB; `sudo docker builder prune -f` is safe but only on the owner's yes.
```bash
free -g | head -2
```
Expected: about 16 GB total.
```bash
sudo sh -c '. ./.env; docker compose exec -T postgres psql -U "$DB_USERNAME" "$DB_NAME" -c "select user_id, started_at from analytics_recompute_status where started_at is not null;"'
```
Expected: `(0 rows)`. **STOP** if a recompute is running: never stop it; wait for it to finish.
```bash
sudo sh ./scripts/check-memory.sh; sudo sh ./scripts/check-disk.sh
```
Expected: both print an OK. **STOP** otherwise.
```bash
grep -E "^(LS_REDESIGN_DOMAIN|FRONTEND_BASE_URL|MAIN_FRONTEND_DIST|REDESIGN_FRONTEND_DIST|ALLOWED_ORIGINS)=" .env
```
Expected: `FRONTEND_BASE_URL=https://ls-redesign.unifolio.in`; `REDESIGN_FRONTEND_DIST=/opt/unifolio-redesign/frontend/dist`; `MAIN_FRONTEND_DIST=/opt/unifolio/frontend/dist` (different); `ALLOWED_ORIGINS` contains both site origins. **STOP** if wrong. Never print other `.env` lines.
Also ask the owner: **no import in progress** (nobody is uploading a statement right now).

### Step 5 (VM): switch the worktree to the final commit (run in `/opt/unifolio-redesign`)
```bash
cd /opt/unifolio-redesign && git status --short
```
Expected: prints nothing. **STOP** if it lists files (edited on the VM outside git; do not discard).
```bash
cd /opt/unifolio-redesign && git fetch origin && git checkout -B leapswitch-redesign origin/leapswitch-redesign && git rev-parse HEAD
```
Expected: the full hash equals `<FINAL-COMMIT>`. **Record it as the deployed commit.** **STOP** if it differs or the checkout refuses. (The change-requests deploy switched branches the same way, with `-B`.)

### Step 6 (VM): backup. GATE: ask the owner's yes first
```bash
sudo ./scripts/backup.sh < /dev/null; echo "backup exit: $?"
```
Expected: `backup exit: 0`. The dump is gzipped and uploaded to the object-storage bucket (prefix `postgres/`, about 170 MB on 3 Nov). Keep `< /dev/null`. **STOP** on a non-zero exit.

### Step 7 (VM): the dump is there
```bash
sudo sh -c '. ./.env; aws --profile cloudpe --endpoint-url "$OBJECT_STORAGE_ENDPOINT_URL" s3 ls "s3://$BACKUP_BUCKET_NAME/postgres/" | tail -3'
```
Expected: a dump stamped with the current time; record its file name for rollback. **STOP** if no fresh dump is listed.

### Step 8 (VM): current migration
```bash
sudo docker compose run --rm -T backend alembic current
```
Expected: `0052 (head)`. Use `run`, not `exec`. **STOP** on anything else.

### Step 9 (VM): optional wipe of user data. GATE, the owner's own call; **default: skip**
The migration already clears every user's saved goals, so a wipe is **not needed** for the goals change. It is only for a fresh-signup test round. If the owner asks for it: `sudo ./scripts/clean-db.sh` (user-domain data is wiped, reference tables are untouched). Never run it on Claude's own initiative. Record "step 9 skipped" or "run".

### Step 10 (VM): stop the old backend and worker. GATE
```bash
sudo docker compose stop backend worker
```
Expected: `Container leapswitch-backend-1  Stopped` and `leapswitch-worker-1  Stopped` (postgres and caddy keep running). From here the API is down. Do not pause between steps 10 and 14.

### Step 11 (VM): deploy. GATE (the owner's yes covers steps 11 and 12)
`--full` builds the backend image, tags the image that was running as `:previous`, builds the front end, then starts the containers:
```bash
sudo sh ./scripts/deploy-redesign.sh --full
```
Expected: `backend: building (...)`, a front-end build ending `built in <N>s`, then `Container leapswitch-backend-1 Started` and `leapswitch-worker-1 Started`; about 3 to 4 minutes. Run it exactly like this (the script is committed non-executable). The new backend now runs on the **old** schema for a moment; that is expected and harmless except for saving the new goal codes. **STOP** if the build fails (nothing live changed; the old image is still `:latest`): report, and offer `sudo docker compose up -d` to bring the old containers back. If it stops on the disk guard (no terminal to ask), **STOP**; do not add `--force` without the owner's yes. If it prints `WARNING: ... leapswitch-backend:previous was NOT updated`, tell the owner: the rollback image is not the pre-release one.

### Step 12 (VM): migrate at once
```bash
sudo docker compose run --rm -T backend alembic upgrade head
```
Expected: `Running upgrade 0052 -> 0053, users.primary_goals: six life goals; drop the single primary_goal column`. Then:
```bash
sudo docker compose run --rm -T backend alembic current
```
Expected: `0053 (head)`. **STOP** on any error: the new backend is running on the old schema (goal saving fails, everything else works). Report; do not retry or change anything; offer the rollback (section 3) only on the owner's yes.

### Step 13 (VM): restart so no connection holds the old schema
```bash
sudo docker compose restart backend worker
```
Expected: both `Restarted`.

### Step 14 (VM): containers, images, health
```bash
sudo docker compose ps
```
Expected: postgres, backend, worker, caddy running, none restarting or unhealthy. **STOP** if unhealthy: `sudo docker compose logs backend --tail 80`, report, offer rollback.
```bash
sudo docker image ls | grep -E "leapswitch-(backend|worker)"
```
Expected: `:previous` and `:latest`; the two backend IDs differ.
```bash
for u in https://ls-staging-api.unifolio.in/health https://ls-redesign.unifolio.in/ https://ls-staging.unifolio.in/; do curl -s -o /dev/null -w "%{http_code}\n" "$u"; done
```
Expected: `200` `200` `200`. The API was down from step 10; note the elapsed time for the report.

### Step 15 (VM): schema checks, read only
```bash
sudo sh -c '. ./.env; docker compose exec -T postgres psql -U "$DB_USERNAME" "$DB_NAME" -c "\d users"' | grep -c primary_goal
```
Expected: `1`, from the line for `primary_goals` only (the substring match), with **no** `primary_goal ` (singular) column line; Claude pastes the whole column list so the owner sees it. **STOP** if a singular `primary_goal` column is still there.
```bash
sudo sh -c '. ./.env; docker compose exec -T postgres psql -U "$DB_USERNAME" "$DB_NAME" -c "select count(*) as types_left from pg_type where typname = '"'"'primarygoal'"'"';"'
```
Expected: `0`.
```bash
sudo sh -c '. ./.env; docker compose exec -T postgres psql -U "$DB_USERNAME" "$DB_NAME" -c "select count(*) filter (where primary_goals is not null) as with_goals, count(*) as users from users;"'
```
Expected: `with_goals = 0`, `users` = the count recorded before (6 on 3 Nov unless new sign-ups).
```bash
sudo sh -c '. ./.env; docker compose exec -T postgres psql -U "$DB_USERNAME" "$DB_NAME" -c "select pg_get_constraintdef(oid) from pg_constraint where conname = '"'"'ck_users_primary_goals_allowed'"'"';"'
```
Expected: the definition names the six codes (`wealth_creation`, `retirement`, `childrens_education`, `buy_home`, `financial_freedom`, `tax_planning`) and `1 AND 6`.

### Step 16 (browser, the owner): goals and the old-cache check
1. **Hard refresh** (Ctrl+Shift+R) `https://ls-redesign.unifolio.in`. Sign in with the existing account. Expected: no crash; the Profile goals show none; pick one or more of the six goals and save: it saves; pick all six: it saves.
2. A tab left open from before the deploy, **without** a refresh, then saving goals: a clear error, not a blank page. Expected and harmless; refresh fixes it.

### Step 17 (VM): error grep
```bash
sudo docker compose logs backend worker --since 30m | grep -iE "error|traceback|exception" | tail -20
```
Expected: nothing about `primary_goal`, `primarygoal` or a missing column. Paste whatever it prints; the owner decides whether it matters.

### Step 18 (browser, the owner): smoke
Sign up a **new** throwaway account through the whole new flow (the QA checklist lists each screen), upload one synthetic statement (`Docs/CAS Files/synthetic/pdfs/`, password `MF@123`), confirm it, open Home. Expected: the six goals screen, the import, the new-funds notice, the Home donut with its fund pop-up. Then delete the throwaway account in the app.

### Step 19: the owner's saved queries
The owner checks every saved query outside the repo (DBeaver, dashboards, spreadsheets) that selects `users.primary_goal` or filters on `consolidated_view`, `understand_holdings`, `family_management` or `performance_comparison`. Use `primary_goals` (a JSON list of the six new codes). The optional goals count: `SELECT g, count(*) FROM users, jsonb_array_elements_text(primary_goals) AS g GROUP BY g ORDER BY 2 DESC;`.

### Step 20: final report (Claude fills this in)
| Item | Value |
|---|---|
| Merge commit pushed to `leapswitch-redesign` in step 0 (`<FINAL-COMMIT>`) and `origin/leapswitch-redesign` before it | |
| Deployed commit (`git rev-parse HEAD` on the VM) | |
| `alembic current` (must print `0053 (head)`) | |
| Backup file name in object storage | |
| Step 9: skipped or run | |
| API downtime (step 10 to step 14) | |
| Containers (`docker compose ps`: each service, state and health) | |
| Health URLs (expect `200 200 200`) | |
| `\d users` has no `primary_goal`; `pg_type primarygoal` count; users with goals; the CHECK definition | |
| Backend and worker error grep result | |
| `leapswitch-backend:previous` is the pre-release image? (ID) | |
| Steps with a mismatch or STOP, and what was done | |

## Section 2: after the deploy
- The QA checklist is `Docs/orchestration/2026-11-04-staging-qa-checklist-ui-round-2.md` (Task 7.2, not written yet); the owner runs it and Claude records the results.
- A timing check of Home, the fund page and the month detail with the earlier scripts is optional here: the 3 Nov results after the change-requests deploy were within the hard limits (Home 304 / 353 ms against 1,500; the fund page's first call per fund was 105 to 108 ms against 100) and this release changes no hot path except two small additive fields. If the owner wants it, use `measure_home_staging.py --user-id <uuid> --simulate-fresh-cache`.

## Section 3: rollback (only on the owner's yes)
The merge in step 0 is not undone by any of this. If it must be undone, that is a new revert commit on `leapswitch-redesign` decided by the owner and pushed normally (never a force-push, never a history rewrite).
The database must go back **first**, while the new image still holds the `0053` file, then the code:
1. **Migration down** (new image still `:latest`): `sudo docker compose run --rm -T backend alembic downgrade -1`. Expected `Running downgrade 0053 -> 0052`. This recreates `users.primary_goal` and the enum type, clears goals (they were already cleared) and restores the four-code CHECK. If this fails, stop and ask: the next option is a full restore from the step 6 backup.
2. **Backend and worker image back:** `sudo sh ./scripts/rollback.sh` (points `:latest` at `:previous` and runs `docker compose up -d`). Expected `Started` for both. It does not touch the database or the front end. If step 11 warned that `:previous` was not moved, do **not** use this: rebuild from `<LAST-DEPLOYED-COMMIT>` instead.
3. **Front end back:** `cd /opt/unifolio-redesign && git checkout -B release/change-requests origin/release/change-requests` then `sudo sh ./scripts/deploy-redesign.sh` (front end only; Caddy serves the new `frontend/dist` live).
4. Health URLs as in step 14, and `alembic current` must print `0052 (head)`.
5. **Full database restore** from the step 6 dump (`restore.sh`) is the last resort and needs the owner's explicit instruction: it loses everything written since the backup.
UI round 2 can also be rolled back in pieces by reverting commit ranges in reverse order (`ui-s6`, `ui-s5`, and so on); the auth redesign alone can be turned off with the `variant` flip in `App.tsx`. Those are code changes and need a new deploy.
