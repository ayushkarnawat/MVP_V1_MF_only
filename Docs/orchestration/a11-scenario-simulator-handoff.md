# Handoff: a11-scenario-simulator
**Status:** OPEN — Run 1 (plan Tasks 1, 2, 3, 4, 5, 5b, 6, 7, 8) ready to issue after A04 closes, 2026-10-09
**Parent plan:** `Docs/superpowers/plans/2026-10-09-attribute-11-scenario-simulator.md` (binding, as revised 9 Oct — read its "Revised 2026-10-09" block, Global Constraints and Review Focus 1–10 first)
**Spec:** `Docs/analytics/2026-10-07-sub-project-1-planning.md`, "Attribute 11" · `Docs/analytics/2026-10-08-attribute-11-scenario-simulator-spec.md` · explainer: `Docs/orchestration/subproject1-execution/a11-scenario-simulator.html` (cards 1–12)
**Orchestrator:** Claude Code (rulings, WSL + Postgres verification, review, commits, docs) · **Worker:** Codex
**Review baseline:** HEAD when the user pastes the prompt (`git log -1 --format=%h`, put it in the report)

---

## How this works (read first)

1. The user pastes a short prompt into Codex naming the run.
2. Codex reads this file and the plan, implements the run's tasks in order, test-first.
3. Codex self-reviews, fixes what it can, and prints the **CODEX REPORT** (template below) in one fenced code block.
4. Claude Code re-runs the tests in WSL, runs both migrations on local Postgres, reviews, commits per task, and closes the run or writes a fix round.

## Runs

| Run | Plan tasks | What |
|---|---|---|
| **Run 1** | 1, 2, 3, 4, 5, 5b, 6, 7, 8 | Backend: tables + seed (two migrations), NAV backfill script, the underlying-asset classifier, the engine (proxies, household-weighted serving, Franklin match, quick stats), compute-all script, TRI benchmarks, API with the hypotheticals flag, daily ongoing-scenario step |
| **Run 2** | 9, 10, 11, 12 | Frontend: types, picker, 4 result views, Scenarios screen on desktop and mobile, 2 colour tokens |

## Where things stand — 2026-10-09

- **Latest migration is `0035` (A04).** These two are expected to be `0036` (tables) and `0037` (seed) — run `ls backend/alembic/versions | sort | tail -5` first.
- All decisions are made (user, 9 Oct; 12 cards). The plan's code blocks carry them; the Revised block explains each.
- **Release gate:** `Settings.scenario_hypotheticals_enabled` defaults to **off**; hypotheticals stay hidden until a markets-literate review of the 45 assumption values (`decisions.md` 2026-10-08).
- **A12 is committed** (`benchmark_index_history.return_type`): benchmark lookups filter `TRI` only.
- **A09 changed the shared peer lookup** (`scheme_universe.canonical_category`, `get_category_peers`, live-fund rule). A11's engine uses its own all-active-schemes pass, not those helpers — don't switch it.
- Task 3's NAV backfill and Task 5b's compute-all are **scripts the orchestrator runs on staging**; Codex builds and tests them only.

## Constraints (non-negotiable)

**Git — read-only, whitelist.** Only `git status`, `git diff`, `git log`, `git show`, `git grep`, `git ls-files`. Leave everything uncommitted.

**Allowed to create:** exactly two new migrations (tables, seed). **Never run `alembic upgrade`/`downgrade` against a real database, never run the backfill or compute-all scripts against one.** `tests/test_migrations.py` must round-trip both migrations on SQLite.

**Never touch:** `backend/.env`, existing migrations, `frontend/` (Run 1), `infra/`, real CAS PDFs, `Docs/**`, `DEFERRED_FEATURES.md`, `decisions.md`, `log.md`, `session.md`, `CLAUDE.md`, `AGENTS.md`, `backend.md`, `database.md`.

**Follow the plan literally.** Mechanics differ? Adapt minimally, list under "Deviations". Behaviour, formula, copy or interface would change? Stop that part, list under "Open questions", continue.

**Test-first.** Test → fail for the right reason → implement → green.

**Tests: only the named files, never a full suite.** Windows, from `backend\`: `.venv\Scripts\python.exe -m pytest <files> -q -p no:cacheprovider`. Final run includes every new test file plus `tests/test_migrations.py`, `tests/scripts/test_background_jobs.py`, `tests/api/test_analytics_route.py`; `git grep` the tests for `Base.metadata.create_all` users if the new models break any (they must not — card 2).

**Project rules** (`AGENTS.md`): Decimal, never float; LF, UTF-8; no new dependencies; no live network calls in tests.

## Approaches considered and rejected (don't re-litigate)

- **`postgresql.ARRAY` in the model** — breaks every SQLite test; JSON-with-Postgres-ARRAY variant instead (card 2).
- **Computing scenarios in the seed migration, or on first open** — no NAV data yet / too slow; Task 5b script (card 1).
- **"index"/"etf" → equity** — gold, silver, bond and overseas wrappers get their own class (card 3).
- **Plain average for the headline %** — household-weighted (card 6).
- **Exact full-name or "contains" Franklin match** — normalised base-name match + AMC check (card 7).
- **One blended quick stat** — market + equity funds + debt funds, separately (card 10).
- **Shipping hypotheticals unflagged** — release gate (card 12).

## Open questions (Codex: flag back, don't guess)

- If a seed row's data contradicts the spec (dates, display ranks, assumption values), list it — don't edit values.
- If `compute_holdings`' row shape differs from what the engine reads (`scheme_id`, `household_member_id`, `scheme_name`, `current_value`), list it.

---

## Self-review (before printing the report)

1. `git diff --stat` / `git status --porcelain`: every change belongs to this run.
2. `git diff --cached --stat` is empty.
3. Review against Review Focus 1–10 and check:
   - no-data and frozen holdings never count as 0%;
   - the US-Iran hero uses the group row's results;
   - all 6 real Franklin names match, and live Franklin funds don't;
   - no gold/silver/bond wrapper gets the equity assumption;
   - with the flag off, no hypothetical is listed or served;
   - TRI only at both benchmark ends;
   - the seed runs on SQLite (typed inserts, Python uuids);
   - no float maths.
4. Fix what you find, re-run the affected tests, list every finding.

---

## CODEX REPORT — template (print this, filled in, in ONE fenced code block at the very end)

```
CODEX REPORT — a11-scenario-simulator — Run <n>
Run date/time: <…>    Environment: Windows    Python: <version>    Baseline HEAD: <hash>

1. TASK STATUS
   Task <n>: DONE | PARTIAL | BLOCKED — <one line>   (one line per task)

2. FILES (grouped by plan task, so the orchestrator can commit per task)
   Task <n>: <files>
   Migration file + revision id: <name>, revision <id>, down_revision <id>
   New (untracked):     <from git status --porcelain>
   Staged (must be empty): <git diff --cached --stat>

3. TESTS (exact command + last 3 lines of output)
   RED:   <command> → <failed as expected because …>   (per task)
   GREEN: <command> → <N passed …>
   Extra files added via grep: <files>

4. DEVIATIONS FROM THE PLAN (mechanics only)
   - <task/step> — said <…>; code needed <…>; file:line — why

5. OPEN QUESTIONS / BLOCKERS
   - <question> — what I'd need decided

6. SELF-REVIEW FINDINGS
   - [High/Med/Low] file:line — <finding> — FIXED | NOT FIXED (why)

7. ANYTHING ELSE CLAUDE SHOULD KNOW

8. CONFIRMATIONS
   - No git write commands used: YES/NO
   - Full suites not run: YES/NO
   - No alembic upgrade/downgrade against a real database: YES/NO
   - Docs/, infra/, frontend/ (Run 1), existing migrations untouched: YES/NO
```

---

## Round log (orchestrator appends after each report)

| Round | Run | Result | Notes |
|---|---|---|---|
| — | Run 1 | ready 2026-10-09 | Tasks 1, 2, 3, 4, 5, 5b, 6, 7, 8 — issue after A04 closes. |
