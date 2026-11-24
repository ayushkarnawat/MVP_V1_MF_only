# Staging Deploy Guide: XIRR leads, Returns on the flip side (Batch XR) to `ls-redesign.unifolio.in`

**Status:** DRAFT, and **not a stand-alone deploy** (owner, 24 Nov 2026: there will be **one staging guide that deploys everything together once everything is done**). This file is the XIRR release's input to that combined guide: its "what changes", "facts", the stored-results rebuild (step 8), the stored-row check and the QA rows XR-01 to XR-12 are copied into it; the other steps are the same as every guide's. Written 24 Nov 2026 while the lanes were being verified. The hashes, test counts and image ids marked `<...>` are filled in when the candidate is frozen and tagged `xr-rc`. **Nothing in the VM changes before step 7 and the owner's yes.** Plan: `Docs/superpowers/plans/2026-11-24-xirr-vs-returns-plan.md`; design: `Docs/orchestration/2026-11-24-xirr-vs-returns-plan.html`.

## What changes (in plain words)
1. **XIRR is now the headline everywhere it shows.** The Portfolio tile, the Mutual Funds tile and the Mutual Funds list used to show the return since purchase under an "XIRR" label for anything under a year (FX-8e, M2). They now show the real annualised rate, always.
2. **Returns (the plain gain since purchase) sits on the flip side.** Each tile has a "Show Returns" / "Show XIRR" button. It always opens on XIRR; a flip lasts until the page reloads.
3. **A small caution chip on the XIRR** says `held under 1 yr` (first purchase under 365 days) or `one transaction` (exactly one dated purchase). Never on Returns.
4. **The Mutual Funds list has two columns after Gain/Loss: Returns, then XIRR**, with header tooltips. The PDF export's Overview page prints the same table, so it follows.
5. **The Unrealised Gain percentage now reads "return on invested"** with an "i" tooltip.
6. The Lifetime / Current switch on the two tiles moves to its own line (it collided with the caption text).
7. **Back end, additive only:** the annualised rate and the since-purchase return are always sent (the since-purchase value used to be sent only under a year); new optional fields `lifetime_xirr_caution`, `current_holdings_xirr_caution` (tiles) and `xirr_caution` (holdings rows and the stored per-fund rows). `*_xirr_basis` is kept for the old link and no screen reads it.
8. **Nothing else changes:** the Performance page, Analytics, the fund page, the Allocation fund-manager card, the mobile dashboard and the legacy dashboard are untouched (they already show the annualised XIRR, so the tiles and the list now agree with them).

## Facts that decide this guide
- **No migration.** Alembic stays at **0054**. No new setting, no new cron line. Per-fund figures live in the JSON of `analytics_sections` (no schema change).
- **Deploy mode is `--full`** (back end changed). The script ships the back end and the front end bundle together. The owner's decision Q11 asked for "back end, rebuild stored results, then front end"; one command does both, so **the gap is the few minutes of step 8**, during which a mature fund's Returns in the list shows a dash (safe: never a wrong number). **The owner starts QA only after step 8.**
- **Stored results must be rebuilt** (step 8): older stored per-fund rows carry the since-purchase return only for funds under a year, so mature funds show a dash in the Returns column until `analytics-recompute-all` has run. No price job is needed (no prices changed).
- **The old link `ls-staging.unifolio.in`** shares this back end and database: it sees the additive fields (ignored) and the now-always-filled since-purchase values (ignored).
- **The 15-minute web cache:** the web process can serve cached holdings for up to 15 minutes after the rebuild, during which the tile and the list can disagree. It clears itself.
- **Tests:** see step 2.

## Prompt for the executing Claude
```
You are deploying the XIRR-leads / Returns-on-the-flip-side release (tag xr-rc) to the LeapSwitch staging VM (ls-redesign.unifolio.in). Read Docs/orchestration/2026-11-24-staging-deploy-guide-xirr-returns.md and follow it step by step.
Rules: run one command at a time and show its output; at every STOP, stop and report; run nothing that changes the VM before the step that says GATE and the owner's yes; never print .env lines; never run clean-db.sh, restore.sh or rollback.sh on your own initiative; use ssh by hostname from WSL only.
At the end fill in step 10 and give the owner the report.
```

## Section 1: steps

### Step 0 (laptop): publish the frozen candidate
`batch/xr-returns` is merged into `leapswitch-redesign` and the merge is tagged `xr-rc` (hash `<XR_RC_HASH>`). Publish:
```bash
git fetch origin && git push origin leapswitch-redesign xr-rc
```
**Never force-push.** Commits after the tag are documents only; the deploy uses the tag.

### Step 1 (laptop): the release touches only what it should
```bash
git diff --name-only <PREVIOUS_RC_TAG> xr-rc | grep -vE "^Docs/|\.test\.tsx?$|^backend/tests/"
```
(`<PREVIOUS_RC_TAG>` is the tag the VM runs now; step 3 reads it.) Expected groups only: `backend/app/services/{dashboard,analytics}/**` (`xirr.py`, `schemas.py`, `portfolio_schemas.py`, `portfolio_summary.py`, `holdings.py`, `aggregate.py`, `benchmark.py`), `backend/app/api/dashboard.py`, `frontend/src/{components,lib}/**` (`MeasureFlip`, `XirrCautionChip`, `xirrDisplay.ts`), `frontend/src/features/{portfolio,mutual-funds}/**`, `frontend/src/print/groups/overview/OverviewSections.tsx`, `decisions.md`, `session.md`. **STOP** on a migration (`alembic/versions`), a dependency file (`package*.json`, `requirements*`, `pyproject.toml`), anything under `frontend/src/mobile/`, or any file outside those groups.

### Step 2 (laptop): evidence (there is no CI run for this branch)
Record, from the merged tree on the day: front end full suite `<N files, N tests>` passed, types clean, lint 0 errors, production build succeeds; back end over every area this release touches (the API, services/dashboard, services/analytics, scripts, models, config, startup tests; no Postgres) `<N passed>`; the known older failures listed by name and shown identical on the previous tag. On 24 Nov the merged tree before the last two visual fixes: front end **605 files, 7,179 tests passed**; back end `tests/api` + `services/dashboard` + `services/analytics` re-run in progress. **STOP** on any failure that is not on the known list.

### Step 3 (VM): pre-flight, read-only
```bash
cd /opt/unifolio-redesign && git rev-parse --abbrev-ref HEAD && git log -1 --format=%H && git status --short
df -h / | tail -1
sudo docker image ls leapswitch-backend --format '{{.Tag}} {{.ID}} {{.CreatedSince}}'
sudo docker compose -f /opt/unifolio-redesign/deploy/leapswitch/docker-compose.yml run --rm -T backend alembic current
date '+%H:%M IST'
```
Expected: branch `leapswitch-redesign`; HEAD is the last deployed tag's commit (**write it down: it is the rollback target**; if the owner expected another one, **STOP**); no status lines; **at least 12 GB free**; `alembic current` ends `0054 (head)`; the time is **not** within 05:40 to 06:35, 10:30 to 10:40 or 14:00 to 14:15 IST. **STOP** on any miss.

### Step 4 (VM): rollback safety, before anything is built. GATE
```bash
cd /opt/unifolio-redesign/deploy/leapswitch
sudo docker tag leapswitch-backend:latest leapswitch-backend:previous
sudo docker image ls leapswitch-backend --format '{{.Tag}} {{.ID}}'
sudo /opt/unifolio/deploy/leapswitch/scripts/backup.sh
sudo crontab -l > /home/deploy/crontab.before-xr-2026-11
```
Expected: `previous` and `latest` show the same id; the backup ends without an error email (`tail -5 /var/log/unifolio-backup.log`); the crontab file is not empty. **STOP** if the backup failed.

### Step 5: no new setting
Nothing to add to `.env`.

### Step 6 (VM): switch to the tag
```bash
cd /opt/unifolio-redesign && git fetch origin && git checkout -B leapswitch-redesign xr-rc && git rev-parse HEAD
```
Expected: the full hash equals `<XR_RC_HASH>`. **STOP** if not.

### Step 7 (VM): deploy. GATE: the owner's yes first
```bash
cd /opt/unifolio-redesign/deploy/leapswitch && sudo sh ./scripts/deploy-redesign.sh --full
```
Expected: exit 0; "built in N s"; backend and worker recreated; postgres untouched. If it stops at the disk guard: no `--force` without the owner's yes. Then check the **new** image runs:
```bash
sudo docker compose ps --format '{{.Service}} {{.Image}} {{.Status}}'
sudo docker image ls leapswitch-backend --format '{{.Tag}} {{.ID}}'
sudo docker compose run --rm -T backend alembic current
```
Expected: `latest` has a **new** id and the backend and worker run it; `previous` is the id from step 4; `alembic current` still `0054 (head)`. **STOP** if the deploy failed or `latest` and `previous` show the same id.

### Step 8 (VM): rebuild the stored results, straight after step 7 (decision Q11)
Outside the job windows:
```bash
cd /opt/unifolio-redesign/deploy/leapswitch && sudo sh /opt/unifolio/deploy/leapswitch/scripts/run-job.sh analytics-recompute-xr scripts/run_analytics_recompute.py --all > /home/deploy/recompute-xr.log 2>&1; echo exit=$?; tail -5 /home/deploy/recompute-xr.log
```
Expected: `exit=0` and the script's own counts, no error lines. **STOP** on a nonzero exit (run-job.sh emails the failure; report it). Then prove the new field is in the stored results (read-only; prints two numbers, no personal data):
```bash
cd /opt/unifolio-redesign/deploy/leapswitch && sudo docker compose run --rm -T backend python -c "
from app.db.session import SessionLocal
from app.models.analytics import AnalyticsSection
db = SessionLocal()
rows = db.query(AnalyticsSection).filter_by(section='benchmark_funds').all()
print(len(rows), sum('xirr_caution' in str(r.payload) for r in rows))"
```
Expected: two numbers, the second equal to the first after a complete rebuild (a household with no funds can legitimately have none: report any difference with the reason). **STOP** if the second number is zero while the first is not.

### Step 9 (VM and laptop): quick verify (a smoke check, not the QA)
```bash
cd /opt/unifolio-redesign/deploy/leapswitch && sudo docker compose ps
for u in https://ls-staging-api.unifolio.in/health https://ls-redesign.unifolio.in/ https://ls-staging.unifolio.in/; do curl -s -o /dev/null -w "%{http_code}\n" "$u"; done
sudo docker compose logs backend --since 20m | grep -c " ERROR "
```
Expected: postgres, backend, worker, caddy running and healthy; `200` three times; error count `0`. The new code is the code that runs:
```bash
cd /opt/unifolio-redesign/deploy/leapswitch && sudo docker compose run --rm -T backend python -c "
from app.services.dashboard import xirr
from app.services.dashboard.schemas import XirrCaution
print(hasattr(xirr.PortfolioXirrDisplay(), 'caution'))"
```
Expected: `True`. Then the owner opens, in a private window, `https://ls-redesign.unifolio.in/` and works through rows XR-01 to XR-12 of the combined QA checklist. **Defects noticed here go on the QA list; they do not stop the deploy unless the deploy itself is broken.**

### Step 10: record (Claude fills this in)
Deployed commit, last deployed commit, image ids before and after, build time, backup file name and size, the recompute result, the stored-row count from step 8, health codes, free disk before and after, anything that surprised. Write it as `Docs/orchestration/2026-11-<day>-staging-deploy-record-xirr-returns.md` in the M2 record's shape, with an honest list of what is not as hoped.

## Section 2: rollback (only on the owner's yes)
- **Front end:** `cd /opt/unifolio-redesign && git checkout -B leapswitch-redesign <ROLLBACK_COMMIT_FROM_STEP_3>` then `cd deploy/leapswitch && sudo sh ./scripts/deploy-redesign.sh`.
- **Back end:** `cd /opt/unifolio-redesign/deploy/leapswitch && sudo sh ./scripts/rollback.sh` (points `latest` back at the `previous` image from step 4). **Check the image id first.**
- **Migration:** none was run; nothing to undo.
- **Stored results:** after a rollback the stored rows keep the extra keys (old code ignores unknown keys); run the step 8 rebuild only if a clean state is wanted.
- **Crontab:** unchanged by this release (saved copy `/home/deploy/crontab.before-xr-2026-11`).
