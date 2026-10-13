# Handoff: sp2-engine (look-through engine ingestion, Sub-project 2 plan 1)
**Status:** IN_PROGRESS — Pass 0 (Task 0 done, Task 12 capture running); Run 1 not yet issued, 2026-10-13
**Parent plan:** `Docs/analytics/plans/2026-10-10-sub-project-2-lookthrough-ingestion-plan.md` (binding, as revised 2026-10-13: read its **Revision 2026-10-13** block first, then the tasks)
**Spec:** `Docs/analytics/2026-10-09-sub-project-2-lookthrough-engine-spec.md` · execution map: `Docs/analytics/artifacts/subproject2-execution/engine.html`
**Orchestrator:** Claude Code (pre-flight, capture pass, WSL verification, review, commits, staging guide) · **Worker:** Codex (one run per prompt, test-first, self-review, prints a report)
**Review baseline:** HEAD when the user pastes the prompt (`git log -1 --format=%h`, put it in the report)

---

## How this works (read first)

1. The user pastes a short prompt into Codex naming the run (**Run 1** … **Run 5**).
2. Codex reads this file and the named plan tasks, implements them in order, test-first, self-reviews, and ends by printing the **CODEX REPORT** (template at the bottom) in one fenced code block.
3. The user pastes the report to Claude Code, which re-runs the touched tests in WSL, reviews the diff, fixes small findings, and commits **one commit per plan task** (never pushed).
4. Run N+1 is issued only after Run N is reviewed and committed.

## Runs

| Run | Plan tasks | What | Gate reviewer |
|---|---|---|---|
| **Run 1** | 1, 2, 3, 4, 5 | Schema + migration, Parse (tuned on real fixtures), Normalize, Write (+ sum check), registry (51 rows) | Opus |
| **Run 2** | 6, 7, 8 | Orchestrator, Wayback (+ Canara `link_pattern`), isolation tests | Codex |
| **Run 3** | 11 | JSON_API Locate, four dedicated functions, index-sheet names, magic-byte check, registry completion, WhiteOak | Codex |
| **Run 4** | 13, 14, 15 | Manual intake, refresh-loop rework, retention + failed-file archive | Opus |
| **Run 5** | 9, 10 | Job script, Terraform text | Codex |

Tasks 0 and 12 are Claude-only (network). Task 16 (documents) is already done. Execution order in the plan: `0, 12, 1–8, 11, 13, 14, 15, 9, 10`.

## Where things stand — 2026-10-13

- Task 0 (AWS egress): done by the user's manager, result in `Docs/orchestration/sp2-egress/aws-result.txt`. Every source reachable from the jobs' address that is reachable from a laptop; one open item (Wayback CDX returned 503 once from AWS).
- Task 12 (capture pass): fixtures land in `backend/tests/fixtures/portfolio_disclosures/` with a `README.md`; the findings are in `Docs/analytics/investigations/2026-10-13-sub-project-2-capture-log.md`. **Where the capture log contradicts a registry entry or a header/section assumption in the plan, the capture log wins** — adapt minimally and record it under "Deviations".
- Latest migration is `0038_nav_history_wider_nav`. Read the real head with `alembic heads` immediately before writing the migration (F1); it should be `0039`.
- Staging is not touched in any run. Everything is deployed once, at the end.

## Pre-flight findings (Claude, checked against the code 2026-10-13)

- `enum_column`, `FundFamily`, `build_families`, the `db_session` fixture (SQLite, foreign keys enforced) and `tests/test_migrations.py` all exist as the plan assumes.
- **`openpyxl` and `xlrd` are not installed by `casparser`** (the plan's claim was wrong). The user has installed `openpyxl==3.1.5`, `xlrd==2.0.2`, `xlwt` into the Windows venv. Task 2 Step 1 still pins them in `requirements.txt` (and `xlwt` in `requirements-dev.txt`).
- `tests/test_migrations.py::test_alembic_upgrade_creates_all_tables` lists tables by name: add `disclosure_batches` and `scheme_holdings` (plan Task 1 Step 7a).
- Registry keys were corrected against AMFI's names: `"The Wealth Company Mutual Fund"` and `"Monarch Mutual Fund"` (not "Wealth Company" / "Monarch Networth Capital"). Do not revert them.

## Rulings from the capture pass (2026-10-13) — binding for Run 1

Read `Docs/analytics/investigations/2026-10-13-sub-project-2-capture-log.md` (cross-cutting section first, then the per-AMC sections for any AMC you touch). It overrides the plan's registry text and parser assumptions where they differ.

1. **Weight scale (new behaviour, Tasks 2 and 4).** `% to NAV` is a fraction in many files (0.0567 = 5.67%) and percent points in others, even within one AMC. Detect the scale **per sheet** before the sum check (total of the sheet's weights near 1.0 means multiply by 100; prefer the sheet's own Grand Total row when present). The 90–101% band applies after scaling and stays a named constant. Never loosen it.
2. **Stop at `GRAND TOTAL`.** Rows after it (annexures, second tables with ISIN-like rows) are never holdings. When a sheet has a Grand Total row, reconcile to it instead of summing section subtotals (negative derivative short legs sit outside it).
3. **Real-fixture test.** Add a parametrized test over every holdings sheet of every fixture in `backend/tests/fixtures/portfolio_disclosures/` (skip `Index`/non-holdings sheets by the plan's rule). It must assert: no crash, a non-empty holdings list, the scaled weights inside the band. Sheets that legitimately fall outside (overnight/liquid/ISIN-less funds, Choice Overnight, Monarch Overnight, Helios Overnight) go in a named allowlist **with a one-line reason each**; list every allowlisted sheet in the report. Parse bytes by magic, not extension (OOXML under `.xls`, a ZIP wrapping an xls for Aditya Birla).
4. **Header vs data offsets.** Several files have an unlabelled leading code column or ISIN before the name (HDFC). Locate columns from the header row's own cell positions and ISINs by pattern per row when the header is offset (UTI). Report each fixture that needed special handling under "Fixture findings".
5. **Registry rows (Task 5).** Use the capture log's corrected hosts, patterns and shapes. Two key names are fixed: `The Wealth Company Mutual Fund`, `Monarch Mutual Fund`. **Monarch is monthly** (host `www.monarchamc.in`), not fortnightly-only. **Bandhan is a `MANUAL` row** (its listing is encrypted; pending your manager's confirmation) — keep its fixture for parser tests. Rows whose Locate needs JSON/POST chains or a page-embedded payload (Task 11: Franklin, AlphaGrep manifest, Tata, Jio, quant, ICICI, Abakkus, WhiteOak, Navi, PGIM, Sundaram, Bajaj, UTI, SBI, LIC, Axis, Trust, Mirae, ABSL, Bank of India, Taurus) get their `kind` and a note quoting the capture log, nothing more in Run 1. Update the plan's registry tests to assert the corrected values (they are Task 5's own tests).
6. **Not in Run 1:** Index-sheet name translation, JSON_API Locate, WhiteOak row, manual intake, anything in Tasks 6–15.

## Constraints (non-negotiable)

**Git — read-only, whitelist.** Only `git status`, `git diff`, `git log`, `git show`, `git grep`, `git ls-files`. Never `commit`, `add`, `rm`, `mv`, `reset`, `checkout`, `stash`, `rebase`, `push`.

**Never touch:** `infra/`, existing files under `backend/alembic/` (Task 1 *creates* one new migration file, nothing else there), `backend/.env`, real CAS PDFs, `Docs/CAS Files/`, `Docs/` (the plan and artifacts are Claude's). No Postgres, no AWS, no staging — the migration is tested on SQLite via `tests/test_migrations.py`; Claude runs it on Postgres.

**Existing code is read only.** Import `FundFamily`/`build_families` from `amfi_factsheet_client`, `commit_off_loop` from `app.db.session`; never edit `amfi_factsheet_client.py`, `fund_manager_*`, `allocation.py` or `holdings.py`.

**Follow the plan literally.** If the code contradicts it in *mechanics* (a name, an import path, a fixture field), adapt minimally and record under "Deviations". If it would change *behaviour, a formula or an interface*, stop that part, record it under "Open questions", and continue with what doesn't depend on it.

**Test-first.** Write the test → run it → see it fail for the right reason → implement → green.

**Tests: only the named files, never a full suite.** Backend on Windows, from `backend\`: `.venv\Scripts\python.exe -m pytest <files> -q`. Before each run's final pass, `git grep` the tests for every symbol you changed and add the matching test files.

**Project rules** (`AGENTS.md`): `Decimal` for money and weights (no float maths); LF line endings, UTF-8; no new dependencies beyond the plan's pins; the engine's sync `Session`-inside-`async def` pattern is intentional (batch job only, never a request handler).

## Approaches considered and rejected (don't re-litigate)

- **Per-run second migration for `asset_type`** — rejected (Q8): the column and the 8-value enum are in Task 1's migration.
- **Dropping a batch whose weights don't sum to ~100%** — rejected (Q9): the batch is marked `FAILED` and its rows are kept; consumers read `WRITTEN` only. Band is 90–101%, a named constant.
- **Playwright / proxies / fingerprinting in production** — rejected (decision 2026-10-12).
- **Keeping the original files for every batch** — rejected (Q11): only `FAILED` batches' files are archived (Task 15).
- **A manual-AMC table** — rejected: `AWAITING_MANUAL_UPLOAD` batches are the queue (Task 13).
- **Matching on `sheet.sheet_name` only** — insufficient for code-named sheets (Bank of India `YB01`…): Task 11 adds the Index-sheet lookup. Do not build it in Run 1.

## Open questions (Codex: flag back, don't guess)

- If a fixture in `backend/tests/fixtures/portfolio_disclosures/` has a header spelling, section header, unit text or total/sub-total row the plan's parser patterns do not handle: list the file, the exact text, and what you changed — fix the pattern, never loosen the 90–101% band.
- If `FundFamily`/`build_families` differ from the plan's usage.
- If any existing test other than `test_migrations.py` breaks because two tables or an enum were added — list it; fix only fixture data.

---

## Self-review (before printing the report)

1. `git diff --stat` and `git status --porcelain`: every changed or new file belongs to this run's tasks. Undo anything else.
2. `git diff --cached --stat` is empty.
3. Review the diff as a hostile reviewer against the plan's **Review Focus** (including the 2026-10-13 additions): ambiguous sheet names resolve to no match; Crores and Lakhs multiply, an unknown unit raises; non-holdings sheets are skipped silently; `Sub Total` never becomes a holding; `"2.50%"` text parses; `% to AUM` header matches; a batch whose weights total outside 90–101% is `FAILED` with its rows kept; every parsed row has an `asset_type` (default `OTHER` before the first recognised section header).
4. Fix what you find, re-run the affected tests, list every finding in the report.

---

## CODEX REPORT — template (print this, filled in, in ONE fenced code block at the very end)

```
CODEX REPORT — sp2-engine — Run <1..5>
Run date/time: <…>    Environment: Windows    Python: <version>    Baseline HEAD: <hash>

1. TASK STATUS
   Task <n>: DONE | PARTIAL | BLOCKED — <one line>   (one line per task in this run)

2. FILES (grouped by plan task, so the orchestrator can commit per task)
   Task <n>: <files>
   New (untracked):     <from git status --porcelain>
   Staged (must be empty): <git diff --cached --stat>

3. TESTS (exact command + last 3 lines of output)
   RED:   <command> → <failed as expected because …>   (per task)
   GREEN: <command> → <N passed …>
   Extra files added via grep: <files>

4. DEVIATIONS FROM THE PLAN (mechanics only)
   - <task/step> — said <…>; code/fixture needed <…>; file:line — why

5. FIXTURE FINDINGS (Run 1)
   - <fixture file> — <what the parser had to handle that the plan did not say>

6. OPEN QUESTIONS / BLOCKERS
   - <question> — what I'd need decided

7. SELF-REVIEW FINDINGS
   - [High/Med/Low] file:line — <finding> — FIXED | NOT FIXED (why)

8. CONFIRMATIONS
   - No git write commands used: YES/NO
   - Full suites not run: YES/NO
   - Docs/, infra/, existing alembic files untouched: YES/NO
   - amfi_factsheet_client.py / fund_manager_*.py / allocation.py unchanged: YES/NO
```

---

## Round log (orchestrator appends after each report)

| Round | Run | Result | Notes |
|---|---|---|---|
| — | Pass 0 | in progress 2026-10-13 | Task 0 done (egress OK, Wayback 503 to re-check). Task 12 capture agents running; Run 1 prompt follows their results. |
