# Staging Deploy Guide: the QA-round fixes (patches 1, 2 and 3 together) to `ls-redesign.unifolio.in`

**DRAFT 26 Nov 2026 (not frozen).** Marked `AT FREEZE` items are filled in when the patches are built and gated: the tag name and hash and the final test numbers. **Owner decisions: 25 Nov 2026, the patches deploy together from this one guide (no per-patch guides); 26 Nov 2026, option B: patches 1 and 2 and the safe parts of patch 3 deploy now, and the heavy-section speed work (ES-5) and cold-data warming (ES-6) ship later as patch 3b.** The staging deploy is run by the **manager's Claude** from this guide at the owner's go; the owner's QA round follows (the rows of `2026-11-19-combined-qa-checklist.md`, section "QA-round patches", plus the M1 to M4 and XR rows still open). Predecessors: `2026-11-24-staging-deploy-guide-m4.md` (M4, tag `m4-rc` = `355cc8a1`), the XIRR/Returns guide and the M3 guide; this guide reuses their style and commands.

## What changes
**Patch 1 (the QA round's fixes).**
1. **Visual pass:** white text on every green button (owner decision QA-1 B), a bigger info "i", a hint line in the search box, the benchmark "Choose up to 3" hint, an underlined Movers header, the same icon tile on the onboarding options. Look only: no word changes except the new hint lines.
2. **Head of Family, part A:** a statement being imported no longer blocks the change; an unfinished review is discarded inside the change and the sign-in screen says so in one extra line; if a confirm is saving at that moment the change answers a calm "A statement is being saved. Try again in a minute." with a countdown button. **Back end:** one new 409 code (`statement_being_saved`), one new response field (`discarded_review`), every lock of the swap taken NOWAIT (the swap never waits and cannot deadlock with a confirm).
3. **D-12:** the category average on the Performance page uses the same funds as the rank, per period. **The 1-year average moves** (newer funds join it); 3Y and 5Y do not change. **The stored results must be rebuilt after the back end is up (step 8).**
4. **Summary bar polish:** both summary bars (Portfolio and Mutual Funds) get one premium look (a lead card plus one panel, a bottom strip), nothing shown changes; the holdings table shows the caution note in the same quiet style (the printed PDF is unchanged).
5. **Export timing log:** one extra `export timing:` line per export in the backend log (no behaviour change).

**Patch 2 (Head of Family B, C, D and D-2).**
6. **A waiting CAMS request** closes when its member's statement is imported; **Add data** reads the waiting request from the server (works after a reload and on a second device), shows a **waiting card** with the time left, Upload the file and a Cancel that always works; **nothing in the checklist or window focus changes the screen any more**.
7. **The checklist is a reading aid:** a status strip (progress bar, count, step, Reopen, **Reset checklist**), the request never waits for the checklist window, and a visible **Continue without it** row with a **Turn it back on** undo.
8. **D-2:** **Request from CAMS is a real link**: one click opens CAMS in a new tab and the floating checklist from the same click; the "Open the CAMS form" button and the "Getting your link ready" step are gone; a refused floating window falls back to the in-page panel and CAMS still opens.
9. **The Head of Family dialog** shows one quiet line per member who has a waiting CAMS request (no button, nothing blocked).
10. **Back end (additive):** `GET /cas-imports/pending`, `GET /cas-imports/cams-link`, a per-member `waiting_cams_request` flag on the eligibility list, and the one-off script `backend/scripts/close_stuck_cams_requests.py` (**dry run by default**; run in step 9b).

**Patch 3, the safe part (PDF export; the PDF itself does not change).**
11. **Idle browsers stop:** the old Download PDF route launches its browser on first use; start-up no longer launches one in each of the three workers (about 800 MB of memory comes back).
12. **Honest progress in the export dialog:** the elapsed time counts up, "Finishing the PDF" names the last stage, and a large report (20 or more sections) shows "A full report with all 24 sections can take a few minutes. You can keep using Unifolio; it will be ready to download here." (the strings are confirmed by the owner; the built footer sentence "This can take about a minute..." stays as built).
13. **Tools:** `backend/scripts/export_look_gate.py` (capture and compare PDFs page by page) and a `--save-pdf` flag on `measure_export_staging.py`; neither runs by itself. **The PDF itself is unchanged: this release prints it exactly as today (two prints, contents page numbers as today).**

**Not in this release (patch 3b, later):** (a) the cheaper contents step (the second whole-report print replaced by a print of only the cover and contents pages, spliced in front of the first PDF): it is built and tested but was **held back** after the whole-branch review found that the page footer "Page N of M" would read the wrong total on the spliced pages (`Docs/orchestration/2026-11-26-es-3-footer-total-note.md` has the fix); (b) speeding up the four heavy sections (ES-5) and warming the data the slow sections wait for (ES-6), which need real-household profiling on staging. A full report therefore takes about as long as today in this release; the **under 120 seconds** acceptance belongs to patch 3b.

**Also not in this release:** any migration; any cron change; any new setting; any new dependency; phone screens.

## Facts that decide this guide
- **Back end and front end, no migration, no cron change, no new setting, no new dependency.** Alembic stays **0054** (the G3 review confirmed no new version file). Deploy mode `--full`. The image rebuild needs network from the VM.
- **Stored results must be rebuilt** (D-12): the stored category-ranking rows hold the old 1-year average. The rebuild command is the XIRR guide's step 8 (`run-job.sh analytics-recompute-xr scripts/run_analytics_recompute.py --all`); the one deploy command ships back end and front end together, so there is a **gap of a few minutes** (step 8) in which the Performance page's 1-year average can show the old figure; the owner starts QA only after step 8.
- **The 15-minute web cache** can serve cached holdings for up to 15 minutes after the rebuild; it clears itself.
- **Job windows:** do not deploy or rebuild in 05:40 to 06:35, 10:30 to 10:40 or 14:00 to 14:15 IST. **Do not deploy while someone is exporting** (a recreated container deletes the export job files).
- **A shell started with `docker compose exec` skips `/app/docker-entrypoint.sh`**, which builds `DATABASE_URL`; any command that needs the database runs as `docker compose exec -T -e PYTHONPATH=/app backend /app/docker-entrypoint.sh python <script>`.
- **Old link** `ls-staging.unifolio.in` shares this back end: it sees only additive routes and fields.
- **Rollback targets:** front end = the VM worktree's current tag (recorded in step 3); back end = the `latest` image of step 3, which step 4 tags `previous`.
- **Known and accepted (from the reviews):** the PostgreSQL lock behaviour of the Head of Family swap and the clean-up script's read-only session could only be tested on SQLite and by statement text on the laptop, so steps 9a and 9b exist; the phone's waiting screen still uses its old placeholder id; the 10 export tests that fail on the laptop fail only because `pypdf` is not installed there (it is installed in the image).

## Prompt for the executing Claude
```
You are deploying the QA-round fixes (patches 1, 2 and 3 together) to the LeapSwitch staging VM (ls-redesign.unifolio.in). Read Docs/orchestration/2026-11-26-staging-deploy-guide-qa-round.md and follow it step by step.
Rules: run one command at a time and show its output; at every STOP, stop and report; run the GATE steps only after the owner's yes (the guide marks each); never print .env lines; never run clean-db.sh, restore.sh or rollback.sh on your own initiative; use ssh by hostname from WSL only (write the remote command so the variables are not expanded by the Windows-to-WSL layer: put commands in a script file or write every value out); the one-off script close_stuck_cams_requests.py is run WITHOUT --apply first and --apply only after the owner has seen the counts and said yes.
At the end fill in step 11 and give the owner the report. The look-gate PDFs hold real data: they stay in the container's temporary files and in the VM folder named in step 3b only until step 9d, then are deleted; never commit, print or copy their content.
```

## Section 1: steps

### Step 0 (laptop): publish the frozen candidate `AT FREEZE`
The three patch branches (`patch/qa1`, `patch/qa2`, `patch/qa3`) are merged into one candidate on `leapswitch-redesign`, tagged `qa-rc`. Publish: `git fetch origin && git push origin leapswitch-redesign qa-rc` (**never force-push**); confirm with `git ls-remote origin 'qa-rc^{}'` that the hash equals `<AT FREEZE>`.

### Step 1 (laptop): the release touches only what it should
```bash
git diff --name-only <last deployed tag, step 3> qa-rc | grep -vE "^Docs/|\.test\.tsx?$|^backend/tests/"
```
Expected groups only: `frontend/src/**` (folders `components`, `features/auth`, `features/import`, `features/profile-v2`, `features/mutual-funds`, `features/portfolio`, `features/export`, `features/dashboard`, `lib`, `styles`, `test`), `backend/app/services/auth/{head_change,schemas}.py`, `backend/app/api/{auth,cas_imports,imports}.py`, `backend/app/services/import_/{state_machine,cams_portal,confirm_people,deletion}.py`, `backend/app/services/analytics/{category_ranking,performance_ranking}.py`, `backend/app/services/export/{render,timing}.py` (only the timing marks and the one log line; `frontend/src/print/` is not touched), `backend/scripts/{close_stuck_cams_requests,category_pool_before_after,category_average_diff_report,export_category_average_excel,export_look_gate,measure_export_staging}.py`, `session.md`, `decisions.md`, `CLAUDE.md`. **STOP** on a migration (`backend/alembic/versions/`), any change to `backend/Dockerfile`, `docker-entrypoint.sh`, anything under `deploy/`, `frontend/package.json` or its lock file, `backend/requirements.txt`, or `backend/app` files outside the list above.

### Step 2 (laptop): evidence `AT FREEZE`
Fill in the numbers of the frozen candidate, as the M4 guide's step 2 does: front end (test files, tests, skipped, failed, `tsc -b`, `oxlint` errors, `vite build`), back end (the areas run, passed, skipped, the failures that **also fail on the base branch**: `test_scorer.py::test_compute_fund_score_survives_concurrent_duplicate_insert` and the 10 `pypdf` export tests on the laptop), the Sonnet reviews (G2 summary bar, G2 patch 2, G3 patch 1: no blockers; G3 patch 2 and 3 at freeze) and the Codex G1 reviews (Head of Family lock fix: PASS on the third round; export timing log: PASS; clean-up script: four rounds, the owner stopped the loop at `8628fdc7`; patch 3 reviews at freeze). **Not verified on the laptop:** the PostgreSQL behaviour of the swap and the clean-up script (steps 9a and 9b), the real click in Chrome and Edge (QA rows), anything on real data.

### Step 3 (VM): pre-flight, read-only
```bash
cd /opt/unifolio-redesign && git rev-parse --abbrev-ref HEAD && git log -1 --format=%H && git status --short
df -h / | tail -1
sudo docker image ls leapswitch-backend --format '{{.Tag}} {{.ID}} {{.CreatedSince}}'
sudo docker compose -f /opt/unifolio-redesign/deploy/leapswitch/docker-compose.yml run --rm -T backend alembic current
date '+%H:%M IST'
```
Expected: branch `leapswitch-redesign`; HEAD equals the last deployed tag (`m4-rc` = `355cc8a1f117210f3ec2a73a06e0ee33dac54951` unless a later deploy happened: record whatever it is; **STOP** if the owner did not name it); no status lines; **at least 12 GB free**; `alembic current` ends `0054 (head)`; not in a job window. Record the `latest` image id.

### Step 3b (VM): the look-gate baseline, BEFORE deploying. Read-only. GATE (the owner's yes)
The look gate compares two PDFs page by page, so the "before" PDFs must come from **the code running today**. The candidate's scripts are copied into the running container's temporary files; **nothing is deployed and nothing is written outside `/tmp`** (the repository checkout is not touched; the PDFs are **never committed or copied to the laptop**: they contain the owner's real data).
1. Fetch `backend/scripts/export_look_gate.py` and `backend/scripts/measure_export_staging.py` from the `qa-rc` tag **into a temporary folder** (for example `git show qa-rc:backend/scripts/<file>` on the laptop and `docker cp` into `/tmp/qa-gate/` of the backend container, or the same pattern the M4 and XIRR guides used for their measuring scripts; copy the file text, never print any secret).
2. As the owner's test user (the earlier guides' pattern: a session minted for the owner's sign-in email on the VM, never written to a file, passed by environment variable name only), run **two exports from today's code**: a **full 24-section report with the cover on** and a **report with the cover off**, saving each with `measure_export_staging.py ... --save-pdf /tmp/qa-gate/base-full.pdf` (then `base-nocover.pdf`); the script refuses to overwrite and prints only the size and the path.
3. Capture each: `python /tmp/qa-gate/export_look_gate.py capture --pdf /tmp/qa-gate/base-full.pdf --out /tmp/qa-gate/base-full` (and the same for `base-nocover`). Record **only the manifest numbers** (page count and section start pages) in the deploy record.
4. **`deploy-redesign.sh --full` recreates the container and deletes `/tmp`.** So **copy `/tmp/qa-gate/` to the VM's disk first** (`docker cp` to `/home/deploy/qa-gate/`, mode 700, owner `deploy`) and delete that folder after step 9d. **STOP** if an export fails or the page counts look wrong; report the numbers.

### Step 4 (VM): rollback safety. GATE (the owner's yes)
```bash
cd /opt/unifolio-redesign/deploy/leapswitch
sudo docker tag leapswitch-backend:latest leapswitch-backend:previous
sudo docker image ls leapswitch-backend --format '{{.Tag}} {{.ID}}'
sudo /opt/unifolio/deploy/leapswitch/scripts/backup.sh; echo backup_exit=$?
sudo crontab -l > /home/deploy/crontab.before-qa-round-2026-11
```
Expected: `previous` and `latest` show the same id (step 3's); `backup_exit=0`; the crontab copy is not empty. **STOP** if the backup failed. **This backup is also the safety net for the clean-up script's `--apply` (step 9b).**

### Step 5 (VM): switch to the tag
```bash
cd /opt/unifolio-redesign && git fetch origin && git checkout -B leapswitch-redesign qa-rc && git rev-parse HEAD
```
Expected: the full hash equals `<AT FREEZE>`. **STOP** if not. No `.env` change is needed in this release.

### Step 6 (VM): deploy. GATE (the owner's yes)
```bash
cd /opt/unifolio-redesign/deploy/leapswitch && sudo sh ./scripts/deploy-redesign.sh --full
sudo docker compose ps --format '{{.Service}} {{.Image}} {{.Status}}'
sudo docker image ls leapswitch-backend --format '{{.Tag}} {{.ID}}'
sudo docker compose run --rm -T backend alembic current
```
Expected: exit 0; backend and worker recreated; `latest` has a **new** id and `previous` the id of step 3; `alembic current` still `0054 (head)`. **STOP** on a failed deploy, on a build or `pip` error (report the exact message), at the disk guard (no `--force` without the owner's yes), or if the backend restarts in a loop (read `sudo docker compose logs backend --tail 40`; never print `.env` lines).

### Step 7: nothing to run
No migration and no price job.

### Step 8 (VM): rebuild the stored results, straight after step 6
Outside the job windows:
```bash
cd /opt/unifolio-redesign/deploy/leapswitch && sudo sh /opt/unifolio/deploy/leapswitch/scripts/run-job.sh analytics-recompute-qa scripts/run_analytics_recompute.py --all > /home/deploy/recompute-qa.log 2>&1; echo exit=$?; tail -5 /home/deploy/recompute-qa.log
```
(This is the **same invocation as the XIRR guide's step 8** (`run-job.sh analytics-recompute-xr scripts/run_analytics_recompute.py --all`) with only the job name changed, so its email and log carry this release's name; if that guide's form differs in any other way, copy it exactly and report the difference.) Expected `exit=0` and the script's own counts, no error lines. **STOP** on a nonzero exit (`run-job.sh` emails the failure). **The owner starts the QA only after this step.**

### Step 9: new routes and the PostgreSQL checks
**9 (quick verify, a smoke check, not the QA).**
```bash
for u in https://ls-staging-api.unifolio.in/health https://ls-redesign.unifolio.in/ https://ls-staging.unifolio.in/; do curl -s -o /dev/null -w "%{http_code}\n" "$u"; done
cd /opt/unifolio-redesign/deploy/leapswitch && sudo docker compose logs backend --since 15m | grep -c " ERROR "
curl -s -o /dev/null -w "%{http_code}\n" "https://ls-staging-api.unifolio.in/cas-imports/pending?member_id=00000000-0000-0000-0000-000000000000"
curl -s -o /dev/null -w "%{http_code}\n" https://ls-staging-api.unifolio.in/cas-imports/cams-link
```
Expected `200`, `200`, `200`, error count `0`, then **`401` and `401`** (the two new routes exist and are protected: `404` means the new back end is not running, **STOP**; `200` or `422` means the route is not guarded, **STOP**). **The front end is the one served:** `curl -s https://ls-redesign.unifolio.in/ | grep -o 'assets/[^"]*\.js' | sort -u`, then count across every chunk the texts `A statement is being saved`, `CAMS request waiting`, `Reset checklist` and `Continue without it`; each at least once; and count `Open the CAMS form` and `Getting your link ready`: **each zero** (they were removed).

**9a (the Head of Family swap on real PostgreSQL). GATE (the owner's yes).** The race tests (`backend/tests/functional_postgres/test_head_change_races.py`: confirm-first, member-lock-then-new-member, and the swap pausing inside its lock) need a PostgreSQL database that may be filled and emptied. **Never point them at the staging database.** Create a throw-away empty database on the VM's PostgreSQL, run the file against it with `TEST_DATABASE_URL`, then drop it: the manager's Claude proposes the exact commands from the VM's compose file (database service name, user, whether `pytest` exists in the backend image) and shows them to the owner before running anything. If `pytest` is not in the image, run the tests from the laptop through an SSH tunnel to the throw-away database instead. **Expected: all tests of the file pass** (the swap never waits; a confirm is never the one aborted). **STOP** on a failure and report the test name; the swap's lock handling is the reason this step exists.

**9b (the one-off clean-up of stuck CAMS requests). GATE (the owner's yes at each stage).**
```bash
cd /opt/unifolio-redesign/deploy/leapswitch && sudo docker compose exec -T -e PYTHONPATH=/app backend /app/docker-entrypoint.sh python scripts/close_stuck_cams_requests.py
```
**Dry run only.** It prints four count lines (`past_expiry`, `later_import`, `would_close`, `left_open`); show them to the owner. Expected: it writes nothing (the read-only session and the statement guard abort on any write). **Only if the owner says yes after seeing the counts** (and the step 4 backup exists):
```bash
cd /opt/unifolio-redesign/deploy/leapswitch && sudo docker compose exec -T -e PYTHONPATH=/app backend /app/docker-entrypoint.sh python scripts/close_stuck_cams_requests.py --apply
```
It prints `closed=<n>` and `left_open=<n>`. Then re-run the dry run: `would_close` should be `0`.

**9d (the PDF look gate). GATE (the owner's yes to the export).** With the release running, take **the same two exports** (full with cover, and cover off) from the new code, saving them the same way (`--save-pdf /tmp/qa-gate/new-full.pdf`, `new-nocover.pdf`), capture them (`export_look_gate.py capture`), copy the baseline captures from `/home/deploy/qa-gate/` into the container's `/tmp/qa-gate/`, then compare:
```bash
python /tmp/qa-gate/export_look_gate.py compare --baseline /tmp/qa-gate/base-full --candidate /tmp/qa-gate/new-full
python /tmp/qa-gate/export_look_gate.py compare --baseline /tmp/qa-gate/base-nocover --candidate /tmp/qa-gate/new-nocover
```
**Expected:** **both are a plain PASS with no allowed pages**: this release prints the PDF exactly as today, so nothing about a page may differ. The same page count and the same section start pages are part of PASS. A date on the cover can differ: use `--mask` (a JSON file `{"pages": {"1": [[x0,y0,x1,y1]]}}`) only if the cover alone fails on a date. **STOP and report** on any FAIL: the failing page numbers are printed, never content. Then delete `/tmp/qa-gate/` and `/home/deploy/qa-gate/` (the PDFs hold real data). Record the full report's time in the deploy record.

**9c (the D-12 number gate). GATE (the owner approves the numbers).** The read-only before-and-after script shows the old and new category averages for the owner's own household. The owner's user id is looked up **by the owner's sign-in email on the VM, never written into a file or this guide**; the manager's Claude runs, copying the helper pattern of the M4 and XIRR guides (fetch the script into the container's temporary files without touching the checkout, run it through the entrypoint, read-only, print exactly what it prints):
```bash
docker compose exec -T -e PYTHONPATH=/app backend /app/docker-entrypoint.sh python scripts/category_pool_before_after.py --user-id <the owner's user id, from the lookup>
```
Expected: one block per held fund and period; **`funds_3y_or_5y_value_changed=0`**; `funds_1y_count_changed` equal to the number of funds whose category has a newer fund (the plan expected five); no names, amounts or ids in the output. **STOP and report** if the 3Y or 5Y value changed for any fund. Claude shows the owner the table of old and new 1-year averages and records the owner's approval in `decisions.md` and in `Docs/orchestration/2026-11-25-d12-before-after.md` (fund codes and public names only). **The release is not accepted until the owner approves these numbers.**

### Step 10: the owner's QA round
The owner runs the rows of `2026-11-19-combined-qa-checklist.md`: section "QA-round patches" (VP-01 to VP-08, D12-01 to D12-04, HA-01 to HA-07, **HB-01 to HB-11 (patch 2)**, **ES-01 to ES-05 (patch 3, the safe part)**), then the open M1 to M4 and XR rows. **The real click in Chrome and in Edge (D-2: HB-08, M4-12 and M4-13) is checked here**, together with a real export of a full report (the dialog's elapsed time and the contents page numbers; the speed target of **under 120 seconds** is patch 3b's acceptance, not this release's).

### Step 11: record (Claude fills this in)
Deployed commit, last deployed commit, image ids before and after, build time, backup result, health codes, the two `401`s, the front-end text counts, free disk before and after, the step 8 recompute log tail, the results of 9a, 9b (the counts, whether `--apply` ran) and 9c (the approved table), the owner's QA round result, anything that surprised. Write it as `Docs/orchestration/2026-11-2x-staging-deploy-record-qa-round.md` in the M4 record's shape, with an honest list of what is not as hoped.

## Section 2: rollback (only on the owner's yes)
- **Front end:** `cd /opt/unifolio-redesign && git checkout -B leapswitch-redesign <the tag of step 3> && cd deploy/leapswitch && sudo sh ./scripts/deploy-redesign.sh`.
- **Back end:** `cd /opt/unifolio-redesign/deploy/leapswitch && sudo sh ./scripts/rollback.sh` (points `latest` back at the `previous` image tagged in step 4). **Check the image id first**: `previous` must be the id recorded in step 3.
- **Stored results:** after a rollback the old code reads the rebuilt rows; the 1-year category average is then the new figure with the old code. Re-run step 8 only if a clean state is wanted.
- **The clean-up script:** if `--apply` ran, the closed requests are `EXPIRED` rows: restoring them needs the step 4 backup (`restore.sh`, **only on the owner's yes, and it restores data written since the backup too: do not do it lightly**). A closed request is harmless (the person can request again).
- **Migration, crontab, settings:** none touched (a saved crontab copy is `/home/deploy/crontab.before-qa-round-2026-11`).
- No `clean-db.sh`.
