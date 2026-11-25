# Export timing, round 2 on staging (25 Nov 2026 about 14:35 to 15:30 IST, run by the manager's Claude; QA item D-10)
Script: `backend/scripts/measure_export_staging.py` (`--part idle|nocover|sections|probe`, commit `2836e098`); guide: `2026-11-25-export-timing-round2-guide.md`. Staging VM checkout `942356f4`, the owner's own household. No token was used: the script minted one temporary session per part from the owner's sign-in email and deleted it each time (the email is not recorded anywhere in the repository). **Nothing was changed in the app.** Round 1: `2026-11-25-export-timing-result.md`.

**What this record holds:** the figures from the manager's Claude's reports in chat (the complete final report is now in). The per-section figures for eight of the first twelve sections were summarised (2.6 to 7.2 s each), not listed.

## Part idle (nothing exporting, after the browser had closed)
15 Chromium processes holding 817 MB; container memory 1,679 MB; CPU 1% and flat. The earlier guide's "about three" threshold is far exceeded: the start-up browsers of the old export route (one per backend worker, each with its helper processes) are still running, about 800 MB doing nothing for the new export.

## Part nocover (all 24 sections, cover OFF)
| Run | Total | finishing to ready | PDF | Container memory peak |
|---|---|---|---|---|
| full_nocover_cold | 219,243 ms | 194,747 ms | 3.27 MB | 2,593 MB |
| full_nocover_warm (right after) | 196,389 ms | 192,754 ms | not reported | 2,429 MB |
Compared with round 1 (cover on): cold finishing 211.8 s and a 4.7 MB PDF. So the cover and the contents pass add about 17 s and about 1.4 MB. Printing itself takes about 193 to 195 s without them. **The warm run was not slower than the cold run this time** (round 1's warm run, which followed a cover-on run, was).

## Part sections (one section at a time, cover off, 30 s apart; all ok)
Reported figures (total ms to ready; where given, how much was building and how much was printing):
| Section | Total | Detail |
|---|---|---|
| overlap-common-holdings | 57,553 ms | 56.5 s printing |
| holdings-top-by-fund | 47,171 ms | 19 s building, 26.6 s printing |
| overlap-top-pairs | 36,455 ms | 26 s building |
| holdings-all-stocks | 28,691 ms | 27 s printing |
| analytics-cost | 27,702 ms | 26 s printing |
| transactions-cash-flow | 21,014 ms | 17 s building |
| transactions-ledger | 12,355 ms | not broken down |
| overview-mutual-funds | 12.3 s | 10.7 s printing |
| analytics-category | 11.3 s | 10.2 s printing |
| analytics-ranking | 8.7 s | 6.7 s printing |
| allocation-market-cap | 5.6 s | |
| allocation-fund-manager | 5,187 ms | |
| overlap-heatmap | 4,660 ms | |
| performance-benchmark-comparison | 4.6 s | |
| allocation-asset-class | 4.6 s | |
| overlap-impact | 3,629 ms | |
Sections 1 to 12 other than the ones above each took 2.6 to 7.2 s; together the twelve sum to roughly 60 s. Backend memory afterwards about 1.94 to 2.0 GiB.

## Part probe (full report cover ON, then 5 minutes of watching the container)
Report: 214,712 ms in total; building 2,068 ms; finishing 209,454 ms; PDF 4,707,893 bytes; container memory peak 2,525 MB; 21 Chromium processes (1,874 MB); CPU peak 214% of one core; `two_pass=no` again.
After "ready" (seconds since ready, CPU % of one core, Chromium processes, Chromium MB, container MB): 5 to 65 s: CPU **101%** flat, 20 processes, 1,158 MB, container 1,884 to 1,915 MB; 95 s: CPU 3%; 125 s: CPU 1%, **15 processes, 817 MB**, container 1,751 MB; flat at 1% to 300 s. CPU settled below 25% from second 85. cpu_max 101%, cpu_average 27%.

## Whole round
27 "export finished" lines, all `status=ready` and all `two_pass=no`: two 24-section no-cover runs (218,841 ms and 196,272 ms), 24 single-section runs (2,570 to 57,537 ms), one 24-section cover-on probe (214,581 ms). Over the 24 single sections: wall time about 394 s, printing time about 265 s. Backend memory 1.537 GiB before, 1.605 GiB after; highest container peak 2,593 MB (nocover cold), under the 3,500 MB stop line.

## Reading (orchestrator)
**Measured:**
1. The start-up browsers of the old route are still running: 15 processes, 817 MB, at idle.
2. Printing the full 24-section report takes about 193 to 195 s even with no cover and no second print; the cover adds about 17 s and 1.4 MB.
3. The print cost is concentrated: overlap-common-holdings (56.5 s), holdings-all-stocks (27 s), holdings-top-by-fund (26.6 s) and analytics-cost (26 s) are about 136 s together, roughly 70% of the 195 s. overview-mutual-funds and analytics-category add about 21 s more. Most other sections cost 2 to 7 s.
4. Three sections wait 17 to 26 s for their data when it is not already cached (holdings-top-by-fund, overlap-top-pairs, transactions-cash-flow). In the full reports of round 1 the whole build stage took 2.6 s cold, so those waits depend on whether the analytics data was already cached.

**Corrected and confirmed by the complete report:**
- **Printing cost is additive.** The 24 single sections cost about 265 s of printing in total; the full report prints in about 195 s. The roughly 70 s difference is about 3 s of fixed cost that each single export pays once (24 times 3 s). So there is no extra cost for printing together; the full report is the sum of its sections plus one fixed cost. (My first estimate of about 200 s for the singles was low; and the manager's "not additive" reading compared only sections 1 to 12 with the whole.) The four heavy sections are about 125 to 136 s of the 195 s.
- **Leftover work after a cover-on report is real and short:** one full core busy for about 65 s after "ready", settled below 25% by 85 s, the report browser closing at about 125 s. This is the dropped second print still being drawn. It explains round 1's warm slowdown (the next export started 20 s later); with the cover off (round 2) the warm run was not slower. The contents page numbers failed on all three cover-on reports (`two_pass=no`).

**Inferred:** that the leftover CPU is specifically the second print (the timing and the cover-off comparison fit; nobody looked inside the browser); why the four heavy sections print slowly (not looked at). **Not measured:** the number of cores on the VM.

## Differences from the guide (manager's Claude)
- The owner's email was passed over ssh stdin (so it appears in that conversation's transcript) and was written to no file; each part ran with `sudo -E` and `sh -c` through the entrypoint with `$EMAIL` set.
- The log watcher was stopped by its process group id (1549015), with no `pkill`; it has a 2-hour timeout as a backstop.
- Ssh scripts ran through PowerShell with `wsl.exe bash <script>`, with `MSYS_NO_PATHCONV=1` where Git Bash was involved. The VM checkout (`942356f4`) was not changed. Script removed from the container and the VM. No error or traceback lines in the last 120 minutes. Disk 6.7 GB free, unchanged. Started 14:32 IST, outside all job windows. No stop condition fired; every part reported the temporary session deleted.
