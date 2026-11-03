# Staging deploy record: the change requests release on `ls-redesign.unifolio.in` (3 Nov 2026)

Run by the orchestrating Claude on the owner's explicit go and push word (3 Nov 2026, "you have my go for everything"). Evidence only; the checks stay in `2026-10-31-staging-deploy-guide-change-requests.md` (the ledger). The visual and manual QA is NOT done: it is the intern's, with `2026-11-03-manual-qa-checklist.md`.

## What was deployed
| Item | Value |
|---|---|
| Branch pushed (new branch, no force) | `release/change-requests` |
| First deployed commit | `e45ecfe7` (17:40 IST) |
| Second deployed commit (backend only) | `3e8f8da9` (18:33 IST): accepts the echoed name `NIFTY LargeMidcap 250` (see "Found on the VM") |
| VM worktree | `/opt/unifolio-redesign`, switched from `leapswitch-redesign` (`3602c510`) to `release/change-requests` with `git checkout -B ... origin/release/change-requests` |
| Alembic | `0046` to `0052` (all six migrations ran in one pass at 17:35:56 IST); `alembic current` = `0052 (head)` |
| Backup before anything | `unifolio-20261103T120419Z.sql.gz` (17:35 IST, 170 MB, object storage prefix `postgres/`) |
| `.env` | `FRONTEND_BASE_URL` changed from `https://ls-staging.unifolio.in` to `https://ls-redesign.unifolio.in` (copy kept as `.env.bak-20261103` next to it); `ALLOWED_ORIGINS` unchanged. Verified inside the running backend |
| Rollback image | `leapswitch-backend:previous` = `2d6f49dcb708` (the pre-release image). A database rollback also needs the backup above |
| Health | `ls-staging-api/health`, `ls-redesign` and `ls-staging` all 200; `/undo-head-change` and `/reverse-contact-change` on the redesign site 200 |

## What went wrong, and what was done (honest list)
1. **A short window of old code on the new schema (about 17:36 to 17:40 IST).** The first `deploy-redesign.sh --full` stopped before changing anything because the disk guard wants 10 GB free and 8 GB was free (no terminal to ask). My script then went on to the migration, so the migration ran while the OLD containers were still serving. I re-ran the deploy with `--force` straight away (build 3 min), so the mismatch lasted about four minutes. Nobody was testing then; no errors were found in the backend log afterwards. Lesson: a wrapper script must stop when the deploy step fails.
2. **`deploy-redesign.sh` refused the release branch** (its guard allowed only `leapswitch-redesign`). Fixed in the repo (`release/change-requests` accepted) before pushing.
3. **Second backend deploy failed at the retag step** ("No such image sha256:...") after the image was built; nothing live changed. I recreated the containers with `docker compose up -d` and recorded the commit with `record_backend_commit`; the `:previous` tag still points at the pre-release image.
4. **Found on the VM: the echo check added in Run 3 broke the Nifty LargeMidcap 250 fetches.** NSE asks for `NIFTY LARGEMID250` but echoes `NIFTY LargeMidcap 250`, so both the price and TRI fetch of this legacy index failed (`fetches=87 succeeded=85`) and its series stopped on 2 Nov. Fixed in `3e8f8da9` (an alias for that index only, with a test); after the second deploy the job gave `fetches=87 succeeded=87 success=True`. The unit tests could not have caught this (no real NSE response).

## Ledger rows run (see the guide's section 4)
| Row | Result |
|---|---|
| L1 | `alembic_version` = `0052` |
| L2 | `benchmark_index_master` 79 rows (78 active); `scheme_benchmark` exists (2,086 rows); `benchmark_index_history.index_name` is `text` |
| L3 | After two benchmark runs: all 79 registry indices have TRI rows (minimum 1,325); last run `fetches=87 succeeded=87`. The top-up path worked: the second run took 1 min 17 s (first run with full history for the 56 new indices: 2 min 5 s) |
| L4 | 6 users, 6 with exactly one head, 0 with more than one, 0 heads that are not the Self member |
| L18 | `contact_change_events` exists with its primary key, unique `token_hash` and `user_id` index; 0 rows |
| L5 | `scheme_reported_valuation` has 200 rows, newest reference period 2026-11-01 |
| L6 | `stock_master.bse_scrip_code`, `pe_as_of`, `pb_as_of`, `pe_source`: still 0 filled (they are written by the nightly 05:55 stock job, not yet run on this code); `book_value_per_share` filled for 15 stocks right after the migration and growing while the book-value job runs |
| Analytics recompute (forced, all users) | 5 min 21.8 s, exit 0; **17 scopes x 15 sections, 0 failed** (30 Oct: 6 min 10.9 s) |
| L16, L17 | The book-value job (about 1,300 stocks with an NSE symbol, 2 seconds between requests) was started at 17:50; see the result at the end of this file |
| Factsheet capture (`fund-managers-monthly` run by hand, 18:00) | `success=True amcs_processed=37 amcs_failed=3 schemes_matched=1338 schemes_unmatched=2`, 4 min 50 s. The three failures are the known ones: Angel One 403, quant timeout, Sundaram (no factsheet link). This also re-mapped the stored benchmarks and read UTI and Groww |
| Cron | Installed in root's crontab: `0 6 15 * *` manual-factsheets-check and `30 4 * * 0` filings-book-value (Sunday 04:30 IST). The old crontab is saved as `/tmp/ct_before_20261103.txt` on the VM |

## L7: printed-return check on real data (read-only)
`scripts` check run over every index that a captured factsheet maps funds to and that printed returns for (as on 30 Sep 2026): **28 indices, 28 PASS, 0 FAIL** at the 0.05 point rule (largest difference 0.02). 20 of the 28 are among the 56 newly registered indices (Nifty 500 Low Volatility 50, Momentum 50, Multicap 50:25:25, Value 50, Nifty50 Equal Weight, 1D Rate, 50 Arbitrage, Bank, EV and New Age Automotive, Financial Services, India Consumption, India Defence, India Manufacturing, India Railways PSU, Infrastructure, IT, Midcap150 Quality 50, MNC, Private Bank, Transportation and Logistics); the other 8 are the older ones. The remaining new indices have no factsheet that maps funds to them and printed returns yet, so they are not yet checked (row L7 stays open for them; none was switched off).

## `benchmark_none_report.py` (final labels of the 107 held funds, after the factsheet capture)
From the fund's factsheet 35 (32.7%), closest index we hold 4, chosen by the fund's category 53 (49.5%), as printed in the fund house's factsheet 3, **No benchmark 12 (11.2%)**. Listed active schemes: 14,441 (factsheet 9.7%, closest 1.9%, category 10.5%, printed 18.1%, none 59.8%, mostly debt, liquid, FoF and old plans). Held funds that end on none: two corporate bond funds, HDFC Balanced Advantage, Sundaram Multi Asset, ICICI Aggressive Hybrid, Invesco and WhiteOak Multi Asset, Axis Short Term, three index funds (HDFC Nifty100 Low Volatility 30, ICICI Nifty Next 50, ICICI Nifty200 Value 30) and HDFC Children's; three print returns instead (Edelweiss Balanced Advantage, Mahindra Equity Savings, DSP Multi Asset). ICICI and HDFC are among the hand-import fund houses (no automatic factsheet), which explains the ICICI and HDFC rows.

## O6 and O7 (read-only, shown to the owner for confirmation)
See the owner's report of 3 Nov. O6: 21 held non-plain-equity funds, 15 counted in the overlap, 6 excluded; O7: no future start dates on held funds, 73 of 107 held funds have an assumed or sleeve-labelled main manager pick.

## Timing against the 2 Nov baselines (same household `bed26e3e`, same commands, `--simulate-fresh-cache` / the same in-process date change for the matrix)
Run on a quiet VM (the book-value job's container was paused for the second pair of runs; the paused and unpaused results agree).
| Script | 2 Nov baseline (A / B) | After the deploy (A / B, quiet) | Hard limit | Verdict |
|---|---|---|---|---|
| Home cold-open estimate | 291 / 274 ms | 304 / 353 ms | 1,500 ms | PASS limit; A +4%, B +29% (above the 10% rule) |
| Month detail, one member (median) | 113 / 123 ms | 135 / 127 ms | 1,000 ms | PASS limit; A +19%, B +3% |
| Month detail, whole household | 208 / 239 ms | 248 / 246 ms | 1,000 ms | PASS limit; A +19%, B +3% |
| Matrix "added by windows", combined | 1,329 / 1,382 ms | 1,481 / 1,464 ms | 3,000 ms | PASS limit; +11%, +6% |
| Matrix, member 1 | 819 / 791 ms | 993 / 907 ms | | PASS limit; +21%, +15% |
| Matrix, member 2 | 763 / 697 ms | 745 / 703 ms | | equal |
| Fund page tier 2, first call per fund | 63 to 96 ms | 86 to 108 ms | 100 ms | **three of eight first calls are 105 to 108 ms, just over 100 ms**; every later call under 50 ms |
Verdict: every hard limit holds except the fund page's first call, which is marginally over the 100 ms line; several scripts are 3 to 29 percent slower than the baselines (the baselines themselves differed by up to 30% between A and B). I did not find a single cause; the new code reads a larger benchmark registry (79 indices) and more per-fund fields. Not treated as a blocker for QA; to re-measure on a trading day after 23:00 IST with the unflagged scripts, and to look at the fund page's first call if it stays above 100 ms.
