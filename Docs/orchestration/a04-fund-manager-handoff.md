# Handoff: a04-fund-manager
**Status:** OPEN — Run 1 approved and committed (`bede56a`…`4f72480`); Run 2 approved and committed; Task 8 onboarding (Runs 3–7) next, 2026-10-09
**Parent plan:** `Docs/superpowers/plans/2026-10-09-attribute-04-fund-manager-allocation.md` (binding, as revised 9 Oct — read its "Revised 2026-10-09" block, Global Constraints and Review Focus 1–7 first)
**Spec:** `Docs/analytics/2026-10-07-sub-project-1-planning.md`, "Attribute 04" · `Docs/analytics/2026-10-08-attribute-04-fund-manager-spec.md` · catalogue: `Docs/analytics/2026-10-09-attribute-04-factsheet-layouts.md` · explainer: `Docs/orchestration/subproject1-execution/a04-fund-manager.html`
**Orchestrator:** Claude Code (rulings, WSL + Postgres verification, review, commits, docs) · **Worker:** Codex
**Review baseline:** HEAD when the user pastes the prompt (`git log -1 --format=%h`, put it in the report)

---

## How this works (read first)

1. The user pastes a short prompt into Codex naming the run.
2. Codex reads this file and the plan, then implements the run's tasks in order, test-first.
3. Codex self-reviews, fixes what it can, and ends by printing the **CODEX REPORT** (template below) in one fenced code block.
4. Claude Code re-runs the tests in WSL, runs the migration on local Postgres, reviews, commits per task, and closes the run or writes a fix round.

## Runs

| Run | Plan tasks | What |
|---|---|---|
| **Run 1** | 1, 3b, 2, 3, 4, 5, 6, 21 | Backend: table + migration, per-AMC readers (Nippon, Edelweiss, HDFC, Kotak, ABSL) with real-text fixtures, the 55-entry registry, matching/import/checks/alerts, monthly job + Terraform alarm, household aggregation (3-month staleness), the analytics section, the manual-import CLI |
| **Run 2** | 7 | Frontend: `FundManagerSection.tsx`, types, Analytics + print wiring |
| **Runs 3–7** | 8 (batches) | Onboard the other 51 AMCs, one procedure each, coverage ≥ 90% or a reason per miss |

## Where things stand — 2026-10-09

- **Latest migration is `0034` (A09).** This one is expected to be `0035` — run `ls backend/alembic/versions | sort | tail -5` first.
- **Real text for fixtures** is in `C:\Users\Dell\Desktop\Unifolio\Factsheets\2026-10-catalogue\` (Nippon, Edelweiss and the other fetched AMCs; `manual_hdfc_aug2026.txt`, `manual_kotak_sep2026.txt`). Copy two scheme pages per reader **verbatim** into `backend/tests/fixtures/factsheets/` (1–3 KB each). Never commit the PDFs or the full dumps.
- **The readers in Task 3b were run on the real files on 9 Oct** with Task 3's matcher: Nippon 100/108 live funds, Edelweiss 75/76, HDFC 53/53 active, Kotak 112/120, ABSL 82/104 (ABSL stays `layout=None` in the registry until its Task 8 onboarding).
- **No live network calls in tests.** Mock `httpx`; the only real-world data in tests is the fixture text.

## Constraints (non-negotiable)

**Git — read-only, whitelist.** Only `git status`, `git diff`, `git log`, `git show`, `git grep`, `git ls-files`. Leave everything uncommitted.

**Allowed to create:** exactly one new migration. **Don't run `alembic upgrade`/`downgrade` against any real database.** **Terraform:** edit `infra/modules/scheduler/main.tf` as Task 4 says and run only `terraform fmt -check` / `terraform validate` — never `plan` or `apply`.

**Never touch:** `backend/.env`, existing migrations, `frontend/` (Run 1), real CAS PDFs, `Docs/**`, `DEFERRED_FEATURES.md`, `decisions.md`, `log.md`, `session.md`, `CLAUDE.md`, `AGENTS.md`, `backend.md`, `database.md`.

**Follow the plan literally.** Mechanics differ? Adapt minimally and record under "Deviations". Behaviour, formula or interface would change? Stop that part, record it under "Open questions", continue.

**Test-first.** Test → fail for the right reason → implement → green.

**Tests: only the named files, never a full suite.** Windows, from `backend\`: `.venv\Scripts\python.exe -m pytest <files> -q -p no:cacheprovider`. Final run includes every new test file plus `tests/services/analytics/test_recompute.py`, `tests/api/test_analytics_route.py`, `tests/test_migrations.py`; `git grep` the tests for `_SECTIONS` and `SchemeFundManager` and add what matches.

**Project rules** (`AGENTS.md`): Decimal, never float; LF, UTF-8; no new dependencies (`pypdfium2` is already installed).

## Approaches considered and rejected (don't re-litigate)

- **One generic manager regex** — matched 5 of 22 AMCs' real files; per-AMC readers instead (card 3).
- **"First line of the page is the scheme name"** — wrong for most AMCs; per-AMC heading rules.
- **Matching per plan row** — matching is per fund family, written to every plan row (card 1).
- **An AUM tie-break and a saved alias table** — not needed: matching hit 100% of extracted names on the real files.
- **The job publishing to SNS itself** — needs a task role; a log metric filter + alarm instead (card 2).
- **Edelweiss as manual** — its page served the September file over plain HTTP on 9 Oct.
- **Deferring any AMC past staging** — every AMC is onboarded in Runs 3–7.

## Open questions (Codex: flag back, don't guess)

- If a fixture page from the real text doesn't produce exactly what the plan's reader expects, report the page and the output — don't loosen the regex to pass.
- If `infra/modules/scheduler/variables.tf` names differ from the Terraform in Task 4, use the real names and list them as a deviation.

---

## Self-review (before printing the report)

1. `git diff --stat` / `git status --porcelain`: every change belongs to this run.
2. `git diff --cached --stat` is empty.
3. Review against Review Focus 1–7. Also check:
   - every manager write goes to all rows of the matched family;
   - matching never crosses AMCs;
   - a stale or non-factsheet file writes nothing;
   - one AMC raising doesn't stop the loop and logs one `FUND_MANAGER_ALERT` line;
   - MANUAL and `layout=None` AMCs are skipped by the job;
   - registry keys equal NAVAll `amc_name` values exactly;
   - no float maths;
   - fixtures are verbatim excerpts.
4. Fix what you find, re-run the affected tests, and list every finding.

---

## CODEX REPORT — template (print this, filled in, in ONE fenced code block at the very end)

```
CODEX REPORT — a04-fund-manager — Run <n>
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
| 1 | Run 1 | approved 2026-10-09 | Tasks built (Codex: 116 passed, 1 deliberate failure). Codex's 7 questions ruled — fixed by orchestrator test-first: Mrs/Mr honorific bug (plan bug), HDFC overseas-footnote co-managers, joint holdings shown once, future as-on dates ignored; plus HDFC handover note found in the real file; kept: no category gate without a printed category, exactly-0.05 accepted, JSON_API per onboarding, ABSL needs dates (Review Focus 5 → Kotak). Review (Opus): CHANGES NEEDED → all 8 fixed test-first: per-fund roles + card badge only when all agree, whole-word month names, dead link falls through, 60 MB cap, &amp;/\\u0026 decoding, directory <40 AMCs alert, duplicate name written once, 3-month window = 3 periods. WSL 129 passed; Postgres 0035 round trip clean; terraform fmt/validate passed (Codex). Committed per task. Pending: CLI on the real HDFC/Kotak files (Task 21 Step 5) with the scheme master loaded. |
| 2 | Run 2 | approved 2026-10-09 | Task 7 built (37 tests, tsc clean). Codex question ruled: the PDF prints every card open (`printMode`, orchestrator, test-first). Orchestrator also: valid phrasing content inside the card button, `fundManager` optional on old exports, "₹" on amounts like the other cards. Review (Sonnet): APPROVE (Lows: shared currency helper, name-keyed state, failed section via page banner, mobile scope gate — all consistent with siblings). 51 tests + tsc clean. |
| — | Run 3 | ready | Task 8 batch 1. |
