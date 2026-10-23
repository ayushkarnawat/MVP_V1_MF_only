# Planning (market scenarios) Backend Implementation Plan

> **For agentic workers:** execution method chosen by the owner (23 Oct): the **claude-codex method** of the `model-orchestration` skill (Claude orchestrates; Codex implements and self-tests; one handoff doc per delegated task under `Docs/orchestration/`; mandatory adversarial review before a task is `DONE`; the orchestrator does all staging, commits and merges, and only on the owner's word). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the additive scenario-API fields and the optional member filter that the Planning page needs, with no new table, migration or job.

**Architecture:** Extend the existing scenario result row (`description`, `by_asset_class`, member-fund flags, `funds_data_available`) from the loop the engine already runs; add an optional `member_id` to the results route with an ownership check; pass Home's stored-price setting to `compute_holdings`; add a read-only staging timing script.

**Tech Stack:** FastAPI, SQLAlchemy, Pydantic, pytest, `Decimal` for all money and percentages.

**Spec:** `Docs/orchestration/2026-10-23-planning-scenarios-functionality-backend-spec.md` (sections 4 to 8), `2026-10-23-planning-scenarios-backend-decisions-proposal.md` (PD1 to PD8), `2026-10-23-planning-scenarios-tdd.md` section 1. Decisions L1 to L44 in `2026-10-23-planning-scenarios-decisions-v1.html`.

**Branch:** `feat/planning-scenarios` (backend part). Touches only `backend/app/services/analytics/{schemas,scenario_engine,scenario_asset_class}.py`, `backend/app/api/scenarios.py`, `backend/scripts/measure_planning_staging.py` and their tests. No commit or push without the owner's word: every task ends in a checkpoint, not a commit.

## Global Constraints

- `Decimal`, never `float`, for every money and percentage value in the money path; values leave the API as strings.
- Additive only: no field is removed or renamed; `by_fund` stays in the response (mobile and the old screen read it). Every new schema field has a default so existing constructors and fixtures keep working.
- No migration, no new table, no new job, no new dependency.
- A `member_id` that does not belong to the signed-in account returns **404** with no detail that reveals it exists.
- `SCENARIO_HYPOTHETICALS_ENABLED` behaviour is unchanged; hypothetical results get an empty `by_asset_class`.
- No live network in tests. Run only the test files a task touches.
- Existing assertions that compare whole response dicts are updated for the added fields only.

## Review Focus

- A `member_id` that belongs to another account: 404, same body as an unknown scenario, never the other household's numbers (Task 4).
- A member with holdings but every fund frozen or without data: tiles-ready result with `by_asset_class == []` and no division by zero (Task 3).
- A fund whose bucket is a value the mapping has not seen (for example a future bucket name): lands in `Other`, never a `KeyError` (Task 2).
- A multi-phase scenario: asset-class totals use the headline (cumulative) results, while the current phase drives `by_fund` as today (Task 3).
- A scenario row with an empty description string: the list endpoint still returns it (Task 1).

## File Structure

| File | Responsibility |
|---|---|
| `backend/app/services/analytics/schemas.py` | new fields and `ScenarioAssetClassRow` |
| `backend/app/services/analytics/scenario_asset_class.py` | `DISPLAY_GROUPS`, `display_group` |
| `backend/app/services/analytics/scenario_engine.py` | description in summary, `by_asset_class`, member-fund flags, `funds_data_available`, stored-price pass-through |
| `backend/app/api/scenarios.py` | optional `member_id` with ownership check |
| `backend/scripts/measure_planning_staging.py` | read-only timing of the results route |

## Dependencies

Task 5 needs Home backend plan **T1** (`allow_stale_today` on `compute_holdings`) merged. Tasks 1 to 4 and 6 do not.

---

### Task 1: Schema fields and summary description

**Files:**
- Modify: `backend/app/services/analytics/schemas.py` (the `ScenarioSummaryRow`, `ScenarioMemberFundResult`, `ScenarioResultRow` classes near line 433 to 505)
- Modify: `backend/app/services/analytics/scenario_engine.py` (`get_scenario_summary`, line 264)
- Test: `backend/tests/services/analytics/test_scenario_engine.py`, `backend/tests/api/test_scenarios_api.py`

**Interfaces:**
- Produces (used by Tasks 3 and 4 and the frontend plan):
  - `ScenarioSummaryRow.description: str = ""`
  - `ScenarioMemberFundResult.is_proxied: bool = False`, `.proxy_basis: str | None = None`, `.is_frozen: bool = False`
  - `class ScenarioAssetClassRow(BaseModel): bucket: str; rupee_impact: str; covered_value: str; pct: str | None`
  - `ScenarioResultRow.by_asset_class: list[ScenarioAssetClassRow] = []`, `.funds_data_available: bool = True`

- [ ] **Step 1: Write the failing tests**
  - `test_get_scenario_summary_includes_description` in `test_scenario_engine.py`: build a scenario with `description="Global markets fell sharply."`, assert `get_scenario_summary(db, s).description == "Global markets fell sharply."`.
  - `test_list_scenarios_includes_description_even_when_empty` in `test_scenarios_api.py`: seed one scenario with `description=""`, `GET /scenarios` returns 200 and the row has `"description": ""`.
- [ ] **Step 2: Run to verify they fail** (`AttributeError` or missing key). Run: `cd backend && pytest tests/services/analytics/test_scenario_engine.py -k description -v` and `pytest tests/api/test_scenarios_api.py -k description -v`.
- [ ] **Step 3: Implement** the fields above in `schemas.py`; in `get_scenario_summary` pass `description=scenario.description`.
- [ ] **Step 4: Run both again; expected PASS.** Also run the whole two files once to see which existing whole-dict assertions need the new fields; update only those.
- [ ] **Step 5: Checkpoint** (no commit without the owner's word): `git status` shows only the files above.

### Task 2: Display-group mapping

**Files:**
- Modify: `backend/app/services/analytics/scenario_asset_class.py`
- Test: `backend/tests/services/analytics/test_scenario_asset_class.py`

**Interfaces:**
- Produces: `DISPLAY_GROUPS: tuple[str, ...] = ("Equity", "Hybrid", "Debt", "Gold and Silver", "Overseas", "Other")` and `display_group(bucket: str) -> str`.
- Mapping (the nine values `underlying_asset_class` returns, verified by reading it): `Equity` and `Index/ETF` to Equity (generic index funds and ETFs track Indian equity indices); `Hybrid` to Hybrid; `Debt-short` and `Debt-long` to Debt; `Gold` and `Silver` to Gold and Silver; `Overseas` to Overseas; `Other` and any unknown string to Other.

- [ ] **Step 1: Write the failing test** `test_display_group_maps_every_engine_bucket` (parametrised over the nine values above plus `"Crypto"`, expecting `"Other"` for the last) and `test_display_groups_order_is_fixed` (asserts the tuple equals the one above).
- [ ] **Step 2: Run to verify it fails.** Run: `cd backend && pytest tests/services/analytics/test_scenario_asset_class.py -k display -v`. Expected: FAIL (`ImportError`).
- [ ] **Step 3: Implement** both names in `scenario_asset_class.py` with a dict lookup and `.get(bucket, "Other")`. Comment why `Index/ETF` is Equity (one line).
- [ ] **Step 4: Run; expected PASS.**
- [ ] **Step 5: Checkpoint.**

### Task 3: Engine, `by_asset_class`, member-fund flags, `funds_data_available`

**Files:**
- Modify: `backend/app/services/analytics/scenario_engine.py` (the non-hypothetical path of `_async_get_scenario_result_for_household`, lines about 370 to 460; the hypothetical return at about 395 keeps the defaults)
- Test: `backend/tests/services/analytics/test_scenario_engine.py` (reuse its helpers `_session`, `_household_member`, `_holding_row`, `_holdings`, `_add_navs`; model on `test_household_pct_is_weighted_by_its_own_holdings`)

**Interfaces:**
- Consumes: `display_group`, `DISPLAY_GROUPS`, `underlying_asset_class` (Task 2), the new schema fields (Task 1).
- Produces: `ScenarioResultRow.by_asset_class` ordered by `DISPLAY_GROUPS`, empty groups omitted; `ScenarioResultRow.funds_data_available`; `ScenarioMemberFundResult` rows carrying `is_proxied`, `proxy_basis`, `is_frozen` copied from the same fund's `ScenarioSchemeResult` and frozen set.
- Rules: in the existing `for holding in holdings` loop, when `pct is not None` add `rupee_impact` to `group_rupee[group]` and `current_value` to `group_covered[group]` (group from `display_group(underlying_asset_class(scheme.sebi_category or "", scheme.name))` using `held_schemes`); frozen and no-data funds are in neither sum. `pct = (rupee / covered * 100).quantize(Decimal("0.01"))`, `None` when `covered == 0`. `funds_data_available` is true when any `ScenarioSchemeResult` row for `scenario.id` or `serving_scenario.id` has a non-null `pct_change`.

- [ ] **Step 1: Write the failing tests** (names and assertions):
  - `test_by_asset_class_sums_rupee_impact_into_display_groups`: two equity funds and one debt fund held by two members; assert the Equity row's `rupee_impact` equals the sum of the two funds' `rupee_impact` strings, `covered_value` equals the sum of their values, `pct` equals rupee over covered rounded to 2 dp, and groups come in `DISPLAY_GROUPS` order.
  - `test_by_asset_class_excludes_frozen_and_no_data_funds`: a frozen fund and a fund with no result are in no row.
  - `test_by_asset_class_empty_when_no_fund_has_data`: all funds no-data; `by_asset_class == []`, `portfolio_impact_pct is None`, no exception.
  - `test_by_asset_class_multi_phase_uses_headline_results`: parent with two phases; group sums equal the headline (parent) results, not the current phase's.
  - `test_member_fund_rows_carry_proxy_and_frozen_flags`: proxied fund has `is_proxied True` and its `proxy_basis`; frozen fund has `is_frozen True`; a real-data fund has both False.
  - `test_funds_data_available_false_without_results_and_true_with_one`.
  - `test_hypothetical_result_has_empty_by_asset_class`.
- [ ] **Step 2: Run to verify they fail.** Run: `cd backend && pytest tests/services/analytics/test_scenario_engine.py -k "asset_class or flags or funds_data" -v`. Expected: FAIL.
- [ ] **Step 3: Implement** the accumulation and the new fields in the engine function; the by-member fund rows are built where `ScenarioMemberFundResult(...)` is created today. One `db.query(...).first()` for `funds_data_available`.
- [ ] **Step 4: Run the new tests and then the whole file; expected PASS** (existing tests unchanged except added fields).
- [ ] **Step 5: Checkpoint.**

### Task 4: `member_id` on the results route

**Files:**
- Modify: `backend/app/api/scenarios.py` (`get_scenario_results`)
- Test: `backend/tests/api/test_scenarios_api.py` (model on `test_results_use_only_authenticated_household`, which already seeds a second household)

**Interfaces:**
- Consumes: `list_household_members(db, user.id)`, `_async_get_scenario_result_for_household(db, scenario, ids)`.
- Produces: `GET /scenarios/{scenario_id}/results?member_id=<uuid>`; omitted keeps today's behaviour.

- [ ] **Step 1: Write the failing tests**:
  - `test_results_member_id_filters_to_one_member`: with two members, `?member_id=<first>` returns `by_member` with only that member and `portfolio_impact_pct` equal to that member's `pct`.
  - `test_results_foreign_member_id_returns_404_without_detail`: another account's member id returns 404 with `detail == "Member not found."`, and the response text contains neither that member's name nor its id; an id that does not exist at all returns the identical response.
  - `test_results_malformed_member_id_returns_422`.
  - `test_results_without_member_id_matches_family_result` (all members present, new fields present).
  - `test_results_member_with_no_holdings_returns_zero_row_not_error`: a member of the account with no funds returns 200, `rupee_impact == "0.00"`, `by_asset_class == []`.
- [ ] **Step 2: Run to verify they fail.** Run: `cd backend && pytest tests/api/test_scenarios_api.py -k member_id -v`. Expected: FAIL.
- [ ] **Step 3: Implement** `member_id: uuid.UUID | None = None` (query parameter) on `get_scenario_results`; after `members = list_household_members(...)`, if `member_id` is given and not among `[m.id for m in members]` raise `HTTPException(404, detail="Member not found.")`; pass `[member_id]` else all ids. Order of checks: scenario existence and hidden-hypothetical first (unchanged), then member.
- [ ] **Step 4: Run; expected PASS.** Then run the whole file.
- [ ] **Step 5: Checkpoint.**

### Task 5: Stored prices for the results route (blocked on Home T1)

**Files:**
- Modify: `backend/app/services/analytics/scenario_engine.py` (the two `compute_holdings(db, household_member_ids)` calls inside `_async_get_scenario_result_for_household`)
- Test: `backend/tests/services/analytics/test_scenario_engine.py`

**Interfaces:**
- Consumes: `compute_holdings(db, ids, allow_stale_today: bool = False)` from Home backend plan T1.

- [ ] **Step 1: Confirm the dependency.** Run: `grep -n allow_stale_today backend/app/services/dashboard/holdings.py`. Expected: the parameter is present. If it is not, stop and tell the owner (G7 option b is then the fallback; do not invent the parameter here).
- [ ] **Step 2: Write the failing test** `test_results_call_compute_holdings_with_allow_stale_today`: monkeypatch `scenario_engine.compute_holdings` with an async stub that records kwargs and returns `[]`; call the engine for one historical and one hypothetical scenario; assert both calls received `allow_stale_today=True`.
- [ ] **Step 3: Run to verify it fails.** Run: `cd backend && pytest tests/services/analytics/test_scenario_engine.py -k allow_stale -v`. Expected: FAIL.
- [ ] **Step 4: Implement:** pass `allow_stale_today=True` in both calls.
- [ ] **Step 5: Run the whole engine test file; expected PASS.** Checkpoint.

### Task 6: Staging timing script

**Files:**
- Create: `backend/scripts/measure_planning_staging.py`
- Test: `backend/tests/scripts/test_measure_planning_staging.py`

**Interfaces:**
- Produces: `main(argv: list[str] | None = None) -> int` and `time_call(fn, repeat: int) -> list[float]` (seconds, first call is the cold one). Read `backend/scripts/measure_home_staging.py` first and copy its argument names, its read-only guard (including the check that caught the NAV cache insert) and its `--simulate-fresh-cache` flag; this script differs only in what it times.
- Times, for each household found and for the first three scenarios by `display_rank`: the family result, then each member's result (`_async_get_scenario_result_for_household` with all ids, then `[member_id]`), cold then warm, printing a table of seconds.

- [ ] **Step 1: Write the failing tests** (model on the Home script's tests if `backend/tests/scripts/test_measure_home_staging.py` exists): `test_module_imports_without_side_effects`, `test_time_call_returns_one_duration_per_repeat`, `test_main_refuses_when_a_write_is_attempted` (patch a session `commit` to raise and assert exit code non-zero with a clear message).
- [ ] **Step 2: Run to verify they fail.** Run: `cd backend && pytest tests/scripts/test_measure_planning_staging.py -v`. Expected: FAIL (`ModuleNotFoundError`).
- [ ] **Step 3: Implement** the script as above.
- [ ] **Step 4: Run; expected PASS.** Do not run the script against any database in this task. The owner runs it on the VM and pastes the output; plans for the frontend do not wait for it, the owner's decision on the speed target does.
- [ ] **Step 5: Checkpoint.**

### Task 7: Final verification

- [ ] **Step 1:** Run `cd backend && pytest tests/services/analytics/test_scenario_engine.py tests/services/analytics/test_scenario_asset_class.py tests/api/test_scenarios_api.py tests/scripts/test_measure_planning_staging.py -v`. Expected: all PASS.
- [ ] **Step 2:** `grep -rn "float(" backend/app/services/analytics/scenario_engine.py backend/app/services/analytics/scenario_asset_class.py` returns no new `float` in the money path (compare against `git diff`).
- [ ] **Step 3:** Report to the owner: files changed, tests run, Task 5 status (blocked or done), and that nothing is committed.

## Self-Review

Spec coverage: description (T1), `member_id` and 404 (T4), `by_asset_class` and groups (T2, T3), member-fund flags (T3), `funds_data_available` (T3), stored prices (T5), timing script (T6), additive and mobile-safe (Global Constraints, T1 defaults). The spec said unknown buckets go to Other; reading the helper showed a ninth value, `Index/ETF`, which this plan maps to Equity (spec section 5 amended to match). No placeholder steps; names are consistent across tasks (`display_group`, `DISPLAY_GROUPS`, `ScenarioAssetClassRow`, `by_asset_class`, `funds_data_available`).
