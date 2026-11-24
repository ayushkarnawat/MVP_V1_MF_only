# Staging Deploy Guide M4: the PDF report export (Batch I) and the floating CAMS checklist (Batch H part 2) to `ls-redesign.unifolio.in`

**DRAFT 24 Nov 2026, frozen when `m4-rc` is tagged** (the tag's commit goes into `<M4-RC-HASH>` below at the freeze). `m4-candidate` (worktree `C:\Users\Dell\lanes\unifolio-m4` on the orchestrator's laptop) is `leapswitch-redesign` at `fe3feff1` plus the merges of `batch/i-be`, `batch/i-fe` and `batch/h-checklist`. It follows `2026-11-23-staging-deploy-guide-m3.md` (deployed 23 Nov, tag `m3-rc` = `9f776a34d7467f83104e93cf9f6d120583db2bdd`). **Nothing here is run until the owner's yes at the GATE steps.** The staging deploy is run by the **manager's Claude** from this guide. The owner's one QA round (the M1 to M4 rows of `2026-11-19-combined-qa-checklist.md`) follows this deploy.

## What changes
1. **The PDF report (Batch I).** The **Export PDF** button in the top bar of the Mutual Funds pages opens a dialog (who it is for, which sections, data dates, folio numbers); the server prints the real report pages in its own headless browser and the PDF saves by itself: a cover, a contents page **with page numbers**, a tab page per tab, the chosen sections drawn for paper, a running header and footer, and a notes page. The old "Download PDF" of the analytics page, its route `/print/analytics` and its start-up browser are left in place (the new button does not use them).
2. **The floating CAMS checklist (Batch H part 2).** The Import flow's step-by-step CAMS checklist opens in a small floating window beside the CAMS site (with an in-page panel as the fallback), with its closed card and banners. Front end only.
3. **Back end (additive; the old link keeps working):** four new routes under `/export/report` (`POST /export/report` starts a job, `GET /export/report/{job_id}` is its status, `GET /export/report/{job_id}/file` downloads once, `DELETE /export/report/{job_id}` cancels); a **short-lived read-only "pass"** (180 seconds) that lets the print browser read the user's own data on 13 allow-listed read routes and nothing else; a browser pool (at most two browsers at once across all three workers, one report per user at a time, a 15-second cool-down); temporary job files. Existing routes are unchanged for normal sign-in; the analytics and dashboard routes only gain a guard that stops them rebuilding or dispatching anything when called with a pass.
4. **One new back-end dependency: `pypdf==5.1.0`** (owner-approved 24 Nov; used only to read page text of the printed PDF for the contents page numbers). The image build installs it from `requirements.txt`. Chromium and Playwright are already in the image (the old export uses them).
5. **Two new settings are required** (step 5): `EXPORT_PASS_SECRET` and `EXPORT_API_ORIGIN`. **The back end refuses to start in every environment except local development (so on staging too) without a valid pair, and without an HTTPS `FRONTEND_BASE_URL`** (the independent security review of 24 Nov found the check was production-only and staging's `ENVIRONMENT` is `staging`; fixed). A secret must be at least 32 characters with at least 8 different characters, and different from every other setting. So step 5 must be done before step 7.
6. **New front-end assets:** fonts and logos for the print template (`frontend/src/print/fonts`, `logos`), bundled in the front end build. No new front-end dependency.

**Not in this release:** any number change; any migration; any cron change; the real checklist video (Batch H part 1, waits for the owner's recordings); phone screens.

## Facts that decide this guide
- **Back end and front end, no migration, no cron change, no price job, no stored-results rebuild.** Alembic stays **0054**. Deploy mode is `--full` (the back end changed and `pypdf` is new). The image rebuild needs network from the VM.
- **The two settings.** `EXPORT_PASS_SECRET`: at least 32 random characters and different from every other string setting (the start-up check refuses an equal value); `openssl rand -hex 32` gives 64. `EXPORT_API_ORIGIN`: the API's own public HTTPS origin with no path: **`https://ls-staging-api.unifolio.in`** (the same address the front end calls). `FRONTEND_BASE_URL` is already `https://ls-redesign.unifolio.in` (set on 3 Nov): the print browser may only reach those two origins, so **the front end and the API must be on different origins**, which they are. `EXPORT_JOB_DIR` is optional and stays empty (jobs live under `/tmp/unifolio-export/jobs` inside the backend container).
- **The print browser runs inside the backend container and must be able to open the public HTTPS addresses of both hosts** (a request from the container to `https://ls-redesign.unifolio.in` and `https://ls-staging-api.unifolio.in`). The I-2 measurement on 23 Nov already showed the print page reachable from the container (HTTP 200). Step 9 re-checks it.
- **The three workers share state through files**, not memory: a browser slot, the per-user lock and the job files all live in `/tmp/unifolio-export` in the backend container. **A recreated container (every deploy, every restart) deletes the job files**: an export running during a deploy fails and the user starts it again. Do not deploy while someone is exporting, and not in the job windows (05:40 to 06:35, 10:30 to 10:40, 14:00 to 14:15 IST).
- **Temporary PDF rule (the owner confirms at the GATE, see Step 4a):** a finished PDF is a temporary file in the container, **removed at its first download and in any case within 10 minutes**; the app keeps no copy of any report.
- **Memory:** each running print browser is a few hundred MB while it renders a big household; two at most. The I-2 measurement found **no memory limit visible in the backend container** and about 90 MB per idle browser, so this is expected to fit; step 9 reads memory after the first real export.
- **A shell started with `docker compose exec` skips `/app/docker-entrypoint.sh`**, which builds `DATABASE_URL`; any command that needs the database runs as `docker compose exec -T -e PYTHONPATH=/app backend /app/docker-entrypoint.sh python <script>`. This guide's checks do not need the database.
- **Old link:** `ls-staging.unifolio.in` shares this back end and sees only the new routes (unused by it) and the new sign-in-free guard behaviour (none for normal sessions).
- **The VM worktree** `/opt/unifolio-redesign` is on `leapswitch-redesign` at `9f776a34` (tag `m3-rc`). That is the front-end rollback target; the back-end rollback target is the `latest` image of step 3, which step 4 tags `previous`.
- **Tests (24 Nov):** step 2.

## Prompt for the executing Claude
```
You are deploying milestone M4 (Batch I PDF export and Batch H part 2 floating checklist) to the LeapSwitch staging VM (ls-redesign.unifolio.in). Read Docs/orchestration/2026-11-24-staging-deploy-guide-m4.md and follow it step by step.
Rules: run one command at a time and show its output; at every STOP, stop and report; run nothing that changes the VM before the step that says GATE and the owner's yes; never print .env lines (the guide counts a line, it never shows one, and it never shows the value of a secret); never run clean-db.sh, restore.sh or rollback.sh on your own initiative; use ssh by hostname from WSL only (write the remote command so the variables are not expanded by the Windows-to-WSL layer: put commands in a script file or write every value out).
At the end fill in step 10 and give the owner the report.
```

## Section 1: steps

### Step 0 (laptop): publish the frozen candidate
`m4-candidate` is merged into `leapswitch-redesign` and the merge is tagged `m4-rc`. Publish: `git fetch origin && git push origin leapswitch-redesign m4-rc`. **Never force-push.** Commits after the tag are documents only; the deploy uses the tag. (The orchestrator does this at the freeze; confirm with `git ls-remote origin m4-rc` that the hash equals `<M4-RC-HASH>`.)

### Step 1 (laptop): the release touches only what it should
```bash
git diff --name-only 9f776a34d7467f83104e93cf9f6d120583db2bdd m4-rc | grep -vE "^Docs/|\.test\.tsx?$|^backend/tests/"
```
Expected groups only: `.env.example`, `backend/requirements.txt` (one line: `pypdf==5.1.0`), `backend/app/config.py`, `backend/app/main.py`, `backend/app/api/export.py`, `backend/app/api/analytics.py`, `backend/app/api/dashboard.py`, `backend/app/services/auth/session.py`, `backend/app/services/export/*`, `frontend/src/**` (the folders `print`, `features/export`, `features/import`, `features/mutual-funds`, `components`, `shell/layout`, `lib`), `session.md`, `decisions.md`, `CLAUDE.md`. **STOP** on a migration, any change to `backend/Dockerfile`, `docker-entrypoint.sh`, anything under `deploy/`, `frontend/package.json` or its lock file, or anything in `backend/app` outside the files above.

### Step 2 (laptop): evidence (no CI run exists for this branch)
Run by the orchestrator on the merged candidate before the tag (24 Nov 2026):
- Front end: `<FE-RESULT>`.
- Back end: `<BE-RESULT>`.
- Reviews: independent security review (Opus, fresh reviewer, 24 Nov) of the export pass and render service: **no blockers**; two should-fix findings fixed with tests (the start-up checks now run on staging and check the secret's strength and an HTTPS front-end address; job creation and the page-text reading no longer block the server's event loop), plus one low fixed (a member name cannot forge the page-number markers). **Accepted for later, recorded in `decisions.md`:** unclaimed PDFs are swept only when another export call reaches the container; a pass is not tied to its job still running (the proof header never leaves the print browser, 180 s window); WebSocket traffic from the print page is not filtered (no way found to inject a script into the page); the status code (401 versus 403) tells a pass holder that the pass is genuine; the print browser starts without Chromium's own sandbox (Playwright's default in containers).
- Rendered check: the print route was rendered to a PDF in Chrome from invented data (cover, contents, tab pages, sections, header and footer, notes); a defect found there (one failing section blanked the whole report) was fixed with a per-section error boundary.
- **Not verified:** the whole pipeline end to end (the real server, the real pass, the print browser opening the real hosts, the two-pass page numbers) has **never run outside tests**; the Overlap and Other Analytics pages were not drawn with real data; nothing has run on the staging server yet. Step 9 is where these get their first real check.

### Step 3 (VM): pre-flight, read-only
```bash
cd /opt/unifolio-redesign && git rev-parse --abbrev-ref HEAD && git log -1 --format=%H && git status --short
df -h / | tail -1
sudo docker image ls leapswitch-backend --format '{{.Tag}} {{.ID}} {{.CreatedSince}}'
sudo docker compose -f /opt/unifolio-redesign/deploy/leapswitch/docker-compose.yml run --rm -T backend alembic current
date '+%H:%M IST'
```
Expected: branch `leapswitch-redesign`; HEAD `9f776a34d7467f83104e93cf9f6d120583db2bdd` (if anything else, **STOP** and say what it is); no status lines; **at least 12 GB free**; `alembic current` ends `0054 (head)`; the time is **not** within 05:40 to 06:35, 10:30 to 10:40 or 14:00 to 14:15 IST. Record the `latest` image id (it is the back-end rollback target). **STOP** on any miss.

### Step 4 (VM): rollback safety. GATE
```bash
cd /opt/unifolio-redesign/deploy/leapswitch
sudo docker tag leapswitch-backend:latest leapswitch-backend:previous
sudo docker image ls leapswitch-backend --format '{{.Tag}} {{.ID}}'
sudo /opt/unifolio/deploy/leapswitch/scripts/backup.sh; echo backup_exit=$?
sudo crontab -l > /home/deploy/crontab.before-m4-2026-11
```
Expected: `previous` and `latest` show the same id (the one recorded in step 3); `backup_exit=0`; the crontab file is not empty. **STOP** if the backup failed.

### Step 4a: the owner's two yeses (the manager's Claude asks, in this order, and waits)
1. "The PDF files the report makes are temporary: removed at the first download and at the latest ten minutes after they are made; the app keeps no copy. Is that right for staging?"
2. "May I add two settings to the staging environment file and deploy?"
**STOP** without both yeses.

### Step 5 (VM): the two new settings
The real `.env` is `/opt/unifolio/deploy/leapswitch/.env` (owned by root, mode 600; the redesign `.env` is a symlink to it): every read and write needs `sudo`; never print a line.
```bash
cd /opt/unifolio/deploy/leapswitch
sudo grep -c '^EXPORT_PASS_SECRET=.' .env
sudo grep -c '^EXPORT_API_ORIGIN=.' .env
sudo grep -c '^ENVIRONMENT=production' .env
```
Expected: `0`, `0` and the third is informational (the start-up check runs on staging too, whatever it says). If either of the first two is `1`, skip that setting. Otherwise:
```bash
sudo cp -p .env .env.bak-2026-11-m4
printf 'EXPORT_PASS_SECRET=%s\n' "$(openssl rand -hex 32)" | sudo tee -a .env > /dev/null
printf 'EXPORT_API_ORIGIN=%s\n' 'https://ls-staging-api.unifolio.in' | sudo tee -a .env > /dev/null
sudo grep -c '^EXPORT_PASS_SECRET=.' .env
sudo grep -c '^EXPORT_API_ORIGIN=https://ls-staging-api.unifolio.in$' .env
sudo grep -c '^FRONTEND_BASE_URL=https://ls-redesign.unifolio.in$' .env
```
Expected: `1`, `1` and `1` (the last: the front end's address is already right; if `0`, **STOP** and report the count, never the line). **STOP** if any count is not exactly as expected (a duplicate line is a defect; restore from the backup file and report).

### Step 6 (VM): switch to the tag
```bash
cd /opt/unifolio-redesign && git fetch origin && git checkout -B leapswitch-redesign m4-rc && git rev-parse HEAD
```
Expected: the full hash equals `<M4-RC-HASH>`. **STOP** if not.

### Step 7 (VM): deploy. GATE: the owner's yes first (step 4a)
```bash
cd /opt/unifolio-redesign/deploy/leapswitch && sudo sh ./scripts/deploy-redesign.sh --full
sudo docker compose ps --format '{{.Service}} {{.Image}} {{.Status}}'
sudo docker image ls leapswitch-backend --format '{{.Tag}} {{.ID}}'
sudo docker compose run --rm -T backend alembic current
```
Expected: exit 0; backend and worker recreated; `latest` has a **new** id and `previous` the id of step 3; `alembic current` still `0054 (head)`. If the build fails on a network or `pip` error, report the exact message and **STOP**. If it stops at the disk guard: no `--force` without the owner's yes. **If the backend container restarts in a loop**, read `sudo docker compose logs backend --tail 40` for the words "Refusing to start" (a wrong or missing export setting): report the sentence, **never print .env lines**, and **STOP**. **STOP** if the deploy failed or `latest` and `previous` show the same id.

### Step 8: nothing to rebuild or run
No price job and no stored-results rebuild: no number changed.

### Step 9 (VM and laptop): quick verify (a smoke check, not the QA)
Health (run from a script file so the URLs reach the shell; the Windows-to-WSL layer expands `$u` locally):
```bash
for u in https://ls-staging-api.unifolio.in/health https://ls-redesign.unifolio.in/ https://ls-staging.unifolio.in/; do curl -s -o /dev/null -w "%{http_code}\n" "$u"; done
cd /opt/unifolio-redesign/deploy/leapswitch && sudo docker compose logs backend --since 15m | grep -c " ERROR "
```
Expected `200`, `200`, `200`, and an error count of `0`.
**The new routes are live and protected** (no sign-in: a request without a token must be refused, not 404):
```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://ls-staging-api.unifolio.in/export/report -H 'Content-Type: application/json' -d '{}'
curl -s -o /dev/null -w "%{http_code}\n" https://ls-staging-api.unifolio.in/export/report/0000
```
Expected `401` and `401` (a `404` means the new back end is not running: **STOP**; a `422` or `200` on the first means the route is not guarded: **STOP** and report).
**The new code is the code that runs, and `pypdf` is in the image:**
```bash
cd /opt/unifolio-redesign/deploy/leapswitch && sudo docker compose run --rm -T backend python -c "
import pypdf; print(pypdf.__version__)
from app.main import app
print(sorted(p for p in app.openapi()['paths'] if p.startswith('/export')))"
```
Expected: `5.1.0` and `['/export/report', '/export/report/{job_id}', '/export/report/{job_id}/file']` (the status route and the cancel route share the second path: four routes, three paths).
**The print browser can reach both hosts from the container** (the same check as I-2; no database needed):
```bash
cd /opt/unifolio-redesign/deploy/leapswitch && sudo docker compose exec -T backend python -c "
import urllib.request
for u in ('https://ls-redesign.unifolio.in/print/report','https://ls-staging-api.unifolio.in/health'):
    print(urllib.request.urlopen(u, timeout=15).status)"
```
Expected `200` and `200`.
**The front end is the one served:** `curl -s https://ls-redesign.unifolio.in/ | grep -o 'assets/[^"]*\.js' | sort -u`, then count across every chunk the texts `Your report is ready`, `Data dates on every page` and `Mutual Fund Portfolio Report`; each at least once. (`Download PDF` still exists in the old analytics page's chunk: the old route is left in place, so its presence is expected.)
**Then the owner does the real export, signed in as the test user, in a private window** (this is the first real run of the whole pipeline; the manager's Claude watches `sudo docker compose logs backend -f --since 1m` in a second step and does not print anything but error lines):
1. Open `https://ls-redesign.unifolio.in/`, Mutual Funds, click the **Export PDF** button in the top bar, keep the defaults, start the export. Expected: a progress state, then "Your report is ready" and the file saves by itself within about a minute; the PDF opens with the cover, a contents page **with page numbers**, a page per tab, the sections, header, footer and notes. "Download again" in the dialog saves a second copy **from the browser's memory** (the server's file is single use and already gone: this is by design, not a defect).
2. Export once more with only two sections and the cover off: a short PDF with no cover and no contents.
3. Click Export twice in a row: the second is refused with a calm "wait" message (one report at a time, 15-second cool-down), not an error page.
4. Open the report's **first page text for a PAN-like string**: there must be none (the report never prints a PAN).
5. The checklist: Import, "Upload from CAMS", the floating checklist opens beside the CAMS tab; close it; the closed card shows.
Then the manager's Claude reads, once: `sudo docker stats --no-stream` (memory of the backend container after the export) and `sudo docker compose exec -T backend sh -c 'ls /tmp/unifolio-export/jobs | wc -l'` (expected `0` after the downloads, or at most the job not yet downloaded), and the error count again (expected `0`).
**Defects noticed here go on the QA list; they do not stop the deploy unless the deploy itself is broken** (an export that never finishes, a `Refusing to start`, or any `500` in the log is a stop).

### Step 10: record (Claude fills this in)
Deployed commit, last deployed commit, image ids before and after, build time, backup result, health codes, the two `401`s, the `pypdf` version, free disk before and after, memory after the first export, the owner's export result (how long it took, how many pages, whether the page numbers were there), anything that surprised. Write it as `Docs/orchestration/2026-11-24-staging-deploy-record-m4.md` (or the day's date) in the M3 record's shape, with an honest list of what is not as hoped.

## Section 2: rollback (only on the owner's yes)
- **Front end:** `cd /opt/unifolio-redesign && git checkout -B leapswitch-redesign 9f776a34d7467f83104e93cf9f6d120583db2bdd && cd deploy/leapswitch && sudo sh ./scripts/deploy-redesign.sh`.
- **Back end:** `cd /opt/unifolio-redesign/deploy/leapswitch && sudo sh ./scripts/rollback.sh` (points `latest` back at the `previous` image tagged in step 4). **Check the image id first**: `previous` must be the id recorded in step 3. The old back end ignores the two new settings, so they can stay in `.env`.
- **Settings:** the two lines can stay; to remove them restore `/opt/unifolio/deploy/leapswitch/.env.bak-2026-11-m4` (only on the owner's yes; it also removes nothing else because no other line was changed).
- **Migration, crontab, stored results:** none touched (a saved crontab copy is `/home/deploy/crontab.before-m4-2026-11`).
- Temporary job files disappear with the recreated container.
- No `clean-db.sh`, no `restore.sh` (no schema change, no data write).
