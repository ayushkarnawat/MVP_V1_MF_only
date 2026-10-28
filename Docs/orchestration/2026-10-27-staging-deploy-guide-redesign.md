# Staging Deploy Guide: UI redesign (`leapswitch-redesign`) to `ls-redesign.unifolio.in`

Brings the redesign preview on the LeapSwitch/CloudPe VM up to the current tip of **`leapswitch-redesign`**, including the M2 review fixes (backend merge `2f1ad702`, front-end merge `96dc4d92`), migrations **0044, 0045, 0046**, the Home news feed going live, the weekly NSE symbol fill, and the performance measurements (integration wave I2).

Modelled on `2026-10-10-staging-deploy-guide-subproject-1.md` and `leapswitch-staging-deploy-guide.md`. A separate, printable QA checklist for after the deploy is **`2026-10-27-staging-qa-checklist-redesign.md`** (same folder); this guide ends with a link to it and the sign-off block.

**Who runs what.** The orchestrator cannot reach the VM. The owner or the manager runs every command here and pastes the output; the orchestrator checks it against "Good looks like". Account creation, sign-in and password entry are always the owner's.

**Branch.** Deploy **`leapswitch-redesign` only**. Never `main`, never `feat/leapswitch-staging`.

**Where.** SSH to the VM (`deploy@202.66.174.251`; if SSH times out rather than being refused, it is the CloudPe Security Group IP allowlist, see the staging plan's Troubleshooting). VM layout: main clone `/opt/unifolio` (branch `feat/leapswitch-staging`) and the redesign worktree `/opt/unifolio-redesign` (branch `leapswitch-redesign`). **Every command in this guide runs in `/opt/unifolio-redesign/deploy/leapswitch`** unless it says otherwise. The redesign README rule: any backend or worker deploy runs from the redesign worktree, never from the main clone.

**When.** Weekday, outside the cron windows: avoid 00:55 to 06:35 IST (batch jobs) and 08:00, 19:00 (account deletion, CAS expiry). `news-refresh` runs at :15 of 07, 10, 13, 16, 19, 22 and 23:30 once installed.

**Time.** About 1.5 to 2 hours including the timed runs. The backend is not stopped for the migration (it is additive); the backend and worker restart briefly in section 4.

**What ships (what is new since the last redesign deploy).**
- Migrations **0044** (`news_items`, `stock_master.nse_symbol`), **0045** (four benchmark index enum members: `nifty_next_50`, `nifty_smallcap_250`, `nifty_100`, `nifty_200`), **0046** (`job_runs`, one row per job holding its last successful run). All additive. Chain: 0043, 0045, 0044, 0046. **No new migration was added in pass 3**, so the head is `0046`.
- News: fetches are now https only and an article URL must be on its source's domain (new `skipped_bad_url` counter in the ingest stats); the NSE equity list download is capped at 20 MB and the GDELT file downloads at 50 MB each.
- New settings: `NEWS_ENABLED`, `HEALTHCHECK_NEWS_URL`, `NEWS_DISABLED_SOURCES`, `NSE_SYMBOL_FILL_ENABLED` (+ optional `NSE_SYMBOL_FILL_URL`).
- New cron lines: `news-refresh`, `news-refresh-catchup`, and Sunday 05:20 `nse-symbol-fill`.
- Home news feed freshness is the last successful `refresh_news` run (`job_runs`). **The feed shows empty until the first successful refresh after 0046 is live.**

## Before you start: what the owner supplies

Have these ready before section 0, so no step stalls halfway:

| Item | Needed in | Who |
|---|---|---|
| **Healthchecks.io check for the News job** and its ping URL (becomes `HEALTHCHECK_NEWS_URL`) | Section 5, and the live runs in section 6b | Owner creates the check (period and grace suited to a run every 3 hours plus the nightly catch-up) and gives the manager the URL |
| **A test household with real statements** and its **user UUID** (becomes `<UUID>`) | Sections 13 and 14 (Planning script, I2 timings), and the Worth-a-look and XIRR checks | Owner picks the household and gives the manager the UUID. Open History for that household once before section 14 |
| **Free disk and memory on the VM** (several GB of disk for the image build; 16 GB RAM) | Checked in section 0 | Manager; stop and tell the owner if disk is under 5 GB free |
| **Synthetic statements** from `Docs/CAS Files/synthetic/pdfs/realistic/` (password `MF@123`) | Sections 17 and 18 | Owner |

## Order of steps

| Section | What | Site |
|---|---|---|
| 0 | Pre-checks | up |
| 1 | Branch and pull | up |
| 2 | Backup and current migration | up |
| 3 | **Migrations 0044, 0045, 0046** (head 0046) | up |
| 4 | **`deploy-redesign.sh`** (backend, worker and front end) | brief restart |
| 5 | **Settings in `.env`** (news and NSE) | restart of backend |
| 6 | **News T9**: dry run, timed live runs, match review | up |
| 7 | NSE symbol fill, one-off | up |
| 8 | **Crontab reinstall** | up |
| 9 | **Recompute jobs** (benchmark windows, analytics, worth-a-look) | up |
| 10 | **Sign-in check** on `ls-redesign.unifolio.in` | up |
| 11 | **XIRR fixture check** (`analyticsCombined`) | up |
| 12 | **CAL1 thresholds** | up |
| 13 | **Planning script** | up |
| 14 | **I2 timing measurements** on the 21.9M-row `nav_history` | up |
| 15 | **News stock and sector calibration re-check** (L20, L21) | up |
| 15b | **Priority 1: fund-manager factsheet access from this VM** | up |
| 16 | `tests/test_migrations.py` hang check | laptop |
| 17 | Smoke test | up |
| 18 | Owner's manual checklist (items 1 to 5) | up |
| 19 | Rollback | |
| 20 | QA checklist link and sign-off | |

---

## Section 0: Pre-checks

On your laptop:
```bash
git fetch origin
git log -1 --format=%h origin/leapswitch-redesign
git merge-base --is-ancestor 96dc4d92 origin/leapswitch-redesign && echo front-end-fixes-in
git merge-base --is-ancestor 2f1ad702 origin/leapswitch-redesign && echo backend-fixes-in
```
**Good looks like:** a short hash and both `...-in` lines. The tip is **`191bcc3b` or a later docs-only commit**: the code was last changed at `80179818`, and `191bcc3b` only edits this guide and the checklist. Prove no code moved since `80179818`:
```bash
git diff --stat 80179818 origin/leapswitch-redesign -- backend frontend deploy scripts
```
**Good looks like:** it prints nothing. If it prints files, someone merged code after the review: stop and tell the orchestrator. Expected: CI is green on the last code commit (`gh run list --branch leapswitch-redesign --limit 3`; a docs-only push may show no new run).

On the VM:
```bash
ssh deploy@202.66.174.251
cd /opt/unifolio-redesign/deploy/leapswitch
git rev-parse --abbrev-ref HEAD
ls -l .env
df -h / | tail -1
free -g | head -2
```
**Good looks like:** `leapswitch-redesign`; `.env` shown as a symlink to `/opt/unifolio/deploy/leapswitch/.env`; plenty of free disk (the build needs several GB); memory as expected for the VM (16 GB per the staging plan).

**If the branch is anything else:** stop. `deploy-redesign.sh` also refuses to run on any other branch.

Check the `.env` redesign lines `deploy-redesign.sh` needs (do not print secrets):
```bash
grep -E "^(LS_REDESIGN_DOMAIN|MAIN_FRONTEND_DIST|REDESIGN_FRONTEND_DIST|ALLOWED_ORIGINS)=" .env
```
**Good looks like:** `REDESIGN_FRONTEND_DIST=/opt/unifolio-redesign/frontend/dist`, `MAIN_FRONTEND_DIST=/opt/unifolio/frontend/dist` (they must differ), and `ALLOWED_ORIGINS` containing both `https://ls-staging.unifolio.in` and `https://ls-redesign.unifolio.in`.

## Section 1: Branch and pull

```bash
cd /opt/unifolio-redesign
git status --short
git pull --ff-only
git log -1 --format="%h %s"
cd deploy/leapswitch
```
**Good looks like:** `git status --short` prints nothing; the pull ends `Fast-forward` (or `Already up to date.` if you pulled earlier) and the last commit hash equals the one from section 0.

**If the pull refuses (local changes):** something was edited on the VM outside git. Run `git status`, do not discard blindly, and tell the orchestrator.

## Section 2: Backup and current migration

```bash
sudo ./scripts/backup.sh < /dev/null
echo "backup exit: $?"
sudo sh -c '. ./.env; aws --profile cloudpe --endpoint-url "$OBJECT_STORAGE_ENDPOINT_URL" s3 ls "s3://$BACKUP_BUCKET_NAME/postgres/" | tail -3'
sudo docker compose run --rm -T backend alembic current
```
**Good looks like:** the backup script exits 0 **and prints nothing** (it logs to `/var/log/unifolio-backup.log` only when run from cron). **The dump is not on the VM's disk:** `backup.sh` gzips it and uploads it to the CloudPe object-storage bucket `unifolio-staging-disclosure-failed`, key prefix `postgres/` (about 169 MB per dump on 27 Oct 2026), and deletes the local copy. The `s3 ls` line above must show a dump stamped with the current time; note its file name for rollback. Keep `< /dev/null` on the command when it is run from a script, or it can swallow the script's own input. `alembic current` here is the **before** picture and must end with `0043 (head)` or, if an earlier redesign step already applied some of the new migrations, `0045` or `0044`. **`0046` at this point would be wrong**: it would mean the migrations were already applied, so stop and tell the orchestrator. `0046 (head)` is expected only **after** section 3, never in this section. Write the revision you see here in the run log; it is the starting point for rollback.

Use `docker compose run`, not `exec`: `exec` targets the existing container, which may be stale.

## Section 3: Migrations 0044, 0045, 0046

Run the migration **before** the new code. The three migrations are additive, and the old code on the new schema was checked at milestone M1, so the site stays up. The `alembic` folder is bind-mounted from this worktree, so running from here picks up the new revision files even though the image is still the old one.

```bash
sudo docker compose run --rm -T backend alembic upgrade head
sudo docker compose run --rm -T backend alembic current
```
**Good looks like:** (this is where `0046 (head)` first appears; section 2 printed the old revision) one `Running upgrade ...` line per migration applied (`0043 -> 0045`, `0045 -> 0044`, `0044 -> 0046` if starting from 0043), no traceback, and `alembic current` prints:
```
0046 (head)
```
Check the objects:
```bash
sudo docker compose exec -T postgres psql -U "$DB_USERNAME" "$DB_NAME" -c "\d job_runs" -c "\d news_items" -c "select enumlabel from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='benchmarkindex' order by 1"
```
(`$DB_USERNAME` and `$DB_NAME` come from `.env`: run `set -a; . ./.env; set +a` first if they are empty.) **Good looks like:** `job_runs` with `job_name` and `last_success_at`; `news_items` described; the enum list includes `nifty_next_50`, `nifty_smallcap_250`, `nifty_100`, `nifty_200`.

**If it fails partway:** Alembic runs each revision in its own transaction, so `alembic current` shows the old revision. (Exception: 0045 uses `ALTER TYPE ... ADD VALUE IF NOT EXISTS` in an autocommit block, so re-running is safe.) Paste the traceback; do not continue to section 4.

## Section 4: `deploy-redesign.sh`

**What it does.** Run from the redesign worktree it refuses unless the branch is `leapswitch-redesign` and `REDESIGN_FRONTEND_DIST` points at this worktree's `frontend/dist` (and differs from `MAIN_FRONTEND_DIST`). With no flag it only builds the front-end bundle (`npm ci && npm run build` in a `node:20-alpine` container with `VITE_API_BASE_URL=https://$LS_API_DOMAIN`); Caddy serves it live through the bind mount. `--caddy` also recreates the caddy container (first time, Caddyfile or domain changes). `--full` hands over to `scripts/deploy.sh`: it tags the running backend and worker images `:previous`, builds the front end, then `docker compose up -d --build`, so the backend and worker are rebuilt from **this** worktree.

This release changes the backend (news, NSE fill, `job_runs`, M2 fixes), so use `--full`:
```bash
sudo sh ./scripts/deploy-redesign.sh --full
```
**Run it exactly like this, not `./scripts/deploy-redesign.sh`.** The file is committed without the executable bit (git mode `100644`), so `./scripts/deploy-redesign.sh` fails at once with `Permission denied` (exit 126; nothing changes), and the `deploy` user is not in the docker group, so it needs `sudo`. Before it, check the disk: the build needs about 2.5 GB, so free at least 5 GB first (`df -h /`). `sudo docker builder prune -f` frees the build cache safely (it only slows the next build). Before a **second** `--full` run (for example a hotfix), keep the pre-redesign images under their own tag so the second run cannot overwrite them: `sudo docker tag leapswitch-backend:previous leapswitch-backend:pre-redesign` and the same for `leapswitch-worker`. The first run on 27 Oct 2026 took 3 min 13 s.
Do **not** run a separate `docker tag ... :previous` step first: `deploy.sh` tags `:previous` itself from the image running right now, and tagging a second time after a build would overwrite `:previous` with the new image and destroy the rollback.

**Good looks like:** the build ends with `built in <N>s`, then
```
 Container leapswitch-backend-1   Started
 Container leapswitch-worker-1    Started
```
(`caddy` and `postgres` usually say `Running`). With `--full` the script `exec`s `deploy.sh`, so the final "redesign bundle built at ..." line of the front-end-only mode is not printed; in that case confirm with the checks below. A front-end-only run (no flag) ends with: `redesign bundle built at /opt/unifolio-redesign/frontend/dist -> https://ls-redesign.unifolio.in`.

```bash
sudo docker compose ps
sudo docker image ls | grep -E "leapswitch-(backend|worker)"
curl -s -o /dev/null -w "%{http_code}\n" https://ls-staging-api.unifolio.in/health
curl -s -o /dev/null -w "%{http_code}\n" https://ls-redesign.unifolio.in/
curl -s -o /dev/null -w "%{http_code}\n" https://ls-staging.unifolio.in/
```
**Good looks like:** all services running, `leapswitch-backend:previous` and `leapswitch-worker:previous` present next to `:latest`, and `200` three times.

**If the build fails:** nothing live changed (`backend` and `worker` keep the old image). Fix and rerun. **If a container is unhealthy:** `sudo docker compose logs backend --tail 80`, then Section 19.

## Section 5: Settings in `.env`

Edit the one shared `.env` (`sudo`, keep `chmod 600`). It is `/opt/unifolio/deploy/leapswitch/.env`; the redesign worktree's file is a symlink to it. `deploy/leapswitch/.env.example` lists the three news variables only; the NSE variables are in `backend/.env.example`, so **add them by hand**.

| Variable | Value | Notes |
|---|---|---|
| `NEWS_ENABLED` | `true` | Kill switch for the Home news job and routes. Default off. The dry run in section 6a **also needs it `true`**: with it off the job prints `news_refresh: news disabled` and exits 0 without reading anything (found on 27 Oct 2026). Set it before 6a; no cron is installed yet, so nothing runs on its own. |
| `HEALTHCHECK_NEWS_URL` | your Healthchecks.io ping URL | Pinged by `refresh_news.py` after a successful run. Owner creates the check and supplies the URL. NEEDS CHECK: the check's period and grace should suit a run every 3 hours plus the nightly catch-up. |
| `NEWS_DISABLED_SOURCES` | empty, or comma-separated domains | Dropped at ingest and at request time, case-insensitive. Leave empty unless a source must be blocked. |
| `NSE_SYMBOL_FILL_ENABLED` | `true` | Enables `scripts/jobs/fill_nse_symbols.py`. Default off. |
| `NSE_SYMBOL_FILL_URL` | optional | Default `https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv`. Set only to override. |

Apply and confirm (the backend and worker read `.env` at container start):
```bash
sudo docker compose up -d --no-deps backend worker
sudo docker compose run --rm -T backend python -c "from app.config import settings as s; print(s.news_enabled, bool(s.healthcheck_news_url), repr(s.news_disabled_sources), s.nse_symbol_fill_enabled)"
```
**Good looks like:** `True True '' True` (or your disabled list). Set `NEWS_ENABLED=true` before the section 6 dry run (the dry run writes nothing and never pings the heartbeat).

**If a value shows `False`/empty:** a typo in the variable name, quotes around the value, or the containers were not recreated.

## Section 6: News T9 (the owner's staging check)

Order matters: dry run, then live runs with the kill switch on, then review, then the crontab (section 8).

**6a. Dry run** (reads and tags; writes nothing, never pings the heartbeat):
```bash
sudo docker compose run --rm -T backend python scripts/jobs/refresh_news.py --dry-run --hours 5
```
**Good looks like:** exit 0, one `HTTP/1.1 200 OK` line per GDELT file (20 files for `--hours 5`, none 4xx/5xx), then a summary of the form `dry_run: articles=<n>` and `untagged indian-site titles: count=<m>`, followed by a list of the untagged headlines. Measured 27 Oct 2026: `articles=303`, `count=238`. The dry run does not print the live `news_refresh files_ok=...` line.

**6b. Live runs, timed** (needs `NEWS_ENABLED=true` and `HEALTHCHECK_NEWS_URL` from section 5):
```bash
sudo /usr/bin/time -v docker compose run --rm -T backend python scripts/jobs/refresh_news.py --hours 26
sudo /usr/bin/time -v docker compose run --rm -T backend python scripts/jobs/refresh_news.py --hours 5
```
**Good looks like:** exit 0 each time; a `news_refresh files_ok=... inserted=<n> ...` line (first run `inserted` above 0, second run small or 0 because of duplicates); the `time -v` block shows `Maximum resident set size (kbytes)` and `Elapsed (wall clock) time`. Paste both numbers. **Use the job's own `peak_mb` as the memory figure**: the `Maximum resident set size` in the `time -v` block measures the `docker compose` client (about 32 MB), not the job. Measured 27 Oct 2026: `--hours 26`: `files_ok=104 rows=129738 kept=1104 inserted=178 seconds=170.2 peak_mb=104.8`, wall 2:54; `--hours 5`: `files_ok=20 rows=30218 kept=303 inserted=0 seconds=25.5 peak_mb=99.3`, wall 0:28. About 100 MB peak is far inside the VM's 16 GB, including the 05:40 to 06:35 batch window. The summary line does **not** print a `skipped_bad_url` count. Healthchecks.io shows a ping after each live run (the owner checks it).

**If exit 1 with `files_ok=0`:** GDELT unreachable or every file failed: check outbound HTTPS from the VM. A file over 50 MB is refused by design.

**6c. Match review** (read only):
```bash
sudo docker compose run --rm -T backend python scripts/review_news_matches.py
```
**Good looks like:** `news_items total=<N>`, `published_at oldest=... newest=...`, `ingested_at oldest=... newest=...`, `rows per tier:` (tiers 1 to 7), `rows per tag kind:`, `rows per source:`, then 20 sample headlines per tag kind. Expected: look for samples whose tag really matches the headline. Untagged titles are not stored; use `--dry-run` to see those. Send the output to the orchestrator for review. Optional: `--samples 40` for more.

**Real finding on 27 Oct 2026 (read this before accepting 6c):** `stock_master` holds 884 stocks whose **name** is just the ticker in capitals (for example `TAKE`, `STAR`, `STANLEY`, `YATRA`, `BAJEL`), so they match as ordinary name aliases and tagged everyday words ("he'll take", "pop star", "Morgan Stanley", "Digi Yatra"). PR #29 fixed the symbol-only brand aliases and the `Company`-stripped one-word names; a follow-up branch (`fix/news-ticker-names`) covers the ticker-style names. After each fix deploy, clear the derived rows and re-ingest: `delete from news_items;` (the table is a cache that refills from GDELT in about 3 minutes), then the two 6b runs, then 6c, and grep the review for `stock:(TAKE|STAR|STANLEY|YATRA)`. The review must show none of those on the headlines listed above.

**6d.** Only after the review is accepted, install the crontab (section 8). If the session's permission check blocks the crontab install, the owner runs the three section 8 commands in their own WSL terminal.

## Section 7: NSE symbol fill, one-off

Fills NULL `stock_master.nse_symbol` from NSE's equity list (idempotent, best effort; a failed fetch still exits 0).
```bash
sudo ./scripts/run-job.sh nse-symbol-fill scripts/jobs/fill_nse_symbols.py
echo $?
```
**Good looks like:** `fill_nse_symbols: success=True updated=<n> already_set=<m> unmatched=<k>` and `0`. A second run shows `updated=0`. The download is capped at 20 MB.

**If `success=False`:** NSE refused or timed out from this address (the log line `NSE_SYMBOL_FILL_ALERT fetch_failed` appears). Not a blocker: the news tagger falls back to name and ISIN matching. Tell the orchestrator.

**If it logs `disabled`:** `NSE_SYMBOL_FILL_ENABLED` is not `true` in the container (section 5).

## Section 8: Crontab reinstall

The redesign branch's `crontab.leapswitch` adds three lines: `nse-symbol-fill` (Sundays 05:20 IST), `news-refresh` (`15 7,10,13,16,19,22`, `--hours 5`) and `news-refresh-catchup` (`30 23`, `--hours 26`). The file's `RUN=` path is `/opt/unifolio/deploy/leapswitch/scripts/run-job.sh` (the main clone's script, which drives the same pinned `leapswitch` compose project, so it uses the image just built).

Install from the **redesign worktree's** copy (the main clone's copy lacks the new lines). This step changes the VM's scheduler permanently, so it is the owner's to run or approve:
```bash
sudo crontab -l > /root/crontab.before-redesign.$(date +%F)
sudo crontab /opt/unifolio-redesign/deploy/leapswitch/crontab.leapswitch
sudo crontab -l | grep -E "nse-symbol-fill|news-refresh|CRON_TZ|RUN="
```
**Good looks like:** the saved copy exists; the grep shows `CRON_TZ=Asia/Kolkata`, the `RUN=` line, and the three new lines. No service restart is needed; cron re-reads on the next minute.

NEEDS CHECK: confirm the main clone's `scripts/run-job.sh` is identical to the redesign worktree's (`diff /opt/unifolio/deploy/leapswitch/scripts/run-job.sh /opt/unifolio-redesign/deploy/leapswitch/scripts/run-job.sh`); if they differ, edit `RUN=` to the redesign path.

The first scheduled run after install is the next `:15` slot; check it:
```bash
sudo docker compose run --rm -T backend python scripts/review_news_matches.py | head -5
```
**Good looks like:** `ingested_at newest=` moves forward after the next slot. A failed cron run emails `OPS_ALERT_EMAIL` through `run-job.sh`.

## Section 9: Recompute jobs (benchmark windows, analytics, worth-a-look)

Migration 0045 added four index enum members, and the benchmark-window and Worth-a-look sections are built from stored analytics, so recompute once now. Worth-a-look has no job of its own: it reads the stored analytics sections (`score`, `category_ranking`, `stock_holdings`, `cap_allocation`) and reference tables, so the analytics recompute is what refreshes it.

```bash
sudo ./scripts/run-job.sh benchmark-daily scripts/jobs/refresh_benchmark_daily.py
sudo bash -c 'time ./scripts/run-job.sh analytics-recompute-all scripts/run_analytics_recompute.py --all'
```
(Single household: `... scripts/run_analytics_recompute.py --household <UUID>`.)

**Good looks like:** both exit 0; the benchmark job logs success for all eight TRI indices (Expected: look for the four new indices in its output); `analytics-recompute-all` finishes in **under 15 minutes** (the stale ceiling named in `measure_benchmark_matrix.py`). Record the wall time. Measured 27 Oct 2026: `refresh_benchmark_daily: fetches=16 succeeded=16 success=True` (newest stored TRI date for all 8 indices: 27 Oct), `analytics-recompute-all` exit 0 in **485 s (8 min 5 s)**.

Then, in a browser as the owner: Mutual Funds, Performance (benchmark window rows have values) and Home, Worth a look (cards or "nothing flagged"; state not `unavailable` for a household with sections).

**If a window row is blank:** the index history for that member did not load: rerun `benchmark-daily`, then escalate to Backend.

## Section 10: Sign-in check on `ls-redesign.unifolio.in`

Owner only (no one else enters credentials).
1. `dig +short ls-redesign.unifolio.in` returns `202.66.174.251`.
2. In a private window open `https://ls-redesign.unifolio.in`, sign in with an existing staging account (or sign up with a new email: the owner enters the OTP).
3. In another browser profile open `https://ls-staging.unifolio.in` and sign in with the same account.

**Good looks like:** both links accept the same account and show the same data; no CORS errors in the browser console on either; the old link looks unchanged. Sign in with Google is not part of the redesign.

**If the console shows a CORS error:** `ALLOWED_ORIGINS` in `.env` lacks `https://ls-redesign.unifolio.in`, or the backend was not recreated after editing it (`sudo docker compose up -d --no-deps backend`).

## Section 11: XIRR fixture check (`analyticsCombined`, register C134)

The front-end `analyticsCombined` fixture for Mutual Funds shows portfolio XIRR **0.1069** while the holdings fixture shows lifetime XIRR **0.1612**. The real backend uses the same function for both, so on real data the two should agree. Check on a synthetic household as the owner:
1. Mutual Funds, Overview/Performance: note the portfolio XIRR shown (from the combined analytics response).
2. Mutual Funds, Holdings: note the lifetime XIRR (from the holdings bundle).
3. Optional: in browser devtools, Network, compare `xirr.lifetime` in the holdings response against the portfolio XIRR in the analytics response.

**Good looks like:** the two figures agree to display precision. NEEDS CHECK: the exact field names and the screens that show each number are not named in the register.

**If they differ:** the fixture gap leaked into live data or the wrong field is mapped. Report both numbers and the household to the orchestrator (Backend or Frontend).

## Section 12: CAL1 thresholds (register C85, C60)

The Worth-a-look thresholds were calibrated on a local household without real stored sections, TER rows or disclosures. Now that staging has them, tabulate for each synthetic household which cards fire and why, and show the owner the table. Starting values (register C60):

- weak fund = tier 1 and share at least 2 percent
- underperforming = category average minus the fund's 1-year return at least 3 percentage points and share at least 3 percent
- high expense = TER more than 0.5 percentage point above the category mean and share at least 3 percent
- concentration = top five stocks at least 20 percent of total portfolio value, coverage at least 50 percent, not flagged thin
- at most 3 cards; one card per fund; order weak, underperforming, concentration, high expense

For each household record: cards shown, fund(s), share, tier, 1-year gap, TER gap, top-five share. **Good looks like:** every card that fires is defensible on its numbers, and no obvious case is missed. The owner decides; if a number must move, only `backend/app/services/home/worth_config.py` is edited (Backend), then redeploy.

## Section 13: Planning script

Read-only. Needs a household with real statements; the checkout must be `leapswitch-redesign`.
```bash
sudo docker compose run --rm -T backend python scripts/measure_planning_staging.py --user-id <UUID> --runs 3
```
(Optional `--scenarios 3` is the default.) It measures each ranked scenario for the whole family and then per member: one cold call (holdings cache cleared) and warm calls. It prints counts, member and scenario ordinals and timings only. **Good looks like:** exit 0 and a timing line per scope. NEEDS CHECK: no pass/fail limit is written in the script or the sources; record the numbers for the owner. Measured 27 Oct 2026 on the 3-member test household (3 scenarios): family cold 0.31 to 0.36 s, member cold 0.02 to 0.19 s, warm medians 0.02 to 0.05 s, exit 0, no write error.

**If it aborts with a write error:** a read route is writing (ORM or SQL write). Stop and report; this is a Backend bug.

## Section 14: I2 timing measurements on the 21.9M-row `nav_history`

Staging's `nav_history` holds about 21.9M rows (2006 to 2026), the realistic size for these gates. Use a household with real statements. Open History for it once first (the month-detail and benchmark scripts refuse to run on stale snapshots).

```bash
# Home: budget 1.5 s
sudo docker compose run --rm -T backend python scripts/measure_home_staging.py --user-id <UUID> --runs 5 --limit 1.5
# Month detail: median limit 1.0 s
sudo docker compose run --rm -T backend python scripts/measure_month_detail.py --aggregate --user-id <UUID> --limit 1.0
sudo docker compose run --rm -T backend python scripts/measure_month_detail.py <HOUSEHOLD_MEMBER_ID> --limit 1.0
# Benchmark windows: worst "added by windows" for the largest scope below 3000 ms
sudo docker compose run --rm -T backend python scripts/measure_benchmark_matrix.py --user-id <UUID> --runs 3
# Fund page tiers (informational; the Individual Fund page is deferred)
sudo docker compose run --rm -T backend python scripts/measure_fund_page_staging.py --user-id <UUID> --schemes 4 --runs 3
```
Add `--simulate-fresh-cache` to the Home and fund-page scripts to measure the path with no live NAV download; add `--include-live-fetch` only if you accept `nav_history` cache inserts (the default refuses a cold call that needs one). **The plain Home run aborts with `WriteAttempted` on any day before the evening NAV publish (a cold call would download today's NAV); record the `--simulate-fresh-cache` run.** The benchmark script has its own flag for the same case, `--allow-nav-writes`. **If a script refuses with stale snapshots you do not need the app:** rebuild the household's snapshots from the VM, which is exactly what opening History does (`rebuild_member_snapshots(member_id)` in `app/services/dashboard/snapshots.py`, run once per member through `docker compose run --rm -T backend python -`). Measured 27 Oct 2026 (3-member household, 91 months of history, 46 funds): Home cold-open estimate **789 ms** (limit 1,500: pass); month detail aggregate **median 1,021 ms, worst 1,455 ms (limit 1,000: marginal fail, rises with later months)**; benchmark windows **pass on both households it can run on**: worst "added by windows" **2,565 ms** for the largest scope (42 funds, limit 3,000; close, so watch it as data grows) and 1,395 ms for the other, `GATE: PASS` each, run with `--allow-nav-writes` after rebuilding the snapshots. **The script cannot run on a household that has a member with no holdings**: it sees that member's snapshots as stale on every read and aborts with `a write statement was about to run` (the blocked statement is `DELETE FROM portfolio_snapshots ...`); the 3-member test household (user `140148b8...`) has such a member, so use a household whose members all hold funds. To see which statement is blocked, run the script through a small wrapper that prints the statement `is_write_statement` rejects. Fund-page tiers 8 to 15 ms per fund.

**Good looks like:** Home within 1.5 s, month detail median within 1.0 s, benchmark windows below 3000 ms, plus the full analytics recompute within 15 minutes (section 9). NEEDS CHECK: the fund-page tiers have no stated limits. Planning is section 13.

**L10 and L11 are measured here, not later.** L10 (Home headline and series can mix two price dates for up to 15 minutes after the 06:00 NAV job) and L11 (every Home route runs the full inputs loader, so Home may be slower than it needs to be). Record these next to the Home timing so the owner can decide on each:
```bash
# L11: the Home timing table above, per route (record the slowest route and its time)
# L10: latest price date stored, to compare with the date the Home series ends on
sudo docker compose exec -T postgres psql -U "$DB_USERNAME" "$DB_NAME" -c "select max(nav_date) from nav_history"
```
Then, as the owner, open Home for the test household and note the date on the headline and the last point of the series. **Good looks like:** both dates equal the `max(nav_date)` above; a one-day gap is the L10 mixed-date case (report it; the fix is to build the series' last point from the holdings' price date). NEEDS CHECK: `measure_home_staging.py` may print the series end date itself; if it does, paste that line instead of the browser read.

**If a gate is missed:** the register's L6 (benchmark windows), L8 (cold holdings), L10, L11 name the suspects and the order of fixes. Report the numbers; Backend fixes.

## Section 15: News stock and sector calibration re-check (L20, L21)

Run it now with whatever disclosures are loaded, and again when `portfolio-disclosures-daily` (days 1 to 20 of the month) has loaded more. Do not skip it because disclosures are few: check first how many there are.
```bash
sudo docker compose exec -T postgres psql -U "$DB_USERNAME" "$DB_NAME" -c "select count(*) from stock_master where nse_symbol is not null" -c "select count(*) from news_items"
sudo docker compose run --rm -T backend python scripts/review_news_matches.py --samples 40 > /root/news-review-$(date +%F).txt; grep -c . /root/news-review-$(date +%F).txt
```
Also check **L21** here: the `PLAIN_WORD_SYMBOLS` words (`idea`, `sail`, `page`, `time`, in `backend/app/services/news/config.py`) are tagged only with stock-market context. Look in the `stock` samples for headlines tagged only because of one of those words. **Good looks like:** each such tag has real stock-market context in the headline. Re-run section 6c and read the `stock` and `sector` samples. The labelled set (150 headlines) measured precision 0.991 and recall 0.975 overall at the News backend merge (register C144); the M2 symbol-alias fix run on the same set gave tp 159, fp 3, fn 4, i.e. precision 0.9815 and recall 0.9755 (register C171), so compare your re-check with both; **sector precision and recall were never measured** (L15) and the sector tagger has known false positives (L20). Send the orchestrator a short table of wrong tags. **Good looks like:** stock tags name the right company; sector tags are not "X stocks of Y" noun phrases. Tuning is Backend's, after the owner decides.

## Section 15b: Priority 1, fund-manager factsheet access (CLAUDE.md, deadline 10 Nov 2026)

`DEFERRED_FEATURES.md`, top section: 10 fund houses (689 live funds) are on the monthly hand import because their sites refuse scripted requests from AWS, and 5 (33 funds) publish no usable factsheet. The VM's Indian address may be treated differently, so this section turns that open question into evidence. It changes no setting. The monthly job's next run is **10 Nov 2026, 06:00 IST** (it is already in the crontab). Items 1, 2 and 4 are commands; 3 and 5 are the owner's.

**1. Run the monthly job once, now, from the VM** (the 40 automatic fund houses; it is idempotent and writes only `scheme_fund_managers`):
```bash
sudo ./scripts/run-job.sh fund-managers-monthly scripts/jobs/refresh_fund_managers_monthly.py 2>&1 | tee /root/fund-managers-$(date +%F).log | grep -E "refresh_fund_managers_monthly|FUND_MANAGER_ALERT"
```
**Good looks like:** `refresh_fund_managers_monthly: success=True amcs_processed=40 amcs_failed=0 ...`. Every `FUND_MANAGER_ALERT amc=... reason=fetch_failed` line names a fund house the VM could not reach: paste all of them. The owner decides each one (move to the hand import by setting `ResolverKind.MANUAL` plus a `note`, or accept "not available yet"). If the command runs for more than 30 minutes, stop and report.

Measured 27 Oct 2026 from the VM: `success=True amcs_processed=34 amcs_failed=6 schemes_matched=1104 schemes_unmatched=2 seconds=330.2` and 6 alerts: Angel One `403 Forbidden`, HSBC `ReadTimeout`, Sundaram `500`, and `stale_month` for Mahindra Manulife, Mirae Asset and SBI (the new month's file was not yet published). The 10th-of-the-month run is the one that counts for the stale ones.

**2. Probe the blocked fund houses from the VM's address** (read-only; these five URLs are the ones named in the registry notes, the other five have no stable URL in the registry):
```bash
for u in http://hdfcfund.com/downloads/monthly-fact-sheet https://bandhanmutual.com/downloads/factsheets "https://invescomutualfund.com/literature-and-form?tab=Factsheets" https://www.jmfinancialmf.com/downloads/Factsheet/Factsheet https://www.kotakmf.com/Information/forms-and-downloads/Information; do printf "%s  " "$u"; curl -s -o /dev/null -m 20 -w "%{http_code}\n" "$u"; done
```
Plain `curl`, no header tricks: the A04 rule is no access-control workarounds. **Good looks like:** record each code. The registry notes say 403, 401, 403, 406 and a 200 with no links, so a `200` for the first four would be new evidence worth acting on (on 2026-10-16 Bandhan, JM Financial, Axis and Kotak answered from this address and ICICI and HDFC did not). Record for the owner; do not change the registry here. Measured 27 Oct 2026 from the VM: HDFC `403`, Bandhan `200`, Invesco `301`, JM Financial `406`, Kotak `301`.

**3. Owner: the HDFC passive file.** Download HDFC's passive factsheet and send it to Claude to verify the reader (the active file already matched 53 of 53). Until then HDFC's hand import is only trusted for the active file.

**4. The ops-alerts subscriptions** (AWS side, run from a machine where `aws` is configured):
```bash
TOPIC=$(aws sns list-topics --query "Topics[?contains(TopicArn,'ops-alerts')].TopicArn" --output text)
aws sns list-subscriptions-by-topic --topic-arn "$TOPIC" --query "Subscriptions[].{email:Endpoint,arn:SubscriptionArn}"
```
**Good looks like:** each email has a real `arn:aws:sns:...` value. `PendingConfirmation` means nobody receives those alerts: the address owner clicks "Confirm subscription" in the AWS email. These are the AWS staging alerts; failures on the VM email `OPS_ALERT_EMAIL` through `run-job.sh`, so also confirm it is set on the VM (`grep -c "^OPS_ALERT_EMAIL=" .env` prints `1`).

**5. Owner decisions, now or before 10 Nov:** (a) the missed-month alert (nothing warns if a hand-import month is skipped), (b) whether to build the admin upload screen, (c) whether to ask the five largest blocked fund houses for official access or get a data-vendor quote. They are tracked in `DEFERRED_FEATURES.md`. Nothing here blocks the staging sign-off, but write the date each is decided in the run log.

## Section 16: `tests/test_migrations.py` hang check

On the **laptop** (not the VM), before running the migration tests on any machine:
```bash
echo $TEST_DATABASE_URL
```
**Good looks like:** the variable is set to a throwaway Postgres (for example `postgresql+psycopg2://unifolio:unifolio@localhost:5433/unifolio_test`) or is empty on purpose. L18: `tests/test_migrations.py` hangs under the shared venv (Python 3.14) in WSL and passes under system python; a suspected cause is a DB-driver connect attempt. If the test hangs, interrupt it, unset or fix `TEST_DATABASE_URL`, and rerun with system python. Not reproducible on the orchestrator's machine, so report what you see.

## Section 17: Smoke test

The owner signs up and clicks; the manager watches the logs: `sudo docker compose logs -f --since 1m backend`.
1. Sign up a new account on `https://ls-redesign.unifolio.in` (owner enters email and OTP).
2. Upload a synthetic statement from `Docs/CAS Files/synthetic/pdfs/realistic/` (password `MF@123`), confirm the people, finish import.
3. Click every page: Home, Portfolio, Mutual Funds (all tabs), Planning, Import, Profile (seven pages, four Settings children).
4. Open `https://ls-staging.unifolio.in`: Dashboard, Analytics, History still work.

**Good looks like:** no page errors, no 5xx in the logs, the numbers on the old link match the redesign link.

## Section 18: Owner's manual checklist (items 1 to 5)

1. **Profile T8 manual check** on a synthetic household from `Docs/CAS Files/synthetic/pdfs/realistic/` (password `MF@123`): all seven pages and four Settings children in light and dark; deep link and refresh on `/profile/family`; masked PAN everywhere and no full PAN in any network response; edit goals and investor type and see them persist; Add statement for a member opens import for that person and Back returns to Family; Delete member on a throwaway non-self member (the self card has no such button); contact-change dialog **up to the code step only**; **delete-account dialog up to the confirm step only, do not confirm**; Import History deletes nothing except throwaway data; the dev Import health link only with dev tools on; `ProfileNudge` warning colours in dark mode.
2. **Visual parity per page** against the mockups, light and dark, at 1280 and 1024 wide.
3. **The new Mutual Funds items:** units/NAV/folio ledger row; missed-SIP tooltip; asset-class drill; Overlap "What drives the overlap" section and the inclusive pairs list; the legacy parts: Compare Distributors button, no Export button, sold funds, coverage-gap banner, opening-balance dialog, post-import notice.
4. **Home news weights and the greeting link, and the L13 decision.** L13: a fund redeemed on the latest price date still counts in that day's change on Home (the sector view puts its amount in Other), unlike the old Dashboard's held-only gain. On a household that sold a fund on the latest price date, look at the Home day change and decide **keep** (consistent with the 1-day series) or **exclude**. Write the decision in the notes of checklist row C23 and in the register.
5. **Individual Fund links must be greyed** (the routes are placeholders).

The same items appear, with expected results, in groups C and D of the QA checklist.

## Section 19: Rollback

Read this before you start. Rollback covers the backend and worker images only.

```bash
./scripts/rollback.sh
```
Retags `leapswitch-backend:previous` and `leapswitch-worker:previous` to `:latest` and runs `docker compose up -d`; no rebuild. **Good looks like:** `Container leapswitch-backend-1 Started` and `leapswitch-worker-1 Started`, then `curl -s -o /dev/null -w "%{http_code}\n" https://ls-staging-api.unifolio.in/health` prints `200`. It exits with `no leapswitch-...:previous image found` if there is nothing to roll back to.

What it does **not** cover:
- **The front end.** It is static files on disk. To revert: `git -C /opt/unifolio-redesign checkout <previous-commit> -- frontend`, then `./scripts/deploy-redesign.sh`, then checkout the new commit again when retrying.
- **The migrations.** There is no downgrade step by design. 0044, 0045 and 0046 are additive and the old code runs on the new schema (checked at M1), so a backend rollback leaves them in place. If the database itself must be reverted, restore from the section 2 dump into a scratch container first (see `leapswitch-staging-deploy-guide.md`, Part 2); `restore.sh` is destructive and not for casual use.
- **Cron.** Reinstall the saved file: `sudo crontab /root/crontab.before-redesign.<date>` (the news lines then stop). Setting `NEWS_ENABLED=false` in `.env` and recreating the backend also stops news without a rollback.
- **Only one `:previous`** is kept: it is overwritten by every `deploy.sh` run. Do not run `deploy-redesign.sh --full` twice in a row if you may need to roll back.

## Section 20: QA checklist and sign-off

Now run the **Post-deploy staging QA checklist**: [`2026-10-27-staging-qa-checklist-redesign.md`](2026-10-27-staging-qa-checklist-redesign.md) (printable, self-contained; groups A deploy health, B data and jobs, C every page, D security and privacy, E regression, F rollback and known issues). Every row says what a failure means and who fixes it.

Known issues not to report as new bugs: L12 (flaky `DashboardView` XIRR popup test, CI only), L13 (a fund redeemed on the latest price date counts in that day's change; owner decides at Home parity), L20 (news tagger false positives on "X stocks of Y" phrases), L21 (`PLAIN_WORD_SYMBOLS` is hand picked); deferred: Individual Fund pages greyed, Mutual Funds backend asks not built (holdings export route, family-view coverage-gap route, optional analytics recompute after an opening-balance post), month modal tiles are all-member totals when a member is selected.

### Go / no-go sign-off (same block as the end of the checklist file)

**Rule:** any failed row blocks sign-off until it is fixed and re-run, or recorded as an owner-accepted Low. Group A rows and D2, D3, D4 cannot be accepted as Low.

| Group | Passed | Failed | Owner-accepted Low (row ids) |
|---|---|---|---|
| A Deploy health | | | |
| B Data and jobs | | | |
| C Every page | | | |
| D Security and privacy | | | |
| E Regression | | | |
| F Rollback and known issues | | | |

**Decision for the next stage:**  GO  /  NO-GO

Owner: ______________  Date: ____________  Initials: ________

Manager: ______________  Date: ____________  Initials: ________
