# Staging deploy guide: QA-round fixes 2 (front end only), 26 Nov 2026

**FROZEN: tag `qa4-rc` = `779f5d000562211d545fa26c2219611bfaf36259` (tag object `c9042dc67e00fdc9b5038841e27ef117fd2be802`) on `leapswitch-redesign`, to be pushed by the owner's yes before the manager starts.** Run by the manager's Claude at the owner's go; the owner's QA follows. Staging today runs `qa-rc` = `ba55826098b9f2841476c4bd230ce42aa4e415df` (guide `2026-11-26-staging-deploy-guide-qa-round.md`). **Read `deploy-guide-standing-lessons.md` first** (this guide already applies it).

## What changes (front end only: no back end, no migration, no new setting, no cron change)
1. **CAMS request flow (QA defect D-2):** after "Request Statement on CAMS" the Add data screen shows the **"Upload your statement" card** (step 2) with the floating checklist still open. A member with an open request opens on the same card. The "CAMS request waiting" card and the "Waiting for CAMS email" screen are **gone from the desktop**; the phone screen is unchanged. **Cancel request is gone** with the card (owner decision, 26 Nov 2026): an open request closes when that member's statement is confirmed, or after 48 hours.
2. **Import History:** **Back to import** always shows the choice screen (the upload options: Request from CAMS / I already have a statement), even when a request is open.
3. **Head of Family emails (QA defect D-1):** the email pictures (`/email/ill-*.png`, `/email/ic-*.png`, light and dark) were blank shapes; they are replaced by the real sketches. They are static files served by the front end, so this is a front-end deploy. Already-sent emails do not change; a new email fetches the pictures (Gmail may cache the old blank ones for a while).

**Not in this release:** the old-head email still shares the "transfer" drawing (its own drawing needs a back-end change); the oval disc behind the drawing is the template's; the PDF is unchanged; nothing in `backend/`.

## Facts that decide this guide
- **Front end only** (`deploy-redesign.sh` **without** `--full`): it builds into the worktree's `frontend/dist` and Caddy serves it live; **the backend and worker are not restarted**. About 10 seconds of build.
- No back-end change means: **no stored-results rebuild, no data backup needed, no look gate** (the PDF and `frontend/src/print/` are untouched, and the export's back end is unchanged). The previous deploy's open items (page 26, the race tests, the real-data PDFs in `/home/deploy/qa-gate/`, the step 11 record of that deploy) are **not part of this deploy**: do not start them here.
- **Rollback is a front-end redeploy of `qa-rc`** (about 1 minute, no data touched).

## Prompt for the executing Claude
```
You are deploying the QA-round fixes 2 (front end only; candidate tag qa4-rc = 779f5d000562211d545fa26c2219611bfaf36259) to the LeapSwitch staging VM (ls-redesign.unifolio.in). Run `git fetch origin --tags` first so the guide and the tag are on your machine. Read Docs/orchestration/deploy-guide-standing-lessons.md and then Docs/orchestration/2026-11-26-staging-deploy-guide-qa4.md and follow the guide step by step.
Rules: run one command at a time and show its output; at every STOP, stop and report; run the GATE steps only after the owner's yes; never print .env lines; never run clean-db.sh, restore.sh or rollback.sh on your own initiative; never use --full or --force on the deploy script (this release is front end only); use ssh by hostname from WSL only (put commands in a script file or write every value out so the Windows-to-WSL layer does not expand them).
At the end fill in step 9 and give the owner the report.
```

## Steps

### Step 0 (laptop): the tag is published (check only)
`git fetch origin --tags && git ls-remote origin 'qa4-rc^{}'` must print `779f5d000562211d545fa26c2219611bfaf36259`. **STOP** if not. Documents committed after the tag change no code.

### Step 1 (laptop): the release touches only what it should
```bash
git diff --name-only qa-rc qa4-rc | grep -vE "^Docs/|\.test\.tsx?$"
```
Expected: **only** `AGENTS.md`, the 20 files `frontend/public/email/{ic-*,ill-*}-{light,dark}.png`, and under `frontend/src/features/import/`: `TwoPathImportContainer.tsx`, `pendingCopy.ts` and the deleted `CamsWaitingCard.tsx`. **STOP** on anything under `backend/`, `deploy/`, `frontend/package.json` or its lock file, `frontend/src/mobile/`, `frontend/src/print/`, or a migration.

### Step 2 (laptop): evidence (measured on `qa4-rc`)
Front end: 615 test files, 7,324 tests passed, 0 failed (measured before the Import History fix; after it the 30 import-folder files pass, 320 tests); `tsc -b` clean; `oxlint` 0 errors (46 existing warnings); `vite build` ok. Sonnet review of the CAMS change: no blockers; its two low points are the Import History Back (fixed in this release) and the no-way-to-dismiss-a-request consequence (accepted by the owner). The emails were rendered locally from the real template with the new pictures, light and dark, and checked. **Not verified:** a real Chrome or Edge run of the flow, a real inbox, anything on staging.

### Step 3 (VM): pre-flight, read-only
```bash
cd /opt/unifolio-redesign && git rev-parse --abbrev-ref HEAD && git log -1 --format=%H && git status --short
df -h / | tail -1
sudo docker compose ps --format '{{.Service}} {{.Image}} {{.Status}}'
date '+%H:%M IST'
ls -ld frontend/dist
```
Expected: branch `leapswitch-redesign`; HEAD = `ba55826098b9f2841476c4bd230ce42aa4e415df` (`qa-rc`; **STOP** and say what it is if it differs); no status lines; **at least 4 GB free** (a front-end build needs little; if under 4 GB **STOP** and report); backend, worker, caddy and the database are up and healthy. Record the `dist` timestamp.

### Step 4 (VM): record the rollback point
Nothing to build or back up. Write down the HEAD hash from step 3: it is the rollback target. (The `previous` backend image is untouched in this release.)

### Step 5 (VM): switch to the tag
```bash
cd /opt/unifolio-redesign && git fetch origin --tags && git checkout -B leapswitch-redesign qa4-rc && git rev-parse HEAD
```
Expected: `779f5d000562211d545fa26c2219611bfaf36259`. **STOP** if not.

### Step 6 (VM): deploy the front end. GATE (the owner's yes)
```bash
cd /opt/unifolio-redesign/deploy/leapswitch && sudo sh ./scripts/deploy-redesign.sh; echo deploy_exit=$?
ls -ld /opt/unifolio-redesign/frontend/dist
sudo docker compose ps --format '{{.Service}} {{.Image}} {{.Status}}'
```
**No `--full`, no `--force`.** Expected: `deploy_exit=0`, "built in" a few seconds; `dist` newer than step 3; the containers' status unchanged (same uptime, not recreated). **STOP** on an error, or on a disk warning that asks for confirmation (report it; never answer yes without the owner).

### Step 7 (VM): smoke check, read-only (search EVERY built file, not only the index's list)
```bash
curl -s -o /dev/null -w 'site=%{http_code}\n' https://ls-redesign.unifolio.in/
curl -s -o /dev/null -w 'api=%{http_code}\n' https://ls-staging-api.unifolio.in/health
curl -s -o /dev/null -w 'old=%{http_code}\n' https://ls-staging.unifolio.in/
cd /opt/unifolio-redesign/frontend/dist/assets
echo "upload card: $(grep -l 'Upload your statement' *.js | wc -l)"
echo "waiting card gone: $(grep -l 'CAMS request waiting' *.js | wc -l)"
for f in ill-back-light ill-back-dark ill-forward-light ill-forward-dark ic-person-light ic-people-dark ic-shield-light ic-crown-dark; do curl -s -o /dev/null -w "$f %{http_code} %{size_download}\n" https://ls-redesign.unifolio.in/email/$f.png; done
sudo docker compose -f /opt/unifolio-redesign/deploy/leapswitch/docker-compose.yml logs backend --since 15m | grep -ci error
```
Expected: site, api and old all `200`; "upload card" at least `1`; **"waiting card gone" is `0`** (do **not** count "Waiting for CAMS email" or "Cancel request": the phone screen still has them); every picture `200`, with sizes **ill-* about 36,000 to 44,000 bytes and ic-* about 4,900 to 6,500 bytes** (the old blank ones were 9,500 to 10,200 and 2,700). **STOP** if a picture is still small (the old file is being served: report). The last line should print `0`, or a count the manager explains.

### Step 8: the owner's QA (the rows below)
| ID | Where and how | What you should see | Result |
|---|---|---|---|
| Q4-01 | Add data, a member with no request: press **Request Statement on CAMS** (Chrome, then Edge) | CAMS opens in a new tab **by itself** with the floating checklist; back in the Unifolio tab the **"Upload your statement" card** is shown, the checklist still floating; **no** "CAMS request waiting" card and **no** "Waiting for CAMS email" screen | |
| Q4-02 | Reload the page, and open Add data for the same member in a private window | Both open straight on the upload card, no waiting card | |
| Q4-03 | Tick checklist items, close and reopen the checklist, switch tabs and come back | The screen never changes | |
| Q4-04 | On the upload card press **Back** | The choice screen (Request from CAMS / I already have a statement) | |
| Q4-05 | Open **Import History**, then **Back to import** (also with a request open) | **The choice screen, never the upload card** | |
| Q4-06 | Upload a statement for that member and confirm | The import works; the member's open request is closed (another member's is untouched) | |
| Q4-07 | A Head of Family change on the invented household; open the three emails (old head: updated; old head: undo link; new head) in **Gmail, light and dark** (and on a phone) | The sketches show: the drawing in the corner, and a **line icon in each tile** (person, people, layers, shield, calendar, warning, link, crown); no blank circles; dark mode readable | |
| Q4-08 | If Gmail still shows blank circles | Note it: it is Gmail's image cache; retry with a fresh email later (renaming the files would be a code change) | |
| Q4-09 | The phone screens | Unchanged | |

These rows replace the earlier HB-01 to HB-05 (the checklist file is updated).

### Step 9 (VM): record (Claude fills this in)
Date and time, the baseline and the new HEAD, the deploy exit and its duration, the step 7 outputs (counts and picture sizes), anything that differed from this guide, and the owner's QA result.

## Rollback (only on the owner's yes)
```bash
cd /opt/unifolio-redesign && git checkout -B leapswitch-redesign ba55826098b9f2841476c4bd230ce42aa4e415df && cd deploy/leapswitch && sudo sh ./scripts/deploy-redesign.sh; echo rollback_exit=$?
```
Front end only; nothing in the database or back end was changed by this release, so there is nothing else to undo.
