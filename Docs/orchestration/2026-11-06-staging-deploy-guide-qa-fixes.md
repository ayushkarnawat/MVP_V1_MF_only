# Staging Deploy Guide: the QA fixes (`leapswitch-redesign`) to `ls-redesign.unifolio.in`

**Prepared 6 Nov 2026. Nothing here is run until the owner says go.** Spec: `Docs/superpowers/specs/2026-11-06-qa-fixes-design.html`. Plan: `Docs/superpowers/plans/2026-11-06-qa-fixes-implementation.md`. Gate evidence: `Docs/orchestration/qa-fixes-gate.md`. After the deploy, run `2026-11-06-staging-qa-checklist-qa-fixes.md`.

## Facts that decide this guide
- **Back end and front end both change, no migration.** Alembic stays at **0053**. Back end: refusal bodies for member removal and account deletion now carry `{code, message, available_after}` with an India-time date; three new Head of Family email templates (new head, old head, undo with a button). Front end: ten polish changes (A1, A2, B1, B2, B3, C1 to C4).
- So the deploy is **`deploy-redesign.sh --full`** (rebuilds the back end because `backend/` changed, builds the front end, restarts). **No stop, migrate, start sequence and no backup are needed** (nothing in the schema changes). The API is down only for the few seconds the containers restart.
- **Old front end with the new back end is safe** (it shows the generic "Could not delete... try again" for the refusals). **New front end with the old back end is also safe** (a plain-string 409 reads as an ordinary failure). So the order inside `--full` does not matter.
- Desktop only. Nothing under `frontend/src/mobile/` changed (one mobile **test** expectation did). No dependency changed.
- The head change emails are only sent when real email delivery is on. On staging the three emails go through SES to real inboxes: use throwaway inboxes you can open (QA row 5.x).

## Prompt for the executing Claude
```
You are deploying the QA fixes to the LeapSwitch staging VM (ls-redesign.unifolio.in). Read Docs/orchestration/2026-11-06-staging-deploy-guide-qa-fixes.md and follow it step by step.
Rules: run one command at a time and show its output; at every STOP, stop and report; run nothing that changes the VM before the step that says GATE and the owner's yes; never print .env lines other than the ones the guide names; never run clean-db.sh, restore.sh or rollback.sh on your own initiative.
At the end fill in step 12 and give the owner the report.
```

## Section 1: steps

### Step 0 (laptop): put the work on the deploy branch
The work is on the local lane `qa-fixes-lane` (worktree `wt/qa-fixes`); the worker branch `qa-fixes-src` holds the same commits. Publish with the usual routine, **never force-push**:
```bash
cd "wt/qa-fixes" && git fetch origin && git rebase origin/leapswitch-redesign && git push origin qa-fixes-lane:leapswitch-redesign
```
Expected: the push succeeds. Record the pushed head as `<FINAL-COMMIT>`. If the rebase stops on a shared log (`delegation-log.md`), keep both sides' lines. **STOP** on any other conflict.

### Step 1 (laptop): the release touches only what it should
```bash
git diff --name-only <LAST-DEPLOYED-COMMIT> <FINAL-COMMIT> | grep -E "alembic|migrations|package(-lock)?\.json|frontend/src/mobile/"
```
Expected: only `frontend/src/mobile/features/import/MobileImportView.test.tsx` (a test). **STOP** if a migration, a dependency file or mobile source appears.

### Step 2 (laptop): CI
```bash
gh run list --branch leapswitch-redesign --limit 3
```
Expected: green on `<FINAL-COMMIT>`. Local evidence at the lane head: back end full suite and front end full suite recorded in `qa-fixes-gate.md`. **STOP** if the last code commit is red.

### Step 3 (VM): pre-checks
```bash
cd /opt/unifolio-redesign && git rev-parse --abbrev-ref HEAD && git log -1 --format=%h && git status --short
```
Expected: `leapswitch-redesign`, then the last deployed commit (record it as `<LAST-DEPLOYED-COMMIT>`, it is the rollback target), then nothing printed. **STOP** if the status lists files.
```bash
df -h / | tail -1; free -g | head -2
sudo sh ./scripts/check-memory.sh; sudo sh ./scripts/check-disk.sh
sudo sh -c '. ./.env; docker compose exec -T postgres psql -U "$DB_USERNAME" "$DB_NAME" -c "select user_id, started_at from analytics_recompute_status where started_at is not null;"'
```
Expected: at least 10 GB free; both checks print OK; `(0 rows)`. **STOP** otherwise (never stop a running recompute). Ask the owner: **nobody is uploading a statement right now**.

### Step 4 (VM): switch to the final commit
```bash
cd /opt/unifolio-redesign && git fetch origin && git checkout -B leapswitch-redesign origin/leapswitch-redesign && git rev-parse HEAD
```
Expected: the full hash equals `<FINAL-COMMIT>`. **STOP** if not.

### Step 5 (VM): alembic is already at head
```bash
sudo docker compose run --rm -T backend alembic current
```
Expected: `0053 (head)`. **STOP** on anything else.

### Step 6 (VM): deploy. GATE: ask the owner's yes first
```bash
sudo sh ./scripts/deploy-redesign.sh --full
```
Expected: `backend: building (...)` (because `backend/` changed), a front-end build ending `built in <N>s`, then the backend and worker started; 3 to 4 minutes. Run it exactly like this. **STOP** if the build fails (nothing live changed; the old image is still `:latest`): report and offer `sudo docker compose up -d`. If it stops on the disk guard, **STOP**; no `--force` without the owner's yes. If it prints `WARNING: ... leapswitch-backend:previous was NOT updated`, tell the owner the rollback image is not the pre-release one.

### Step 7 (VM): containers, images, health
```bash
sudo docker compose ps
sudo docker image ls | grep -E "leapswitch-(backend|worker)"
for u in https://ls-staging-api.unifolio.in/health https://ls-redesign.unifolio.in/ https://ls-staging.unifolio.in/; do curl -s -o /dev/null -w "%{http_code}\n" "$u"; done
```
Expected: postgres, backend, worker, caddy running and healthy; `:previous` and `:latest` with different backend IDs; `200` `200` `200`. **STOP** if anything is unhealthy: `sudo docker compose logs backend --tail 80`, report, offer rollback.

### Step 8 (VM): the new back end answers (read only)
```bash
sudo docker compose exec -T backend python -c "from app.core.time_format import format_ist_datetime; from datetime import datetime, timezone; print(format_ist_datetime(datetime(2026,11,6,10,3,tzinfo=timezone.utc)))"
sudo docker compose exec -T backend python -c "import app.services.auth.email_templates as t; print(hasattr(t,'head_changed_for_new_head_email'), hasattr(t,'head_changed_email'))"
```
Expected: `6 Nov 2026, 3:33 PM IST`, then `True False`. **STOP** otherwise (an old image is running).

### Step 9 (VM): error grep
```bash
sudo docker compose logs --since 10m backend worker | grep -iE "traceback|error" | head -20
```
Expected: nothing alarming. Report what it prints.

### Step 10 (browser, the owner): smoke, then the checklist
Open `https://ls-redesign.unifolio.in/` in a private window (so the old bundle is not cached) and run the checklist `2026-11-06-staging-qa-checklist-qa-fixes.md`. Tell Claude anything that fails.

### Step 11: final report (Claude fills this in)
Deployed commit, last deployed commit, image IDs, time the API was restarting, health codes, step 8 outputs, step 9 output, anything that surprised.

## Section 2: after the deploy
Keep `<LAST-DEPLOYED-COMMIT>` and the previous backend image until the owner signs the checklist. Update `session.md`, `log.md`, `decisions.md`, `backend.md` (the two new response bodies and the three templates).

## Section 3: rollback (only on the owner's yes)
Front end and back end together (no schema change, so the old image runs on the same database):
```bash
cd /opt/unifolio-redesign && git checkout -B leapswitch-redesign <LAST-DEPLOYED-COMMIT>
sudo docker tag leapswitch-backend:previous leapswitch-backend:latest && sudo docker tag leapswitch-worker:previous leapswitch-worker:latest
cd deploy/leapswitch && sudo sh ./scripts/deploy-redesign.sh
sudo docker compose up -d backend worker
```
Check first that `leapswitch-backend:previous` is really the pre-release image (its creation time is before this deploy); after the last deploy it was stale. If it is not, rebuild the old back end from `<LAST-DEPLOYED-COMMIT>` instead (`--rebuild-backend`).
