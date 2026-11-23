# Handoff: search-be-1 (Batch K, tasks T01 + T02: the household search index endpoint, backend, Codex)
**Status:** READY TO RELAY (written 2026-11-20). **Approved:** the owner approved the 17 Nov release program and Batch K's plan; M3 start confirmed 20 Nov.
**Parent plan:** `Docs/superpowers/plans/2026-11-17-batch-k-search-plan.md` (Tasks T01, T02; read "Global Constraints" and "Review Focus"). **Spec:** `Docs/orchestration/2026-11-09-search-bar-planning.html`, section 3 "The back end in detail" (the endpoint, the response example, the seven build steps, the test list). The spec is the design; if it and the code disagree, stop and say so.
**Worker:** Codex, backend only. **It cannot run async back-end tests in its sandbox (they stall at asyncio start-up): write the tests and the code, try the run once, and report BLOCKED with the exact error if it stalls; Claude runs them.** **Reviewer and committer:** Claude.
**Work in:** `D:\unifolio-k-be` (worktree, branch `batch/k-be`, cut from `leapswitch-redesign` at `04f8077b`). Never in `D:\Unifolio code`.
Read first, in order: `Docs/orchestration/ui-common-rules-codex.md`, `Docs/orchestration/wave-common-rules.md` (wins where they differ), then this file.

## Correction of 23 Nov 2026 (orchestrator, after Codex's first BLOCKED report): which manager picker to use
Codex found that the Allocation page now picks the manager with the private helper `_pick_for_fund(rows, holding)` in `fund_manager_allocation.py`, not `pick_main_manager` (the helper looks at the fund's equity or debt orientation; `pick_main_manager` alone can pick a different person: an equity fund with a "Debt Fund Manager" at order 1 and an "Equity Fund Manager" at order 2). The goal is parity with the Allocation page, so **the search index uses `_pick_for_fund` (import it; do not edit `fund_manager_allocation.py`, do not wrap or copy it)**. It reads only `holding.sebi_category` and `holding.asset_class` from its second argument: pass a small stand-in object (a `SimpleNamespace` or a tiny frozen dataclass inside the search service) built from the scheme facts you already read; find the scheme-master column for `asset_class` and read it in the same one query for scheme facts. Use its `.row` for the name (None means `main_manager: null`). Also apply the same active-rows and "not older than two months" selection the Allocation code applies before calling it (reuse `_active_rows` if that is where the rule lives; read the code first). The parity test must include the orientation case above (equity fund, Debt manager at order 1, Equity manager at order 2: both the Allocation page and the search index choose the Equity manager). Everything else in this handoff stands. Wherever the text below says `pick_main_manager`, read `_pick_for_fund`.

## Wave-start check (report drift, do not fix drift)
Confirm: `backend/app/api/fund_page.py` (router style), `backend/app/services/dashboard/holdings.py` and `lot_rules.apply_lot_rules`, `backend/app/services/dashboard/sip.py` `compute_active_sips(db, member_ids, include_stopped=True, today=...)`, `backend/app/services/analytics/fund_manager_allocation.py` **`pick_main_manager(rows)` (it is public: no wrapper needed)** and the Allocation page's "not older than two months" rule, `list_household_members(db, user.id)` (find where it lives), `get_data_user`, `get_db`, `get_now_ist` (in `backend/app/api/home.py` for the date dependency), `backend/tests/api/test_portfolio_no_fetch_no_write.py` (the model for the no-pricing test), `backend/scripts/measure_home_staging.py`. Alembic head is `0054`; there is no migration.

## The contract (fixed here: T01)
`GET /household/search-index` (flat router, no prefix) -> `SearchIndexResponse`:
```
SearchIndexResponse { generated_at: datetime (IST, offset), funds: list[SearchFund] }
SearchFund   { scheme_id: str, name: str, amc_name: str, sebi_category: str | None, plan_type: str ("direct" | "regular" | the model's other value), main_manager: str | None, holders: list[SearchHolder] }
SearchHolder { member_id: str, member_name: str, state: Literal["open", "sold"], sip: SearchSip | None }
SearchSip    { status: str, next_due_date: date | None }
```
Example (from the spec): one fund with two open holders (one with an active SIP due 2026-12-05); one fund with `main_manager: null` and one `sold` holder whose SIP is `stopped` with `next_due_date: null`. The front end already has the matching types (`frontend/src/components/search/searchTypes.ts` on `batch/k-search`). Field names and `plan_type` values follow the existing models; if a model's value differs from the example, **use the model's value and report it**.
- **Rules:** whole household of the signed-in user only (never another user's data); `get_data_user` (401, 403 pending deletion, re-consent 403 as every data route); **plain `def`**, not async; no commit; **no pricing at all** (no NAV read, fetch or write); open or sold by replaying `apply_lot_rules` per member and fund (more than zero units = open; zero with at least one transaction = sold; **never a plain unit sum**); one batch for members, folios and transactions; one query for scheme facts; `compute_active_sips(..., include_stopped=True, today=...)`; main manager from `scheme_fund_managers` (newest `reference_period` per scheme, the two-month rule, `pick_main_manager`, so a search for a manager finds the funds the Allocation page lists under him); funds sorted by name, holders by member order; **the response has no folios, sectors, amounts, units or prices**; the query count is the same for 3 and 40 funds.
- **New files:** `backend/app/api/search.py`, `backend/app/services/search/{__init__,index,positions,schemas}.py`; one `include_router` line in `backend/app/main.py`. Interfaces: `build_search_index(db, user_id: uuid.UUID, today: date) -> SearchIndexResponse`; `open_or_sold(transactions: Sequence[Transaction]) -> Literal["open","sold"]`.

## Tests first (written and run before the code; red for the stated reason)
`backend/tests/api/test_search_index.py`, `backend/tests/services/search/test_positions.py`, `backend/tests/functional_postgres/test_search_index_pg.py`. Names (from the plan): `test_requires_sign_in_401_403_pending_deletion_and_reconsent`; `test_household_only_second_user_never_appears`; `test_shape_family_of_two_three_funds_holders_states_sip_next_due`; `test_sold_fund_including_sold_at_same_price`; `test_matches_compute_holdings_open_funds` (open exactly when `compute_holdings` returns the fund with units); `test_no_pricing_and_read_only` (NAV fetch stubbed to fail the test if called; only SELECT statements); `test_query_count_fixed_for_3_and_40_funds` (`before_cursor_execute` listener); `test_main_manager_parity_with_allocation_page_and_old_period_ignored_and_none_is_null`; `test_response_has_no_amounts_units_prices_folios`; Postgres: the shape test on the real partitioned transactions table (needs `TEST_DATABASE_URL`; skip cleanly when it is absent). Invented households only; the fixture should have a two-member family, three funds, one fund bought and fully redeemed at the same price, one stopped SIP and one fund with no main manager.

## Run these only
```
cd backend
"D:\Unifolio code\backend\.venv-win\Scripts\python.exe" -m pytest tests/api/test_search_index.py tests/services/search -v
```
Also run the neighbouring `tests/api` auth tests you touch. If the sandbox stalls at asyncio start-up, report BLOCKED with the exact error.

## Files you may touch
The new files above, the new tests, `backend/app/main.py` (the one `include_router` line), and `backend/tests/conftest.py`/fixtures **only** to add a fixture (list it). **Do not touch** any existing service's behaviour, `frontend/**`, migrations, existing tests' assertions, `fund_manager_allocation.py`.

## Constraints
Invented data only. No network. No new dependency. Git read-only. No deletion flags or recursive deletes. `Decimal` rule stands (nothing here is money). Measure the endpoint on the largest synthetic household (40 or more funds) the way `measure_home_staging.py` did and give the number (or say why you could not).

## Report format
One fenced block `CODEX REPORT: search-be-1`: status; baseline HEAD; drift (include the `plan_type` values the model uses); which tests were red first and why; files and functions changed with a one-line reason each; commands with counts; real example request and response; the measurement; `git status --short`; Deviations; Open questions.

## Paste-ready prompt
```
Backend worker for Unifolio (Codex). Read, in order:
1. Docs/orchestration/ui-common-rules-codex.md
2. Docs/orchestration/wave-common-rules.md (wins where they differ)
3. Docs/orchestration/2026-11-20-search-be-1-handoff.md (your task: search-be-1, owner-approved)
Open Docs/orchestration/2026-11-09-search-bar-planning.html, section 3, for the endpoint and the test list. Work only in D:\unifolio-k-be on branch batch/k-be. Git is read-only. No deletion flags or recursive deletes. Write the failing tests first, run them, then make the change in the files the handoff names only. The endpoint is a plain def, whole household only, no pricing, no commit. If the sandbox cannot run the tests, reply BLOCKED with the exact error and still write the tests and the code.
Run tests with: cd backend; "D:\Unifolio code\backend\.venv-win\Scripts\python.exe" -m pytest <files>
Reply with the CODEX REPORT block from the handoff, nothing else.
```
