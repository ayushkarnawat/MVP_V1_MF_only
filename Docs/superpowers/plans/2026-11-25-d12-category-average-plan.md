# D-12: the category average and the rank use the same funds at every period: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. Read `Docs/orchestration/wave-common-rules.md` and the master plan `Docs/superpowers/plans/2026-11-25-qa-patches-master-plan.md` first; they win where they differ. Strategy as in M1 to M4 and the XIRR batch: **Claude orchestrates, Codex builds (this plan is back end only), Antigravity is not used.**

**Goal:** At 1 year the "Category average covers N funds" count and the "rank X of N" count come from the same set of funds, for every held fund, while 3Y and 5Y stay as they are.

**Architecture:** One shared function builds "who is in the pool" and each fund's period returns, short-history funds included; both the rank loader and the average loader call it. The average then picks members per period (a fund joins the 1Y average if it has a 1Y return, the 3Y average if it has a 3Y return, and so on) instead of dropping every fund without a 3-year return from every period. The blended single figure keeps its 3-year rule. No schema, route or migration change.

**Tech Stack:** Python 3.14, SQLAlchemy, pytest.

**Spec:** `Docs/orchestration/2026-11-24-head-of-family-d11-plan.html` (page version 16), item "1 · D-12", decision **QA-12 A**. Root cause (read in the code): the rank loader asks for peers including short-history funds (`include_short_history=True`, `performance_ranking.py` ~L65) while the average loader does not (`category_ranking.py` ~L327) and then drops every fund without a 3Y return from every period (`category_period_weighted_averages` ~L285 and `category_period_averages` ~L242). The earlier change-requests plan chose that 3-year floor on purpose; the M2 promise was identical pools; the owner chose identical pools.

## Global Constraints

- **Number gate (owner, 25 Nov):** the 1-year average percentage **will move** (newer funds join it). The owner sees a read-only before and after on real data **before the patch deploys** (Task 3). 3Y and 5Y counts and values do not change.
- **Expected counts on the owner's five examples** (they must hold after the change): HDFC Flexi Cap 1Y pool 42; Axis Midcap 30; ICICI Large Cap 32; Nippon Small Cap 30; Kotak Flexi Cap 42 (equal to the rank counts; today the average says 37, 28, 30, 25, 37).
- The blended single average and `thin_category` (`period_averages["3y"].peers < 5`) keep their meaning. A held fund with no 3Y return still reads "Not enough history" exactly as today.
- Back end only, additive; **no migration (Alembic 0054)**; no response field or wording change (the card text "Category average covers N funds (1Y), N (3Y), N (5Y)" is unchanged). Stored results (`analytics_sections`: `category_ranking` and `ranking`) are rebuilt after the deploy (master plan Task M3).
- `Decimal`, never `float`; invented data only in tests; no real fund-holder data in the repository. Tests first; run only the affected tests; red test files are fixed once written. Codex does not run async or `TestClient` tests in its sandbox (it writes them, tries once, reports BLOCKED; Claude runs them).

## Review Focus

1. **A fund with 1 to 3 years of history:** in the 1Y rank pool and the 1Y average pool, in neither the 3Y nor the 5Y pool; its own row elsewhere reads "Not enough history" for 3Y and 5Y. [Task 1]
2. **A fund whose 1Y return exists but whose end NAV is missing or stale:** in no pool, in both loaders alike. [Task 1]
3. **IDCW and Growth plan twins and index funds:** the plan and index filters give the same members to both loaders (the existing `get_category_peers` and index rules are untouched). [Task 1]
4. **A category with fewer than five funds at 3Y but more at 1Y:** `thin_category` still follows the 3Y count. [Task 1]
5. **The Excel and diff scripts:** a 1Y-only fund is no longer written to the "Excluded" sheet with "no 3-year history" for the 1Y period; the reasons stay per period. [Task 2]
6. **Cache reuse:** the process cache holds both the legacy and the all-periods dicts; asking for either must not change the other's contents. [Task 1]

## File Structure

| File | Responsibility |
|---|---|
| `backend/app/services/analytics/category_ranking.py` | New `load_peer_returns` and `period_members`; `load_category_pool` and the two average functions use per-period membership |
| `backend/app/services/analytics/performance_ranking.py` | `load_ranking_pools` builds its pools from the same shared function |
| `backend/scripts/category_average_diff_report.py`, `export_category_average_excel.py` | Follow the new rule (their local copies of the floor change) |
| `backend/scripts/category_pool_before_after.py` (new) | Read-only old-versus-new table for one household's held funds (the number gate) |
| `backend/tests/services/analytics/test_category_average_checks.py`, `test_category_ranking.py`, `test_performance_ranking.py`, `test_period_consistency.py`; `backend/tests/scripts/test_category_average_diff_report.py`, `test_export_category_average_excel.py`, `test_category_pool_before_after.py` (new) | Tests |

## Lanes, branches and folders (confirm each path when the handoff is written)

| Lane | Tasks | Worker | Folder | Branch |
|---|---|---|---|---|
| BE | 1, then 2 | Codex | `C:\Users\Dell\lanes\unifolio-d12-be` (new worktree) | `batch/d12-be` |
| Claude | 0, 3, 4 (no product code) | Claude | `C:\Users\Dell\lanes\unifolio-d12` (integration worktree) | `batch/d12` |
Handoff and packet rules: master plan. No Antigravity packet in this plan.

## Task 0: Wave-start check (Claude)

- [ ] **Step 1:** cut `batch/d12` from the current `patch/qa1`; create the Codex folder; merge `leapswitch-redesign` into the worker branch before relaying.
- [ ] **Step 2: Confirm the code still looks as described:** `load_category_pool(db, scheme, today) -> CategoryPool` (~L322-347) calls `_category_returns_detailed(..., cache_key=("peers", *key))` without `include_short_history`; `category_period_weighted_averages(detailed, aaum_by_scheme) -> dict[str, CategoryAverage]` (~L279-291) floors on `values[1]`; `category_period_averages(detailed)` (~L233-247) floors at ~L242; `_legacy_average_from_periods(averages)` (~L303) reads the 3y and 5y entries; `load_ranking_pools(db, scheme, today) -> RankingPools` (~L57-72); `RankingPools.pools: dict["1Y"|"3Y"|"5Y", dict[UUID, Decimal]]`.
- [ ] **Step 3: Record the baseline:** run `test_category_average_checks.py`, `test_category_ranking.py`, `test_performance_ranking.py`, `test_period_consistency.py`, `backend/tests/scripts/test_category_average_diff_report.py`, `test_export_category_average_excel.py`; note which pass.

## Task 1: One pool, per-period membership (Codex, lane BE)

**Files:**
- Modify: `backend/app/services/analytics/category_ranking.py`, `backend/app/services/analytics/performance_ranking.py`
- Test: `test_category_average_checks.py`, `test_category_ranking.py`, `test_performance_ranking.py`, `test_period_consistency.py`

**Interfaces:**
- Produces:
  ```python
  # category_ranking.py
  PeriodReturns = tuple[Decimal | None, Decimal | None, Decimal | None, Decimal | None]   # (r1, r3, r5, blended)
  class PeerReturns(NamedTuple):
      peers: CategoryPeers                        # the existing type from get_category_peers
      detailed: dict[uuid.UUID, PeriodReturns]    # every active, same-category, same-plan peer with at least one period return, short-history peers included
  async def load_peer_returns(db: Session, scheme: Scheme, today: date) -> PeerReturns
  def period_members(detailed: Mapping[uuid.UUID, PeriodReturns], period: Literal["1Y", "3Y", "5Y"]) -> dict[uuid.UUID, Decimal]
  ```
  `period_members` returns the funds whose return for that period is not None. `CategoryPool` keeps its four fields; `CategoryPool.detailed` now includes short-history funds; `RankingPools` is unchanged.
- **Rule (decided; the signatures and tests fix the rest):** `load_peer_returns` is the one place that decides pool membership (active, canonical category, plan match, end NAV present), calling `_category_returns_detailed(..., include_short_history=True)`; `load_category_pool` applies the average's index rule (`is_index_fund(peer) == held_is_index`) on top of it, `load_ranking_pools` applies its own (`not _is_index(s)`) exactly as today. `category_period_weighted_averages` and `category_period_averages` build each period's average over `period_members(detailed, period)` (the weighting and `funds_without_size` logic per period are unchanged). `_legacy_average_from_periods` still returns None when the 3y average is None.

- [ ] **Step 1: Write the failing tests** (names fixed). `test_category_average_checks.py`: `test_average_pool_includes_one_year_only_funds_in_the_1y_period` (a peer with 14 months of NAV: 1Y average members equal the 1Y rank pool and `averages["1y"].peers == len(rank pool)`), rewrite `test_three_year_floor_excludes_short_history_from_all_periods` (L114) as `test_short_history_fund_joins_only_the_periods_it_has` (the 1Y average includes it; the 3Y and 5Y averages and counts are unchanged), extend `test_rank_pool_and_average_pool_hold_the_same_funds` (L264) with a short-history peer from a new helper `seed_short_history_peer(...)` beside `seed_pool`, add `test_legacy_blended_average_still_uses_the_3y_floor` and `test_thin_category_follows_the_3y_count`. `test_category_ranking.py`: rewrite `test_fund_under_3_years_is_left_out_of_every_period` (L753) as `test_fund_under_3_years_is_in_the_1y_period_only`; check the neighbours at L736 and L744 and adjust only if they pin the old floor. `test_period_consistency.py`: `test_rank_total_equals_average_peers_for_every_period_with_short_history_peer` (through `compute_category_ranking` and `compute_performance_ranking`). `test_performance_ranking.py`: `test_ranking_pools_are_unchanged_by_the_shared_loader` (the existing fixtures give the same `pools`). Held-fund behaviour: `test_held_fund_under_three_years_still_reads_not_enough_history`. Hygiene: `test_period_members_drops_none_values_per_period` and `test_peer_returns_cache_keeps_legacy_and_all_periods_dicts_separate`.
- [ ] **Step 2: Run them; expected red** (these are service-level; run `pytest backend/tests/services/analytics/test_category_average_checks.py backend/tests/services/analytics/test_category_ranking.py -q`; async ones that stall are written, tried once and reported BLOCKED; Claude runs them).
- [ ] **Step 3: Implement** `load_peer_returns`, `period_members`, the per-period averages and the two loaders to the contract; one comment where the floor was: "Pools are per period so the average and the rank always count the same funds (owner, 25 Nov 2026, QA-12 A); the 3-year rule survives only in the blended figure."
- [ ] **Step 4: Claude runs the affected files and `ruff`; expected green.** Claude also runs the wider `backend/tests/services/analytics/` directory once to catch pinned old-floor tests elsewhere.
- [ ] **Step 5: Claude verifies the diff against the allowed list and commits** `fix(analytics): the category average uses the rank's pool per period`.

## Task 2: The scripts follow the rule; the before-and-after script (Codex, lane BE, after Task 1)

**Files:**
- Modify: `backend/scripts/category_average_diff_report.py` (the floor at ~L40 and the local `_local_returns` at ~L92-102), `backend/scripts/export_category_average_excel.py` (`_write_group` ~L382-425: pools and "Excluded" reasons per period; the "Counts (3Y floor)" column heading and its test), `backend/tests/scripts/test_category_average_diff_report.py`, `backend/tests/scripts/test_export_category_average_excel.py`
- Create: `backend/scripts/category_pool_before_after.py`, `backend/tests/scripts/test_category_pool_before_after.py`

**Interfaces:**
- Consumes: `load_peer_returns`, `period_members`, `category_period_weighted_averages` from Task 1.
- Produces: `category_pool_before_after.py --user-id <uuid>`: read-only (the write guard pattern of `scripts/measure_home_staging.py`, aborting on any flush or raw write); for each fund the household holds prints one line per period (1Y, 3Y, 5Y): `category`, `scheme_code`, `period`, `old_peers`, `new_peers`, `rank_total`, `old_average_percent`, `new_average_percent`, `difference_in_percentage_points`, and a final summary (funds checked, funds whose 1Y count changed, funds whose 3Y or 5Y value changed: expected zero). "Old" is the previous floor reimplemented inside the script (`_old_rule_averages(detailed)`, five lines, documented as the pre-QA-12 rule). It prints scheme codes and public fund names only, never member names, folios or amounts.

- [ ] **Step 1: Write the failing tests** (names fixed). `test_export_category_average_excel.py`: rewrite `test_three_year_floor_excludes_short_history_from_every_period` (L202) as `test_short_history_peer_is_in_the_1y_pool_and_excluded_from_3y_and_5y_with_reasons` (seed 910109 with `years=(1,)`: in the 1Y pool, in the Excluded sheet for 3Y and 5Y with a per-period reason), update the "Counts" column test (L195) and the weights test (L182) only where they pin the floor. `test_category_average_diff_report.py`: `test_report_uses_per_period_pools_and_shows_zero_difference_for_a_clean_category`. `test_category_pool_before_after.py`: `test_before_after_marks_a_short_history_peer_as_a_1y_count_change_only`, `test_before_after_shows_zero_change_at_3y_and_5y`, `test_script_aborts_on_any_write_attempt`, `test_script_prints_no_member_names_or_amounts`.
- [ ] **Step 2: Run; expected red.** **Step 3: Implement** the script edits to the contract. **Step 4: Claude runs the script tests; expected green.**
- [ ] **Step 5: Claude verifies against the allowed list and commits** `chore(analytics): scripts follow the per-period pool; add the before-and-after report`.

## Task 3: The number gate (Claude, the owner)

- [ ] **Step 1: G1 (mandatory, numbers):** `codex:codex-rescue` runs `/codex:adversarial-review` against the Task 1 and 2 diff (read-only, background); the owner relays the report; findings close only by a fix with a red test first or by the owner accepting them.
- [ ] **Step 2: The real-data before and after.** Claude writes a short prompt for the manager's Claude (same style as the export timing prompts: fetch the script without touching the checkout, copy it into the backend container, run it through the entrypoint with the owner's user id found by the owner's sign-in email, no token, read-only, output exactly as printed) and gives it to the owner. The owner pastes the output back.
- [ ] **Step 3: Claude reads the output against the Global Constraints** (the five expected 1Y counts; zero change at 3Y and 5Y) and shows the owner the table of old and new 1-year averages. **The patch does not deploy until the owner approves these numbers.** Record the result in `decisions.md` and in `Docs/orchestration/2026-11-25-d12-before-after.md` (invented-free: fund codes and public names only).

## Task 4: QA rows, docs, deploy notes (Claude)

- [ ] **Step 1: QA rows** in the combined checklist: re-run **M2-01** (N identical in the rank and the average at 1Y, now for all five funds) and **M2-02** (the rank counts are unchanged: Large and Mid Cap 33, Corporate Bond 21 if held); **recompute the expected 1-year figures of M2-04** (0.27 and 2.13) from Task 3's output before that row is run.
- [ ] **Step 2: Deploy notes for the patch guide:** after the back end is up, rebuild the stored results for all households (the XIRR guide's step 8 command), then verify one household's Performance page shows the same N in the rank and the average at 1Y.
- [ ] **Step 3: Docs:** `decisions.md` as-built note, `session.md`, delegation-log lines. Update the M2 guide's before-and-after table reference in the QA row.

## Self-review against the page

Item D-12 covered: pools shared (Task 1); the five expected counts and the unchanged 3Y and 5Y (Global Constraints, Tasks 1 and 3); tests named on the page (`..._includes_one_year_only_funds...`, `..._for_every_period_with_short_history_peer`, `..._legacy_blended_average_still_uses_the_3y_floor`, the three rewritten old-floor tests); files on the page (`category_ranking.py`, the Excel and diff scripts); the number gate; the stored-results rebuild; M2-04 recomputed. Frontend: none, by decision (wording unchanged).

## Execution log

*(Claude appends below: drift note, deviations, gate results, the before-and-after table, deploy record link.)*
