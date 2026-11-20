# Staging Deploy Guide M2 (part 1): the numbers (Batch A), the shared Home graph and the movers backend (Batch D, first part), the tutorial pop-up (Batch H, first part) to `ls-redesign.unifolio.in`

**FROZEN 20 Nov 2026.** The merged candidate is branch `m2-candidate` (worktree `D:\unifolio-m2`), merged into `leapswitch-redesign` and tagged `m2-rc` at the freeze (the tag points at `f1f7e5d47e796ef64105fc196ee77cf84e8d2f09`). **Nothing here is run until the owner's go; the owner gave it on 20 Nov 2026 ("M2 guide: the deploy guide ... deploy guide + direct deployment").** After the deploy there is **no QA round**: only the quick verify in step 9. The single combined QA happens once after M4 (rows M2-01 to M2-14 of `2026-11-19-combined-qa-checklist.md`).

**Why "part 1".** The plan puts all of Batch D (the benchmark checklist and legend, the "View all by day's change" pop-up, the Overview graph, the chart end-date rule) into M2. Only D-2 (colours), D-3 (the shared graph component, Home unchanged) and D-8 (the movers backend switch) are built and verified; D-4 to D-7 and D-9 to D-14 are not (D-4 and D-9 are handed to Codex on 20 Nov). Batch A, the numbers, is the part the owner approved line by line and is complete, so it ships now; the rest of Batch D ships as a later staging deploy of the same kind, **not** held back for it. Nothing in this release depends on the unfinished D tasks: the new graph component renders exactly what the Home card rendered before, and the new movers switch is called by no screen yet.

## What changes (the user-visible and number changes, in plain words)
**Rank and category average (Analytics, fund pages, the score)**
1. **A real Direct fund is no longer missing from its category ranking** (FX-10a). The app picked one series per fund; a series with an unknown plan could win and then vanish from the ranked pool. Staging cases: Bank of India Large & Mid Cap, Bank of India ELSS, Baroda BNP Paribas Corporate Bond, Baroda BNP Paribas Liquid, Axis Liquid. Large & Mid Cap (Direct) "out of N" goes from 32 to 33; Corporate Bond (Direct) 20 to 21.
2. **Only the Growth option is ranked** (FX-10d, both parts; the 17 Nov rule "IDCW, dividend and bonus options are in no pool"). Growth or "Cumulative" is Growth; Bonus, IDCW, Payout, Reinvestment are not. Nippon India Growth Mid Cap now ranks by its Growth option instead of its Bonus option. A held fund with **no Growth series at all** is not ranked and its row says so (new row key `no_growth_series_not_ranked`; the period status is unchanged, so the old front end shows what it showed before).
3. **The category average counts exactly the funds the rank counts** (FX-10b): no index or ETF series, only active Growth series of the same plan. The index-funds category keeps its own pool.
4. **The older blended figure** (kept for print and phone views) is 40% of the 3-year average plus 60% of the 5-year average, as the workbook says (FX-9a, option A).
5. **Reach beyond the approved wording (the owner confirms or changes this).** The same pool rules also feed the fund score and the fund-page peer lists and charts, because they share one function. Measured on staging: **none of the 46 held funds changed category**. A held fund with only IDCW series would now read "category unavailable" in its score; a fund page now lists only Growth peers of its plan. This matches the 17 Nov rule, so no code was added for it; see `2026-11-20-whole-plan-review-batch-a.md`, finding 3. The recommendation, accepted unless the owner objects: leave it as is.

**XIRR and returns (Home tile, Mutual Funds holdings, fund pages, benchmark windows)**
6. **One end date for every XIRR figure** (FX-8c): the final cash flow carries the date of the price it uses, not the server clock. A weekend moves a long holding by well under a tenth of a point and a short, high-return holding by a few tenths.
7. **The tile and the per-fund column come from the same inputs** (FX-8d): the 10:30 and 14:00 held-only price retries now recompute the households that hold a fund they filled. New additive fields `xirr_as_of`, `xirr_basis`, `since_purchase_return` and their tile equivalents; the screen shows the as-on date.
8. **A holding under 365 days shows its return since purchase, labelled "not annualised"**, instead of an extreme annualised percentage (FX-8e option 1; the same gain annualises to 109% over three months and 219% over one month). Flows that net to zero on one day show **a dash** instead of 0% (the tile and the per-fund column; the fund page and benchmark windows keep their own solve).
9. **A held fund with no price is left out whole** (value and flows together) and the per-fund job skips it (FX-8a/8b, the small versions). Does nothing when every fund is priced, as on staging today.

**Nightly price service**
10. **The nightly peer history no longer fails silently** (FX-10a part 2). On 20 Nov the price service refused 64 of 71 repeated history requests with HTTP 429 and the app swallowed it: 74 of 142 Sectoral/Thematic (Direct) funds had a price 5 to 18 days old although AMFI's own file had a newer one. Now every peer gets AMFI's latest price, history fetches run at most 8 at a time with one retry after a 429 (honouring Retry-After), and the run prints `PEER_HISTORY failed=<n> of <m>`, which the daily digest mail (14:10) now lists.

**Front end**
11. The Home wealth graph is now a shared component (D-3) with no visible change; one fixed palette colour per benchmark so the benchmark line and its text are visible (D-2): Nifty 50 blue, Nifty 500 violet, Nifty LargeMidcap 250 amber, Nifty Midcap 150 indigo, Nifty Smallcap 250 teal.
12. **Tutorial** on both import screens (the "Request from CAMS" path and the waiting screen): a "Watch how it works, 53 seconds" link and a pop-up with the 53-second video (4.5 MB, `/tutorial/`), four chapter chips, the four steps as text, "Watch again" and "Request Statement on CAMS" at the end. Muted, no autoplay under reduced motion, Escape, the cross and an outside click close it, focus is trapped and returns to the link. The label on the bright-green button is dark (`#111111`): white on `#22C55E` is 2.3 to 1.
13. The movers route gains an additive `all=true` switch (D-8): every row, funds with no new price listed apart, never as zero. **No screen calls it yet**; the card's payload is unchanged.

**Read-only tools shipped in the image (called by no route or cron):** the rank reference workbook exporter and the category-average Excel exporter (RK-9, CA-6), the independent recount, the XIRR fixtures.

**Not in this release:** the benchmark checklist, chips and end labels (D-4 to D-6), the movers pop-up (D-9 to D-11), the Overview graph (D-7), the chart end-date rule (D-12), phone screens, new analytics events, any change to the XIRR solver.

## Numbers that change, with before and after (staging data, 19 and 20 Nov, public category data only)
Category averages (percent per year; Direct unless stated): Sectoral/Thematic 1Y **1.48 to 0.27** and 3Y 14.28 to 13.80 (index and ETF series leave the average); Liquid 1Y 1.62 to 2.13 and 3Y 3.97 to 4.28 (two IDCW series out, two Growth series in); Mid Cap 3Y 15.63 to 15.49; Small Cap 1Y 6.87 to 6.67; ELSS 1Y 2.35 to 2.37; the rest move 0.0 to 0.1. Funds counted in the 3Y average fall in eight groups (by 1 to 3, and by 7 in Index Funds). The older blended figure moves by under 0.4 of a point in most groups; the largest is Sectoral/Thematic 14.23 to 13.37. Full table: `2026-11-19-rk7b-real-data-before-after.md`. Rank checks against an independent recount: pools equal in 56 of 57 comparisons (the one difference is two funds launched almost exactly three years ago); the rank workbook passes 394 of its 402 own checks, the category-average Excel 138 of 138 (`2026-11-20-rk4b-real-data-checks.md`, `2026-11-20-rk5-cross-checks-part-2.md`). Short-holding examples: `2026-11-19-xr5-short-period-examples.md`.

## Facts that decide this guide
- **Back end and front end, no migration.** Alembic stays at **0054**. **Additive only**: no field was removed or renamed; the old link `ls-staging.unifolio.in` shares this back end and database and keeps working. What the old link sees: the **new numbers** (ranks, "out of N", category averages, XIRR end dates and short-holding handling), one new additive row key and additive XIRR fields it ignores, the dash for net-zero flows where it showed 0%.
- **No new setting, no new cron line.** The 14:10 digest script changes (it lists one more log line); it runs from the redesign worktree, so step 6 updates it.
- **Deploy mode is `--full`** (the back end changed). Build about as long as for M1 (seconds with cached layers); the video adds 4.5 MB to the front end bundle.
- **Stored results must be rebuilt** (ranks, averages and XIRR fields are stored sections): `analytics-recompute-all` runs at 06:30 daily; step 8 runs it once now. **Before it, the nightly price job is run once** (step 8) so the Sectoral/Thematic peers have AMFI's latest price; otherwise the rebuilt averages would still use the 5 to 18 day old prices until tomorrow 06:00. Both outside the job windows (05:40 to 06:35, 10:30 to 10:40, 14:00 to 14:15 IST).
- **The 15-minute web cache:** the 10:30 and 14:00 recompute runs in the cron process, so the web process can serve its cached holdings for up to 15 minutes, during which the tile and the stored column can disagree. It clears itself.
- **Tests:** see step 2.

## Prompt for the executing Claude
```
You are deploying milestone M2 part 1 (Batch A numbers, the shared Home graph, the movers backend, the tutorial pop-up) to the LeapSwitch staging VM (ls-redesign.unifolio.in). Read Docs/orchestration/2026-11-20-staging-deploy-guide-m2.md and follow it step by step.
Rules: run one command at a time and show its output; at every STOP, stop and report; run nothing that changes the VM before the step that says GATE and the owner's yes; never print .env lines; never run clean-db.sh, restore.sh or rollback.sh on your own initiative; use ssh by hostname from WSL only.
At the end fill in step 10 and give the owner the report.
```

## Section 1: steps

### Step 0 (laptop): publish the frozen candidate
`m2-candidate` is merged into `leapswitch-redesign` and the merge is tagged `m2-rc`. Publish:
```bash
git fetch origin && git push origin leapswitch-redesign m2-rc
```
**Never force-push.** Commits after the tag on the branch are documents only; the deploy uses the tag.

### Step 1 (laptop): the release touches only what it should
```bash
git diff --name-only 75c3ef2327764a11936de315e67be0a34fde242c m2-rc | grep -vE "^Docs/|\.test\.tsx?$|^backend/tests/"
```
Expected groups only: `backend/app/services/{analytics,dashboard,home,fund_page}/**`, `backend/app/api/**` (home, dashboard), `backend/scripts/**` (the exporters, the recount, `jobs/refresh_nav_daily.py`), `deploy/leapswitch/scripts/nav-digest.sh`, `frontend/src/{components/wealth-graph,features/import/tutorial,features/mutual-funds,features/portfolio,features/home,features/dashboard,features/import,lib}/**`, `frontend/public/tutorial/*` (the video, poster, transcript), `session.md`, `decisions.md`, `CLAUDE.md`. **STOP** on a migration (`alembic/versions`), a dependency file (`package*.json`, `requirements*`, `pyproject.toml`), anything under `frontend/src/mobile/`, anything in `backend/app` outside the services and API groups above, or any other deploy file.

### Step 2 (laptop): evidence (there is no CI run for this branch)
Local verification of the merged tree on 20 Nov (worktree `D:\unifolio-m2`): front end **6,264 passed (493 files)**, one test timed out under load and passes alone (below), types clean, lint 0 errors (30 warnings), production build succeeds. Back end, run over every area this release touches (all services, the API, scripts, core, models, config, deployment and startup tests; no Postgres): **6,039 passed**, 17 skipped, 3 expected failures, **25 failed: 15 news-script tests that cannot run on Windows (`import resource`) and the 8 older ones below, all 23 identical on the old deployed commit; the last 2 were caused by this release and are fixed in the freeze** (two old stand-ins in `test_background_jobs.py` still used the old price-warm signature; now updated, the nav-job tests pass 34 of 34). Known failures that also fail on the old deployed commit and come from no change here: the two import-scan module-import tests (`test_category_ranking`, `test_performance_ranking`), the ABSL layout test, four disclosure-client tests, one disclosure-manual test that needs a local AMFI cache (8 in all); one front-end test (`DashboardView.test.tsx`, the "Why this return" dialog) timed out once under a full-suite run and passes alone (36 of 36).

### Step 3 (VM): pre-flight, read-only
```bash
cd /opt/unifolio-redesign && git rev-parse --abbrev-ref HEAD && git log -1 --format=%H && git status --short
df -h / | tail -1
sudo docker image ls leapswitch-backend --format '{{.Tag}} {{.ID}} {{.CreatedSince}}'
sudo docker compose -f /opt/unifolio-redesign/deploy/leapswitch/docker-compose.yml run --rm -T backend alembic current
date '+%H:%M IST'
```
Expected: branch `leapswitch-redesign`; HEAD `75c3ef2327764a11936de315e67be0a34fde242c` (the rollback target; if it is anything else, **STOP**); no status lines; **at least 12 GB free** (if short, ask the owner before pruning, and say which images go); `latest` image `518b172eb440`, `previous` `92d05a00b429`; `alembic current` ends `0054 (head)`; the time is **not** within 05:40 to 06:35, 10:30 to 10:40 or 14:00 to 14:15 IST. **STOP** on any miss.

### Step 4 (VM): rollback safety, before anything is built. GATE
Tag the running image so a rollback image of M1 exists, then take an on-demand backup and save the crontab:
```bash
cd /opt/unifolio-redesign/deploy/leapswitch
sudo docker tag leapswitch-backend:latest leapswitch-backend:previous
sudo docker image ls leapswitch-backend --format '{{.Tag}} {{.ID}}'
sudo /opt/unifolio/deploy/leapswitch/scripts/backup.sh
sudo crontab -l > /home/deploy/crontab.before-m2-2026-11
```
Expected: `previous` and `latest` show the same id (`518b172eb440`); the backup script ends without an error email (`tail -5 /var/log/unifolio-backup.log`); the crontab file is not empty. **STOP** if the backup failed: no deploy without a backup of that day.

### Step 5: no new setting
Nothing to add to `.env`. (`AUTH_GUARD_SECRET` was set for M1 and stays.)

### Step 6 (VM): switch to the tag
```bash
cd /opt/unifolio-redesign && git fetch origin && git checkout -B leapswitch-redesign m2-rc && git rev-parse HEAD
```
Expected: the full hash equals `f1f7e5d47e796ef64105fc196ee77cf84e8d2f09`. **STOP** if not.

### Step 7 (VM): deploy. GATE: the owner's yes first
```bash
cd /opt/unifolio-redesign/deploy/leapswitch && sudo sh ./scripts/deploy-redesign.sh --full
```
Expected: exit 0; "built in N s"; backend and worker recreated (caddy may be recreated too, as on 19 Nov); postgres untouched. If it stops at the disk guard: no `--force` without the owner's yes. Then check the **new** image runs:
```bash
sudo docker compose ps --format '{{.Service}} {{.Image}} {{.Status}}'
sudo docker image ls leapswitch-backend --format '{{.Tag}} {{.ID}}'
sudo docker compose run --rm -T backend alembic current
```
Expected: `latest` has a **new** id and the backend and worker run it; `previous` is `518b172eb440`; `alembic current` still `0054 (head)` (nothing to migrate). **STOP** if the deploy failed or `latest` and `previous` show the same id.

### Step 8 (VM): fresh prices, then the stored-results rebuild
Outside the job windows. First the nightly price job once (it now writes AMFI's latest price for every peer and prints its failure count), then the rebuild:
```bash
cd /opt/unifolio-redesign/deploy/leapswitch && sudo sh /opt/unifolio/deploy/leapswitch/scripts/run-job.sh nav-daily-m2 scripts/jobs/refresh_nav_daily.py > /home/deploy/navdaily-m2.log 2>&1; echo exit=$?; grep -E '^(PEER_HISTORY|NAV_SUMMARY|NAV_PROBLEM)' /home/deploy/navdaily-m2.log | tail -5
```
Expected: `exit=0`; a line `PEER_HISTORY failed=<n> of <m>` with **n small (single digits is normal, not zero is not an error)**; a `NAV_SUMMARY`; no `NAV_PROBLEM`. If `n` is more than about a tenth of `m`, report it (the price service is limiting us; the retry did not help) and carry on. **STOP** on a nonzero exit (run-job.sh emails the failure; report it). Then:
```bash
cd /opt/unifolio-redesign/deploy/leapswitch && sudo sh /opt/unifolio/deploy/leapswitch/scripts/run-job.sh analytics-recompute-m2 scripts/run_analytics_recompute.py --all > /home/deploy/recompute-m2.log 2>&1; echo exit=$?; tail -5 /home/deploy/recompute-m2.log
```
Expected: `exit=0` and the script's own counts, no error lines. **STOP** on a nonzero exit.

### Step 9 (VM and laptop): quick verify (a smoke check, not the QA)
Health, both domains, the old link, the new assets:
```bash
cd /opt/unifolio-redesign/deploy/leapswitch && sudo docker compose ps
for u in https://ls-staging-api.unifolio.in/health https://ls-redesign.unifolio.in/ https://ls-staging.unifolio.in/ https://ls-redesign.unifolio.in/tutorial/poster.jpg; do curl -s -o /dev/null -w "%{http_code} %{content_type}\n" "$u"; done
curl -s -o /dev/null -w "%{http_code} %{content_type} %{size_download}\n" -H "Range: bytes=0-99" https://ls-redesign.unifolio.in/tutorial/how-to-request-from-cams.mp4
sudo docker compose logs backend --since 20m | grep -c " ERROR "
```
Expected: postgres, backend, worker, caddy running and healthy; `200`, `200`, `200`, `200 image/jpeg`; the video answers `206 video/mp4 100` (range requests work, so seeking works); the error count is `0`.

The new code is the code that runs (read-only, prints two words):
```bash
cd /opt/unifolio-redesign/deploy/leapswitch && sudo docker compose run --rm -T backend python -c "
from app.services.analytics import scheme_universe, performance_ranking
print(hasattr(scheme_universe, 'plan_matches'), performance_ranking.NO_GROWTH_DISCLAIMER_KEY)"
```
Expected: `True no_growth_series_not_ranked`. The before and after numbers above were measured on 19 and 20 Nov from a throwaway copy of this code against staging data; the check after the deploy is the owner's row M2-02 (the "out of N" values: Large & Mid Cap (Direct) 33, Corporate Bond (Direct) 21).

Then the owner opens, in a private window, `https://ls-redesign.unifolio.in/`: Analytics shows rank rows ("out of N") and a category average; Mutual Funds holdings shows the as-on date on the XIRR figures; the import screen shows "Watch how it works" and the pop-up plays and closes. **Defects noticed here go on the QA list; they do not stop the deploy unless the deploy itself is broken.**

### Step 10: record (Claude fills this in)
Deployed commit, last deployed commit, image ids before and after, build time, backup file name and size, the price-job `PEER_HISTORY` line, the recompute result, health codes, free disk before and after, anything that surprised. Write it as `Docs/orchestration/2026-11-<day>-staging-deploy-record-m2.md` in the M1 record's shape, with an honest list of what is not as hoped.

## Section 2: rollback (only on the owner's yes)
- **Front end:** `cd /opt/unifolio-redesign && git checkout -B leapswitch-redesign 75c3ef2327764a11936de315e67be0a34fde242c` then `cd deploy/leapswitch && sudo sh ./scripts/deploy-redesign.sh`.
- **Back end:** `cd /opt/unifolio-redesign/deploy/leapswitch && sudo sh ./scripts/rollback.sh` (points `latest` back at the `previous` image tagged in step 4). **Check the image id first**: `previous` must be `518b172eb440`.
- **Migration:** none was run; nothing to undo.
- **Crontab:** unchanged by this release (a saved copy is `/home/deploy/crontab.before-m2-2026-11`).
- **Stored results and prices:** after a rollback, run the step 8 rebuild again (ranks, averages and XIRR fields revert to the old rules). The prices the nightly job wrote are public NAV data and stay.
- No `clean-db.sh`, no `restore.sh` unless the owner decides the database itself is damaged (it is not expected to be: no schema change, and the only writes are public NAV rows and the stored analytics).
