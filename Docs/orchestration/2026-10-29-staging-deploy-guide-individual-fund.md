# Staging Deploy Guide: Individual Fund release (`leapswitch-redesign`) to `ls-redesign.unifolio.in`

Brings the redesign preview on the LeapSwitch/CloudPe VM up to the tip of **`leapswitch-redesign`** after the Individual Fund work is merged: the backend fund-page routes (17 routes under `/fund-page/...`, plan T2 to T14), IF-C (Overview and Insights go live on the real backend), IF-D (the Overlap tab with its comparison state, the third route live), IF-E (fund names on Home, Mutual Funds and Portfolio open the fund page) and the AMC Allocation card small-screen fix (C178).

Modelled on `2026-10-27-staging-deploy-guide-redesign.md` (the manager's real-run fixes are kept: `sudo sh` for the deploy command, the news dry run needs news enabled, the backup goes to object storage). The printable test list for after the deploy is **`2026-10-29-staging-qa-checklist-individual-fund.md`** (same folder).

**Status of this draft.** Written 29 Oct 2026 from the sources named at the end. The commit hash to deploy is not known yet: it is the `leapswitch-redesign` tip **after IF-E is merged** (section 0 records it). The orchestrator fills in `<TIP>` once it exists.

**Who runs what.** The orchestrator cannot reach the VM. The owner or the manager runs every command here and pastes the output; the orchestrator checks it against "Good looks like". Account creation, sign-in and password entry are always the owner's or the manager's.

**Branch.** Deploy **`leapswitch-redesign` only**. Never `main`, never `feat/leapswitch-staging`.

**Where.** SSH to the VM (`deploy@202.66.174.251`; an SSH timeout, as opposed to a refusal, is the CloudPe Security Group IP allowlist, see the staging plan's Troubleshooting). VM layout: main clone `/opt/unifolio` (branch `feat/leapswitch-staging`) and the redesign worktree `/opt/unifolio-redesign` (branch `leapswitch-redesign`). **Every command runs in `/opt/unifolio-redesign/deploy/leapswitch`** unless it says otherwise. Backend and worker deploys run from the redesign worktree, never from the main clone.

**When.** Weekday, outside the cron windows: avoid 00:55 to 06:35 IST (batch jobs) and 08:00, 19:00 (account deletion, CAS expiry). `news-refresh` runs at :15 of 07, 10, 13, 16, 19, 22 and 23:30.

**Time.** About 1 hour (a build of 3 to 4 minutes and two timed runs; the QA checklist is separate). The backend and worker restart briefly in section 4.

**What ships.**
- Backend: the fund-page routes (read only; no new tables, no new jobs, nothing stored: plan spec section 11), the Overlap-tab routes, `lookthrough.py` with one new keyword parameter, and `scripts/measure_fund_page_staging.py` with `--scheme-filtered` (it ships in the backend image).
- Front end: Overview, Insights and Overlap routes live; fund names link to the fund page from Home (Movers, news "Why this?", Worth a look), Mutual Funds (Fund Details popup, SIP timeline, Allocation, Holdings, Overlap, Performance) and Portfolio (Quick Insights, largest holding).
- **No migration is expected. The Alembic head stays `0046`** (same as after the last redesign deploy). Nothing in this release adds a table or column.
- No new settings, no cron change.

## Before you start: what the owner supplies

| Item | Needed in | Who |
|---|---|---|
| **The household's user UUID** (`<USER_UUID>`): the household used for the 23 Oct runs of the fund-page script | Section 5 | Owner gives it to the manager |
| **Free disk** of 5 GB or more | Section 0 | Manager; stop and tell the owner if under 5 GB |
| **A household with real statements and at least two funds that overlap**, and the names of the fund pair that Insights reports as overlapping (the "35%" pair) | The QA checklist (the overlap agreement row) | Owner |

## Order of steps

| Section | What |
|---|---|
| 0 | Pre-checks |
| 1 | Branch and pull |
| 2 | Backup and current migration (must already be `0046`) |
| 3 | No migration step |
| 4 | `deploy-redesign.sh --full` |
| 5 | **T14 timings** (two commands) |
| 6 | **SQL checks**: benchmark history (V5) and sector coverage (V7) |
| 7 | Smoke test and QA checklist link |
| 8 | Rollback |
| 9 | Sign-off |

---

## Section 0: Pre-checks

On your laptop:
```bash
git fetch origin
git log -1 --format=%h origin/leapswitch-redesign
git merge-base --is-ancestor <IF-E-MERGE-COMMIT> origin/leapswitch-redesign && echo if-e-in
gh run list --branch leapswitch-redesign --limit 3
```
**Good looks like:** a short hash (record it as `<TIP>`), `if-e-in`, and CI green on the last code commit (a docs-only push may show no new run). `<IF-E-MERGE-COMMIT>` is not known yet (open question 1); if IF-E is not merged, stop: this guide covers the release with IF-E.

On the VM:
```bash
ssh deploy@202.66.174.251
cd /opt/unifolio-redesign/deploy/leapswitch
git rev-parse --abbrev-ref HEAD
git log -1 --format=%h
ls -l .env
df -h / | tail -1
free -g | head -2
grep -E "^(LS_REDESIGN_DOMAIN|MAIN_FRONTEND_DIST|REDESIGN_FRONTEND_DIST|ALLOWED_ORIGINS)=" .env
```
**Good looks like:** `leapswitch-redesign`; write down the hash from `git log -1` as `<LAST-DEPLOYED-COMMIT>` (used in sections 3 and 8); `.env` a symlink to `/opt/unifolio/deploy/leapswitch/.env`; at least 5 GB free (the build needs about 2.5 GB); `REDESIGN_FRONTEND_DIST=/opt/unifolio-redesign/frontend/dist` and `MAIN_FRONTEND_DIST=/opt/unifolio/frontend/dist` (they must differ); `ALLOWED_ORIGINS` containing both `https://ls-staging.unifolio.in` and `https://ls-redesign.unifolio.in`.

**If the branch is anything else:** stop. `deploy-redesign.sh` also refuses to run on any other branch.

## Section 1: Branch and pull

```bash
cd /opt/unifolio-redesign
git status --short
git pull --ff-only
git log -1 --format="%h %s"
cd deploy/leapswitch
```
**Good looks like:** `git status --short` prints nothing; the pull ends `Fast-forward` (or `Already up to date.`); the last commit hash equals `<TIP>` from section 0.

**If the pull refuses:** something was edited on the VM outside git. Run `git status`, do not discard blindly, tell the orchestrator.

## Section 2: Backup and current migration

```bash
sudo ./scripts/backup.sh < /dev/null
echo "backup exit: $?"
sudo sh -c '. ./.env; aws --profile cloudpe --endpoint-url "$OBJECT_STORAGE_ENDPOINT_URL" s3 ls "s3://$BACKUP_BUCKET_NAME/postgres/" | tail -3'
sudo docker compose run --rm -T backend alembic current
```
**Good looks like:** the backup script exits 0 and prints nothing (it logs to `/var/log/unifolio-backup.log` only from cron). **The dump is not on the VM's disk:** it is gzipped and uploaded to the CloudPe object-storage bucket (prefix `postgres/`, about 169 MB on 27 Oct 2026) and the local copy is deleted. The `s3 ls` line must show a dump stamped with the current time; note its file name for rollback. Keep `< /dev/null`. `alembic current` must print `0046 (head)` (the last redesign deploy applied it). **Anything else here is wrong:** stop and tell the orchestrator; this release must not need a migration.

Use `docker compose run`, not `exec`: `exec` targets the existing container, which may be stale.

## Section 3: No migration step

There is no `alembic upgrade head` in this release. To check that the new code adds none, on your laptop:
```bash
git diff --stat <LAST-DEPLOYED-COMMIT> origin/leapswitch-redesign -- backend/alembic
```
**Good looks like:** it prints nothing. If it lists a new revision file, stop and tell the orchestrator: the head is then no longer `0046` and the previous guide's section 3 applies.

## Section 4: `deploy-redesign.sh --full`

This release changes the backend, so use `--full` (it tags the running backend and worker images `:previous`, builds the front end, then runs `docker compose up -d --build`):
```bash
sudo sh ./scripts/deploy-redesign.sh --full
```
**Run it exactly like this, not `./scripts/deploy-redesign.sh`.** The file is committed without the executable bit, so the second form fails with `Permission denied` (exit 126), and the `deploy` user is not in the docker group, so it needs `sudo`. Check the disk first (`df -h /`, 5 GB free); `sudo docker builder prune -f` frees the build cache safely. Do **not** run a separate `docker tag ... :previous` step: `deploy.sh` does it itself, and a second tag after the build would overwrite the rollback image. Do not run `--full` twice in a row if you may need to roll back; before a second run keep the images: `sudo docker tag leapswitch-backend:previous leapswitch-backend:pre-individual-fund` and the same for `leapswitch-worker`. The last run (27 Oct 2026) took 3 min 13 s.

**Good looks like:** the build ends with `built in <N>s`, then
```
 Container leapswitch-backend-1   Started
 Container leapswitch-worker-1    Started
```
(`caddy` and `postgres` usually say `Running`). With `--full` the script hands over to `deploy.sh`, so the front-end-only "redesign bundle built at ..." line is not printed.

```bash
sudo docker compose ps
sudo docker image ls | grep -E "leapswitch-(backend|worker)"
sudo docker compose run --rm -T backend alembic current
curl -s -o /dev/null -w "%{http_code}\n" https://ls-staging-api.unifolio.in/health
curl -s -o /dev/null -w "%{http_code}\n" https://ls-redesign.unifolio.in/
curl -s -o /dev/null -w "%{http_code}\n" https://ls-staging.unifolio.in/
```
**Good looks like:** all services running; `leapswitch-backend:previous` and `leapswitch-worker:previous` next to `:latest`; `0046 (head)` still; `200` three times.

**If the build fails:** nothing live changed (`backend` and `worker` keep the old image). Fix and rerun. **If a container is unhealthy:** `sudo docker compose logs backend --tail 80`, then section 8.

## Section 5: T14 timings (two commands)

Source: `ui-redesign-IB-individual-fund-backend-handoff.md`, section "T14", and `Docs/superpowers/plans/2026-10-23-individual-fund-backend-plan.md`, Task 14. The script is read only (it exits non-zero if a session commits) and prints counts and milliseconds only, no names or amounts. Replace `<USER_UUID>` with the household's UUID.

```bash
cd /opt/unifolio-redesign/deploy/leapswitch
docker compose run --rm -T backend python scripts/measure_fund_page_staging.py --user-id <USER_UUID> --scheme-filtered --schemes 4 --runs 3 --simulate-fresh-cache
docker compose run --rm -T backend python scripts/measure_fund_page_staging.py --user-id <USER_UUID> --scheme-filtered --schemes 4 --runs 3 --include-score
```
(Put `sudo` in front if your user is not in the docker group, as in section 4.)

**Good looks like (the script's own `PASS` / `FAIL` lines against these limits):**

| Tier | What is timed | Limit |
|---|---|---|
| 1 | `compute_holdings` filtered to one scheme, cold and warm, per sampled fund | under 300 ms (an estimate to confirm) |
| 2 | each new service function | each call under 50 ms |
| 3 (needs `--include-score`) | `category_series`, `category_returns`, `rolling_returns`, `risk_return_scatter` and `build_score` through `peer_cache`: first open of a category | under 5 s |
| 3 | second open of the same category | under 300 ms |

**If tier 3 misses:** apply BDF13 (month-end rows chosen in SQL) before touching the cache design (plan T14 step 3). Paste both outputs to the orchestrator.

## Section 6: SQL checks (benchmark history and sector coverage)

Copied exactly from the IB handoff T14 command block. They are read only.
```bash
set -a; . ./.env; set +a
docker compose exec -T postgres psql -U "$DB_USERNAME" "$DB_NAME" -c "select index_name, return_type, count(*), min(date), max(date) from benchmark_index_history where index_name in ('nifty_largemidcap_250','nifty_midcap_150') and return_type='tri' group by 1,2;"
docker compose exec -T postgres psql -U "$DB_USERNAME" "$DB_NAME" -c "select a.name, count(*) filter (where h.sector_raw is null) as no_raw_sector, count(*) filter (where s.sector is null) as no_master_sector from scheme_holdings h join disclosure_batches b on b.id=h.batch_id join schemes a on a.id=b.scheme_id left join stock_master s on s.isin=h.isin where b.status='written' group by 1 order by 2 desc limit 10;"
```
**Pass criteria (IB handoff T14):**
- **V5, benchmark history:** both indices (`nifty_largemidcap_250`, `nifty_midcap_150`) return a row for return type `tri`, and `min(date)` to `max(date)` spans **3 years or more**.
- **V7, sector coverage:** the second query lists the ten schemes with the most holdings that lack a raw sector, and how many lack a master sector. **The sources give no numeric limit**: it is for the record, and the owner decides whether decision D7 (sector source precedence) needs a follow-up. Paste both results to the orchestrator.
- **V6, account deletion leaves nothing** (handoff V6, plan T14 step 4): after an account deletion in the test household, `select count(*) from analytics_sections where user_id = '<deleted user>'` must print `0`. This release stores no new data, so it is a check only; it needs a deleted throwaway account (never delete a real one for it).

## Section 7: Smoke test and QA

1. Open `https://ls-redesign.unifolio.in` in a private window and hard refresh; the owner signs in. Open a fund from the Planning "By family member" list: the Overview opens; switch to Insights and Overlap.
2. Open `https://ls-staging.unifolio.in` in a second profile: Dashboard, Analytics, History unchanged.
3. `sudo docker compose logs --since 15m backend worker | grep -i -E "error|traceback|exception" | head -30` shows nothing unexplained.
4. Run the **QA checklist**: [`2026-10-29-staging-qa-checklist-individual-fund.md`](2026-10-29-staging-qa-checklist-individual-fund.md).

## Section 8: Rollback

```bash
./scripts/rollback.sh
```
Retags `leapswitch-backend:previous` and `leapswitch-worker:previous` to `:latest` and runs `docker compose up -d`; no rebuild. **Good looks like:** `Container leapswitch-backend-1 Started` and `leapswitch-worker-1 Started`, then `curl -s -o /dev/null -w "%{http_code}\n" https://ls-staging-api.unifolio.in/health` prints `200`. It exits with `no leapswitch-...:previous image found` if there is nothing to roll back to.

Not covered by it:
- **The front end** is static files on disk. Revert: `git -C /opt/unifolio-redesign checkout <LAST-DEPLOYED-COMMIT> -- frontend`, then `sudo sh ./scripts/deploy-redesign.sh` (front end only), then check the new commit out again when retrying.
- **The database:** this release has no migration and writes nothing new, so there is nothing to revert. If it ever must be restored, use the section 2 dump in a scratch container (`leapswitch-staging-deploy-guide.md`, Part 2); `restore.sh` is destructive and not for casual use.
- Only one `:previous` image exists; every `deploy.sh` run overwrites it.

## Section 9: Sign-off

The sign-off block is at the end of the QA checklist. **Rule:** any failed row blocks sign-off until it is fixed and re-run, or recorded as an owner-accepted Low. Group A rows and the security row cannot be accepted as Low.

## Sources

`2026-10-28-orchestrator-handoff-6.md` section 3.3; `2026-10-27-staging-deploy-guide-redesign.md`; `ui-redesign-IB-individual-fund-backend-handoff.md` (T14); `Docs/superpowers/plans/2026-10-23-individual-fund-backend-plan.md` (Task 14); packets `ui-redesign-IF-C-go-live-packet.md`, `ui-redesign-IF-D-overlap-tab-packet.md`, `ui-redesign-IF-E-fund-links-packet.md`.

## Open questions (not resolved by the sources)

1. **The commit to deploy** (`<TIP>`) and the IF-E merge commit are not known until IF-E is merged; the guide leaves placeholders.
2. **The second T14 command.** The handoff gives `--simulate-fresh-cache` on the first command and `--include-score` on the second; both are copied as written (the second does not repeat `--simulate-fresh-cache`). The sources do not say whether the first command alone covers tier 3 cold; confirm from the output.
3. **No numeric limit for V7** (sector coverage) is stated anywhere; the check is informational and the owner decides on D7.
4. **V6** needs a deleted test account; the sources do not say who deletes it or when.
5. **The benchmark query checks only two indices** (`nifty_largemidcap_250`, `nifty_midcap_150`); the sources name no others. Index funds get no benchmark (D16; the owner may want a category exception).
6. **Final alembic head after IF-E:** no source states it; the section 3 `git diff` is the check.
