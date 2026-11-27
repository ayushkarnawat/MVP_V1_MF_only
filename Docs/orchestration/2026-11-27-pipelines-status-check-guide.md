# AMC pipelines status check: the run guide (part S of the 27 Nov plan)

**Who runs this.** Your manager's Claude, from his laptop, against the LeapSwitch staging VM. About 20 minutes plus about 10 for the optional discovery step. The planning session never touches the server.

**What it does.** Reads the staging database and prints the state of both AMC data pipelines for the month ending **31 Oct 2026**: portfolio disclosures (holdings) and factsheets (fund managers). It also lists which fund houses date their files just before a month end (optional step 4), and what the VM keeps of the job runs (step 5). The planning session turns the results into the status report. Plan: `Docs/orchestration/2026-11-27-amc-data-pipelines-plan.html`, section 4.

**Nothing in this guide writes anything.**
- The script is `backend/scripts/audit_pipelines/status.py`. It opens the database read-only (`SET TRANSACTION READ ONLY`, checked with `SHOW transaction_read_only`) and refuses to run if it cannot confirm that. Every query is a `SELECT`; it never commits.
- It runs no job and imports nothing. Do **not** run `refresh_portfolio_disclosures_daily.py`, `refresh_fund_managers_monthly.py`, `import_manual_portfolio_disclosures.py` or `import_manual_fund_managers.py`: they write.
- The script is **piped in** from the laptop's copy of the repo (`python - < status.py`). No file is copied onto the VM, nothing is deployed, no image is rebuilt.
- Results contain **fund-house names, fund names, dates, counts and file addresses only**. No household, folio, PAN, name, email or phone is read.
- The optional discovery step (4) makes ordinary requests from the VM to the fund houses' public download pages, with the browser user agent the daily job already uses. It downloads no workbook and writes nothing.

**Hard rules (same as every VM guide).** Never run `clean-db.sh`, `restore.sh`, `rollback.sh`, `deploy.sh` or `deploy-redesign.sh`. Never edit a file on the VM, never edit the crontab, never install anything. If a step stops with an error, copy the message back and do not try other flags.

**Where commands run.** Every command is run on **the laptop, in a terminal that has the SSH key for the VM** (on the owner's machine that is WSL; on your manager's laptop, wherever his VM key lives). Commands that run on the VM are wrapped in `ssh ... '...'`. Run from the **repository root** of a checkout of `leapswitch-redesign` that includes this guide's commit.

---

## Step 0: get the script on the laptop

```bash
git fetch origin
git checkout leapswitch-redesign
git pull --ff-only
ls backend/scripts/audit_pipelines/status.py
```

Expected: the path is printed. If `git pull` refuses (local changes), stop and say so; do not stash or reset someone else's work.

## Step 1: pre-flight (one command at a time)

```bash
# 1. The site answers (expect 200 200 200)
for u in https://ls-staging-api.unifolio.in/health https://ls-redesign.unifolio.in/ https://ls-staging.unifolio.in/; do curl -s -o /dev/null -w "%{http_code} $u\n" --max-time 15 "$u"; done

# 2. SSH host key is the known one (expect SHA256:J0nPZnfmglyvNnCqQZ1oDs3meaKxgYFJ7HGDwe6wyQ4)
ssh-keyscan -t ed25519 ls-redesign.unifolio.in 2>/dev/null | ssh-keygen -lf -

# 3. SSH works, and sudo does not ask for a password
ssh deploy@ls-redesign.unifolio.in 'hostname; git -C /opt/unifolio-redesign log -1 --format=%h; sudo -n true && echo SUDO_OK'
```

- If check 2 prints a different fingerprint: **stop**. Do not connect.
- If SSH times out and the site is also down, stop (runbook `2026-11-09-runbook-staging-network-and-access.md`, section 5). If only SSH times out, the laptop's IP is not allowed in the security group `unifolio-web` (runbook section 1.3): ask the owner, do not change it yourself.
- If check 3 does not print `SUDO_OK`, use the **interactive variant** at the end of step 3.

## Step 2: check the backend image has the 18 Nov audit (S1 needs it)

```bash
ssh deploy@ls-redesign.unifolio.in 'cd /opt/unifolio-redesign/deploy/leapswitch && sudo docker compose run --rm -T backend ls scripts/audit_disclosures'
```

Expected: `queries.sql` and `run_audit.py` (they were used on 19 Nov). If "No such file or directory": **stop and report**. Do not deploy for this.

## Step 3: run the status check (read-only) and save the output on the laptop

```bash
ssh deploy@ls-redesign.unifolio.in 'cd /opt/unifolio-redesign/deploy/leapswitch && sudo docker compose run --rm -T backend python - --target-month-end 2026-10-31' < backend/scripts/audit_pipelines/status.py > pipelines-status-2026-10-31-taken-$(date +%F).txt; echo "exit=$?"
```

- Always pass `--target-month-end 2026-10-31`, even after 1 Dec (the default would move to 30 Nov).
- Expected: `exit=0`, and the saved file starts with `AMC pipelines status check, read-only. Target month end 2026-10-31, taken on ...` and ends with `=== done ===`.
- Quick check: `grep -c '^=== end ' pipelines-status-*.txt` prints **10** (S1-E1 to S1-E5, S2a, S2b, S3, S4, S7). If not, stop and send the file as it is.
- The file runs to thousands of lines (S1-E3 and S1-E4 have one row per live fund). That is expected.
- The database address and password come from the container's own environment; nobody types them.

**Interactive variant (only if step 1 check 3 did not print `SUDO_OK`).** Copy the script to the `deploy` home folder, run it inside an SSH session, then delete it:

```bash
scp backend/scripts/audit_pipelines/status.py deploy@ls-redesign.unifolio.in:pipelines_status.py
ssh -t deploy@ls-redesign.unifolio.in
# now on the VM:
cd /opt/unifolio-redesign/deploy/leapswitch
sudo docker compose run --rm -T backend python - --target-month-end 2026-10-31 < ~/pipelines_status.py > ~/pipelines-status.txt; echo "exit=$?"
exit
# back on the laptop:
scp deploy@ls-redesign.unifolio.in:pipelines-status.txt pipelines-status-2026-10-31-taken-$(date +%F).txt
ssh deploy@ls-redesign.unifolio.in 'rm -f ~/pipelines_status.py ~/pipelines-status.txt'
```

What each block answers:

| Block | Question |
|---|---|
| S1-E1 … S1-E5 | The 18 Nov disclosure audit, re-taken after the last run of the cycle (20 Nov) and the by-hand imports: batches per house and status, live funds, money measure, freshness, failure reasons |
| S2a | Factsheets: newest reference period per fund house, and how many live schemes have a manager for it (did the 10 Nov run move houses to the newest issue?) |
| S2b | Factsheets: schemes with a manager per house for each of the last five periods (what changed month by month) |
| S3 | Disclosures: batches and distinct source files per house, date and status, 27 Sep to 31 Oct. Answers LIC (one file or two?) and shows any batch dated on a last working day |
| S4 | Disclosures: fund families written in September with fewer written series in October (explains Motilal, Canara, LIC and finds houses nobody noticed) |
| S7 | Registry keys with no live funds, and live fund houses that no registry knows (catches the Zerodha rename class) |

## Step 4 (optional, recommended): discovery with a relaxed date (S5)

Runs every automatic fund house's file finder in discovery mode against 31 Oct, accepting files dated up to three days before the month end, and records what each site lists. **Nothing is downloaded or written.** Takes about 5 to 15 minutes; each house has a 2-minute limit. Run it as its own command so step 3's file is already safe:

```bash
ssh deploy@ls-redesign.unifolio.in 'cd /opt/unifolio-redesign/deploy/leapswitch && sudo docker compose run --rm -T backend python - --target-month-end 2026-10-31 --discover' < backend/scripts/audit_pipelines/status.py > pipelines-status-discover-2026-10-31-taken-$(date +%F).txt; echo "exit=$?"
```

- Expected: `exit=0`, and an `=== S5 ===` block with one row per registered fund house: `result` is `ok`, `manual`, `not_onboarded`, `no_live_schemes` or `error <status>` (for example `error 403` for a house that refuses the server; that is a finding, not a failure of the step).
- Columns that matter: `exact_month_end_files` (files dated 31 Oct), `near_month_end_files` and `near_dates` (files dated 28 to 30 Oct that today's job ignores), `newest_other_date`.
- The run also prints S1 to S7 again; that is expected.
- Do not run it more than once in a day.

## Step 5: what the VM keeps of the job runs (S6, read-only)

```bash
# a) log files, and any alert lines in them
ssh deploy@ls-redesign.unifolio.in 'ls -la /var/log/unifolio-* 2>&1; sudo grep -hc -e PORTFOLIO_DISCLOSURE_ALERT -e FUND_MANAGER_ALERT /var/log/unifolio-* 2>&1'

# b) root's cron mail, if the VM keeps any (counts and the alert lines only)
ssh deploy@ls-redesign.unifolio.in 'ls -la /var/mail/root 2>&1; sudo grep -c -e PORTFOLIO_DISCLOSURE_ALERT -e FUND_MANAGER_ALERT /var/mail/root 2>&1; sudo grep -h -e PORTFOLIO_DISCLOSURE_ALERT -e FUND_MANAGER_ALERT /var/mail/root 2>&1 | tail -n 400'

# c) the schedule as installed (to compare with deploy/leapswitch/crontab.leapswitch)
ssh deploy@ls-redesign.unifolio.in 'sudo crontab -l 2>&1 | grep -E "disclosures|fund-managers|manual-factsheets"'
```

"No such file" or a count of 0 is a valid answer: say exactly that. Do not enable logging or change anything to get more.

## Step 6: send back

Give the owner, **unedited**:
1. `pipelines-status-2026-10-31-taken-<date>.txt` (step 3).
2. `pipelines-status-discover-2026-10-31-taken-<date>.txt` (step 4), or "step 4 skipped".
3. The printed output of all three step 5 commands, even if empty or an error.
4. The time each step started, and anything unusual (a warning, a step that took much longer than stated, an abort).

Do not trim rows, rename columns or fix anything by hand. Do not interpret the results on the owner's behalf beyond a one-line "all blocks present" check; the planning session writes the report.

## If something stops

| What you see | What to do |
|---|---|
| Different SSH host key | Stop. Do not connect. |
| SSH times out | Runbook of 9 Nov, sections 1.3 and 5. Do not change security groups yourself. |
| `No such file or directory` for `scripts/audit_disclosures` | The image predates 19 Nov. Stop and report. |
| `Could not confirm a read-only connection` | Stop. Copy the message. Do not change the database user. |
| `ModuleNotFoundError: No module named 'scripts'` | The command did not run from `/app` inside the container. Copy the message; do not retry with other paths. |
| `target_month_end must be the last day of a month` | Use `2026-10-31` exactly. |
| A password prompt from `sudo` | Use the interactive variant in step 3. |
| Fewer than 10 `=== end` lines in step 3 | Send the file as it is and say so. |
| Step 4 runs past 30 minutes | Press Ctrl+C once, send what was saved, say so. |
