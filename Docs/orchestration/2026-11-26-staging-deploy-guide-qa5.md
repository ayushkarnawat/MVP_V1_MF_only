# Staging deploy guide: QA-round fixes 3 (front end only), 26 Nov 2026

**FROZEN: tag `qa5-rc` = `48f8b6a482931f365c1842a055ec35971cc2dcf7` (tag object `39c231a48f9fc7e5f1e64456a30062e59581f07e`) on `leapswitch-redesign`, to be pushed by the owner's yes before the manager starts.** Run by the manager's Claude at the owner's go; the owner's QA follows. Staging today runs `qa4-rc` = `779f5d000562211d545fa26c2219611bfaf36259` (guide `2026-11-26-staging-deploy-guide-qa4.md`). **Read `deploy-guide-standing-lessons.md` first** (this guide applies it).

## What changes (front end only: no back end, no migration, no new setting, no cron change)
**The CAMS tab did not open after Request (QA defect D-2, found in the owner's screen recording).** Cause, proven in a real Chrome with a seven-case test page: **one click can open a new tab or a floating window, never both** (each uses the click's single permission). The floating checklist and the CAMS link were asked for in the same click, so Chrome kept the floating window and blocked the tab. The fix uses two clicks the user already makes:
1. **Choice screen, click "Request from CAMS":** the floating checklist opens on that click, then the request page shows.
2. **Request page, click "Request Statement on CAMS":** the plain link opens the **CAMS tab by itself**; the floating checklist (already open) floats over it. Back in the Unifolio tab: the upload card (from the previous release).
Also:
- **Back to import options** on the request page closes the floating checklist.
- **Continue without it** closes the floating checklist; **Turn it back on** opens it again (that click is its own permission).
- **If the floating checklist is not open when Request is clicked** (page reloaded on the request page, window closed, or the request page reached from somewhere other than the choice click): the CAMS tab still opens, and the checklist shows **inside the page** (the same panel used by browsers that cannot float). The floating window cannot be requested in that click.
**No new words anywhere.** Not in this release: the old-head email drawing; the phone; Edge is checked by the owner (the rule is the same in Edge but is not proven there).

## Facts that decide this guide
- **Front end only** (`deploy-redesign.sh` **without** `--full`); the backend and worker are not restarted. About 10 seconds of build. No back-end change: **no stored-results rebuild, no data backup, no look gate**.
- **Rollback is a front-end redeploy of `qa4-rc`** (about 1 minute).

## Prompt for the executing Claude
```
You are deploying the QA-round fixes 3 (front end only; candidate tag qa5-rc = 48f8b6a482931f365c1842a055ec35971cc2dcf7) to the LeapSwitch staging VM (ls-redesign.unifolio.in). Run `git fetch origin --tags` first so the guide and the tag are on your machine. Read Docs/orchestration/deploy-guide-standing-lessons.md and then Docs/orchestration/2026-11-26-staging-deploy-guide-qa5.md and follow the guide step by step.
Rules: run one command at a time and show its output; at every STOP, stop and report; run the GATE steps only after the owner's yes; never print .env lines; never run clean-db.sh, restore.sh or rollback.sh on your own initiative; never use --full or --force on the deploy script (this release is front end only); use ssh by hostname from WSL only (put commands in a script file or write every value out so the Windows-to-WSL layer does not expand them).
At the end fill in step 8 and give the owner the report.
```

## Steps

### Step 0 (laptop): the tag is published (check only)
`git fetch origin --tags && git ls-remote origin 'qa5-rc^{}'` must print `48f8b6a482931f365c1842a055ec35971cc2dcf7`. **STOP** if not.

### Step 1 (laptop): the release touches only what it should
```bash
git diff --name-only qa4-rc qa5-rc | grep -vE "^Docs/|\.test\.tsx?$"
```
Expected: **only** `frontend/src/features/import/{RequestCamsPath.tsx, TwoPathImportContainer.tsx, testFixtures.ts}` and `frontend/src/features/import/checklist/{checklistStore.ts, useCamsChecklist.ts}`. **STOP** on anything else, and on anything under `backend/`, `deploy/`, the package files, `frontend/src/mobile/`, `frontend/src/print/`, or a migration.

### Step 2 (laptop): evidence (measured on `qa5-rc`)
Front end: 615 test files, 7,327 tests passed, 0 failed; `tsc -b` clean; `oxlint` 0 errors; `vite build` ok. **Real-browser evidence:** the seven-case test page (owner's Chrome, 26 Nov 2026): every one-click order opened only one of the tab and the floating window; the two-click order (choice click opens the floating window, then a plain link click opens the tab) opened both. **Not verified:** the real app in Chrome and Edge (the owner's QA), anything on staging.

### Step 3 (VM): pre-flight, read-only
```bash
cd /opt/unifolio-redesign && git rev-parse --abbrev-ref HEAD && git log -1 --format=%H && git status --short
df -h / | tail -1
sudo docker compose ps --format '{{.Service}} {{.Image}} {{.Status}}'
ls -ld frontend/dist
```
Expected: branch `leapswitch-redesign`; HEAD = `779f5d000562211d545fa26c2219611bfaf36259` (`qa4-rc`; **STOP** and say what it is if it differs); no status lines; **at least 4 GB free**; containers up and healthy. Record the `dist` timestamp.

### Step 4 (VM): switch to the tag
```bash
cd /opt/unifolio-redesign && git fetch origin --tags && git checkout -B leapswitch-redesign qa5-rc && git rev-parse HEAD
```
Expected: `48f8b6a482931f365c1842a055ec35971cc2dcf7`. **STOP** if not.

### Step 5 (VM): deploy the front end. GATE (the owner's yes)
```bash
cd /opt/unifolio-redesign/deploy/leapswitch && sudo sh ./scripts/deploy-redesign.sh; echo deploy_exit=$?
ls -ld /opt/unifolio-redesign/frontend/dist
sudo docker compose ps --format '{{.Service}} {{.Image}} {{.Status}}'
```
**No `--full`, no `--force`.** Expected: `deploy_exit=0`; `dist` newer than step 3; containers not recreated. **STOP** on an error or a disk question (report; never answer yes without the owner).

### Step 6 (VM): smoke check, read-only
```bash
curl -s -o /dev/null -w 'site=%{http_code}\n' https://ls-redesign.unifolio.in/
curl -s -o /dev/null -w 'api=%{http_code}\n' https://ls-staging-api.unifolio.in/health
curl -s -o /dev/null -w 'old=%{http_code}\n' https://ls-staging.unifolio.in/
cd /opt/unifolio-redesign/frontend/dist/assets
echo "upload card: $(grep -l 'Upload your statement' *.js | wc -l)"
echo "waiting card gone: $(grep -l 'CAMS request waiting' *.js | wc -l)"
echo "request link: $(grep -l 'Request Statement on CAMS' *.js | wc -l)"
```
Expected: all three status codes `200`; "upload card" at least `1`; "waiting card gone" `0`; "request link" at least `1`. No code change can be proven from a text count here: the proof is the owner's QA below.

### Step 7: the owner's QA (real Chrome, then Edge, light and dark)
| ID | Where and how | What you should see | Result |
|---|---|---|---|
| Q5-01 | Add data, a member with no request: on the choice screen click **Request from CAMS** | The request page shows and **the floating checklist opens on that same click** | |
| Q5-02 | Click **Request Statement on CAMS** | **The CAMS tab opens by itself**; the floating checklist stays on top of it; back in the Unifolio tab the **upload card** shows | |
| Q5-03 | The browser tab strip after Q5-02 | **A new CAMS tab is there** (this was the failure in the recording) | |
| Q5-04 | On the request page press **Back to import options** | The floating checklist closes; the choice screen shows | |
| Q5-05 | On the request page press **Continue without it**, then **Request Statement on CAMS** | No floating checklist; the CAMS tab opens | |
| Q5-06 | Press **Turn it back on** | The floating checklist opens | |
| Q5-07 | Reload the page while on the request page, then **Request Statement on CAMS** | The CAMS tab opens; the checklist shows **inside the page** (no floating window) | |
| Q5-08 | Repeat Q5-01 to Q5-03 in **Edge** | The same | |
| Q5-09 | Q4-04 to Q4-09 of the previous guide (Back, Import History Back, upload closes the request, the emails, the phone) | Unchanged | |

### Step 8 (VM): record (Claude fills this in)
Date and time, the baseline and the new HEAD, the deploy exit, the step 6 outputs, anything that differed, and the owner's QA result.

## Rollback (only on the owner's yes)
```bash
cd /opt/unifolio-redesign && git checkout -B leapswitch-redesign 779f5d000562211d545fa26c2219611bfaf36259 && cd deploy/leapswitch && sudo sh ./scripts/deploy-redesign.sh; echo rollback_exit=$?
```
Front end only; nothing else to undo.
