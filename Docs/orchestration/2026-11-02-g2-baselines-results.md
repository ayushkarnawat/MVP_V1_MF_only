# G2 timing baselines, measured on the staging VM, Monday 2 Nov 2026 (08:41 to 08:49 IST)

Run by the orchestrating Claude from the playbook `2026-11-02-monday-vm-run.md`. Read-only: no `--allow-nav-writes`, no `--include-live-fetch`, nothing written to staging, no deploy. Test household: user `bed26e3e` (2 members, 8 held schemes, 651 transactions). Raw outputs are on the VM in `~/g2/` (counts and milliseconds only).

## What the VM runs
Commit `3602c510` on `leapswitch-redesign`, Alembic head 0046. None of Run 1 to Run 5 is deployed, so these are **"before" numbers** for the S.1 comparison (no analytics script more than 10% slower; matrix under 3000 ms added).

## Pre-checks (Step 1)
- Latest stored prices: 30 Oct (1,394 rows, last full trading day) and 31 Oct (94 rows). No row for today: normal, AMFI publishes in the evening.
- Analytics recomputed for every user this morning (06:30 to 06:37 IST); the test household has all 15 sections for each of its 3 scopes, 0 failed; no recompute in flight (`started_at` empty for all users). "Generation 0" is a change counter, not "never recomputed".
- Memory 13,108 MB available (threshold 1,000), disk 71% (threshold 80%). Read directly with `free` and `df`; the check scripts send an alert email when they fail.
- Month snapshots fresh (the 31 Oct month-end row exists), so no History-page refresh was needed.

## Why the playbook's "after 06:35 IST" was not enough
The old price lookup only trusts a stored price dated exactly today for "today" (`get_navs_on_or_before`). Today's price is published in the evening, so any strict holdings call before then needs a live download, and the guards in the Home, fund-page and matrix scripts stop it (the matrix help text says so). The unflagged Home, fund-page and matrix runs all stopped at the guard on this day (nothing written). **Fix used:** `--simulate-fresh-cache` for Home and fund page (it treats yesterday as today in the price module, no download, guard unchanged). The matrix script has no such flag, so the same in-process date change was applied through a one-off `python -` call inside the container (no file edited, guard unchanged, no forbidden flag). These readings are therefore the **stored-price path** (how Run 2's Home reads prices), not the strict path with a live download.

## Results (A and B within 30% of each other everywhere, so no third run was needed)

| Script | Reading | Limit | Result |
|---|---|---|---|
| Month detail, one member | median 113 ms (A), 123 ms (B); worst 180 | 1,000 ms | PASS (30 Oct: 243 to 261 ms) |
| Month detail, whole household | median 208 ms (A), 239 ms (B); worst 346 | 1,000 ms | PASS |
| Home (stored-price path) | cold-open estimate 291 ms (A), 274 ms (B): holdings cold 93/92, look-through 188/171, bulk read 11 | 1,500 ms | PASS |
| Home, for comparison only | Dashboard aggregate holdings + XIRR 962/951 ms | none | informational |
| Fund page (scheme-filtered, 4 funds) | Tier 1 all PASS (max 8.8 to 14.1 ms vs 300). Tier 2: 20 of 24 calls under 50 ms; the 4 slow calls (the same 4 in A and B) were 63 to 96 ms | 50 ms | script prints FAIL, same as 30 Oct (74 to 107 ms), known and accepted below 100 ms: worst today 95.9 ms |
| Benchmark matrix, combined (2 members, 9 funds) | "added by windows" median 1,329 ms (A), 1,382 ms (B); worst 1,387 / 1,452 | under 3,000 ms | PASS |
| Matrix, member 1 (5 funds) | added by windows median 819 / 791; worst 965 / 992 | | PASS |
| Matrix, member 2 (4 funds) | added by windows median 763 / 697; worst 788 / 764 | | PASS |
| Matrix, existing end-to-end warm, combined | portfolio benchmark 4,755 / 4,967 ms; fund benchmarks 3,265 / 3,201 ms | none | baseline for the legacy computation |

Gate verdict: **G2 baselines recorded; every gate passes** (Home, month detail, matrix; the fund page sits at its known, accepted level).

## What this does not cover (still open)
- **New-code timing (T2.10, T3.7, T4.3)** and **Run 3's real-data checks** (`benchmark_series_check.py`, `benchmark_diff_report.py`) need migration 0049 and the new code on the VM: they belong to the S.1 deploy checklist (after the owner's explicit go), compared with the table above.
- **Strict-path Home and matrix numbers** (with the live download) were not measured. Optional: after about 23:00 IST on a trading day, once AMFI has published and today's prices are stored through one normal app visit for the test household, the three scripts run without any flag.
- A full `run_analytics_recompute.py` against the 15-minute stale ceiling was not repeated (30 Oct: all users 6 min 10.9 s; this morning's job finished all users in about 7 minutes, 06:30 to 06:37 IST).
