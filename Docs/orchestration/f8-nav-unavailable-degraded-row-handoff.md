# Handoff: f8-nav-unavailable-degraded-row

**Status:** OPEN (2026-09-02)
**Parent:** `CLAUDE.md` Session State "F8" / `AWS Readiness/sqlite-postgres-migration-compliance-audit.md`
**Dispatch mode:** User is running this directly in their own Codex CLI/app session (not via Claude's `codex:codex-rescue` Agent dispatch) — this doc is the source of truth both sides read; update `Status` here after Codex finishes and report back.

## Task

A held scheme whose NAV can't be fetched (AMFI/mfapi outage, a delisted/unmapped scheme, etc.) currently vanishes silently from holdings/allocation/aggregates — `compute_holdings`'s `if nav_result is None: continue` (`backend/app/services/dashboard/holdings.py:189-190`) just drops the row. User decision (2026-09-02, confirmed): replace this with **a degraded row that stays visible, flagged `nav_unavailable`, with NAV-dependent fields null** — not an error state, not a silent exclusion. Transaction/FIFO-derived fields (units held, invested amount, realized gain, average NAV) are always known regardless of NAV availability and must stay populated even on a degraded row.

### 1. Backend schema — `backend/app/services/dashboard/schemas.py`

`HoldingRow` (currently lines 23-39): make the NAV-dependent fields optional and add the flag:
```python
class HoldingRow(BaseModel):
    scheme_id: str
    scheme_name: str
    amc_name: str
    household_member_id: str
    household_member_name: str
    plan_type: PlanType
    units_held: str
    average_nav: str | None
    current_nav: str | None
    current_nav_date: date | None
    amount_invested: str
    current_value: str | None
    current_profit_total: str | None
    realized_gain: str
    unrealized_gain: str | None
    today_gain: str | None
    nav_unavailable: bool = False
```
(`units_held`, `amount_invested`, `realized_gain` stay required — those never depend on NAV. `average_nav` was already optional for the unrelated "zero units held" edge case; leave as-is.)

`AllocationSummary` (currently lines 74-77): add a count so the UI/API consumer can tell "total_value excludes N holdings" instead of a silently smaller number:
```python
class AllocationSummary(BaseModel):
    by_asset_class: list[AllocationBucket]
    by_amc: list[AllocationBucket]
    total_value: str
    nav_unavailable_count: int = 0
```

### 2. `backend/app/services/dashboard/holdings.py`

In `compute_holdings`, replace the drop (lines 188-190):
```python
nav_result = nav_results[scheme.id]
if nav_result is None:
    continue
current_nav, current_nav_date = nav_result
```
with a branch that still appends a `HoldingRow`, just with the NAV-dependent fields set to `None` and `nav_unavailable=True`:
```python
nav_result = nav_results[scheme.id]
average_nav = (total_cost / total_units) if total_units else None
if nav_result is None:
    rows.append(
        HoldingRow(
            scheme_id=str(scheme.id),
            scheme_name=scheme.name,
            amc_name=scheme.amc_name,
            household_member_id=str(member_id),
            household_member_name=members[member_id].name,
            plan_type=plan_type,
            units_held=str(total_units),
            average_nav=str(average_nav) if average_nav is not None else None,
            current_nav=None,
            current_nav_date=None,
            amount_invested=str(total_cost),
            current_value=None,
            current_profit_total=None,
            realized_gain=str(total_realized),
            unrealized_gain=None,
            today_gain=None,
            nav_unavailable=True,
        )
    )
    continue
current_nav, current_nav_date = nav_result
```
Note `average_nav` gets computed once, ahead of the branch (it's needed on both the degraded and normal path) — pull the existing `average_nav = (total_cost / total_units) if total_units else None` line (currently line 199, inside the normal path) up above the `if nav_result is None` check instead of leaving it below, and delete the now-duplicate line further down. Everything else in the normal (non-degraded) path is unchanged.

### 3. `backend/app/services/dashboard/allocation.py`

`compute_allocation` will crash (`decimal.InvalidOperation`) the moment a degraded row exists, because line 33 does `Decimal(h.current_value)` unconditionally across all holdings. Fix: exclude `nav_unavailable` rows from every summation (`total_value`, `by_class`, `by_amc`), and surface their count instead of just shrinking the total silently:
```python
async def compute_allocation(db: Session, household_member_ids: list[uuid.UUID]) -> AllocationSummary:
    holdings = await compute_holdings(db, household_member_ids)

    valued_holdings = [h for h in holdings if not h.nav_unavailable]
    nav_unavailable_count = len(holdings) - len(valued_holdings)

    total_value = sum((Decimal(h.current_value) for h in valued_holdings), Decimal("0"))

    scheme_ids = {uuid.UUID(h.scheme_id) for h in valued_holdings}
    categories = {s.id: s.sebi_category for s in db.query(Scheme).filter(Scheme.id.in_(scheme_ids)).all()} if scheme_ids else {}

    by_class: dict[str, Decimal] = defaultdict(lambda: Decimal("0"))
    by_amc: dict[str, Decimal] = defaultdict(lambda: Decimal("0"))
    for holding in valued_holdings:
        value = Decimal(holding.current_value)
        by_amc[holding.amc_name] += value
        category = categories.get(uuid.UUID(holding.scheme_id), "")
        by_class[_asset_class_bucket(category)] += value

    def _to_buckets(grouped: dict[str, Decimal]) -> list[AllocationBucket]:
        buckets = []
        for label, value in grouped.items():
            percentage = (value / total_value * 100) if total_value else Decimal("0")
            buckets.append(AllocationBucket(label=label, current_value=str(value), percentage=str(percentage.quantize(Decimal("0.01")))))
        return buckets

    return AllocationSummary(
        by_asset_class=_to_buckets(by_class),
        by_amc=_to_buckets(by_amc),
        total_value=str(total_value),
        nav_unavailable_count=nav_unavailable_count,
    )
```

### 4. `backend/app/services/dashboard/aggregate.py`

No change needed — confirmed it's a thin per-member→family-wide wrapper around `compute_holdings`/`compute_allocation` with no independent NAV logic of its own; the fix in items 2-3 cascades through automatically. Read it during implementation to double-check this holds (don't just take this doc's word for it), but don't add speculative changes here if it does.

### 5. Frontend — `frontend/src/components/HoldingsTable.tsx`

`HoldingRowData` (lines 8-27): mirror the backend schema's optionality:
```typescript
export interface HoldingRowData {
  scheme_id: string;
  scheme_name: string;
  amc_name?: string;
  household_member_id?: string;
  household_member_name?: string;
  plan_type: string; // "DIRECT" | "REGULAR" | "UNKNOWN"
  units_held: string;
  average_nav: string;
  current_nav: string | null;
  current_nav_date?: string | null;
  amount_invested: string;
  current_value: string | null;
  current_profit_total: string | null;
  realized_gain: string;
  unrealized_gain: string | null;
  today_gain: string | null;
  nav_unavailable?: boolean;
  stale_nav?: boolean;
  return_percentage_1y?: number;
}
```
In the row-rendering body (~lines 169-296): guard every NAV-dependent read behind `row.nav_unavailable` rather than letting `formatCurrency`/`formatNumber` silently coerce `null` to `"0"` (their current `isNaN(num) → return "0"` fallback would otherwise render a degraded holding as if it were genuinely worth ₹0, which is worse than the current silent-drop bug, not better). Concretely:
- The `unrealized`/`returnPct` derivation (lines 170-178) must special-case `row.nav_unavailable` — don't feed `null` through `parseFloat`.
- Current NAV cell (~247-260): reuse the existing `stale_nav`-badge pattern (line 253-257) for a new `nav_unavailable` badge — e.g. `{row.nav_unavailable ? <Badge variant="warning">NAV unavailable</Badge> : <span>₹{formatNumber(row.current_nav, 2)}</span>}`. Pick whatever exact copy/badge variant matches this codebase's existing warning-badge conventions (`stale_nav`'s "stale" badge is the direct precedent — match its styling, don't invent a new visual language).
- Current Value cell (~270-276) and Gain/Loss cell (~278-294): render an explicit placeholder (e.g. `"—"` or "Unavailable") instead of `₹{formatCurrency(...)}` / the gain arrow+amount when `row.nav_unavailable` is true.
- Sorting (`sortedHoldings`, lines 58-64): degraded rows' NAV-dependent fields are `null`; `parseFloat(null)` → `NaN` → the existing `|| a[sortField] || 0` fallback already sends them to `0`, which sorts them to the bottom under the default desc-by-`current_value` sort — this is acceptable default behavior, no special-case needed, but don't regress it while editing this function.

Any other consumer of `HoldingRowData`/the holdings API response (search for `current_value`, `unrealized_gain`, etc. across `frontend/src/`) that assumes these fields are always non-null must get the same guard — grep before finishing, don't assume `HoldingsTable.tsx` is the only reader.

## Constraints

- Decimal, never float — the backend changes above only add `None`-handling branches, no new arithmetic; don't introduce any float coercion while touching this code.
- Don't touch `get_navs_on_or_before`/`get_nav_on_or_before`/`get_previous_nav_from_cache` (`app/services/dashboard/nav.py`) — this task is entirely about what `compute_holdings` does with an already-`None` NAV result, not about the fetch/cache layer itself.
- `distributor_comparison.py` (`app/services/dashboard/distributor_comparison.py:~157-158`) has an **identical independent** no-NAV `continue` bug (`get_navs_on_or_before` result checked, dropped silently) but was **not named in F8's original finding scope** — leave it untouched in this task. Flag it back explicitly as a related-but-separate follow-up rather than silently fixing it as a "while we're here" bonus or silently leaving it unmentioned.
- Run the full backend test suite (add/adjust tests for the new degraded-row branch — at minimum: a `compute_holdings` test asserting a scheme with no NAV result produces a `nav_unavailable=True` row with the FIFO fields still populated and NAV fields `None`; a `compute_allocation` test asserting a degraded holding is excluded from `total_value`/buckets but counted in `nav_unavailable_count`) and the full frontend suite (Vitest) — both must stay green.
- Existing tests that assert a no-NAV scheme is absent from `compute_holdings`'s/`compute_allocation`'s output (if any exist — grep `tests/services/dashboard/test_holdings.py` and `test_allocation.py` for a `None`-NAV case) need to be updated to assert the new degraded-row shape instead of absence, not deleted.

## Approaches considered and rejected

- **Explicit error state (option a)** — rejected per user's stated preference (2026-09-02): a per-row error breaks the "one dashboard, one snapshot" mental model and would need new error-rendering UI with no precedent elsewhere in the holdings table.
- **Documented silent exclusion (option c, i.e. keep current behavior but document it)** — rejected; a real held investment quietly disappearing from a portfolio view is the actual bug being fixed, documenting it doesn't address the user-facing problem (a user has no way to know their portfolio total is understated).
- **Falling back to a stale cached NAV instead of `None`** — not pursued; `get_nav_on_or_before` already returns a stale cached value when available (see its own fallback logic in `nav.py`) — a genuine `None` result specifically means *no NAV was ever cached at all* for this scheme, so there's nothing to fall back to. This task only handles the true "never had any NAV" case.

## Open questions

- Exact copy/visual treatment for the new "NAV unavailable" badge — this doc specifies the mechanism (mirror `stale_nav`'s existing badge pattern) but the exact wording/color is a small enough call to make directly during implementation; flag back only if the existing `warning` badge variant doesn't read sensibly for this case.
- Whether any other frontend surface beyond `HoldingsTable.tsx` (allocation charts, aggregate/family dashboard views) reads `current_value`/`unrealized_gain` directly and needs the same null-guard — must be checked by grep during implementation, not assumed to be scoped to this one file.
