# Handoff: rk3-recount (Batch A, task RK-3)
**Status:** READY TO RELAY (written 2026-11-18; relay after XR-2 is reported)
**Parent plan:** `Docs/superpowers/plans/2026-11-17-batch-a-numbers-plan.md` (Task RK-3). **Spec:** `Docs/orchestration/2026-11-17-batch-a2-rank-denominators-planning-workbook.html` (sections 3 to 5: sources, funnel, exclusion reasons). The workbook is the design; if it and the code disagree, stop and say so.
**Worker:** Codex, backend only. **Reviewer and committer:** Claude. **Adversarial review:** yes.
**Work in:** `D:\unifolio-a-numbers` (branch `batch/a-numbers`). Never in `D:\Unifolio code`.
Read first, in order: `Docs/orchestration/ui-common-rules-codex.md`, `Docs/orchestration/wave-common-rules.md` (wins where they differ), then this file.

## Question and what "correct" means
When the app says "rank 3 of N", is N right? This task builds a **second, independent count** of one category's pool straight from AMFI's `NAVAll.txt`, written **without calling the app's pool code**, plus a ledger saying why each scheme was set aside. Correct means: on a clean synthetic category the independent pool equals the app's pool, and on a category with deliberate gaps every difference has exactly one reason from the fixed list. **This task changes no number and no app code.**

## Read-in-code facts (re-check each; report drift)
- `backend/app/services/analytics/scheme_universe.py`: the AMFI row parsing (`UniverseRow`, the parser that reads `NAVAll.txt` text: read it to know the columns, **do not import it into `recount_category_pool.py`**; the test may import it to build sample rows), `canonical_category` (line ~165), `is_index_fund` (~178), `get_category_peers` (~334, async) and its class's `representative_of`.
- `backend/app/services/analytics/category_ranking.py`: `load_category_pool` (async, ~314).
- Growth-only rule (decided 17 Nov): IDCW and dividend options are not in the pool.

## Task
Create `backend/scripts/recount_category_pool.py` and `backend/tests/services/analytics/test_recount_pool.py`.

**Interfaces** (names fixed):
- `AmfiRow` (frozen dataclass: `scheme_code: str`, `name: str`, `category: str`, `nav_date: date | None`, plus the fields your parser needs) parsed by your own `parse_navall(text: str) -> list[AmfiRow]` that reads the AMFI file format itself (category headings, fund-house headings, semicolon rows). Reuse nothing from `app.*` in the script.
- `LedgerEntry(scheme_code: str, name: str, reason: str)`; `Step(name: str, remaining: int, set_aside: list[LedgerEntry])`; `RecountResult(steps: list[Step], final_pool: list[str])`.
- `recount_pool(rows: list[AmfiRow], category: str, plan: str, today: date, history_days: dict[str, int] | None = None) -> RecountResult` where `plan` is `"direct"` or `"regular"` and `history_days` maps scheme code to days of price history (None = assume enough). Steps in this order, each with its own count and set-aside list: category match (the canonical category equals the wanted one), `not_live` (no NAV in the last 30 days at `today`), `idcw` (name says IDCW, dividend, payout, reinvestment or bonus option), `other_plan_type`, `second_option_of_fund` (two Growth rows of one base name: keep one, list the other), `index_or_etf` (the app's index and ETF word rule, reimplemented from the rule written in `scheme_universe.py`), `no_history_for_period` (fewer than 3 years of days when `history_days` says so), `closed_or_merged` (name carries a merged or closed marker). **The `reason` strings are exactly:** `not_live`, `idcw`, `other_plan_type`, `second_option_of_fund`, `index_or_etf`, `no_history_for_period`, `closed_or_merged`. A scheme appears in at most one set-aside list (the first step that sets it aside). Also add a **flag list** (not a reason): `mixed_end_dates` (live schemes whose newest NAV date differs by more than 4 days from the pool's newest) and `mis_named` (a scheme whose name contains a plan or option word that contradicts its row's section, listed for a human to check).
- CLI: `python scripts/recount_category_pool.py --category "<text>" --plan direct|regular --navall <file> [--history <csv>] --out <file>`; writes a plain-text ledger: the step table (name, remaining), then every set-aside entry as `reason | scheme_code | name`, then the flags, then the final pool's scheme codes. Prints **counts and public scheme names only** (no household, account, folio or id).

## Tests first (names fixed; run them, see them fail because the module is missing, then implement)
Use a **synthetic** AMFI text built in the test (about 25 invented rows across two categories with deliberate gaps). `test_ledger_counts_each_step`; `test_idcw_series_set_aside_and_never_in_pool`; `test_peer_without_history_is_listed`; `test_duplicate_base_name_is_listed`; `test_mixed_end_dates_listed`; `test_mis_named_scheme_is_flagged`; `test_each_scheme_is_set_aside_at_most_once`; `test_reasons_come_from_the_fixed_list_only`; `test_cli_writes_the_ledger_and_prints_no_ids`; `test_ledger_equals_app_pool_for_clean_synthetic_category` (build a clean category, load the same rows into an in-memory SQLite `Scheme` table the way the existing tests in `tests/services/analytics/` do, run `get_category_peers` through `asyncio.run`, and compare scheme codes with `final_pool`; if the sandbox cannot run it, say BLOCKED for that one test, the orchestrator will run it).

## Run these only
```
cd backend
"D:\Unifolio code\backend\.venv-win\Scripts\python.exe" -m pytest tests/services/analytics/test_recount_pool.py -v
```
(From the `backend` folder of the worktree. If the sandbox cannot run a test, reply BLOCKED for it with the exact error; do not change config. No full suite.)

## Files you may touch
Only the two new files. Do not edit any existing file.
## Do not touch
`app/**`, real data, existing tests, `frontend/**`, migrations.

## Constraints
No network and no download (the script reads a file you give it). No real data; invented scheme names only (never copy real scheme lists into the repo). `Decimal` only if any money appears (none expected). Git is read-only for you. No deletion flags or recursive deletes.

## Open questions (flag, do not guess)
- Any step in the workbook's funnel the app does not have, or the reverse (list it).
- Does the app's index and ETF rule have a case the workbook does not name?
- Anything in the AMFI file format the parser cannot read (list a sample line).

## Report format
One fenced block `CODEX REPORT: rk3-recount`: status; baseline HEAD; drift; commands with counts; which tests were RED first and why; the printed step table for the synthetic category; tests not run and why; `git status --short`; Deviations; Open questions.

## Paste-ready prompt
```
Backend worker for Unifolio (Codex). Read, in order:
1. Docs/orchestration/ui-common-rules-codex.md
2. Docs/orchestration/wave-common-rules.md (wins where they differ)
3. Docs/orchestration/2026-11-18-rk3-recount-handoff.md (your task: RK-3)
Work only in D:\unifolio-a-numbers on branch batch/a-numbers. Tests first. Git is read-only. No deletion flags or recursive deletes. Change no app code: add the two files only.
Run tests with: cd backend; "D:\Unifolio code\backend\.venv-win\Scripts\python.exe" -m pytest <files>   (if the sandbox cannot run it, reply BLOCKED with the exact error, do not change any config)
Reply with the CODEX REPORT block from the handoff, nothing else.
```
