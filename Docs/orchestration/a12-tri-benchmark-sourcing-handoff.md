# Handoff: a12-tri-benchmark-sourcing
**Status:** OPEN — Run 1 (plan Tasks 1–6) ready to issue after A14's Run 2 is committed, 2026-10-09
**Parent plan:** `Docs/superpowers/plans/2026-10-09-attribute-12-tri-benchmark-sourcing.md` (binding, as revised 9 Oct — read its "Revised 2026-10-09" note, Global Constraints and Review Focus first)
**Spec:** `Docs/analytics/2026-10-07-sub-project-1-planning.md`, "Attribute 12" · explainer: `Docs/orchestration/subproject1-execution/a12-tri-benchmark.html`
**Orchestrator:** Claude Code (rulings, WSL + Postgres verification, review, commits, docs) · **Worker:** Codex (builds the run, self-reviews, prints the report)
**Review baseline:** HEAD when the user pastes the prompt (`git log -1 --format=%h`, put it in the report)

---

## How this works (read first)

1. The user pastes a short prompt into Codex naming **Run 1**.
2. Codex reads this file and the plan, then implements Tasks 1–6 in order, test-first.
3. Codex self-reviews (section "Self-review"), fixes what it can, and ends by printing the **CODEX REPORT** (template at the bottom) in one fenced code block.
4. The user pastes the report back to Claude Code, which re-runs the tests in WSL, runs the migration against local Postgres, reviews the diff, commits each task separately (the plan's commit steps), and either closes the run or writes a fix-round prompt.

## Runs

| Run | Plan tasks | What |
|---|---|---|
| **Run 1** | 1–6 | Backend only: `return_type` column + migration, the 5 lookups re-keyed, `_fetch_tri_history`, a pinning test, the daily job fetching TRI from 1990, `benchmark.py` reading TRI |

One run: the attribute is small, backend-only, and its tasks build on each other.

## Where things stand — 2026-10-09

- **Latest migration is `0032_transaction_stamp_duty`** (A14 added none). This attribute's migration should be `0033` — but run `ls backend/alembic/versions | sort | tail -5` first and use the real next number; never a number from a doc.
- The plan was revised and checked against the code on 9 Oct. All decisions are made (user, 9 Oct): TRI for every fund-vs-index comparison (`benchmark.py` switches in Task 6, no fallback to price); TRI history from 1 Jan 1990 in the daily job, price stays at 10 years; no separate backfill script.
- **The live TRI endpoint was re-checked on 9 Oct** with the exact request `_fetch_tri_history` sends: top-level JSON array, `Date` like `"10 Sep 2026"`, `TotalReturnsIndex` a 2-decimal string, `NTR_Value` often `"-"`, no date-range limit, and a request without a User-Agent is dropped. Tests mock HTTP; don't call NSE.
- **The migration's SQLite branch and its downgrade were verified on SQLite on 9 Oct** (the plan's Task 1 code). `tests/test_migrations.py` round-trips every migration on SQLite, so it must pass.
- Staging is deferred until all five Sub-project 1 attributes are built (user, 9 Oct).

## Constraints (non-negotiable)

**Git — read-only, whitelist.** Only `git status`, `git diff`, `git log`, `git show`, `git grep`, `git ls-files`. Never `commit`, `add`, `rm`, `mv`, `reset`, `checkout`, `stash`, `restore`, `rebase`, `merge`, `push`. Leave everything uncommitted; the orchestrator commits each task after verifying it.

**Allowed to create:** exactly one new migration file in `backend/alembic/versions/`. **Don't run `alembic upgrade`/`downgrade` against any real database** (`backend/.env`'s `DATABASE_URL` included) — `tests/test_migrations.py` covers SQLite, and the orchestrator runs Postgres.

**Never touch:** `infra/`, `backend/.env`, any existing migration file, `frontend/`, real CAS PDFs, `Docs/CAS Files/`, and the orchestrator's files: `Docs/**`, `DEFERRED_FEATURES.md`, `decisions.md`, `log.md`, `session.md`, `CLAUDE.md`, `AGENTS.md`, `backend.md`, `database.md`.

**Follow the plan literally.** If the code contradicts it in *mechanics* (a name, an import path, a fixture field), adapt minimally and record under "Deviations". If it would change *behaviour, a formula or an interface*, stop that part, record it under "Open questions", and continue with what doesn't depend on it.

**Test-first.** Write or update the test → run it → see it fail for the right reason → implement → green. (Task 4 is a pinning test that passes straight away; say so.)

**Tests: only the named files, never a full suite.** On Windows, from `backend\`: `.venv\Scripts\python.exe -m pytest <files> -q -p no:cacheprovider`. Always include `tests/services/analytics/test_nse_indices_client.py`, `tests/services/analytics/test_benchmark.py`, `tests/scripts/test_background_jobs.py` and `tests/test_migrations.py` in the final run. Before it, `git grep` the tests for every symbol you changed (`_upsert_index_history`, `_cached_date_bounds`, `_fetched_from`, `ensure_index_history_fresh`, `get_index_level_on_or_before`, `BenchmarkIndexHistory`, `main_async`) and add the matching test files.

**Project rules** (`AGENTS.md`): Decimal for every index value, never float; LF line endings, UTF-8; no new dependencies.

## Approaches considered and rejected (don't re-litigate)

- **A parallel `benchmark_index_tri` table** — rejected: same row shape, so a `return_type` dimension column.
- **Keeping the upsert/cache keyed by index alone** — that's the bug this attribute fixes: TRI rows would be skipped on every date that already has a PRICE row.
- **A one-off TRI backfill script** — rejected 9 Oct: one request returns full history (~1 MB, ~0.3 s), so the daily job asks from 1990.
- **Falling back to price when TRI is missing** — rejected: no mixing; a window without TRI has no benchmark.
- **Storing `NTR_Value`** — not needed; it's often `"-"`.
- **A new test file for the daily job** — rejected: update the existing test in `tests/scripts/test_background_jobs.py`.

## Open questions (Codex: flag back, don't guess)

- If `tests/test_migrations.py` fails on the SQLite branch in a way the plan's code doesn't cover.
- If any test outside the files named above breaks because rows now carry `return_type` or `benchmark.py` reads TRI — list it with the failure; fix only fixture data.

---

## Self-review (before printing the report)

1. `git diff --stat` and `git status --porcelain`: every changed or new file belongs to this run. Undo anything else **only if you created it**; never revert a file you didn't change (the orchestrator may have uncommitted docs).
2. `git diff --cached --stat` is empty.
3. Review the diff as a hostile reviewer (run Codex `/review` on the uncommitted changes if available). Check against the plan's Review Focus 1–5: PRICE and TRI rows for one date both persist; price-only lookups unchanged by TRI rows and `benchmark.py` reads TRI at both ends (price rows alone → no benchmark); `NTR_Value = "-"` never read; `_fetched_from` keyed by `(index, return_type)`; a TRI fetch failure returns `False` and leaves the cache alone. Also: all 5 lookups re-keyed (none left filtering by index only); the job asks TRI from 1990-01-01 and price from 10 years back; the migration's upgrade and downgrade both work on SQLite; no float maths.
4. Fix what you find, re-run the affected tests, list every finding in the report.

---

## CODEX REPORT — template (print this, filled in, in ONE fenced code block at the very end)

```
CODEX REPORT — a12-tri-benchmark-sourcing — Run 1
Run date/time: <…>    Environment: Windows    Python: <version>    Baseline HEAD: <hash>

1. TASK STATUS
   Task <n>: DONE | PARTIAL | BLOCKED — <one line>   (one line per task, 1–6)

2. FILES (grouped by plan task, so the orchestrator can commit per task)
   Task <n>: <files>
   Migration file + revision id: <name>, revision <id>, down_revision <id>
   New (untracked):     <from git status --porcelain>
   Staged (must be empty): <git diff --cached --stat>

3. TESTS (exact command + last 3 lines of output)
   RED:   <command> → <failed as expected because …>   (per task; Task 4 passes at once)
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
   - Docs/, infra/, frontend/, existing migrations untouched: YES/NO
```

---

## Round log (orchestrator appends after each report)

| Round | Run | Result | Notes |
|---|---|---|---|
| — | Run 1 | ready 2026-10-09 | Tasks 1–6, after A14 Run 2 is committed. |
