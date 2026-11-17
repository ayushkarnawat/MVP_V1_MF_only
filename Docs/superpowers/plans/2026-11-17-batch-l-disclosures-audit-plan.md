# Batch L: Portfolio Disclosures Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Read `Docs/orchestration/wave-common-rules.md` first; it wins where it differs.

**Goal:** In wave 1, audit the November portfolio-disclosure round (read-only): coverage as a percentage (funds, money, fund houses), what is still done by hand, which automatic fund houses missed and why, and an ordered next-steps list with fix proposals. It ships no code and needs no deploy; approved fixes (L-9) ride a later backend milestone.

**Architecture:** Seven read-only `SELECT` queries (E1 to E5, plus the log grab E6 and the by-hand checks E7) written and tested by Claude against a local database with invented rows; the manager's Claude (or the user) runs them on the staging VM from a written guide; Claude computes the three coverage measures and the cuts and writes the report. Nothing here touches a screen or the deployed code.

**Tech Stack:** SQL (read-only), Python only for the local query tests (pytest), Markdown for the report and guide.

**Spec:** `Docs/orchestration/2026-11-17-batch-l-portfolio-disclosures-audit-planning-workbook.html` (4 of 4 questions answered: Q1 A the November round is the 31 October disclosures, Q2 A report all three measures with funds as the headline, Q3 A, Q4 A). Sister of the fund-manager factsheet audit; model the guide on `Docs/orchestration/portfolio-disclosure-manual-import-guide.md` and the earlier factsheet audit's style. Program rules: `2026-11-17-program-execution-and-deployment-plan.html`.

## How this plan is used (read first)

- **Packets and handoffs are not written here.** This plan has almost no worker code; if Codex builds an approved fix (L-9), the orchestrator writes its handoff in detail at that time. Antigravity is not used.
- **No server access.** Claude never runs anything on the staging server; the user or the manager's Claude runs the guide and sends results back. All queries are `SELECT` only; the audited tables hold no personal data.
- **Timing, not order, matters.** It is independent of the other batches and shares no files (approved fixes would touch only `portfolio_disclosure_*` files and the job script). First useful pass once the by-hand imports are done (about day 10 to 12 of the month); final pass after day 20; the report is stamped with the date it was taken and can be re-run. The program plan does not wait on it.
- **Wave-start check:** confirm in the repo: `disclosure_batches` (`backend/app/models/reference.py`: `scheme_id`, `as_of_date`, `amc_name`, `status` of `DisclosureBatchStatus` = pending, fetched, parsed, written, failed, awaiting manual upload, `parse_errors` JSON, `fetched_at`, unique on `(scheme_id, as_of_date)`), the job (`backend/app/services/analytics/portfolio_disclosure_client.py` and its siblings `portfolio_disclosure_{matching,parsing,resolvers,writer,retention,manual}.py`), the registry (52 fund houses: 45 automatic [27 JSON, 16 pages, 2 via the web archive], 7 by hand: Edelweiss, Mahindra Manulife, Invesco, ITI, JM Financial, HSBC, Bandhan; 5 expected to publish nothing: ASK, IL&FS, Lakshya, Carnelian, Nuvama), the 90 to 101 percent weight check, the day 10 and day 20 alerts (`PORTFOLIO_DISCLOSURE_ALERT` log lines), the daily 05:45 job on days 1 to 20, and the AMFI average-assets table used for the money measure. Report drift (counts are from the registry file, not measured).
- **Branch:** documentation and scripts only, on `batch/l-audit` cut from `leapswitch-redesign` (queries and guide committed on the user's word); no deploy.
- **Builders:** Claude does everything in L-1 to L-7. Codex only for an approved fix (L-9), one task at a time, tests first.

## Global Constraints

- Read-only: SELECT only; no insert, update, delete, no price or file download from the audit itself; the manual import (L-8) is the user's own action using the existing import command in `portfolio-disclosure-manual-import-guide.md`.
- The target month is the last day of the month before today (for the November round, the 31 October disclosures). Freshness uses the **date inside the file** (`as_of_date`), never the import date; a fund whose newest batch is the previous month is **stale**, not covered.
- Expected gaps are listed separately and excluded from the denominator: the five houses that publish nothing; Taurus (half-yearly only: "no November file" is normal); Monarch (fortnightly file). The by-hand list is **not** the factsheet audit's list (Kotak, ICICI Prudential, HDFC, Trust, WhiteOak, Axis are by hand for factsheets but automatic here; Edelweiss, Mahindra Manulife, HSBC are by hand for disclosures only): never copy that table.
- Three coverage measures, in this order, stamped with the date taken: (1) funds with a written batch for the target month out of live schemes at covered-or-expected fund houses (the headline); (2) money, weighted by each fund's assets (AMFI average assets, same month; approximate for the newest funds); (3) fund houses with at least one written batch out of the 52 (footnote). Each shown automatic vs by-hand separately and together, plus "with by-hand houses assumed imported" as the ceiling; written vs failed vs unmatched shown separately.
- Causes use the job's own labels: `no_file_found`, `target_month_not_published`, `error`, `parse_error`, `failed_sum_check`, `unmatched_scheme`, `duplicate_match`, `zero_schemes_matched`, `stale_fallback`, `stale_wayback_capture`, `manual_upload_pending`. A layout change is inferred only from October vs November (worked last month, now `no_file_found`, `parse_error` or `failed_sum_check`) and confirmed by opening the page or file once by hand.
- No invented numbers: every November figure comes from the queries; the report skeleton uses blanks until they come back. Anything not measured is stated plainly as not measured.
- Evidence tables hold fund-house and fund names only; no household or personal data is read or written. Fix proposals follow Batch A's review gate: proposed with evidence and a failing test described first, built only after the user approves each.
- The NSE book-value job failure (redirect to a new NSE address) is a separate real failure on the factsheet and valuation side and is **not** part of this plan unless the user says so.
- No code changes, no migration, no deploy in L-1 to L-8.

## Review Focus

- A fund house counted as a miss when its normal state is "no row" (the five, Taurus, Monarch).
- An old file stamped with the new month hiding as fresh (the factsheet audit's problem): freshness must come from `as_of_date`.
- A batch with `failed` status counted as covered, or a mid-month figure quoted as final.
- The November job log already discarded: the report says so and rebuilds causes by checking each house instead of guessing.
- Fund-name matching issues (`unmatched_scheme`) confused with layout changes.
- A query that accidentally writes (guard: connect read-only; the test asserts a read-only transaction).
- Money measure when assets data is missing for the month: the report states the gap and the fraction of funds without assets.

## File Structure

| File | Responsibility |
|---|---|
| `backend/scripts/audit_disclosures/queries.sql` (new) | E1 to E5, each a single SELECT with a header comment (question, output columns). |
| `backend/scripts/audit_disclosures/run_audit.py` (new) | Runs the queries read-only against a given database URL and writes CSV files; used by the guide. |
| `backend/tests/scripts/test_audit_disclosures.py` (new) | Runs the queries on a local test database with invented rows; asserts results and read-only behaviour. |
| `Docs/orchestration/2026-11-xx-disclosures-audit-guide.md` (new) | The step-per-terminal guide for the manager's Claude (tunnel, queries, log grab E6). |
| `Docs/orchestration/2026-11-xx-disclosures-audit-report.md` (new) | The report, by-hand to-do list, failure notes, fix proposals. |

## Task list

| Task | What | Builder | Size | Order |
|---|---|---|---|---|
| L-0 | Wave-start check; confirm Q1 to Q4 answers | Claude | S | first |
| L-1 | Write and test queries E1 to E5 | Claude | S | after L-0 |
| L-2 | Write the run guide | Claude | S | after L-1 |
| L-3 | Run queries and log grab on staging; send results | User or the manager's Claude | S | after L-2 (day 10 to 12) |
| L-4 | Compute the three measures and cuts; by-hand table | Claude | M | after L-3 |
| L-5 | Check each regressed house by hand (E7); layout-change notes | Claude, with the user for blocked sites | M | after L-4 |
| L-6 | Write the report, to-do list and failure notes | Claude | M | after L-5 |
| L-7 | Fix proposals, one per distinct cause | Claude | M | after L-6 |
| L-8 | Import the by-hand files; re-run E1 and E4 | User | S | after L-6 |
| L-9 | Approved fixes only, test first | Codex | per fix | after approval |

---

### Task L-1: Queries E1 to E5 with tests

**Files:** Create `backend/scripts/audit_disclosures/queries.sql`, `run_audit.py`; Test `backend/tests/scripts/test_audit_disclosures.py`.

**Interfaces:** `run_audit(database_url: str, target_month_end: date, out_dir: Path) -> dict[str, Path]` (keys `E1`..`E5`; refuses a non-read-only connection; writes one CSV per query, no personal columns). Query outputs: **E1** per `amc_name` and `status`: batches for the target `as_of_date` and the month before; **E2** live schemes per fund house (the denominator, active, not matured, excluding expected-absent houses); **E3** average assets per scheme for the same month joined to E1; **E4** newest `as_of_date` per fund house and per scheme (fresh vs stale); **E5** `parse_errors` of each failed batch (structured reasons).

- [ ] **Step 1: Write failing tests** (invented rows: three fund houses, one with a failed weight check, one stale, one missing assets): `test_e1_counts_written_failed_awaiting_per_house_for_both_months`; `test_e2_denominator_excludes_expected_absent_houses`; `test_e3_money_weight_uses_assets_and_reports_missing_assets`; `test_e4_stale_uses_as_of_date_not_import_date`; `test_e5_lists_parse_errors_per_failed_batch`; `test_run_is_read_only` (a write attempt inside the run raises, and the transaction is read-only); `test_output_has_no_personal_columns`.
- [ ] **Step 2: Run** `cd backend && pytest tests/scripts/test_audit_disclosures.py -v`. Expected: FAIL.
- [ ] **Step 3: Implement** the queries and runner (SELECT only; read-only transaction). **Step 4: Run** the file. Expected: PASS.

### Task L-2: The run guide

- [ ] **Step 1:** Write `Docs/orchestration/2026-11-xx-disclosures-audit-guide.md` in the usual one-step-per-terminal format: open the read-only database tunnel the way the earlier audits did, run `run_audit.py` for E1 to E5, grab the `PORTFOLIO_DISCLOSURE_ALERT` log lines for days 1 to 20 of the month (E6) if the server still has them and say how long the logs are kept, return the CSVs and log lines unedited. State that nothing here writes anything, and that results contain fund-house and fund names only.

### Task L-4: Compute the measures (Claude)

- [ ] **Step 1:** From the returned CSVs compute: funds covered / live funds (headline), money covered, fund houses covered; each split automatic vs by hand vs together, plus "by-hand assumed imported"; fresh vs stale; written vs failed vs unmatched. Build the by-hand table for the seven houses (file, page, date inside the file, in hand, imported, funds covered) replacing the October state recorded in the workbook section 5. Stamp the date taken.

### Task L-5: Regressed houses by hand (Claude with the user)

- [ ] **Step 1:** For every house that worked in October and now logs `no_file_found`, `parse_error` or `failed_sum_check`, open its page or file once by hand and record what changed (layout, address, block); for `unmatched_scheme` list the names; for late houses check again after day 20. Blocked sites need the user's browser. Output goes into the failure notes.

### Task L-6: The report

- [ ] **Step 1:** Write the plain-text message (forwardable) and the Markdown evidence file in the shape of workbook section 7: (1) what the round produced (___ funds across ___ houses, __% of live funds, __% by assets, fresh, stale, failed); (2) by hand: seven houses table; (3) automatic misses: house, label, cause (late, layout change, block, naming), evidence, fix; (4) expected gaps; (5) what is left, ordered, with anything not measured stated plainly. Include the import to-do list in import order with the exact import command per file (from `portfolio-disclosure-manual-import-guide.md`) and any date problem flagged before the import (the 45-day rule).
- [ ] **Step 2:** The two open decisions (Invesco PDF-only; Bandhan as a by-hand house) go to the user with options and a recommendation.

### Task L-7: Fix proposals (Claude)

- [ ] **Step 1:** One proposal per distinct cause with: root cause and evidence, the proposed change (files only under `portfolio_disclosure_*` and the job script), the failing test described first, effort and risk, the user's decision. Candidates the workbook names: keep failure reasons in the database (the job log is the only record today), a content-date check like the factsheet job's known limit, a changed endpoint or resolver. Present one at a time.

### Task L-8: By-hand imports (the user)

- [ ] **Step 1:** The user imports the by-hand files using the commands in the report, then E1 and E4 are re-run to refresh the numbers (a re-run of `run_audit.py` through the same guide). A final pass after day 20.

### Task L-9: Approved fixes only (Codex, per fix)

**Files:** only the `portfolio_disclosure_*` files and the job script named in the approved proposal; tests under `backend/tests/services/analytics/`.

- [ ] **Step 1: Write the failing test** from the proposal (the exact case, for example a fixture page whose link text changed returns `no_file_found` today and the new resolver finds the file). **Step 2: Run** `cd backend && pytest <that test> -v`. Expected: FAIL for the stated reason. **Step 3: Implement** the approved change only. **Step 4: Run** the new test and the existing disclosure tests of the touched module (`pytest tests/services/analytics -k disclosure`). Expected: PASS. The fix ships at the next milestone with a backend deploy; the orchestrator adds it to that milestone's deploy-guide facts (the guide is written at the milestone).

## Self-Review notes

- Spec coverage: coverage in three measures and cuts (L-1, L-4), by-hand houses (L-4, L-6, L-8), automatic misses and causes (L-5, L-6), next steps and fix proposals (L-6, L-7), approved fixes (L-9).
- The audit's timing depends on the fund houses, not on the program: run the first pass around day 10 to 12 of the month and a final pass after day 20.
- Packets and handoffs: not written here, by instruction (only L-9 would need one).
