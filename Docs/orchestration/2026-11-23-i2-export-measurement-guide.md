# Guide: I-2, measure today's PDF export on staging (Batch I, read-only)
**Status:** READY (written 2026-11-23). Run by the **manager's Claude** on the staging VM (`ls-redesign.unifolio.in`, running `m3-rc`). Nothing here changes code, the database or the deployment, with one exception that needs the owner's yes (step 5). The script is `backend/scripts/diagnose_export_pipeline.py`; its tests passed (6) on the orchestrator's laptop.

## Why
Today's export keeps its one-time token in a plain dictionary inside one backend process, while the VM runs **three** (`--workers 3`). The browser that renders the PDF comes back through the public address, so the request that fetches the data can land on a different process from the one that stored it. We expect the export to fail about two times in three. This measures it, and what three idle Chromium processes cost in memory (the container has one shared 3 GB ceiling), before Batch I decides how much of the pipeline to rebuild.

## Prompt for the executing Claude
```
You are running a read-only measurement on the LeapSwitch staging VM (ls-redesign.unifolio.in). Read Docs/orchestration/2026-11-23-i2-export-measurement-guide.md in the repository and follow it step by step.
Rules: run one command at a time and show its output; at every STOP, stop and report; change nothing on the VM except what a step says; never print .env lines, tokens or session values; never run clean-db.sh, restore.sh or rollback.sh; do not run the browsers step during the job windows (05:40 to 06:35, 10:30 to 10:40, 14:00 to 14:15 IST); use ssh by hostname from WSL only (put commands in a script file or write every value out so the Windows-to-WSL layer expands nothing).
At the end give the owner the script's output exactly as printed, and the list of anything that differed from the guide.
```

## Steps
**0. Pre-checks (read-only).** `cd /opt/unifolio-redesign && git rev-parse HEAD` (expect `9f776a34...`, the `m3-rc` tag; the checkout stays as it is), `df -h /` (note free space), `cd deploy/leapswitch && sudo docker compose ps --format '{{.Service}} {{.Status}}'` (backend and worker up). **STOP** if the backend is not up.

**1. Get the script without changing the checkout.** `cd /opt/unifolio-redesign && git fetch origin leapswitch-redesign` then `git show origin/leapswitch-redesign:backend/scripts/diagnose_export_pipeline.py > /tmp/diagnose_export_pipeline.py && wc -l /tmp/diagnose_export_pipeline.py`. Expected: about 230 lines. (Do not run `git checkout` or `git pull`.) **STOP** if the file is missing: the orchestrator's push may not have landed.

**2. Copy it into the running backend container** (it lives only in that container's temporary files and disappears when the container is recreated): `cd /opt/unifolio-redesign/deploy/leapswitch && sudo docker compose cp /tmp/diagnose_export_pipeline.py backend:/tmp/diagnose_export_pipeline.py`.

**3. Run the no-sign-in checks without the browsers first.**
`sudo docker compose exec -T -e PYTHONPATH=/app backend python /tmp/diagnose_export_pipeline.py --expect-host ls-redesign.unifolio.in --skip-browsers`
Expected: `frontend_base_url_is_expected_host: yes`; `uvicorn_processes_seen` about 4 (a parent and three workers); a print page status of 200 (the print page is part of the single-page app, so a plain GET answers 200); `container_memory_mb_now` below about 1,800. **STOP and report** if the host line says NO (the browser would be sent to the wrong address), or if memory now is above 1,800 MB (the browsers step could push the container into its ceiling: tell the owner and wait).

**4. Run the browsers step** (outside the job windows): the same command without `--skip-browsers`. It starts three headless Chromium processes, reads what they hold and closes them. Expected: three chromium processes, a few hundred MB in total. If `browsers_could_not_start` appears, report the kind it prints (it is a finding: the export cannot work at all).

**NOTE (24 Nov): step 5 was not run and is closed (see `2026-11-24-export-pipeline-measurement.md`); if it is ever retried, run the script through the entrypoint (`... backend /app/docker-entrypoint.sh python /tmp/diagnose_export_pipeline.py ...`), because a plain `exec` shell has no `DATABASE_URL`, and choose the account in advance.**

**5. The export route itself needs a session. Ask the owner which way to get one (do not choose):**
- **(a) Preferred:** the owner signs in on the staging site in a private window, copies the value of the key `unifolio_session_token` from the browser's storage and gives it to you. You put it in a shell variable **without printing it** and run: `sudo docker compose exec -T -e PYTHONPATH=/app -e EXPORT_CHECK_TOKEN="$TOKEN" backend python /tmp/diagnose_export_pipeline.py --expect-host ls-redesign.unifolio.in --token-env EXPORT_CHECK_TOKEN --runs 12 --skip-browsers`. Never write the token to a file or to the record.
- **(b) Only with the owner's explicit yes:** `--mint-session-for <the owner's user id>` instead of `--token-env`. This inserts **one** row in the `sessions` table for that user and deletes it again at the end (even if the run fails); the output says `minted_one_temporary_session: yes` and `temporary_session_deleted: yes`. Confirm the second line printed. Nothing else is written.
Each run sends an invented empty-family payload (no names, no money). Twelve runs take a few minutes if many fail (each failed render waits up to 15 seconds); do not run it twice in a row.
Expected from the diagnosis, not a requirement: roughly two in three runs fail with status 500; the first run is reported apart because it may start the browser.

**6. Tidy up (read-only to the app).** `sudo docker compose exec -T backend rm -f /tmp/diagnose_export_pipeline.py` and `rm -f /tmp/diagnose_export_pipeline.py` on the VM. Then `sudo docker compose logs backend --since 20m | grep -c " ERROR "` and report the number (failed exports log errors: that is expected and is the measurement). Confirm `docker compose ps` is unchanged and `df -h /` free space is the same as in step 0.

**7. Report to the owner:** the three outputs exactly as printed (steps 3, 4, 5), the memory numbers, the error count, and anything that differed. The orchestrator turns this into `Docs/orchestration/2026-11-xx-export-pipeline-measurement.md`.

## What this does not tell us
Real portfolios (a large family may make a heavier print page than the invented empty one), the real time a full report takes, and whether Caddy's own timeout cuts a long render. Those are measured in I-5 on the rebuilt pipeline.
