# Staging Deploy Guide M3: search (Batch K), one date policy and the info pop-ups (Batch E), the section index (Batch F) to `ls-redesign.unifolio.in`

**FROZEN 23 Nov 2026.** `m3-candidate` (worktree `C:\Users\Dell\lanes\unifolio-m3` on the orchestrator's laptop) is merged into `leapswitch-redesign` and tagged `m3-rc` at the freeze (the tag's commit is `9f776a34d7467f83104e93cf9f6d120583db2bdd`, filled in after the tag). It follows `2026-11-20-staging-deploy-guide-m2b.md` (deployed 20 Nov, tag `m2b-rc` = `a4a948cbf7d0f9e3a6ae8986a48f47bf294f07af`). **Nothing here is run until the owner's yes at the GATE steps.** The staging deploy is run by the **manager's Claude** from this guide. No QA round follows it: only the quick verify in step 9; the owner's checks are the M3 rows of `2026-11-19-combined-qa-checklist.md`, run once after M4.

## What changes
1. **Search (Batch K).** One search box on the Mutual Funds pages, the fund page and the Home, History, Portfolio and Planning pages (jump-only on the last four and the fund page), with a dropdown of results (funds, categories, managers, members, SIPs, transactions and stocks hand-offs, pages and sections), chips, recent funds and searches, Ctrl+S or Cmd+S to open it, and an Undo notice when a jump switches the family or member selector. The page lists filter on Enter: Overview (funds and SIP capsules), Transactions (the ledger, with a type word driving the type toggle), Holdings (the all-stocks table), Performance (fund versus benchmark), Overlap (pairs and common stocks), Other Analytics (the per-fund lists). The all-holdings dialog and the compare list on the fund page get a search field; Import history gets a "Search imports" field. **The top bar changes:** its Search input is gone; Ask Mira is a wide soft-green pill at the left; the family selector, + Add data, a divider and the theme toggle sit at the right.
2. **Dates (Batch E).** One date module. Prices read "Prices as on 12 Nov 2026"; monthly data reads as a month ("Holdings as on September 2026", "Fees as on March 2026"); the market-cap list reads "Market-cap list effective 1 Jul 2026". A date strip sits under the tabs on **Allocation** and **Other Analytics** only, with an amber "N funds have older holdings" marker. One shared "i" pop-up (hover, focus, click to pin, Escape to close) replaces the old tooltip on every "i". Valuation by Fund loses its source pills, footnote and "As on" column and gets one "i" per fund. The day-change pop-up note reads "Prices as on <weekday date>".
3. **Section index (Batch F).** Every section of the seven Mutual Funds tabs has an anchor; a frosted side rail ("On this page") lists the sections of Overview, Performance, Allocation, Overlap and Other Analytics (a corner pill below 1100 px), with Pin, jump, and a highlight that follows the scroll.
4. **Back end (additive; the old link keeps working):** one new read-only route `GET /household/search-index` (whole household of the signed-in user, no prices, no writes; `backend/app/api/search.py`, `backend/app/services/search/*`, one `include_router` line in `main.py`). **Two sentences written by the back end are reworded** (`backend/app/services/news/copy.py`: "holdings as on September 2026"; `backend/app/services/fund_page/returns.py`: the printed-benchmark note shows a month, "September 2026", not an ISO date): the old link `ls-staging` shares this back end and will show the new wording too (text only, no field changed).
5. **One new front-end dependency:** `@radix-ui/react-popover` (owner-approved 23 Nov; `frontend/package.json` and the lock file; the image build installs it).

**Not in this release:** any number change; any migration; phone screens; analytics events; the print and PDF wording (Batch I); the follow-ups listed in `decisions.md` (Overview sold list, the Transactions period panel, the Holdings fund chip, the Performance month table, Allocation's "open this slice", picking a Planning scenario from search).

## Facts that decide this guide
- **Back end and front end, no migration, no new setting, no cron change, no price job, no stored-results rebuild** (nothing here changes a stored number). Alembic stays **0054**. Deploy mode is `--full` (the back end changed). The front end is built in the same run; **the new front-end dependency makes this build slower and needs network from the VM**.
- **Old link:** `ls-staging.unifolio.in` sees only the new route (unused by it), and the two reworded sentences. Golden-file tests pin the old payloads.
- **The VM worktree** `/opt/unifolio-redesign` is on `leapswitch-redesign` at `a4a948cb` (tag `m2b-rc`), images `leapswitch-backend:latest` `9a99dcc2dd65` and `previous` `7de6c3d9f52e`. Those are the rollback targets (front end: `a4a948cb`; back end: the `latest` image of step 3, which step 4 tags `previous`).
- **If the front end is served before the back end is ready** the box still works and shows "Some results are unavailable right now" with Try again; nothing breaks.
- **Tests:** step 2.

## Prompt for the executing Claude
```
You are deploying milestone M3 (Batch K search, Batch E dates, Batch F section index) to the LeapSwitch staging VM (ls-redesign.unifolio.in). Read Docs/orchestration/2026-11-23-staging-deploy-guide-m3.md and follow it step by step.
Rules: run one command at a time and show its output; at every STOP, stop and report; run nothing that changes the VM before the step that says GATE and the owner's yes; never print .env lines; never run clean-db.sh, restore.sh or rollback.sh on your own initiative; use ssh by hostname from WSL only (write the remote command so the variables are not expanded by the Windows-to-WSL layer: put commands in a script file or write every value out).
At the end fill in step 10 and give the owner the report.
```

## Section 1: steps

### Step 0 (laptop): publish the frozen candidate
`m3-candidate` is merged into `leapswitch-redesign` and the merge is tagged `m3-rc`. Publish: `git fetch origin && git push origin leapswitch-redesign m3-rc`. **Never force-push.** Commits after the tag are documents only; the deploy uses the tag. (The orchestrator has already done this; confirm with `git ls-remote origin m3-rc` that the hash equals `9f776a34d7467f83104e93cf9f6d120583db2bdd`.)

### Step 1 (laptop): the release touches only what it should
```bash
git diff --name-only a4a948cbf7d0f9e3a6ae8986a48f47bf294f07af m3-rc | grep -vE "^Docs/|\.test\.tsx?$|^backend/tests/"
```
Expected groups only: `backend/app/api/search.py`, `backend/app/main.py`, `backend/app/services/search/*`, `backend/app/services/news/copy.py`, `backend/app/services/fund_page/returns.py`, `frontend/package.json`, `frontend/package-lock.json`, `frontend/src/**` (components/search, components/info, shell, lib, and the features: mutual-funds, individual-fund, home, history, portfolio, planning, profile, auth), `session.md`, `decisions.md`, `CLAUDE.md`. **STOP** on a migration, a requirements or Dockerfile change, anything under `frontend/src/mobile/`, anything under `deploy/`, or anything in `backend/app` outside the files above.

### Step 2 (laptop): evidence (no CI run exists for this branch)
Run by the orchestrator on the final candidate before the tag (23 Nov 2026):
- Front end: 565 test files, 6,727 tests passed, 2 skipped, 1 todo, 0 failed. Types (`tsc -b`) clean. Lint: 0 errors, 30 warnings.
- Back end: 5,960 passed, 26 skipped, 0 failed.
- Reviews: independent reviews G2 (search), G3 (dates) and G4 (section index) done; the findings that were bugs are fixed, each with a test written first. Accepted lower findings are in `decisions.md`.
- Browser check on invented data: the search box, the jump to a section with the outline, the section index and the dropdown placement were checked in a browser; one defect (dropdown running past the window edge) was found and fixed.
- **Not verified:** the new search endpoint against a real Postgres database (the tests use SQLite); the whole thing on real data; nothing has run on the staging server yet. Step 9 is where these get their first real check.

### Step 3 (VM): pre-flight, read-only
```bash
cd /opt/unifolio-redesign && git rev-parse --abbrev-ref HEAD && git log -1 --format=%H && git status --short
df -h / | tail -1
sudo docker image ls leapswitch-backend --format '{{.Tag}} {{.ID}} {{.CreatedSince}}'
sudo docker compose -f /opt/unifolio-redesign/deploy/leapswitch/docker-compose.yml run --rm -T backend alembic current
date '+%H:%M IST'
```
Expected: branch `leapswitch-redesign`; HEAD `a4a948cb...` (the front-end rollback target; if it is anything else, **STOP** and say what it is); no status lines; **at least 12 GB free** (the front-end image is rebuilt with a new dependency; the disk guard needs 10 GB); `latest` `9a99dcc2dd65`; `alembic current` ends `0054 (head)`; the time is **not** within 05:40 to 06:35, 10:30 to 10:40 or 14:00 to 14:15 IST. **STOP** on any miss.

### Step 4 (VM): rollback safety. GATE
```bash
cd /opt/unifolio-redesign/deploy/leapswitch
sudo docker tag leapswitch-backend:latest leapswitch-backend:previous
sudo docker image ls leapswitch-backend --format '{{.Tag}} {{.ID}}'
sudo /opt/unifolio/deploy/leapswitch/scripts/backup.sh; echo backup_exit=$?
sudo crontab -l > /home/deploy/crontab.before-m3-2026-11
```
Expected: `previous` and `latest` show the same id (`9a99dcc2dd65`); `backup_exit=0`; the crontab file is not empty. **STOP** if the backup failed.

### Step 5: no new setting. Nothing to add to `.env`.

### Step 6 (VM): switch to the tag
`cd /opt/unifolio-redesign && git fetch origin && git checkout -B leapswitch-redesign m3-rc && git rev-parse HEAD`. Expected: the full hash equals `9f776a34d7467f83104e93cf9f6d120583db2bdd`. **STOP** if not.

### Step 7 (VM): deploy. GATE: the owner's yes first
```bash
cd /opt/unifolio-redesign/deploy/leapswitch && sudo sh ./scripts/deploy-redesign.sh --full
sudo docker compose ps --format '{{.Service}} {{.Image}} {{.Status}}'
sudo docker image ls leapswitch-backend --format '{{.Tag}} {{.ID}}'
sudo docker compose run --rm -T backend alembic current
```
Expected: exit 0; backend and worker recreated; `latest` has a **new** id and `previous` is `9a99dcc2dd65`; `alembic current` still `0054 (head)`. The front-end build installs the new dependency (`@radix-ui/react-popover`): if the build fails on a network or `npm` error, report the exact message and **STOP** (nothing has been switched live until the build succeeds, but check `docker compose ps` before you say so). If it stops at the disk guard: no `--force` without the owner's yes. **STOP** if the deploy failed or `latest` and `previous` show the same id.

### Step 8: nothing to rebuild or run
No price job and no stored-results rebuild: no number changed.

### Step 9 (VM and laptop): quick verify (a smoke check, not the QA)
Health (run from a script file so the URLs reach the shell; the Windows-to-WSL layer expands `$u` locally):
```bash
for u in https://ls-staging-api.unifolio.in/health https://ls-redesign.unifolio.in/ https://ls-staging.unifolio.in/; do curl -s -o /dev/null -w "%{http_code}\n" "$u"; done
cd /opt/unifolio-redesign/deploy/leapswitch && sudo docker compose logs backend --since 15m | grep -c " ERROR "
```
Expected `200`, `200`, `200`, and an error count of `0`.
**The new route is live and protected** (no sign-in needed: a request without a token must be refused, not 404):
```bash
curl -s -o /dev/null -w "%{http_code}\n" https://ls-staging-api.unifolio.in/household/search-index
```
Expected `401` (a `404` means the new back end is not running: **STOP**). The same answer from the old link's API host is expected because they share the back end.
**The new code is the code that runs (back end):**
```bash
cd /opt/unifolio-redesign/deploy/leapswitch && sudo docker compose run --rm -T backend python -c "
from app.main import app
print(sorted(r.path for r in app.routes if 'search-index' in getattr(r, 'path', '')))
import pathlib
print(pathlib.Path('app/services/news/copy.py').read_text().count('holdings as on'))"
```
Expected: `['/household/search-index']` and `1`.
**The new front end is the one served** (the bundle is split into lazy chunks: search every chunk; read the names from the page):
```bash
curl -s https://ls-redesign.unifolio.in/ | grep -o 'assets/[^"]*\.js' | sort -u
```
then for each path `curl -s https://ls-redesign.unifolio.in/<path>` and count the new text across all of them: `Ask anything about your funds`, `On this page`, `Search funds`, `Prices as on`, `Some results are unavailable`. Each must appear at least once in some chunk; `Search investments` (the old input) must appear in **none**.
**Then the owner opens, in a private window, `https://ls-redesign.unifolio.in/`** (signed in as the test user) and looks at: the top bar (Ask Mira pill at the left, the controls at the right); typing a fund house in the Mutual Funds Overview box and seeing the dropdown and the funds table filter on Enter; Allocation (the date strip under the tabs and the rail at the right edge); Other Analytics (the strip, an "i" next to a fund name in Valuation by Fund). **Defects noticed here go on the QA list; they do not stop the deploy unless the deploy itself is broken.**

### Step 10: record (Claude fills this in)
Deployed commit, last deployed commit, image ids before and after, build time, backup result, health codes, the `401` of the new route, free disk before and after, the chunk search result, anything that surprised. Write it as `Docs/orchestration/2026-11-23-staging-deploy-record-m3.md` (or the day's date) in the M2 record's shape (`2026-11-20-staging-deploy-record-m2b.md`), with an honest list of what is not as hoped.

## Section 2: rollback (only on the owner's yes)
- **Front end:** `cd /opt/unifolio-redesign && git checkout -B leapswitch-redesign a4a948cb && cd deploy/leapswitch && sudo sh ./scripts/deploy-redesign.sh`. (Use the full 40-character hash recorded in step 3.)
- **Back end:** `cd /opt/unifolio-redesign/deploy/leapswitch && sudo sh ./scripts/rollback.sh` (points `latest` back at the `previous` image tagged in step 4). **Check the image id first**: `previous` must be `9a99dcc2dd65`. The new route is harmless to leave in place if only the front end is rolled back (nothing calls it).
- **Migration, crontab, setting, stored results:** none touched; nothing to undo (a saved crontab copy is `/home/deploy/crontab.before-m3-2026-11`).
- No `clean-db.sh`, no `restore.sh` (no schema change, no data write).
