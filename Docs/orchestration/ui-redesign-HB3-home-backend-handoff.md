# Handoff: ui-redesign HB3 (units replay, today's movers, greeting summary)
**Status:** READY (not yet run)
**Parent plan:** `Docs/superpowers/plans/2026-10-23-home-backend-plan.md` Tasks **T8 (movers), T6 (summary)** plus a **new first task, the transactions-to-units replay** that `build_value_series` (HB2) consumes (owner decision 25 Oct). **T7 (allocation) is NOT in this run**: the spec and the plan contradict each other on where the donut comes from and the owner must decide first (see "Deferred from this run"). Spec: `Docs/orchestration/2026-10-23-home-functionality-backend-spec.md` sections 3 and 6; B2 is price movement only; B5 excludes new money. Run catalogue: `2026-10-24-ui-redesign-orchestrator-handoff.md` section 6, run **HB3**.
**Branch:** `feat/home-snapshot` (HB1 `511f1ef`, HB2 `4b4e4e1f`; PR #10). **Orchestrator:** Claude Code · **Worker:** Codex (manual relay). One working tree, one run at a time: do not switch branches. The shapes below are decided by the orchestrator and are exact; where the plan names a function but not its shape, this document wins.

Do the three tasks in this order, each test-first. Each new module is under `backend/app/services/home/` (the package exists from HB2). Money, units and NAV are `Decimal` everywhere, never `float`. Pure functions never read the clock or the database; the few DB readers are named and tested for their statement counts.

---

## Task 0: `units.py`, the transactions-to-units replay
Faithfully reuses the holdings code's own rules so Home can never drift from the Dashboard (`app/services/lot_rules.py` is the one place that says how each transaction type changes a folio's lots).

```python
def build_units_timeline(
    db: Session,
    household_member_ids: Sequence[uuid.UUID],
    *,
    scheme_ids: frozenset[uuid.UUID] | None = None,
) -> dict[uuid.UUID, list[tuple[date, Decimal]]]:
```
- Load with `_load_folio_transactions(db, list(household_member_ids), scheme_ids=scheme_ids)` and `FifoState` from `app/services/dashboard/holdings.py` (import them; **do not edit that file**). Their order (date, adding rows before consuming rows, then id) must be kept.
- Per folio, apply each transaction with `FifoState.apply`; after the **last** transaction of each date, the folio's `FifoState.units` is its units held from the close of that date.
- Per scheme, sum across every folio of every requested member (plan types and members are not separated). Result per scheme: ascending `(date, total_units)` with one entry for each date on which the scheme's total changed from the previous entry; the implicit starting total is 0, so a first entry of 0 is never emitted. A scheme whose total returns to 0 gets an entry with `Decimal("0")`, and a later purchase gets another entry.
- Empty member list returns `{}` and runs no query. Exactly **one folio query and one transaction query** regardless of how many schemes (the test counts statements).
- Same-day rows follow the existing ordering, so a purchase and a redemption on one date net on that date.
Tests first, in `backend/tests/services/home/test_units.py` (use the fixture style of `backend/tests/services/dashboard/test_holdings.py`): single-folio purchase, SIP and redemption timeline with hand-computed units; two folios of one scheme summed; two members aggregated versus one member alone; same-day purchase plus redemption; the types that change units (`OPENING_BALANCE`, `BONUS`, `SEGREGATION`, `DIVIDEND_REINVEST`, `SWITCH_IN`, `GIFT_IN` add; `SWITCH_OUT`, `GIFT_OUT` remove; `REVERSAL` cancels the matching earlier lot) and the types that do not (`DIVIDEND_PAYOUT`, `STT`, `STAMP_DUTY`, `MISC`); a fully redeemed scheme ends with a 0 entry and a later purchase restarts it; `scheme_ids` filter; the statement-count test; and **parity**: for a mixed fixture, the last timeline units of every scheme equal the sum of `_process_folio_lots(...)` units over that scheme's folios (this is the guard against drift).

## Task 1: T8 `movers.py` (today's contributors; the most important file)
**V1 verified by the orchestrator (do not re-litigate):** `HoldingRow.today_gain` is `(current NAV - previous NAV) * current units`, so a purchase made on the NAV date would count as gain, and it is 0 for statement-priced funds. It does **not** equal the price-only rule (B2, B5). Therefore movers computes its own change from the units timeline and the bulk NAV read: `previous-close units * (latest NAV - previous NAV)`. The summary headline must come from this same function so the two always agree.

Inputs and outputs (exact):
```python
@dataclass(frozen=True)
class FundInput:
    scheme_id: uuid.UUID
    name: str
    category: str                                          # label for the category view; "" is treated as "Other"
    units_timeline: Sequence[tuple[date, Decimal]]         # from build_units_timeline
    navs: Sequence[tuple[date, Decimal]]                   # ascending, from load_navs_by_scheme (HB2)
    statement_priced: bool = False                         # price comes from a statement, not a daily NAV
    sector_weights: Mapping[str, Decimal] | None = None    # label -> percent of fund NAV; None = no disclosure

@dataclass(frozen=True)
class FundChange:
    scheme_id: uuid.UUID
    name: str
    category: str
    change: Decimal                 # rupees, quantized to 0.01 (see distribute_cents), never negative zero
    current_value: Decimal          # latest units * latest NAV
    previous_value: Decimal         # previous-close units * previous NAV

@dataclass(frozen=True)
class MoverBar:
    key: str                        # fund: str(scheme_id); category and sector: the label
    label: str
    change: Decimal                 # 0.01-quantized
    scheme_ids: tuple[uuid.UUID, ...]   # funds that contributed (for the popup); sorted by str

@dataclass(frozen=True)
class MoversView:
    gains: tuple[MoverBar, ...]     # up to 2 bars with change > 0, largest first
    losses: tuple[MoverBar, ...]    # up to 2 bars with change < 0, most negative first
    others_count: int               # bars not shown (including zero-change bars)
    others_change: Decimal          # net of every bar not shown
    # invariant: sum(gains) + sum(losses) + others_change == net_change, exactly

@dataclass(frozen=True)
class Movers:
    requested_view: Literal["fund", "category", "sector"]
    view: Literal["fund", "category", "sector"]   # the view actually used
    fell_back: bool                               # True when sector was requested but coverage < 50
    estimated: bool                               # True only when view == "sector"
    coverage_pct: Decimal | None                  # only for the sector request, 2 dp, else None
    net_change: Decimal                           # 0.01-quantized sum of every fund's change
    previous_value: Decimal
    net_pct: Decimal | None                       # net_change / previous_value * 100, 4 dp ROUND_HALF_UP; None when previous_value <= 0
    as_of_nav_date: date | None                   # the latest NAV date any fund has (<= as_of)
    previous_nav_date: date | None                # the previous NAV date of the funds that have as_of_nav_date
    partial: bool
    stale_scheme_ids: tuple[uuid.UUID, ...]       # latest NAV older than as_of_nav_date; excluded; sorted by str
    missing_scheme_ids: tuple[uuid.UUID, ...]     # held but no NAV at all; excluded; sorted by str
    funds: tuple[FundChange, ...]                 # every included fund, largest absolute change first (ties by name)
    result: MoversView

def distribute_cents(exact: Mapping[K, Decimal]) -> tuple[dict[K, Decimal], Decimal]: ...
def spread_cents(total: Decimal, weights: Mapping[K, Decimal]) -> dict[K, Decimal]: ...
def compute_movers(funds: Sequence[FundInput], as_of: date, view: Literal["fund", "category", "sector"] = "sector") -> Movers: ...
def load_sector_weights(db: Session, scheme_ids: Collection[uuid.UUID], as_of: date) -> dict[uuid.UUID, dict[str, Decimal]]: ...
```
Rules (decided; every one needs a test):
1. **Per-fund day change.** `L` = the latest NAV row with date `<= as_of`; `P` = the latest NAV row strictly before `L`. `previous units` = units from `units_timeline` as at the close of `P`'s date (the latest entry with date `<= P`, else 0); `current units` the same for `L`'s date. `change_exact = previous_units * (nav_L - nav_P)`; `previous_value = previous_units * nav_P`; `current_value = current_units * nav_L`. Units bought **on** `L` therefore do not count (previous units exclude them); units redeemed on `L` still count at the price move (they were held at the previous close). A fund with no NAV row before `L` has `change_exact = 0` and is still included. `statement_priced` funds have `change_exact = 0` (statement prices are weeks apart; same rule as `compute_holdings`).
2. **Which funds count.** A fund is eligible when `previous_units > 0` or `current_units > 0`. `as_of_nav_date` = the maximum `L` over eligible funds with a NAV; only funds whose own `L` equals it are included. Eligible funds with an older `L` go to `stale_scheme_ids`; eligible funds with no NAV row at all go to `missing_scheme_ids`; either makes `partial` True. No eligible fund: `as_of_nav_date` and `previous_nav_date` are None, `net_change` 0, `net_pct` None, empty bars. `previous_nav_date` is the latest `P` among included funds that have one.
3. **Cents (`distribute_cents`).** Convert every fund's exact change to 0.01 amounts whose sum is exactly `round(sum of exact, 2)` (ROUND_HALF_UP): floor each to cents, give the missing cents (fewer than the number of funds) one each to the largest fractional remainders, ties broken by key ascending (`str(key)`). Works for negatives (floor is toward negative infinity). `net_change` is that rounded sum. **Examples:** `{a: 33.333, b: 33.333, c: 33.334}` gives `{a: 33.33, b: 33.33, c: 33.34}` with total `100.00`; `{a: -10.005, b: -10.005}` gives `{a: -10.00, b: -10.01}` with total `-20.01`.
4. **`spread_cents(total, weights)`.** Spread a 0.01-quantized `total` over positive `weights` pro-rata so the parts sum to `total` exactly: apply to `abs(total)` with the same floor and largest-remainder rule (ties by key ascending), then restore the sign. A zero total gives all zeros. **Examples:** `spread_cents(10.00, {A:1, B:1, C:1})` is `{A: 3.34, B: 3.33, C: 3.33}`; with `-10.00` it is `{A: -3.34, B: -3.33, C: -3.33}`; `spread_cents(90.00, {Banks: 50, Autos: 30, Other: 20})` is `{Banks: 45.00, Autos: 27.00, Other: 18.00}`.
5. **Views.** *fund*: one bar per included fund (`key = str(scheme_id)`, `label = name`). *category*: sum the (already cent-quantized) fund changes per `category` label (`""` becomes `"Other"`). *sector*: take each fund's cent-quantized change and `spread_cents` it over the fund's `sector_weights` (labels are as given; a fund whose weights are `None`, empty or sum to 0 puts its whole change in `"Other"`); sum per label across funds. In every view the bar amounts sum exactly to `net_change` (this is the headline identity). `scheme_ids` on a sector or category bar lists the funds that contributed a non-zero amount to it.
6. **Top bars.** `gains` = the (at most) two bars with `change > 0`, largest first (ties by label); `losses` = the (at most) two bars with `change < 0`, most negative first (ties by label); every other bar, including zero bars, counts in `others_count` and `others_change`. All funds down: `gains` is empty. One fund: it appears as one bar. No funds: all empty.
7. **Sector coverage and fallback.** Coverage = `sum(current_value * min(mapped_weight, 100) / 100) / sum(current_value)` over included funds, where `mapped_weight` is the sum of the fund's weights **excluding the label `"Other"`** (None counts as 0). If `view == "sector"` and coverage `< 50` percent, `compute_movers` returns the **category** view with `fell_back = True`, `estimated = False` and `coverage_pct` filled. `coverage_pct` is only set when sector was requested (2 dp); with zero total current value coverage is `Decimal("0")`. `estimated` is True only when the sector view is used.
8. **No negative zero anywhere** in any output amount: a zero change must print as `0.00` (the reference script showed `Decimal("0") * Decimal("-1")` yields `-0`; normalise).

**`load_sector_weights(db, scheme_ids, as_of)`** (the DB reader; keep it in `movers.py`): for each scheme, take its newest `DisclosureBatch` with `status == WRITTEN` and `as_of_date <= as_of`; for that batch's `SchemeHolding` rows the sector label is `StockMaster.sector` looked up by the row's `isin` when the ISIN exists in `stock_master` with a non-empty sector, **otherwise `"Other"`** (do not use `sector_raw` as a label: for debt rows it carries ratings, not sectors; record this under Findings for the V6 check). The weight of a label is the sum of `pct_to_nav` for its rows (Decimal percent). Schemes with no written batch are absent from the result. It must not issue a statement per scheme: **the number of SQL statements is the same for 1 and for 4 schemes** (assert it). Empty `scheme_ids` returns `{}` with no statement.

**Hand fixture (use exactly this; I computed every expected value with an independent script).** `as_of = 2026-10-23`. All timelines and NAV lists as written; `statement_priced` False unless stated.
- F1 "Alpha Equity", category "Flexi Cap": units `[(10-01, 100.000)]`; NAVs `[(10-21, 50), (10-22, 51), (10-23, 52)]`; weights `{Banks: 60, IT: 40}`. Change `+100.00`.
- F2 "Beta Debt", "Short Duration": units `[(10-01, 200.000)]`; NAVs `[(10-22, 20), (10-23, 19.90)]`; no weights. Change `-20.00`.
- F3 "Gamma Small", "Small Cap": units `[(10-23, 50.000)]` (bought on the NAV date); NAVs `[(10-22, 10), (10-23, 9)]`; no weights. Change `0.00` (previous units 0).
- F4 "Delta Mid", "Flexi Cap": units `[(09-01, 30.000), (10-23, 10.000)]` (20 units redeemed on the NAV date); NAVs `[(10-22, 100), (10-23, 103)]`; weights `{Banks: 50, Autos: 30, Other: 20}`. Change `+90.00`.
- F5 "Epsilon", "Large Cap": units `[(10-01, 10.000)]`; NAVs `[(10-21, 5.00), (10-22, 5.50)]`. Latest NAV 10-22 is older than 10-23: **stale**, excluded.
Expected: `as_of_nav_date` 2026-10-23, `previous_nav_date` 2026-10-22, `partial` True, `stale_scheme_ids == (F5,)`, `net_change` `170.00`, `previous_value` `12100`, `net_pct` `1.4050`. **Fund view:** gains `[F1 +100.00, F4 +90.00]`, losses `[F2 -20.00]`, `others_count` 1 (F3), `others_change` `0.00`. **Category view:** gains `[Flexi Cap +190.00]`, losses `[Short Duration -20.00]`, `others_count` 1 (Small Cap `0.00`). **Sector view** (current values F1 5200, F2 3980, F3 450, F4 1030; covered value 6024; coverage `56.51` percent so no fallback): sector totals `Banks 105.00, IT 40.00, Autos 27.00, Other -2.00` (F1 and F4 spread by weights, F2 and F3 entirely `Other`); gains `[Banks +105.00, IT +40.00]`, losses `[Other -2.00]`, `others_count` 1 (Autos `+27.00`), `estimated` True. Every view satisfies `sum(gains) + sum(losses) + others_change == net_change`. **Fallback:** the same fixture with F1 and F4 `sector_weights=None` has coverage `0.00` percent, so the sector request returns the category view with `fell_back` True and `estimated` False.
More tests: holiday (`as_of` a Saturday: `L` is the Friday NAV, `previous_nav_date` the Thursday); one fund only; all funds down (no gains); a fund fully redeemed on `L` (`previous_units > 0`, `current_units == 0`) still counts; a statement-priced fund contributes `0.00`; a fund with no NAV at all is in `missing_scheme_ids`; a fund with one NAV row only has change `0.00`; a property-style test over a few hundred seeded random inputs (use `random.Random(seed)`) asserting for all three views that the identity holds exactly and that bar amounts sum to `net_change` and no output is negative zero; `distribute_cents` and `spread_cents` examples above plus their sum invariants; `load_sector_weights` (mapped sector, unmapped ISIN to `"Other"`, newest written batch wins, a pending or failed batch ignored, a batch dated after `as_of` ignored, statement-count test).

## Task 2: T6 `summary.py` (greeting and status line, pure plus one count)
```python
def greeting_for_hour(hour: int) -> str: ...          # "morning" before 12, "afternoon" 12 to 16, "evening" 17 and later
@dataclass(frozen=True)
class Summary:
    display_name: str
    greeting: str                      # "morning" | "afternoon" | "evening"
    scope_label: str                   # "Your family portfolio" or "<Member>'s portfolio"
    change_amount: Decimal
    change_pct: Decimal | None
    direction: Literal["up", "down", "flat"]
    status_phrase: str                 # "up" | "down" | "little changed"
    since_label: str                   # "today" or "since <Weekday>'s close"
    since_date: date | None            # movers.previous_nav_date
    top_contributor: str | None        # fund name
    members_connected: int
    members_total: int
    data_line: str | None              # "Data from n of n family members" or None
def build_summary(*, display_name: str, now_ist: datetime, scope: Literal["aggregate", "member"],
                  member_name: str | None, movers: Movers, members_connected: int, members_total: int) -> Summary: ...
def load_members_connected(db: Session, household_member_ids: Sequence[uuid.UUID]) -> int: ...
```
- `now_ist` is a timezone-aware datetime in `Asia/Kolkata` supplied by the caller (never read the clock; the frontend must not use the device clock). `greeting` from `now_ist.hour`: before 12 morning, 12 to 16 afternoon, 17 onwards evening.
- `scope_label`: aggregate gives `"Your family portfolio"`; member gives `f"{member_name}'s portfolio"`; scope `"member"` with no `member_name` raises `ValueError`.
- `change_amount = movers.net_change`, `change_pct = movers.net_pct`. `direction`/`status_phrase`: "flat"/"little changed" when `change_pct` is None or `abs(change_pct) < 0.05`; else "up" when the change is positive, "down" when negative. (Flat is judged on the percentage, as the spec says; a zero amount is always flat.)
- `since_label`: `"today"` when `movers.as_of_nav_date == now_ist.date()`, otherwise `f"since {movers.previous_nav_date:%A}'s close"` (weekday name in English, for example `since Thursday's close`); if `previous_nav_date` is None the label is `"today"`. `since_date = movers.previous_nav_date`.
- `top_contributor`: from `movers.funds`: if the net change is positive, the fund with the largest positive change; if negative, the fund with the largest loss; if zero, the largest absolute change; `None` when there are no funds or every fund's change is 0.
- `data_line`: `f"Data from {members_connected} of {members_total} family members"` only when `scope == "aggregate"` and `members_total > 1`; otherwise None.
- `load_members_connected`: how many of the given members have at least one `Import` with `status == ImportStatus.CONFIRMED` (the `_has_data` rule in `app/services/dashboard/aggregate.py`), in **one** statement (count distinct `household_member_id`); empty list returns 0 with no statement.
Tests first, in `backend/tests/services/home/test_summary.py`: greeting boundaries (11 morning, 12 afternoon, 16 afternoon, 17 evening, 0 morning); scope labels and the `ValueError`; direction and phrase for up, down, flat by percentage (`0.0499` flat, `0.05` up, `-0.05` down) and for a None percentage; since label on a weekday (`today`) and on a Saturday with the Friday NAV (`since Thursday's close`); top contributor for up, down, zero and no funds; data line present only in aggregate with more than one member; `load_members_connected` with confirmed, pending and no import (one statement). Build the `Movers` input with `compute_movers` from the hand fixture above rather than by hand.

---

## Deferred from this run (do not build)
- **T7 allocation (`allocation.py`)**: the spec (section 5, A1) says the donut comes from the look-through `compute_asset_allocation`, while the plan's T7 test says it must equal the Dashboard allocation (`compute_allocation`, the shallow by-category buckets Equity, Debt, Hybrid, Other). They give different numbers for hybrid and gold funds, the look-through normalises to covered value, and it is the heavy analytics path. **The owner decided option C on 25 Oct** (read the stored `asset_allocation` Analytics section, look-through numbers with no recompute, and fall back to the Dashboard buckets when it is absent). It will be a small run (HB3b) after this one; do nothing about it here.
- Any route, schema, migration, enum value or model change; the benchmark loader; `worth.py`; `recommend_benchmark`. No edit to `holdings.py`, `nav.py`, `series.py` or any Dashboard code.

## Test commands (run only these; no full suite)
Use the WSL venv (Python 3.14); `.venv-win` is incomplete on this laptop. From PowerShell:
```
wsl.exe -d Ubuntu --cd "D:\Unifolio code\backend" -- .venv/bin/python -m pytest tests/services/home -q -p no:cacheprovider --disable-warnings
```
and, same way, the neighbours that use what you import: `tests/services/dashboard/test_holdings.py`, every file `git grep -l "_load_folio_transactions\|FifoState" -- tests` finds, and `tests/services/dashboard/test_xirr.py`. In WSL itself: `cd backend` then `.venv/bin/python -m pytest <files> -q -p no:cacheprovider --disable-warnings`. Report every command and its last lines. If a run stalls or the sandbox blocks it, report BLOCKED with the exact error; do not edit configs.

## Constraints
`Decimal` never `float` (no `float()` and no float literals in the new modules). TDD: see each new test fail for the right reason first and say which were RED. Additive only. **Allowed files:** `backend/app/services/home/units.py`, `movers.py`, `summary.py`, `backend/tests/services/home/test_units.py`, `test_movers.py`, `test_summary.py`, and this handoff's Report block. Touch nothing else. No new dependency; no `dateutil`. Git is read-only (`status`, `diff`, `log`, `show`, `grep`, `ls-files`). LF endings, UTF-8 (check with `git diff --check` and `git ls-files --eol`). Match the surrounding code's comment density; comment only the non-obvious why (the rounding rule and the V1 finding deserve one).

## Review Focus (for the gate)
The previous-close-units rule (a purchase on the NAV date adds no gain; a redemption on it keeps its price move) and that the summary and the movers share one function; the exact cent identity in all three views, including negative amounts and ties; no negative zero; the fallback threshold and the coverage definition; which funds are stale or missing and that they never leak into the headline; the replay's parity with `_process_folio_lots` and its statement count; the sector label rule (stock_master only, never `sector_raw`); the greeting and flat thresholds at their edges.

## Approaches considered and rejected
Reusing `HoldingRow.today_gain` (wrong when units change on the NAV date, zero for statement-priced funds); rounding each bar independently (the bars would not add up to the headline); using `sector_raw` as the sector label (ratings and AMC-specific strings); counting a fund with a disclosure but no mapped sector as covered (the sector view would be meaningless); computing the greeting from the server's wall clock (untestable, and the spec forbids the device clock too).

## Open questions
Anything the code shows that this handoff did not say goes under Findings; behaviour or interface questions under Open questions. Do not guess. If a shape cannot work with the real models, stop on that point and say why.

## Report (Codex fills this in at the end, in one fenced block)
```
CODEX REPORT — ui-redesign — HB3
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
