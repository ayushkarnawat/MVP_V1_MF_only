# Staging Deploy Guide: XIRR leads, Returns on the flip side (Batch XR) to `ls-redesign.unifolio.in`

**Status:** READY FOR THE MANAGER'S CLAUDE once the tag `xr-rc` exists on `origin` (step 0 says how to check). Written 25 Nov 2026 by the orchestrator. **Nothing on the VM changes before step 7, and step 7 needs the owner's yes.** Plan: `Docs/superpowers/plans/2026-11-24-xirr-vs-returns-plan.md`; the design page (every state drawn): `Docs/orchestration/2026-11-24-xirr-vs-returns-plan.html`; record of the build: `Docs/orchestration/delegation-log.md` (entries of 24 Nov); decisions: `decisions.md`, entry "2026-11-24 - XIRR leads, Returns on the flip side". Candidate: `batch/xr-returns` merged into `leapswitch-redesign`, tag `xr-rc` = `<XR_RC_HASH>`.

This is the release that follows M4 (`m4-rc`, the PDF report and the floating CAMS checklist). It is the only unreleased change on `leapswitch-redesign`.

## What changes (the user-visible changes, in plain words)
1. **XIRR is the headline everywhere it shows.** The Portfolio tile, the Mutual Funds tile and the Mutual Funds holdings list used to show the return since purchase under an "XIRR" label for anything under 365 days (FX-8e, M2). They now show the real annualised rate, always. This reverses the "lead with Returns for young portfolios" half of FX-8e (owner, 24 Nov).
2. **Returns (the plain gain since purchase) is on the flip side of each tile.** A small "Show Returns" / "Show XIRR" button in the tile's title row flips it. It always opens on XIRR; a flip lasts until the page reloads; nothing is stored.
3. **A small caution chip on the XIRR:** `held under 1 yr` (first purchase under 365 days) or `one transaction` (exactly one dated purchase). Never on Returns. Each view (Lifetime, Current holdings) and each fund row gets its own chip from its own flows.
4. **The Mutual Funds list has two columns after Gain/Loss: Returns, then XIRR,** with header tooltips and sorting on both. The old "since purchase" line under the XIRR value is gone. **The PDF report's Overview page prints the same table, so it follows** (the table has two more columns and a retuned print layout).
5. **The Unrealised Gain percentage now reads "return on invested"** with an "i" tooltip, on both tiles.
6. The Lifetime / Current switch on the two tiles moves to its own line (it collided with the caption text).
7. **Back end, additive only:** the annualised rate and the since-purchase return are now always sent (the since-purchase value used to be sent only under a year); new optional fields `lifetime_xirr_caution` and `current_holdings_xirr_caution` (the three tile responses) and `xirr_caution` (holdings rows, consolidated rows and the stored per-fund rows). `*_xirr_basis` is kept for the old link; no screen reads it.
8. **Nothing else changes:** the Performance page, Analytics, the fund page, the Allocation fund-manager card, the phone layout and the legacy dashboard are untouched (they already showed the annualised XIRR, so the tiles and the list now agree with them).

## Facts that decide this guide
- **No migration.** Alembic stays at **0054**. **No new setting, no new cron line, no dependency change.** Per-fund figures live in the JSON of `analytics_sections`, so there is no schema change either.
- **The VM must already run M4** (`m4-rc`, with `EXPORT_PASS_SECRET` and `EXPORT_API_ORIGIN` set). This release is built on top of M4; deploying it on an older tag would also deploy M4's code without its settings. Step 3 checks and **stops** if the VM is on anything else.
- **Additive only.** The old link `ls-staging.unifolio.in` shares this back end and database and keeps working. What it sees: the new optional fields (ignored) and the since-purchase values now filled for annualised cases (ignored).
- **Deploy mode is `--full`** (the back end changed). The script ships the back end and the front end bundle together. The owner asked for "back end, rebuild stored results, then front end"; one command does both, so **the gap is the few minutes of step 8**, during which a mature fund's Returns in the list shows a dash (safe: never a wrong number). **The owner starts the QA only after step 8.**
- **Stored results must be rebuilt** (step 8): stored per-fund rows written before this release carry the since-purchase return only for funds under a year, and no caution, so mature funds show a dash in the Returns column until `analytics-recompute-all` has run. No price job is needed (no prices changed).
- **The 15-minute web cache:** the web process can serve cached holdings for up to 15 minutes after the rebuild, during which the tile and the list can disagree. It clears itself.
- **Reviews done:** G1 (Codex adversarial review of the back end): PASS, no actionable findings. G2 (read-only review of the front end): no High findings; its Medium (the PDF family table splitting amounts mid-number) and Low (header padding in print) were fixed and measured in a browser. G3 (whole-branch review before the deploy): see step 2.
- **Tests:** see step 2.

## Prompt for the executing Claude
```
You are deploying the XIRR-leads / Returns-on-the-flip-side release (Batch XR, tag xr-rc) to the LeapSwitch staging VM (ls-redesign.unifolio.in). Read Docs/orchestration/2026-11-24-staging-deploy-guide-xirr-returns.md and follow it step by step.
Rules: run one command at a time and show its output; at every STOP, stop and report; run nothing that changes the VM before the step that says GATE and the owner's yes; never print .env lines; never run clean-db.sh, restore.sh or rollback.sh on your own initiative; use ssh by hostname from WSL only.
At the end fill in step 10 and give the owner the report.
```

## Section 1: steps

### Step 0 (laptop): the frozen candidate is on origin
`batch/xr-returns` is merged into `leapswitch-redesign` and the merge is tagged `xr-rc` (`<XR_RC_HASH>`). Check it is published, and publish it if not:
```bash
git fetch origin && git rev-parse xr-rc && git ls-remote --tags origin xr-rc
```
Expected: both lines show `<XR_RC_HASH>`. **STOP** if the tag is not on `origin` and tell the owner (the orchestrator pushes it). **Never force-push.** Commits after the tag on the branch are documents only; the deploy uses the tag.

### Step 1 (laptop): the release touches only what it should
```bash
git diff --name-only m4-rc xr-rc | grep -vE "^Docs/|\.test\.tsx?$|^backend/tests/"
```
Expected groups only: `backend/app/services/dashboard/{xirr,schemas,portfolio_schemas,portfolio_summary,holdings,aggregate}.py`, `backend/app/services/analytics/{benchmark,schemas}.py`, `backend/app/api/dashboard.py`; `frontend/src/components/{MeasureFlip.tsx,MeasureFlip.module.css,XirrCautionChip.tsx}`, `frontend/src/lib/xirrDisplay.ts`, `frontend/src/features/portfolio/{types.ts,sections/SummaryStrip.tsx}`, `frontend/src/features/mutual-funds/{types.ts,api.ts,mfCopy.ts,overview/SummaryStrip.tsx,overview/HoldingsTable.tsx,overview/OverviewPage.tsx}`, `frontend/src/print/groups/overview/OverviewSections.tsx`, `decisions.md`, `session.md`, `CLAUDE.md`, `Docs/orchestration/wave-fe-check.sh`. **STOP** on a migration (`alembic/versions`), a dependency file (`package*.json`, `requirements*`, `pyproject.toml`), anything under `frontend/src/mobile/`, a deploy script or `.env` example, or any file outside those groups.

### Step 2 (laptop): evidence (there is no CI run for this branch)
Local verification of the merged tree on 24 and 25 Nov (worktree `C:\Users\Dell\lanes\unifolio-xr-returns`):
- **Front end:** 605 files, **7,178 tests passed, 1 failed**, 2 skipped, 1 todo; types clean; lint 0 errors (39 warnings, all older); production build succeeds. The one failure is `features/mutual-funds/route.test.tsx` ("renders the new Overview at /portfolio/mutual-funds", a 1-second wait on a cold start in the first test of the file). **It fails identically on the untouched M4 candidate (`m4-candidate`), so it is not caused by this release;** it passed in an earlier full run the same day.
- **Back end** (the API, `services/dashboard` and `services/analytics`, no Postgres): **4,294 passed, 10 skipped, 3 expected failures, 0 failed.**
- **Reviews:** G1 PASS; G2 no High findings (its Medium and Low fixed); G3 (whole-branch, read-only, a different reviewer): **no High findings, DEPLOY-READY: yes.** Its Medium 1 (stored per-fund rows older than this release have no Returns value and no chip until rebuilt) is exactly what step 8 does; its Medium 2 is a known gap listed at the end of this guide; its Lows are noted there too.
- **Seen in a real browser** (a throwaway harness, 1440x900, light and dark): both tiles on both faces and in every state (tile height does not change on a flip), the two tables on screen at 960, 1100 and 1440 px, and the PDF page's table at an A4 content width with large amounts. The owner's QA rows XR-01 to XR-12 are the real check.
**STOP** if the executing Claude's own re-run of any of these disagrees with the numbers above (report the difference first).

### Step 3 (VM): pre-flight, read-only
```bash
cd /opt/unifolio-redesign && git rev-parse --abbrev-ref HEAD && git log -1 --format=%H && git status --short
git describe --tags --exact-match HEAD
df -h / | tail -1
sudo docker image ls leapswitch-backend --format '{{.Tag}} {{.ID}} {{.CreatedSince}}'
sudo docker compose -f /opt/unifolio-redesign/deploy/leapswitch/docker-compose.yml run --rm -T backend alembic current
date '+%H:%M IST'
```
Expected: branch `leapswitch-redesign`; the tag printed is **`m4-rc`** (**write down its full hash: it is the rollback target**; if the VM is on any other tag, **STOP**: M4 must be deployed first); no status lines; **at least 12 GB free** (if short, ask the owner before pruning, and say which images go); `alembic current` ends `0054 (head)`; the time is **not** within 05:40 to 06:35, 10:30 to 10:40 or 14:00 to 14:15 IST. Also confirm the two M4 settings exist without printing them:
```bash
cd /opt/unifolio-redesign/deploy/leapswitch && grep -c "^EXPORT_PASS_SECRET=\|^EXPORT_API_ORIGIN=" .env
```
Expected: `2` (it prints a count, never a value). **STOP** on any miss.

### Step 4 (VM): rollback safety, before anything is built. GATE
Tag the running image so a rollback image of M4 exists, then take an on-demand backup and save the crontab:
```bash
cd /opt/unifolio-redesign/deploy/leapswitch
sudo docker tag leapswitch-backend:latest leapswitch-backend:previous
sudo docker image ls leapswitch-backend --format '{{.Tag}} {{.ID}}'
sudo /opt/unifolio/deploy/leapswitch/scripts/backup.sh
sudo crontab -l > /home/deploy/crontab.before-xr-2026-11
```
Expected: `previous` and `latest` show the same id (write it down); the backup script ends without an error email (`tail -5 /var/log/unifolio-backup.log`); the crontab file is not empty. **STOP** if the backup failed: no deploy without a backup of that day.

### Step 5: no new setting
Nothing to add to `.env` (`AUTH_GUARD_SECRET`, `EXPORT_PASS_SECRET` and `EXPORT_API_ORIGIN` stay as they are).

### Step 6 (VM): switch to the tag
```bash
cd /opt/unifolio-redesign && git fetch origin && git checkout -B leapswitch-redesign xr-rc && git rev-parse HEAD
```
Expected: the full hash equals `<XR_RC_HASH>`. **STOP** if not.

### Step 7 (VM): deploy. GATE: the owner's yes first
```bash
cd /opt/unifolio-redesign/deploy/leapswitch && sudo sh ./scripts/deploy-redesign.sh --full
```
Expected: exit 0; "built in N s"; backend and worker recreated (caddy may be recreated too); postgres untouched. If it stops at the disk guard: no `--force` without the owner's yes. Then check the **new** image runs:
```bash
sudo docker compose ps --format '{{.Service}} {{.Image}} {{.Status}}'
sudo docker image ls leapswitch-backend --format '{{.Tag}} {{.ID}}'
sudo docker compose run --rm -T backend alembic current
```
Expected: `latest` has a **new** id and the backend and worker run it; `previous` is the id from step 4; `alembic current` still `0054 (head)` (nothing to migrate). **STOP** if the deploy failed or `latest` and `previous` show the same id.

### Step 8 (VM): rebuild the stored results, straight after step 7
Outside the job windows (05:40 to 06:35, 10:30 to 10:40, 14:00 to 14:15 IST):
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
Expected: postgres, backend, worker, caddy running and healthy; `200` three times; the error count is `0`. The new code is the code that runs (read-only, prints one word):
```bash
cd /opt/unifolio-redesign/deploy/leapswitch && sudo docker compose run --rm -T backend python -c "
from app.services.dashboard.xirr import PortfolioXirrDisplay
print(hasattr(PortfolioXirrDisplay(), 'caution'))"
```
Expected: `True`. Then the owner opens, in a private window, `https://ls-redesign.unifolio.in/` and works through rows **XR-01 to XR-12** of `Docs/orchestration/2026-11-19-combined-qa-checklist.md`. **Defects noticed here go on the QA list; they do not stop the deploy unless the deploy itself is broken.**

### Step 10: record (Claude fills this in)
Deployed commit, last deployed commit (`m4-rc`), image ids before and after, build time, backup file name and size, the recompute result and log tail, the two numbers from step 8, health codes, free disk before and after, anything that surprised. Write it as `Docs/orchestration/2026-11-<day>-staging-deploy-record-xirr-returns.md` in the M3 record's shape (`2026-11-23-staging-deploy-record-m3.md`), with an honest list of what is not as hoped.

## Section 2: rollback (only on the owner's yes)
- **Front end:** `cd /opt/unifolio-redesign && git checkout -B leapswitch-redesign <the m4-rc hash from step 3>` then `cd deploy/leapswitch && sudo sh ./scripts/deploy-redesign.sh`.
- **Back end:** `cd /opt/unifolio-redesign/deploy/leapswitch && sudo sh ./scripts/rollback.sh` (points `latest` back at the `previous` image tagged in step 4). **Check the image id first:** `previous` must be the id written down in step 4.
- **Migration:** none was run; nothing to undo.
- **Stored results:** after a rollback the stored rows keep the extra keys (the old code ignores unknown keys); run the step 8 rebuild again only if a clean state is wanted.
- **Crontab:** unchanged by this release (a saved copy is `/home/deploy/crontab.before-xr-2026-11`).

## Facts for the combined QA checklist
Rows **XR-01 to XR-12** are already in `Docs/orchestration/2026-11-19-combined-qa-checklist.md` (section "XR"). They need the step 8 rebuild first. Known and accepted (from the G3 review and the browser check): (1) a holding or portfolio whose XIRR cannot be solved but which has a since-purchase return (for example a holding worth nothing) shows a dash on the tile and no flip button, while the list still shows its Returns (the old site showed the since-purchase number there); (2) the table's chip duplicates the shared chip component's tone logic (a follow-up to unify them); (3) in the PDF report a gain can show its "+" on its own line (older wrapping); the Mutual Funds tile's "one transaction" state can differ by 1 px in height between its two faces.
