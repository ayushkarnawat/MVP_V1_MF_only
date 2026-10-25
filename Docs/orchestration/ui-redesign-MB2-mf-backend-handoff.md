# Handoff: ui-redesign MB2 (Mutual Funds backend: `sebi_category` on holdings rows, windowed benchmark XIRR engine)
**Status:** READY FOR CODEX (written 26 Oct 2026, not yet run)
**Parent plan:** `Docs/superpowers/plans/2026-10-24-mutual-funds-backend-plan.md` Tasks **BT2** and **BT3**. Run catalogue: `2026-10-24-ui-redesign-orchestrator-handoff.md` section 6, run **MB2**. The engine's output is stored beside the existing benchmark payloads by the next run (MB3, BT4); this run adds **no** field to any existing payload and changes no existing behaviour.
**Branch:** `feat/mf-backend` (MB1 is `3e1597e6`: the eight-member `BenchmarkIndex`, `LEGACY_BENCHMARK_INDICES`, `ALL_BENCHMARK_INDICES`). **Orchestrator:** Claude Code · **Worker:** Codex (manual relay). One working tree, one run at a time: do not switch branches. Shapes below are decided by the orchestrator and are exact; **where they differ from the plan's BT3 signatures, this document wins** (the differences are marked "supersedes the plan" and exist so every DB read is isolated and the maths is pure and testable).

Do the two tasks in order, each test-first. Money and rates are `Decimal` everywhere, never `float`. No network (no `ensure_index_history_fresh` call anywhere in the new module: it only reads what is stored).

---

## Task 1 (BT2): `HoldingRow.sebi_category`
`HoldingRow` in `backend/app/services/dashboard/schemas.py` gains, as its **last** field, `sebi_category: str | None = None`. In `backend/app/services/dashboard/holdings.py` both places that build a `HoldingRow(...)` (the `nav_unavailable` row and the normal row; `grep -n "HoldingRow(" app` finds them) pass `sebi_category=scheme.sebi_category`; the scheme is already loaded there for `amc_name`, so **add no query and no per-row `db.get`**. Do not touch `compute_holdings`' signature or cache key.
Tests first: in `backend/tests/services/dashboard/test_holdings.py`: a scheme with `sebi_category="Equity Scheme - Flexi Cap Fund"` gives that value on its row, on both the valued row and the `nav_unavailable` row; a scheme whose category is `None` (or the empty string, keep whatever the model stores) gives `None` (or the stored value unchanged: assert the row equals the scheme's attribute, do not invent a mapping); a CAS-only scheme without a master row gives the stored attribute; **`test_existing_holding_fields_unchanged`**: the serialised row (`model_dump(mode="json")`) with the new key removed equals the key set and values of the same fixture built before the change (build the expected dict explicitly in the test from the field list at HEAD, not from the model); the new key is the last one in the dump order. In `backend/tests/api/test_dashboard_holdings_route.py`: the route's JSON rows carry `sebi_category`. If an existing test asserts the **exact** key set of a holdings row or its JSON, adding the new key to that expectation is the one permitted edit to an existing assertion (say so in the report).

## Task 2 (BT3): windowed benchmark XIRR engine, new module `backend/app/services/analytics/benchmark_windows.py`
### 2a. Output models (added to `backend/app/services/analytics/schemas.py`, additive; this is the plan's BT4 interface, pulled forward because the engine returns it; **add nothing else to that file and wire nothing into `PortfolioBenchmarkSummary` or `FundBenchmarkRow` yet**)
```python
class BenchmarkWindowRow(BaseModel):
    window: Literal["1Y", "3Y", "5Y", "SI"]
    available: bool
    start_date: date | None
    portfolio_xirr: str | None
    indices: list[IndexXirrRow]            # all eight members of ALL_BENCHMARK_INDICES, in that order, always

class FundWindowXirr(BaseModel):
    window: Literal["1Y", "3Y", "5Y", "SI"]
    fund_xirr: str | None
    benchmark_xirr: str | None
```
(`IndexXirrRow` exists: `index`, `xirr: str | None`.) Rates are strings made by `_xirr_str` from `benchmark.py` (import it; never `str(Decimal)`).

### 2b. Window rule (decided)
```python
WINDOWS: tuple[str, ...] = ("1Y", "3Y", "5Y", "SI")
WINDOW_YEARS: dict[str, int | None] = {"1Y": 1, "3Y": 3, "5Y": 5, "SI": None}
def window_start(window: str, today: date) -> date | None: ...
```
`window_start` = the **month end** `N` calendar years before the last completed month end of `today`; `None` for `"SI"`. Compute the last completed month end from the **`today` argument** (`today.replace(day=1) - timedelta(days=1)`), **not** by calling `last_completed_month_end()` (that reads the clock), then take the last day of the same month `N` years earlier (February: 28 or 29 by that year). Examples: `today = 2026-10-24`: last completed month end 2026-09-30, so 1Y = 2025-09-30, 3Y = 2023-09-30, 5Y = 2021-09-30; `today = 2028-03-10`: last completed 2028-02-29, 1Y = 2027-02-28, 3Y = 2025-02-28; `today = 2026-01-05`: last completed 2025-12-31, 1Y = 2024-12-31. An unknown window name raises `ValueError`.
**A window is the interval `(start, today]`**: the start-date value already contains everything dated on or before `start`, so only transactions with `start < date <= today` are in-window flows.

### 2c. Index levels (the only index read; supersedes the plan's `IndexLevels.load(db, index, start, end)`)
```python
class IndexLevels:
    def __init__(self, dates: Sequence[date], values: Sequence[Decimal]) -> None   # ascending by date, parallel lists
    def on_or_before(self, d: date) -> Decimal | None                              # bisect; None when no stored date <= d
def load_index_levels(db: Session, indices: Iterable[BenchmarkIndex], start: date, end: date) -> dict[BenchmarkIndex, IndexLevels]: ...
```
`load_index_levels` issues **one query per index** (so 8 for eight), TRI rows only (`return_type == BenchmarkReturnType.TRI`), `date >= start - 10 days` and `date <= end`, ordered by date. The 10-day lookback covers a weekend plus holidays; a date with no stored level within 10 days of its predecessor is treated as having none (the existing `get_index_level_on_or_before` has no limit; the difference is immaterial for daily NSE data and is noted in the report). An index with no rows maps to an empty `IndexLevels` (`on_or_before` returns None), never a missing key. Statement count is independent of the number of transactions (test it).

### 2d. Window context (the only snapshot and month-detail reads; supersedes the plan's per-call `db` arguments)
```python
@dataclass(frozen=True)
class WindowContext:
    today: date
    starts: dict[str, date | None]                         # WINDOWS -> window_start(...)
    portfolio_start_values: dict[str, Decimal | None]      # window -> V0; None means the window is unavailable; "SI" always None here (SI has no opening value)
    fund_start_values: dict[str, dict[uuid.UUID, Decimal]] # window -> scheme_id -> value at the window start, only funds held and fully priced then; "SI" is {}
async def build_window_context(db: Session, member_ids: list[uuid.UUID], today: date) -> WindowContext: ...
```
**Portfolio start value per non-SI window `s`** (use `await get_snapshots(db, member_ids)` from `app/services/dashboard/snapshots.py`, called **once**; it returns one `SnapshotRow` per member per month: `household_member_id`, `snapshot_month`, `total_value` (a 2-dp string), `is_partial`):
- Group the rows by member. A member with **no rows** contributes nothing (no data). A member whose **first** snapshot month is **after** `s` had not started investing: contributes `0`. A member with a row for month `s`: if `is_partial` the window is **unavailable**; else contributes `Decimal(total_value)`. A member whose first month is on or before `s` but has **no** row for `s` makes the window **unavailable**.
- `V0` is the sum. **`V0 <= 0` makes the window unavailable** (value `None`): this is what makes a household with 14 months of history unavailable for 3Y and 5Y, and it means a window never degenerates into "since inception".
**Fund start values** for non-SI window `s`: `detail = await get_month_detail(db, member_ids, s)` (once per distinct non-None `s`, at most three calls); `None` gives `{}`. Otherwise group `detail.funds` by `scheme_id`: if **any** row of that scheme has `priced` False or `value` None the fund is left out (its start value is unknown); otherwise the fund's value is the sum of `Decimal(row.value)`; keep it only if `> 0`.

### 2e. Pure engine functions
```python
def index_window_xirr(levels: IndexLevels, flows: Sequence[tuple[date, Decimal]], start: date | None, start_value: Decimal | None, today: date) -> Decimal | None: ...
def compute_window_rows(ctx: WindowContext, transactions: Sequence[Transaction], current_value: Decimal,
                        levels: Mapping[BenchmarkIndex, IndexLevels]) -> list[BenchmarkWindowRow]: ...
def compute_fund_window_rows(ctx: WindowContext, scheme_id: uuid.UUID, fund_transactions: Sequence[Transaction],
                             fund_current_value: Decimal, index: BenchmarkIndex,
                             levels: Mapping[BenchmarkIndex, IndexLevels]) -> list[FundWindowXirr]: ...
```
Both take the **flow signs from the existing code**: `_signed_amount(txn)` for the portfolio (the `_investment_transactions` rows) and `_signed_amount(txn, frozenset({TransactionType.SWITCH_IN}))` for a fund (the `_fund_level_transactions` rows), imported from `benchmark.py`. `current_value` and `fund_current_value` are the **terminal values the since-inception calculation already uses** (the caller passes them; the engine never calls `compute_holdings`).

**`index_window_xirr`** (the one place the hypothetical-index replay lives; the SI case reproduces `_benchmark_xirr_for_transactions` exactly):
- Replay: `units = 0`. If `start` is not None: `level_s = levels.on_or_before(start)`; if `level_s is None` or `start_value is None` return None; `units = start_value / level_s` and the first flow is `(start, -start_value)`. For each `(d, signed)` in `flows` (already in-window and in date order): `level = levels.on_or_before(d)`; **if None, skip this flow entirely** (exactly the existing behaviour); else if `signed < 0` then `units += -signed / level` else `units -= signed / level`; append `(d, signed)`. Terminal: `level_t = levels.on_or_before(today)`; if None, or no flow was appended, return None; append `(today, units * level_t)`; return `xirr(flows_list)` (`app/services/analytics/xirr.py`).
**`compute_window_rows`**: empty `transactions` returns `[]`. Otherwise one row per window in `WINDOWS` order.
- **`SI`:** `available=True`, `start_date = min(t.date for t in transactions)`, `portfolio_xirr = _xirr_str(portfolio_xirr(transactions, current_value))` (the dashboard function, imported as `_portfolio_xirr` in `benchmark.py`; import it from there, **do not reimplement it**), each index's rate from `index_window_xirr(levels[index], flows, None, None, today)` with `flows` = every transaction as `(date, _signed_amount)` in the given order. **For the four legacy indices this must equal what `_benchmark_xirr_for_transactions` returns for the same transactions to the last digit** (test it).
- **`1Y` / `3Y` / `5Y`:** `s = ctx.starts[w]`, `V0 = ctx.portfolio_start_values[w]`. `V0 is None`: row `available=False`, `start_date=None`, `portfolio_xirr=None`, and all eight index rows with `xirr=None`. Otherwise `available=True`, `start_date=s`, `in_window = [(t.date, _signed_amount(t)) for t in transactions if s < t.date <= ctx.today]` in the given order, `portfolio_xirr = _xirr_str(xirr([(s, -V0)] + in_window + [(ctx.today, current_value)]))`, each index via `index_window_xirr(levels[index], in_window, s, V0, ctx.today)`. (An index missing from `levels` is treated as an empty `IndexLevels`.)
- The `indices` list is always the eight members of `ALL_BENCHMARK_INDICES` in that order, each an `IndexXirrRow(index=..., xirr=_xirr_str(rate))`.
**`compute_fund_window_rows`**: one `FundWindowXirr` per window in `WINDOWS` order.
- **`SI`:** `fund_xirr = _xirr_str(portfolio_xirr(fund_transactions, fund_current_value, extra_debit_types=frozenset({TransactionType.SWITCH_IN})))`; `benchmark_xirr` from `index_window_xirr(levels[index], flows, None, None, ctx.today)` with the fund's signed flows. Equal to the existing `compute_fund_vs_benchmark` row values (test it).
- **Other windows:** `V0 = ctx.fund_start_values[w].get(scheme_id)`; `None` gives both fields `None` (a fund not held at the start has no value for that window). Else flows as above with the fund's own transactions in `(s, today]`, `fund_xirr = _xirr_str(xirr([(s, -V0)] + in_window + [(ctx.today, fund_current_value)]))` and `benchmark_xirr` via `index_window_xirr(levels[index], in_window, s, V0, ctx.today)`.

## Hand fixtures and tests (each seen RED first; say which)
All in `backend/tests/services/analytics/test_benchmark_windows.py`; build the window context by hand (a `WindowContext(...)` literal) for the pure functions, and use the repo's SQLite fixtures (as in `test_benchmark.py`) for the loaders.
1. `window_start`: the examples in 2b (including the leap-year one and the January one); `SI` is None; an unknown name raises.
2. `IndexLevels.on_or_before`: exact date, a Saturday (previous Friday), before the first date (None), after the last (last value); `load_index_levels`: only TRI rows are read (seed a PRICE row for the same date with a different value), the 10-day lookback row is included and one older is not, an index with no rows gives an empty `IndexLevels`, **exactly one statement per index** and the count does not change when 5 or 50 transactions exist in the database (the guard against the slow per-transaction lookup).
3. `index_window_xirr`: **flat index** (levels all 100): no flows, `start_value = 1000`: the replay buys 10 units and ends at 1000: the rate is `0` (assert `abs(rate) < 1e-7`); **index doubles** (100 at the start, 200 at today), `start_value = 1000`, no flows, `d = (today - start).days`: the rate equals `2 ** (365/d) - 1` (Decimal power) within `1e-6`; a flow with no level is skipped (and does not appear in the cash flows: assert via a monkeypatched `xirr` recording its argument); `level_s` missing returns None; `level_t` missing returns None; no flow appended and `start is None` returns None.
4. `compute_window_rows`, portfolio side with a hand-built context (`today = 2026-10-24`, `1Y` start 2025-09-30, `V0 = 100000`) and transactions: a purchase of 10000 on 2026-01-15 (flow `-10000`), a redemption of 5000 on 2026-06-10 (`+5000`), a purchase **dated exactly 2025-09-30** (must be **excluded**, it is inside `V0`) and one dated before it (excluded); `current_value = 130000`. Expected portfolio flows: `[(2025-09-30, -100000), (2026-01-15, -10000), (2026-06-10, +5000), (2026-10-24, 130000)]`; assert `portfolio_xirr == _xirr_str(xirr(those flows))` **and** assert a hand case with no in-window flow (`V0 = 100`, `current_value = 110`, 389 days: `1.1 ** (365/389) - 1` within `1e-6`).
5. Index side of the same fixture with a rising index (levels 100 at the start, 110 on 2026-01-15, 120 on 2026-06-10, 150 at today, all TRI): units at the start `1000`, after the purchase `+10000/110`, after the redemption `-5000/120`, terminal `units * 150`: assert `indices[i].xirr` for `NIFTY_50` equals `_xirr_str(xirr([(2025-09-30, -100000), (2026-01-15, -10000), (2026-06-10, 5000), (2026-10-24, units*150)]))` computed in the test from the stated unit arithmetic, and that an index with **no stored history** has `xirr is None` while the other seven are unaffected and nothing raises.
6. Availability: `V0 = None` for `3Y` gives `available False`, `start_date None`, `portfolio_xirr None`, eight index rows all `None`; the `SI` row is still computed in the same call. All four windows appear in order, always eight index rows in `ALL_BENCHMARK_INDICES` order.
7. `SI` equality with the existing code: using the repo's SQLite session, seed TRI history for all eight indices and 6 mixed transactions for a member (purchases, a redemption, a dividend payout, a switch pair; `_investment_transactions` selects the rows), then for each of the four legacy indices assert the `SI` row's rate equals `_xirr_str(await _benchmark_xirr_for_transactions(db, txns, index))` and the `SI` `portfolio_xirr` equals `_xirr_str(_portfolio_xirr(txns, current_value))`, exactly. (If the existing function's `ensure_index_history_fresh` call would hit the network, patch it to return True as the neighbouring tests do.)
8. `compute_fund_window_rows`: a fund held 4 years with `fund_start_values["3Y"][scheme] = V0`: the 3Y row uses only that fund's transactions in `(start, today]` with `SWITCH_IN` as a debit; a fund **absent** from `fund_start_values` gets both fields `None` for the windowed rows but a real `SI`; `SI` equals the existing `compute_fund_vs_benchmark` row for the same fund (`fund_xirr`, `benchmark_xirr`) exactly.
9. `build_window_context` (SQLite, real `get_snapshots`/`get_month_detail`; patch them only if building real snapshot rows is impractical, and say so): (a) one member with 14 months of history: `1Y` has `V0 > 0` and a value, **`3Y` and `5Y` are `None`**; (b) a member that started after the 1Y start next to one that started earlier: the later member contributes 0 and the window is available; (c) a partial snapshot at the start month makes the window `None`; (d) `V0 == 0` (everything sold before the start) gives `None`; (e) fund start values: a fund held at the start is present with its summed value across two members, a fund with an unpriced row is absent, a fund bought after the start is absent; (f) `get_snapshots` is called once and `get_month_detail` at most once per distinct start (assert with call counts on patched wrappers, delegating to the real functions).
10. `test_no_float_anywhere`: every returned rate is `None` or a `str` that `Decimal()` parses; no `float` instance appears anywhere in the returned models; the module contains no `float(`.
11. No write and no fetch: with the SQLite session wrapped to fail on any `INSERT`/`UPDATE`/`DELETE`... (note `get_snapshots` itself may rebuild and write snapshot rows when they are stale: so for this test use data whose snapshots are already fresh, or assert only that the **engine functions that take no `db`** are pure, and that `load_index_levels` issues SELECTs only). `ensure_index_history_fresh` is patched to raise and is never called.

## Test commands (run only these; no full suite)
Use the WSL venv (Python 3.14); `.venv-win` is incomplete on this laptop. From PowerShell:
```
wsl.exe -d Ubuntu --cd "D:\Unifolio code\backend" -- .venv/bin/python -m pytest tests/services/analytics/test_benchmark_windows.py tests/services/dashboard/test_holdings.py tests/api/test_dashboard_holdings_route.py -q -p no:cacheprovider --disable-warnings
```
and, the same way, the neighbours that use what you changed: `tests/services/analytics/test_benchmark.py`, `tests/services/dashboard/test_snapshots.py` (if it exists) and every file `git grep -l "HoldingRow\|compute_holdings\|sebi_category" -- tests` finds that is not already listed. In WSL itself: `cd backend` then `.venv/bin/python -m pytest <files> -q -p no:cacheprovider --disable-warnings`. Report every command and its last lines. If a run stalls or the sandbox blocks it, report BLOCKED with the exact error; do not edit configs.

## Constraints
`Decimal` never `float` (no `float()` and no float literals in the new module). TDD: see each new test fail for the right reason first and say which were RED. Additive only (the one permitted existing-assertion edit is named in Task 1). **Allowed files:** `backend/app/services/dashboard/schemas.py` (the one field), `backend/app/services/dashboard/holdings.py` (the two `HoldingRow(...)` calls only), `backend/app/services/analytics/schemas.py` (the two new classes only), `backend/app/services/analytics/benchmark_windows.py` (new), `backend/tests/services/analytics/test_benchmark_windows.py` (new), `backend/tests/services/dashboard/test_holdings.py`, `backend/tests/api/test_dashboard_holdings_route.py`, and this handoff's Report block. **Do not edit** `benchmark.py`, `xirr.py`, `snapshots.py`, `nse_indices_client.py`, any `compute_*` function, `PortfolioBenchmarkSummary`, `FundBenchmarkRow`, or any route. No new dependency. Git is read-only (`status`, `diff`, `log`, `show`, `grep`, `ls-files`). LF endings, UTF-8 (check with `git diff --check` and `git ls-files --eol`). Match the surrounding code's comment density and naming.

## Review Focus (for the gate)
The `(start, today]` interval (a transaction on the start date is in `V0`, never also a flow); that no window can degenerate into since-inception (`V0 > 0` rule); the `SI` row equal to the existing numbers digit for digit; that skipped index flows match the existing behaviour; the per-index query count; that the engine never fetches or writes; the leap-year and January `window_start` cases; the fund rule (a fund not held at the start has no windowed value).

## Approaches considered and rejected
Calling `compute_holdings` inside the engine (a second valuation that could disagree with the since-inception value); one `get_month_detail` call per fund per window (the plan's per-fund signature; far too many walks of the transaction history, so the start values are read once per window and shared); letting a window with no opening snapshot fall back to the first transaction (a "3Y" figure that is secretly a 14-month figure); loading the full TRI history of every index (about 9,000 rows each, only the window and a 10-day lookback are needed); fetching missing index history from the engine (the daily job and the existing legacy calls do it; a missing index simply shows `None`).

## Open questions
Anything the code shows that this handoff did not say goes under Findings; behaviour or interface questions under Open questions. Do not guess. If a shape cannot work with the real models (for example `get_month_detail` or `get_snapshots` need something the context does not have), stop on that point and say why.

## Report (Codex fills this in at the end, in one fenced block)
```
CODEX REPORT — ui-redesign — MB2
Run date/time:    Environment:    Python:    Baseline HEAD:
1. TASK STATUS:
2. FILES:
3. TESTS (RED list, GREEN task runs, final fresh commands):
4. DEVIATIONS (mechanics only):
5. FINDINGS:
6. OPEN QUESTIONS / BLOCKERS:
7. SELF-REVIEW FINDINGS:
8. CONFIRMATIONS: No git write commands:  Full suites not run:  Edits only in the allowed files:
```
