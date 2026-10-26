# Handoff: ui-redesign HB3b (Home allocation donut and family bar, owner's option C)
**Status:** DONE (commit `e68e6b0e` on `feat/home-snapshot`, 26 Oct 2026; pushed with the next push)
**Parent plan:** `Docs/superpowers/plans/2026-10-23-home-backend-plan.md` Task **T7 (`allocation.py`)**, with the plan's test "donut equals the Dashboard allocation" **replaced** by the owner's option C (decided 25 Oct): the donut's mix is read from the stored `asset_allocation` Analytics section (look-through numbers, no recompute); when that section is absent, stale or unusable, the Dashboard's shallow buckets are used instead. Spec: `Docs/orchestration/2026-10-23-home-functionality-backend-spec.md` section 5 (A1, A2, family bar). Run catalogue: `2026-10-24-ui-redesign-orchestrator-handoff.md` section 6, run **HB3b**.
**Branch:** `feat/home-snapshot` (HB1 `511f1ef`, HB2 `4b4e4e1f`, HB3 `62d9a4f7`; PR #10, Draft). **Orchestrator:** Claude Code · **Worker:** Codex (manual relay). One working tree, one run at a time: do not switch branches. Shapes below are decided by the orchestrator and are exact; where the plan or spec is looser, this document wins.

This is one small, additive run: one new module `backend/app/services/home/allocation.py` and its test file. No route (that is HB5), no schema, no migration, no edit to any existing file.

## Facts about the stored section (verified by the orchestrator in the code; do not re-derive)
- Written by `app/services/analytics/recompute.py` (`_SECTIONS`, the entry `"asset_allocation"`) into table `analytics_sections` (`app/models/analytics.py`, model `AnalyticsSection`): primary key `(user_id, scope_key, section)`, columns `payload` (JSON), `computed_at` (timezone-aware on Postgres, **naive on SQLite**: treat naive as UTC, the same rule as `should_dispatch_recompute`), `failed_at` (nullable).
- `scope_key` is the literal `"combined"` for the whole household, otherwise `str(household_member_id)` (canonical lowercase hyphenated UUID).
- **The payload shape differs by scope (a trap):** for `"combined"` it is the *wrapped* `AggregateAssetAllocationResponse.model_dump(mode="json")`, i.e. `{"members": [...], "asset_allocation": {<summary>}}`; for a member scope it is the bare `AssetAllocationSummary.model_dump(mode="json")`, i.e. `{<summary>}` with the keys directly at the top. The parser must accept both (unwrap when the key `"asset_allocation"` is present).
- `AssetAllocationSummary` (in `app/services/analytics/schemas.py`) relevant keys: `as_disclosed` and `arbitrage_as_cash` (each an `AssetAllocationVariant` whose `classes` is a list of `{key, value, percentage}` with `key` one of `equity`, `debt`, `gold`, `cash_like`), `total_portfolio_value`, `covered_value`, `nav_as_of` (date string or null), `hide_headlines` (bool), plus others you ignore. `Decimal` values are JSON **strings**; parse with `Decimal(str(x))`.
- `value` of each class is rupees (covered fund value times the disclosure percent); `percentage` is of **covered** value, not of total. Funds with no usable disclosure are outside `covered_value`; derivative and "other" lines are outside every class. **Home uses the `as_disclosed` variant only** (never `arbitrage_as_cash`).
- `hide_headlines` is the Analytics module's own "coverage too thin to show a headline" flag (`HEADLINE_MIN_COVERAGE` in `lookthrough.py`). Home honours it: a flagged section is treated as unusable.
- Sections are replaced by a recompute that the CAS-import confirm route dispatches in the background, so right after an import the **old section is still in the table until the recompute finishes**. Hence the freshness rule below.

## Design (decided)
The Home page must agree to the paisa between the hero total, the donut centre and the family bar. So the stored section supplies only the **mix** (shares), and the rupee **magnitudes always come from the live holdings** (`compute_holdings`, stored prices, the same source as the rest of Home).

Classes (one module constant, plan T7 and spec A2):

| key | label | status |
|---|---|---|
| `equity` | Equity | live |
| `debt` | Debt | live |
| `gold` | Gold | live |
| `others` | Others | live |
| `direct_stocks` | Direct stocks | coming_soon |
| `fds_bonds` | FDs and bonds | coming_soon |
| `real_estate` | Real estate | coming_soon |
| `us_stocks` | US stocks | coming_soon |

```python
ALLOCATION_CLASSES: tuple[tuple[str, str, Literal["live", "coming_soon"]], ...]   # exactly the table above, in this order

@dataclass(frozen=True)
class ClassRow:
    key: str
    label: str
    status: Literal["live", "coming_soon"]
    value: Decimal | None            # live: 0.01-quantized rupees; coming_soon: None
    percentage: Decimal | None       # live: value / total_value * 100, 2 dp ROUND_HALF_UP ("0.00" when total_value is 0); coming_soon: None

@dataclass(frozen=True)
class MemberValue:                   # input to the family bar
    member_id: uuid.UUID
    name: str
    value: Decimal                   # 0.01-quantized rupees

@dataclass(frozen=True)
class MemberShare:                   # output
    member_id: uuid.UUID
    name: str
    value: Decimal
    percentage: Decimal              # value / total_value * 100, 2 dp ROUND_HALF_UP; "0.00" when total_value is 0

@dataclass(frozen=True)
class StoredMix:                     # the validated stored look-through, rupee values at compute time
    equity: Decimal
    debt: Decimal
    gold: Decimal
    others: Decimal                  # total_portfolio_value - equity - debt - gold, never below 0 (holds cash-like, derivative/other lines and funds with no disclosure)
    total_value: Decimal             # the section's total_portfolio_value
    covered_value: Decimal
    nav_as_of: date | None
    computed_at: datetime            # timezone-aware (naive input treated as UTC)

@dataclass(frozen=True)
class Allocation:
    source: Literal["analytics", "dashboard_buckets"]
    approximate: bool                # True only when source == "dashboard_buckets" and total_value > 0
    total_value: Decimal             # live total, 0.01-quantized; the donut centre
    classes: tuple[ClassRow, ...]    # always all 8 rows, in ALLOCATION_CLASSES order
    covered_pct: Decimal | None      # analytics source only: covered_value / total_value (the section's own) * 100, 2 dp ROUND_HALF_UP; else None
    mix_as_of: date | None           # analytics source only: the section's nav_as_of; else None
    mix_computed_at: datetime | None # analytics source only: the section's computed_at; else None
    members: tuple[MemberShare, ...] | None   # None unless a family list was requested (see build_allocation)
```

## Task 1: pure functions, tests first
```python
def parse_stored_allocation(payload: Mapping[str, Any], computed_at: datetime) -> StoredMix | None: ...
def bucket_class(sebi_category: str) -> Literal["equity", "debt", "gold", "others"]: ...
def bucket_values(items: Iterable[tuple[Decimal, str]]) -> dict[str, Decimal]: ...      # (value, sebi_category) pairs -> {"equity","debt","gold","others"}, all four keys always present
def build_allocation(*, total_value: Decimal, mix: StoredMix | None, buckets: Mapping[str, Decimal] | None,
                     members: Sequence[MemberValue] | None) -> Allocation: ...
```
**`parse_stored_allocation`:**
- Unwrap `payload["asset_allocation"]` when present; otherwise treat `payload` as the summary. Read `as_disclosed.classes` into a dict by key; a missing class counts as 0; `cash_like` is read but only counts toward `others` (through the subtraction below).
- Return `None` (never raise) when: any needed key is missing or not parseable as a `Decimal`; `hide_headlines` is true; `total_portfolio_value <= 0`; `covered_value <= 0`; any class value is negative.
- `others = max(total - equity - debt - gold, 0)`.
- `computed_at` naive gets `tzinfo=timezone.utc`. `nav_as_of` parsed from an ISO string, or None.

**`bucket_class` (the fallback mapping, a Home-owned helper; Dashboard code is not edited):** call `asset_class_bucket(sebi_category)` from `app/services/dashboard/allocation_labels.py` (import it): `"Equity"` gives `"equity"`, `"Debt"` gives `"debt"`; for `"Hybrid"` and `"Other"` give `"gold"` when the lower-cased category contains `"gold"` or `"silver"`, else `"others"`. (Hybrid has no look-through in the fallback, so it sits in Others; the result is flagged `approximate`.) The category `""` is `"others"`.

**`build_allocation`:**
1. `total_value` is already 0.01-quantized by the caller. `total_value == 0` returns source `"dashboard_buckets"`, `approximate=False`, the four live rows at `0.00` / `0.00`, `covered_pct=None`, and the members rule below.
2. `mix` given and `total_value > 0`: source `"analytics"`, `approximate=False`. Live values = `spread_cents(total_value, {"equity": mix.equity, "debt": mix.debt, "gold": mix.gold, "others": mix.others})` (import `spread_cents` from `app/services/home/movers.py`: the parts add to `total_value` **exactly**, ties by key ascending). `covered_pct = mix.covered_value / mix.total_value * 100` (2 dp ROUND_HALF_UP). `mix_as_of`, `mix_computed_at` from the mix. A mix whose four weights are all 0 cannot happen (the parser rejects it) but must not crash: treat it as `mix=None`.
3. `mix` is None and `total_value > 0`: `buckets` is required (`ValueError` when None). Live values are the buckets' values for `equity`, `debt`, `gold`, `others` (missing key counts as 0), which the caller has built from the same rows as `total_value`, so they add to it; source `"dashboard_buckets"`, `approximate=True`, `covered_pct`, `mix_as_of`, `mix_computed_at` all None. (Do not re-spread in this branch; the values are already exact. If they do not add to `total_value` raise `ValueError`: a caller bug.)
4. `classes`: the four live rows with `value` and `percentage` as above, then the four `coming_soon` rows with `value=None` and `percentage=None`. Coming-soon classes are in no total.
5. `members`: `None` when the argument is None. Otherwise a tuple of `MemberShare` in the given order (`percentage` as defined above); every given member appears, including one with `0.00` value. The caller passes `None` for member scope and for a single-member household (that rule lives in the loader and is tested there); `build_allocation` just shows what it is given.

## Task 2: the loader (the only DB reader), tests first
```python
async def load_allocation(
    db: Session, user_id: uuid.UUID, *,
    scope: Literal["aggregate", "member"],
    household_member_ids: Sequence[uuid.UUID],     # every member for "aggregate"; exactly the one member for "member"
    members: Sequence[tuple[uuid.UUID, str]],      # every member of the household (id, name) in created order; only used for "aggregate"
) -> Allocation: ...
```
1. `rows = await compute_holdings(db, list(household_member_ids), allow_stale_today=True)`; keep rows with `nav_unavailable` False and `current_value` not None. Each row's value is `quantize_amount(Decimal(row.current_value))` (the holdings module's own helper in `app/core/decimal_utils.py`; confirm it is 0.01 ROUND_HALF_UP, and say so under Findings). `total_value` = the sum of those. Import `compute_holdings` at module level (`from app.services.dashboard.holdings import compute_holdings`) so tests can patch `app.services.home.allocation.compute_holdings`.
2. Stored mix, only when `total_value > 0` (otherwise skip these two queries): `scope_key = "combined"` for `"aggregate"`, `str(household_member_ids[0])` for `"member"`. `section = db.get(AnalyticsSection, (user_id, scope_key, "asset_allocation"))`. **Usable only when all hold:** the row exists; `failed_at is None` (a failed refresh means the stored payload predates the failure); `parse_stored_allocation` returns a mix; and the section is **fresh against imports**: `latest = db.query(func.max(func.coalesce(Import.confirmed_at, Import.uploaded_at))).filter(Import.household_member_id.in_(ids), Import.status == ImportStatus.CONFIRMED).scalar()` and `computed_at >= latest` (compare timezone-aware values, naive as UTC; `latest is None` counts as fresh). Otherwise `mix = None`.
3. Fallback buckets, only when `mix` is None and `total_value > 0`: one query `db.query(Scheme.id, Scheme.sebi_category).filter(Scheme.id.in_(scheme_ids))` for the scheme ids of the kept rows (`""` for a missing category), then `bucket_values((value, category) ...)`.
4. Family list: `MemberValue` per member in `members` (sum of that member's kept rows by `row.household_member_id`, a UUID string; `Decimal("0.00")` when none), passed only when `scope == "aggregate"` **and** `len(members) > 1`; otherwise `None`.
5. Return `build_allocation(...)`.
Statement budget (tests count with a SQLAlchemy `before_cursor_execute` listener, `compute_holdings` patched out): usable stored section is **2** statements (section get, imports max); fallback with a stored section absent is **3** (section get, imports max, scheme categories); zero holdings is **0**.
Reads only. Never call any recompute or dispatch function, never write to `analytics_sections`.

## Hand fixtures (I computed every value independently; use exactly these)
**Stored mix S** (`total_portfolio_value` 90000, `covered_value` 81000, `as_disclosed` classes `equity` 54000, `debt` 18000, `gold` 4500, `cash_like` 4500, `nav_as_of` 2026-10-23, `hide_headlines` false): `others` = 90000 - 54000 - 18000 - 4500 = **13500**.
- Live total `100000.00` gives Equity `60000.00` (60.00), Debt `20000.00` (20.00), Gold `5000.00` (5.00), Others `15000.00` (15.00); `covered_pct` `90.00`; source `analytics`; four coming-soon rows with `None`.
- Live total `100000.01` gives Equity **`60000.01`**, Debt `20000.00`, Gold `5000.00`, Others `15000.00` (the extra cent goes to the largest remainder, Equity: 0.6 of a cent against Debt 0.2, Others 0.15, Gold 0.05); the four add to `100000.01` exactly.
**Fallback fixture** (rows as (value, sebi_category)): `60000.00` "Equity Scheme - Flexi Cap Fund"; `20000.00` "Debt Scheme - Short Duration Fund"; `12000.00` "Hybrid Scheme - Aggressive Hybrid Fund"; `5000.00` "Other Scheme - Gold ETF"; `3000.00` "Other Scheme - Index Funds". Buckets: equity `60000.00`, debt `20000.00`, gold `5000.00`, others `15000.00` (hybrid plus index funds); total `100000.00`; source `dashboard_buckets`, `approximate` True, `covered_pct` None.
**Family:** members A `70000.00`, B `30000.00`, total `100000.00`: percentages `70.00` and `30.00`; add C `0.00`: C is listed with `0.00`/`0.00` and A, B unchanged.

## Tests (every one must be seen RED first; say which)
In `backend/tests/services/home/test_allocation.py`:
1. **Constant:** exactly the eight classes, live and coming-soon statuses and order of the table.
2. **parse_stored_allocation, both shapes, built from the real pydantic models**: construct an `AssetAllocationSummary` (reuse any builder already in `tests/services/analytics` for asset-allocation tests; otherwise minimal valid models) and feed `.model_dump(mode="json")` for the member shape and `AggregateAssetAllocationResponse(members=[...], asset_allocation=summary).model_dump(mode="json")` for the combined shape. Both give the same `StoredMix` for fixture S (others 13500). This guards the payload shape against drift.
3. Parser `None` cases, one test each: missing `as_disclosed`; a non-numeric value; `hide_headlines` true; `total_portfolio_value` 0; `covered_value` 0; a negative class value; the `arbitrage_as_cash` variant is never used (give it different numbers and assert the mix follows `as_disclosed`); equity plus debt plus gold above the total gives `others` 0; naive `computed_at` becomes UTC.
4. `bucket_class`: Equity, Debt, Hybrid (to others), "Other Scheme - Gold ETF" and a silver case (to gold), "Other Scheme - Index Funds" and `""` (to others); `bucket_values` always has the four keys.
5. `build_allocation`: fixture S at `100000.00` and `100000.01` (exact values above); a live total that is not a round multiple (use `33333.33`: assert the parts add to it exactly and no part is negative); a zero stored class (gold 0) gives `0.00`; `mix=None` with the fallback fixture; `mix=None` and `buckets=None` raises `ValueError`; buckets that do not add to the total raise `ValueError`; `total_value == 0` gives zeros, source `dashboard_buckets`, `approximate` False; coming-soon rows carry `None` and the live sum equals `total_value`; family percentages and the zero-value member; `members=None` gives `None`. A seeded random property test (`random.Random(seed)`, a few hundred cases, both sources): the live values add to `total_value` exactly, none is negative, no negative zero.
6. **Loader, on the repo's SQLite test fixtures** (find the pattern in `tests/services/analytics` and `tests/services/dashboard`; patch `compute_holdings` to return prepared `HoldingRow`s, build `Import` and `AnalyticsSection` rows directly):
   - a section written with the **real writer** `recompute._upsert_section` (combined and member shapes) is used (source `analytics`), including the SQLite naive-datetime round trip;
   - absent section gives the fallback; `failed_at` set gives the fallback; `hide_headlines` gives the fallback; malformed payload gives the fallback (no exception);
   - **freshness:** a section computed before the latest confirmed import (use `confirmed_at`, and a second case where only `uploaded_at` is set) gives the fallback; computed at or after it is used; a pending (not confirmed) import newer than the section does not count; another member's later import does not count for a member scope;
   - aggregate scope reads `"combined"`, member scope reads `str(member_id)`; the member scope never reads the combined row;
   - holdings rows with `nav_unavailable` are excluded from the total, the family list and the buckets;
   - family list present for aggregate with two or more members, `None` for member scope and for a one-member household; its values add to `total_value` exactly (the guard);
   - zero holdings: no query is run (statement count 0), all live rows `0.00`;
   - statement counts as stated in Task 2;
   - no write: the `analytics_sections` row is unchanged after a load; assert that `recompute_household_analytics`, `try_claim_recompute` and `dispatcher.dispatch` are not called (patch them to fail).

## Test commands (run only these; no full suite)
Use the WSL venv (Python 3.14); `.venv-win` is incomplete on this laptop. From PowerShell:
```
wsl.exe -d Ubuntu --cd "D:\Unifolio code\backend" -- .venv/bin/python -m pytest tests/services/home -q -p no:cacheprovider --disable-warnings
```
and, the same way, the neighbours that use what you import: `tests/services/dashboard/test_holdings.py`, `tests/services/analytics/test_recompute.py` (or the file `git grep -l "_upsert_section" -- tests` finds), and every file `git grep -l "asset_allocation_lookthrough\|AssetAllocationSummary" -- tests` finds. In WSL itself: `cd backend` then `.venv/bin/python -m pytest <files> -q -p no:cacheprovider --disable-warnings`. Report every command and its last lines. If a run stalls or the sandbox blocks it, report BLOCKED with the exact error; do not edit configs.

## Constraints
`Decimal` never `float` (no `float()` and no float literals in the new module). TDD: see each new test fail for the right reason first and say which were RED. Additive only. Pure functions never read the clock or the database; the loader is the only reader. **Allowed files:** `backend/app/services/home/allocation.py`, `backend/tests/services/home/test_allocation.py`, and this handoff's Report block. Touch nothing else (no Dashboard code, no `movers.py`, no analytics code, no `holdings.py`). No new dependency. Git is read-only (`status`, `diff`, `log`, `show`, `grep`, `ls-files`). LF endings, UTF-8 (check with `git diff --check` and `git ls-files --eol`). Match the surrounding code's comment density and naming.

## Review Focus (for the gate)
The combined-versus-member payload shapes; the freshness and failure rules (a stale or failed section must never feed Home); that magnitudes always come from live holdings and add to the hero total exactly; the exact-cent split (ties by key); `hide_headlines` honoured; fallback honestly flagged `approximate`; the statement counts; that nothing writes or dispatches.

## Approaches considered and rejected
Using the stored rupee values and total directly (the donut centre would disagree with the hero total by a day's NAV movement); recomputing `compute_asset_allocation` on Home (the heavy analytics path; the plan forbids a recompute from Home); calling `compute_allocation` for the fallback (it calls `compute_holdings` without the stored-prices setting and would fetch live NAVs; the Home-owned `bucket_values` over the same rows avoids it and the Dashboard code stays untouched); percentages of covered value as Analytics shows them (Home's donut is of the total value so its slices add to the centre label).

## Open questions
Anything the code shows that this handoff did not say goes under Findings; behaviour or interface questions under Open questions. Do not guess. If a shape cannot work with the real models, stop on that point and say why.

## Report (Codex fills this in at the end, in one fenced block)
```
CODEX REPORT — ui-redesign — HB3b
Run date/time: 2026-10-26 01:24 IST    Environment: Windows PowerShell host / Ubuntu WSL backend venv    Python: 3.14.4    Baseline HEAD: cca86ddd9ad398f18c0cfac4114001a87f2a911f
1. TASK STATUS: DONE — Task 1 pure allocation functions and Task 2 read-only loader implemented test-first.
2. FILES: New (untracked): backend/app/services/home/allocation.py and backend/tests/services/home/test_allocation.py. Modified: this Report block only. Pre-existing left alone: Web app UI mockups MFs.pdf (untracked). Staged: empty.
3. TESTS (RED list, GREEN task runs, final fresh commands): Task 1 RED: listed Home command failed during collection with ModuleNotFoundError for app.services.home.allocation. Task 1 GREEN: `120 passed in 2.44s`. Task 2 RED: listed Home command failed during collection because load_allocation was deliberately absent. Initial Task 2 GREEN: `136 passed in 5.31s`. Self-review regression RED: missing fallback class rendered Decimal('0'), expected 0.01-quantized Decimal('0.00') (`1 failed, 136 passed`); GREEN/final fresh Home command `wsl.exe -d Ubuntu --cd "D:\Unifolio code\backend" -- .venv/bin/python -m pytest tests/services/home -q -p no:cacheprovider --disable-warnings` -> `137 passed in 7.36s`. Final fresh neighbours command with test_holdings.py, test_recompute.py, test_lookthrough_postgres.py, test_asset_allocation_lookthrough.py and test_lookthrough_cross_section_agreement.py -> `75 passed, 2 skipped in 9.25s`. Formatting/encoding checks: clean.
4. DEVIATIONS (mechanics only): no executing-plan scratch ledger was created because the handoff limits edits to its three allowed targets. `git grep -l "_upsert_section" -- tests` found no tracked file, so the explicitly permitted tests/services/analytics/test_recompute.py was used. The asset-allocation grep also selected the Postgres look-through file; its two tests were skipped because no functional Postgres URL was configured.
5. FINDINGS: app/core/decimal_utils.py confirms quantize_amount uses Decimal('0.01') with ROUND_HALF_UP, as the loader requires. No other facts beyond the handoff were found.
6. OPEN QUESTIONS / BLOCKERS: none.
7. SELF-REVIEW FINDINGS: fixed one contract defect test-first: missing fallback classes now retain the required 0.01 Decimal exponent instead of serialising as `0`. No unresolved findings.
8. CONFIRMATIONS: No git write commands: yes. Full suites not run: yes. Edits only in the allowed files: yes.
```

## Orchestrator record (26 Oct 2026)
- **Scope check:** the two new files plus this Report block only; LF, no `float(`, nothing staged. Code read against the handoff: the parser (both payload shapes, every `None` case), the Home-owned bucket mapping, the exact split via `spread_cents`, and the loader (freshness against confirmed imports, `failed_at`, scope key, statement budget, no writes) match the handoff; no deviations.
- **Defect found in Codex's tests (fixed by the orchestrator):** running `test_allocation.py` before `tests/services/analytics/test_recompute.py` made `test_generation_bump_mid_run_stops_stale_writes_and_allows_fresh_dispatch` fail. Cause: the read-only test patched `app.services.analytics.recompute.try_claim_recompute` and then, still inside the patch, imported `app.api.analytics`, which bound the mock for the rest of the session. Codex's own neighbours run missed it because of file order. Fixed with one top-of-file `import app.api.analytics` in the test (reproduced first with the two files in that order; both orders pass now).
- **Defect found by my differential check, in HB3's `spread_cents` (Low, fixed test-first):** Decimal division rounded at 28 digits, so an exact tie (a third of a cent for several keys) was decided by rounding noise instead of key order, against the HB3 rule "ties by key ascending". Example: `24925.25` over weights 2, 8, 65, 0 gave the extra cent to `equity` instead of `debt`. `spread_cents` now works in exact fractions; new test `test_spread_cents_exact_ties_are_broken_by_key_not_by_division_noise` seen RED first. My HB3 differential reference had the same noise (so it never saw this); it now uses fractions too, and the HB3 runs are still 4,500 movers cases and 3,000 cents-helper cases with zero mismatches.
- **Differential check (my script, not committed):** 4,000 random `build_allocation` cases (stored mix, optional family list) against an independent exact-fraction reference: the four live values, the percentages, the coming-soon rows, the family percentages and sums: zero mismatches after the fix; the bucket mapping on 15 categories and 1,000 random fallback sets: zero mismatches.
- **Mutation check:** 35 deliberate bugs in `allocation.py`; 31 caught at first, 4 survived. I added two tests (percentages round half-up; an all-zero stored mix falls back) which close two. The two left are equivalent in practice: dropping the `nav_unavailable` test (real unavailable rows always have `current_value` None, so the second condition covers it) and the `or ""` on a missing category (the default already gives `""`).
- **Independent test run:** 242 passed across `tests/services/home` (137 on Codex's tree plus 3 tests of mine: 2 in allocation, 1 in movers) and the neighbours (holdings, recompute, asset-allocation look-through, look-through, cap allocation, period consistency). Codex's skipped Postgres look-through tests need a functional Postgres URL and are not touched by this change.
- **Review gate:** batched at the PR level (HB5), by the efficiency policy.
- **Findings carried forward (Low, accepted):** the donut uses `as_disclosed` only (the Analytics page's arbitrage-as-cash toggle has no Home equivalent); the stored mix can be up to a day old (the daily recompute) while magnitudes are live; an opening-balance edit does not refresh the stored section until the next recompute (the freshness rule looks at imports only); in the fallback, Hybrid funds sit in Others.
- **Next:** HB4 (T9 worth-a-look, T10 benchmark recommendation) waits for the Mutual Funds backend MB1 (the Smallcap 250 enum); HB5 (T11 routes and T12 synthetic gate). A route may need a `members` list for the family bar: it is the household's members in created order.
