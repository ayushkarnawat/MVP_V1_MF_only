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

## Addendum, 19 Nov 2026: decisions after Codex's first stop (read this before you start; it overrides the text above where they differ)
Codex stopped, correctly, because the workbook and the code disagree in four places (all four verified against the code by the orchestrator). **Proceed. The recount follows the workbook, not the app.** A difference between the recount and the app is the point of this task: record it as a flag or a ledger reason; never copy the app's behaviour into the script, and never change app code. These are not blockers any more.

1. **Unknown plan.** The app accepts a row whose plan cannot be told (`scheme_universe.py:316`, `in (plan_type, None)`); the workbook says peers must match the requested plan. Recount: such a row is set aside with reason `other_plan_type` **and** listed under a new flag `plan_unknown` (name, code) so a person can look at it.
2. **Unparseable NAV date.** The app keeps a row with no parseable NAV date (`scheme_universe.py:248`). Recount: it cannot be shown to be live within 30 days, so it is set aside as `not_live` **and** listed under a new flag `unparseable_nav_date`.
3. **IDCW-only fund.** The app can pick an IDCW-only series as a fund's representative (`scheme_universe.py:304` to `320`). Recount: every IDCW and dividend series is set aside with reason `idcw`. A fund whose series are **all** IDCW (so it has no Growth series) is also listed under a new flag `idcw_only_fund` (T10-6 and FX-10d).
4. **Periods.** The live ranking builds a separate pool per period (1Y, 3Y, 5Y; `performance_ranking.py:58` to `65`), and the category average applies a 3Y floor. So **the history step is per period**: add `period_years: int = 3` to `recount_pool` (a scheme needs at least `period_years * 365` days of history when `history_days` is given; the step is still named `no_history_for_period`), add `recount_all_periods(...) -> dict[int, RecountResult]` for 1, 3 and 5, and give the CLI `--period 1|3|5|all` (default `all`, one ledger section per period). The app also filters out funds that are inactive in the database; the recount reads only AMFI's file and **cannot see that**: state this in the ledger's header as a known gap (RK-4 compares with the app and names any fund that differs for this reason).
5. **"Exchange traded" categories.** The app treats a category containing "exchange traded" as passive even when neither name nor category says "index" or "ETF" (`scheme_universe.py:192`). Reimplement the `index_or_etf` step with that case included (the rule as the app has it), and name that sub-case in the ledger line.
6. **Closed or merged.** AMFI's `NAVAll.txt` carries no closure date, so `closed_or_merged` can only use a marker in the scheme name, as the handoff says. The closure date in AMFI's scheme-data file (S2) is a later cross-check (RK-5), not this task.
7. **Parser.** The app documents six-field and eight-field AMFI rows. Your `parse_navall` must read both. Add tests with one synthetic row of each width and one malformed line that is skipped, never a crash.

**New tests to add to the ten named in the handoff** (same rules: red first, then implement): `test_unknown_plan_is_set_aside_and_flagged`; `test_unparseable_nav_date_is_not_live_and_flagged`; `test_idcw_only_fund_is_flagged`; `test_each_period_has_its_own_history_step` (1Y, 3Y, 5Y on one synthetic category with schemes of 400, 1200 and 2000 days of history); `test_exchange_traded_category_counts_as_passive`; `test_parser_reads_six_and_eight_field_rows_and_skips_a_malformed_line`; `test_ledger_header_states_the_database_inactive_gap`. The `test_ledger_equals_app_pool_for_clean_synthetic_category` test stays, on a category with no plan-unknown rows, no unparseable dates and no IDCW-only funds (those are the cases where recount and app are **expected** to differ).

Report the same way, and add under "Deviations" any further place where the workbook and the code differ: list it, do not stop.
