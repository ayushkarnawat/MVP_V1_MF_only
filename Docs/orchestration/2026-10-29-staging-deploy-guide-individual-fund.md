# Staging Deploy Guide: Individual Fund release (`leapswitch-redesign`) to `ls-redesign.unifolio.in`

Brings the redesign preview on the LeapSwitch/CloudPe VM up to the tip of **`leapswitch-redesign`** after the Individual Fund work is merged: the backend fund-page routes (17 routes under `/fund-page/...`, plan T2 to T14), IF-C (Overview and Insights go live on the real backend), IF-D (the Overlap tab with its comparison state, the third route live), IF-E (fund names on Home, Mutual Funds and Portfolio open the fund page), BE1 (an optional `scheme_id` on the Transactions ledger entries) and the AMC Allocation card small-screen fix (C178).

Modelled on `2026-10-27-staging-deploy-guide-redesign.md` (the manager's real-run fixes are kept: `sudo sh` for the deploy command, the news dry run needs news enabled, the backup goes to object storage). The printable test list for after the deploy is **`2026-10-29-staging-qa-checklist-individual-fund.md`** (same folder).

**What is merged.** Everything is merged into `leapswitch-redesign`: IF-C `f8db102e`, IF-D (PR #33) `f0982132`, IF-E (PR #34) `18044571`, and BE1 (PR #35). **Deploy the branch tip:** after the pull in section 1, run `git rev-parse HEAD`, deploy that commit and record the hash (it goes in the QA checklist header and row A2).

**Who runs what.** The manager runs this deploy **only through the manager's own Claude**, which is the sole executor: that Claude runs every VM command itself (SSH, backup, deploy, recompute, T14 timings, SQL checks) from the laptop's WSL and pastes each output to the manager with a verdict. The manager approves each GATE and does the browser and account steps (sign-in, OTP, deleting a throwaway user). The orchestrator cannot reach the VM and only checks pasted output against the expected results.

**Branch.** Deploy **`leapswitch-redesign` only**. Never `main`, never `feat/leapswitch-staging`.

**Where.** SSH to the VM (`deploy@202.66.174.251`; an SSH timeout, as opposed to a refusal, is the CloudPe Security Group IP allowlist, see the staging plan's Troubleshooting). VM layout: main clone `/opt/unifolio` (branch `feat/leapswitch-staging`) and the redesign worktree `/opt/unifolio-redesign` (branch `leapswitch-redesign`). **Every VM command runs in `/opt/unifolio-redesign/deploy/leapswitch`** unless it says otherwise. Backend and worker deploys run from the redesign worktree, never from the main clone.

**When.** Weekday, outside the cron windows: avoid 00:55 to 06:35 IST (batch jobs) and 08:00, 19:00 (account deletion, CAS expiry). `news-refresh` runs at :15 of 07, 10, 13, 16, 19, 22 and 23:30.

**Time.** About 1.5 hours including the analytics recompute (8 min 5 s on 27 Oct) and the two timed runs; the QA checklist is separate. The backend and worker restart briefly in step 10.

**What ships.**
- Backend: BE1 (the Transactions ledger entries gain an optional `scheme_id`; additive, no migration), the fund-page routes (read only; no new tables, no new jobs, nothing stored: plan spec section 11), the Overlap-tab routes, `lookthrough.py` with one new keyword parameter, and `scripts/measure_fund_page_staging.py` with `--scheme-filtered` (it ships in the backend image).
- Front end: Overview, Insights and Overlap routes live; fund names link to the fund page from Home (Movers, news "Why this?", Worth a look), Mutual Funds (Fund Details popup, SIP timeline, Allocation, Holdings, Overlap, Performance) and Portfolio (Quick Insights, largest holding).
- **No migration is expected. The Alembic head stays `0046`** (same as after the last redesign deploy). Nothing in this release adds a table or column.
- No new settings, no cron change. The stored analytics sections must be recomputed after the deploy (step 15), because the Insights overlap fact reads the stored overlap section.

## Prompt for the manager's Claude

Paste the whole block below into the manager's Claude (in the WSL terminal on the laptop) as the first message.

```text
You are executing the staging deploy guide "2026-10-29-staging-deploy-guide-individual-fund.md" (folder Docs/orchestration of the repo) on the LeapSwitch VM. You are the only executor: you run every command yourself, no one else types commands. The manager reads your output and approves gates.

FIRST: read the whole guide and the whole QA checklist "2026-10-29-staging-qa-checklist-individual-fund.md" before running anything. Then confirm in one line that you have read both.

HOW YOU CONNECT: from this laptop's WSL, with the SSH key held there: ssh deploy@202.66.174.251. The Windows side is refused: if you are not in WSL, stop and tell the manager. Run each VM command as: ssh deploy@202.66.174.251 "cd /opt/unifolio-redesign/deploy/leapswitch && <command>". For commands with quotes or several statements use: ssh deploy@202.66.174.251 'bash -s' <<'EOF' ... EOF (starting the script with cd /opt/unifolio-redesign/deploy/leapswitch). An SSH timeout (not a refusal) means the CloudPe Security Group IP allowlist: stop and report.

HOW YOU WORK:
1. Run ONE step of guide section 1 at a time. For each step paste to the manager: the exact command, the full output, and your verdict "matches expected" or "does NOT match expected" with the reason. You may run consecutive steps that have no GATE and no STOP condition hit without waiting; otherwise wait for the manager.
2. STOP and ask the manager for an explicit yes at every step marked GATE: before the backup, before the deploy, before any recompute job (including benchmark-daily), and before the T14 timing run. Never carry one yes over to another gate.
3. STOP immediately, run nothing else, and report if a step's STOP condition is met or the output does not match expected.
4. Never improvise commands that are not in the guide. If something unexpected happens, report it and ask; do not fix it yourself.
5. Database: only the read-only SQL listed in the guide (select statements). No inserts, updates, deletes, drops, and no alembic upgrade (this release has no migration).
6. No deletes of any file, image, container or volume. No changes to .env (the guide makes none). No crontab change (the guide makes none).
7. Never create accounts, never type or store passwords, OTPs or keys. Sign-in, sign-up, OTP and deleting a throwaway user are the manager's job in the browser: tell the manager exactly what to do and wait.
8. Never push, commit, edit or check out anything in the repo on the laptop or the VM, other than the git pull --ff-only in step 5. The deploy branch is leapswitch-redesign ONLY: never main, never feat/leapswitch-staging. If the branch on the VM is anything else, stop.
9. Use sudo exactly as written in the guide. If sudo asks for a password, stop; do not type one.

WHEN FINISHED: stop and give the final report in this exact format:
| Item | Value |
|---|---|
| Deployed commit (git rev-parse HEAD on the VM) | |
| alembic current (must print 0046 (head)) | |
| Backup file name in object storage | |
| Containers (docker compose ps: each service, state and health) | |
| Health URLs (3 codes, expect 200 200 200) | |
| Analytics recompute wall time | |
| benchmark-daily run? (only if V5 failed) | yes / no |
| T14: tier 1 / tier 2 / tier 3 first open / tier 3 second open (values and PASS/FAIL) | |
| V5 benchmark history (rows, span in years) | |
| V7 sector coverage (top rows pasted) | |
| Backend and worker error grep result | |
| Steps with a mismatch or STOP, and what you did | |
Then say: "Technical steps done; hand the QA checklist to the owner." Do not fill in the QA checklist yourself.
```

## Before you start

| Item | Needed in | Who |
|---|---|---|
| **The household's user UUID** (`<USER_UUID>`): the household used for the 23 Oct runs of the fund-page script | Steps 16 and 17 (T14) | Owner gives it to the manager, who gives it to Claude |
| The merge hash of PR #35 (BE1): `4cdf12a9` | Step 2 | Already filled in |
| **Free disk** of 5 GB or more | Step 4 | Claude checks; STOP if under 5 GB |
| **A household with real statements and at least two overlapping funds**, and the pair that Insights reports as overlapping (the "35%" pair) | QA checklist C11 | Owner |
| **A throwaway user** the manager can delete in the browser (V6, optional) | Step 19 | Manager |

## Section 1: Commands for the manager, in one block per step

Claude runs every block (wrapped for the VM as the prompt says). Each step lists the expected output and a **STOP** condition: on STOP, run nothing further and report to the manager. Steps marked **GATE** need the manager's explicit yes first. Steps 1 to 3 and 9 run on the laptop (WSL, in the repo clone), the others on the VM.

| Step | What | Gate |
|---|---|---|
| 1 to 3 | Laptop: tip, merges, CI | |
| 4 | VM pre-checks | |
| 5 | Pull | |
| 6 to 8 | Backup and current migration (must be `0046`) | GATE before 6 |
| 9 | No-migration proof | |
| 10 to 12 | `deploy-redesign.sh --full` and checks | GATE before 10 |
| 13 | V5 benchmark history, V7 sector coverage | |
| 14 | `benchmark-daily` (only if V5 failed) | GATE |
| 15 | Analytics recompute | GATE |
| 16 to 17 | T14 timings | GATE before 16 |
| 18 | Error grep | |
| 19 | V6 deletion check (optional) | |
| 20 | Sign-in and smoke check (manager, browser) | |
| 21 | Final report | |

### Step 1 (laptop): the tip
```bash
git fetch origin && git log -1 --format=%h origin/leapswitch-redesign
```
Expected: one short hash; record it as the tip. **STOP** if the fetch fails.

### Step 2 (laptop): the four merges are in
```bash
for c in ce10451d f8db102e f0982132 18044571 4cdf12a9; do git merge-base --is-ancestor $c origin/leapswitch-redesign && echo "$c in"; done
```
Expected: five `... in` lines (the AMC Allocation card small-screen fix C178, IF-C, IF-D, IF-E, BE1). The AMC card fix ships with this release; its checks are rows E1 and E2 of the QA checklist. **STOP** if any is missing.

### Step 3 (laptop): CI
```bash
gh run list --branch leapswitch-redesign --limit 3
```
Expected: green on the last code commit (a docs-only push may show no new run). **STOP** if the last code commit is red.

### Step 4 (VM): pre-checks, one command each
```bash
git rev-parse --abbrev-ref HEAD
```
Expected: `leapswitch-redesign`. **STOP** on anything else.
```bash
git log -1 --format=%h
```
Expected: a hash. Record it as `<LAST-DEPLOYED-COMMIT>` (steps 9 and rollback).
```bash
ls -l .env
```
Expected: a symlink to `/opt/unifolio/deploy/leapswitch/.env`.
```bash
df -h / | tail -1
```
Expected: at least 5 GB available (the build needs about 2.5 GB). **STOP** if under 5 GB; `sudo docker builder prune -f` frees build cache safely, but only on the manager's yes.
```bash
free -g | head -2
```
Expected: about 16 GB total.
```bash
grep -E "^(LS_REDESIGN_DOMAIN|MAIN_FRONTEND_DIST|REDESIGN_FRONTEND_DIST|ALLOWED_ORIGINS)=" .env
```
Expected: `REDESIGN_FRONTEND_DIST=/opt/unifolio-redesign/frontend/dist` and `MAIN_FRONTEND_DIST=/opt/unifolio/frontend/dist` (different); `ALLOWED_ORIGINS` contains `https://ls-staging.unifolio.in` and `https://ls-redesign.unifolio.in`. **STOP** if the two paths are equal or an origin is missing. Never print other lines of `.env` (secrets).

### Step 5 (VM): pull (run in `/opt/unifolio-redesign`)
```bash
cd /opt/unifolio-redesign && git status --short
```
Expected: prints nothing. **STOP** if it lists files (edited on the VM outside git; do not discard).
```bash
cd /opt/unifolio-redesign && git pull --ff-only
```
Expected: `Fast-forward` or `Already up to date.` **STOP** if it refuses.
```bash
cd /opt/unifolio-redesign && git rev-parse HEAD
```
Expected: the full hash starts with the tip from step 1. **Record it as the deployed commit** (QA checklist header and row A2). **STOP** if it differs.

### Step 6 (VM): backup. GATE: ask the manager's yes first
```bash
sudo ./scripts/backup.sh < /dev/null; echo "backup exit: $?"
```
Expected: no script output, then `backup exit: 0`. The dump is **not** on the VM disk: it is gzipped and uploaded to the CloudPe object-storage bucket (prefix `postgres/`, about 169 MB on 27 Oct 2026). Keep `< /dev/null`. **STOP** on a non-zero exit.

### Step 7 (VM): the dump is there
```bash
sudo sh -c '. ./.env; aws --profile cloudpe --endpoint-url "$OBJECT_STORAGE_ENDPOINT_URL" s3 ls "s3://$BACKUP_BUCKET_NAME/postgres/" | tail -3'
```
Expected: a dump stamped with the current time; record its file name for rollback. **STOP** if no fresh dump is listed.

### Step 8 (VM): current migration
```bash
sudo docker compose run --rm -T backend alembic current
```
Expected: `0046 (head)`. Use `run`, not `exec` (exec targets the possibly stale running container). **STOP** on anything else: this release must not need a migration.

### Step 9 (laptop): the new code adds no migration
```bash
git diff --stat <LAST-DEPLOYED-COMMIT> origin/leapswitch-redesign -- backend/alembic
```
Expected: prints nothing. **STOP** if it lists a revision file: the head is then no longer `0046`.

### Step 10 (VM): deploy. GATE: ask the manager's yes first
`--full` tags the running images `:previous`, builds the front end, then runs `docker compose up -d --build`:
```bash
sudo sh ./scripts/deploy-redesign.sh --full
```
Expected: the build ends `built in <N>s`, then `Container leapswitch-backend-1   Started` and `Container leapswitch-worker-1    Started` (`caddy` and `postgres` usually `Running`); about 3 to 4 minutes (27 Oct: 3 min 13 s). Run it **exactly** like this: the file is committed non-executable (`./scripts/deploy-redesign.sh` gives `Permission denied`, exit 126) and `deploy` is not in the docker group. Do **not** run a separate `docker tag ... :previous` first, and do **not** run `--full` twice in a row if a rollback may be needed (`deploy.sh` overwrites `:previous`). **STOP** if the build fails (nothing live changed; report, do not rerun without the manager's yes).

### Step 11 (VM): containers and images
```bash
sudo docker compose ps
```
Expected: postgres, backend, worker, caddy running, none restarting or unhealthy. **STOP** if unhealthy: run `sudo docker compose logs backend --tail 80`, report, and offer rollback (section 3); no rollback without the manager's yes.
```bash
sudo docker image ls | grep -E "leapswitch-(backend|worker)"
```
Expected: `:previous` and `:latest` for both.
```bash
sudo docker compose run --rm -T backend alembic current
```
Expected: `0046 (head)` still.

### Step 12 (VM): health URLs
```bash
for u in https://ls-staging-api.unifolio.in/health https://ls-redesign.unifolio.in/ https://ls-staging.unifolio.in/; do curl -s -o /dev/null -w "%{http_code}\n" "$u"; done
```
Expected: `200` three times. **STOP** on anything else.

### Step 13 (VM): V5 and V7 SQL (read only)
Source: `ui-redesign-IB-individual-fund-backend-handoff.md`, T14 command block. Send through `bash -s` so the quotes survive.
```bash
set -a; . ./.env; set +a
sudo docker compose exec -T postgres psql -U "$DB_USERNAME" "$DB_NAME" -c "select index_name, return_type, count(*), min(date), max(date) from benchmark_index_history where index_name in ('nifty_largemidcap_250','nifty_midcap_150') and return_type='tri' group by 1,2;"
```
Expected (V5): one row for each of `nifty_largemidcap_250` and `nifty_midcap_150`, `min(date)` to `max(date)` spanning **3 years or more**. If a row is missing or the span is shorter, do step 14 before step 15; otherwise skip step 14.
```bash
set -a; . ./.env; set +a
sudo docker compose exec -T postgres psql -U "$DB_USERNAME" "$DB_NAME" -c "select a.name, count(*) filter (where h.sector_raw is null) as no_raw_sector, count(*) filter (where s.sector is null) as no_master_sector from scheme_holdings h join disclosure_batches b on b.id=h.batch_id join schemes a on a.id=b.scheme_id left join stock_master s on s.isin=h.isin where b.status='written' group by 1 order by 2 desc limit 10;"
```
Expected (V7): up to ten schemes with missing-sector counts. **No numeric limit exists**: paste the numbers; the owner decides whether D7 (sector source precedence) needs a follow-up. Not a STOP.

### Step 14 (VM): benchmark job. GATE; only if V5 failed
Refreshes the stored index history the fund page's benchmark line reads (copied from the 27 Oct guide, section 9).
```bash
sudo ./scripts/run-job.sh benchmark-daily scripts/jobs/refresh_benchmark_daily.py
```
Expected: exit 0 and `refresh_benchmark_daily: fetches=16 succeeded=16 success=True` (27 Oct: all 8 TRI indices). Then repeat the V5 query of step 13: it must now pass. **STOP** if it fails again; report to the orchestrator (Backend).

### Step 15 (VM): analytics recompute. GATE: ask the manager's yes first
**Why:** the Insights overlap fact reads the **stored** overlap section, and the fund-page routes read stored sections. Without a recompute after `--full`, the 35% vs 18% check (QA row C11) compares stale data. Source: 27 Oct guide, section 9. Run outside 00:55 to 06:35 IST and 19:00.
```bash
sudo bash -c 'time ./scripts/run-job.sh analytics-recompute-all scripts/run_analytics_recompute.py --all'
```
Expected: exit 0 in **under 15 minutes** (27 Oct: 485 s); record the wall time. **STOP** on an error or a run past 15 minutes; do not rerun without the manager's yes. (One household: `... scripts/run_analytics_recompute.py --household <USER_UUID>`.)

### Step 16 (VM): T14 tiers 1 and 2. GATE: ask the manager's yes first
Source: IB handoff T14 and `Docs/superpowers/plans/2026-10-23-individual-fund-backend-plan.md`, Task 14. Read only (exits non-zero if a session commits); prints counts and milliseconds only.
```bash
sudo docker compose run --rm -T backend python scripts/measure_fund_page_staging.py --user-id <USER_UUID> --scheme-filtered --schemes 4 --runs 3 --simulate-fresh-cache
```
Expected: the script's own `PASS` lines: tier 1 under 300 ms (an estimate to confirm), each tier 2 call under 50 ms. **STOP** on a `FAIL`, a non-zero exit or a write error; paste the whole output.

### Step 17 (VM): T14 tier 3
```bash
sudo docker compose run --rm -T backend python scripts/measure_fund_page_staging.py --user-id <USER_UUID> --scheme-filtered --schemes 4 --runs 3 --include-score
```
Expected: `PASS`: first open of a category under 5 s, second open under 300 ms. **STOP** on `FAIL`: BDF13 (month-end rows chosen in SQL) comes before touching the cache design (plan T14 step 3); report to the orchestrator.

### Step 18 (VM): errors since the deploy
```bash
sudo docker compose logs --since 30m backend worker | grep -i -E "error|traceback|exception" | head -30
```
Expected: nothing, or lines Claude can explain (paste them). **STOP** on an unexplained traceback.

### Step 19 (VM): V6 deletion check (optional)
The manager deletes a **throwaway** user in the browser (never a real account) and gives Claude the deleted user id.
```bash
set -a; . ./.env; set +a
sudo docker compose exec -T postgres psql -U "$DB_USERNAME" "$DB_NAME" -c "select count(*) from analytics_sections where user_id = '<deleted user>'"
```
Expected: `0`. This release stores no new data, so it is a check only. **STOP** on a non-zero count.

### Step 20 (manager, browser): sign-in and smoke check
Claude tells the manager exactly what to do and waits; Claude never signs in.
1. Private window, `https://ls-redesign.unifolio.in`, hard refresh, sign in (the manager enters any OTP). Open a fund from the Planning "By family member" list: Overview opens; switch to Insights and Overlap.
2. A second profile, `https://ls-staging.unifolio.in`: Dashboard, Analytics, History unchanged; the same account works on both; no CORS errors in the console.

Expected: both load, no errors. A CORS error means `ALLOWED_ORIGINS` lacks `https://ls-redesign.unifolio.in`: report; do not edit `.env`.

### Step 21: final report
Claude posts the table from the prompt, then hands over (section 4).

## Section 2: Parity with the 27 Oct redesign guide

Every section of `2026-10-27-staging-deploy-guide-redesign.md`, and whether this release needs it:

| 27 Oct section | Needed now? | Where / why not |
|---|---|---|
| 0 Pre-checks | Yes | Steps 1 to 4 (the "no code moved" diff is replaced by the four-merge check) |
| 1 Branch and pull | Yes | Step 5 |
| 2 Backup and current migration | Yes | Steps 6 to 8; backup goes to object storage; head must already be `0046` |
| 3 Migrations 0044 to 0046 | No | Nothing adds a table or column; head stays `0046` (step 9 proves it) |
| 4 `deploy-redesign.sh` | Yes | Steps 10 to 12; `sudo sh`, `--full` |
| 5 Settings in `.env` | No | No new settings; the news and NSE settings from 27 Oct stay as they are |
| 6 News T9 | No | No news change in this release |
| 7 NSE symbol fill | No | Done on 27 Oct; unchanged |
| 8 Crontab reinstall | No | No cron change; already installed |
| 9 Recompute jobs | Yes | Step 15 (analytics recompute, so the stored overlap section is fresh); step 14 (`benchmark-daily`) only if V5 fails. Worth-a-look has no job of its own |
| 10 Sign-in check | Yes | Step 20, shortened |
| 11 XIRR fixture check | Yes | QA row C12 (cannot be accepted as Low) |
| 12 CAL1 thresholds | No | Worth-a-look thresholds are not changed here |
| 13 Planning script | No | Planning backend unchanged |
| 14 I2 timings | Replaced | By the fund-page T14 timings (steps 16, 17); L10 and L11 (Home) are not re-measured |
| 15 News calibration (L20, L21) | No | No news change |
| 15b Priority 1 factsheet access | No | Separate track, deadline 10 Nov 2026 |
| 16 `test_migrations.py` hang check | No | No tests run, no migration |
| 17 Smoke test | Yes | Step 20 and the QA checklist |
| 18 Owner's manual checklist | Yes | QA checklist groups C to E |
| 19 Rollback | Yes | Section 3 |
| 20 Checklist and sign-off | Yes | Section 4 |

## Section 3: Rollback (only on the manager's explicit yes)

```bash
sudo sh ./scripts/rollback.sh
```
Retags `leapswitch-backend:previous` and `leapswitch-worker:previous` to `:latest` and runs `docker compose up -d`; no rebuild. Expected: `Container leapswitch-backend-1 Started` and `leapswitch-worker-1 Started`; then `curl -s -o /dev/null -w "%{http_code}\n" https://ls-staging-api.unifolio.in/health` prints `200`. **STOP** on `no leapswitch-...:previous image found`: nothing to roll back to. (The 27 Oct guide wrote `./scripts/rollback.sh`; `sudo sh` is used here because `deploy-redesign.sh` needed it. NEEDS CHECK on first use.)

Not covered by it:
- **The front end** is static files on disk. Revert: `git -C /opt/unifolio-redesign checkout <LAST-DEPLOYED-COMMIT> -- frontend`, then `sudo sh ./scripts/deploy-redesign.sh` (front end only), then check the new commit out again when retrying. This edits the repo, so the manager must say yes.
- **The database:** no migration and nothing new is written, so nothing to revert. If it ever must be restored, use the step 7 dump in a scratch container (`leapswitch-staging-deploy-guide.md`, Part 2); `restore.sh` is destructive and not for casual use.
- Only one `:previous` image exists; every `deploy.sh` run overwrites it.

## Section 4: Hand the QA checklist to the owner, and sign-off

When the technical steps (section 1) are done and the final report is posted, hand the **QA checklist** to the owner: [`2026-10-29-staging-qa-checklist-individual-fund.md`](2026-10-29-staging-qa-checklist-individual-fund.md). It is printable and self-contained (step, how to check, expected, pass/fail/notes, initials) and ends with the sign-off block. The owner does the browser rows; Claude runs a VM command from the checklist only if the manager asks.

**Sign-off rule:** any failed row blocks sign-off until it is fixed and re-run, or recorded as an owner-accepted Low. Group A rows, the security row (F4) and C12 (Holdings lifetime XIRR) cannot be accepted as Low, and any failure in the fund page's money or percent numbers blocks sign-off.

## Section 5: Sources and gaps

Sources: `2026-10-28-orchestrator-handoff-6.md` section 3.3; `2026-10-27-staging-deploy-guide-redesign.md` (sections 2, 4, 9, 19); `ui-redesign-IB-individual-fund-backend-handoff.md` (T14 command block); `Docs/superpowers/plans/2026-10-23-individual-fund-backend-plan.md` (Task 14); register rows C174 and C175; packets `ui-redesign-IF-C-go-live-packet.md`, `ui-redesign-IF-D-overlap-tab-packet.md`, `ui-redesign-IF-E-fund-links-packet.md`.

Gaps and unresolved:
1. `rollback.sh` is committed non-executable (mode 100644), so `sudo sh ./scripts/rollback.sh` is used; the 27 Oct guide wrote the bare form, unproven.
2. Whether the fund page's benchmark line needs `benchmark-daily`: the sources name only the V5 check, so step 14 is conditional on V5.
3. The V5 query checks only two indices (`nifty_largemidcap_250`, `nifty_midcap_150`). Index funds get no benchmark (D16 of the plan; the owner may want a category exception).
4. The tier 1 limit (300 ms) is an estimate to confirm.
