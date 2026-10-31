# G2 timing run: the exact steps for the manager (read-only, about 30 minutes)

**Why.** Run 2 changes the Home, benchmark and analytics code. The plan says no analytics script may end up more than 10% slower than today. That claim needs a "before" number measured on the real VM. On 30 Oct the Home and benchmark-matrix timings could not be measured (that day's prices were not stored, and the scripts stop on any write). This run produces them. **Run 2 does not start until this is done** (or the owner says otherwise in writing).

**When.** On a trading day (Mon to Fri, not an exchange holiday), **after 06:35 IST**, so the morning price job has stored today's prices. Do not run on a weekend: the scripts will stop with "read-only" errors.

**Rules (do not skip).**
- Every script here only reads. **Never add `--allow-nav-writes` or `--include-live-fetch`.** If a script stops with a read-only or "write attempt" message, stop, copy the message, and send it back. Do not add flags to get past it.
- Never run `clean-db.sh`, `restore.sh`, `rollback.sh` or a deploy. Never stop a running recompute.
- Never edit files on the VM. Send results back as text; the output contains only counts and milliseconds, no names or amounts.

## Step 1: pick the test user and check the VM is ready
Use the same shell and the same folder you used for the 30 Oct timing session (the one where `sudo docker compose run --rm -T backend python scripts/...` works). Use the household that has real statements and was recomputed on 30 Oct. Call its id `<USER_ID>`.

1. **Today's prices are stored** (run in the database shell you used on 30 Oct): `SELECT max(date) FROM nav_history;` The answer must be **today's date** (or the last trading day if the job has not run, in which case wait and re-check). If it is older, stop: do not run the scripts.
2. **No recompute is running** and the user was recomputed: `SELECT user_id, started_at, generation FROM analytics_recompute_status WHERE user_id = '<USER_ID>';` If `started_at` is within the last 15 minutes a recompute may be running: wait 15 minutes and look again. **Never stop it.** If the row is empty or `generation` is 0, tell the planning session before going on.
3. **Memory and disk are healthy:** run `check-memory.sh` and `check-disk.sh` (the deploy hardening scripts). Stop if either warns.

## Step 2: refresh the saved month snapshots (once)
The month-detail script stops if the stored snapshots are stale. Open the History page for the user in the browser (or call `GET /household-members/<member id>/snapshots`) **once**, then continue. This is the normal action of a user opening the page.

## Step 3: run the four scripts, twice each
Run each command **two times in a row** (A then B), saving the output to a file. Replace `<USER_ID>` and, for month detail, `<MEMBER_ID>` (a household member of that user; `--aggregate` covers the whole household).

```
mkdir -p ~/g2 && cd <the folder from Step 1>

# 1. Home (about 1 minute)
for run in A B; do sudo docker compose run --rm -T backend python scripts/measure_home_staging.py --user-id <USER_ID> --runs 5 2>&1 | tee ~/g2/home_$run.txt; done

# 2. Benchmark matrix (about 3 to 5 minutes)
for run in A B; do sudo docker compose run --rm -T backend python scripts/measure_benchmark_matrix.py --user-id <USER_ID> --runs 3 2>&1 | tee ~/g2/benchmark_matrix_$run.txt; done

# 3. Month detail (one member, then the whole household)
for run in A B; do sudo docker compose run --rm -T backend python scripts/measure_month_detail.py <MEMBER_ID> 2>&1 | tee ~/g2/month_member_$run.txt; sudo docker compose run --rm -T backend python scripts/measure_month_detail.py --aggregate --user-id <USER_ID> 2>&1 | tee ~/g2/month_aggregate_$run.txt; done

# 4. Individual fund page (about 2 minutes, warm and cold)
for run in A B; do sudo docker compose run --rm -T backend python scripts/measure_fund_page_staging.py --user-id <USER_ID> --schemes 4 --runs 3 --scheme-filtered 2>&1 | tee ~/g2/fund_page_$run.txt; done
```
These commands are the plan's reading of each script's own usage line. If a script's help differs on the VM, run `python scripts/<name>.py --help` and use what it says, still without the two forbidden flags.

## Step 4: what a good result looks like (for your own check)
- Home: each reading ends with a pass or a limit line (the Home first-load limit is 1.5 s).
- Benchmark matrix: the line "added by windows" for the largest scope is **below 3000 ms**.
- Month detail: median below **1.0 s** (30 Oct: 243 to 261 ms).
- Fund page: no error. (30 Oct: 74 to 107 ms per call, already known and accepted below 100 ms.)
- A and B should be close to each other. If they differ by more than 30%, run a third time (C) and say so.

## Step 5: send back
Paste the **four result files in full** (they are short) plus: the date and time started, the `max(date)` result, the user id's first 8 characters only, and anything unusual (an abort, a warning, a slow first run). The planning session records them in `Docs/orchestration/2026-10-31-factsheet-state-and-benchmark-gaps.md` (Revision 3 table) and in `session.md`, and opens Run 2.

## If something stops
| What you see | What to do |
|---|---|
| "read-only", "write attempt", "flush blocked" | Stop. Send the message back. Do not add flags. |
| Prices older than today in Step 1 | Stop. Wait for the morning job or tell the planning session. |
| Recompute row shows a start within 15 minutes | Wait; never stop it. |
| A script cannot find the user or member | Re-check the ids (Step 1 query); do not guess. |
