# Handoff: a09-fund-ranking
**Status:** DONE — Runs 1–2 committed (`24a1f74`, `02d5a2c`, `a5d1919`, `94bc9d0`); follow-ups `6c36e0c` (Scorer peer set) and `9fe1174` (live-fund peers); synthetic gate passed 8/8 at `4f72480`, 2026-10-09
**Parent plan:** `Docs/superpowers/plans/2026-10-09-attribute-09-fund-ranking.md` (binding, as revised 9 Oct — read its "Revised 2026-10-09" block, Global Constraints and Review Focus 1–8 first)
**Spec:** `Docs/analytics/2026-10-07-sub-project-1-planning.md`, "Attribute 09" · `Docs/analytics/2026-10-08-attribute-09-fund-ranking-spec.md` · explainer: `Docs/orchestration/subproject1-execution/a09-fund-ranking.html`
**Orchestrator:** Claude Code (rulings, WSL + Postgres verification, review, commits, docs) · **Worker:** Codex (builds the run, self-reviews, prints the report)
**Review baseline:** HEAD when the user pastes the prompt (`git log -1 --format=%h`, put it in the report)

---

## How this works (read first)

1. The user pastes a short prompt into Codex naming the run.
2. Codex reads this file and the plan, then implements the run's tasks in order, test-first.
3. Codex self-reviews (section "Self-review"), fixes what it can, and ends by printing the **CODEX REPORT** (template at the bottom) in one fenced code block.
4. The user pastes the report back to Claude Code, which re-runs the tests in WSL, runs the migration against local Postgres, reviews the diff, commits each task separately, and either closes the run or writes a fix-round prompt.

## Runs

| Run | Plan tasks | What |
|---|---|---|
| **Run 1** | 1, 2, 2a, 3, 4 | Backend: tables + migration, detailed returns, canonical categories + one-series-per-fund peers (also used by the existing Category Ranking section) + zero-NAV guard, the ranking engine, endpoint + `ranking` section |
| **Run 2** | 5 | Frontend: `FundRankingSection.tsx`, types, Analytics + print wiring (issued after Run 1 is committed) |

## Where things stand — 2026-10-09

- **Latest migration is `0033_benchmark_return_type`** (A12). This one is expected to be `0034` — run `ls backend/alembic/versions | sort | tail -5` first and use the real next number.
- All decisions are made (user, 9 Oct): fixes 1–4, peers fixes 1 + 2, display D1 + D2. They're written into the plan's code blocks; the "Revised" block explains each.
- **Task 2a changes the existing Category Ranking section's numbers on purpose** (peer set = one series per fund in the canonical category). Staging is wiped before release, so there's no data migration. `scorer.py` gets only the canonical-category match (through `get_category_universe`) and must otherwise behave exactly as today — `test_scorer.py` must pass unchanged.
- **Zero NAVs:** AMFI's live file has 241 rows at NAV 0.0000 (wound-up/segregated schemes). Today they crash `category_ranking` and `score` for whole categories (seen in the 9 Oct synthetic run). Task 2a's guard fixes it; the test is in the plan.
- **TER is stored as a percent** (`Numeric(5, 2)`, 0.75 = 0.75%); returns are fractions. Matters in Run 2.
- Staging is deferred until all five Sub-project 1 attributes are built.

## Constraints (non-negotiable)

**Git — read-only, whitelist.** Only `git status`, `git diff`, `git log`, `git show`, `git grep`, `git ls-files`. Never `commit`, `add`, `rm`, `mv`, `reset`, `checkout`, `stash`, `restore`, `rebase`, `merge`, `push`. Leave everything uncommitted.

**Allowed to create:** exactly one new migration file. **Don't run `alembic upgrade`/`downgrade` against any real database** — `tests/test_migrations.py` covers SQLite; the orchestrator runs Postgres.

**Never touch:** `infra/`, `backend/.env`, any existing migration file, `frontend/` (Run 1), real CAS PDFs, `Docs/CAS Files/`, and the orchestrator's files: `Docs/**`, `DEFERRED_FEATURES.md`, `decisions.md`, `log.md`, `session.md`, `CLAUDE.md`, `AGENTS.md`, `backend.md`, `database.md`.

**Follow the plan literally.** Mechanics differ (a name, an import path, a fixture helper)? Adapt minimally and record under "Deviations". Would it change *behaviour, a formula or an interface*? Stop that part, record it under "Open questions", continue with the rest.

**Test-first.** Write or update the test → run it → see it fail for the right reason → implement → green.

**Tests: only the named files, never a full suite.** On Windows, from `backend\`: `.venv\Scripts\python.exe -m pytest <files> -q -p no:cacheprovider`. Final run must include: `tests/services/analytics/test_fund_ranking.py`, `test_category_ranking.py`, `test_scheme_universe.py`, `test_scheme_master.py`, `test_scorer.py`, `test_recompute.py`, `tests/api/test_analytics_route.py`, `tests/test_migrations.py`. Before it, `git grep` the tests for every symbol you changed (`get_category_universe`, `_category_returns`, `_compute_category_returns`, `UniverseRow`, `_parse_nav_all`, `compute_category_ranking`, `_SECTIONS`) and add the matching files.

**Project rules** (`AGENTS.md`): Decimal for every value, never float; LF line endings, UTF-8; no new dependencies.

## Approaches considered and rejected (don't re-litigate)

- **Universe count for the thin flag** — rejected: "#2 of 8" overstates a rank among 3 (fix 3).
- **Fuzzy category matching** — rejected: an explicit alias list only; ambiguous legacy headings stay separate.
- **Ranking every plan variant** — rejected: a Direct plan beats its own Regular plan for free, and IDCW NAVs drop at payouts (Task 2a).
- **Pooling sibling categories (Value + Contra + Dividend Yield)** — rejected: the spec promises a SEBI-category rank (D3).
- **Ranking with 1–2 ranked funds** — rejected: no rank below 3 (D2).
- **`INSERT … ON CONFLICT DO NOTHING`** for same-day writes — rejected: keep `fund_scores`' insert-and-catch pattern, add the tests (fix 4).
- **A separate peers table** — rejected: peers are derived from AMFI's file each time, like the universe.

## Open questions (Codex: flag back, don't guess)

- If an existing test outside the named files breaks because of the canonical match or the peer change — list it with the failure; fix only fixture data.
- If `test_scheme_universe.py` has no SQLite session helper, copy the one from `test_category_ranking.py` and note it as a deviation (not a question).

---

## Self-review (before printing the report)

1. `git diff --stat` and `git status --porcelain`: every changed or new file belongs to this run. Never revert a file you didn't change.
2. `git diff --cached --stat` is empty.
3. Review the diff as a hostile reviewer against Review Focus 1–8. Also: `composite_score` is the composite everywhere (row, stored history, neighbors); `thin_category` uses the ranked count; under 3 ranked → `too_few_peers`, no percentiles, no `scheme_rankings` row; the two cache keys (`_category_returns`, `_category_ranking_cache`) can't mix a peer set with a full universe or Direct with Regular; `scorer.py` behaviour unchanged; zero/negative NAV never divides; no float maths.
4. Fix what you find, re-run the affected tests, list every finding in the report.

---

## CODEX REPORT — template (print this, filled in, in ONE fenced code block at the very end)

```
CODEX REPORT — a09-fund-ranking — Run <n>
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
| — | Run 1 | ready 2026-10-09 | Tasks 1, 2, 2a, 3, 4. |
| 1 | Run 1 | approved 2026-10-09 | Tasks 1–4 built (173 Windows tests). Codex's 6 open questions ruled: 76.67 example was a plan error (Step 6 test governs); "agree" = same peers/counts, not rank; IDCW-only fallback kept; six-field rows kept; AMFI-outage peers → empty (orchestrator fix, test-first); interior zero NAV in `monthly_returns` → skipped (orchestrator fix, test-first; also protects Scorer). Review (Sonnet): APPROVE, 5 Low — fixed: empty peer scores not cached (test-first); accepted: unknown plan_type picks any plan (scheme master sets plan_type), fetch failure shows Category Unavailable, local vs UTC date, CRLF→LF in analytics.py, Numeric(8,6) return ceiling. WSL 198 passed; Postgres 0034 round trip clean. |
| 2 | Run 2 | approved 2026-10-09 | Task 5 built (27 tests, tsc clean). Codex open question ruled: the PDF export gets its own optional `fundRanking` field (old exports still print); wired by orchestrator, test-first. Review (Sonnet): CHANGES NEEDED → fixed by orchestrator: Fund Ranking now renders on mobile (Med), no "Top 100%" for a missing percentile, duplicate category count dropped, expand button holds only phrasing content + aria-controls; kept "Thin Category (N peers)" (approved copy). 33 tests + tsc clean. Committed `94bc9d0`. |
| gate | synthetic | passed 2026-10-09 | 8/8 scenarios at `4f72480`: a09 + a14 checks 0 mismatches; analytics 9.7–28.2 s (category ranking 0.8–4.3 s, fund ranking 2.2–5.6 s, scorer 1.5–5.1 s). |
