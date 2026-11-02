# Staging Deploy Guide: the 13 change requests release (`leapswitch-redesign`) to `ls-redesign.unifolio.in`

**Status: DRAFT ledger, started 2 Nov 2026 (Runs 1 to 4 built, Run 5 in progress).** Nothing here is run until Runs 5 to 7 and D.1 are done and **the owner gives an explicit go**. This file is the single place that collects every check, real-data run and timing run that could not be done before the deploy. S.1 turns sections 3 and 4 into numbered command steps in the style of `2026-10-29-staging-deploy-guide-individual-fund.md` (steps 1 to 21, GATE words, the manager's own Claude as sole executor), then the manager runs them. Add to the ledger at every run's close-out; never leave a deferred check only in a chat.

## 1. What ships and what changes in the database
- Migrations **0047** (reported valuation table, `stock_master` columns), **0048** (composite ranking dropped), **0049** (benchmark index registry: `index_name` enum to text, `benchmark_index_master` with 23 rows, `scheme_benchmark`), **0050** (Head of Family: `is_head`, `head_change_requests`, `otp_requests.purpose`). Alembic head goes **0046 to 0050 together**. (0051 does not exist; 0048 is not LinkedIn.)
- One new crontab line: `0 6 15 * *` for `check_manual_factsheets.py` (the owner installs it at the deploy).
- Every stored analytics section must be **recomputed after the deploy** (new payload fields, removed composite, new benchmark and valuation data).
- Branch `leapswitch-redesign` only; never `main`, never `feat/leapswitch-staging`.

## 2. Before the deploy: things only the owner or manager can supply
| Id | What | Why it gates |
|---|---|---|
| O12 | Push `leapswitch-redesign` (owner's word), then the manager's Claude pulls | the VM and manager cannot see local commits |
| O6 | The 18-fund net-equity list (read-only VM query defined in the Run 1 handoff) | overlap counts equity funds only |
| O7 | Confirm the fund-manager role readings (Associate, Co-Fund Manager, portion labels, senior titles, future start dates) | manager cards |
| O8 | Confirm Real Estate shows live on Home | product |
| O9 | Real UTI and Groww factsheet PDFs (with word boxes) | their benchmark and valuation readers are unbuilt or fail closed; not a blocker for the deploy |
| O11 | Confirm the orchestrator's product decisions: the 70% equity coverage rule for the portfolio P/E and P/B total; index funds detected by the words "index" or "ETF"; BSE ratio compute rule; the fund page keeps size weighting while Category Average uses simple means; 23 registered indices instead of about 40; plain-word benchmark source labels; benchmark notes in the backend only | deploying makes them live |
| Printed returns | For `benchmark_series_check.py`: printed 1Y, 3Y, 5Y returns from the real factsheets **at the same as-on date**, for the funds the owner wants verified | the PASS table cannot be produced without them |
| Decision | T2.12 book value from filings: close it on the Yahoo/screener fallbacks, or find a newer source (see section 6) | no code change either way unless a source is found |

## 3. Deploy mechanics (to be completed at S.1)
Follow the Individual Fund guide's steps, with these differences and the 30 Oct VM lessons:
1. Pre-checks: query `analytics_recompute_status` first (`started_at` must be empty for every user); **never stop a running recompute**; `check-memory.sh`, `check-disk.sh`; no import in progress.
2. Backup before anything (GATE), then `alembic current` must be `0046`; after the deploy it must be `0050`.
3. Start long jobs in the background with a completion notification, never `sleep`; read `.env` under `sudo`; every query through the compose Postgres container (the host has no `psql`).
4. Forced analytics recompute (GATE), then confirm **every scope of every user has all 15 sections, 0 failed** (30 Oct and 2 Nov: 3 scopes x 15 for the test household).
5. Install the `0 6 15 * *` cron line; confirm with `crontab -l`.
6. Timing scripts only after today's prices are stored (see 4.3 note).

## 4. The ledger: every deferred check, by run
### 4.1 Database and data (read-only SQL)
| Id | Check | Pass |
|---|---|---|
| L1 | `select version_num from alembic_version` | `0050` |
| L2 | `benchmark_index_master` rows; `scheme_benchmark` exists; `benchmark_index_history.index_name` is text | 23 rows; types as stated |
| L3 | After the next daily benchmark job: rows exist in `benchmark_index_history` for every active non-legacy index; the job's failure alert did not fire | rows present, no alert |
| L4 | `household_members`: exactly one `is_head` per user, and it is the `self` member; accounts with no self row have no head | 0 violations |
| L5 | `scheme_reported_valuation` receives rows for Invesco, ITI, Kotak, ABSL after their factsheets are imported; ages follow the 75-day rule | rows with `as_of` dates |
| L6 | `stock_master.bse_scrip_code`, `pe_as_of`, `pb_as_of`, `pe_source` populated for BSE-only held stocks after the nightly job | non-null for held BSE-only stocks |

### 4.2 Run 3 real-data runs (need migration 0049 on the VM; cannot run before the deploy)
| Id | Check | How | Pass |
|---|---|---|---|
| L7 | Benchmark series vs printed returns | `benchmark_series_check.py --index <key> --as-of <date> --printed 1Y=.. --printed 3Y=.. --printed 5Y=..` read-only; the 0.05-point rule | PASS table; **the script never activates a series, the owner reviews the report first** |
| L8 | Gold and silver ETF held-fund check | `--metal gold --user-id <id> --held-etf <id> --as-of <date> --printed 1Y=..` | within 0.5 point; **result is informational only**: gold and silver funds show printed returns only (owner accepted, O2) |
| L9 | Benchmark audit for the test household | `benchmark_diff_report.py --user-id <id>`: counts and percentage-point differences only | owner reviews before any user sees changed benchmarks |
| L10 | Pending index candidates (Quality 30, Value 50, ESG, Healthcare, factors, G-Sec, SDL) | `step0-vm-scripts/verify_benchmark_sources.sh`; a verified name is one registry row, no migration | each candidate verified or left out |
| L11 | Mapping check by hand (O10, about 1 day) | the owner or manager reads fund-to-benchmark mappings on a sample | no wrong mapping left active |
| L12 | Screen labels | For held gold ETFs, Axis-style printed tables, WhiteOak, UTI and Groww funds | plain words; UTI and Groww fail closed ("As printed..." or "No benchmark"), never a wrong index |

### 4.3 Timing: new code vs the 2 Nov baselines (T2.10, T3.7, T4.3)
Baselines measured 2 Nov on the old code, stored-price path, test household `bed26e3e` (`2026-11-02-g2-baselines-results.md`). **Run the same commands as then, same household.** Rule: no analytics script more than 10% slower than its baseline medians, and every hard limit holds.

| Script | Baseline (medians, A and B) | Hard limit |
|---|---|---|
| `measure_home_staging.py --runs 5` | Home cold-open 291 and 274 ms | 1,500 ms |
| `measure_month_detail.py <member>` and `--aggregate --user-id` | 113 / 123 ms; 208 / 239 ms | 1,000 ms |
| `measure_benchmark_matrix.py --runs 3` | added by windows, combined 1,329 / 1,382 ms; member scopes 697 to 819 ms | 3,000 ms |
| `measure_fund_page_staging.py --schemes 4 --runs 3 --scheme-filtered` | worst calls 63 to 96 ms; script prints FAIL against its 50 ms line, known and accepted below 100 ms | 100 ms |
| Holdings endpoint, family view (T4.3) | no baseline yet: measure the family holdings call and the single-member call on the old and new code if possible, else report absolute | no regression on the single-member call |
| Full `run_analytics_recompute.py` | 6 min 10.9 s (30 Oct, all users); about 7 min on the morning job 2 Nov | under 15 min stale ceiling |

Note: Home, the fund page and the matrix stop at their read-only guard before the evening AMFI publish, because the old lookup trusts only a stored price dated today. After the deploy, run them (a) with `--simulate-fresh-cache` for like-for-like comparison with the baseline, and (b) optionally unflagged after about 23:00 IST once today's prices are stored by one normal app visit. Never use `--allow-nav-writes` or `--include-live-fetch` without the owner's explicit word.

### 4.4 Visual and behaviour QA (no visual check was possible during the builds; the owner or manager does all of these in a browser)
| Id | Run | Check |
|---|---|---|
| Q1 | 1 | Market cap bars total 100% with the unclassified note; asset class shows five slices including Real Estate (Home and Mutual Funds); fund manager cards (main manager marked or assumed); overlap By category tab and the fourth reason sentence; Stock Concentration gone everywhere |
| Q2 | 2 | Other Analytics: Valuation by Fund, Performance Ranking (ties, index-fund disclaimer, banner sentence), Category Average Comparison tables, Fund Quality Scores hidden; old composite payloads show "Performance rankings are updating." until the recompute |
| Q3 | 3 | Fund page and Performance benchmark screens (source labels, windows, notes); Transactions and Cash Flow "Switches: Included/Excluded" control (default Excluded; Net invested unchanged; tile renamed "Net invested"); print stays excluded |
| Q4 | 4 | Family holdings: parent rows with split bar (shares total 100.00%), expand by mouse and keyboard, member rows with masked folio, phone cards, a fund held by one member has no expander; single-member view unchanged; parent XIRR vs members' XIRR; dash above four members |
| Q5 | 5 and 6 | **Head of Family hand-over with two real inboxes**: four codes (emails through SES; phone codes in stub mode show on screen), the swap, everyone signed out, the new head signs in and accepts the terms, labels flipped, the old head's Google or old contact can no longer sign in, the undo link within 24 hours (and its refusals), change-back limit of 7 days, a head with no PAN is not eligible |
| Q6 | 7 | Fund logos everywhere, one heading per card, plain banners, green buttons `#22C55E` with white text (known contrast shortfall 2.28:1: owner's choice) |

### 4.5 Jobs and alerts
| Id | Check |
|---|---|
| L13 | `0 6 15 * *` `check_manual_factsheets.py` is installed; run it by hand once (read-only) and confirm it names the houses still needing a hand import |
| L14 | The daily NAV, benchmark and analytics jobs ran after the deploy without a failure alert; `job_runs` shows each |
| L15 | Optional: a second factsheet capture after the 10 Nov `fund-managers-monthly` job (Priority 1 in `DEFERRED_FEATURES.md`) |

## 5. Rollback
Prefer restore from the pre-deploy backup, only on the manager's explicit yes (`rollback.sh` / `restore.sh`). Migration downgrades exist (0050, 0048 verified identical to 0034), but **0049's downgrade refuses once new text index keys exist**, so a downgrade after the first benchmark job needs the index rows removed first. Decide at S.1; never run a rollback script on this ledger's authority.

## 6. Not deployment items, but open
- **T2.12 (book value from NSE filings), handoff `cr-r2-filings-book-value-handoff.md`.** The probe ran from the VM on 1 Nov: NSE answers and the filings contain the needed figures (TCS: equity attributable to owners; HDFC Bank: capital plus reserves; shares derived as paid-up capital over face value), **but the NSE list returns nothing newer than Dec 2024 (quarterly) and Mar 2024 (annual)**. Recommended: stay on the labelled Yahoo and screener fallbacks and close T2.12. A bounded search for another source (for example BSE filing feeds) was asked for by the owner and has not been done.
- UTI valuation reader and UTI and Groww benchmark readers: after O9.
- Yahoo `<ticker>.BO` from the VM's IP returns 429 (datacenter limit); the app's own client works from an Indian home IP. If Yahoo blocks the VM, BSE-only ratios fall back to the provider value or screener.in. Check once from the VM after the deploy (L6).
