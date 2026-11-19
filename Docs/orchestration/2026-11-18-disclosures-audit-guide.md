# Portfolio disclosures audit: the run guide (Batch L, tasks L-3 and L-8)

**Who runs this.** The user, or the manager's Claude, on the LeapSwitch staging VM. It takes about 15 minutes. The planning session never touches the server.

**What it does.** It reads the portfolio-disclosure tables on staging and returns five small result tables (E1 to E5) plus any `PORTFOLIO_DISCLOSURE_ALERT` log lines (E6). The planning session turns them into the coverage report.

**Nothing in this guide writes anything.**
- The five queries are `SELECT` only. The script opens the database read-only (`SET TRANSACTION READ ONLY`) and refuses to run if it cannot confirm that. It never commits.
- It never runs the daily disclosure job or the by-hand import. Do not run those here (`refresh_portfolio_disclosures_daily.py`, `import_manual_portfolio_disclosures.py`): they write.
- The only file this guide creates is the saved result text, on **your own laptop** (Step 3).
- The results contain **fund-house names, fund names, dates, counts and assets only**. No household, folio, PAN, name, email or phone is read.

**Hard rules (same as the earlier VM guides).** Never run `clean-db.sh`, `restore.sh`, `rollback.sh` or a deploy. Never edit a file on the VM. If a step stops with an error, copy the message back and do not try other flags.

**How the commands were chosen.** Every access command below is copied from `2026-11-09-runbook-staging-network-and-access.md` (SSH, host key, pre-flight) and `2026-10-31-g2-timing-run-steps.md` (the `sudo docker compose run --rm -T backend python scripts/...` pattern and the app folder). They were **not run by the author of this guide**. The one fact the repo cannot give is whether the script is already on the VM (Step 2).

---

## Step 0: decide the month

The job looks for the **last day of the month before today**. For the November round that is **2026-10-31** (the 31 October disclosures, published in the first ten days of November).

- First useful pass: after the by-hand imports are done (about day 10 to 12 of the month).
- Final pass: after day 20 (the job stops running after day 20).
- Re-run the same way after the by-hand imports (L-8). Every run is stamped with the date it was taken; a mid-month result is not final.

Call the month end `<MONTH_END>` below (for November: `2026-10-31`).

## Step 1: pre-flight (laptop WSL, one command at a time)

Run from the laptop's **WSL** (the registered key lives there, not on Windows). All three must pass.

```bash
# 1. The site answers (expect 200 200 200)
for u in https://ls-staging-api.unifolio.in/health https://ls-redesign.unifolio.in/ https://ls-staging.unifolio.in/; do curl -s -o /dev/null -w "%{http_code} $u\n" --max-time 15 "$u"; done

# 2. SSH host key is the known one (expect SHA256:J0nPZnfmglyvNnCqQZ1oDs3meaKxgYFJ7HGDwe6wyQ4)
ssh-keyscan -t ed25519 ls-redesign.unifolio.in 2>/dev/null | ssh-keygen -lf -

# 3. SSH works
ssh deploy@ls-redesign.unifolio.in 'hostname; git -C /opt/unifolio-redesign log -1 --format=%h'
```

If SSH times out and the site is also down, stop and use section 5 of the 9 Nov runbook. If only SSH times out, your home IP changed: add it to the security group `unifolio-web` (runbook section 1.3). Use hostnames, never the raw IP.

## Step 2: check the audit script is on the VM

The backend image copies `backend/scripts/` when it is built, and the app folder does not mount it, so the audit script exists on the VM only after a backend build that includes it.

```bash
ssh deploy@ls-redesign.unifolio.in 'cd /opt/unifolio-redesign/deploy/leapswitch && sudo docker compose run --rm -T backend ls scripts/audit_disclosures'
```

- Expected: `queries.sql` and `run_audit.py`.
- If it says "No such file or directory", **stop**. The script has not been deployed yet; it ships with the next backend deploy. Tell the planning session. Do not copy files onto the VM by hand and do not deploy for this.
- If `sudo` asks for a password, the one-line `ssh ... 'sudo ...'` form will not work. Open an interactive session (`ssh deploy@ls-redesign.unifolio.in`), run the same commands inside it, and use the interactive variant of Step 3.

## Step 3: run E1 to E5 (read-only) and save the result on your laptop

```bash
ssh deploy@ls-redesign.unifolio.in 'cd /opt/unifolio-redesign/deploy/leapswitch && sudo docker compose run --rm -T backend python scripts/audit_disclosures/run_audit.py --target-month-end <MONTH_END> --stdout' > disclosures-audit-<MONTH_END>-taken-$(date +%F).txt
```

- The database address and password come from the container's own environment. You never type them.
- The first line of the saved file reads `Portfolio disclosures audit, read-only. Target month end <MONTH_END>, taken on <today>.` Then five blocks, each between `=== E1 ===` and `=== end E1 ===` (E1 to E5). Each block is a CSV with a header line.
- Quick check: the file must contain all five `=== end E? ===` lines. If one is missing, stop and send the file as it is.
- E3 and E4 have one row per live fund, so the file runs to thousands of lines. That is expected.

**Interactive variant (only if Step 2 said `sudo` needs a password).** Inside the VM session:

```bash
cd /opt/unifolio-redesign/deploy/leapswitch
sudo docker compose run --rm -T backend python scripts/audit_disclosures/run_audit.py --target-month-end <MONTH_END> --stdout | tee ~/disclosures-audit-<MONTH_END>.txt
```

Then, from the laptop WSL: `scp deploy@ls-redesign.unifolio.in:disclosures-audit-<MONTH_END>.txt .` This leaves one text file of results (names, dates, counts) in the `deploy` home folder on the VM; it touches nothing else.

What each block answers:

| Block | Question |
|---|---|
| E1 | Per fund house and batch status: how many batches for the target month and the month before |
| E2 | How many live funds each fund house has (the denominator; expected-gap houses left out) |
| E3 | Per live fund: status for the target month and average assets (money measure); says when assets are missing or from an older period |
| E4 | Newest file date per fund and per fund house; fresh, stale or none (uses the date inside the file, never the import date) |
| E5 | Why each failed batch failed (stored reasons), target month and the month before |

## Step 4: the job log lines (E6)

The job writes one warning line per problem, each starting `PORTFOLIO_DISCLOSURE_ALERT amc=... reason=... detail=...`. The reasons are `no_file_found`, `target_month_not_published`, `error`, `parse_error`, `failed_sum_check`, `unmatched_scheme`, `duplicate_match`, `zero_schemes_matched`, `stale_fallback`, `stale_wayback_capture`, `manual_upload_pending`. The late-file reasons (`no_file_found`, `target_month_not_published`, `stale_*`, `manual_upload_pending`) are only logged on **days 10 and 20**; the others are logged on every run where they happen.

**Where the lines are, and for how long: the repo does not say.** Read before you search:
- The job runs from root's crontab at 05:45 IST on days 1 to 20 (`deploy/leapswitch/crontab.leapswitch`), through `run-job.sh`, which prints the job's output to the screen.
- Unlike nav-daily, that cron line has **no output file**: nav-daily writes `/var/log/unifolio-nav.log` (rotated daily, 30 kept); this job has no file and no rotation rule in the repo. Whatever cron does with the printed output (mail it, or drop it) is set on the VM, not in the repo.
- So the retention is **not known**. The containers are started with `--rm`, so `docker logs` will not have them either.

Look in the two places they could be, read-only, and report what is found (or that nothing is):

```bash
# a) any log file the VM may have for this job (lists names; prints only matching alert lines)
ssh deploy@ls-redesign.unifolio.in 'ls -la /var/log/unifolio-* 2>&1; sudo grep -h PORTFOLIO_DISCLOSURE_ALERT /var/log/unifolio-* 2>&1'

# b) root's cron mail, if the VM keeps any (prints only matching alert lines, with a count)
ssh deploy@ls-redesign.unifolio.in 'ls -la /var/mail/root 2>&1; sudo grep -c PORTFOLIO_DISCLOSURE_ALERT /var/mail/root 2>&1; sudo grep PORTFOLIO_DISCLOSURE_ALERT /var/mail/root 2>&1'
```

- "No such file" or zero matches means the November log is **gone (or was never kept)**. Say exactly that. The report then rebuilds the causes by checking each fund house by hand instead of guessing, and proposes keeping the reasons in the database.
- Do not enable logging, edit the crontab, or install anything to get the lines. That is a separate decision.

## Step 5: send back

Paste, **unedited**:
1. The whole saved result file from Step 3 (or attach it).
2. The output of both Step 4 commands, even if empty or an error.
3. The date and time you started, the `<MONTH_END>` you used, and anything unusual (an abort, a warning).

Do not trim rows, rename columns or fix anything by hand. If a figure looks wrong, send it anyway and say which.

## If something stops

| What you see | What to do |
|---|---|
| Pre-flight fails, SSH times out | Runbook of 9 Nov, section 5. Do not detach or attach anything. |
| `No such file or directory` for `scripts/audit_disclosures` | The script is not on the VM yet. Stop and tell the planning session. |
| `Could not confirm a read-only connection` | Stop. Copy the message. Do not add flags or change the database user. |
| `An existing SQLite database file is required` | The container did not get the staging database address. Stop and copy the message. |
| `target_month_end must be the last day of a month` | Fix `<MONTH_END>` (a month end such as 2026-10-31). |
| A password prompt from `sudo` | Use the interactive variant in Step 3. |
| Fewer than five `=== end E? ===` lines | Send the file as it is and say so. |
