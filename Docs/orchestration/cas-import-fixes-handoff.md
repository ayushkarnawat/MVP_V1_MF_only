# Handoff: cas-import-fixes
**Status:** IN_PROGRESS — Phases 1–5 and 6A (backend) DONE; Phase 6B (frontend + checkpoint) ready for Codex
**Parent plan:** `Docs/superpowers/plans/2026-10-06-cas-import-fixes-00-index.md` (+ phase files `…-p1-…` to `…-p7-…`)
**Spec:** `Docs/investigations/2026-10-05-cas-import-fix-plan-final.html` (v15) · decisions in `decisions.md` (2026-10-05/06 entries)
**Orchestrator:** Claude Code (plans, reviews, rulings, checkpoints) · **Worker:** Codex (builds one phase per run, self-reviews, reports back)
**Review baselines:** `d2ca49b` (before Phase 1) · `e62dbd3` (after Phase 1, before fix round 1 + Phase 2) · `937fefa` (after Phase 2, before Phase 3) · `9d3ac8e` (after Phase 3 implementation) · `4995420` (after Phase 3 review fixes, before Phase 4) · `93fd5ab` (after Phase 4 implementation) · `3bfffcc` (after Phase 4 review fixes, before Phase 5) · `bd29d69` (after Phase 5, before Phase 6) · `0525749` (after Phase 6A, before 6B). Snapshot commits, not on any branch; the orchestrator diffs against them — Codex doesn't need to do anything with them.

---

## How this works (read first)

1. The user pastes a short prompt into Codex naming **one phase** (e.g. "Phase 1").
2. Codex reads this file, the master index, and that phase's plan file, then implements that phase's tasks **in order**, test-first, exactly as written.
3. Codex self-reviews the whole phase (section "Self-review" below), fixes what it can, and ends its run by printing the **CODEX REPORT** (template at the bottom) inside one fenced code block.
4. The user pastes the report back to Claude Code. Claude reviews the working tree against the baseline, rules on open questions, and either sends fixes back (a "fix round" prompt) or writes the next phase's prompt.

One phase per run. Don't start the next phase, even if there is time left.

---

## Where things stand (read before your next phase) — updated 2026-10-06

**Phases 1–4 are DONE.** Phases 1–2 were built by Codex and accepted. Codex hit its usage limit after Phase 3 Task 1, so **Claude (the orchestrator) built the rest of Phase 3 and all of Phase 4**. Each was reviewed by a fresh independent Claude reviewer (Opus), fixed, and re-reviewed to APPROVE. The working tree holds all of it, **uncommitted** (the user commits). Don't revert or "tidy" any of it. Treat it as the codebase you build on.

**What exists now that your plans may not mention** (use these; never re-implement them):
- `backend/app/services/lot_rules.py`: the only place that says how each transaction type changes lots (`apply_lot_rules`, `LOT_ADDING_TYPES`, `LOT_SELLING_TYPES`, `LOT_CONSUMING_TYPES`). Holdings, opening-balance cost and parse-time conversion cost all use it. Phase 6's `FifoState` must wrap it, not re-list types.
- New row types: `reversal`, `gift_in`, `gift_out`, `bonus`. Columns on `Transaction`: `origin` (`cas_row`/`cas_opening`/`manual`), `cost_source`, `balance_units`, `occurrence`. The unique key is `uq_transactions_folio_date_amount_units_type_occ`.
- `confirm_people._match_rows(db, folio_id, rows, pending, *, dry_run=False, warnings=None) -> MatchResult(inserts, matched)`. Twin rows are matched by running balance; NULL-balance legacy rows are healed; rows without a balance are matched by count. Balance mismatches add a warning to the confirm response.
- `confirm_people._all_rows_exist(...)` implements "already imported". It is False for zero rows, False when anything would be inserted, and False when the opening rule's dry-run verdict is `written`/`replaced`/`removed`.
- `confirm_people._apply_opening_rule(db, folio, lot, statement_from, import_rec, *, dry_run)`: the earliest-statement rule (verdicts `written`/`replaced`/`skipped`/`removed`/`none`).
- `Folio.folio_key` (whitespace-stripped folio number). It defaults from `folio_number` via `models.folio.normalise_folio_key`. Every folio lookup uses `folio_key`, never `folio_number`. Raw-SQL inserts must pass it.
- `transaction_imports (transaction_id, transaction_date, import_id)`, model `TransactionImport`: every import that contained a row. Confirm links every incoming row (matched or inserted), opening rows and manual openings. `_link(db, txn, import_id)` is idempotent.
- `deletion._delete_imports` deletes only rows with no remaining link. It re-points survivors' `import_id`, then calls `opening_restore.restore_openings(db, folio_ids, exclude_import_ids=...)`, which uses cache-only NAV and the chosen import's own linked rows.
- `opening_restore.normalise_cas_openings(db, folio)` leaves at most one valid CAS opening per folio. Call it after moving rows between folios (member merge does).
- `member_merge` matches folios by `folio_key`, keeps twins (occurrence in `_txn_key`), and moves links before dropping duplicates.
- Migrations: `0025` (origin/cost_source), `0026` (twins + row types), `0027` (folio_key + duplicate merge + `transaction_imports` + link backfill from `raw_parser_output`). **Your next migration is `0028` with `down_revision = "0027"`.**
- Plan files were corrected in place where a plan was wrong (lines marked "corrected 2026-10-06"). The plan text as it now stands is binding.

**Test environment.**
- **Postgres is mandatory from now on.** A throwaway Postgres 16.2 runs in WSL at `localhost:5433` (database `unifolio_test`, user/password `unifolio`); see carry-over 6. Set `TEST_DATABASE_URL=postgresql+psycopg2://unifolio:unifolio@localhost:5433/unifolio_test`. If the connection is refused, ask the user to restart it; don't skip.
- The synthetic harness (`Docs/CAS Files/synthetic/harness/test_deep.py`) supports `SEQ`, `OUT`, `SNAP=1`, `DELETE_FIRST=1` and `DELETE_LAST=1`. Its JSON output has `reconcile` (status per fund) and `per_member_values`.
- Results so far are in `Docs/orchestration/2026-10-06-cas-import-baseline.md` ("After phase 1" through "After phase 4"). Your checkpoint appends the next section.

**State of the synthetic suite after Phase 4.** All 21 scenarios match the CAS (every lookback, upload order, folio spelling, delete-first and delete-last), except two exceptions that **Phase 5 owns and must clear** (carry-overs 5 and 7):
1. The closed **Unifund Small Cap** fund is matched to a UTI scheme → `no_cas_data`.
2. The **Franklin India Low Duration segregated portfolio** (ISIN INF090I01UD7, AMFI 147989) is filed under the main Franklin fund (ISIN INF090I01HG7, AMFI 118530) → +423,983.118 units on the main folio in `kfin_pk_10yr`.

## Task

Implement the phase named in the prompt from `Docs/superpowers/plans/2026-10-06-cas-import-fixes-p<N>-*.md`, every task in order, including its tests. Checkpoint tasks (the last task of each phase) are done as far as Codex can do them locally; anything needing staging, AWS, the user's screenshots or real files is reported as **pending — needs user**, never faked.

---

## Constraints (non-negotiable)

**Git — read-only, whitelist.** Use only: `git status`, `git diff`, `git log`, `git show`, `git grep`, `git ls-files`. The one exception is Phase 1 Task 0 Step 2 (`git restore "Docs/CAS Files/synthetic"`), and only after the user answers that task's Step 1 question. Never `commit`, `add`, `rm`, `mv`, `reset`, `checkout`, `stash`, `restore` (other than that one), `rebase`, `merge`, `push`, or anything that writes the index or refs. Delete files with the shell (`del`/`rm`), not git. The user commits manually.

**Never touch these:** the real CAS PDFs in `Docs/CAS Files/*.pdf` (personal data — read them only if a plan step says so, never copy their contents into docs, logs or the report); `backend/.env`; anything under `infra/` except the exact file a task names; the user's other uncommitted changes (`DEFERRED_FEATURES.md`, `decisions.md`, `Docs/investigations/*` are the orchestrator's — leave them unless a task names them).

**Follow the plan literally.** File paths, function names, signatures, error codes, copy text and test names are binding (other phases depend on them). If the code in the repo contradicts the plan (a line moved, a helper doesn't exist, a test fixture is shaped differently), adapt the *mechanics* minimally and record it under "Deviations". If the contradiction changes *behaviour or an interface*, **stop that task**, record it under "Open questions", and continue with tasks that don't depend on it.

**Test-first, affected tests only.** For each task: write the test → run it and see it fail for the right reason → implement → run it green. Never run the full backend or frontend suite. Before a task's final run, `git grep` `backend/tests` / `frontend/src` for every symbol, route, enum value and error code the task changed or removed, and add each matching test file to the run (master index, Global Constraints).

**Commands (Windows).**
- Backend, from `backend\`: `.venv\Scripts\python.exe -m pytest <files> -q`
- Frontend, from `frontend\`: `npx vitest run <files>`; once per frontend task: `npx tsc -b`
- Postgres functional tests need `TEST_DATABASE_URL`; if it's unset they skip — report "skipped", never "passed". From Phase 3 on, a phase can't be closed with Postgres skipped: report it as pending.
- Synthetic harness (Phase 1 Task 0 restores it): see the master index. It needs internet for mfapi.in until Phase 5.

**Project rules** (from `AGENTS.md`): `Decimal`, never `float`, for money/units/NAV in the backend; build for the existing schema (partitioned `transactions` on Postgres, VARCHAR+CHECK `type`); an `async def` route never calls blocking `db.commit()`; curly apostrophe `’` in UI copy.

**Out of scope:** everything listed as deferred in the master index (#1 approximate date / `est_acquired_on`, #19, #20, #24, #25). Don't build them.

---

## Approaches considered and rejected (so you don't re-litigate them)

- **Storing the reconciliation in `folios.coverage_gap_details`** (artifact's idea) — rejected: `coverage_gap.evaluate_folio_coverage_gaps` overwrites that column on every run. Phase 1 computes it on read from `imports.raw_parser_output`.
- **One migration per four issues** (artifact's 0025–0028) — rejected: one migration per phase, 0025–0029; 0024 stays reserved for the `users.primary_goal` drop.
- **Matching TER by AMFI code** — impossible: AMFI's TER feed has no code. Phase 5 stores `schemes.base_name`; Phase 6 matches TER on base name within the AMC.
- **A separate `scheme_master` table** — rejected (option D decided): the master lives in the existing `schemes` table.
- **Rebuilding folios on delete instead of a link table** — rejected (decided): `transaction_imports`.
- **Counting missed SIP instalments against today** — rejected: against the latest statement end date (otherwise everyone who hasn't uploaded for 4 months has all SIPs "stopped").
- **`@testing-library/user-event`** — not installed; use `fireEvent` like the existing tests.

---

## Open questions (Codex: flag back, don't guess)

- **Phase 1 Task 0 Step 1:** ask the user in the Codex chat whether deleting `Docs/CAS Files/synthetic/` was deliberate. If yes, restore it to `%USERPROFILE%\cas-synthetic\` instead and use that path everywhere the plan says `Docs/CAS Files/synthetic/`. Record the answer in the report.
- Any plan-vs-code contradiction that changes behaviour or an interface (see Constraints).

---

## Carry-overs (orchestrator adds items here between phases; Codex must honour every open one)

1. **[From Phase 1 review] `_all_rows_exist` (confirm_people.py)** must return **False when the statement has no transactions to check** (no vacuous "already imported"), and must look up each scheme/folio once per scheme key (cache), not once per row. Phase 2 extends it with the opening-balance rule's dry run (only verdicts `skipped`/`none` count as unchanged; `written`/`replaced`/`removed` mean not already imported, and a deletion followed by "history before S exists" reports `removed`); Phase 3 replaces its row check with `_match_rows(dry_run=True)`; Phase 4 switches the folio lookup to `folio_key`. Each of those phases keeps these two properties.
2. **[From Phase 1] Generic dashboard notice** (`importNotice: {text, details?}` in `MainDashboardFlow.tsx` / `MobileRoot.tsx`) is the only notice mechanism; Phase 7's "N transactions added" must reuse it.
3. **[From Phase 1] Windows line endings:** write files with LF endings (the repo's existing files are LF); don't convert files you only read.
4. **[From Phase 2] Checkpoint value comparisons use the CAS's own valuation**: per fund, `app units × CAS printed NAV (valuation.nav)` vs `CAS closing units × CAS printed NAV`, tolerance ₹1. Units equality (reconciliation status) is the primary check. Live dashboard totals (today's mfapi NAVs) are reported separately and never used for pass/fail. Applies to every later checkpoint and the Phase 7 gate.
5. **[From Phase 2 → must be cleared by the Phase 5 checkpoint]** The closed synthetic Unifund fund matched to a UTI scheme shows `no_cas_data` (0 units, 0 value) — wrong fund identity (#8). Phase 5 must import it as a closed CAS-only fund under its own name and the row must turn `match`.
6. **[From Phase 2 review] Postgres is required from Phase 3 on.** No Docker on this machine. A throwaway **Postgres 16.2** (same major version as CI/staging) runs inside WSL from the `pgserver` wheel's bundled binaries at `~/pg16` (WSL home), listening on port **5433**, user/password `unifolio`, database `unifolio_test`; reachable from Windows at `localhost:5433` (verified). Use `TEST_DATABASE_URL=postgresql+psycopg2://unifolio:unifolio@localhost:5433/unifolio_test`. If connection is refused (WSL was shut down), the user restarts it from a WSL shell: `~/pg16/x/pgserver/pginstall/bin/pg_ctl -D ~/pg16/data -o "-p 5433 -c listen_addresses='*' -k /tmp" -l ~/pg16/log.txt start`. **Never point TEST_DATABASE_URL at staging** — the tests downgrade the schema to base. Phase 3's run must first run `tests/functional_postgres/` in full on the Phase 2 code (covers migration 0025) before Task 1, and report it.
7. **[From Phase 3 → must be cleared by the Phase 5 checkpoint]** Franklin India Low Duration **segregated portfolio** (ISIN INF090I01UD7, AMFI 147989) is filed under the main Franklin fund (118530) by today's matcher; since Phase 3 counts SEGREGATION units, the main folio shows +423,983.118 units in `kfin_pk_10yr`. Phase 5's ISIN-first identification must give the side pocket its own scheme (from the AMFI master, or as a closed/CAS-only fund) and both rows must reconcile `match`. Add `kfin_pk_10yr` to the Phase 5 identification tests with these two ISINs.
8. **[From Phase 3] Member merge compares rows with `occurrence`** (`member_merge._txn_key`), so twin rows survive a merge. Phase 4's link-moving merge code builds on that.
9. **[From Phase 3 review] All lot arithmetic goes through `backend/app/services/lot_rules.py`** (`apply_lot_rules`, `LOT_ADDING_TYPES`, `LOT_SELLING_TYPES`, `LOT_CONSUMING_TYPES`). Holdings, opening-balance cost, conversion cost — and in later phases realised summaries (Phase 6 `FifoState`), snapshots and restore-opening (Phase 4) — must reuse it, never re-list types.
10. **[From Phase 3 review] `_match_rows(warnings=...)`** reports balance mismatches; keep passing the list through when Phase 4 adds links (`MatchResult`).
11. **[From Phase 4] Opening rows:** after any operation that moves rows between folios, call `opening_restore.normalise_cas_openings(db, folio)`; restore/rebuild uses `restore_openings(db, folio_ids, exclude_import_ids=...)` (cache-only NAV, the chosen import's linked rows). Phase 6's snapshot rebuild and Phase 7's backfill must not bypass these.
12. **[From Phase 4] Accepted limitation (Low 6):** 0027's duplicate-folio merge keeps the kept folio's `arn_code`/`plan_type`; coverage gap is re-evaluated on the next import/delete. Phase 5's plan reclassification overwrites `plan_type` anyway.
13. **[From Phase 5 review — MUST be fixed in Phase 6 Task 7] TER regression.** `amfi_ter_client.refresh_ter_data` selects schemes by `plan_name_variant in (direct, regular)`. Since Phase 5, held funds are AMFI master rows whose `plan_name_variant` is NULL, so no held fund gets a TER (the Phase 5 job run found 0 rows). Task 7 must select by `schemes.plan_type` (fall back to `plan_name_variant` only when `plan_type` is NULL) and pick `D_TER`/`R_TER` from it. Add a test: a master row with `plan_type=direct`, `plan_name_variant=NULL` gets its TER.
14. **[From Phase 5 review — first thing in the next run] Reproducible checkpoints.** Phase 5's checkpoint loaded the AMFI master with a temporary plugin outside the repo. Add it to the repo harness: `Docs/CAS Files/synthetic/harness/test_deep.py` reads an optional `MASTER_FILE` env var (a saved NAVAll.txt). When it's set, it calls `app.services.analytics.scheme_master.refresh_scheme_master(db, text)` on the test DB before the first upload. Save today's NAVAll as `Docs/CAS Files/synthetic/navall_2026-10-06.txt` (public AMFI data, ~1.5 MB) and document `MASTER_FILE` in the synthetic README. Every later checkpoint uses it.
15. **[From Phase 5, orchestrator ruling] An exact ISIN hit always identifies the fund** (`identified_by="isin"`); `Identification.nav_matched` records the NAV check (True/False/None) for the Import health page only. This amends the artifact's #8 flow; Phase 7's PRD/decisions update must record it.
16. **[RESOLVED in Phase 6B Task 12: harness bug (reinvestment-ISIN NAV lookup), fixed in `harness/test_deep.py`; app = truth exactly. See the baseline doc's "After phase 6".] XIRR gap on p20_20yr.** Orchestrator re-run with MASTER_FILE: lifetime XIRR app 14.67% vs harness truth 14.12%; current-holdings 15.47% vs 15.70% (kfin_pk_10yr is exact: 15.17/15.17 and 12.49/12.49). The plan's target is within 0.2 points. Task 12 must diff the app's cash-flow list against the harness truth's flow list for p20_20yr (same dates/amounts/signs per fund) and report the cause. Then either fix the app (if it's an app bug, test-first) or document why the truth formula differs (e.g. switch legs, merger/conversion legs priced at cost vs market, payouts, bonus). Don't tune either side to make the numbers meet.
17. **[From Phase 6A] New response fields the frontend must use (Tasks 9–11):** `realized_summary {total, funds[{scheme_id, scheme_name, household_member_id, household_member_name, plan_type, realized_gain, fully_sold}]}` on member and aggregate holdings responses; `SipRow.series_count`, `SipRow.status`, `?include_stopped=true`; `SipMonthlyRow.instalment` (use it in the React key); `HoldingRow.stale_nav`, `HoldingRow.plan_verified`; distributor `DistributorPortfolioRow.plan_type`, `nav_unavailable_schemes`, `DistributorSchemeBreakdown.annual_ter_saving`; `SnapshotRow.invested_value`, `is_partial`, `missing_scheme_names`. Check the exact names in `backend/app/services/dashboard/schemas.py` before typing them in `frontend/src/features/dashboard/types.ts`.
18. **[Pending — needs user, carried to the Phase 7 gate]** Phase 1 Task 10 Step 3 (staging Import health check) — will be done when staging is deployed with later phases.
19. [RESOLVED 6 Oct (user decision): amounts within 0.01% are one SIP — `sip.py`.] **[From Phase 6B Task 12 — needs a user decision, not yet changed] SIP series split by stamp duty.** From July 2020 the 0.005% stamp duty lowers each instalment's invested amount slightly, so under the decided rule "exact amounts distinguish series" (`services/dashboard/sip.py`) one SIP shows as an active series plus a phantom `stopped` one ending 2020-06-05. Only the opt-in "Show stopped SIPs" list is affected. Options: group within a stamp-duty tolerance, or group by gross amount (amount + stamp-duty row). Don't change the rule without the decision.
20. **[From Phase 6B Task 12 — fixed] Monthly history now values a 0 NAV at 0** (`snapshots.py`, `nav >= 0`; the 6A bulk rewrite skipped 0 and kept a written-off side pocket at its last NAV). Test in `test_snapshots.py`.
21. [RESOLVED 6 Oct (user decision): the line is dropped.] **[From Phase 6B review — needs a user decision, not yet changed] TER "Save ~x% per year with Direct" line** (`features/analytics/TerSection.tsx`). Task 11 asks for per-fund positive savings only; the line still compares the Direct bucket's weighted TER with the Regular bucket's (different funds). It now never shows a negative or 0.00% figure. Options: drop the line (per-fund savings already show in Distributor Comparison), or add a backend total of the per-fund `annual_ter_saving`.
22. [RESOLVED 6 Oct (user decision): imports as an unlisted CAS-only fund at the statement's NAV; candidates still ask, "Not listed" = `SchemeConfirmation.unlisted`.] **[From the Phase 7 gate — needs a user decision before Task 3] A held fund in no master has no candidates.** `p3u_FY.pdf` (Zephyr, made-up ISIN) gives `identification="ask"`, `candidates=[]`, `needs_review=True`. The planned fallback dialog requires picking a candidate for a held fund, so the user would be stuck. Options: import it as an unlisted (CAS-only) fund valued at the CAS's printed NAV, or skip that fund.
23. [RESOLVED 6 Oct, same change as 22: CAS-only funds keep their statements' printed prices as price history.] **[From the Phase 7 gate — recommended follow-up, not done] History for funds in no master.** A CAS-only fund (e.g. Unifund, merged 2022) has no NAV history, so every month it was held is `partial` and leaves it out (p20: 178 of 247 months). Fix idea: price such funds from the NAVs printed on their own CAS rows.

---

## Self-review (before printing the report)

1. `git diff --stat` and `git status --porcelain`: every changed/new file must belong to a task in this phase. Undo anything else.
2. `git diff --cached --stat` must be empty (nothing staged).
3. Review your own diff adversarially, as a hostile reviewer would. If Codex's `/review` command is available, run it on the uncommitted changes as well. Check specifically:
   - Every test would fail without its implementation (no tautologies, no over-mocking of the thing under test).
   - Money paths use `Decimal`; quantization matches `decimal_utils`.
   - Migrations: upgrade **and** downgrade written for both SQLite and Postgres branches; values frozen (no app imports); partitioned-table rules respected.
   - No raw PAN in logs, responses, `raw_parser_output` or new JSON.
   - Every new route has auth and ownership checks; dev routes are registered only in staging/development.
   - Interfaces exactly match the plan's **Interfaces** blocks (names, types, return shapes).
   - Review Focus items of this phase each have their test.
4. Fix what you find, re-run the affected tests, and list every finding (fixed or not) in the report.

---

## CODEX REPORT — template (print this, filled in, in ONE fenced code block at the very end)

```
CODEX REPORT — cas-import-fixes — Phase <N>
Run date/time: <…>    Environment: Windows / WSL    Python: <version>    Node: <version>

1. TASK STATUS
   Task <n>: DONE | PARTIAL | NOT STARTED | BLOCKED — <one line>
   (one line per task in the phase)

2. FILES
   Changed (tracked):   <paste `git diff --stat` summary lines>
   New (untracked):     <list of new files from `git status --porcelain`>
   Deleted:             <list, or none>
   Staged (must be empty): <`git diff --cached --stat` output>

3. TESTS (per task; exact command + last 3 lines of output)
   Task <n> RED:   <command> → <failed as expected because …>
   Task <n> GREEN: <command> → <N passed, M skipped …>
   Extra files added via grep: <files>
   Postgres functional tests: RAN (<result>) | SKIPPED (TEST_DATABASE_URL unset)
   tsc -b: <clean | errors>

4. DEVIATIONS FROM THE PLAN (mechanics only)
   - <task/step> — plan said <…>; code needed <…>; file:line — why

5. OPEN QUESTIONS / BLOCKERS (behaviour or interface conflicts; tasks paused)
   - <task/step> — <question> — what I'd need decided

6. SELF-REVIEW FINDINGS
   - [severity High/Med/Low] file:line — <finding> — FIXED | NOT FIXED (why)

7. CHECKPOINT RESULTS (last task of the phase)
   <numbers the plan asks for, per scenario; or "pending — needs user: <what>">

8. USER ANSWERS RECEIVED DURING THE RUN
   - <question> → <answer>

9. ANYTHING ELSE CLAUDE SHOULD KNOW
   - <environment problems, flaky tests, things you noticed outside scope (not fixed)>

10. CONFIRMATIONS
   - No git write commands used (except the allowed Task 0 restore): YES/NO
   - Full suites not run: YES/NO
   - Deferred items not built: YES/NO
```

---

## Round log (orchestrator appends after each report)

| Round | Phase | Result | Notes |
|---|---|---|---|
| 1 | Phase 1 | All tasks done except Task 5 (1 test awaiting ruling) and Task 10 Step 3 (staging, needs user). Orchestrator re-ran affected tests in WSL: backend 223 passed / 1 failed (the open one) / 5 skipped; frontend 36 files, 311 passed; `tsc -b` clean. | Ruling: rewrite the parallel-session test (keep the attach coverage with a statement that has a new row; separate test for the identical statement → AlreadyImportedError). Finding [Med]: `_all_rows_exist` vacuous True on zero rows + N×3 queries on re-upload → fix round 1. Approved deviations accepted (PDFium chain, read-only PAN pre-check, supporting edits, generic notice, waiting path). Postgres skipped (no migrations this phase). |
| 2 | Fix round 1 + Phase 2 | A1, A2 and Tasks 1–8 DONE. Orchestrator re-ran in WSL: affected set 340 passed/11 skipped; wider import/dashboard/api/analytics folders 942 passed/6 skipped; frontend 80 passed; tsc clean. Checkpoint: all p20 lookbacks value-match at CAS NAV except the two Phase 3 rows (twin SIPs #2, bonus #3); px_14yr ₹16.2 Cr → ₹3.0 Cr; FY↔20yr orders identical. | Approved deviations accepted (70.6042, SERIES 85, removed verdicts, face-value/merger by description, narrow XIRR guard, CAS-NAV checkpoint, Unifund→UTI exception owned by Phase 5). XIRR overflow cause was the blocked-network zero terminal value, not switches. **Postgres not run anywhere yet (0025 unverified on partitioned table) — carried as item 6.** |
| 3 | Phase 3 | Codex did Task 1 then hit its usage limit; orchestrator verified Task 1 on Postgres 16.2 (34 passed incl. 0025/0026) and implemented Tasks 2–5. Affected + wider backend run: 1,170 passed / 6 skipped; Postgres: 0026 up/down/up clean, 13 passed. Synthetic: 17/18 scenarios all-match except known exceptions; twin-SIP, bonus, bounced-SIP, gift and payout differences gone. | Deviations: old within-upload dedupe test now expects twins kept (#2 intended change); member_merge `_txn_key` gains occurrence (Phase 4 had planned it; needed now that twins exist). New exposure: Franklin segregated portfolio filed under main fund (identity, #8) → carry-over 7 for Phase 5. **Review gate:** fresh Opus Claude reviewer — APPROVE WITH FIXES (High: opening cost ignored new types; Medium: conversion cost same; Lows) → all fixed via shared `lot_rules.py` → scoped re-review APPROVE (20,000-sequence equivalence check on holdings). **DONE.** |
| 4 | Phase 4 | Orchestrator implemented Tasks 1–5: folio_key (+ ORM default from folio_number), migration 0027 (duplicate merge + transaction_imports backfill), lookups by key in confirm/merge, links for every row/opening/manual entry (`MatchResult`), delete-by-links with survivor re-pointing + `opening_restore.restore_openings` (cache-only NAV). 1,191 backend + 14 Postgres + all migration tests pass; 0027 up/down/up clean on Postgres; synthetic: all 21 scenarios match except the two Phase 5 exceptions; folio-spelling double count gone; delete-first/last keep units = CAS. | Review: fresh Opus reviewer REQUEST CHANGES (HIGH restore used later rows; HIGH 0027 merge could double an opening; MED link backfill first-writer only; MED missing restore tests; LOWs) → all fixed (chosen-import rows + tie order; normalise_cas_openings in 0027 + member_merge; raw-output link backfill; test_opening_restore.py; chunked delete) → scoped re-review APPROVE; its L1 (ambiguous name match in backfill) fixed with a test, L2 unreachable (summary CAS rejected at parse). **DONE.** Harness gained DELETE_LAST. |
| 5 | Phase 5 | Codex built Tasks 1–5. Orchestrator re-ran in WSL: backend 1,223 passed / 6 skipped; Postgres + migrations 41 passed; terraform fmt -check clean, `terraform validate` (staging) Success. Codex checkpoint: all 21 scenarios all-match in both normal and mfapi-blocked runs; zero pending, zero unclassified; Franklin main/segregated separate schemes, both match; Unifund imports as a closed CAS-only fund; master 14,356 rows, reload idempotent; 7 daily jobs exit 0. | Accepted deviations: one NAV seam (`service._fetch_nav_history`); exact-ISIN-always-verifies ruling (+ `nav_matched`); reinvestment-ISIN reconciliation; CAS-only rows excluded from master candidates. **Findings carried to Phase 6:** TER regression (carry-over 13, Task 7); harness master seeding not in repo (carry-over 14). **DONE.** |
| 6A | Phase 6 Task 0 + 1–8 | Codex built them. Orchestrator re-ran in WSL: backend 1,266 passed / 6 skipped; Postgres + migrations 43 passed; harness with MASTER_FILE reproduces (kfin_pk_10yr 5/5, p20_20yr 12/12; history 247 months in 0.8 s; kfin XIRR exact). Encrypted preview_state and the re-acquire claim checked in code. | Accepted deviations: data_version BigInteger; SipMonthlyRow.instalment; distributor additions; TER exact-name-then-fuzzy; shared _persist_preview test helper; claim re-acquire IN (previewing, processing); preview rows excluded by status everywhere (+ member-removal cleanup). **Carried:** p20 XIRR gap (carry-over 16), frontend field list (17). **DONE.** |
| 6B | Phase 6 Tasks 9–12 | Orchestrator implemented (Codex out of quota). Frontend Tasks 9–11 desktop + mobile; Task 12: Postgres 0028↔0029 + functional_postgres 14 passed, 21 synthetic scenarios all-match, carry-over 16 resolved (harness bug), app bug fixed (history ignored a 0 NAV), restart test OK, p20 history first build 0.28 s / 12 queries. Fresh Opus review: APPROVE WITH FIXES (findings 1–9, 11 fixed; 10 accepted as residual risk: a spurious mid-history 0 NAV from mfapi.in would now show as ₹0). Scoped re-review found one regression (stale SIPs across a member switch) — fixed; final scoped re-review APPROVE. 210 affected frontend tests pass, `tsc -b` clean. | Open for user: carry-overs 19 (stamp-duty SIP split), 21 (TER Save line); Task 12 Step 3 (staging + C1–C14). Five frontend files were CRLF in HEAD and are now LF (per .gitattributes) — whole-file diffs on commit. |
| 7 | Phase 7 (gate, Tasks 2–5) + 3 user decisions | Orchestrator (Codex out of quota). Decisions built: unlisted held funds at the statement NAV (+ statement prices for every CAS-only fund), SIP stamp-duty tolerance, TER "Save" line dropped. Gate PASSED: 46 synthetic scenarios × normal/mfapi-blocked (88/92; the 4 others are the by-design empty delete orders) + 2 real CAMS stakeholder statements (alone, both orders, blocked, repeated): every fund matches, zero review items. Task 2 needs_review/candidates; Task 3 (review-screen removal) built then RESTORED on the user's instruction (it waits for staging + screenshots; prepared confirmBody.ts / UnidentifiedFundsDialog.tsx kept, unused); Task 4 reclassify script; Task 5 docs (PRD-01 v1.5 FR-5 only; FR-10/App-Flow edits wait for the removal; schema/database/backend docs, decisions, log, session, CLAUDE.md). Fresh Opus reviews after each step; all findings fixed or accepted (privacy note L4 in decisions.md). Backend 1,126 + Postgres 14 + frontend 665 affected tests pass; tsc clean. | Left for staging: wipe (user OK), deploy, scheme-master one-off, real KFintech file, C1–C14; then the user confirms the gate → Task 3 removal. |
