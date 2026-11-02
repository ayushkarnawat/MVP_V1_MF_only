# Runbook: the Excel for the chartered accountant (seven funds, five parameters)

**What this is.** A step-by-step playbook for the orchestrating Claude. The background, the reasons the Excel was not sent on 2 Nov, the workbook specification and the message already given to the owner are in `2026-11-02-ca-excel-seven-funds.md` (read it first). This file says **what to do, in order, and what to ask the owner at each step**.

**Trigger the owner pastes (any time, in any session):**
> Do the CA Excel for the seven funds. Read `Docs/orchestration/2026-11-02-ca-excel-runbook.md` and follow it from the first step that is not done. Ask me for what you need, one thing at a time.

**State on 2 Nov 2026 (update this block as steps finish):**
| Step | State |
|---|---|
| 1 Bandhan September portfolio workbook | NOT DONE (file not supplied; Bandhan has no holdings in the system) |
| 2 CA's answers (which Motilal fund, Direct or Regular) | NOT ASKED YET (the holding message asks the Motilal question; the plan type is assumed Direct, see 2.2) |
| 3 Holding message sent to the CA | owner sends it (text in the other file) |
| 4 Deploy (S.1) and the checks | NOT DONE: runs 5, 6, 7, T2.12 Step B and D.1 come first |
| 5 Export design, build, verify, send | NOT STARTED |

**Hard rules.** Every VM step only reads, **except** the Bandhan hand import in step 1.4, which is an allowed write because the owner supplies the file and says go. Never run `clean-db`, `restore`, `rollback` or a deploy here. Never use `--allow-nav-writes` or `--include-live-fetch`. The Excel contains public fund data only: no user, household, folio or account data, no internal ids. Commit the runbook and spec, **not** the `.xlsx`. Do not push. Plain words in everything the CA reads.

---
## Phase 1: can be done now or any time before the deploy

### 1.1 Ask the owner for the Bandhan file
Say: "I need the Bandhan Mutual Fund **monthly portfolio workbook as of 30 September 2026** that includes Bandhan Small Cap Fund. Please download it from https://bandhanmutual.com/downloads/portfolio-summary/monthly (a person has to do this: the page's list is encrypted), save it in one folder, and tell me the folder path. If Bandhan publishes one file per fund group, I need the one with the equity funds; if you are unsure, download every September 2026 file for Bandhan and I will pick." (The repo's sample `backend/tests/fixtures/portfolio_disclosures/bandhan-debt-funds_asof_2026-09-30.xlsx` shows the naming style: the equity one is likely `bandhan-equity-funds...` or similar.)
Do not guess a file and do not fetch it yourself.

### 1.2 Check the file locally, no database, no staging
From `backend` with `.venv-win`: load the bytes and run, in a scratch script in the scratchpad folder (not the repo), `sniff_workbook_format`, `parse_workbook` and `read_index_sheet` from `app.services.analytics.portfolio_disclosure_parsing`. Report: the sheet names, the sheet that is Bandhan Small Cap Fund, its number of holdings rows, the sum of `pct_to_nav` against the declared total, and any sheet with an error. Stop and tell the owner if Small Cap is missing, a sheet is unreadable, or the percentages do not add up to about 100.

### 1.3 Get the owner's go
Show the 1.2 result and the exact command below. Wait for a clear yes.

### 1.4 Import on the VM (the only staging write in this runbook)
1. Copy the file to the VM folder `/home/deploy/imports/` (`scp` via WSL, same pattern as the earlier probes: `wsl.exe -e bash -c "scp <file> deploy@ls-staging.unifolio.in:/home/deploy/imports/"`; create the folder first).
2. From `/opt/unifolio-redesign/deploy/leapswitch`, run (the compose service has no `imports` mount, so mount it read-only for this one run):
   `sudo docker compose run --rm -T -v /home/deploy/imports:/imports:ro backend python scripts/jobs/import_manual_portfolio_disclosures.py --amc "Bandhan Mutual Fund" --file /imports/<file name> --as-of 2026-09-30`
3. **Date rules (from `portfolio_disclosure_manual.py`):** the date must be a month-end (30 Sep is); a date more than 45 days old needs `--allow-old`, and 30 Sep + 45 days is **14 Nov 2026**, so from 15 Nov add `--allow-old`. A future date is never allowed. All files are checked before any write; a bad file writes nothing.
4. Expected output: `matched=<n> unmatched=<m> schemes_written=<k>`. Bandhan has many schemes (870 batch rows across plans), so `unmatched` may be non-zero for sheets that have no active scheme; list them for the owner.

### 1.5 Verify the import
Read-only SQL through the Postgres container (pattern in `Docs/orchestration/2026-11-02-monday-vm-run.md`, SQL fed as a file on stdin): for `Bandhan Small Cap Fund - Direct Plan - Growth` the batch for `2026-09-30` must have `status = written`, holdings rows > 0, `equity_domestic` percentages near the declared total. Also check that the 31 Oct batch (still `awaiting_manual_upload`, empty) does **not** shadow it: the fund page and the export must read the latest **written** batch (check `fund_page/composition.py::_latest_batch` and the export's own query). If the empty newer batch wins, stop and tell the owner; do not delete rows.

### 1.6 The CA's answers (the owner relays them)
- 2.1 Which Motilal momentum fund: Active Momentum Fund (sectoral/thematic), Nifty 200 Momentum 30 Index Fund, or Nifty 500 Momentum 50 Index Fund.
- 2.2 Direct or Regular plan. **Default Direct Plan - Growth** (holdings are identical across plans; only returns differ). Scheme ids on the VM on 2 Nov, Direct Growth: Axis Multicap `be51295a`, Bandhan Small Cap `51764272`, ICICI Prudential Flexi Cap `288b4e0b`, Motilal Active Momentum `f50c8e83`, Motilal Nifty 200 Momentum 30 `719c436b`, Motilal Nifty 500 Momentum 50 `35870902`, Nippon India Large Cap `119492d1`, Parag Parikh Flexi Cap `fe28bba8`. Re-read the full ids from `schemes` at run time; do not hard-code.
- 2.3 Confirm that "category average comparison" and "ranking" mean the **Other Analytics screens** (Category Average Comparison with simple means; Performance Ranking), not the fund page's peer charts. If he means the fund page peers, the method differs (the fund page keeps size weighting): record his answer here.

---
## Phase 2: after the S.1 deploy (do not start earlier)
Check each, read-only, and stop at the first failure:
1. The deployed commit and `alembic current = 0050` (`2026-10-31-staging-deploy-guide-change-requests.md` section 4.1, L1).
2. The forced analytics recompute finished, 0 failed sections (section 3, step 4).
3. T2.11 live (BSE-only stocks priced) and **T2.12 Step B built and run once** (book values), per ledger rows L16 and L17; P/E and P/B coverage re-measured for the seven funds (the 2 Nov coverage figures are in the other file; they should not be lower).
4. Bandhan Small Cap shows holdings in the system (1.5).
5. Holdings batches for all seven funds are still the 30 Sep 2026 ones. **Use September even if the October files have arrived** (owner's decision, 2 Nov): select by `as_of_date = 2026-09-30`, not "latest".

## Phase 3: how the numbers are produced (design decision, then build)
The five figures live in different places, and three are computed **per household**, so none can simply be read for funds nobody holds:
| Figure | Where the system computes it | Per-fund readable? |
|---|---|---|
| Large, mid, small split | `services/fund_page/composition.py` (`_market_cap_allocation`, the `portfolio-composition` route), Run 1 rule: percentages over classified stocks plus the unclassified share | yes, for any fund |
| Top 10 holdings | latest written `disclosure_batches` row and its `scheme_holdings` sorted by `pct_to_nav` (also the `holdings` route) | yes |
| P/E and P/B | `services/analytics/valuation.py` (`compute_valuation`, per-fund `ValuationValue`; weighted harmonic mean, 70% coverage rule, factsheet figure if fresh) | household scope: needs a per-fund entry point |
| Category average comparison | `services/analytics/category_ranking.py` (Run 2 T2.7, simple means within category and plan, 3-year floor) | household scope |
| Ranking | `services/analytics/performance_ranking.py` (Run 2, ties 1,2,2,4; index funds not ranked) | household scope |

**Decision to take with the owner (recommendation first):**
- **A (recommended): a small read-only export script** `backend/scripts/export_ca_fund_metrics.py` that takes scheme ids and an as-of holdings date, reuses the same internal functions the screens use (no second formula), and prints plain rows for the five figures. Treat it as a normal task: handoff doc, tests first, Codex implements, orchestrator reviews every line and re-runs the tests (model-orchestration rule; adversarial review because the numbers go to an outside accountant). Run it on the VM through `docker compose run` (read-only; abort on any write, like the `measure_*` scripts).
- B: a temporary household holding the seven funds in a local copy of the reference data. Heavier, and staging account creation is not available to the orchestrator (sign-in needs a real inbox). Not recommended.
Whichever is chosen, **do not build a parallel formula**: if the screen's function cannot be called for one fund, extract the per-fund core into a shared function and have the screen call it too, with the screen's tests staying green.

## Phase 4: build the workbook
Use `openpyxl` (already in the venv). Sheets, in order, exactly as specified in `2026-11-02-ca-excel-seven-funds.md`: Read me, Summary, Allocation, Category comparison, Ranking, P/E and P/B, Top 10, Checks (full holdings sheet optional). Save outside git: `Docs/orchestration/ca-excel/Unifolio_seven_funds_<export date>.xlsx`, and add the folder to `.git/info/exclude` so it cannot be committed. The Read me must state: export date; deployed commit; holdings and top 10 and market-cap split as of **30 Sep 2026** (AMFI list effective 1 Jul 2026); P/E and P/B as of the export date (latest stock ratios applied to the September holdings, so they will not equal a 30 Sep factsheet); returns behind the comparison and ranking ending on the export date; the method and meaning of every column; coverage % behind each P/E and P/B; Parag Parikh's foreign holdings are not in its P/E and P/B; which plan was used; how index funds are handled in the ranking.

## Phase 5: verify before anything is sent (do all, report each)
1. **Top 10 and weights**: for every fund, open the fund house's own September 2026 disclosure (the owner's file for Bandhan; the public file for the others, via the VM's saved files or the owner) and compare the top 10 names and percentages line by line. Zero differences, or each difference explained.
2. **Allocation**: large + mid + small + unclassified = 100.00 (or the stated rule), and hand-recompute one fund from `scheme_holdings` and `market_cap_classifications`.
3. **P/E and P/B**: hand-recompute one fund (weighted harmonic mean over covered equity) from `stock_master` and `scheme_holdings` and match to the workbook to the displayed precision; coverage % on the sheet equals the SQL coverage.
4. **Category comparison and ranking**: hand-recompute one fund's category average (simple mean, same plan type, 3-year floor) from NAV history; check tie handling and that index funds carry the disclaimer, not a rank.
5. **Labelling**: every date on every sheet is right; no internal id, user data or folio appears; fund names are the exact official names; plain words, no "TRI", "proxy", "fallback".
6. **Checks sheet** matches the sums above. Have a second reader (a Sonnet subagent, given the file and the sources, not the conclusion) re-do items 1 to 3 independently.
If any check fails: fix the cause, rebuild, re-verify; never hand-edit a cell.

## Phase 6: hand over
Give the owner the file path and this message to send with it (fill in the bracketed parts):
> Hi [Name], here is the complete Excel for the seven funds, with the five things you asked for. The first page explains every column: what it means, which date it is for and how it is calculated. Fund holdings, the top 10 and the large/mid/small split are from the fund houses' own **30 September 2026** disclosures, so you can compare them line by line. P/E, P/B and the return-based comparison and ranking use the latest market prices as of [export date], so they will not match a 30 September factsheet exactly; they are marked clearly on each sheet. [One line on anything unusual: for example, Parag Parikh's P/E and P/B cover only its Indian holdings.] If any number looks different from what you expected, tell me the fund and the column and I will trace it back to its source the same day.
Then record the run in `Docs/orchestration/delegation-log.md`, update the state table at the top of this file, and set row D1 in `2026-10-31-staging-deploy-guide-change-requests.md` section 4.6 to done with the date.

## If something goes wrong
| Situation | Do |
|---|---|
| The deploy slips beyond 14 Nov | add `--allow-old` to the Bandhan import (step 1.4) |
| The Bandhan file has no Small Cap sheet | tell the owner which sheets it has; ask for the equity file |
| Bandhan imports but the export reads an empty newer batch | stop, report; do not delete rows |
| October files arrive | still use 30 Sep unless the owner changes the decision in writing |
| A check in Phase 5 fails | fix the cause and rebuild; never hand-edit a cell; tell the owner |
| The CA asks for the 30 Sep P/E and P/B | the system keeps no history of stock ratios; explain, do not approximate |
