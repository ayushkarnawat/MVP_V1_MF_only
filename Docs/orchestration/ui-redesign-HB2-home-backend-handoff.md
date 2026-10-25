# Handoff: ui-redesign HB2 (opening-balance cache fix, disclosure retention to 6 months, Home series maths)
**Status:** READY (not yet run)
**Parent plan:** `Docs/superpowers/plans/2026-10-23-home-backend-plan.md` Tasks **T2 + T4 + T5**. Spec: `Docs/orchestration/2026-10-23-home-functionality-backend-spec.md` (section 4, the wealth graph; B5 is Modified Dietz; the 1.2 to 29 s naive build is forbidden). Run catalogue: `2026-10-24-ui-redesign-orchestrator-handoff.md` section 6, run **HB2**.
**Branch:** `feat/home-snapshot` (HB1 `511f1ef` is its tip; PR #10 targets `leapswitch-redesign`). **Orchestrator:** Claude Code · **Worker:** Codex (manual relay). One working tree, one run at a time: do not switch branches.

Three independent tasks. Do them in this order, each test-first. Plan text is the source; where it names a function but not its shape, **the shapes below are decided by the orchestrator** and are exact.

---

## Task A: T2 opening-balance cache fix (BD12)
`POST /folios/{folio_id}/opening-balance` (`post_opening_balance` in `backend/app/api/cas_imports.py`) creates a transaction but never clears the per-worker holdings cache, so Home and the Dashboard keep serving the old holdings for up to 15 minutes.

Change (one call, plus its import): after `create_opening_balance(...)` returns successfully (it commits internally, so the invalidation comes after the commit), call `invalidate_holdings_cache(folio.household_member_id)` with the folio's member id (the route already does `folio = db.get(Folio, folio_uuid)` after the create; use that folio). Import it at module level exactly as `app/api/imports.py` does: `from app.services.dashboard.holdings import invalidate_holdings_cache`, so tests patch `app.api.cas_imports.invalidate_holdings_cache`. No other behaviour, status code or response field changes. The call must **not** happen on a 400 (bad payload, unknown or foreign folio, `ValueError` from the create).

Tests first, in `backend/tests/api/test_coverage_gaps_routes.py` (use the existing `client` and `gap_setup` fixtures; the member id and folio id come from `gap_setup`):
- `test_post_opening_balance_invalidates_holdings_cache`: patch `app.api.cas_imports.invalidate_holdings_cache` with a recorder; a successful POST returns 201 and the recorder was called **exactly once with the member's `uuid.UUID`** (`member_id` from the fixture).
- `test_post_opening_balance_does_not_invalidate_on_bad_payload`: units `"abc"` gives 400 and the recorder was never called.
- `test_post_opening_balance_does_not_invalidate_for_unknown_folio`: a random folio id gives 400 and the recorder was never called.

## Task B: T4 disclosure retention, 3 to 6 months
`prune_old_batches` in `backend/app/services/analytics/portfolio_disclosure_retention.py` keeps each scheme's newest **three calendar months** (the newest disclosed month and the two before it). The arithmetic is `month = disclosed.year * 12 + disclosed.month - 3`, giving a cutoff of the first day of the month two months before the newest; I verified by hand that `- 3` keeps three months and therefore `- 6` keeps six (a September disclosure keeps April to September, cutoff 1 April; a January 2027 disclosure keeps August 2026 to January 2027, cutoff 1 August 2026).

Change: a module constant `RETAIN_MONTHS = 6` (with a one-line comment: calendar months kept per scheme, counting the newest disclosed month) used in place of the literal `3`, and the comment above the cutoff loop updated from "newest three calendar months" to the constant. Nothing else in the function changes (newest WRITTEN batch is still never pruned; a batch later than `today` still never defines the cutoff).

Tests first, in `backend/tests/services/analytics/test_portfolio_disclosure_retention.py`. The existing tests encode the three-month rule, so first run them and see which fail after you add the new test (they should fail once the constant is 6, which is the point), then **update their data and expected counts to the six-month rule while keeping every scenario they cover** (calendar months per scheme, newest WRITTEN protected, awaiting-manual rows, sparse history, future batch). Re-derive each expected number by hand and put the derivation in a comment on the test. Add at least these new cases:
- `test_prune_keeps_newest_six_calendar_months_per_scheme`: one scheme with month-end batches January to September 2026 (all WRITTEN); with `today=date(2026,10,14)` the January, February and March batches are pruned (3 returned), April to September stay; a second call returns 0.
- `test_prune_cutoff_crosses_the_year_boundary`: newest disclosure January 2027, batches from July 2026 to January 2027: July 2026 is pruned (before 1 August 2026), August 2026 onward stay.
- `test_retention_months_constant_is_six`: `retention.RETAIN_MONTHS == 6` (guards an accidental change).

(Not for Codex: the plan also says to count `scheme_holdings` rows on staging before this merges, to confirm the growth is acceptable. That is a manual owner or orchestrator step recorded in the session file; do not try to do it.)

## Task C: T5 `backend/app/services/home/series.py` (new, pure maths plus one bulk read)
Create `backend/app/services/home/__init__.py` (empty) and `backend/app/services/home/series.py`, and `backend/tests/services/home/__init__.py` (empty) and `backend/tests/services/home/test_series.py`. `Decimal` everywhere, never `float`. No new dependency: **do not import `dateutil`**; do month and year subtraction with `calendar.monthrange`. No network, no database access except `load_navs_by_scheme`. Every function is pure and deterministic (take `today` as an argument; never call `date.today()`).

Module constants: `NAV_LOOKBACK_DAYS = 10` (calendar days before the range start that the bulk read includes so a weekend or holiday start can be forward-filled), `MAX_CUSTOM_YEARS = 10`.

Types (exact):
```python
class SeriesPoint(NamedTuple):
    date: date
    value: Decimal

@dataclass(frozen=True)
class ValueSeries:
    points: tuple[SeriesPoint, ...]
    partial: bool
    missing_schemes: tuple[uuid.UUID, ...]      # sorted by str(), unique

@dataclass(frozen=True)
class DietzResult:
    gain: Decimal                # rupees, exact, not rounded
    pct: Decimal | None          # percent (12.5 means 12.5%), quantized to 0.0001 with ROUND_HALF_UP; None when undefined

@dataclass(frozen=True)
class BenchmarkReturn:
    pct: Decimal | None          # percent, quantized to 0.0001 ROUND_HALF_UP
    effective_start: date | None
    clipped: bool

@dataclass(frozen=True)
class PeriodRange:
    start: date
    end: date
    clamped: bool
```

### 1. `build_value_series(units_by_date, navs_by_scheme, dates) -> ValueSeries`
- `units_by_date: Mapping[uuid.UUID, Sequence[tuple[date, Decimal]]]`: per scheme, ascending `(effective_date, units_held)`; the units apply from the **close of `effective_date`** until the next entry; before the first entry the scheme holds 0. (Building this from transactions is **out of scope**, see "Out of scope".)
- `navs_by_scheme: Mapping[uuid.UUID, Sequence[tuple[date, Decimal]]]`: per scheme, ascending `(nav_date, nav)`.
- `dates: Sequence[date]`: strictly ascending (raise `ValueError` if not). Every date is a calendar day the caller wants a point for.
- Value on date `d` = sum over schemes of `units_held(d) * nav(d)`, where `units_held(d)` is the units of the latest entry with `effective_date <= d` (0 if none) and `nav(d)` is the nav of the latest NAV row with `nav_date <= d` (**forward-fill** over weekends and holidays).
- **Series start:** no point is emitted before the first date in `dates` on which total held units are above 0 (first transaction inside the range: the series starts there). No such date gives `points == ()`.
- **Partial:** if a scheme holds units above 0 on a date but has **no NAV row on or before that date**, its value is left out of that date's total (never priced at 0 silently), the scheme id goes in `missing_schemes`, and `partial` is True. A scheme that never holds units on any listed date is never reported.
- A fully redeemed scheme contributes 0 afterwards; the series continues. Complexity must be linear in `len(dates) + total rows` (use a moving pointer or `bisect`, not a scan per date per scheme).
Tests (hand-computed, use exactly this fixture): dates 2026-01-05 to 2026-01-12 (eight consecutive days; the 10th and 11th are a weekend). Scheme A units `[(01-06, 10.000), (01-09, 4.000)]` (a redemption of six units on the 9th); scheme B units `[(01-08, 20.000)]`. NAVs: A `01-05: 100.0000, 01-06: 101.0000, 01-07: 102.0000, 01-08: 103.0000, 01-09: 104.0000, 01-12: 106.0000`; B `01-08: 50.0000, 01-09: 51.0000, 01-12: 49.0000`. Expected points: `01-06: 1010`, `01-07: 1020`, `01-08: 2030` (1030 + 1000), `01-09: 1436` (416 + 1020), `01-10: 1436` and `01-11: 1436` (forward-filled), `01-12: 1404` (424 + 980); seven points, no point for `01-05`, `partial` False. Further cases: (a) add scheme C with units `[(01-07, 5.000)]` and **no** NAV rows: points equal the A+B values above, `partial` True, `missing_schemes == (C,)`; (b) scheme held from `01-08` whose first NAV is `01-09`: the `01-08` total excludes it and `partial` is True; (c) all units zero or no schemes: `points == ()`, not partial; (d) unsorted or duplicate `dates` raise `ValueError`; (e) a 400-day range with three schemes returns 400 points and the last value equals the hand-computed final units times NAV (guards the linear build; no timing assertion).

### 2. `load_navs_by_scheme(db, scheme_ids, start, end) -> dict[uuid.UUID, list[tuple[date, Decimal]]]`
The **one bulk read**. A single `select(NavHistory.scheme_id, NavHistory.date, NavHistory.nav)` for `scheme_id IN scheme_ids` and `date BETWEEN start - NAV_LOOKBACK_DAYS days AND end`, ordered by scheme then date; group in Python. Every requested id is a key in the result (an empty list when it has no rows). An empty `scheme_ids` returns `{}` and runs **no query**. It reads stored rows only: it must never call `app.services.dashboard.nav._fetch_nav_history` or anything networked.
Tests: (a) **exactly one SQL statement touching `nav_history`** for three schemes (count with a SQLAlchemy `before_cursor_execute` listener on `db_session.get_bind()`; this is the guard for the 1.2 to 29 s naive build); (b) empty ids runs zero statements and returns `{}`; (c) a row 9 days before `start` is returned and a row 11 days before is not, and a row after `end` is not; (d) a scheme with no rows maps to `[]`; (e) `_fetch_nav_history` patched to raise is never called.

### 3. `modified_dietz(start_value, end_value, flows, start, end) -> DietzResult`
- `flows: Sequence[tuple[date, Decimal]]`; positive is money put in (purchases, SIPs, switch in, gift in), negative is money taken out.
- Convention (decided): `start_value` is the portfolio value at the **close of `start`**, so a flow dated on `start` is already inside it and is ignored; only flows with `start < date <= end` count; flows outside that window are ignored.
- `gain = end_value - start_value - sum(counted flows)`, exact `Decimal`, not rounded.
- Weighted flow = `flow * (end - flow_date).days / (end - start).days`, computed as **multiply first, then divide** (so a hand case such as `-30000 * 20 / 30` is exactly `-20000`). `denominator = start_value + sum(weighted flows)`. `pct = gain / denominator * 100` quantized to `0.0001`, `ROUND_HALF_UP`; `pct` is `None` when `denominator <= 0`.
- `start == end`: no flows count, `gain = end_value - start_value`, `pct` from `start_value` as the denominator (None if it is not above 0). `start > end` raises `ValueError`.
Tests (hand cases): (A) no flow, start 100000 on 2026-01-01, end 110000 on 2026-01-31: gain 10000, pct 10.0000. (B) mid-period flow: start 100000, end 135000, flow +20000 on 2026-01-16 (15 of 30 days left, weight 0.5): gain 15000, denominator 110000, pct 13.6364. (C) withdrawal: start 100000, end 80000, flow -30000 on 2026-01-11 (20 of 30 days left): gain 10000, denominator 80000, pct 12.5000. (D) first investment inside the period: start 0, end 105000, flow +100000 on 2026-01-11: gain 5000, denominator 66666.67 (100000 * 20 / 30), pct 7.5000. (E) a flow on `start` and a flow after `end` are ignored (same result as case A with those flows added). (F) denominator not above 0 (start 0, no counted flows): `pct is None`, `gain == end_value`. (G) `start > end` raises; `start == end` as described.

### 4. `benchmark_return(index_levels, start, end) -> BenchmarkReturn`
- `index_levels: Sequence[tuple[date, Decimal]]`, ascending total-return index levels. `level_on_or_before(d)` is the latest level with date `<= d`.
- `start > end` raises `ValueError`. No level on or before `end` (including an empty list): `BenchmarkReturn(None, None, False)`.
- If a level exists on or before `start`: start level is that level, `effective_start = start`, `clipped = False`. Otherwise (history begins after `start`): start level is the **first** level (its date must be `<= end`, guaranteed by the previous rule), `effective_start` is that first level's date, `clipped = True`.
- `pct = (end_level / start_level - 1) * 100` quantized to `0.0001`, `ROUND_HALF_UP`; `None` when the start level is not above 0 (effective_start kept). One data point in the range gives `0.0000`.
Tests: normal (levels `01-01: 20000`, `01-31: 21000`, range 01-01 to 01-31: pct 5.0000, not clipped); the end date falls on a weekend and uses the last level on or before it; clipped (levels begin 2026-01-10, range 01-01 to 01-31: `effective_start == 2026-01-10`, `clipped` True); all levels after `end` gives pct None; empty list gives pct None; non-positive start level gives pct None; `start > end` raises.

### 5. `period_range(period, today, custom=None) -> PeriodRange`
- `period: Literal["1D", "1W", "1M", "1Y", "custom"]` (anything else raises `ValueError`). `custom: tuple[date, date] | None`.
- Fixed periods end on `today` and are not clamped: `1D` starts `today - 1 day`; `1W` `today - 7 days`; `1M` the same day of the previous calendar month, day clamped to that month's length (31 March gives 28 February, or 29 in a leap year); `1Y` the same day one year earlier (29 February gives 28 February). The caller replaces the `1D` start with the previous NAV day; say so in the docstring.
- `custom`: `None` raises; `start > end` raises. `end` later than `today` is clamped to `today`; `start` earlier than `today` minus `MAX_CUSTOM_YEARS` years (same-day rule, 29 February gives 28 February) is clamped to it; `clamped` is True if either moved. If after clamping `start > end` (the range lies wholly before the ten-year window) raise `ValueError`.
Tests with `today = date(2026, 10, 25)`: `1D` start 2026-10-24, `1W` 2026-10-18, `1M` 2026-09-25, `1Y` 2025-10-25; month-end clamps (`today` 2026-03-31 gives `1M` start 2026-02-28; `today` 2024-03-31 gives 2024-02-29); `today` 2024-02-29 gives `1Y` start 2023-02-28; custom inside the window is unchanged with `clamped` False; custom end in the future is clamped to today; custom start in 2010 is clamped to 2016-10-25; custom wholly before 2016-10-25 raises; start after end raises; `custom=None` raises; unknown period raises.

---

## Out of scope (do not build; list anything you think is missing under Findings)
- Building `units_by_date` from transactions (the replay of folio transactions into per-scheme unit timelines). **No task in the plan owns it yet**; the orchestrator will assign it when HB3 (movers) is written, because movers also needs previous-close units.
- A loader for `benchmark_index_history` levels (it belongs with T11, the routes).
- Any route, schema, migration, enum value, model change or `decisions.md` text. No change to `compute_holdings`, `nav.py` or any Dashboard route.

## Test commands (run only these; no full suite)
The Windows `backend\.venv-win` on this laptop is incomplete (Python 3.13, a missing module breaks the route tests); **use the WSL venv (Python 3.14), which the orchestrator checked: the baseline files pass (44 passed).** This overrides the `backend\.venv\Scripts\python.exe` line in the worker brief. From PowerShell, with the working directory set by `--cd` (no quoting of the space in the path is needed):
```
wsl.exe -d Ubuntu --cd "D:\Unifolio code\backend" -- .venv/bin/python -m pytest tests/services/home/test_series.py tests/services/analytics/test_portfolio_disclosure_retention.py tests/api/test_coverage_gaps_routes.py -q -p no:cacheprovider --disable-warnings
```
If your shell is already inside WSL: `cd backend` then `.venv/bin/python -m pytest <same files> -q -p no:cacheprovider --disable-warnings`. Also run, same way, the neighbours that import what you touched: `tests/scripts/test_refresh_portfolio_disclosures_daily.py`, `tests/services/dashboard/test_holdings.py`, `tests/services/dashboard/test_xirr.py`. Report each command and its last lines. If a run stalls or the sandbox blocks it, report BLOCKED with the exact error; do not edit configs to work around it.

## Constraints
`Decimal` never `float` (no `float()` calls, no float literals in the new module). TDD: see each new test fail for the right reason first, and say which ones were RED. Additive only. **Allowed files:** `backend/app/api/cas_imports.py`, `backend/app/services/analytics/portfolio_disclosure_retention.py`, `backend/app/services/home/__init__.py`, `backend/app/services/home/series.py`, `backend/tests/api/test_coverage_gaps_routes.py`, `backend/tests/services/analytics/test_portfolio_disclosure_retention.py`, `backend/tests/services/home/__init__.py`, `backend/tests/services/home/test_series.py`, and this handoff's Report block. Do not touch anything else (`infra/`, `Docs/` apart from the Report, migrations, models, mobile code, frontend, `holdings.py`, `nav.py`). Git is read-only (`status`, `diff`, `log`, `show`, `grep`, `ls-files`); never `add`, `commit`, `stash`, `checkout`. Write files with LF endings and UTF-8 (a text-mode write once turned a file into CRLF; check with `git diff --check` and `git ls-files --eol`). Match the surrounding code's comment density.

## Review Focus (for the gate)
Modified Dietz sign and weights (withdrawals, the multiply-then-divide order, flows on `start` and after `end`, denominator at or below zero); forward-fill and first-NAV edges in `build_value_series` and that a missing NAV is reported as partial rather than priced at zero; the single-query claim and the lookback boundary in `load_navs_by_scheme`; month-end and leap-day clamping in `period_range`; the custom-range clamp; the retention off-by-one (six months kept, newest WRITTEN still protected) and that the old three-month tests were re-derived rather than loosened; the invalidation is after the commit and absent on every failure path.

## Approaches considered and rejected
`dateutil.relativedelta` for month and year arithmetic (a new dependency); a NAV query per scheme per date (the 1.2 to 29 s build the spec forbids); a window function for the lookback (not portable between the SQLite tests and PostgreSQL); returning floats for percentages (money maths must stay `Decimal`); putting the transaction replay in this run (no owning task, see Out of scope).

## Open questions
Anything the code shows that this handoff did not say goes under Findings; behaviour or interface questions under Open questions. Do not guess. If a shape above cannot work with the real models, stop on that point and say why.

## Report (Codex fills this in at the end, in one fenced block)
```
CODEX REPORT — ui-redesign — HB2
Run date/time:    Environment:    Python:    Baseline HEAD:
1. TASK STATUS:
2. FILES: New (untracked) / Modified / Pre-existing changes left alone / Staged (must be empty)
3. TESTS: RED command and last lines; GREEN commands with exact counts; neighbours; git diff --check; LF/UTF-8 check
4. DEVIATIONS (mechanics only):
5. FINDINGS (what the code showed that this handoff did not say):
6. OPEN QUESTIONS / BLOCKERS:
7. SELF-REVIEW FINDINGS:
8. CONFIRMATIONS: No git write commands:   Full suites not run:   Edits only in the allowed files:
```
