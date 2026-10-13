# Handoff: sp2-consumers (attributes 06, 02, 13, 10, 15 + PDF, Sub-project 2 plan 2)
**Status:** IN_PROGRESS — engine complete (Runs 1–5 committed, last `e08dd2c`); Run 6 ready, 2026-10-14
**Parent plan:** `Docs/analytics/plans/2026-10-12-attributes-02-06-10-13-15-lookthrough-consumers-plan.md` (binding; read its **Revision 2026-10-13** block first: shared rules, order, decisions)
**Spec:** `Docs/analytics/2026-10-12-attributes-02-06-10-13-15-lookthrough-consumers-spec.md` · execution map: `Docs/analytics/artifacts/subproject2-execution/` (a06, a02, a13, a10, a15, overview)
**Engine handoff (read for data facts):** `Docs/orchestration/sp2-engine-handoff.md`
**Orchestrator:** Claude Code · **Worker:** Codex (manual relay, one run per prompt)

## How this works
Same loop as the engine (see the engine handoff): the user pastes a prompt, Codex implements test-first and prints the CODEX REPORT (template at the bottom), the user pastes it back, Claude re-runs the gate in WSL, reviews, commits **one commit per plan task** (Task 2 in two parts), never pushes. No staging between runs.

## Runs
| Run | Plan | What | Gate reviewer |
|---|---|---|---|
| **6** | Task 2 backend | `lookthrough.py` (shared table), `stock_holdings` section, schemas, `_SectionSpec` | Codex |
| 7 | Task 2 frontend | `CoverageBanner`, `StockHoldingsSection`, both views | Codex |
| 8 | Task 3 | A02 cap allocation (new table + migration + half-yearly job text) | Codex |
| 9 | Task 5 | A13 asset allocation (after 02) | Codex |
| 10 | Task 4 | A10 overlap | Codex |
| 11 | Task 6 data side | A15 `stock_master`, client, daily job text | Opus |
| 12 | Task 6 valuation + frontend | A15 section | Codex |
| 13 | Task 7 | PDF export (6 sections) | Codex |

## Real-data facts the plan was written before (binding adaptations)
The engine is built and was run live end to end (14,371 real schemes, 41 AMCs, ~400k holdings rows, in an in-memory DB). What the consumers will read:
1. `scheme_holdings.pct_to_nav` is stored in **percentage points** (`Numeric(6,3)`), already scaled per sheet by Parse (a source fraction 0.0567 is stored as 5.67). `market_value` is rupees. `asset_type` is one of the 8 enum values; **`DERIVATIVE` rows can carry negative weights, and `OTHER` rows exist**. Per Q13 they are **excluded from every consumer sum** (stock table, cap split, overlap, P/E universe) and **counted in the coverage note** (their combined share is reported, not hidden). The shared `LookthroughTable` therefore excludes `DERIVATIVE` and `OTHER` from `rows` and carries `excluded_share` (derivative and other) for the notes; asset allocation (Task 5) reads `scheme_holdings` directly and applies its own rule.
2. **Only `WRITTEN` batches are read.** `FAILED` and `AWAITING_MANUAL_UPLOAD` batches never reach a client. Per fund the newest `WRITTEN` batch with `as_of_date <=` the NAV date; a held scheme with none is uncovered.
3. **Plan variants:** every scheme row (Direct/Regular, Growth/IDCW) has its own batch with identical rows (`write_disclosure_batch` writes to every row of the family). Held `scheme_id`s from `compute_holdings` map straight to batches by `scheme_id`.
4. **Coverage reasons** come from the engine registry: `AMC_DISCLOSURE_RESOLVERS` (`portfolio_disclosure_resolvers.py`): a scheme with no `WRITTEN` batch is "not available from this AMC" when its AMC has no registry row, or is a `MANUAL` AMC with no batch ever; else "not published yet". Age tags use the entry's `cadence` (`half_yearly` Taurus; others monthly): older than 60 days → `older_than_60_days`, except a cadence-consistent batch → `on_cycle`.
5. Some funds legitimately have no ISINs (overnight/liquid): `NULL`-ISIN rows stay one row per originating fund (never merged across funds).
6. `compute_holdings(db, household_member_ids)` returns `HoldingRow` objects with `scheme_id: str`, `current_value: str | None`, one row per folio (several per scheme). `_SectionSpec(name, compute, wrap_combined)` lists live in `recompute.py` (`_SECTIONS`); model the new section on `fund_manager` / `investment_withdrawal` (see `tests/services/analytics/test_recompute_investment_withdrawal.py` and `test_recompute_fund_manager_section.py` for the test shape).

## Constraints (non-negotiable)
**Git read-only whitelist** (`status`, `diff`, `log`, `show`, `grep`, `ls-files`). **Never touch** `infra/` (except Runs 8 and 11, which add scheduler job text for their own jobs; `terraform fmt`/`validate` only, never apply), real CAS PDFs, `Docs/` (the plans and artifacts are Claude's), existing migrations. New migrations only in Runs 8 and 11, with the number read from `alembic heads` at build time. **Existing code is read only** except the additive lines the plan names (`_SECTIONS`, `schemas.py`, frontend `types.ts`/`AnalyticsView.tsx`/`MobileAnalyticsView.tsx`, `test_migrations.py` table list). Do not edit `allocation.py`, `holdings.py`, `amfi_factsheet_client.py`, `fund_manager_*`, or any engine module (`portfolio_disclosure_*`); import from them.
**Follow the plan literally**; mechanics deviations go under "Deviations", behaviour/interface questions under "Open questions". **Test-first. Run only named files plus every importer `git grep` finds.** Backend on Windows from `backend\`: `.venv\Scripts\python.exe -m pytest <files> -q`; frontend from `frontend\`: `npx vitest run <files>` and `npx tsc -b`. `Decimal` for money and weights (no float maths on displayed values); LF endings, UTF-8; no new dependencies.

## Run 6 — Task 2 backend (shared table + `stock_holdings` section)
Implement the consumer plan's **Task 2, backend part** exactly (its first backend tests through "Run (backend)" and the backend half of the wiring): the `scheme_values` helper; `compute_lookthrough_table(db, household_member_ids)` on the sync `Session`; the per-run memo on `db.info`; coverage by value with the two reasons and `hide_headlines` below `HEADLINE_MIN_COVERAGE = Decimal("0.50")`; age tags; the `LOOKTHROUGH_MAX_ROWS = 100` cap with `truncated` and `total_stock_count`; the equity-only stock-section builder; schemas (`StockHoldingsSummary`, `AggregateStockHoldingsResponse`); the `_SectionSpec("stock_holdings", …)` in `_SECTIONS`. Tests live in `tests/services/analytics/test_lookthrough.py` plus the recompute test pattern. Use synthetic `scheme_holdings` rows (the spec's Reliance 8%/6%/5% → 6.55% example exactly), and one test that builds a small table from a few **real fixture sheets** parsed with the engine's `parse_workbook` and written with `write_disclosure_batch` (so the shared table is proven on real parsed data, including a derivative-bearing arbitrage sheet and an ISIN-less overnight sheet). **Not in Run 6:** any frontend, `CoverageBanner`, other attributes, migrations.

## Open questions (Codex: flag back, don't guess)
- Any difference between the plan's `HoldingRow` assumptions and the code.
- How `excluded_share` should be worded in the coverage payload if the spec's field list differs.

---

## Self-review (before printing the report)
1. `git diff --stat` / `git status --porcelain`: only this run's files; `git diff --cached --stat` empty.
2. Hostile review against the plan's Review Focus and the facts above: derivative/other rows excluded from `rows`; `FAILED`/`AWAITING` batches never read; newest `WRITTEN` batch ≤ NAV date; NULL-ISIN rows per fund; no float maths; the table built once per scope per run; the 100-row cap and `truncated`; coverage by value, not fund count; `hide_headlines` below 50%.
3. Fix what you find, re-run affected tests, list every finding.

## CODEX REPORT — template (one fenced code block, at the very end)
```
CODEX REPORT — sp2-consumers — Run <6..13>
Run date/time: <…>    Environment: Windows    Python: <version>    Baseline HEAD: <hash>

1. TASK STATUS
   Task <n>: DONE | PARTIAL | BLOCKED — <one line>
2. FILES (grouped by plan task)
   New (untracked): …   Staged (must be empty): …
3. TESTS (exact command + last 3 lines)
   RED: …   GREEN: …   Extra files via git grep: …
4. DEVIATIONS (mechanics only)
5. REAL-DATA FINDINGS (what the fixtures/real rows showed that the plan did not say)
6. OPEN QUESTIONS / BLOCKERS
7. SELF-REVIEW FINDINGS
   - [High/Med/Low] file:line — finding — FIXED | NOT FIXED (why)
8. CONFIRMATIONS
   - No git write commands: YES/NO   - Full suites not run: YES/NO
   - Engine modules / allocation.py / holdings.py unchanged: YES/NO
```

## Round log
| Round | Run | Result | Notes |
|---|---|---|---|
| — | Run 6 | ready 2026-10-14 | Task 2 backend. |
