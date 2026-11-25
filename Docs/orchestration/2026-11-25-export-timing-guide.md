# Export timing run on staging (QA item D-10: measure the PDF export before changing anything)
**Status:** READY (written 2026-11-25). Run by the **manager's Claude** on the staging VM (`ls-redesign.unifolio.in`). It changes no code and no stored data: it asks the real export for a few real PDFs of the owner's own household and writes down how long each step takes. The script is `backend/scripts/measure_export_staging.py` (logic tests passed on the orchestrator's laptop: 8 tests). The plan it feeds: `2026-11-24-head-of-family-d11-plan.html` (item D-10).

## Why
The owner reports that exports take very long, especially from "building the pages" onward. Today nothing records how long each step takes (only one total at the very end). Before any speed change is planned, we need real numbers: how long each step takes for a real household, cold (the first export after the browser has been idle for 2 minutes) and warm.

## What the script does
Sends four real exports through the real API (`POST /export/report`, then polls `GET /export/report/<id>` every half second) and records when each stage change is first seen:
`queued` (waiting for a browser slot and starting the browser) then `collecting` (opening the print page) then `building` (every section loading its data, up to 90 s) then `finishing` (print pass 1, the contents page-number pass 2, saving) then `download`.
Every second it also notes the container's memory, how many Chromium processes exist and how much memory they hold, and the CPU the container uses. The four runs: full report cold (all 24 sections, cover on, after a 130 s idle wait), full warm, small warm (2 sections, cover off), small cold (after another idle wait). `--quick` skips the two cold runs (use it if the owner is in a hurry; the cold run matters most, so prefer the full run). It waits 20 s between runs (the server allows one export per user every 15 s). Total time about 15 to 20 minutes.
It prints only counts, milliseconds, megabytes and yes/no flags: never names, tokens, folios, amounts or addresses.

## Prompt for the executing Claude
```
You are running a timing measurement on the LeapSwitch staging VM (ls-redesign.unifolio.in). Read Docs/orchestration/2026-11-25-export-timing-guide.md in the repository (git fetch origin --tags first; it is on the leapswitch-redesign branch) and follow it step by step.
Rules: run one command at a time and show its output; at every STOP, stop and report; change nothing on the VM except what a step says; never print .env lines, tokens or session values and never write the token to a file or to your notes; never run clean-db.sh, restore.sh or rollback.sh; do not start the measurement inside the job windows (05:40 to 06:35, 10:30 to 10:40, 14:00 to 14:15 IST); use ssh by hostname from WSL only (put commands in a script file or write every value out so the Windows-to-WSL layer expands nothing).
At the end give the owner the script's output exactly as printed, the "export finished" log lines, the memory before and after, and the list of anything that differed from the guide.
```

## Steps
**0. Pre-checks (read-only).** `cd /opt/unifolio-redesign && git rev-parse HEAD` (note the commit; the checkout stays as it is), `df -h /` (note free space), `cd deploy/leapswitch && sudo docker compose ps --format '{{.Service}} {{.Status}}'` (backend and worker up), `sudo docker stats --no-stream` (note the backend's memory now). **STOP** if the backend is not up, or if the current time is inside a job window above, or if the backend's memory is already above about 1,800 MB (tell the owner and wait).

**1. Get the script without changing the checkout.** `cd /opt/unifolio-redesign && git fetch origin leapswitch-redesign` then `git show origin/leapswitch-redesign:backend/scripts/measure_export_staging.py > /tmp/measure_export_staging.py && wc -l /tmp/measure_export_staging.py`. Expected: about 330 lines. (Do not run `git checkout` or `git pull`.) **STOP** if the file is missing: the orchestrator's push may not have landed.

**2. Copy it into the running backend container** (it lives only in that container's temporary files): `cd /opt/unifolio-redesign/deploy/leapswitch && sudo docker compose cp /tmp/measure_export_staging.py backend:/tmp/measure_export_staging.py`. Smoke check: `sudo docker compose exec -T -e PYTHONPATH=/app backend python /tmp/measure_export_staging.py --help` (prints the usage text).

**3. Get a session from the owner.** The exports must run as the account that has the real household (the owner's own staging account; there is no team account on staging). Ask the owner to sign in on `https://ls-redesign.unifolio.in` in a **private window**, open the browser's developer tools, Application (Chrome) or Storage (Firefox), Local Storage, and copy the value of the key `unifolio_session_token`, and to give it to you. Put it in a shell variable **without printing it** (for example `read -s TOKEN`), and never write it to a file or to your notes. The owner closes the private window **without signing out** only after the run ends (signing out ends the session). **STOP** and ask if the owner cannot do this.

**4. Open a second terminal to watch the server's own log line** (one line per finished export, no names): `cd /opt/unifolio-redesign/deploy/leapswitch && sudo docker compose logs backend -f --since 1m 2>&1 | grep --line-buffered "export finished" | tee /tmp/export-finished-lines.txt`. Leave it running.

**5. Run the measurement** (outside the job windows), in the first terminal:
`sudo docker compose exec -T -e PYTHONPATH=/app -e EXPORT_CHECK_TOKEN="$TOKEN" backend python /tmp/measure_export_staging.py --token-env EXPORT_CHECK_TOKEN 2>&1 | tee /tmp/export-timing-output.txt`
It prints "waiting N s" lines and then one block per run. Expected: four blocks (`full_cold`, `full_warm`, `small_warm`, `small_cold`) and a summary. **STOP and report at once** if a block says `ok: False` (give its `final_status` and `error_code`), if `post_status` is 401 (the session ended: ask the owner for a fresh token), or if memory in the container passes about 2,500 MB. If it is cut short, say so and give what printed.

**6. Capture and clean up.** In the first terminal run `sudo docker stats --no-stream` once more (note the backend's memory now). Stop the log watcher (Ctrl+C). Remove the script from the container and the VM: `sudo docker compose exec -T backend rm -f /tmp/measure_export_staging.py` and `rm -f /tmp/measure_export_staging.py`. `unset TOKEN`. Check the log for new error lines: `sudo docker compose logs backend --since 30m 2>&1 | grep -i -E "error|traceback" | head` (expected none beyond what the run reports). `df -h /` (expected unchanged; finished PDFs are removed after 10 minutes). Tell the owner they can close the private window.

**7. Report to the owner**, in this order: (a) the full script output exactly as printed, (b) the contents of `/tmp/export-finished-lines.txt` (four lines), (c) memory before and after, (d) anything that differed from this guide. Do not summarise the numbers away: the orchestrator needs them as printed.

## How the orchestrator reads it
- `queued_to_collecting` large on the cold run: the browser start is slow. Large on a warm run: waiting for a slot.
- `building_to_finishing` is the build wait: every section loading its own data. This is the first suspect. Compare the full run with the small run.
- `finishing_to_ready` covers print pass 1 plus the contents-page pass 2 plus saving. The server's log line says whether pass 2 finished (`two_pass=yes`) or fell back after its 10 s limit (`two_pass=no`: the report then has no contents page numbers).
- Peak CPU near 100 percent of one core, or memory climbing toward the container's ceiling, points at the machine rather than the code.
The result goes into `Docs/orchestration/2026-11-25-export-timing-result.md` and into the plan page, and the speed plan is written from it.
