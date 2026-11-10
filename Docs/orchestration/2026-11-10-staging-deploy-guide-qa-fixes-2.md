# Staging Deploy Guide: QA fixes round 2 (`leapswitch-redesign`) to `ls-redesign.unifolio.in`

**Prepared 10 Nov 2026. Nothing here is run until the owner says go.** Source: the 9 Nov staging QA report (`Unifolio-staging-QA-report-9-Nov-2026.pdf`). After the deploy, run `2026-11-10-staging-qa-checklist-qa-fixes-2.md`.

## What changes (front end only)
1. **View new funds pop-up (QA finding 1):** fund names wrap instead of being cut off, the list no longer stretches past the pop-up, and the pop-up scrolls up and down when long. Files: `NewFundsList.tsx`, `PostImportNotice.tsx`.
2. **Duplicates skipped (new):** the Import complete summary line gets `· N duplicates skipped` (`1 duplicate skipped` for one) only when something was skipped. No new line, nothing in the pop-up. File: `PostImportNotice.tsx`.
3. **Enter key on the Head of Family code steps (QA finding 4):** Enter in the step 1 code does what Continue does; Enter in a step 2 box verifies that box only. Same conditions as the buttons (6 digits, nothing else running). Files: `otp-input.tsx` (new optional `onEnter`), `ChangeHeadDialog.tsx`.

**Not in this release, on purpose (owner's decision, 9 Nov):** the Head of Family email wording (finding 5, to be agreed with Surve), the stray "Import complete / Go to dashboard" pop-up after Add details (finding 3), and the landing page after an import from Home (finding 2, said to be fine).

## Facts that decide this guide
- **Front end only. No migration, no back-end change, no dependency change.** Alembic stays at **0053**.
- So the deploy is the plain **`deploy-redesign.sh`** (no flag): it builds the bundle into `frontend/dist` and Caddy serves it live. **No restart, no downtime, no backup.** The back end, worker and `ls-staging` are untouched.
- Desktop and mobile share the changed components, but nothing under `frontend/src/mobile/` changed.
- Users with the old bundle cached keep it until they reload; use a private window for the QA.

## Prompt for the executing Claude
```
You are deploying the QA fixes round 2 (front end only) to the LeapSwitch staging VM (ls-redesign.unifolio.in). Read Docs/orchestration/2026-11-10-staging-deploy-guide-qa-fixes-2.md and follow it step by step.
Rules: run one command at a time and show its output; at every STOP, stop and report; run nothing that changes the VM before the step that says GATE and the owner's yes; never print .env lines other than the ones the guide names; never run clean-db.sh, restore.sh or rollback.sh on your own initiative.
At the end fill in step 8 and give the owner the report.
```

## Section 1: steps

### Step 0 (laptop): merge the lane into the deploy branch
The work is on the local lane `qa-fixes-2-lane` (worktree `wt/qa-fixes-2`). Merge it into `leapswitch-redesign` (the owner's yes first), then publish with the usual routine, **never force-push**:
```bash
cd "wt/docs" && git merge --no-ff qa-fixes-2-lane && git fetch origin && git rebase origin/leapswitch-redesign && git push origin leapswitch-redesign
```
Expected: the push succeeds. Record the pushed head as `<FINAL-COMMIT>`. **STOP** on any conflict.

### Step 1 (laptop): the release touches only what it should
```bash
git diff --name-only <LAST-DEPLOYED-COMMIT> <FINAL-COMMIT> | grep -vE "^Docs/|\.test\.tsx?$"
```
Expected: exactly `frontend/src/components/mf/NewFundsList.tsx`, `frontend/src/components/mf/PostImportNotice.tsx`, `frontend/src/components/ui/otp-input.tsx`, `frontend/src/features/profile-v2/components/ChangeHeadDialog.tsx`. **STOP** if a migration, a `backend/` file, a dependency file or anything under `frontend/src/mobile/` appears.

### Step 2 (laptop): CI
```bash
gh run list --branch leapswitch-redesign --limit 3
```
Expected: green on `<FINAL-COMMIT>`. Local evidence on the lane: front end full suite 5986 passed (481 files), type check clean. **STOP** if the last code commit is red.

### Step 3 (VM): pre-checks
```bash
cd /opt/unifolio-redesign && git rev-parse --abbrev-ref HEAD && git log -1 --format=%h && git status --short
df -h / | tail -1
```
Expected: `leapswitch-redesign`, then the last deployed commit (record it as `<LAST-DEPLOYED-COMMIT>`, the rollback target), then nothing printed; at least 5 GB free. **STOP** if the status lists files.

### Step 4 (VM): switch to the final commit
```bash
cd /opt/unifolio-redesign && git fetch origin && git checkout -B leapswitch-redesign origin/leapswitch-redesign && git rev-parse HEAD
```
Expected: the full hash equals `<FINAL-COMMIT>`. **STOP** if not.

### Step 5 (VM): deploy. GATE: ask the owner's yes first
```bash
cd deploy/leapswitch && sudo sh ./scripts/deploy-redesign.sh
```
Expected: a front-end build ending `built in <N>s`; no container restarts. **STOP** if the build fails (the old `dist` is untouched only if the script says so; report the output and offer the rollback). If it stops on the disk guard, no `--force` without the owner's yes.

### Step 6 (VM): health
```bash
sudo docker compose ps
for u in https://ls-staging-api.unifolio.in/health https://ls-redesign.unifolio.in/ https://ls-staging.unifolio.in/; do curl -s -o /dev/null -w "%{http_code}\n" "$u"; done
```
Expected: postgres, backend, worker, caddy running and healthy (same container ages as before: nothing was restarted); `200` `200` `200`. **STOP** if anything is unhealthy.

### Step 7 (browser, the owner): smoke, then the checklist
Open `https://ls-redesign.unifolio.in/` in a private window and run `2026-11-10-staging-qa-checklist-qa-fixes-2.md`.

### Step 8: final report (Claude fills this in)
Deployed commit, last deployed commit, build time, health codes, anything that surprised.

## Section 2: rollback (only on the owner's yes)
Front end only, so the back end and database need nothing:
```bash
cd /opt/unifolio-redesign && git checkout -B leapswitch-redesign <LAST-DEPLOYED-COMMIT>
cd deploy/leapswitch && sudo sh ./scripts/deploy-redesign.sh
```
Then confirm `200` on `https://ls-redesign.unifolio.in/` and reload in a private window.
