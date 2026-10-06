# CAS Import Fixes — Master Plan (index)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. If any task is delegated to Codex, the `model-orchestration` skill governs it (handoff doc + adversarial review gate).

**Goal:** Make the dashboard value after any CAS upload equal the CAS itself, for every lookback and upload order, then remove the import review screen so the flow is upload → "N members detected" popup → dashboard.

**Architecture:** Seven phase plans, each a working, testable increment ending at a test checkpoint. Phase 1 builds the yardstick (a read-only reconciliation of our units against the CAS's own closing units, shown on a staging-only Import health page). Phases 2–6 fix the data path in dependency order: opening balances, then row identity (twin rows, row types, folio keys, import links), then fund identity (the AMFI master), then calculations and history. Phase 7 removes the review screen only after the yardstick is all ✓ on every synthetic file and upload order and on real KFintech files, then backfills.

**Tech Stack:** FastAPI + SQLAlchemy 2 + Alembic (SQLite dev/tests, Postgres staging with RANGE-partitioned `transactions`), casparser 1.3.0, React 19 + TypeScript + Tailwind 3.4 + Vitest.

**Spec:**
- `Docs/investigations/2026-10-05-cas-import-fix-plan-final.html` (artifact https://claude.ai/artifact/Jwgw3go9zSz7MnRZkJtsuR), v15. Every "Decided" line is binding.
- Decisions: `decisions.md` entries "2026-10-05/06 — CAS import fix plan" and "2026-10-06 — … untested areas become phase checkpoints".
- Deferred (do NOT build): `Docs/investigations/2026-10-06-cas-import-deferred-items.md` (#1 approximate date, #19, #20, #24, #25).
- Test fixtures: `Docs/CAS Files/synthetic/` (README, `truth.json`, `harness/`). Password `MF@123`.

## Phase plans

| Phase | File | Issues | Migration | Checkpoint before the next phase |
|---|---|---|---|---|
| 1 | `2026-10-06-cas-import-fixes-p1-safety-net.md` | #6, #13, #14 (label + population), #15, #16, #22 | none | Synthetic suite baseline recorded on the Import health page |
| 2 | `2026-10-06-cas-import-fixes-p2-opening-balance-isin.md` | #1 (hybrid cost, no approximate date), #21 | 0025 (part: `origin`, `cost_source`) | Every opening-balance fund matches the CAS on every lookback |
| 3 | `2026-10-06-cas-import-fixes-p3-twin-rows-row-types.md` | #2, #3 | 0026 | Postgres: 0026 up/down on partitioned `transactions` |
| 4 | `2026-10-06-cas-import-fixes-p4-folio-key-links.md` | #4, #5 | 0027 | Postgres: 0027 up/down + backfill; delete on overlapping statements |
| 5 | `2026-10-06-cas-import-fixes-p5-fund-identity.md` | #7, #8 (option D) | 0028 | Postgres: 0028; all daily jobs run against the changed `schemes` |
| 6 | `2026-10-06-cas-import-fixes-p6-calculations-history-sessions.md` | #9, #10, #11, #12, #14 (realised/today), #17, #18, #23 | 0029 | Postgres: 0029; frontend checklist C1–C14 (user screenshots) |
| 7 | `2026-10-06-cas-import-fixes-p7-review-screen-backfill.md` | review-screen removal, PRD-01 update, backfill | none | **Gate:** Import health all ✓ on every synthetic file/order **and** 1–2 real KFintech CAS; then stage |

**Migration numbering (supersedes the artifact's 0025–0028):** the artifact grouped all schema changes into four migrations. Phase 2 needs its two columns before phase 3's migration exists, so this plan uses one migration per phase: **0025** (phase 2), **0026** (phase 3), **0027** (phase 4), **0028** (phase 5), **0029** (phase 6). `0024` stays reserved for the `users.primary_goal` drop (`DEFERRED_FEATURES.md`); if it hasn't shipped when phase 2 starts, phase 2's migration still revises `0023` and the `primary_goal` drop is renumbered after this plan's last migration. Task 1 of phase 2 records whichever choice is made in `DEFERRED_FEATURES.md`.

## Global Constraints (apply to every phase and task)

**Process**
- **Never commit.** The user commits manually. Tasks end at "tests green, stop"; there are no `git commit` steps.
- **Run only affected tests**, never full suites. Each task lists its test files. Before a task's final run, grep `backend/tests` / `frontend/src` for every symbol, route path, enum value and error code the task changed or removed, and add each matching file to the run.
- Backend tests from `backend/`: in WSL `python3 -m pytest <files> -q`; on Windows (Codex) `.venv\Scripts\python.exe -m pytest <files> -q` (`backend/.venv` is a Windows venv and doesn't run in WSL).
- Frontend tests: `@testing-library/user-event` is **not** installed — use `fireEvent` from `@testing-library/react`, like the existing tests.
- Frontend tests from `frontend/`: `npx vitest run <files>`; typecheck once per frontend task: `npx tsc -b`.
- `backend/tests/functional_postgres` needs `TEST_DATABASE_URL` (start Postgres with `docker compose up postgres`). Without it those tests skip, and the report must say "skipped", never "passed". **Phases 3–6 cannot be reported done with Postgres tests skipped.**
- Synthetic end-to-end harness (one scenario per process, from `backend/`):
  `SEQ=<file>[,<file>...] OUT=<out.json> python3 -m pytest "../Docs/CAS Files/synthetic/harness/test_deep.py" -q --rootdir "../Docs/CAS Files/synthetic/harness"`. It needs network (mfapi.in) until phase 5 lands.
- An `async def` route must never call blocking `db.commit()` (bb5225f); routes that commit are plain `def` or use `commit_off_loop`.

**Money**
- `Decimal`, never `float`, for every amount/units/NAV in the backend. Quantize with `app/core/decimal_utils.py` (`quantize_amount` 2dp, `quantize_units` 3dp, `quantize_nav` 4dp).

**Data invariants**
- The CAS is the truth: after any sequence of uploads, for every folio, `sum(units in) − sum(units out)` from our rows must equal the closing units of the most recent statement covering that folio. Phase 1's reconciliation measures this; every later phase must not make any synthetic file's result worse.
- Raw PAN never enters `raw_parser_output`, logs, responses or the new `imports.preview_state` unencrypted (phase 6 encrypts the whole blob).
- `transactions` is RANGE-partitioned by `date` on Postgres, its `type` column is VARCHAR + CHECK (`transactions_type_check`), not a native enum. Migrations follow the 0002/0010 patterns (dialect branches; SQLite batch mode with `recreate="always"`).

**Copy**
- Curly apostrophe `’` in all new UI copy. Copy is taken verbatim from the artifact's mock-ups where one exists.

**Out of scope (deferred, documented):** the approximate purchase date and `est_acquired_on` (#1 part), parse off the event loop (#19), capital gains (#20), analytics data fixes (#24), minors as members (#25). Do not build them; don't add their columns.

## Review Focus (cross-phase; each phase file repeats the ones it owns)

1. **Uploading statements in different orders** (FY then 20-year, 20-year then FY, 10-year then 3-year then 20-year). Units must equal the latest CAS closing every time; no opening balance may double-count real rows. Owned by phase 2 (`test_opening_rule_*`) and the synthetic sequences in each checkpoint.
2. **The same statement uploaded twice, or in two tabs.** Adds nothing; the second confirm says "already imported". Owned by phases 3 (dedupe with balance), 4 (links), 1/6 (#22 message).
3. **Deleting one of two overlapping imports.** Rows the other import contains stay; the opening rule is re-applied. Owned by phase 4.
4. **A fund that exists only on the CAS (closed/merged, no AMFI code).** Imports as a closed fund, never blocks, never borrows another AMC's NAV. Owned by phase 5.
5. **A deploy or the 9 PM stop between upload and Continue.** The members popup's Continue still works. Owned by phase 6 (#23).

## Files touched (whole plan)

Backend: `services/import_/{parser,confirm_people,service,schemas,deletion,coverage_gap,enrich}.py`, new `services/import_/{reconciliation,opening_balance,folio_keys}.py`, new `services/import_/preview_store.py`; `services/dashboard/{holdings,xirr,cash_flow,sip,snapshots,distributor_comparison,schemas}.py`; `services/analytics/{scheme_universe,amfi_ter_client,benchmark}.py`; new `api/dev_health.py`; `api/imports.py`, `api/dashboard.py`, `main.py`; models `transaction.py`, `folio.py`, `reference.py`, `imports.py`, `snapshot.py`, new `transaction_import.py`, `enums.py`; migrations `0025`–`0029`; new job `scripts/jobs/refresh_scheme_master_daily.py`; `infra/modules/scheduler/main.tf`.

Frontend: `features/dashboard/*` (types, HoldingsTable, FundDetailModal, DashboardView, new PlanBadge), mobile dashboard/holdings, `features/import/*` (useImportFlow, UploadForm, ImportError, ImportFlow, useImportOrchestration), mobile import views, new `features/dev/ImportHealth.tsx`, new `features/history/HistoryView.tsx` + mobile view, `NavigationShell.tsx`, `MainDashboardFlow.tsx`.

Docs (phase 7 and per phase): PRD-01 (FR-5/FR-10), `Docs/Database-Schema-Unifolio.md`, `database.md`, `backend.md`, `decisions.md`, the 2026-08-18 SIP spec, `log.md`, `session.md`.
