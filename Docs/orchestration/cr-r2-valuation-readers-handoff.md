# Handoff: Migration 0047 and factsheet P/E and P/B readers (T2.1, T2.2)

**Status:** OPEN (IN REVIEW when Codex reports, DONE after the Run 2 review gate)
**Run:** 2 of 7 | **Slug:** `cr-r2-valuation-readers` | **Commit prefix:** `cr-r2:` | **Tasks:** T2.1, then T2.2
**Order:** T2.1 -> T2.2 (T2.2 stores into T2.1's table). First task of Run 2.
**Rules:** `Docs/orchestration/cr-r2-common-rules.md` (read first). **Task text (authoritative):** `Docs/superpowers/plans/2026-10-31-change-requests-implementation-plan.md`, the task sections named above (Files, Interfaces, Step 1 test names, Step 3, Verify).

## Corrections to the plan text (verified in the repo on 31 Oct)
- **Migration:** Alembic head is `0046_job_runs.py`. T2.1 creates **`0047_scheme_reported_valuation.py` only**. The plan's Files line also names `0048`; **ignore that**: 0048 (drop of `scheme_rankings` and `ranking_weights`) is created in T2.5, after the models and `fund_ranking.py` are removed (see the Run 2 header). Run `alembic heads` first; if 0047 is taken, stop.
- Test file `tests/functional_postgres/test_migrations_0047_0048.py` becomes `test_migration_0047.py` (0047 only; the 0048 cases move to T2.5). `tests/test_migrations.py` is the SQLite check.
- **Wipe scripts:** they are `scripts/clean-staging-db.sh` (repo root, not `backend/scripts`) and `deploy/leapswitch/scripts/clean-db.sh`. They leave reference tables alone and print a `REFERENCE_QUERY` row-count list. Add `scheme_reported_valuation` to that list only if the lists enumerate comparable reference tables (check, say what you found); do not change what the scripts delete.
- `SchemeReportedValuation`: unique `(scheme_id, reference_period, metric)`; `value` `Numeric` with enough precision for P/B (check the `Numeric(12,2)` note in the readiness review; use a scale of at least 2).
## T2.2 specifics
- T2.2 modifies `backend/scripts/jobs/import_manual_fund_managers.py`, which Run 1 changed (flags `--this-month-only`, `--as-of`; refusal messages keep the codes `stale_month` / `not_a_factsheet`). **Keep every flag, message and the `--as-of` rule (checked against the file's own real-clock date, 45 days) exactly as they are**; only add the valuation read from the same PDFs.
- Layouts: `invesco`, `iti`, `kotak`, `uti`, `absl` only (the VM scan, gate G3). Edelweiss prints the index's figures only: no reader. Positional extraction for iti, kotak, uti uses the existing word-box path (`needs_boxes`).
- Snippet fixtures: small text excerpts of one real scheme page per house under `tests/fixtures/factsheets/`, never the PDF. A scheme page with no values returns nothing and never fails the job.
- Verify: `tests/services/analytics/test_fund_valuation_layouts.py`, `tests/test_migrations.py`, all `test_fund_manager_*` and `tests/scripts/test_import_manual_fund_managers.py`; migration up, down, up on Postgres is the manager's/VM step if Postgres is not available here (say so).
