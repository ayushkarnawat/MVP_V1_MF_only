# Handoff: analytics-speed-stamp-duty
**Status:** IN_PROGRESS — Run 1 DONE; Run 2 DONE (reviewed, M2/L1 fixed, H1/M1/L3 accepted under the database wipes); DONE (Runs 1–3, final review approved); awaiting the user's commit and the staging deploy
**Parent plan:** `Docs/superpowers/plans/2026-10-07-analytics-speed-and-stamp-duty.md` (binding; tasks 1–10, including 5B)
**Spec:** Analytics Speed Fix https://claude.ai/artifact/RTvmbJVy1SrpH6XJYYWnqx · Change Map https://claude.ai/artifact/VjuDFpFp9EELeT7fcDuA7s · `DEFERRED_FEATURES.md` → "Added 2026-10-07" and "Question 3 in full"
**Orchestrator:** Claude Code (plan, rulings, WSL verification, Postgres, real files, reviews, docs) · **Worker:** Codex (builds one run per prompt, self-reviews, prints the report)
**Review baseline:** `5fb7e42` (HEAD before this work) plus the uncommitted orchestrator docs listed under "Never touch"

---

## How this works (read first)

1. The user pastes a short prompt into Codex naming **one run** (Run 1, Run 2 or Run 3).
2. Codex reads this file and the plan, then implements that run's tasks **in order**, test-first, exactly as the plan writes them.
3. Codex self-reviews (section "Self-review"), fixes what it can, and ends by printing the **CODEX REPORT** (template at the bottom) in one fenced code block.
4. The user pastes the report back to Claude Code. Claude re-runs the tests in WSL, reviews the diff, rules on open questions, and writes either a fix-round prompt or the next run's prompt.

One run per prompt. Don't start the next run, even if there is time left.

| Run | Plan tasks | Who |
|---|---|---|
| **Run 1 — Analytics speed** | 1 (done in round 1), 2 (revised 8 Oct), 3, 4, 5, 5B | Codex |
| **Run 2 — Stamp duty** | 6, 7 | Codex |
| **Run 3 — Synthetic files and harness gates** | 8 (synthetic parts only) | Codex |
| Orchestrator | 8 (real files), 9, 10, reviews | Claude |

---

## Where things stand — 2026-10-08

- All CAS-import fixes (Phases 1–7) are committed and deployed to staging (`5fb7e42`). Staging is on migration `0030`. **Migrations: `0031_scheme_ter_link` (Run 1, Task 2, `down_revision = "0030"`) and `0032_transaction_stamp_duty` (Run 2, Task 6, `down_revision = "0031"`).**
- The plan was written against the code at `5fb7e42`; every file and line it names was read on 7–8 Oct. Where it says "around line N", trust the function name over the number.
- Measured locally on `p20_20yr.pdf` (7–8 Oct): TER refresh 205 s inside Analytics; peer NAV downloads 142–206 s; NSE index top-up 32 calls / 127 s on 8 Oct. These are what Runs 1's fixes remove.
- The synthetic CAS PDFs live outside the repo (`%USERPROFILE%\Desktop\Unifolio\CAS Files\synthetic\`, resolved by `Docs/CAS Files/synthetic/pdf_dir.py`), password `MF@123`. Generators and the harness are in `Docs/CAS Files/synthetic/`.

## Run 1 round 1 result and ruling (8 Oct) — read before round 2

- **Task 1 (Analytics never refreshes TER): built.** Kept as is; the orchestrator reviews it with the rest of Run 1.
- **Task 2: Codex stopped, as instructed**, because the live comparison showed worse matches for 17 schemes (and the new matching took 137 s).
- **Orchestrator investigation:** every fuzzy match is wrong, not just those 17. 923 schemes were matched to a **different fund house** (Kotak Business Cycle → Tata Business Cycle; HDFC Ultra Short Term → HSBC): AMFI fills each month gradually, and on 8 Oct HDFC, Kotak and Nippon had **no** October rows (11,647 rows vs September's 62,393; our download had all 11,647). About 116 more matched the wrong year or series within one house (Bandhan Gilt April 2026 → April 2028 at 0.81; SBI FMP Series 50 → 51 at 0.75). Exact names cover 7,041 schemes correctly (7,035 + 6 that differ only by spacing). AMFI's TER rows carry `NSDLSchemeCode` (SEBI's scheme code; 1,813 names ↔ 1,813 codes).
- **Ruling (user-approved 8 Oct):** plan Task 2 is **rewritten**. Link each scheme once to the SEBI code by an exact cleaned name, store it on `schemes` (migration **0031**), join by code, **no fuzzy matching**, clear an unlinked scheme's month row. Stamp duty moves to migration **0032**. Read the new Task 2 in the plan in full; it says exactly which of your round 1 code to keep (`TerRefreshResult`/`refresh_ter`/`refresh_ter_data`, batched writes) and which to delete (`_brand`, `_index_feed`, `_match_scheme`, `_best_match`, `MIN_MATCH_CONFIDENCE`, their tests).
- **Encoding:** round 1 reported Windows default text decoding damaging Unicode comments. Read and write every file as UTF-8 with LF line endings.

## Run 1 final state (8 Oct) — read before Run 2

Run 1 is DONE. On top of Codex's round 2, the orchestrator fixed the review findings (all test-first): `amfi_ter_client._compact_key` keeps parenthesised text; `_rows_by_code(rows)` replaced `_latest_row_per_scheme` (latest-dated row per `NSDLSchemeCode`, rows without a code or with a bad `TER_Date` skipped); the link guard also skips manual entries and empty keys; `refresh_ter(db, month=None)` and `refresh_ter_daily.py --month MM-YYYY` (validated); `recompute.py` refreshes `started_at` after every committed or failed section; `refresh_nav_daily.py` catches a failing category, rolls back and continues; `nse_indices_client.ensure_index_history_fresh(..., *, fresh_within=_FRESH_WITHIN)` and `refresh_benchmark_daily.py` passes `fresh_within=timedelta(0)`. Don't change any of this in Run 2. Run 2's migration is `0032_transaction_stamp_duty` with `down_revision = "0031"`.

## Run 2 final state (8 Oct) — read before Run 3

Run 2 is DONE (Tasks 6–7). On top of Codex's build, the orchestrator fixed two review findings (test-first): `lot_rules.cost_per_unit` never returns a positive exponent (an exact quotient like `5E+1` reached Avg NAV and showed as 0.00), and the parser skips a reversed (negative) stamp-duty row instead of attaching it as a charge. `paid_amount` lives in `lot_rules.py` (import-cycle fallback). Accepted by the user: rows saved before 0032 aren't handled (the database is wiped for staging, after testing and before production; `DEFERRED_FEATURES.md`). Don't change any of this in Run 3.

**Run 3 = Task 8, synthetic parts only:** Steps 1–5 (including the new `stamp_unattached` count in Step 4) and, from Step 6, only the two Windows spot checks the plan names under "Who runs what". The full 88-run gate and every real-file run are the orchestrator's (report them as pending — orchestrator). Step 5 edits `test_real_check.py` but you never run it and never open a real CAS file. Regenerated PDFs and `truth.json` live outside the repo (`Docs/CAS Files/synthetic/pdf_dir.py` resolves the folder).

## Task

Implement the run named in the prompt from the plan, every task in order, including its tests. Anything that needs WSL Postgres, staging, AWS, real CAS files or the user's screenshots is reported as **pending — orchestrator**, never faked.

---

## Constraints (non-negotiable)

**Git — read-only, whitelist.** Use only `git status`, `git diff`, `git log`, `git show`, `git grep`, `git ls-files`. Never `commit`, `add`, `rm`, `mv`, `reset`, `checkout`, `stash`, `restore`, `rebase`, `merge`, `push`, or anything that writes the index or refs. Rename and delete with the shell (`move`/`del` or `mv`/`rm`), not git (Task 3's job rename is a plain shell move). The user commits.

**Never touch:** real CAS PDFs anywhere (`Desktop\Unifolio\CAS Files\*.pdf`, `Docs/CAS Files/*.pdf`); `backend/.env`; `infra/` except `infra/modules/scheduler/main.tf` in Task 3; the orchestrator's files: `DEFERRED_FEATURES.md`, `decisions.md`, `log.md`, `session.md`, `CLAUDE.md`, `backend.md`, `database.md`, `Docs/orchestration/*` except appending to the baseline doc when a task says so, `Docs/investigations/*`. Never run `terraform plan`/`apply`/`init`.

**Follow the plan literally.** File paths, function names, signatures, log-line text and test names are binding (later runs and the staging guide depend on them). If the code contradicts the plan in *mechanics* (a fixture is shaped differently, a line moved), adapt minimally and record it under "Deviations". If it changes *behaviour or an interface*, stop that task, record it under "Open questions", and continue with tasks that don't depend on it.

**Test-first, affected tests only.** Write the test → run it and see it fail for the right reason → implement → run green. Never run the full backend suite. Before a task's final run, `git grep backend/tests` for every symbol the task changed or removed (e.g. `_ensure_ter_fresh`, `refresh_ter_monthly`, `_STALE_RECOMPUTE_CEILING`, `stamp_duty`) and add each matching test file to the run.

**Commands (Windows).** The plan writes WSL commands (`python3 -m pytest …`). On Windows use, from `backend\`: `.venv\Scripts\python.exe -m pytest <files> -q`. Postgres tests skip without `TEST_DATABASE_URL`: report "skipped", never "passed"; the orchestrator runs them in WSL. `terraform fmt -check` / `validate`: run if `terraform` is on PATH, otherwise report "pending — orchestrator".

**Project rules** (`AGENTS.md`): `Decimal`, never `float`, for money, units, NAV, TER and stamp duty; partitioned `transactions` on Postgres; no blocking `db.commit()` inside an `async def` route (use `commit_off_loop`); LF line endings.

**Out of scope (decided 7–8 Oct):** fix E (cheap sections first / one-person household once), the "still calculating" message, and the rest of question 3 (Analytics keeps its AMFI NAVAll download and its live held-fund NAV lookup; only the NSE freshness check, Task 5B, changes). Don't build them.

---

## Approaches considered and rejected (don't re-litigate)

- **Keeping the TER refresh in Analytics behind a better guard** — rejected: on AWS every run is a new process, so any in-memory guard resets; the job is the only writer of `scheme_ter` now.
- **Refreshing TER only for held funds** — rejected: the quality score's category-average TER needs every peer's TER.
- **Changing `refresh_ter_data`'s return type** — rejected: existing tests assert `is True`/`is False`. Add `refresh_ter()` → `TerRefreshResult` and keep `refresh_ter_data()` as the bool wrapper.
- **Any fuzzy TER matching** (whole-feed at 0.55, brand-scoped, brand-scoped with fallback, a higher threshold) — rejected 8 Oct: on live data every fuzzy match was wrong (cross-fund-house when a house hasn't filed; wrong year/series within a house even at 0.81). Exact cleaned name → SEBI code only.
- **A separate scheme↔TER mapping table** — rejected 8 Oct: the link is many plans → one fund, and `schemes` already holds AMFI code and ISIN; three nullable columns on `schemes` do it.
- **Removing Analytics' own peer warm-up** (`category_ranking.warm_nav_history`) — rejected 7 Oct: it is the safety net for a category nobody held at 06:00. It downloads nothing when the 06:00 job has already refreshed the peers.
- **Folding stamp duty into `transactions.amount`** — rejected: `amount` must stay what the CAS printed for the purchase (NAV checks, matching). Separate nullable column.
- **Costing every lot from `amount` instead of `units × nav`** — rejected: changes every existing figure by paise. Only rows with stamp duty use `(amount + stamp_duty) / units` (`lot_rules.cost_per_unit`).

## Open questions (Codex: flag back, don't guess)

- Task 2 Step 6: any linked scheme whose fund-house brand differs from its TER row's brand — list every one and stop. Expected: none.
- Task 7: if importing `paid_amount` from `dashboard/xirr.py` into `cash_flow.py` creates an import cycle, the plan says move it to `lot_rules.py`; record which you did.
- Task 8: if the Analytics timing gate exceeds 30 s, report the number and per-section timings; don't raise the limit.

---

## Self-review (before printing the report)

1. `git diff --stat` and `git status --porcelain`: every changed or new file belongs to a task in this run. Undo anything else.
2. `git diff --cached --stat` is empty.
3. Review your diff as a hostile reviewer would (run Codex `/review` on the uncommitted changes if available). Check specifically:
   - Every new test fails without its implementation (no tautologies, no mocking of the thing under test).
   - Money paths use `Decimal`; no float anywhere near stamp duty, cost or TER.
   - Migrations 0031 and 0032: upgrade and downgrade, SQLite and Postgres; no app imports; chain 0030 → 0031 → 0032.
   - No names, PANs, folios or amounts from real statements anywhere.
   - Interfaces match the plan's **Interfaces** blocks exactly (`TerRefreshResult` incl. `new_links`, `refresh_ter`, `refresh_ter_data`, `_compact_key`, `TER_LINK_EXACT`, `TER_LINK_MANUAL`, `Scheme.ter_scheme_code`, `cost_per_unit`, `paid_amount`, `STAMPED_TYPES`, `STAMP_DUTY_RATE`, `_attach_stamp_duty`, `_FRESH_WITHIN`, `_fetched_from`).
   - Each Review Focus item owned by this run has its test.
4. Fix what you find, re-run the affected tests, and list every finding in the report.

---

## CODEX REPORT — template (print this, filled in, in ONE fenced code block at the very end)

```
CODEX REPORT — analytics-speed-stamp-duty — Run <N>
Run date/time: <…>    Environment: Windows    Python: <version>

1. TASK STATUS
   Task <n>: DONE | PARTIAL | NOT STARTED | BLOCKED — <one line>

2. FILES
   Changed (tracked):   <git diff --stat summary>
   New (untracked):     <from git status --porcelain>
   Renamed/deleted:     <list, or none>
   Staged (must be empty): <git diff --cached --stat>

3. TESTS (per task; exact command + last 3 lines of output)
   Task <n> RED:   <command> → <failed as expected because …>
   Task <n> GREEN: <command> → <N passed …>
   Extra files added via grep: <files>
   Postgres tests: SKIPPED (pending — orchestrator) | RAN (<result>)
   terraform fmt/validate: <result | pending — orchestrator>

4. DEVIATIONS FROM THE PLAN (mechanics only)
   - <task/step> — plan said <…>; code needed <…>; file:line — why

5. OPEN QUESTIONS / BLOCKERS
   - <task/step> — <question> — what I'd need decided

6. SELF-REVIEW FINDINGS
   - [High/Med/Low] file:line — <finding> — FIXED | NOT FIXED (why)

7. MEASUREMENTS THE PLAN ASKS FOR
   Run 1: Task 2 Step 6 summary (schemes, linked, matched, no_match, seconds) + every cross-brand link (expected none) + unlinked count per brand + 20 random links
   Run 3: synthetic gate pass count, invested_mismatch count, analytics_seconds for p20_20yr

8. ANYTHING ELSE CLAUDE SHOULD KNOW

9. CONFIRMATIONS
   - No git write commands used: YES/NO
   - Full suites not run: YES/NO
   - Out-of-scope items not built: YES/NO
   - No real CAS file opened: YES/NO
```

---

## Round log (orchestrator appends after each report)

| Round | Run | Result | Notes |
|---|---|---|---|
| 1 | Run 1 | STOPPED at Task 2 (correct stop) | Task 1 built (6 files, 53 affected tests pass on Windows). Task 2 fuzzy version built; live comparison 8,661 schemes, 17 worse, 137 s. Orchestrator found 923 cross-house + ~116 wrong in-house fuzzy matches; user approved SEBI-code linking (exact names, no fuzzy), migrations renumbered 0031 (TER link) / 0032 (stamp duty). Plan Task 2 rewritten. |
| 2 | Run 1 | DONE (pending review) | All Tasks 1–5B built. Real data: 7,041 links, 0 cross-fund-house, matching 1.3 s. Orchestrator WSL: 177 affected tests pass; Postgres 0030↔0031 round trip + 43 functional/migration tests pass; terraform fmt + validate clean. Orchestrator fix (plan error): benchmark-daily job passes `fresh_within=timedelta(0)` so it still downloads daily (test-first, 35 pass). Fresh Opus review dispatched. |
| 3 | Run 1 | Review APPROVE WITH FIXES → fixed | Fresh Opus review: no High; Medium 1 (parenthesised text stripped from the link key → segregated funds could link to the main fund) and Medium 2 (deploy wipe left unfiled houses with no TER) plus Lows 3–5, 7–9 fixed by the orchestrator test-first (9 new failing tests → green; 189 affected pass); Low 6 accepted and recorded in decisions.md; local-spelling uniqueness rejected (dropped 15 correct links). Real data: 7,041 links, 0 cross-house, 0.6 s. Scoped re-review dispatched. |
| 4 | Run 1 | DONE | Scoped re-review APPROVE WITH FIXES (no High/Medium); its Lows fixed test-first: NAV job rollback in the per-category except, malformed TER rows skipped, `--month` validated (MM-YYYY), heartbeat after failed sections too, docstring. 270 analytics/scripts/API tests pass. Residual accepted: in principle a feed name with no parentheses in a partly filed month could link the wrong fund; 0 such links on real data (7,041 links, 0 cross-house). Run 2 prompt issued. |
| 5 | Run 2 | DONE | Tasks 6–7 built as planned (`paid_amount` in `lot_rules.py`: sanctioned import-cycle fallback). Orchestrator WSL: 378 affected tests pass; Postgres 0030↔0032 round trip clean, column on parent + 8 partitions; 43 functional_postgres + migration tests pass. Fresh Opus review REQUEST CHANGES: H1 (pre-0032 saved conversions no longer match on re-upload because their amount is FIFO cost, now incl. stamp → duplicate merger rows), M1 (identical re-upload of a pre-0032 statement is 409 already-imported, so no backfill), M2 (`cost_per_unit` exact quotient → `5E+1` Avg NAV, shown as 0.00), L1 (reversed stamp row attached as +), L2 (silent drops), L3 (member merge loses a twin's stamp), L4 (SIP page uses `amount`). Orchestrator fixed M2 and L1 test-first (2 failing tests → green; 361 affected pass); scoped re-review APPROVE. H1/M1/L3 affect only rows saved before 0032 → accepted by the user 8 Oct (database wiped for staging, after testing and before production); logged in DEFERRED_FEATURES.md and decisions.md. L2 → Run 3 harness; L4 out of scope (sip.py unchanged by plan). |
| 6 | Run 3 | PARTIAL (gates failed; investigated) | Steps 1–5 built test-first; spot checks failed: invested_mismatch 3, Analytics 50.3 s (Windows). Orchestrator WSL reproduced: same 3 mismatches; Analytics 155–197 s. Root causes (none from stamp duty): (1) harness keys app funds by `schemes.isin` only, IDCW-reinvest ISIN is in `isin_reinvest`; (2) generator `reverse_last` removes the oldest units, not the bounced lot (proved: CAS cost = FIFO-reversal replay exactly; app = exact-lot replay ±₹0.21); (3) switch-in cost units × 4-dp NAV vs printed amount (₹1.93); (4) mfapi drops ~1/3 of the NAV job's ~1,500 concurrent peer downloads (545/1,513 failed), not retried → Analytics re-downloads 593. (4) skipped for now by the user (DEFERRED_FEATURES.md); timing gate recorded, not enforced. Prompt error (orchestrator): Run 3 prompt said truth.json lives outside the repo; it stays in the repo. |
| 7 | Run 3 | DONE (orchestrator finish) | Orchestrator fixed the test side, test-first where app code: truth.json back in the repo (prompt error); harness IDCW reinvest-ISIN alias; generator `reverse_last` drops the bounced lot; all-members comparison for family files; ₹1 + units×0.00005 tolerance (user); real checker answers same-person Yes and skips family_cas cost/value checks (user); funds whose opening cost the app rejects (nav_on_start) skipped from a known list (ICICI Bluechip, HSBC Value, Franklin segregated). Real files: all pass except CP219252880 (known); CAS 10 Yr invested = CAS ±₹0.02. Synthetic gate 88/88 (81 + 7 re-runs after the fixes). |
| 8 | Final | APPROVE (after fixes) | Fresh Opus whole-change review: APPROVE WITH FIXES (no High; Medium = harness Analytics checks couldn't fail). Fixed: warm_nav_history survives an unreadable response (test-first), refresh_ter rejects a codeless feed (test-first; one existing test given a coded row), harness counts TER fetches and requires all 7 sections, known skip list, exact same-person count. Scoped re-review: one more gap (missing-section check) fixed. 592 affected tests pass; live ANALYTICS=1 run: 0 TER fetches, 7/7 sections, 46.6 s. Accepted: L2, L6, L7. Staging guide written. |
