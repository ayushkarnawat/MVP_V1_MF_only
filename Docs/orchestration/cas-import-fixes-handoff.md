# Handoff: cas-import-fixes
**Status:** IN_PROGRESS — Phases 1–2 reviewed; Phase 3 ready (needs Postgres)
**Parent plan:** `Docs/superpowers/plans/2026-10-06-cas-import-fixes-00-index.md` (+ phase files `…-p1-…` to `…-p7-…`)
**Spec:** `Docs/investigations/2026-10-05-cas-import-fix-plan-final.html` (v15) · decisions in `decisions.md` (2026-10-05/06 entries)
**Orchestrator:** Claude Code (plans, reviews, rulings, checkpoints) · **Worker:** Codex (builds one phase per run, self-reviews, reports back)
**Review baselines:** `d2ca49b` (before Phase 1) · `e62dbd3` (after Phase 1, before fix round 1 + Phase 2) · `937fefa` (after Phase 2, before Phase 3). Snapshot commits, not on any branch; the orchestrator diffs against them — Codex doesn't need to do anything with them.

---

## How this works (read first)

1. The user pastes a short prompt into Codex naming **one phase** (e.g. "Phase 1").
2. Codex reads this file, the master index, and that phase's plan file, then implements that phase's tasks **in order**, test-first, exactly as written.
3. Codex self-reviews the whole phase (section "Self-review" below), fixes what it can, and ends its run by printing the **CODEX REPORT** (template at the bottom) inside one fenced code block.
4. The user pastes the report back to Claude Code. Claude reviews the working tree against the baseline, rules on open questions, and either sends fixes back (a "fix round" prompt) or writes the next phase's prompt.

One phase per run. Don't start the next phase, even if there is time left.

---

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
6. **[From Phase 2 review] Postgres is required from Phase 3 on.** Neither the orchestrator's WSL nor Codex's run had a Postgres. The user starts `docker compose up postgres` (repo root, Docker Desktop; port 5433) and sets `TEST_DATABASE_URL=postgresql+psycopg2://unifolio:unifolio@localhost:5433/unifolio_test`. Phase 3's run must first run `tests/functional_postgres/` in full on the Phase 2 code (covers migration 0025 on the partitioned table) before starting Task 1, and report it.
7. **[Pending — needs user, carried to the Phase 7 gate]** Phase 1 Task 10 Step 3 (staging Import health check) — will be done when staging is deployed with later phases.

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
