# Handoff: ui-redesign HB5 (Home API: response contracts, routes, golden fixtures, synthetic gate)
**Status:** READY FOR CODEX (written 26 Oct 2026, not yet run)
**Parent plan:** `Docs/superpowers/plans/2026-10-23-home-backend-plan.md` Tasks **T11 (`api/home.py`)** and **T12 (synthetic gate)**. Spec: `Docs/orchestration/2026-10-23-home-functionality-backend-spec.md` sections 1 to 7 and 11; layout and states: `2026-10-23-home-layout.md` section 3. Run catalogue: `2026-10-24-ui-redesign-orchestrator-handoff.md`, run **HB5**; execution plan `2026-10-26-execution-plan-v2.md` (this is Codex session **C1b**).
**Branch:** `feat/home-snapshot` (HB1 to HB4 are on it, HEAD `7e6833f7` plus the docs merge that brings this file in; migration head `0045`; baseline **223 tests green** in `tests/services/home`). **Orchestrator:** Claude Code · **Worker:** Codex (manual relay). One working tree, one run at a time: do not switch branches. **The shapes below are decided by the orchestrator and are exact: the front end is built against them in parallel (Gemini, packet G2 onward). Do not rename, reorder, add or drop a field; if a shape cannot work with the real code, stop on that point and report it under Open questions.** Decisions are logged in `ui-redesign-decisions-register.md` (C78 to C84); do not re-litigate them.

Everything is `Decimal`, never `float`. Home GET routes **never write** and **never recompute Analytics**: no `compute_*` from `app.services.analytics`, no snapshot rebuild, no `dispatch`, no INSERT/UPDATE/DELETE statement (a test asserts it). News is **not** in this run (separate NB runs).

## What exists (verified by the orchestrator; read these first, do not re-derive)
- `app/services/home/`: `series.py` (`build_value_series`, `load_navs_by_scheme`, `modified_dietz`, `benchmark_return`, `period_range`), `units.py` (`build_units_timeline`), `movers.py` (`FundInput`, `compute_movers`, `load_sector_weights`, `Movers` dataclasses; its identity: bar amounts sum exactly to `net_change`), `summary.py` (`build_summary`, `load_members_connected`; `Summary` dataclass), `allocation.py` (`load_allocation` async, `Allocation`), `worth.py` (`load_worth_facts`, `build_worth_cards`), `benchmarks.py` (`HOME_BENCHMARKS`, `recommend_benchmark`, `load_cap_mix`), `stored.py`. Their dataclasses are the source of every value below; this run adds **no new calculation of money**, only composition, wealth-series assembly, serialization and routes.
- `app/api/dashboard.py` is the route pattern: `Depends(get_active_user)`, `Depends(get_db)`, `require_member(db, user.id, member_id)` (404 for a foreign member), aggregate = `list_household_members(db, user.id)` ids. `app/services/dashboard/aggregate.py` has `get_member_statuses(db, user_id)` (`MemberStatus` with `id`, `name`, `has_data`).
- `compute_holdings(db, member_ids, scheme_ids=None, allow_stale_today=...)`: Home always passes `allow_stale_today=True` (stored prices, no live download).
- Local synthetic household for the gate: `~/s25/s25.db` (SQLite, WSL path `/home/ayush/s25/s25.db`): 1 user, 2 members (Rohan 382 transactions, Priya 269), 9 schemes, NAV 2013-01-01 to **2026-10-23** (a Friday), **no** benchmark index history, **no** analytics sections, **no** TER, **no** disclosures. **Never modify it** (the gate script works on a copy).

## Decisions fixed for this run (register C78 to C84)
1. **Clock:** a FastAPI dependency `get_now_ist() -> datetime` (aware, Asia/Kolkata, `datetime.now(ZoneInfo("Asia/Kolkata"))`) in `app/api/home.py`; tests and the gate override it through `app.dependency_overrides`. `computed_at` in every envelope is this instant converted to UTC. "Today" for the movers and the series is **the IST date** of this clock; `nav_as_of` is what the data says (latest NAV date among the scope's valued funds, `Movers.as_of_nav_date`).
2. **Display name:** the first given name, Title-Cased (`"ROHAN VIJAY KULKARNI"` gives `"Rohan"`), of the household member whose `relationship` is `SELF`; if none, of the oldest member (`created_at`, then `id`); if the household has no member, `""` (the front end then greets without a name). Never a member's name when a self member exists in member scope (it is the logged-in person).
3. **Period end and start:** for the wealth series `end = nav_as_of` (not the calendar date) so the graph's last point equals the headline; `start` from `period_range(period, end, custom)`; for `1D` the start is `Movers.previous_nav_date` (when `None`, start = end and the series has one point). Series dates are **every calendar day** from start to end (weekends and holidays forward-filled by `build_value_series`).
4. **The 1D change comes from the movers number:** for `period=1D` the response's `change_amount` and `change_pct` are `Movers.net_change` and `Movers.net_pct` (so the headline, the Home sentence and the contributors agree to the paisa; `change_method = "price_only"`); for every other period they come from `modified_dietz` (`change_method = "modified_dietz"`).
5. **First-transaction edge:** when the first series point is later than the requested start, use `start_effective = first_point_date - 1 day` with `start_value = 0` for `modified_dietz` and the benchmark, so the purchase on the first day is counted as money in and not as gain. The response still reports the requested `start`.
6. **Benchmarks routes are scoped:** the plan's unscoped `GET /home/benchmarks` cannot know the recommendation, so the list is served at `.../home/benchmarks` under both scopes (below); no unscoped route.
7. **Benchmark series source:** total-return levels (`BenchmarkReturnType.TRI`) from `benchmark_index_history`, read with one query per request; no levels at all gives `available: false`.
8. **Golden fixtures are the contract:** the JSON files in `backend/tests/fixtures/home/` (list below) are compared byte-for-value (parsed JSON equality, keys order irrelevant) with live route output in tests, and **the front end builds its mock data from copies of those files**, so a fixture is never edited by hand: it is regenerated with `scripts/write_home_fixtures.py` and reviewed.

## Task 0: response models `app/services/home/schemas.py`
Pydantic v2. `PlainDecimal = Annotated[Decimal, PlainSerializer(lambda v: format(v, "f"), return_type=str, when_used="json")]` so every Decimal serialises as a plain string (no exponent). Money is quantized to `0.01` (`ROUND_HALF_UP`) before it is placed in a model; percentages as stated. Dates are `date` (ISO), instants `datetime` (ISO, UTC, `Z`). All models `model_config = ConfigDict(extra="forbid")`.
```python
class MissingFund(BaseModel): scheme_id: str; name: str
class Envelope(BaseModel):                        # fields of EVERY response, first in each model
    scope: Literal["aggregate", "member"]; member_id: str | None
    nav_as_of: date | None; partial: bool; missing_funds: list[MissingFund]; computed_at: datetime
class MemberOut(BaseModel): id: str; name: str; has_data: bool

class SummaryResponse(Envelope):
    display_name: str; greeting: Literal["morning", "afternoon", "evening"]; scope_label: str
    change_amount: PlainDecimal; change_pct: PlainDecimal | None                    # pct has 4 places
    direction: Literal["up", "down", "flat"]; status_phrase: str
    since_label: str; since_date: date | None; top_contributor: str | None
    members_connected: int; members_total: int; data_line: str | None
    has_holdings: bool; total_value: PlainDecimal; members: list[MemberOut]        # members: every member of the household, created order

class PointOut(BaseModel): date: date; value: PlainDecimal
class BenchmarkPointOut(BaseModel): date: date; pct: PlainDecimal                    # 4 places
class BenchmarkSeriesOut(BaseModel):
    index: str; label: str; available: bool; pct: PlainDecimal | None
    effective_start: date | None; clipped: bool; points: list[BenchmarkPointOut]
class WealthSeriesResponse(Envelope):
    period: Literal["1D", "1W", "1M", "1Y", "custom"]; start: date; end: date; clamped: bool
    empty: bool; points: list[PointOut]
    start_value: PlainDecimal; end_value: PlainDecimal; net_contributions: PlainDecimal
    change_amount: PlainDecimal; change_pct: PlainDecimal | None
    change_method: Literal["price_only", "modified_dietz"]
    benchmark: BenchmarkSeriesOut | None                                              # None when no benchmark was requested

class ClassRowOut(BaseModel): key: str; label: str; status: Literal["live", "coming_soon"]; value: PlainDecimal | None; percentage: PlainDecimal | None
class MemberShareOut(BaseModel): id: str; name: str; value: PlainDecimal; percentage: PlainDecimal
class AllocationResponse(Envelope):
    source: Literal["analytics", "dashboard_buckets"]; approximate: bool; total_value: PlainDecimal
    classes: list[ClassRowOut]; covered_pct: PlainDecimal | None; mix_as_of: date | None
    members: list[MemberShareOut] | None                                              # None in member scope and for single-member households

class MoverFundOut(BaseModel): scheme_id: str; name: str; change: PlainDecimal | None  # None in the sector view (a fund's share of a sector is not stored)
class MoverBarOut(BaseModel): key: str; label: str; change: PlainDecimal; funds: list[MoverFundOut]
class MoversResponse(Envelope):
    requested_view: Literal["fund", "category", "sector"]; view: Literal["fund", "category", "sector"]
    fell_back: bool; estimated: bool; coverage_pct: PlainDecimal | None
    net_change: PlainDecimal; net_pct: PlainDecimal | None; previous_value: PlainDecimal
    previous_nav_date: date | None
    gains: list[MoverBarOut]; losses: list[MoverBarOut]; others_count: int; others_change: PlainDecimal

class WorthCardOut(BaseModel): kind: Literal["weak_fund", "underperforming", "high_expense", "concentration"]; rank: int; scheme_id: str | None; scheme_name: str | None; evidence: dict[str, Any]
class WorthResponse(Envelope):
    cards: list[WorthCardOut]; unavailable: list[str]; state: Literal["cards", "nothing_flagged", "unavailable"]
    # state: "cards" when cards is non-empty; "unavailable" when all three stored sections are unavailable or there are no holdings; otherwise "nothing_flagged"

class BenchmarkOptionOut(BaseModel): index: str; label: str; recommended: bool
class BenchmarksResponse(Envelope):
    options: list[BenchmarkOptionOut]; recommended_index: str; reason: str            # exactly the five HOME_BENCHMARKS in order; exactly one recommended
```
`MoverBarOut.funds` for fund and category views: the funds of that bar with their own day change (`FundChange.change`); for the sector view `change` is `None` and `funds` lists the contributing funds by name. A bar with no funds (the zero-change case, register L4) lists its own fund in the fund view. Gains are the positive bars, losses the negative bars, exactly as `MoversView` gives them (top 2 each); `others_*` from `MoversView`.

## Task 1: composition `app/services/home/context.py` and `wealth.py`
`context.py`: `ScopeContext` (frozen dataclass: `scope`, `member_id`, `member_ids`, `members` (id, name, has_data, created order), `member_name`) and `resolve_scope(db, user, member_id | None)`; `HomeInputs` and `load_home_inputs(db, ctx, today, *, nav_start)` which calls `compute_holdings(..., allow_stale_today=True)` once, `build_units_timeline` once, `load_navs_by_scheme` **once** for `[nav_start, today]` over the valued schemes, `load_sector_weights` once when the sector view is requested, builds the `FundInput` list as the HB3 handoff specifies (`statement_priced` when a fund has no daily NAV, `category` from `HoldingRow.sebi_category`), and returns holdings, the `FundInput`s, `Movers` (`compute_movers(funds, today, view)`), `nav_as_of`, and the `partial` / `missing_funds` pair: **every held scheme with `nav_unavailable`, or in `Movers.stale_scheme_ids` / `missing_scheme_ids`, or in the series' `missing_schemes`**, named from the holdings rows, sorted by name then id. Statement count of a route does not depend on the number of funds (a test compares 3 funds and 9 funds).
`wealth.py`: `build_wealth_series(...)` implementing decisions 3 to 5 and 7. Flows are the household's cash flows in the scope: purchases positive, redemptions negative, **classified exactly as `dashboard/xirr.py` classifies them (`_FUND_RELEVANT_TYPES`, same stamp-duty and extra-debit handling; read it first and say which helper you reused)**; the series' `start_value` is the value at `start_effective` (0 when the series starts later); `net_contributions` = flows in `(start_effective, end]`. Benchmark points: for each series date `d >= effective_start`, `pct_d = (level_on_or_before(d) / start_level - 1) * 100` (4 places, `ROUND_HALF_UP`); use `series.benchmark_return` for the scalar `pct`, `effective_start` and `clipped`. `empty` is true when the series has no point. One point (1D with no previous day) returns that single point.

## Task 2: routes `app/api/home.py`, registered in `app/main.py`
Twelve routes, `response_model` set on each, `tags=["home"]`; handlers are thin (resolve scope, call the services, map to the models):
```
GET /household/aggregate/home/{summary,wealth-series,allocation,movers,worth-a-look,benchmarks}
GET /household-members/{member_id}/home/{summary,wealth-series,allocation,movers,worth-a-look,benchmarks}
```
- `wealth-series` query: `period: Literal["1D","1W","1M","1Y","custom"] = "1M"`, `from` and `to` (aliases of `date_from`, `date_to`; ISO dates; required when `period=custom`, ignored otherwise), `benchmark: BenchmarkIndex | None = None` (must be one of `HOME_BENCHMARKS`, else 422). A custom range outside the 10-year window is clamped by `period_range` and returned with `clamped: true`; `from > to`, or a range wholly outside the window, is **422** with the message from the `ValueError`.
- `movers` query: `by: Literal["sector","category","fund"] = "sector"`.
- Errors: 401 unauthenticated (the existing dependency), 404 foreign member (`require_member`), 422 as above. No other new error code.
- Empty household or no holdings: every route still returns 200 with the empty shapes (`has_holdings` false, `empty` true, zero money, `cards: []` with `state: "unavailable"`, allocation with zero live classes, movers with empty lists).
- `summary` uses `build_summary` (greeting from `get_now_ist().hour`, `data_line` rule inside it) and `load_members_connected`; `members` from `get_member_statuses`.
- `allocation` uses `load_allocation` (members argument = the household members, aggregate scope only).
- `worth-a-look` uses `load_worth_facts` with the holdings rows then `build_worth_cards`; `benchmarks` uses `load_cap_mix` then `recommend_benchmark` (member and aggregate use the right scope key).

## Task 3: tests and golden fixtures
`tests/api/home_fixture.py` builds one **deterministic synthetic household** (uuid5 ids, no randomness): user "Asha Rao" (phone `+919000000001`), members **Asha Rao (self)** and **Dev Rao**, four schemes (Large Cap, Flexi Cap, Short Duration Debt, a Gold fund) with explicit units timelines and NAV rows for the last 40 days (NAV day Friday **2026-10-23**, previous Thursday 2026-10-22; weekend rows absent), transactions that give the units, TRI levels for Nifty 50 and Nifty Smallcap 250 (the latter starting 2026-09-01 so a 1Y request clips), stored `asset_allocation`, `score`, `category_ranking`, `stock_holdings`, `cap_allocation` sections written with the real `_upsert_section`, TER rows, and disclosure batches; plus factory variants (no holdings, one fund without a NAV, only one fund held, all funds down, no stored sections). The fixed clock is **Fri 2026-10-23 18:30 IST** unless a fixture says otherwise.
Tests in `tests/api/test_home_routes.py` (and `tests/services/home/test_context.py`, `test_wealth.py` for the pure parts), written first, red first:
1. Auth: every route 401 without a session; a foreign member id 404 on all six member routes.
2. Golden fixtures: each file below equals the live response (parsed JSON equality). Generate them once with `backend/scripts/write_home_fixtures.py` (it builds the same households and writes the files; deterministic, safe to re-run) and **review the numbers by hand against your own arithmetic for at least summary, wealth 1D and movers fund view** before committing them (say in the report which you checked).
3. **Reconciliation invariants** on every household variant: `summary.change_amount == movers.net_change == wealth(1D).change_amount`; `sum(gains.change) + sum(losses.change) + others_change == net_change` in all three views; `wealth.points[-1].value == wealth.end_value == summary.total_value == allocation.total_value`; allocation family `members` percentages and values sum to the total; the sector fallback is flagged when coverage is under 50 percent.
4. **Parity with the Dashboard:** `summary.total_value` equals the sum of `current_value` over valued rows of `GET /household/aggregate/holdings` for the same household (live NAV fetch patched out so both read the stored NAV), aggregate and member.
5. No writes and no recompute: a `before_cursor_execute` listener sees only SELECT statements on every route; patching every `compute_*` of `app.services.analytics`, the snapshot rebuild and `dispatch` to raise leaves all routes passing.
6. Statement counts independent of fund count (3 versus 9 funds), per route.
7. Query validation: `period=custom` without dates 422; `from > to` 422; a benchmark outside the five 422; a custom range reaching beyond today is clamped (`clamped: true`, `end == nav_as_of`).
8. Display name rule (self member, no self member, no members, an all-caps name), greeting at 11:59, 12:00, 16:59, 17:00 IST, and the weekend case (clock Mon 2026-10-26 10:00 IST: `nav_as_of` 2026-10-23, `since_label` as `build_summary` gives).
9. One-point and edge series: 1D when only one NAV day exists; first transaction inside the period (decision 5: the purchase is not counted as gain; hand-computed); custom range wholly before the first transaction gives `empty: true`; a fund without a NAV gives `partial: true` and names it in `missing_funds`; a redemption inside the period.
10. OpenAPI: the generated schema contains the twelve paths and no `float`/`number` typed money field (a test walks the schema and asserts every field named in the models above that is money or a percentage is `string`).
**Golden fixture files** (`backend/tests/fixtures/home/`): `summary_family.json`, `summary_member.json`, `summary_empty.json`, `summary_partial.json`, `summary_weekend.json`; `wealth_1d_family.json`, `wealth_1m_family_benchmark.json`, `wealth_1y_member_clipped.json` (Smallcap 250), `wealth_custom_empty_range.json`, `wealth_partial.json`; `allocation_family.json`, `allocation_member.json`, `allocation_fallback.json`, `allocation_empty.json`; `movers_sector.json`, `movers_category_fallback.json`, `movers_fund.json`, `movers_all_down.json`, `movers_empty.json`; `worth_three_cards.json`, `worth_none.json`, `worth_unavailable.json`; `benchmarks_family.json`, `benchmarks_no_mix.json`.

## Task 4: synthetic gate (T12), local, read-only on the real file
`backend/scripts/home_synthetic_gate.py <db_path>`: **copies** the SQLite file to a temp path, opens an app session on the copy, overrides `get_active_user` with the DB's only user and `get_now_ist` with a given clock, and for each scenario mutates the copy with SQL and checks the invariants of Task 3 item 3 plus parity with `compute_holdings`: `base` (two members), `member_rohan`, `member_priya`, `weekend` (clock Mon 2026-10-26 10:00), `partial_data` (delete the last 12 days of NAV rows of one scheme), `stale_statement` (delete NAV rows newer than five days before the latest), `one_fund_only` (delete all transactions except one folio's), `all_funds_down` (set the latest NAV of every scheme to 0.99 times the previous), `loss_day` (set one scheme's latest NAV to 0.95 times the previous), `no_holdings` (delete every transaction), `custom_before_index_data` (period custom, 2016-01-01 to 2016-12-31, with a benchmark). It prints one line per scenario and check (`PASS`/`FAIL`, with both numbers on a failure), the worth-a-look state for each (expected `unavailable` on this file), and exits non-zero on any FAIL. It must not import test fixtures. Run it on `/home/ayush/s25/s25.db`, paste the full output in the report. **Do not calibrate thresholds** (register C76/C85: that is a staging step); but report, for the base scenario, the five numbers a calibration would need (fund shares, tier, 1Y gap, TER gap, top-five share) as `n/a` where the local file has no source for them.

## Test commands (run only these; no full suite)
```
wsl.exe -d Ubuntu --cd "D:\Unifolio code\backend" -- .venv/bin/python -m pytest tests/api/test_home_routes.py tests/services/home -q -p no:cacheprovider --disable-warnings
```
and, the same way, the neighbours: `tests/services/dashboard/test_holdings.py`, `tests/services/analytics/test_recompute.py`, `tests/scripts/test_measure_benchmark_matrix.py`, every file in `tests/api` that exercises `app.main` route registration or the dashboard routes (`git grep -l "household/aggregate" -- tests/api`), and the gate command `.venv/bin/python scripts/home_synthetic_gate.py /home/ayush/s25/s25.db` run inside WSL. `tests/services/analytics/test_portfolio_disclosure_parsing.py` cannot be collected locally (`xlwt` is not in the venv): exclude it and say so; install nothing.

## Constraints
`Decimal` never `float` (no `float()` and no float literals in the new modules). TDD: see each test fail for the right reason first and list which were RED. Additive only: new files plus the registration lines in `app/main.py`; **do not edit** `holdings.py`, any analytics module, `recompute.py`, `series.py`, `movers.py`, `summary.py`, `allocation.py`, `units.py`, `worth.py`, `benchmarks.py`, `stored.py` (if one of them needs a change to serve a route, stop and report it under Open questions with the exact reason). No new dependency, no migration. **Allowed files:** `backend/app/services/home/{schemas,context,wealth}.py`, `backend/app/api/home.py`, `backend/app/main.py` (registration only), `backend/scripts/{write_home_fixtures,home_synthetic_gate}.py`, `backend/tests/api/{home_fixture,test_home_routes}.py`, `backend/tests/services/home/{test_context,test_wealth}.py`, `backend/tests/fixtures/home/*.json`, and this handoff's Report block. Git is read-only. LF endings, UTF-8 (`git diff --check`, `git ls-files --eol`). Match the surrounding code's comment density and naming.

## Review Focus (for the gate)
Every field exactly as specified (names, optionality, string-typed decimals, 4-place percentages); the 1D identity chain (summary = movers = wealth 1D = fixtures); decision 5 (first-day purchase not counted as gain); period end equals `nav_as_of`; benchmark percent series against hand arithmetic and the clipped flag; partial and missing-fund naming; no write and no recompute on any route; statement counts independent of fund count; the 404/401/422 matrix; parity with the Dashboard; the gate script working on a copy and never touching the source file.

## Approaches considered and rejected
One giant `/home` payload (a slow section would block the rest; the spec decides per-section endpoints); computing the 1D wealth change by Modified Dietz (it disagrees with the movers number by the day's flows, and the three Home numbers must agree to the paisa); serving the series on trading days only (the chart morph and the Dashboard history are calendar-day based); an unscoped benchmarks route (no scope, no recommendation); hand-written front-end fixtures (they drift; the goldens are generated from the real routes).

## Open questions
Anything the code shows that this handoff did not say goes under Findings; behaviour or interface questions under Open questions. Do not guess.

## Report (Codex fills this in at the end, in one fenced block)
```
CODEX REPORT — ui-redesign — HB5
Run date/time:    Environment:    Python: 3.14    Baseline HEAD:
1. TASK STATUS (Tasks 0 to 4):
2. FILES (added and changed):
3. TESTS (RED list, GREEN task runs, final fresh commands and last lines; the gate output in full):
4. DEVIATIONS (mechanics only):
5. FINDINGS (including which flow helper was reused, which fixtures were hand-checked and the arithmetic):
6. OPEN QUESTIONS / BLOCKERS:
7. SELF-REVIEW FINDINGS:
8. CONFIRMATIONS: No git write commands: ___  Full suites not run: ___  Edits only in the allowed files: ___  ~/s25/s25.db unmodified (sha256 before and after): ___
```
