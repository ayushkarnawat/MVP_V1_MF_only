# Staging Deploy Guide M2 part 2: the benchmark checklist and legend, the graph on the Mutual Funds Overview, the "View all by day's change" pop-up (Batch D, second part) to `ls-redesign.unifolio.in`

**FROZEN 20 Nov 2026.** `batch/d-part2` (worktree `D:\unifolio-d-int`) is merged into `leapswitch-redesign` and tagged `m2b-rc` at the freeze (the tag's commit is `a4a948cbf7d0f9e3a6ae8986a48f47bf294f07af`, filled in after the tag). It follows `2026-11-20-staging-deploy-guide-m2.md` (part 1, deployed 20 Nov, tag `m2-rc` = `f1f7e5d47e796ef64105fc196ee77cf84e8d2f09`). **Nothing here is run until the owner's go (the owner's "deploy guide + direct deployment" for M2, 20 Nov, covers M2 part 2).** No QA round after it: only the quick verify in step 9; the owner's checks are rows M2-15 to M2-28 of `2026-11-19-combined-qa-checklist.md`, run once after M4. After this deploy M2 is complete, and the owner sends **one** combined stakeholder message (`2026-11-20-m2-stakeholder-message-draft.md`, to be updated first).

## What changes
1. **Up to three benchmarks on the Home graph** (a checklist instead of the drop-down; a fourth box shows "Choose up to 3"; the last ticked box cannot be unticked; the choice is remembered per browser as a list, and an old single remembered value still loads). One line per benchmark in its own colour (Nifty 50 blue, Nifty 500 violet, LargeMidcap 250 amber, Midcap 150 indigo, Smallcap 250 teal), an end label naming each line, hover names the benchmarks, legend chips that hide or show a line (not remembered). A benchmark whose history starts later is drawn from where its data begins, with a note naming it. With one benchmark chosen Home reads as before, plus the checklist and one chip.
2. **The same graph on the Mutual Funds Overview**, under the summary strip and above the SIP timeline; it loads after the strip and the table, follows the Family and member selector, shows rupee amounts like the rest of the Overview, and shares the benchmark choice with Home.
3. **"View all by day's change"** on Home's "What moved today" card is now a live link: a pop-up "Everything that changed today" with the net change and totals, Fund, Category and Sector views, gainers and losers largest first, a collapsed "No change" group, funds waiting for a price listed apart (never as zero, with the Partial badge), funds priced only from a statement in their own block ("Priced from your statement only"), an error state with Try again, values hidden as dots, Escape, the cross, Close and an outside click close it. **On a weekend, a holiday or a morning before prices publish it lists the last price day's rows, the same as the card, with the line "Latest prices are from <weekday date>"** (owner decision B).
4. **Back end (additive; the old link keeps working):** the wealth-series routes take a repeatable `benchmarks` (at most 3 distinct, else 422) and return `benchmark_series` beside the old `benchmark`; the movers route takes `all=true` (every row, `waiting_for_price` with a `reason`); the card's payload is unchanged.
5. A guarded import in the news job (`backend/scripts/jobs/refresh_news.py`: `resource` imported only where it exists; no behaviour change on the VM) and test-only fixes.

**Not in this release:** any number change (ranks, averages, XIRR: M2 part 1 already carries those), phone screens, new analytics events, the app-wide primary-button label colour (a palette follow-up).

## Facts that decide this guide
- **Back end and front end, no migration, no new setting, no cron change, no price job, no stored-results rebuild** (nothing here changes a stored number). Alembic stays **0054**. Deploy mode is `--full` (the back end changed).
- **Old link:** `ls-staging.unifolio.in` shares this back end. It sees only additive fields it ignores (`benchmark_series`, `reason`) and the unchanged old payloads (golden-file tests pin the old wealth reply and the movers card payload).
- **The VM worktree** `/opt/unifolio-redesign` is on `leapswitch-redesign` at `d6157c80` (M2 part 1's tag plus documents and the NAV digest alert script; the only code-area change after `m2-rc` is `deploy/leapswitch/scripts/nav-digest.sh`). That commit is the rollback target for the front end; the running `leapswitch-backend:latest` image `7de6c3d9f52e` (built from `m2-rc`) is the rollback image for the back end.
- **Tests:** step 2.

## Prompt for the executing Claude
```
You are deploying milestone M2 part 2 (Batch D: benchmark checklist, legend, the Overview graph, the day's-change pop-up) to the LeapSwitch staging VM (ls-redesign.unifolio.in). Read Docs/orchestration/2026-11-20-staging-deploy-guide-m2b.md and follow it step by step.
Rules: run one command at a time and show its output; at every STOP, stop and report; run nothing that changes the VM before the step that says GATE and the owner's yes; never print .env lines; never run clean-db.sh, restore.sh or rollback.sh on your own initiative; use ssh by hostname from WSL only (write the remote command so the variables are not expanded by the Windows-to-WSL layer).
At the end fill in step 10 and give the owner the report.
```

## Section 1: steps

### Step 0 (laptop): publish the frozen candidate
`batch/d-part2` is merged into `leapswitch-redesign` and the merge is tagged `m2b-rc`. Publish: `git fetch origin && git push origin leapswitch-redesign m2b-rc`. **Never force-push.** Commits after the tag are documents only; the deploy uses the tag.

### Step 1 (laptop): the release touches only what it should
```bash
git diff --name-only f1f7e5d47e796ef64105fc196ee77cf84e8d2f09 m2b-rc | grep -vE "^Docs/|\.test\.tsx?$|^backend/tests/"
```
Expected groups only: `backend/app/api/home.py`, `backend/app/services/home/{movers.py,schemas.py,wealth.py}`, `backend/scripts/jobs/refresh_news.py`, `deploy/leapswitch/scripts/nav-digest.sh`, `frontend/src/components/{PartialDataBadge.tsx,ui/charts/*,wealth-graph/*}`, `frontend/src/features/home/**`, `frontend/src/features/mutual-funds/{api.ts,overview/OverviewPage.tsx}`, `frontend/src/lib/homeToday.ts`, `session.md`, `decisions.md`, `CLAUDE.md`. **STOP** on a migration, a dependency file, anything under `frontend/src/mobile/`, or anything in `backend/app` outside those files.

### Step 2 (laptop): evidence (no CI run exists for this branch)
Local verification of the merged tree on 20 Nov (the integration worktree): front end **6,316 passed (496 files)**, 2 skipped, types clean, lint 0 errors (30 warnings), production build succeeds. Back end, over every area the release touches (all services, the API, scripts, core, models, config, deployment and startup tests; no Postgres): **6,078 passed**, 22 skipped, 3 expected failures, **0 failed** (the 25 failures of the part 1 run were fixed on 20 Nov: see the M2 part 1 deploy record). Reviews: `2026-11-20-batch-d-backend-review.md` and `2026-11-20-batch-d-whole-batch-review.md`, both with every finding closed or accepted.

### Step 3 (VM): pre-flight, read-only
```bash
cd /opt/unifolio-redesign && git rev-parse --abbrev-ref HEAD && git log -1 --format=%H && git status --short
df -h / | tail -1
sudo docker image ls leapswitch-backend --format '{{.Tag}} {{.ID}} {{.CreatedSince}}'
sudo docker compose -f /opt/unifolio-redesign/deploy/leapswitch/docker-compose.yml run --rm -T backend alembic current
date '+%H:%M IST'
```
Expected: branch `leapswitch-redesign`; HEAD `d6157c80...` (the rollback target; if it is anything else, **STOP** and say what it is); no status lines; **at least 12 GB free**; `latest` `7de6c3d9f52e`; `alembic current` ends `0054 (head)`; the time is **not** within 05:40 to 06:35, 10:30 to 10:40 or 14:00 to 14:15 IST. **STOP** on any miss.

### Step 4 (VM): rollback safety. GATE
```bash
cd /opt/unifolio-redesign/deploy/leapswitch
sudo docker tag leapswitch-backend:latest leapswitch-backend:previous
sudo docker image ls leapswitch-backend --format '{{.Tag}} {{.ID}}'
sudo /opt/unifolio/deploy/leapswitch/scripts/backup.sh; echo backup_exit=$?
sudo crontab -l > /home/deploy/crontab.before-m2b-2026-11
```
Expected: `previous` and `latest` show the same id (`7de6c3d9f52e`); `backup_exit=0`; the crontab file is not empty. **STOP** if the backup failed.

### Step 5: no new setting. Nothing to add to `.env`.

### Step 6 (VM): switch to the tag
`cd /opt/unifolio-redesign && git fetch origin && git checkout -B leapswitch-redesign m2b-rc && git rev-parse HEAD`. Expected: the full hash equals `a4a948cbf7d0f9e3a6ae8986a48f47bf294f07af`. **STOP** if not.

### Step 7 (VM): deploy. GATE: the owner's yes first
```bash
cd /opt/unifolio-redesign/deploy/leapswitch && sudo sh ./scripts/deploy-redesign.sh --full
sudo docker compose ps --format '{{.Service}} {{.Image}} {{.Status}}'
sudo docker image ls leapswitch-backend --format '{{.Tag}} {{.ID}}'
sudo docker compose run --rm -T backend alembic current
```
Expected: exit 0; backend and worker recreated; `latest` has a **new** id and `previous` is `7de6c3d9f52e`; `alembic current` still `0054 (head)`. If it stops at the disk guard: no `--force` without the owner's yes. **STOP** if the deploy failed or `latest` and `previous` show the same id.

### Step 8: nothing to rebuild or run
No price job and no stored-results rebuild: no number changed.

### Step 9 (VM and laptop): quick verify (a smoke check, not the QA)
```bash
for u in https://ls-staging-api.unifolio.in/health https://ls-redesign.unifolio.in/ https://ls-staging.unifolio.in/; do curl -s -o /dev/null -w "%{http_code}\n" "$u"; done
cd /opt/unifolio-redesign/deploy/leapswitch && sudo docker compose logs backend --since 15m | grep -c " ERROR "
```
(Write the loop so the URLs reach the remote shell: run it from a script file, or write each URL out, because the Windows-to-WSL layer expands `$u` locally.) Expected: `200`, `200`, `200`, and an error count of `0`. The new front end is the one served (from the laptop; the bundle names change on every build, so read them from the page):
```bash
curl -s https://ls-redesign.unifolio.in/ | grep -o 'assets/index-[^"]*\.js' | head -1
```
then `curl -s https://ls-redesign.unifolio.in/<that path> | grep -c -E "Everything that changed today|Choose up to"` must be at least `1`. The new code is the code that runs (back end):
```bash
cd /opt/unifolio-redesign/deploy/leapswitch && sudo docker compose run --rm -T backend python -c "
from app.api import home
print(home.MAX_BENCHMARKS)"
```
Expected: `3`. Then the owner opens, in a private window, `https://ls-redesign.unifolio.in/`: Home shows the benchmark checklist and the "View all by day's change" link; the Mutual Funds Overview shows the graph under the strip. **Defects noticed here go on the QA list; they do not stop the deploy unless the deploy itself is broken.**

### Step 10: record (Claude fills this in)
Deployed commit, last deployed commit, image ids before and after, build time, backup result, health codes, free disk before and after, anything that surprised. Write it as `Docs/orchestration/2026-11-20-staging-deploy-record-m2b.md` (or the day's date) in the M2 record's shape, with an honest list of what is not as hoped.

## Section 2: rollback (only on the owner's yes)
- **Front end:** `cd /opt/unifolio-redesign && git checkout -B leapswitch-redesign d6157c80 && cd deploy/leapswitch && sudo sh ./scripts/deploy-redesign.sh`. (Use the full 40-character hash recorded in step 3.)
- **Back end:** `cd /opt/unifolio-redesign/deploy/leapswitch && sudo sh ./scripts/rollback.sh` (points `latest` back at the `previous` image tagged in step 4). **Check the image id first**: `previous` must be `7de6c3d9f52e`.
- **Migration, crontab, setting, stored results:** none touched; nothing to undo (a saved crontab copy is `/home/deploy/crontab.before-m2b-2026-11`).
- No `clean-db.sh`, no `restore.sh` (no schema change, no data write).
