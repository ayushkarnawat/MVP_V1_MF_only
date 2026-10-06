# Handoff: cas-import-fixes
**Status:** OPEN — Phase 1 ready for Codex
**Parent plan:** `Docs/superpowers/plans/2026-10-06-cas-import-fixes-00-index.md` (+ phase files `…-p1-…` to `…-p7-…`)
**Spec:** `Docs/investigations/2026-10-05-cas-import-fix-plan-final.html` (v15) · decisions in `decisions.md` (2026-10-05/06 entries)
**Orchestrator:** Claude Code (plans, reviews, rulings, checkpoints) · **Worker:** Codex (builds one phase per run, self-reviews, reports back)
**Review baseline:** snapshot commit `d2ca49b09efb8752e3b93eaa83ee5456c3a4644b` (working tree before Codex starts; not on any branch). The orchestrator diffs against it — Codex doesn't need to do anything with it.

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

*(none yet)*

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
| — | — | — | — |
