# Export timing, round 2 on staging (25 Nov 2026 about 14:35 to 15:30 IST, run by the manager's Claude; QA item D-10)
Script: `backend/scripts/measure_export_staging.py` (`--part idle|nocover|sections|probe`, commit `2836e098`); guide: `2026-11-25-export-timing-round2-guide.md`. Staging VM checkout `942356f4`, the owner's own household. No token was used: the script minted one temporary session per part from the owner's sign-in email and deleted it each time (the email is not recorded anywhere in the repository). **Nothing was changed in the app.** Round 1: `2026-11-25-export-timing-result.md`.

**What this record holds:** the figures the manager's Claude reported in chat (summaries, not the full printed output). The full printed output of every part, the "export finished" log lines and the probe part's result were still to arrive when this was written; the owner decided that this is all the measuring that will be done, so the probe result will be added here only if it is sent. Where a figure was not reported, this record says so and does not guess.

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

## Part probe (full report cover ON, then 5 minutes of CPU watching)
Running when this was written; **not reported**. It answers whether the container stays busy after the job says "ready" (leftover work from the timed-out second print).

## Reading (orchestrator)
**Measured:**
1. The start-up browsers of the old route are still running: 15 processes, 817 MB, at idle.
2. Printing the full 24-section report takes about 193 to 195 s even with no cover and no second print; the cover adds about 17 s and 1.4 MB.
3. The print cost is concentrated: overlap-common-holdings (56.5 s), holdings-all-stocks (27 s), holdings-top-by-fund (26.6 s) and analytics-cost (26 s) are about 136 s together, roughly 70% of the 195 s. overview-mutual-funds and analytics-category add about 21 s more. Most other sections cost 2 to 7 s.
4. Three sections wait 17 to 26 s for their data when it is not already cached (holdings-top-by-fund, overlap-top-pairs, transactions-cash-flow). In the full reports of round 1 the whole build stage took 2.6 s cold, so those waits depend on whether the analytics data was already cached.

**Inferred, with the reasoning:**
- The manager's Claude wrote that the cost is "not additive" because sections 1 to 12 sum to about 60 s while 24 sections take about 195 s. That compares the wrong halves: sections 13 to 24 carry most of the cost. My estimate from the reported numbers is that the printing time of the 24 single sections adds up to about 200 s, which is about what the full report takes, so print cost looks roughly additive (an estimate, because the per-section figures for sections 1 to 12 were summarised, not listed).
- The warm slowdown of round 1 did not appear here, where no second print ran. That fits the leftover-second-print explanation but does not prove it; the probe would have.

## Differences from the guide
Reported to the owner by the manager's Claude in chat; none recorded in the summaries available when this was written (no stop condition fired; the temporary session was reported deleted after each part).
