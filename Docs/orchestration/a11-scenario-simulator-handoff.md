# Handoff: a11-scenario-simulator
**Status:** OPEN — Runs 1–2 approved and committed (`4ee7afe`…`0290c76`); close-out next, 2026-10-10
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

**Running alongside A04 (10 Oct).** Another Codex session is building A04 (fund managers) in this same working tree. Its files are yours to ignore — never edit, revert or format them: `backend/app/services/analytics/fund_manager_*.py`, `amfi_factsheet_client.py`, `backend/scripts/jobs/*fund_managers*.py`, `backend/tests/services/analytics/test_fund_manager*`, `test_amfi_factsheet_client.py`, `backend/tests/fixtures/factsheets/`. In `git status`/`git diff`, list only this run's files in the report. If a shared test (`test_recompute.py`, `test_migrations.py`) fails in a fund-manager test or file, report it, don't fix it.

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
| 1 | Run 1 | fix round 2026-10-10 | Codex: Tasks 1–8 built; final run sandbox-blocked. Orchestrator WSL: 120 passed, 1 deliberate failure (unseeded hypothetical); Postgres 0035→0037→0035→0037 clean, seed 34 scenarios / 45 assumptions. Codex's 4 questions ruled (plan Run 1 rulings 1–4; 2 and 3 by the user). Review (Opus): CHANGES NEEDED → rulings 5–10 (serve-time proxy for new schemes; canonical categories, one series per fund; classifier fixes; Numeric(10,2); ongoing end bound; backfill filters, no_data_funds, non-blocking list, real-row date test). Fix round issued to Codex. |
| 2 | Run 1 fix round | approved 2026-10-10 | Commits `4ee7afe` (T1, 0036), `7eab737` (T2, 0037), `781940c` (T3), `0d17a97` (T4), `1b47b44` (T5/5b/6), `0680bda` (T7), `af7c5e0` (T8). Rulings 1–10 built; Codex's final run sandbox-blocked — WSL: 164 passed; Postgres round trip of the edited 0036/0037 clean (`text[]`, `numeric(10,2)`, 34 scenarios / 45 assumptions / 1 freeze row). Re-review (Sonnet): CHANGES NEEDED → fixed by orchestrator, test-first: single-option ETFs (no "Growth" in the NAVAll name) were left out of every average — now only IDCW/dividend/bonus are excluded; Edelweiss "MSCI India Domestic & World" index not Overseas. Noted for later: `GET /scenarios/{id}` still does its DB work on the event loop (pre-existing pattern, not in the rulings). |
| 3 | Run 2 | approved 2026-10-10 | Commits `9ce9c1b` (T9), `ea7bc71` (T10), `09b2a9e` (T11), `0290c76` (T12). Codex: 55 tests + tsc; default vitest run sandbox-blocked; WSL: 55 passed, tsc clean. Review (Sonnet): APPROVE — types match the backend schema; rulings 1/3/5 honoured. Orchestrator fixes, test-first: rupees rounded twice (1234.496 → ₹1,235); keyboard focus fell to <body> on view change (now the heading). Kept: "₹-1,234" (matches sibling cards), "Redemptions frozen ~20mo" (plan wording; Franklin is the only freeze), single-member "Biggest contributor" label, tooltip-trigger button. Not done: a manual desktop/mobile visual check (Codex's browser couldn't attach) — do it on staging. |
| — | Close-out | pending | Local end-to-end check (NAV backfill + compute-all on local Postgres, then the Scenarios screen against real results), closing docs (log.md, session.md, backend.md, database.md), staging deploy order (backfill → compute-all → flag stays off). |
