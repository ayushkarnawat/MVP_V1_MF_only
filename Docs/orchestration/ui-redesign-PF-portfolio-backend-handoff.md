# Handoff: ui-redesign PF-B (Portfolio backend: instrument allocation, summary, daily value series)
**Status:** READY (written 26 Oct 2026, not yet run)
**Parent plan:** `Docs/superpowers/plans/2026-10-23-portfolio-home-page-implementation.md` **Tasks 1 to 3 only** (the backend; Tasks 4 to 8 are front end and belong to Gemini later). Design: `Docs/orchestration/2026-10-23-portfolio-home-page-design.md` sections 2.1 to 2.3. This handoff overrides the plan where they differ (decisions C94 to C96 below). Execution plan: `2026-10-26-execution-plan-v2.md` (session C2).
**Branch:** `feat/portfolio-backend`, created from `feat/home-snapshot` (HEAD `3f33271c`: the whole Home API, 270 Home tests green). **Worker:** Claude Code (Sonnet), run by the owner in a terminal while the Codex limit is exhausted. **Orchestrator:** Claude Code in the main session, who verifies and makes every commit. One working tree (`D:\Unifolio code`); do not switch branches.
**Worker rules specific to this repo (read first):** you are the *implementer* for this run. `CLAUDE.md` tells sessions to invoke the task-observer and model-orchestration skills and to delegate work to Codex: **ignore both here** (do not invoke them, do not delegate, do not spawn subagents). Read `AGENTS.md` for setup and non-negotiables; follow the superpowers TDD and verification-before-completion skills.

Everything is `Decimal`, never `float`. Every new route is a **GET that never writes and never recomputes Analytics** (no `compute_*` of `app.services.analytics`, no snapshot rebuild, no `dispatch`, no INSERT/UPDATE/DELETE statement; a test asserts it). Portfolio and Home must **never disagree**: the Portfolio numbers are built from the same modules (`app/services/home/context.py`, `wealth.py`, `movers.py`) so one change fixes both.

## What exists (verified by the orchestrator; read these first)
- `app/services/home/context.py`: `ScopeContext`, `resolve_scope(db, user, member_id)`, `HomeInputs`, `load_home_inputs(db, ctx, today, *, nav_start, view)` (holdings via `compute_holdings(..., allow_stale_today=True)`, units timeline, bulk NAVs, `Movers`, `nav_as_of`, `partial`, `missing_funds`); `app/services/home/wealth.py`: `build_wealth_series(db, ctx, inputs, *, today, period, custom, benchmark)` (the daily series with the headline-equals-last-point rule); `app/services/home/schemas.py`: `Envelope`, `MemberOut`, `MissingFund`, `PointOut`, `PlainDecimal`; `app/api/home.py`: the route pattern, `get_now_ist` (clock dependency, tests override it), `_total_value`.
- **Portfolio value convention (register C88):** the sum over valued rows of `quantize_amount(Decimal(row.current_value))`. Use exactly this for every total below.
- `app/services/dashboard/xirr.py::calculate_dashboard_xirr(db, member_ids, holdings)` (strings and disclaimers: reuse as is, never recompute), `holdings.py::compute_realized_summary(db, member_ids)` (`.total`), `schemas.py::XirrDisclaimerOut` (check the real name with grep) and `MemberStatus`.
- The Home test household: `tests/api/home_fixture.py` (`build_home_fixture(variant=..., now=..., fund_count=...)`, `seed_home_household`, `uid`, `FIXED_NOW` = Fri 2026-10-23 18:30 IST; variants `base`, `empty`, `partial`, `one_nav`, `redemption`, `all_down` and others). **Reuse it for the Portfolio tests**; do not build a second household.
- Local synthetic household for the gate: `/home/ayush/s25/s25.db` (read-only source; two members, nine schemes, NAV to 2026-10-23). The Home gate `scripts/home_synthetic_gate.py` has `_mutate`, `_held_scheme_hex` and a scenario runner you may **import** (do not edit that file).

## Decisions fixed for this run (register C94 to C96; do not re-litigate)
1. **C94, today's gain:** the plan's `sum(HoldingRow.today_gain)` is wrong (V1: it counts a purchase made on the NAV date as gain and is 0 for statement-priced funds) and would disagree with Home. `today_gain` and `today_pct` are the Home movers' `net_change` and `net_pct` (price-only, units at the previous close), taken from `HomeInputs.movers`.
2. **C95, files:** new router `app/api/portfolio.py` registered in `app/main.py` (one `include_router` line; the plan's edit of `api/dashboard.py` is not done), new models file `app/services/dashboard/portfolio_schemas.py` (the plan's edit of `schemas.py` is not done), new service modules `app/services/dashboard/{instrument_allocation,portfolio_summary,value_series}.py` as the plan says. `aggregate.py`, `dashboard.py`, `schemas.py`, `allocation.py` stay untouched.
3. **C96, shapes:** every response is an **object** (the plan returned a bare list on the member allocation route) carrying the Home envelope first (`scope`, `member_id`, `nav_as_of`, `partial`, `missing_funds`, `computed_at`), then `members: list[MemberOut] | None` (the household's members in created order in aggregate scope, `null` in member scope; the same `MemberOut` as Home), then the payload. Money is a plain decimal string quantized to `0.01` (`PlainDecimal`), percentages 4 places, XIRR fields pass through unchanged as the strings the Dashboard produces. Totals use the valued rows only, so `unrealized_gain == total_value - total_invested` to the paisa; a fund without a NAV is listed in `missing_funds` and sets `partial`.
4. Clock and period end follow Home: `today` is the IST date of `get_now_ist()` (same dependency, import it from `app.api.home`); the series ends at `nav_as_of`.

## Task 1: response models `app/services/dashboard/portfolio_schemas.py`
Pydantic v2, `extra="forbid"`, reusing `Envelope`, `MemberOut`, `PointOut`, `PlainDecimal` from `app.services.home.schemas`:
```python
class InstrumentBucketOut(BaseModel):
    label: str; status: Literal["live", "coming_soon"]
    current_value: PlainDecimal | None; percentage: PlainDecimal | None
    invested: PlainDecimal | None; gain_loss: PlainDecimal | None; xirr: str | None
class PortfolioAllocationResponse(Envelope):
    members: list[MemberOut] | None; buckets: list[InstrumentBucketOut]
class PortfolioSummaryResponse(Envelope):
    members: list[MemberOut] | None
    total_value: PlainDecimal; total_invested: PlainDecimal
    unrealized_gain: PlainDecimal; unrealized_pct: PlainDecimal | None      # unrealized_gain / total_invested * 100, 4 places, None when invested is 0
    realized_gain: PlainDecimal
    today_gain: PlainDecimal; today_pct: PlainDecimal | None; previous_nav_date: date | None   # from the Home movers (C94)
    lifetime_xirr: str | None; current_holdings_xirr: str | None
    lifetime_xirr_disclaimer: <the existing disclaimer schema> | None; current_holdings_xirr_disclaimer: <same> | None
class PortfolioValueSeriesResponse(Envelope):
    members: list[MemberOut] | None; days: int; start: date; end: date; empty: bool; points: list[PointOut]
```

## Task 2: `instrument_allocation.py`
`compute_instrument_allocation(holdings, xirr_summary) -> list[InstrumentBucketOut]`, pure. Eight buckets in this fixed order: `Mutual Funds` (live), then coming-soon `Direct Stocks`, `US Stocks`, `FDs & Bonds`, `Debt`, `Gold`, `Real Estate`, `Others` (status `coming_soon`, every number `None`). The Mutual Funds bucket: `current_value` = the C88 total over valued rows; `invested` = the sum of `quantize_amount(Decimal(amount_invested))` over the **same valued rows**; `gain_loss` = their difference; `percentage` = `100.00` when the value is above zero else `0.00`; `xirr` = `xirr_summary.lifetime_xirr` passed straight through. No holdings gives the Mutual Funds bucket at `0.00` everywhere (not `None`).

## Task 3: `portfolio_summary.py`
`compute_portfolio_summary(holdings, xirr_summary, realized_summary, movers) -> <fields of PortfolioSummaryResponse without envelope/members>`, pure. Totals as in C96; `realized_gain` = `quantize_amount(Decimal(realized_summary.total))`; XIRR values and disclaimers passed straight through (`to_schema()` as `aggregate.py` does for the Dashboard: read `get_aggregate_holdings` first); `today_gain`, `today_pct`, `previous_nav_date` from `movers` (C94). Empty household: zeros, `unrealized_pct` `None`, `today_pct` `None`.

## Task 4: `value_series.py`
`build_portfolio_value_series(db, ctx, inputs, *, today, days) -> <series fields>`: reuse `build_wealth_series(db, ctx, inputs, today=today, period="custom", custom=(start, end), benchmark=None)` with `end = inputs.nav_as_of or today` and `start = end - (days - 1)`, so the sparkline's points, its last-point-equals-headline rule and the partial handling are Home's own; `empty` and `points` come from it. `days` is validated 2 to 366 (422 otherwise). Load the inputs with `nav_start = today - (days + 15)` and `view="fund"` (no sector weights needed). A household with no holdings gives `empty: true`, `points: []`. Do not read `Transaction.balance_units` anywhere (register C57: it is nullable and unreliable).

## Task 5: routes `app/api/portfolio.py` and registration
Six routes, `response_model` on each, `tags=["portfolio"]`, thin handlers (resolve scope with `resolve_scope`, load inputs once with `load_home_inputs`, call the pure functions, map to the models); auth `Depends(get_active_user)`, `get_db`, `get_now_ist`; a foreign member id is 404 through `resolve_scope` as in Home:
```
GET /household/aggregate/portfolio-allocation      GET /household-members/{member_id}/portfolio-allocation
GET /household/aggregate/portfolio-summary         GET /household-members/{member_id}/portfolio-summary
GET /household/aggregate/portfolio-value-series?days=30    GET /household-members/{member_id}/portfolio-value-series?days=30
```
Summary and allocation routes call `calculate_dashboard_xirr(db, ctx.member_ids, inputs.holdings)` and `compute_realized_summary(db, ctx.member_ids)` (the summary only). `app/main.py` gets one `include_router` line, nothing else.

## Task 6: tests (red first; list which were RED) and golden fixtures
`tests/services/dashboard/test_instrument_allocation.py`, `test_portfolio_summary.py`, `test_value_series.py`, `tests/api/test_portfolio_routes.py`, all using `build_home_fixture`:
1. Pure functions: the plan's cases with the C96 values (`"100000.00"`, not `"100000"`), empty holdings, a fund without a NAV (excluded from every total, named in `missing_funds` at route level), per-row rounding (`1.005` + `1.005` gives `2.02`), `unrealized_gain == total_value - total_invested` as a property over seeded random inputs (`random.Random(seed)`, a few hundred cases).
2. **Parity with Home (the point of reusing the modules):** for aggregate and for each member, on the base household and on `partial`, `redemption`, `all_down`: `portfolio-summary.total_value == home summary.total_value == portfolio-allocation Mutual Funds current_value == portfolio-value-series last point (only while no held fund has a price after the as-of day and no fund's units changed after it: Home's N3 and L3 rules, register C109/C114; then the point keeps its own as-of-day value) == the sum of quantize_amount(current_value) over the valued rows of GET /household/aggregate/holdings`; `portfolio-summary.today_gain == home summary.change_amount` and `today_pct == home movers net_pct`.
3. Auth 401, foreign member 404 (all six routes), `days` of 1 and 367 give 422, `days=2` and `days=366` work.
4. No writes and no recompute on all six routes (SELECT-only listener; analytics `compute_*`, snapshot rebuild and `dispatch` patched to raise); statement counts do not grow with the number of funds (3 versus 9, measured after the shared holdings cache is warm, as in the HB5b test).
5. Empty member and empty household: 200 with zero values, 8 buckets, `empty: true`, `members` listing every member in aggregate scope with `has_data` false for the empty one (PRD-03 FR-10).
6. OpenAPI: every money and percentage field is a string (walk the schema as the Home test does) and `members` is `null` in member scope.
7. **Golden fixtures**, generated by `backend/scripts/write_portfolio_fixtures.py` into `backend/tests/fixtures/portfolio/` and compared **read-only** in a test (do not write and then compare: that can never fail; see the HB5b record): `allocation_family.json`, `allocation_member.json`, `allocation_empty.json`, `summary_family.json`, `summary_member.json`, `summary_empty.json`, `summary_partial.json`, `series_family_30d.json`, `series_member_30d.json`, `series_empty.json`. A `test_portfolio_fixture_semantics` test opens each file and asserts the facts its name promises (for example `summary_partial.json` has `partial` true and the fund named; `allocation_family.json` lists 2 members and 8 buckets; `series_family_30d.json` has 31 or fewer points ending at `nav_as_of` with the last value equal to the summary total).

## Task 7: synthetic gate, read-only on the real file
`backend/scripts/portfolio_synthetic_gate.py <db_path>`: copies the SQLite file per scenario, overrides auth and the clock like the Home gate, and runs the parity checks of Task 6 item 2 plus `unrealized == value - invested` for the scenarios `base`, `member_rohan`, `member_priya`, `weekend`, `partial_data`, `one_fund_only`, `all_funds_down`, `no_holdings` (reuse `_mutate` and `_held_scheme_hex` from `scripts.home_synthetic_gate`). It runs every scenario even after a failure, prints `PASS`/`FAIL` with both numbers and a final table, exits non-zero on any failure, and records the sha256 of the source before and after. Run it on `/home/ayush/s25/s25.db` and paste the full output. A failure on real data is reported with both numbers under Open questions; do not change code to hide it.

## Test commands (run only these; no full suite)
From PowerShell, with the WSL venv (Python 3.14): `wsl.exe -d Ubuntu --cd "D:\Unifolio code\backend" -- .venv/bin/python -m pytest <files> -q -p no:cacheprovider --disable-warnings`. Files: the new tests of Task 6, then `tests/api/test_home_routes.py tests/services/home` (baseline 270 passed), the neighbours `tests/services/dashboard/test_holdings.py`, `tests/services/analytics/test_recompute.py`, `tests/scripts/test_measure_benchmark_matrix.py` (baseline 88 passed together) and the five `tests/api/test_dashboard_*` files found by `git grep -l "household/aggregate" -- tests/api` (baseline 41 passed), and the gate. `tests/services/analytics/test_portfolio_disclosure_parsing.py` cannot be collected (`xlwt` missing): exclude it, install nothing. If the sandbox blocks WSL, retry with the permission the tool offers; do not edit configuration.

## Constraints
`Decimal` never `float` (no `float()` or float literals in new modules). TDD: see each test fail for the right reason first. Additive only: new files plus one `include_router` line in `app/main.py`. **Allowed files:** `backend/app/api/portfolio.py`; `backend/app/services/dashboard/{portfolio_schemas,instrument_allocation,portfolio_summary,value_series}.py`; `backend/app/main.py` (registration only); `backend/scripts/{write_portfolio_fixtures,portfolio_synthetic_gate}.py`; the test files and fixture folder named above; this handoff's Report block. **Do not edit** anything under `app/services/home/`, `app/services/analytics/`, `holdings.py`, `xirr.py`, `schemas.py`, `aggregate.py`, `allocation.py`, `app/api/dashboard.py`, `app/api/home.py`, any migration or model. No new dependency. Git is read-only for you (`status`, `diff`, `log`, `show`, `grep`, `ls-files`); do not commit, push or switch branches. LF endings, UTF-8 (`git diff --check`, `git ls-files --eol`). Match the surrounding code's comment density and naming. If something in a forbidden file needs changing, stop on that point and say why.

## Review Focus (for the gate)
Parity with Home to the paisa on every variant (the C88 convention and the C94 today figure); `unrealized == value - invested`; no use of `balance_units`; the golden comparison is read-only and the semantics test names every file; no writes; statement counts flat in the fund count; shapes exactly as above (names, optionality, string decimals); the series is Home's series (last point equals the headline).

## Approaches considered and rejected
`sum(HoldingRow.today_gain)` for today's gain (wrong on NAV-date purchases, zero for statement-priced funds, and it would disagree with Home); the plan's bare-list member allocation response (two shapes for one route family); a replay of `Transaction.balance_units` for the sparkline (nullable and unreliable, register C57); editing `schemas.py`, `aggregate.py` and `dashboard.py` (the plan's files: more diff, more merge risk, nothing gained).

## Open questions
Anything the code shows that this handoff did not say goes under Findings; behaviour or interface questions under Open questions. Do not guess.

## Report (the worker fills this in at the end, in one fenced block)
```
WORKER REPORT — ui-redesign — PF-B (Portfolio backend)
Run date/time:    Worker (tool and model):    Python: 3.14    Baseline HEAD:
1. TASK STATUS (Tasks 1 to 7):
2. FILES (added and changed):
3. TESTS (RED list, GREEN task runs, final fresh commands and last lines; the gate output in full):
4. DEVIATIONS (mechanics only):
5. FINDINGS:
6. OPEN QUESTIONS / BLOCKERS:
7. SELF-REVIEW FINDINGS:
8. CONFIRMATIONS: No git write commands: ___  Full suites not run: ___  Edits only in the allowed files: ___  ~/s25/s25.db unmodified (sha256 before and after): ___
```
