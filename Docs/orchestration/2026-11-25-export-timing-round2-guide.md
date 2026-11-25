# Export timing, round 2 on staging (QA item D-10)
**Status:** READY (written 2026-11-25). Run by the **manager's Claude** on the staging VM (`ls-redesign.unifolio.in`). Same script as round 1 (`backend/scripts/measure_export_staging.py`, now with `--part` options); same rules: it changes no code and no stored data (it asks the real export for PDFs of the owner's own household, and mints one temporary session row that it deletes again). Round 1 result: `2026-11-25-export-timing-result.md` (the slow step is the final PDF print; contents page numbers fail on full reports; warm runs were slower than cold).

## What round 2 asks
1. **idle:** with nothing exporting, how many Chromium processes and how much memory does the container hold? (Are the three start-up browsers of the old export route still there?)
2. **nocover:** the full 24-section report with the cover OFF (so no second print), cold, then again straight away. If the second run is no longer slower than the first, the timed-out second print was slowing the next export.
3. **sections:** one section at a time (cover off, 30 s apart): what does each section cost to print? Run as two commands (sections 1 to 12, then 13 to 24).
4. **probe:** one full report with the cover ON, then watch the container's CPU for 5 minutes after "ready". If it stays busy, leftover work is still running.

## Prompt for the executing Claude
```
You are running round 2 of a timing measurement on the LeapSwitch staging VM (ls-redesign.unifolio.in). Read Docs/orchestration/2026-11-25-export-timing-round2-guide.md in the repository (git fetch origin --tags first; it is on the leapswitch-redesign branch) and follow it step by step.
Rules: run one command at a time and show its output; at every STOP, stop and report; change nothing on the VM except what a step says; never print .env lines, tokens, session values or the owner's email address in your notes or reports; never run clean-db.sh, restore.sh or rollback.sh; do not start any part inside the job windows (05:40 to 06:35, 10:30 to 10:40, 14:00 to 14:15 IST); never use pkill or killall with a pattern (it cut your own ssh session last time): stop the log watcher with its own PID; use ssh by hostname from WSL only (put commands in a script file or write every value out so the Windows-to-WSL layer expands nothing).
At the end give the owner every part's output exactly as printed, the "export finished" log lines, the memory before and after, and the list of anything that differed from the guide.
```

## Steps
**0. Pre-checks (read-only).** `cd /opt/unifolio-redesign && git rev-parse HEAD` (note the commit; the checkout stays as it is), `df -h /`, `cd deploy/leapswitch && sudo docker compose ps --format '{{.Service}} {{.Status}}'` (backend and worker up), `sudo docker stats --no-stream` (note the backend's memory). **STOP** if the backend is not up, if the time is inside a job window above, or if the backend's memory is already above about 3,000 MB.

**1. Get the script without changing the checkout.** `cd /opt/unifolio-redesign && git fetch origin leapswitch-redesign` then `git show origin/leapswitch-redesign:backend/scripts/measure_export_staging.py > /tmp/measure_export_staging.py && wc -l /tmp/measure_export_staging.py && grep -c "part_probe" /tmp/measure_export_staging.py`. Expected: about 520 lines and a count of at least 2 (the round 2 parts are present). Do not run `git checkout` or `git pull`. **STOP** if the file is missing or has no `part_probe`: the orchestrator's push may not have landed.

**2. Copy it into the running backend container** (it lives only in that container's temporary files): `cd /opt/unifolio-redesign/deploy/leapswitch && sudo docker compose cp /tmp/measure_export_staging.py backend:/tmp/measure_export_staging.py`. Smoke check: `sudo docker compose exec -T -e PYTHONPATH=/app backend python /tmp/measure_export_staging.py --help` (the usage text lists `--part`).

**3. Ask the owner for the sign-in email of the account that holds the real household** (the account they use on staging). This round does **not** use a session token: the script looks the user up by that email (it prints only `user_found_for_email: yes`), inserts ONE temporary session row, and deletes it again when it finishes, even if it fails. Keep the email out of every file and every note. **STOP** if the script prints `user_found_for_email: NO`.

**4. Open a second terminal to watch the server's own log line** (one line per finished export, no names): `cd /opt/unifolio-redesign/deploy/leapswitch && sudo docker compose logs backend -f --since 1m 2>&1 | grep --line-buffered "export finished" | tee /tmp/export-finished-lines-r2.txt`. Note its process id so you can stop it by id at the end.

**5. Run the parts, one command each, outside the job windows.** Each command must go through the entrypoint (a plain exec has no `DATABASE_URL`). Use this shape, with the owner's email in `$EMAIL` (set it without printing it):
`sudo docker compose exec -T -e PYTHONPATH=/app backend /app/docker-entrypoint.sh python /tmp/measure_export_staging.py --mint-session-for-email "$EMAIL" --part <PART> 2>&1 | tee /tmp/export-r2-<PART>.txt`
Run these, in this order, and show each output when it ends:
- `--part idle` (about 2.5 minutes)
- `--part nocover` (about 10 minutes)
- `--part sections --from-section 1 --to-section 12` (about 10 minutes)
- `--part sections --from-section 13 --to-section 24` (about 10 minutes)
- `--part probe` (about 12 minutes)
Between parts, run `sudo docker stats --no-stream` and note the backend's memory. **STOP and report at once** if a block says `ok: False` (give its `final_status` and `error_code`), if a part prints `stopped:`, if the temporary session is not reported deleted at the end of a part, or if container memory passes about 3,500 MB. If a command is cut short, say so and give what printed.

**6. Capture and clean up.** Stop the log watcher **by its process id** (never with a pattern). Remove the script from the container and the VM: `sudo docker compose exec -T backend rm -f /tmp/measure_export_staging.py` and `rm -f /tmp/measure_export_staging.py`. Check the log for new error lines: `sudo docker compose logs backend --since 90m 2>&1 | grep -i -E "error|traceback" | head` (expected none beyond what the run reports). `df -h /` (expected about unchanged; finished PDFs are removed after 10 minutes). Check that no temporary session is left: the script reports `temporary_session_deleted: yes` at the end of every part; if any part did not, say which.

**7. Report to the owner**, in this order: (a) every part's output exactly as printed, (b) the contents of `/tmp/export-finished-lines-r2.txt`, (c) memory before and after, (d) anything that differed from this guide. Do not summarise the numbers away: the orchestrator needs them as printed.

## How the orchestrator reads it
- **idle:** more than about three Chromium processes at idle means the old start-up browsers are still there (each worker starts one), which is wasted memory and CPU headroom.
- **nocover:** `full_nocover_cold` close to the cold full report of round 1 (about 212 s finishing) means printing itself, not the contents pass, is the cost. `full_nocover_warm` close to the cold run (not slower) means the leftover second print caused the warm slowdown.
- **sections:** the ranked list shows which sections cost the most to print. A fixed cost of about 15 s per export shows up even for the smallest section.
- **probe:** CPU settling below 25 percent of one core within seconds of "ready" means nothing is left running; CPU staying high for minutes after "ready" confirms leftover work from the second print.
The result goes into `Docs/orchestration/2026-11-25-export-timing-result-round2.md` and into the plan page.
