# Export timing result on staging (25 Nov 2026, run by the manager's Claude; QA item D-10)
Script: `backend/scripts/measure_export_staging.py`; guide: `2026-11-25-export-timing-guide.md`. Staging VM (`ls-redesign.unifolio.in`), checkout `942356f4` (`xr-rc`), the owner's own household, four real exports through the real API. Plan page: `2026-11-24-head-of-family-d11-plan.html` (item 10). **Nothing was changed in the app; this is measurement only.**

## The four runs, as printed
| Run | Total to ready | queued to collecting | collecting to building | building to finishing | finishing to ready | PDF | Memory peak | Chromium peak | CPU peak |
|---|---|---|---|---|---|---|---|---|---|
| full_cold (24 sections, cover on, after a 130 s idle) | 216,444 ms | 62 ms | 1,995 ms | 2,590 ms | **211,792 ms** | 4,707,893 B | 2,292 MB | 21 processes, 1,873 MB | 311% |
| full_warm (right after, 20 s gap) | 264,459 ms | 38 ms | 1,590 ms | **44,661 ms** | **218,166 ms** | 4,687,671 B | **2,602 MB** | 26 processes, 2,278 MB | 324% |
| small_warm (2 sections, no cover) | 34,144 ms | 32 ms | 1,578 ms | **17,538 ms** | 14,992 ms | 1,451,207 B | 2,286 MB | 26 processes, 1,889 MB | 297% |
| small_cold (2 sections, no cover, after 130 s idle) | 17,109 ms | 27 ms | 1,609 ms | 515 ms | 14,952 ms | 1,451,207 B | 2,142 MB | 21 processes, 1,549 MB | 280% |
Download of the finished file took 10 to 25 ms each time.

## The server's own log lines (four, one per run)
`export finished: status=ready scope_kind=family sections=24 duration_ms=216314 pdf_bytes=4707893 blocked_requests=1 two_pass=no`
`... sections=24 duration_ms=264602 pdf_bytes=4687671 blocked_requests=8 two_pass=no`
`... sections=2 duration_ms=33726 pdf_bytes=1451207 blocked_requests=1 two_pass=no`
`... sections=2 duration_ms=16881 pdf_bytes=1451207 blocked_requests=1 two_pass=no`
Backend container memory: 856.5 MiB before, 1.752 GiB after (of 15.61 GiB). Disk 6.9 GB free before, 6.8 GB after. No error or traceback lines in the 45 minutes after.

## Reading (orchestrator)
**Confirmed from the numbers and the code (`backend/app/services/export/render.py`):**
1. The slow step is **finishing**: for the full report 212 to 218 s of 216 to 264 s. Printing page one is `page.pdf(...)` with **no time limit** (line ~242); only the contents-page second print is capped (10 s, `SECOND_PASS_TIMEOUT_SECONDS`).
2. Opening the page takes about 2 s; the sections' data loads in 2.6 s on a cold full run. The earlier suspect ("sections load one after another, the 90 s wait") was not the cause.
3. Print cost scales with content: 2 sections about 15 s, 24 sections about 212 s (about 9 s per extra section on average).
4. **The contents page numbers never appeared on a full report:** `two_pass=no` on both full runs. The second print is a second full print and cannot finish in 10 s when one print takes 200 s. (The two small runs have no cover, so `two_pass=no` is normal for them.) The fallback is silent.
5. CPU peaks near 3 cores on every run; memory 2.1 to 2.6 GB; 21 to 26 Chromium processes.

**Inferred, not proven:**
- *Why warm was slower than cold:* when the second print times out, `asyncio.wait_for` cancels the Python call but Chromium may keep printing; the next export (20 s later) then competes for CPU. Evidence: the warm full run's sections-load stage was 44.7 s (cold: 2.6 s) and the warm small run's was 17.5 s (cold: 0.5 s); the small run after a long idle is clean.
- Which sections are heavy; whether the old pipeline's start-up browsers (one per backend worker) still exist (the 21 to 26 processes suggest so).

## Differences from the guide (manager's Claude)
- Container memory crossed the guide's "about 2,500 MB" stop line on `full_warm` (2,602 MB); the script runs unattended and could not stop mid-run; the run finished normally.
- The session token was read from the owner's screenshot and sent over ssh stdin (not through `read -s`); it is in that conversation's transcript and was never written to a file. **The owner should end that session** (sign out in the private window).
- Commands ran through PowerShell with `wsl.exe bash <script>` (Git Bash mangled the path). A `pkill` in the first cleanup matched its own ssh session (exit 255); the rest of the cleanup was rerun without it. The VM checkout was not changed (`942356f4`). Script removed from the container and from `/tmp`.

## Next (proposed, nothing built)
Round 2 of the measuring: (1) full report, cover off, cold, then again straight away; (2) one section at a time (24 short exports, cover off, 30 s apart); (3) container CPU for five minutes after a full report to see leftover work; (4) a Chromium process count at idle. Then fix directions: contents page numbers written onto the first PDF (no second print), a cheaper first print, honest progress in the dialog. The timing-log patch (log the first print, the second print and why it gave up, and saving) stays in the first patch. Questions QA-17 and QA-18 on the plan page.
