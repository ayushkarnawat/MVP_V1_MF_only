# Staging Deploy Guide M1: Batch B (sign-up and sign-in journey) and Batch C (holdings hygiene) to `ls-redesign.unifolio.in`

**DRAFT, not frozen.** Written 18 Nov 2026 from the code on `batch/b-journey` and `batch/c-hygiene`. **Nothing here is run until the owner says go.** It becomes final when: Batch B's emails (B-9) are built and reviewed, both whole-batch reviews are done and their findings dealt with, both batches are merged into `leapswitch-redesign`, and the merge is tagged `m1-rc`. Every `<...>` and every "fill at freeze" is filled then. After the deploy there is **no QA round**: only the quick verify in step 9. The single combined QA happens once after M4.

## What changes
**Batch B (sign-up and sign-in)**
1. Login and sign-up code requests: a wait-time line under the button with a live countdown, taken from the server's seconds (`retry_after_seconds`). Disabled button text `#717171` on `#DFDFDF`.
2. A new guard on the three code-request routes (phone OTP, email OTP, sign-up email): one network address may try at most **30 different recipients** and ask for at most **10 different codes** in any 10 minutes. Over the limit the answer is `429` with the sentence "Too many attempts from this network. Try again in N minutes." (singular "minute" for 1). Addresses and recipients are stored only as keyed hashes; one row per address and recipient; rows older than 24 hours are purged nightly at 03:15 IST.
3. One stored form for a phone number (`+91XXXXXXXXXX`): any accepted spelling is turned into it before the account lookup, the 60-second resend rule and the guard.
4. The wrong-person warning block on the import screen; the "You're all set" spinner that becomes a tick; onboarding option A (grouped list, two-column goals, green switch); the palette greens.
5. The four Head of Family emails in the new branded layout (light and dark), with the new images under `/email/`.

**Batch C (holdings hygiene)**
6. The "Assumed main manager" line is gone from the fund-manager card.
7. The category donut merges spellings of one category (for example "Scheme" and "Schemes", Sectoral and Thematic). Needs the stored-results rebuild in step 8.
8. The full folio number everywhere a folio is shown, with one eye icon that hides or shows all of them (remembered per browser, default shown), and a Copy button that is dimmed while hidden. The old masked fields stay in the responses.
9. After an import: Family Combined when the household grew, the chosen person for a wrong-person import, no stale member list. Add data waits for the fresh member list.

**Not in this release:** the phone (mobile) screens are untouched (no phone screen shows a folio number; checked 18 Nov), no analytics events, no speed work, no number fixes (those are M2).

## Facts that decide this guide
- **Back end, front end and one migration.** Alembic goes from **0053 to 0054** (`0054_auth_request_guard`: one new table, `auth_request_guard`, with one index; no existing table or column changes). **Additive only**: no response field was removed or renamed; the old link `ls-staging.unifolio.in` shares this back end and database and keeps working. What the old link sees: the three `429` bodies gain the keys `code` and `retry_after_seconds` beside the unchanged `detail`; a stopped sign-up no longer leaves a half-created pending record; nothing else.
- **New setting `AUTH_GUARD_SECRET` (required).** Empty means the guard is skipped (one error line per process) on staging; production refuses to start without it. Limits and the off switch are optional (`AUTH_GUARD_CHECK_LIMIT=30`, `AUTH_GUARD_CODE_LIMIT=10`, `AUTH_GUARD_WINDOW_MINUTES=10`, `AUTH_GUARD_ENABLED=false`).
- **Deploy mode is `--full`.** The back end changed, so `deploy-redesign.sh --full` rebuilds the back end and worker image (about 2 GB each; the script wants 10 GB free) and builds the front end. Caddy and Postgres are not restarted.
- **The email images live in the front end bundle** (`frontend/public/email/`, 22 files). They go live with the front end build in the same deploy. Emails sent before that would show broken pictures, so no Head of Family action should be tried until step 8 passes.
- **Postgres was exercised on 18 Nov**: the guard tests, migration 0054 up and down, and a concurrency test (12 simultaneous requests at a limit of 4 let exactly 4 through) ran on a throwaway Postgres 16 container.
- **Stored numbers:** the category merge changes labels in the stored analytics. The cron already runs `analytics-recompute-all` at 06:30 every day; step 8 runs it once now so the donut is right at once. Not inside the job windows (05:40 to 06:35, 10:30, 14:00 to 14:15).
- Phone code, Batch A and Batch L are not part of M1 (A and L ship nothing).

## Prompt for the executing Claude
```
You are deploying milestone M1 (Batch B and Batch C) to the LeapSwitch staging VM (ls-redesign.unifolio.in). Read Docs/orchestration/2026-11-18-staging-deploy-guide-m1.md and follow it step by step.
Rules: run one command at a time and show its output; at every STOP, stop and report; run nothing that changes the VM before the step that says GATE and the owner's yes; never print .env lines (the guide counts a line, it never shows one); never run clean-db.sh, restore.sh or rollback.sh on your own initiative; use ssh by hostname from WSL only.
At the end fill in step 10 and give the owner the report.
```

## Section 1: steps

### Step 0 (laptop): freeze. The owner's yes first
Batch B and Batch C are merged into `leapswitch-redesign`, then:
```bash
git tag m1-rc && git fetch origin && git push origin leapswitch-redesign m1-rc
```
**Never force-push.** Record the tagged head as `<FINAL-COMMIT>`. Nothing else merges into `leapswitch-redesign` until this deploy is checked.

### Step 1 (laptop): the release touches only what it should
```bash
git diff --name-only <LAST-DEPLOYED-COMMIT> m1-rc | grep -vE "^Docs/|\.test\.tsx?$|^backend/tests/"
```
Expected groups only: `backend/app/**` (auth, analytics allocation, dashboard, fund page, investment withdrawal, models, config, main, scripts), `backend/alembic/versions/0054_auth_request_guard.py`, `backend/scripts/preview_emails.py`, `deploy/leapswitch/{.env.example,crontab.leapswitch}`, `frontend/public/email/*.png` (22 files) and `frontend/src/**` outside `mobile/`. **STOP** on a second migration, a dependency file change, anything under `frontend/src/mobile/`, or anything in `app/` the list above does not explain.

### Step 2 (laptop): CI and evidence
```bash
gh run list --branch leapswitch-redesign --limit 3
```
Expected: green on `<FINAL-COMMIT>`. Local evidence to record at freeze: back end (guard, auth, analytics, migrations) `<N>` passed; Postgres run `<N>` passed; front end `<N>` passed (`<N>` files), types clean, lint 0 errors. **STOP** if the last code commit is red.

### Step 3 (VM): pre-flight, read-only
```bash
cd /opt/unifolio-redesign && git rev-parse --abbrev-ref HEAD && git log -1 --format=%h && git status --short
df -h / | tail -1
sudo docker image ls leapswitch-backend --format '{{.Tag}} {{.ID}} {{.CreatedSince}}'
sudo docker compose -f /opt/unifolio-redesign/deploy/leapswitch/docker-compose.yml run --rm -T backend alembic current
date '+%H:%M IST'
```
Expected: branch `leapswitch-redesign`; the last deployed commit (record it as `<LAST-DEPLOYED-COMMIT>`, the rollback target); no status lines; **at least 12 GB free** (the 16 Nov deploy began at 7.6 GB and needed `docker builder prune -f` and removing an old `:previous` to reach 12 GB: if short, ask the owner before pruning, and say which images are going); a `latest` image listed; `alembic current` ends `0053 (head)`; the time is **not** within 05:40 to 06:35, 10:30 to 10:40 or 14:00 to 14:15 IST. **STOP** on any miss.

### Step 4 (VM): rollback safety, before anything is built. GATE
Tag the running image so a rollback image exists (the 16 Nov build lost it), then take an on-demand backup and save the crontab:
```bash
cd /opt/unifolio-redesign/deploy/leapswitch
sudo docker tag leapswitch-backend:latest leapswitch-backend:previous
sudo docker image ls leapswitch-backend --format '{{.Tag}} {{.ID}}'
sudo /opt/unifolio/deploy/leapswitch/scripts/backup.sh
sudo crontab -l > /home/deploy/crontab.before-m1-2026-11
```
Expected: `previous` and `latest` show the same image id; the backup script ends without an error email (check `tail -5 /var/log/unifolio-backup.log`); the crontab file is not empty. **STOP** if the backup failed: no deploy without a backup of that day.

### Step 5 (VM): the new setting. GATE (changes `.env`)
The real file is `/opt/unifolio/deploy/leapswitch/.env` (the redesign `.env` is a symlink to it). **Never print the line.**
```bash
cd /opt/unifolio/deploy/leapswitch
grep -c '^AUTH_GUARD_SECRET=.' .env
```
Expected: `0` (not set yet). If `1`, skip the rest of this step. Otherwise:
```bash
cp -p .env .env.bak-2026-11-m1
printf 'AUTH_GUARD_SECRET=%s\n' "$(openssl rand -hex 32)" >> .env
grep -c '^AUTH_GUARD_SECRET=.' .env
```
Expected: `1`. A permission error means use `sudo tee -a .env > /dev/null` for the append. **STOP** if the count is not exactly 1 (a duplicate line is a defect; restore from the backup file and report).

### Step 6 (VM): switch to the tag
```bash
cd /opt/unifolio-redesign && git fetch origin && git checkout -B leapswitch-redesign m1-rc && git rev-parse HEAD
```
Expected: the full hash equals `<FINAL-COMMIT>`. **STOP** if not.

### Step 7 (VM): deploy, then migrate. GATE: the owner's yes first
```bash
cd /opt/unifolio-redesign/deploy/leapswitch && sudo sh ./scripts/deploy-redesign.sh --full
```
Expected: exit 0; "built in N s"; backend and worker recreated; caddy and postgres untouched. If it stops at the disk guard: no `--force` without the owner's yes. Then check the **new** image is the one running, before migrating (the 3 Nov deploy migrated while old code was still up):
```bash
sudo docker compose ps --format '{{.Service}} {{.Image}} {{.Status}}'
sudo docker image ls leapswitch-backend --format '{{.Tag}} {{.ID}}'
```
Expected: `latest` has a **new** id and the backend and worker run `leapswitch-backend:latest`; `previous` is still the old id. Then, and only then:
```bash
sudo docker compose run --rm backend alembic upgrade head
sudo docker compose run --rm -T backend alembic current
```
Expected: `0054 (head)`. **STOP** if the deploy failed, if `latest` and `previous` show the same id, or if the migration errors (report it; the code runs without the table, the guard fails open and logs a warning, so there is no outage; do not retry blindly).

### Step 8 (VM): cron line and the stored-results rebuild
```bash
(sudo crontab -l; echo '15 3 * * * $RUN auth-guard-cleanup -m app.scripts.clean_auth_guard') | sudo crontab -
sudo crontab -l | grep -c 'auth-guard-cleanup'
```
(`$RUN` is defined at the top of the installed crontab; the single quotes keep it unexpanded.) Expected: `1`. Then the rebuild, once, outside the job windows:
```bash
cd /opt/unifolio-redesign/deploy/leapswitch && sudo sh /opt/unifolio/deploy/leapswitch/scripts/run-job.sh analytics-recompute-m1 scripts/run_analytics_recompute.py --all
```
Expected: exit 0 and the script's own counts. **STOP** on a nonzero exit (run-job.sh emails the failure; report it).

### Step 9 (VM and laptop): quick verify (a smoke check, not the QA)
Health, both domains, and the old link:
```bash
cd /opt/unifolio-redesign/deploy/leapswitch && sudo docker compose ps
for u in https://ls-staging-api.unifolio.in/health https://ls-redesign.unifolio.in/ https://ls-staging.unifolio.in/ https://ls-redesign.unifolio.in/email/logo-light.png; do curl -s -o /dev/null -w "%{http_code} %{content_type}\n" "$u"; done
sudo docker compose logs backend --since 15m | grep -c "Auth request guard skipped"
```
Expected: postgres, backend, worker, caddy running and healthy; `200`, `200`, `200`, `200 image/png`; the last count is `0`.

The guard cannot be tricked with a forged header (from the laptop's WSL; 31 requests for recipients that do not exist, so **no email or text is sent**; each carries a different made-up forwarded address):
```bash
for n in $(seq 1 31); do curl -s -o /dev/null -w "%{http_code} " -X POST https://ls-staging-api.unifolio.in/auth/email-otp/request -H 'Content-Type: application/json' -H "X-Forwarded-For: 203.0.113.$n" -d "{\"email\":\"m1check$n@example.com\",\"flow\":\"login\"}"; done; echo
```
Expected: thirty `404` then one `429` (the real address is counted, not the forged ones). If all 31 are `404` the forged header was believed: **STOP and report**, the guard is not protecting. Wait 10 minutes before any real sign-in test from the same network (the 31 attempts count against it), or run them from another network.

Then the owner opens, in a private window, `https://ls-redesign.unifolio.in/`: sign-up and log-in screens open; onboarding fits without scrolling; Mutual Funds holdings shows the full folio with the eye; Analytics shows the category donut with no two labels differing only by "Scheme"/"Schemes". **Defects noticed here go on the QA list; they do not stop the deploy unless the deploy itself is broken.**

Read-only check that merged category names exist in the data (prints names only, no household data):
```bash
cd /opt/unifolio-redesign/deploy/leapswitch && sudo docker compose run --rm -T backend python -c "
from app.db.session import SessionLocal
from app.models.reference import Scheme
from app.services.analytics.scheme_universe import canonical_category
from collections import defaultdict
db=SessionLocal(); g=defaultdict(set)
for (c,) in db.query(Scheme.sebi_category).distinct(): g[canonical_category(c)].add(c)
print('categories:',len(g)); [print(k,'<-',sorted(v)) for k,v in g.items() if len(v)>1]"
```

### Step 10: record (Claude fills this in)
Deployed commit, last deployed commit, image ids before and after, build time, backup file name and size, migration result, the 31-request result, health codes, free disk before and after, anything that surprised. Write it as `Docs/orchestration/2026-11-<day>-staging-deploy-record-m1.md` in the 16 Nov record's shape, with an honest list of what is not as hoped.

## Section 2: rollback (only on the owner's yes)
- **Front end:** `cd /opt/unifolio-redesign && git checkout -B leapswitch-redesign <LAST-DEPLOYED-COMMIT>` then `cd deploy/leapswitch && sudo sh ./scripts/deploy-redesign.sh`.
- **Back end:** `cd /opt/unifolio-redesign/deploy/leapswitch && sudo sh ./scripts/rollback.sh` (points `latest` back at the `previous` image tagged in step 4, restarts the back end and worker). **Check the image id first**: `previous` must be the id recorded in step 4.
- **Migration:** nothing to undo for a code rollback. The old code ignores `auth_request_guard`; leaving it costs nothing. Only on the owner's explicit yes: `sudo docker compose run --rm backend alembic downgrade 0053` (drops the table; the downgrade was tested up and down on 18 Nov).
- **Cron and setting:** restore the crontab with `sudo crontab /home/deploy/crontab.before-m1-2026-11`; the extra `AUTH_GUARD_SECRET` line can stay (the old code does not read it).
- **Stored results:** run the step 8 rebuild again after a rollback (names may revert).
- No `clean-db.sh`, no `restore.sh` unless the owner decides the database itself is damaged (it is not expected to be: the migration only adds a table).
