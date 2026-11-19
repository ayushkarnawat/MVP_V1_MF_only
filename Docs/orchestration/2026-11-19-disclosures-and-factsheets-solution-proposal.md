# Factsheet and portfolio-disclosure jobs: root causes and a solution proposal (19 Nov 2026)

Proposal only. Nothing was built, run on staging, or written to any database. Read from `leapswitch-redesign` (HEAD 6cf8cc81) with `git show`; the working tree on `main` was not touched. Public sites were read with plain GET requests from this machine (no user data sent).

## 1. Bottom line
The failures have **six different causes, but one reason they were mysteries**: both jobs were built so that a failure is silent. Fix the silence first (it is small), then the four code bugs, then decide the policy question for the houses that refuse our server.

| # | Cause | Kind | Houses | New in this review? |
|---|---|---|---|---|
| A | Jobs cannot fail loudly: exit 0 always, no per-house result, no log file, alerts only on days 10/20, failed sum-check stores no reason, failed downloads store nothing | Architecture | All | Known since 16 Oct (strengthening plan item 6/7), never built |
| B | Exact-date rule `disclosed != as_of` in `_fetch_dated_records` | Code bug | Franklin, plus any house dating its file on the last working day | Mechanism confirmed in code; blast radius is new |
| C | Host fallback only on HTTP 404, not on 500 | Code bug | Samco | **Root cause confirmed (L-5 said unproven)** |
| D | Registry keyed by `schemes.amc_name`; upstream renamed the house | Code/data drift | Zerodha, **in both registries** (disclosures and factsheets) | Factsheet side is new |
| E | `SINGLE_WORKBOOK_MULTI_SHEET` house that publishes two workbooks: the loop stops after the first | Code bug (strong hypothesis) | LIC (and any like it) | New |
| F | Wayback CDX `limit=-50` as a data source | Fragile design | Canara Robeco, HDFC | New for Canara |
| G | Site refuses our server's address (403/406) | Policy / network | Bajaj, WhiteOak, Trust, Angel One (+ the ten factsheet houses) | Known pattern since 16 Oct |
| H | Not published yet | Not ours | AlphaGrep | Confirmed |
| I | Unexplained: Motilal fall, ICICI 59 failures | Open | Motilal, ICICI | Narrowed (see 3) |

## 2. Why nobody could see it (cause A), with evidence
- `refresh_portfolio_disclosures` returns `success=True` unconditionally; `refresh_portfolio_disclosures_daily.py` never exits non-zero. `run-job.sh` only sends an alert email on a non-zero exit, so a run where 20 houses fail sends nothing. `refresh_fund_managers` behaves the same (`success=True`, `amcs_failed=5` on 31 Oct, exit 0).
- The cron line for `portfolio-disclosures-daily` has no output redirect (nav-daily has one). The container is `--rm`. Alerts are `logger.warning` lines that are lost.
- The lateness alerts (`no_file_found`, `target_month_not_published`, `stale_*`) fire only on days 10 and 20. `monthly_zero_batch_summary` fires only on day 20 and only lists houses with zero batches.
- A failed download writes **no row at all** (`yield reference` with `data=None`, then `failed=True`); so "no batch, not even a failed one" cannot distinguish blocked, wrong date, wrong name, or not published.
- A failed sum check keeps the batch as FAILED but `parse_errors` is only filled for sheet errors, so the reason is empty (this is the ICICI "59 failures, no reason").
- Error text is cut to 300 chars with no traceback.
- Items 6 and 7 of `2026-10-16-analytics-strengthening-plan.md` listed exactly these (non-zero exit, tracebacks, one outcome line per house per run, coverage summary, release detection). None is in the code on `leapswitch-redesign`.

## 3. Per-house findings

### B. Franklin (and the hidden blast radius)
`_fetch_dated_records` keeps a record only if `disclosed == as_of` (the exact month end). The custom locators (29 of the 52 registered houses: 27 JSON/POST chains and 2 static custom) end in it; I read each locator and all call it. Static-regex houses go through `_fetch_candidates`, which is month-based and tolerant.
- 31 Oct 2026 was a Saturday. Franklin dated its 32 files 30 Oct, so 0 files were found. Because the older September file (30 Sep) is also dropped by the same exact filter, `prior_hits` is empty, so the house is counted as `failed` and the `no_file_found` alert (days 10/20 only) goes to a log nobody keeps.
- Next weekend month-ends: **31 Jan 2027 (Sun), 28 Feb 2027 (Sun), 31 Jul 2027 (Sat), 31 Oct 2027 (Sun)**. Every one repeats this for every house that dates by last working day. Not every house does (Motilal dates 31 Oct, checked, see below), so L-5's eight houses are only the ones that were noticed. **Unknown: which other houses lost files to this in October.** The E4 "newest file date per house" query plus a discovery-only run with a relaxed date would list them.
- Side effects of an eventual fix (these must be in the fix, otherwise it creates new silent gaps): `refresh` compares `file.as_of_date < target` for `stale_fallback`; `monthly_zero_batch_summary` and the audit queries use `as_of_date == month end`; `_written_prior_months` uses `< target`. A 30 Oct batch would look "stale" or "missing" to all of these. Consumers (lookthrough, composition, overlap, equity_universe) all take newest WRITTEN `<= today`, so they are already date-tolerant: **the damage today is staler holdings for those funds, not blanks**.

### C. Samco: cause confirmed
`prefer_site_variants=True` puts the main-host URL first and the other host as `alternatives`. The download loop only moves to the next URL when `status == 404 and index+1 < len(urls)`. The main host `https://www.samcomf.com/amc-document-download/<file>.xlsx` answers **500** (reproduced here on 19 Nov, so not our IP), the real file is at `https://media.samcomf.com/scomamc/amc_documents/<file>.xlsx` (**200**, 209 KB). 500 is not 404, so the loop records an error and gives up on that file for every run. That fully explains "12 of 12 parse and match yet nothing written for 18 days". There is also a third, useless variant: the bare filename joined to the host root (404). Fix: on any 4xx/5xx or network error, try the next variant; keep the 404-only branch only for the deterministic-template houses.

### D. Zerodha: bigger than reported
Both registries are keyed by `Scheme.amc_name`. The scheme master now says "Zerodha CASE Mutual Fund". Disclosures: `zero_schemes_matched`. Factsheets: `import_pages` filters `Scheme.amc_name == "Zerodha Mutual Fund"`, so it matches 0 and `stale_manual_houses` also keys on it. The same drift will recur for any rename or merger. Fix: key registry entries by an alias set (old name + new name) and add a startup check: every registry key must have live schemes, and every live `amc_name` must have a registry entry or be on an explicit "not expected" list. That check would have caught this on the day the scheme master changed.

### E. LIC (strong hypothesis from code, needs one query)
LIC is `SINGLE_WORKBOOK_MULTI_SHEET`, but its locator returns **two** workbooks (equity and debt, covering different schemes). `_iter_located_files` stops after the first file for `single` shapes (`if single: break`, added 14 Oct in 81f3a457) and also stops at the first already-written URL. So only one of the two workbooks is ever read. L-5 matched all 43 of 43 families because it read both in memory. 75 vs 145 (about half) is consistent. Why September was 145 is not explained (September may have been written by a build before the 14 Oct change). **Check:** `SELECT count(DISTINCT source_url)` for LIC at 31 Oct; one URL confirms it. Fix: decide `single` by the registry only for the "one URL, many sheets" meaning, and never break when the locator returned more than one distinct as-of file.

### F. Canara Robeco and HDFC: Wayback as a production data source
Discovery uses the Internet Archive CDX index with `limit=-50` ("last 50 index rows, not the latest 50 disclosures; older months and some schemes may be absent", per the code's own docstring). Canara lists 27 families; the file set found depends on what the Archive happened to capture, which changes daily and lags. HDFC hit HTTP 429 on AWS on 14-16 Oct. This is a plausible cause for Canara's 112 to 82 and it cannot be reproduced from a log. Fix: Canara's own file URLs follow a date pattern under `wp-content/uploads/YYYY/MM/`; HDFC's `s3fs-public/<YYYY-MM>/...` pattern is already named in the 16 Oct plan. Use direct URL patterns first, Wayback only as a labelled fallback, and an alert when Wayback is the source. (My sandbox could not reach the CDX, so this one is inferred from the code and the 13 Oct capture notes.)

### I. Motilal and ICICI: narrowed, not solved
- **Motilal:** I tested the exact-date theory against the live site. Of 90 fund pages: **71 dated 31 Oct, 7 dated 31 Aug (stale funds), 3 dated 15 Oct (fortnightly funds)**, 9 empty. So the files are right and the date rule is not the cause. The fall (191 to 161 series) could be a different series count (denominator: schemes made inactive or merged in the scheme master), the `duplicate_match` rule (both families dropped), or one failed locator day. Cheapest discriminator: a per-fund diff "WRITTEN at 30 Sep but not at 31 Oct" per house, joined to the base fund name. It gives the exact families that dropped; then each is explained by one file.
- **ICICI:** a failed batch means the declared total or the 90-101 band check failed. The code keeps no reason. The 16 Oct note names ICICI's Gold/Silver ETF and savings/overlap sheets, and the fraction-versus-percent scale guess (Wealth Company gold ETFs) is a known weakness for near-100%-one-holding funds. Treat as hypotheses. Dry run of the ZIP's roughly 150 members with a recorder replacing the writer (record total, declared total, non-derivative total, derivative total, scale chosen) classifies all 59.

### G. The four "refused" houses
The 16 Oct plan already recorded the pattern: Angel One answers AWS addresses but not the CloudPe/LeapSwitch VM; HDFC's Wayback calls were rate-limited from AWS. September batches (8,359, written around 14-16 Oct) most likely came from the AWS-hosted run, so these four probably **never worked from this VM** (inference; the two-network explanation is the likelier of L-5's two options). The pages are public and open in a browser, so the data is not restricted, only server access. Options, in order:
1. **Ask the AMC** for an allow-listed egress IP or a data feed (Bajaj, WhiteOak, Angel One, Trust). Legitimate and durable. Same ask already planned for the largest factsheet houses.
2. **Fixed egress address** for the job (the AWS NAT address that worked for some), so the address can be given to the AMCs in option 1.
3. **By-hand route** (the existing importer), now 11 houses a month for disclosures and 10 for factsheets. Make it a managed process (see below).
4. Not recommended and against the project's own rule (Run 7): rotating addresses, header spoofing beyond the browser UA already sent, or anything that evades bot protection.

## 4. The solution, in order

### Step 0 (before 05:45 on 20 Nov, no code)
Leave the run alone, as decided. Tomorrow is a real experiment for Samco (expect still failing), Zerodha (still failing), LIC, Motilal, Canara. Add one thing: after the run, take the E1/E4 snapshot and the new two queries below, so any change is attributable. Do not hand-run the job.

### Step 1: make failure visible (FX-L3 + FX-L4, widened). Do this first.
One small module, `portfolio_disclosure_outcomes`, with a closed set of per-house outcomes:
`WRITTEN`, `PARTIAL`, `NOT_PUBLISHED`, `WRONG_DATE`, `BLOCKED(status)`, `DOWNLOAD_ERROR(status)`, `PARSE_ERROR`, `FAILED_SUM_CHECK`, `UNMATCHED`, `NO_SCHEME_ROWS`, `NOT_ONBOARDED`.
- One structured line per house per run, always (not day-gated), and a run summary with counts by outcome.
- Persist it. Use the existing tables: failed batches keep `parse_errors` (fill it for sum-check failures with totals and scale chosen, truncate nothing); for houses with no batch, an ops row. If a new table is required, justify it against reusing `disclosure_batches` with a status first (project rule: justify new tables). A single `disclosure_run_outcomes(run_date, amc_name, outcome, detail)` is the smallest honest option and is the only addition I would propose.
- Exit non-zero (so `run-job.sh` emails) when failed houses exceed a threshold, or when any house that was WRITTEN last month is not WRITTEN/NOT_PUBLISHED now.
- Redirect cron output to `/var/log/unifolio-disclosures.log` with logrotate, like nav-daily.
- Day-based alerts become state-based: alert on day 5 and 10 when a house that wrote last month has nothing; weekly digest of the outcome table. Day 20 coverage line: houses, funds, and funds as a share of expected.
- The same outcome function becomes the read-only "diagnose" tool used by the audit (it is what L-5 did by hand).
- Same treatment for `fund-managers-monthly`: it runs once on the 10th, so a house that publishes on the 11th waits a month. Make it daily over days 10-20 with skip-if-current, as disclosures already do.

### Step 2: the code fixes, each test-first, ordered by funds recovered
1. **FX-L1 date rule** (Franklin 321 live series, plus unknown others). Accept the last business day on or before the month end: window `[target-3d, target]`, Monday to Friday only, and never a date from the prior month. Compare by **calendar month** in `refresh`, `_written_prior_months`, `monthly_zero_batch_summary`, `stale_fallback`, and the audit queries (E1/E4). Fixtures: Saturday, Sunday, normal month end, a holiday Friday, a house that re-dates 30 Oct to 31 Oct later (must not create two live batches per scheme per month).
2. **FX-L5 Samco fallback** (31 series, trivial): try the next variant on any failure for `prefer_site_variants` houses; drop the root-relative bare variant.
3. **FX-L2 Zerodha** (25 series disclosures plus factsheet side): alias set, both registries, plus the registry-vs-scheme-master consistency check described under D.
4. **FX-L6 LIC multi-workbook** (about 70 series): stop breaking on `single` when the locator returned several distinct files. One test with two workbooks covering different schemes.
5. **FX-L7 Wayback demotion** (Canara about 30, HDFC about 224 series): direct URL pattern first.
6. **FX-L8 ICICI** once the recorder shows the cause (59 batches, 551 of 2,512 written).

### Step 3: the blocked and manual houses as a process, not a hope
- Ask Bajaj, WhiteOak, Angel One, Trust, plus the five largest factsheet houses (ICICI, Kotak, HDFC, Axis, Bandhan) for an allow-listed IP or a feed. One letter, one tracker.
- Build the shared admin upload screen already proposed on 16 Oct (one screen for both pipelines, validation before commit), now justified: disclosures by hand rises from 7 to up to 11 houses and factsheets are 10. Until then keep the runbook, add a "manual due" alert from day 5 (not day 10), naming the houses.
- Use outcome history (first-seen day per house) to learn real publishing days; set alert days per house instead of a global 10/20.

### Step 4: close the October gap for users (decisions for you)
- Franklin's 32 public workbooks can be imported now with the existing importer using the file's real date (`--allow-any-date`), but only after FX-L1 so the audit sees them; otherwise do it after the fix and re-run the job (it is idempotent per URL). Recommendation: wait for FX-L1, then let the daily job (it runs days 1-20 only, so also extend the window, below) pick them up.
- **The job window ends on day 20.** All fixes above land after 20 Nov, so December's run is the first real test. Extend the cron window to days 1-25 (cost: five extra runs) or add a manual "re-run for last month" command that is safe to repeat.
- Measure with the three agreed numbers, headline = open-ended plan and option series, ETFs and FMPs reported separately (your decision of 19 Nov).

## 5. Verification plan (read-only, before any fix is built)
1. LIC: `SELECT count(DISTINCT source_url) FROM disclosure_batches WHERE amc_name='LIC Mutual Fund' AND as_of_date='2026-10-31' AND status='written'` (1 confirms E).
2. Per-house drop list: families with a WRITTEN batch at 30 Sep and none at 31 Oct, grouped by house (answers Motilal, Canara, LIC, Franklin, and finds houses nobody noticed).
3. Relaxed-date discovery for all 45 JSON/custom houses against 31 Oct with a 3-day window: which houses have a file dated 28-30 Oct that the exact rule hid.
4. ICICI recorder dry run (writer replaced by a recorder).
5. After tomorrow's 05:45 run: repeat 1-2 and E1/E4.
6. Any request made to a site stays plain GET with the browser UA already in use.

## 6. What is inferred, not proven
- LIC cause (needs query 1). Canara cause (Wayback not reachable from here). ICICI cause. Motilal cause. The September data of the four refused houses coming from the AWS network (inference from the 16 Oct notes and dates).
- Proven: B (code), C (code plus live 500/200 reproduction), D (code), A (code and cron file), Motilal dates (live), Samco file set (live).

## 7. Decisions I need from you
1. Order: visibility first (Step 1), then fixes, as above? Recommended yes.
2. New table `disclosure_run_outcomes`, or store outcomes only in logs plus `parse_errors`? Recommended the table (small, ops-only).
3. Cron window days 1-20 to 1-25?
4. Approach the AMCs for allow-listing, and who sends the letter?
5. Do the review gate and the plan-writing for FX-L1..L8 go to the Batch A style process, with me writing the plan only?
