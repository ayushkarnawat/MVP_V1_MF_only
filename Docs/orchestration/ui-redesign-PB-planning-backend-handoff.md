# Handoff: ui-redesign PB1 + PB2 (Planning backend: additive scenario API fields, member filter, stored prices, timing script)
**Status:** READY FOR A CLAUDE CODE (SONNET) TERMINAL (written 26 Oct 2026, not yet run). One session, seven commits.
**Parent plan:** `Docs/superpowers/plans/2026-10-23-planning-scenarios-backend-plan.md` Tasks **T1 to T7** (PB1 = T1 to T3, PB2 = T4 to T7). Spec: `Docs/orchestration/2026-10-23-planning-scenarios-functionality-backend-spec.md` sections 4 to 8; decisions PD1 to PD8 in `2026-10-23-planning-scenarios-backend-decisions-proposal.md`; tests in `2026-10-23-planning-scenarios-tdd.md` section 1. Register: `ui-redesign-decisions-register.md` (C49, C98 to C115, L-list).
**Branch:** `feat/planning-backend`, created from `leapswitch-redesign` **after PRs #10 (Home), #12 (Mutual Funds) and #15 (Portfolio) are merged into it** (the orchestrator tells the owner when). **Worktree:** `~/wt/planning-be`. **Orchestrator:** Claude Code (Opus) · **Worker:** Claude Code (Sonnet) in a WSL terminal. Do not switch branches, do not push, do not touch any other worktree.
**The response shapes in Appendix A are decided and exact: the Planning front end is built against them in parallel.** Do not rename, reorder or drop a field; if a shape cannot work with the real code, stop on that point and report it. Do not re-litigate decisions in the register.

## Purpose and non-goals
Give the Planning page (market scenarios) what it needs from the existing scenario API, **additively**: a `description` on each scenario card; `by_asset_class` (six display groups) and `funds_data_available` on a result; `is_proxied`, `proxy_basis`, `is_frozen` on each member fund row; an optional `member_id` on `GET /scenarios/{id}/results` with an ownership check; stored prices for the results route (no live NAV download on a page open); and a read-only staging timing script for the owner to run.
**Non-goals:** no new table, migration, job or dependency; no change to `by_fund`, `phases`, `benchmarks`, the hypothetical release gate (`SCENARIO_HYPOTHETICALS_ENABLED` stays off by default) or any existing field's value; no front end; no mobile; no Plan-your-future work; no `decisions.md` or schema-document edits (the orchestrator does those).

## Set-up and baseline (run in WSL, record every output in the report)
```
git -C "/mnt/d/Unifolio code" worktree add ~/wt/planning-be -b feat/planning-backend leapswitch-redesign
cd ~/wt/planning-be/backend
export PY="/mnt/d/Unifolio code/backend/.venv/bin/python"      # shared venv (Python 3.14); the worktree has none
git log --oneline -8 && git status -sb
ls app/api/home.py app/api/portfolio.py app/services/analytics/benchmark_windows.py   # #10, #15 and #12 markers: all three must exist
grep -n "stored_only" app/services/dashboard/holdings.py app/services/dashboard/nav.py   # Home's stored-prices setting: must be present in both
"$PY" -m pytest tests/api tests/services/home tests/services/dashboard -q -p no:cacheprovider --disable-warnings
"$PY" -m pytest tests/services/analytics/test_scenario_engine.py tests/services/analytics/test_scenario_asset_class.py tests/api/test_scenarios_api.py -q -p no:cacheprovider --disable-warnings
```
Reference (orchestrator, 26 Oct, on `feat/portfolio-backend`): the second command gives **106 passed**. **Red means stop:** if either command fails, or a marker file or `stored_only` is missing, stop and report the exact output; do not fix, skip or work around it. `tests/services/analytics/test_portfolio_disclosure_parsing.py` cannot be collected locally (no `xlwt`): if `tests/services/analytics` is run whole, exclude it and say so. All commands below use `"$PY" -m pytest <files> -q -p no:cacheprovider --disable-warnings` from `~/wt/planning-be/backend`; run only the files named, never the full suite.

## Rules
1. **Tests first.** For each task write the tests, run them, and see them fail for the right reason (an `AttributeError`, `ImportError`, missing key or wrong value, not a typo) before writing code. List which were RED in the report.
2. **No live network** in tests (patch `compute_holdings` or use the fixture household). **Decimal for every money and percentage value; never `float`** in the new code (no `float(`, no float literals). Values leave the API as strings with the same `.quantize(Decimal("0.01"))` call the engine already uses (no extra rounding argument), so a group percent and the headline percent round identically.
3. **Additive only.** Every new schema field has a default so existing constructors, fixtures and mobile keep working. Existing assertions change only to add the new fields to a whole-dict comparison; if any other existing assertion must change, stop and report.
4. **Stay inside the file map.** Git: `add`, `commit` and read-only commands only. No `push`, `rebase`, `reset`, `stash`, `checkout` of other branches, no `--amend` (a mistake gets a new fixup commit and a note). LF endings, UTF-8 (`git diff --check`).
5. **One commit per task**, message `feat(planning): T<n> <what>` (T7: `feat(planning): T7 golden fixtures and final verification`), ending with the attribution line from your system reminder. After each commit print the **CHECKPOINT LINE** (format in the report template) and keep it for the report.
6. **Stop and report instead of improvising** whenever the code disagrees with this document beyond the differences listed below, a test cannot be made red for the right reason, or a change outside the file map looks necessary. Comments: explain the *why* only where the docs do not (the repo rule); match the surrounding density.

## Differences between the plan and the real code (code wins; verified 26 Oct in `/mnt/d/Unifolio code/backend`)
1. **Task 5 is unblocked and the parameter is `stored_only=True`.** Home T1 is done (HB1 and HB6). `compute_holdings(db, member_ids, *, scheme_ids=None, allow_stale_today=False, stored_only=False)` in `app/services/dashboard/holdings.py`; `stored_only=True` never fetches or writes a price (the stored row or `None`), `allow_stale_today=True` only changes the live path. Home passes **both** (`app/services/home/context.py:123`, `allocation.py:232`). Planning does the same: `compute_holdings(db, household_member_ids, allow_stale_today=True, stored_only=True)` at both call sites. `allow_stale_today` alone (the plan's wording) would still download a price for a fund with no stored row. The plan's Step 1 grep target is `stored_only`, not `allow_stale_today`.
2. **Branch** is `feat/planning-backend` (register C112), not the plan's `feat/planning-scenarios`; and each task ends in a **commit**, not "a checkpoint without commit" (owner policy, C112). Still no push.
3. **404 body.** The plan says `"Member not found."` in one place and "same body as an unknown scenario" in another. The code convention is `require_member(db, user.id, member_id)` (`app/services/dashboard/member_details.py:184`, `HTTPException(404, "Household member not found.")`, used by every member route). Use it: the response for another account's member id and for an id that exists nowhere must be **byte-identical** to each other (that is the privacy requirement); it need not equal the scenario 404. Orchestrator to confirm (see notes).
4. **No `test_measure_home_staging.py` exists.** Model Task 6 on `scripts/measure_benchmark_matrix.py` (newer: `is_write_statement`, `guard`, one event loop) and its test `tests/scripts/test_measure_benchmark_matrix.py`, and on `scripts/measure_home_staging.py` for printing. `--simulate-fresh-cache` is not needed (stored prices). `main(argv)` is new (the Home script's `main()` takes none).
5. **Line numbers in the plan are stale** (schemas near 433 to 505 is now about 449 to 520; the engine function starts at line 308, hypothetical `compute_holdings` call at 326, historical at 373). Locate everything by name.
6. **The plan has no fixtures.** This handoff adds golden fixtures and a guard test (T7), because the front end builds its mock data from them (register C93 pattern).
7. **`by_asset_class` accumulation ignores zero-value holdings** (`current_value` 0 or `None`): they create no group. Plan wording ("`pct` is `None` when `covered == 0`") stays in the pure helper, which is unreachable from the loop. A group `rupee_impact` or `pct` that rounds to zero is never signed (`"-0.00"` becomes `"0.00"`; house rule from Home and Portfolio, `abs(v) if v.is_zero() else v`); this applies to the new `by_asset_class` strings only, existing fields stay as they are.
8. **Two traps in existing tests:** `test_serving_loads_only_results_for_held_schemes` listens for `ScenarioSchemeResult` ORM loads, so `funds_data_available` must be a **column query** (`db.query(ScenarioSchemeResult.scheme_id)...first()`), never an entity query; and `test_release_gate_queries_without_http_transport` calls `get_scenario_results(scenario.id, user=..., db=...)` directly, so `member_id` must be a **plain default** (`member_id: uuid.UUID | None = None`), not `Query(...)`.

## File map (only these; anything else: stop and report)
| File | Change |
|---|---|
| `backend/app/services/analytics/schemas.py` | new fields; new `ScenarioAssetClassRow` |
| `backend/app/services/analytics/scenario_asset_class.py` | `DISPLAY_GROUPS`, `display_group` |
| `backend/app/services/analytics/scenario_engine.py` | description, `by_asset_class` (+ private helper), flags on member funds, `funds_data_available`, stored prices |
| `backend/app/api/scenarios.py` | optional `member_id` with ownership check |
| `backend/scripts/measure_planning_staging.py` (new) | read-only timing |
| `backend/scripts/write_planning_fixtures.py` (new) | golden fixture generator |
| `backend/tests/services/analytics/test_scenario_engine.py`, `test_scenario_asset_class.py` | tests |
| `backend/tests/api/test_scenarios_api.py` | tests |
| `backend/tests/api/planning_fixture.py` (new), `backend/tests/api/test_planning_fixtures.py` (new) | fixture household and guard test |
| `backend/tests/scripts/test_measure_planning_staging.py` (new) | script test |
| `backend/tests/fixtures/planning/*.json` (new, generated) | goldens |
| this handoff's Report block | filled by you |

## What exists (read first, do not re-derive)
- `scenario_engine._async_get_scenario_result_for_household(db, scenario, household_member_ids) -> ScenarioResultRow`: hypothetical branch (returns early, calls `compute_holdings` at its own line), then the historical path: `serving_scenario = _current_phase(db, scenario) if summary.has_phases else scenario`; `holdings = await compute_holdings(...)`; `held_schemes`; `results = _held_results(db, serving_scenario.id, held_schemes)`; `headline_results = _held_results(db, scenario.id, held_schemes) if summary.has_phases else results`; `frozen_ids`; then **`for holding in holdings:`** which computes `pct` (headline; `None` if frozen or no data), `rupee_impact` (per fund, quantized), accumulates `by_member_*`, `total_rupee`, `covered_value`, builds `by_fund_map` from `scheme_result = results.get(...)` (the **current phase**) and appends `ScenarioMemberFundResult(scheme_id, scheme_name, rupee_impact)` to `by_member_funds`.
- `get_scenario_summary(db, scenario, *, has_phases=None) -> ScenarioSummaryRow`. `underlying_asset_class(sebi_category, scheme_name="") -> str` returns exactly nine values: `Equity, Hybrid, Debt-short, Debt-long, Gold, Silver, Overseas, Index/ETF, Other`.
- API: `get_scenario_results(scenario_id, user=Depends(get_active_user), db=Depends(get_db))` in `app/api/scenarios.py`: scenario lookup and hidden-hypothetical 404 first, then `members = list_household_members(db, user.id)` and the engine with `[m.id for m in members]`.
- Test helpers in `test_scenario_engine.py`: `_session()` (in-memory), `_household_member(db, name)`, `_holding_row(mid, sid, name, value)`, `_holdings((scheme, member, "1000.00"), ...)` (an `AsyncMock` returning `HoldingRow`s), `get_scenario_result_for_household(db, scenario, [ids])` (sync wrapper), `patch("app.services.analytics.scenario_engine.compute_holdings", new=...)`. In `test_scenarios_api.py`: `_seed(client, *rows)`, `_scenario(name, **kw)`, `_authed_headers_and_member(client, phone) -> (headers, member_id, user_id)`; a second member of the same account: `client.post("/household-members", json={"name": "Partner", "relationship": "spouse"}, headers=headers).json()["id"]`.
- Fixture pattern: `tests/api/home_fixture.py` (`build_home_fixture(variant="base"|"empty", now=...)` returns a runtime with `.client`, `.household` (`user_id`, `asha_id`, `dev_id`), `.close()`; `uid(name)` deterministic uuid5; `_holdings_cache.clear()` already done), `scripts/write_home_fixtures.py` (`FixtureSpec`, `REQUESTS`, `write_fixture_set(destination, *, write=True)`), guard test `test_generated_golden_fixtures_equal_live_routes` in `tests/api/test_home_routes.py` (compares **read-only**, because write-then-compare can never fail).

---
# PB1

## T1: schema fields and the summary description
**Files:** `schemas.py`, `scenario_engine.py` (`get_scenario_summary`), tests in `test_scenario_engine.py` and `test_scenarios_api.py`.
**Tests first:**
- `test_get_scenario_summary_includes_description`: given a `Scenario(description="Global markets fell sharply.", ...)`, when `get_scenario_summary(db, s)`, then `.description == "Global markets fell sharply."`.
- `test_list_scenarios_includes_description_even_when_empty` (API): seed `_scenario("Quiet", description="")` (pass `description=""` through `kw`; adjust the `_scenario` helper to accept it without breaking its callers), `GET /scenarios` is 200 and the row has `"description": ""`.
- `test_new_schema_fields_default_so_old_constructors_work`: `ScenarioSummaryRow` built without `description` has `""`; `ScenarioMemberFundResult(scheme_id="s", scheme_name="n", rupee_impact=None)` has `is_proxied False`, `proxy_basis None`, `is_frozen False`; `ScenarioResultRow` built with today's keyword set has `by_asset_class == []` and `funds_data_available is True`.
**Implement:** `ScenarioSummaryRow.description: str = ""`; `ScenarioMemberFundResult.is_proxied: bool = False`, `.proxy_basis: str | None = None`, `.is_frozen: bool = False`; `class ScenarioAssetClassRow(BaseModel): bucket: str; rupee_impact: str; covered_value: str; pct: str | None`; `ScenarioResultRow.by_asset_class: list[ScenarioAssetClassRow] = []`, `.funds_data_available: bool = True`. In `get_scenario_summary` pass `description=scenario.description`. Declare `ScenarioAssetClassRow` before `ScenarioResultRow`.
**Checkpoint:** `"$PY" -m pytest tests/services/analytics/test_scenario_engine.py tests/api/test_scenarios_api.py -q -p no:cacheprovider --disable-warnings` all green (106 baseline plus the new ones for these two files); fix only whole-dict assertions that need the new keys. `git diff --stat` shows only the files above. Commit `feat(planning): T1 description and new schema fields`.

## T2: display-group mapping
**Files:** `scenario_asset_class.py`, `test_scenario_asset_class.py`.
**Tests first:** `test_display_groups_order_is_fixed`: `DISPLAY_GROUPS == ("Equity", "Hybrid", "Debt", "Gold and Silver", "Overseas", "Other")`. `test_display_group_maps_every_engine_bucket` parametrised: `Equity`, `Index/ETF` to `Equity`; `Hybrid` to `Hybrid`; `Debt-short`, `Debt-long` to `Debt`; `Gold`, `Silver` to `Gold and Silver`; `Overseas` to `Overseas`; `Other` and `"Crypto"` (unknown) to `Other`. `test_every_underlying_asset_class_value_is_mapped`: for every row of the existing `test_underlying_asset_class` parametrisation, `display_group(underlying_asset_class(c, n)) in DISPLAY_GROUPS` (so a tenth engine value cannot be silently dropped).
**Implement:** `DISPLAY_GROUPS: tuple[str, ...]` and `display_group(bucket: str) -> str` via a dict and `.get(bucket, "Other")`. One-line comment: generic index funds and ETFs track Indian equity indices, so `Index/ETF` is Equity.
**Checkpoint:** `"$PY" -m pytest tests/services/analytics/test_scenario_asset_class.py -q ...` green. Commit `feat(planning): T2 display-group mapping`.

## T3: engine: `by_asset_class`, member-fund flags, `funds_data_available`
**Files:** `scenario_engine.py` (historical path only; the hypothetical return keeps the defaults), `test_scenario_engine.py`.
**Implement:** in the `for holding in holdings` loop, inside the existing `if pct is not None:` block and only when `current_value > 0`, add `rupee_impact` to `group_rupee[group]` and `current_value` to `group_covered[group]`, with `group = display_group(underlying_asset_class(scheme.sebi_category or "", scheme.name))` using `held_schemes[scheme_id]`. Frozen and no-data funds never reach that block. Pure private helper `_build_asset_class_rows(group_rupee: dict[str, Decimal], group_covered: dict[str, Decimal]) -> list[ScenarioAssetClassRow]`: iterate `DISPLAY_GROUPS` in order, skip groups absent from `group_covered`, `rupee_impact = str(_unsigned_zero(rupee.quantize(Decimal("0.01"))))`, `covered_value = str(covered.quantize(Decimal("0.01")))`, `pct = None` when `covered == 0` else `_pct_str(_unsigned_zero((rupee / covered * 100).quantize(Decimal("0.01"))))`. Member fund rows: pass `is_proxied=scheme_result.is_proxied if scheme_result else False`, `proxy_basis=scheme_result.proxy_basis if scheme_result else None`, `is_frozen=is_frozen` (the **same values `by_fund_map` uses**, i.e. the current phase). `funds_data_available`: one column query for any `ScenarioSchemeResult.scheme_id` with `scenario_id.in_([scenario.id, serving_scenario.id])` and `pct_change.isnot(None)`, `.first() is not None`.
**Tests first** (use `_session`, `_household_member`, `_holdings`; schemes with `amfi_code` unique, `amc_name="AMC"`):
| Scheme (name; sebi_category) | Group |
|---|---|
| `Equity One`; `Equity Scheme - Flexi Cap Fund` | Equity |
| `Equity Two`; `Equity Scheme - Large Cap Fund` | Equity |
| `Nifty Index`; `Index Funds - Equity Funds` | Equity (via Index/ETF) |
| `Liquid One`; `Debt Scheme - Liquid Fund` | Debt |
| `Gold ETF One`; `Other Scheme - Gold ETF` | Gold and Silver |
| `Odd One`; `Some Unclassified Category` | Other |
- `test_by_asset_class_sums_rupee_impact_into_display_groups`: scenario with results Equity One -20.00, Equity Two -10.00, Liquid One +1.00; member A holds Equity One 100000.00 and Liquid One 200000.00, member B holds Equity Two 50000.00, call with both ids. Then `by_asset_class == [Equity: rupee "-25000.00", covered "150000.00", pct "-16.67"; Debt: "2000.00", "200000.00", "1.00"]` in that order, and `Decimal(rupee_impact)` of the groups sums to `Decimal(result.rupee_impact)` (`-23000.00`) and the covered values sum to `result.covered_value` (`350000.00`) (the reconciliation invariant when nothing is excluded). Headline `portfolio_impact_pct == "-6.57"`.
- `test_by_asset_class_single_group_percent_equals_headline`: only Equity One and Equity Two held, so `by_asset_class[0].pct == portfolio_impact_pct`.
- `test_by_asset_class_unmapped_and_index_funds_land_in_expected_groups`: Nifty Index to Equity, Odd One to Other, Gold ETF One to `Gold and Silver`; order `Equity, Gold and Silver, Other`.
- `test_by_asset_class_excludes_frozen_and_no_data_funds`: model on `test_franklin_frozen_scheme_shows_frozen_not_pct_alongside_other_debt_funds` (Franklin AMC and a freeze list on the scenario) plus one scheme whose result row has `pct_change=None`; neither appears in any row's covered value; `no_data_funds` unchanged from today's rule.
- `test_by_asset_class_empty_when_no_fund_has_data`: every held fund has `pct_change=None`; `by_asset_class == []`, `portfolio_impact_pct is None`, no exception (no division by zero).
- `test_by_asset_class_ignores_zero_value_holdings`: a held fund with value `"0"` and a result creates no group.
- `test_by_asset_class_multi_phase_uses_headline_results`: copy `test_multi_phase_by_fund_uses_current_phase_only` (group -12.00, current phase -3.00, holding 1000.00): Equity row rupee `"-120.00"`, pct `"-12.00"`, while the by-fund pct stays `"-3.00"`.
- `test_build_asset_class_rows_never_signs_a_zero_and_handles_zero_cover` (pure helper): `{"Equity": Decimal("-0.01")}` over covered `Decimal("100000000.00")` gives pct `"0.00"`, rupee `"-0.01"`; a group with covered `Decimal("0")` gives pct `None`.
- `test_member_fund_rows_carry_proxy_and_frozen_flags`: proxied fund (`is_proxied=True`, `proxy_basis="asset_class_average:Equity"`) shows both; frozen fund `is_frozen True`; a real-data fund `False, None, False`; and for every scheme the member-row triple equals the matching `by_fund` row's triple (a family with the same fund under two members gets the same flags twice).
- `test_funds_data_available`: no `ScenarioSchemeResult` rows for the scenario gives `False`; one row with `pct_change=None` gives `False`; one non-null row gives `True`; a multi-phase group whose only non-null row is on the **group** or on the **current phase** gives `True`.
- `test_hypothetical_result_has_empty_by_asset_class`: model on `test_hypothetical_with_assumptions_computes_pure_arithmetic_no_nav_lookup`; `by_asset_class == []` and `funds_data_available is True` (not applicable to hypotheticals, so the front end never shows the pre-2006 note for them).
**Checkpoint:** `"$PY" -m pytest tests/services/analytics/test_scenario_engine.py tests/services/analytics/test_scenario_asset_class.py -q ...` green, including the untouched `test_serving_loads_only_results_for_held_schemes`. `grep -n "float" app/services/analytics/scenario_engine.py app/services/analytics/scenario_asset_class.py` shows nothing new. Commit `feat(planning): T3 asset-class impact, member fund flags, data flag`. CHECKPOINT LINE.

---
# PB2

## T4: `member_id` on the results route
**Files:** `app/api/scenarios.py`, `test_scenarios_api.py`.
**Tests first** (model on `test_results_use_only_authenticated_household`; patch `app.services.analytics.scenario_engine.compute_holdings` with an async stand-in `async def fake(db, ids, **kwargs): return [r for r in ROWS if uuid.UUID(r.household_member_id) in ids]` so the filter is real; rows built with the `HoldingRow` constructor as `_holding_row` does; seed two `Scheme`s, one `Scenario`, two `ScenarioSchemeResult`s):
- `test_results_member_id_filters_to_one_member`: account with Self and Partner; Self holds fund 1 (1000.00, result -10.00), Partner fund 2 (2000.00, result +5.00). `?member_id=<partner>` gives `by_member` with only Partner, `rupee_impact == "100.00"`, `portfolio_impact_pct == by_member[0]["pct"] == "5.00"`, `by_asset_class` from Partner's fund only. Without `member_id`: both members, `rupee_impact == "0.00"` and `portfolio_impact_pct == "0.00"` (`(-100.00 + 100.00) / 3000.00`).
- `test_results_foreign_member_id_returns_404_without_detail`: a second account (`_authed_headers_and_member(client, "+919000000722")`) owns member X; the first account's `?member_id=X` is 404 with `detail == "Household member not found."`; the body contains neither X nor that member's name; `?member_id=<uuid4 that exists nowhere>` gives the **identical** status and body (assert `==` on `.json()`).
- `test_results_malformed_member_id_returns_422`.
- `test_results_without_member_id_returns_family_with_new_fields`: all members present; `by_asset_class` and `funds_data_available` present.
- `test_results_member_with_no_holdings_returns_zero_row_not_error`: a member with no funds: 200, `rupee_impact "0.00"`, `portfolio_impact_pct is None`, `by_asset_class == []`, `by_member[0]["funds"] == []`.
- `test_member_id_is_checked_after_the_scenario`: unknown scenario with a foreign `member_id` returns `"Scenario not found."` (no hint about the member), and a hidden hypothetical (flag off) with a member id still 404s as today.
- Existing `test_release_gate_queries_without_http_transport` stays green untouched (direct call without `member_id`).
**Implement:** `member_id: uuid.UUID | None = None` (plain default, difference 8). After the existing scenario and hidden checks: `if member_id is None: ids = [m.id for m in list_household_members(db, user.id)] else: require_member(db, user.id, member_id); ids = [member_id]`. Engine call unchanged otherwise.
**Checkpoint:** `"$PY" -m pytest tests/api/test_scenarios_api.py tests/services/analytics/test_scenario_engine.py -q ...` green. Commit `feat(planning): T4 member_id filter on the results route`.

## T5: stored prices for the results route
**Files:** `scenario_engine.py` (the two `compute_holdings(db, household_member_ids)` calls), `test_scenario_engine.py`.
**Step 1:** `grep -n "stored_only" app/services/dashboard/holdings.py` must show the parameter (baseline already checked). **Tests first:** `test_results_call_compute_holdings_with_stored_prices`: patch `scenario_engine.compute_holdings` with `AsyncMock(return_value=[])`; run `get_scenario_result_for_household` once for a historical scenario and once for a hypothetical scenario with one `ScenarioHypotheticalAssumption` (so the hypothetical branch reaches the call); assert `mock.await_count == 2` and every `await_args.kwargs == {"allow_stale_today": True, "stored_only": True}`. Second test `test_results_route_never_fetches_a_nav`: with the real `compute_holdings`, a scheme that has an `amfi_code` and **no** `NavHistory` row, and `app.services.dashboard.nav._fetch_nav_history` patched to raise `AssertionError("network")`, the result is produced (that holding unvalued, counted by the existing rule) and the patch is never hit.
**Implement:** add `allow_stale_today=True, stored_only=True` to both calls.
**Checkpoint:** whole `test_scenario_engine.py` green. Commit `feat(planning): T5 results use stored prices`.

## T6: staging timing script (prepared here, run by the OWNER)
**Files:** `scripts/measure_planning_staging.py` (new), `tests/scripts/test_measure_planning_staging.py` (new). Read `scripts/measure_benchmark_matrix.py` and `measure_home_staging.py` first; copy their header-docstring style, `WriteAttempted`, `is_write_statement`, `guard`, `ms`, one-event-loop `run_async`.
**Interface:** `time_call(fn, repeat: int) -> list[float]` (seconds; `fn` is a zero-argument async callable; element 0 is the cold call, the rest warm); `make_engine()` (`create_engine(make_url(settings.database_url))`, so tests can patch it); `measure(db, user_id, runs, scenarios) -> list[tuple[str, str, float, float]]`; `main(argv: list[str] | None = None) -> int`. CLI: `--user-id <uuid>` (required), `--runs 3`, `--scenarios 3`. No `--limit` verdict: the speed target is the owner's decision; the script prints numbers only (counts, member numbers, scenario ordinal and milliseconds; never names or amounts). Exit 0 on success, 1 when the user has no members, 2 on `WriteAttempted`.
**What it times:** for the first `--scenarios` top-level scenarios by `display_rank` (`parent_scenario_id IS NULL`, `display_rank IS NOT NULL`, ascending): `_async_get_scenario_result_for_household(db, scenario, all_member_ids)` (family) and then `[member_id]` for each member, each with `invalidate_holdings_cache(member_id)` for the members involved before the cold call, then `runs - 1` warm calls. A per-member call has its own cache entry, so it pays its own cold cost once (spec section 7); print that in the header. Print one row per (scenario, scope): cold s, warm median s.
**Tests first** (module loaded with `importlib` like `test_measure_benchmark_matrix.py`): `test_module_imports_without_side_effects` (no engine created, nothing printed); `test_time_call_returns_one_duration_per_repeat`; parametrised `test_reads_and_connection_housekeeping_are_not_writes` and `test_writes_are_detected` (same cases as the matrix script's tests); `test_guard_blocks_an_orm_flush` (in-memory session from the `db_session` fixture, `guard(db, counter)` attached, `db.add(Scenario(...)); db.flush()` raises `WriteAttempted`); `test_main_returns_2_when_a_write_is_attempted` (patch `make_engine` to return `db_session.get_bind()` and patch the module's `measure` to add and flush a row; `main(["--user-id", str(uuid.uuid4())])` returns 2 and the captured output says nothing was committed); `test_main_returns_1_without_members`.
**Do not run the script against any database in this task.**
**The block the OWNER runs on the VM** (paste in the report as final text, unchanged; **unverified until the orchestrator confirms the redesign backend is deployed there**, so the owner runs it only when told):
```
ssh deploy@202.66.174.251
cd /opt/unifolio-redesign/deploy/leapswitch
git branch --show-current            # expect: leapswitch-redesign (with this PR merged and --full deployed)
git log --oneline -1
sudo docker compose run --rm -T backend python scripts/measure_planning_staging.py --user-id <USER_UUID> --runs 3
echo $?
```
`<USER_UUID>` is the staging account used for the Home timing run. Good looks like: a table of cold and warm seconds per scenario and scope, exit `0`, no "write" message. Paste the full output back.
**Checkpoint:** `"$PY" -m pytest tests/scripts/test_measure_planning_staging.py -q ...` green; `"$PY" -c "import ast,sys; ast.parse(open('scripts/measure_planning_staging.py').read())"` no error. Commit `feat(planning): T6 staging timing script`.

## T7: golden fixtures, guard test and final verification
**Files:** `tests/api/planning_fixture.py`, `scripts/write_planning_fixtures.py`, `tests/api/test_planning_fixtures.py`, `tests/fixtures/planning/*.json`.
**Fixture household:** `planning_fixture.build_planning_fixture(variant="base"|"empty") -> HomeFixtureRuntime` calls `build_home_fixture(variant=...)` (Asha Rao self and Dev Rao spouse; latest-NAV values: Asha Large Cap `1210.00`, Asha Flexi Cap `990.00`, Dev Short Duration Debt `2002.00`, Dev Gold Fund `1010.00`, total `5212.00`) and then seeds scenarios and `ScenarioSchemeResult` rows through the `get_db` override with ids from `uid("scenario-a")` etc. Dates are fixed and **no scenario is ongoing or open-ended** (so nothing depends on `date.today()`; the PF-C lesson). Categories map Large and Flexi to Equity, Debt to Debt, Gold ETF to Gold and Silver. Scenarios (top-level names unique):
| Id | Name | Dates | Setup | Expected (orchestrator's hand arithmetic; **recompute yourself**) |
|---|---|---|---|---|
| a | Fixture scenario A | 2025-11-03 to 2025-12-31, CRASH, rank 1, `quick_market_pct` 0.43 | Large -38.00, Flexi -30.00, Debt +1.00 (real); Gold +8.00 stored `is_proxied True`, basis `asset_class_average:Gold` | rupee `-655.98`, covered and total `5212.00`, pct `-12.59`; Asha `-756.80` / `-34.40`, Dev `100.82` / `3.35`; groups Equity `-756.80`, `2200.00`, `-34.40`; Debt `20.02`, `2002.00`, `1.00`; Gold and Silver `80.80`, `1010.00`, `8.00`; benchmarks `[nifty_50 0.43]` (levels 10022 to 10065); `funds_data_available` true |
| b | Fixture scenario B | group 2025-11-03 to 2025-12-31 with phases 1 (to 2025-11-28) and 2 (from 2025-12-01), rank 2 | group: Large -20, Flexi -10, Debt 2, Gold 4 (Gold proxied); phase 1: -17, -8, 1.5, 3; phase 2 (current): -3, -2, 0.5, 1 | headline rupee `-260.56`, pct `-5.00`; groups use the group results (Equity `-341.00`, `2200.00`, `-15.50`; Debt `40.04`, `2002.00`, `2.00`; Gold and Silver `40.40`, `1010.00`, `4.00`); by-fund pcts are phase 2's; `benchmarks []`; two `phases` rows |
| c | Fixture scenario C | 2025-11-03 to 2025-12-31, rank 3, `had_redemption_freeze_schemes=["Dev Short Duration Debt"]`; set the Debt scheme's `amc_name` to `Franklin Templeton Mutual Fund` in the seeding step | Large -10, Flexi -8, Debt +1 (ignored: frozen), Gold +2 real | rupee `-180.00`, covered `3210.00`, pct `-5.61`; Debt absent from groups (Equity `-200.20`, `2200.00`, `-9.10`; Gold and Silver `20.20`, `1010.00`, `2.00`); Debt member row `is_frozen true`; `benchmarks []`; `no_data_funds 0` |
| d | Fixture scenario D | 2005-01-03 to 2005-06-30, rank 4 | no result rows at all | `portfolio_impact_pct null`, rupee `0.00`, covered `0.00`, total `5212.00`, `no_data_funds 4`, `by_asset_class []`, `funds_data_available false`, `benchmarks []`, member funds `is_proxied true`, basis `no_comparable_data` |
| e | Fixture scenario E | 2025-11-03 to 2025-12-31, rank 5, `description=""` | one result row | only used by the list fixture |
Scenarios a to e each get a non-empty description except e: `"Fixture description for scenario <letter>."`.
**Generator** `scripts/write_planning_fixtures.py` (same shape as `write_home_fixtures.py`: `FixtureSpec(path, variant)`, `REQUESTS`, `write_fixture_set(destination, *, write=True)`, paths formatted with `{a}` `{b}` `{c}` `{d}` scenario ids and `{asha}` `{dev}` member ids; deterministic, safe to re-run). Files in `tests/fixtures/planning/`: `scenarios_list_curated.json` (`GET /scenarios?curated=true`), `results_family_standard.json` (a), `results_member_dev.json` (a with `?member_id={dev}`), `results_family_multi_phase.json` (b), `results_family_freeze.json` (c), `results_family_no_fund_data.json` (d), `results_family_no_holdings.json` (a, variant `empty`: two members, `rupee_impact "0.00"`, `portfolio_impact_pct null`, `by_asset_class []`, `funds_data_available true`).
**Guard test** `tests/api/test_planning_fixtures.py`: (1) `test_generated_golden_fixtures_equal_live_routes`: **read-only** (`write=False`), the file set equals `REQUESTS` and the directory listing exactly, parsed JSON equals the live route output; (2) `test_planning_fixture_semantics`: asserts the hand numbers in the table above from the committed files (so a placeholder cannot return) and that every result file carries all keys of Appendix A, every money and percentage value is a `str` or `null` (walk the JSON; no number type for those keys), and `by_asset_class` bucket names are in `DISPLAY_GROUPS` in order; (3) `test_fixture_scenarios_are_date_stable`: no seeded scenario is `is_ongoing` or has `end_date None`. Generate with `"$PY" scripts/write_planning_fixtures.py`; **check the numbers in the table by your own arithmetic against the generated files before committing** and say in the report which you checked; if the real output differs from the table, stop and recheck both, do not adopt either blindly.
**Final verification (Step 2):** run, and record last lines of each:
```
"$PY" -m pytest tests/services/analytics/test_scenario_engine.py tests/services/analytics/test_scenario_asset_class.py tests/api/test_scenarios_api.py tests/api/test_planning_fixtures.py tests/scripts/test_measure_planning_staging.py -q -p no:cacheprovider --disable-warnings
"$PY" -m pytest tests/api tests/services/home tests/services/dashboard -q -p no:cacheprovider --disable-warnings      # must equal the baseline
git diff leapswitch-redesign...HEAD | grep -E '^\+' | grep -n 'float'                                                # expect: no output
git diff --name-only leapswitch-redesign...HEAD                                                                      # must be a subset of the file map
git diff --check leapswitch-redesign...HEAD
```
Commit `feat(planning): T7 golden fixtures and final verification`. Nothing pushed.

---
# Appendix A: Endpoint contract (end state; the Planning front end is built against this)
Illustrative values come from fixture scenario A (hand arithmetic; the generated `results_family_standard.json` is authoritative for values, this appendix for names, types and optionality). Money and percentages are **strings**; JSON key order is irrelevant; list order is as shown (`by_asset_class` always in the fixed group order; `by_member` in member creation order; `by_fund` and member `funds` in holdings order, which the front end must not rely on).
`GET /scenarios[?curated=true]` returns a list of summary rows; `GET /scenarios/{scenario_id}/results[?member_id=<uuid>]` returns:
```json
{
  "scenario": {
    "scenario_id": "…", "name": "Fixture scenario A", "description": "Fixture description for scenario a.",
    "scenario_type": "CRASH", "start_date": "2025-11-03", "end_date": "2025-12-31", "is_ongoing": false,
    "display_rank": 1, "parent_scenario_id": null, "has_phases": false, "had_redemption_freeze_schemes": null,
    "quick_market_pct": "0.43", "quick_equity_pct": null, "quick_debt_pct": null, "quick_weight_quarter": null
  },
  "portfolio_impact_pct": "-12.59", "rupee_impact": "-655.98", "covered_value": "5212.00", "total_value": "5212.00",
  "no_data_funds": 0,
  "benchmarks": [{ "name": "nifty_50", "pct": "0.43" }],
  "phases": [],
  "by_fund": [{ "scheme_id": "…", "scheme_name": "Asha Large Cap", "pct": "-38.00", "is_proxied": false, "proxy_basis": null, "is_frozen": false }],
  "by_member": [
    { "household_member_id": "…", "member_name": "ASHA RAO", "rupee_impact": "-756.80", "pct": "-34.40",
      "funds": [{ "scheme_id": "…", "scheme_name": "Asha Large Cap", "rupee_impact": "-459.80",
                  "is_proxied": false, "proxy_basis": null, "is_frozen": false }] },
    { "household_member_id": "…", "member_name": "Dev Rao", "rupee_impact": "100.82", "pct": "3.35",
      "funds": [{ "scheme_id": "…", "scheme_name": "Dev Gold Fund", "rupee_impact": "80.80",
                  "is_proxied": true, "proxy_basis": "asset_class_average:Gold", "is_frozen": false }] }
  ],
  "hypothetical_assumptions": [], "assumptions_not_set": false,
  "by_asset_class": [
    { "bucket": "Equity", "rupee_impact": "-756.80", "covered_value": "2200.00", "pct": "-34.40" },
    { "bucket": "Debt", "rupee_impact": "20.02", "covered_value": "2002.00", "pct": "1.00" },
    { "bucket": "Gold and Silver", "rupee_impact": "80.80", "covered_value": "1010.00", "pct": "8.00" }
  ],
  "funds_data_available": true
}
```
**New fields and their rules** (everything else is unchanged from today):
- `scenario.description: string`, may be `""` (the page must render a card without a description line).
- `by_member[].funds[].is_proxied: boolean`, `.proxy_basis: string | null` (`"sebi_category_average:<group>"`, `"asset_class_average:<bucket>"`, `"no_comparable_data"`, or null for real data), `.is_frozen: boolean`: the same values as the matching `by_fund` row (current phase for multi-phase). A frozen fund's `rupee_impact` is `null`. `by_fund` stays in the response; the new page does not render it.
- `by_asset_class[]`: groups from `Equity, Hybrid, Debt, Gold and Silver, Overseas, Other`, always in that order, groups with no valued fund omitted; `rupee_impact` = sum of the member-fund `rupee_impact` strings in the group; `covered_value` = sum of those funds' current values; `pct` = rupee impact over covered value x 100, 2 dp (`null` only if covered is zero, which the route does not produce). Frozen funds and funds with no data are in neither sum, so the groups need not add up to `total_value`; they add up to `rupee_impact` and `covered_value`. Multi-phase: built from the headline (whole-event) results. Empty list for hypothetical results, for a household with nothing valued, and when no fund has data.
- `funds_data_available: boolean`: false only when no stored per-fund result for the scenario (or its current phase) has a percentage, i.e. the pre-2006 style scenario; true otherwise and always true for hypotheticals.
- `member_id` (query, optional, UUID): omitted gives the whole household; given gives that member only (`by_member` has one entry; every total, `by_asset_class` and `phases` are for that member). Errors: `401` unauthenticated; `404 {"detail": "Scenario not found."}` unknown or hidden scenario (checked first); `404 {"detail": "Household member not found."}` for a member id that is not the signed-in account's (identical body for an id that exists nowhere); `422` FastAPI's default body for a malformed UUID. A member of the account with no holdings returns `200` with zero totals and empty lists.
- Prices come from the stored NAV rows (no live download): a result can use the previous day's prices until the 06:00 IST job runs. Not flagged in this response.

---
# Report template (fill in at the end, one fenced block; paste the CHECKPOINT LINES verbatim)
```
CLAUDE REPORT — ui-redesign — PB1+PB2
Run date/time:    Environment: WSL, Python 3.14, ~/wt/planning-be    Base HEAD (leapswitch-redesign):
0. BASELINE: git log -8 output; marker files and stored_only grep; both baseline pytest lines (counts):
1. CHECKPOINT T1: <sha> | RED: <test names seen failing> | GREEN: <command> -> <N passed> | files: <list>
   CHECKPOINT T2: ...   CHECKPOINT T3: ...   CHECKPOINT T4: ...   CHECKPOINT T5: ...   CHECKPOINT T6: ...   CHECKPOINT T7: ...
2. FINAL VERIFICATION (T7 Step 2): last lines of each command; float grep output; name-only diff vs file map:
3. FIXTURES: which numbers were hand-checked and the arithmetic; any difference from the Appendix or the T7 table:
4. DEVIATIONS (mechanics only) and plan/code differences hit beyond the listed ones:
5. FINDINGS (existing-code observations, e.g. anything odd in the engine):
6. OPEN QUESTIONS / BLOCKERS (stop points hit):
7. SELF-REVIEW (what a reviewer would attack: ownership check, group sums, zero-value handling, multi-phase, stored prices):
8. CONFIRMATIONS: no push or history rewrite: ___  Full suites not run: ___  Edits only inside the file map: ___  Nothing outside `backend/` changed: ___  Script T6 not run against any database: ___
9. VM BLOCK for the owner (T6), verbatim:
```

# Orchestrator notes (not for the worker)
- **Do first:** confirm PRs #10, #12 and #15 are merged into `leapswitch-redesign` and that #10's head includes HB8 (`d6aba974` was local-only, one commit ahead of `origin/feat/home-snapshot` when this was written); tell the owner the worker may start. Planning does not depend on HB8, but the baseline command does.
- **Decisions I took where the plan was silent or inconsistent (veto-able, add to the register as C-numbers):** (1) `stored_only=True` plus `allow_stale_today=True`, matching Home (differences 1); this changes the old classic scenario screen and mobile too, since the route is shared: they now show the last stored NAV instead of triggering a download (L31 in the planning workbook; one line for the owner). (2) 404 body for member ids uses `require_member`'s wording, not the plan's "Member not found." (difference 3). (3) Zero-value holdings create no asset-class group and zeros are never signed in the new strings (difference 7). (4) `funds_data_available` is `true` for hypotheticals. (5) Golden fixtures added (T7) although the plan has none.
- **Extra gaps worth a reviewer's attention:** a per-member call recomputes holdings (its own cache entry) instead of filtering the family call; accepted per spec section 7, measured by T6. The timing script times only the first three curated scenarios, not a multi-phase one; add one if the owner wants the worst case. The VM block assumes `/opt/unifolio-redesign` and `--full` deploys the backend (from `deploy-redesign.sh` comments): unverified, check before handing it over. The plan's V3 and V4 verification items (size of the Other group on real funds, descriptions on staging) are not covered here; do them at I2.
- **After the run:** verify (scope check against the file map, the three scenario test files plus fixtures, an independent differential check of group sums against `rupee_impact`/`covered_value`, a mutation check on the ownership check, the zero-sign rule and the `stored_only` kwarg), then a Sonnet review of the PR; front end packet PL1 takes `tests/fixtures/planning/*.json` by copy (guard test as C93). Append the run's record here, update `delegation-log.md` and the register in the run's docs commit, and ask the owner before any push or merge.

# Prompt for the owner to paste into the terminal (Claude Code, Sonnet, WSL)
```
You are the implementation worker for Unifolio runs PB1 and PB2 (Planning backend). Read this file completely first, then follow it exactly:
~/wt/docs/Docs/orchestration/ui-redesign-PB-planning-backend-handoff.md
Set up the worktree ~/wt/planning-be on branch feat/planning-backend as the "Set-up and baseline" section says, run the baseline commands and stop if anything is red. Then do T1 to T7 in order: tests first and seen failing, one commit per task (feat(planning): T<n> ...), a CHECKPOINT LINE after every commit.
Rules: only the files in the file map; no push, no amend, no history rewrite; Decimal never float; additive changes only; no live network; run only the test files the handoff names, with the shared venv /mnt/d/Unifolio code/backend/.venv/bin/python.
If the code disagrees with the handoff beyond its "Differences" section, or a stop condition is hit, stop and report instead of improvising.
Do not run measure_planning_staging.py against any database. At the end print the filled report block from the handoff, including the VM block for the owner.
```
