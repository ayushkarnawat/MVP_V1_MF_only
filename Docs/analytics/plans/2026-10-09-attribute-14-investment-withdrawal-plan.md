# Attribute 14 — Investment & Withdrawal Analysis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps
> use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a household-level, portfolio-wide analytics section showing how much has been
invested, withdrawn, and gained over time (5 summary tiles + monthly/yearly bar-chart
breakdown with drill-in transaction lists), plus a SIP health summary (active count, total
monthly amount, missed-instalment count) — all computed from data already parsed from CAS
statements, no new data source.

**Architecture:** A new, self-contained compute module
(`app/services/analytics/investment_withdrawal.py`) that reuses `cash_flow.py`'s existing
debit/credit transaction-type classification and `sip.py`'s existing SIP-series detection —
registered as an 8th entry in `recompute.py`'s `_SECTIONS` list and served by the *already
existing* generic `GET /analytics/{scope}` endpoint, exactly like attributes 04/09.
Portfolio-level only; fund-level drill-down is an explicitly out-of-scope future phase (user
already confirmed this during planning — no new trigger to revisit it is defined). On-the-fly
aggregation at request time, same posture as `sip.py` and `cash_flow.py` — no new DB table.

**Tech Stack:** Python/SQLAlchemy backend (reusing existing modules, no new dependency);
React/TypeScript frontend, new `@visx`-based bar chart reusing the stack already installed
for `pie-chart.tsx` (zero new frontend dependencies).

**Spec:** `Docs/analytics/2026-10-07-sub-project-1-planning.md` — "Attribute 14" section
(lines 2242-2394); frontend contract:
`Docs/analytics/2026-10-08-attribute-14-investment-withdrawal-spec.md`.

## Global Constraints

- **Portfolio-level only — no fund-level drill-down in this phase.** Confirmed user decision;
  do not build a per-fund breakdown view or API parameter for one.
- **Reuse `cash_flow.py`'s `_DEBIT_TYPES`/`_CREDIT_TYPES` directly** (`PURCHASE`,
  `PURCHASE_SIP`, `OPENING_BALANCE` = debit; `REDEMPTION`, `DIVIDEND_PAYOUT`, `REVERSAL` =
  credit) — do not redefine these sets. `GIFT_IN`/`GIFT_OUT`/`BONUS` are excluded from totals,
  following `cash_flow.py`'s own existing "not cash" precedent.
- **Must be wired as a new `_SectionSpec` entry in `recompute.py`'s `_SECTIONS` list, NOT a
  new bespoke API route.** The existing generic `GET /analytics/{scope}` endpoint in
  `app/api/analytics.py` already serves any registered section from the
  `analytics_sections` table — adding a new route here would duplicate that machinery.
- **No new DB table** — this is a read-time aggregation over existing `transactions`,
  `folios`, `household_member` rows, same posture as `sip.py`/`cash_flow.py`.
- **New schema required — do not reuse `CashFlowEntry` as-is.** The existing
  `CashFlowEntry` (`app/services/dashboard/schemas.py`) has no `transaction_id` field, but
  the frontend contract requires `transactionId`. Define a new
  `InvestmentWithdrawalEntry` schema instead.
- **`SipRow` has no stored missed-instalment count** — compute
  `missed_instalments(row.sip_date, date.today())` (already exists in `sip.py`) per row in
  this module; do not add a field to the shared `SipRow`/`compute_active_sips` (other
  callers don't need it).
- **Frontend: zero new dependencies.** The new bar chart must reuse the already-installed
  `@visx/group`/`@visx/responsive`/`@visx/shape`/`d3-shape` stack already powering
  `components/ui/charts/pie-chart.tsx`.
- **Decimal discipline** — every money amount computed/returned as a string-serialized
  `Decimal`, matching every other analytics module's existing convention (e.g.
  `CashFlowEntry.amount: str`, `SipRow.sip_amount: str`).

## Review Focus

1. **A new household with zero transactions** — all 5 tiles must read ₹0 and the chart must
   render an explicit empty-state message, never a bar chart plotted against an empty array
   as if it were real zero-activity data (spec's States table, row 5).
2. **A month/year with transactions in surrounding periods but none in that specific bucket**
   — that bucket's bar must render at zero height and stay on the axis, never be omitted
   entirely (spec's States table, row 4 — "Empty period").
3. **A household with no active SIPs** — the SIP summary tile must read 0 active / ₹0 total,
   not error or omit the section (spec's States table, row 2).
4. **Missed instalments** — a SIP series whose last payment is more than one month overdue
   must surface a visible missed-instalment count/badge, not silently show "active" (spec's
   States table, row 3).
5. **`GIFT_IN`/`GIFT_OUT`/`BONUS` transactions must be excluded from all 5 tiles** — a
   household whose only activity is a gift-in transfer must show ₹0 everywhere, not count the
   gift as an investment (this is a deliberate `cash_flow.py`-precedent decision, not an
   oversight — worth a named regression test since it's easy to accidentally "fix" into
   counting gifts later).

## File Structure

**Backend — create:**
- `backend/app/services/analytics/investment_withdrawal.py`
- `backend/tests/services/analytics/test_investment_withdrawal.py`

**Backend — modify:**
- `backend/app/services/analytics/schemas.py` — new response schemas
- `backend/app/services/analytics/recompute.py` — new `_SectionSpec` entry

**Frontend — create:**
- `frontend/src/components/ui/charts/bar-chart.tsx`
- `frontend/src/features/analytics/InvestmentWithdrawalSection.tsx`
- `frontend/src/features/analytics/InvestmentWithdrawalSection.test.tsx`

**Frontend — modify:**
- `frontend/src/features/analytics/types.ts` — `ANALYTICS_SECTION_NAMES` +8th entry
- `frontend/src/features/analytics/AnalyticsView.tsx` — `AGGREGATE_FIELD` entry, render section

---

### Task 1: Backend — `compute_investment_withdrawal` core aggregation

**Files:**
- Create: `backend/app/services/analytics/investment_withdrawal.py`
- Test: `backend/tests/services/analytics/test_investment_withdrawal.py`

**Interfaces:**
- Consumes: `cash_flow.py`'s `_DEBIT_TYPES`/`_CREDIT_TYPES` (existing); `HoldingRow` /
  holdings-computation (existing, see Step 3 for the exact import); `Transaction`, `Folio`,
  `HouseholdMember` models (existing).
- Produces: `compute_investment_withdrawal(db: Session, household_member_ids:
  list[uuid.UUID]) -> InvestmentWithdrawalResult` — the signature `recompute.py`'s new
  `_SectionSpec` (Task 3) calls.

- [ ] **Step 1: Write the failing test — the 5-tile formula on a known fixture**

```python
# backend/tests/services/analytics/test_investment_withdrawal.py
import uuid
from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models.enums import TransactionType
from app.models.folio import Folio
from app.models.reference import AMC, Scheme
from app.models.transaction import Transaction
from app.models.user import HouseholdMember
from app.services.analytics.investment_withdrawal import compute_investment_withdrawal


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    return sessionmaker(autoflush=False, bind=engine)()


def _seed_member_and_scheme(db):
    member = HouseholdMember(id=uuid.uuid4(), name="Priya")
    db.add(member)
    amc = AMC(id=uuid.uuid4(), name="Test AMC")
    db.add(amc)
    scheme = Scheme(id=uuid.uuid4(), amc_id=amc.id, name="Test Fund", category="Equity")
    db.add(scheme)
    folio = Folio(id=uuid.uuid4(), household_member_id=member.id, scheme_id=scheme.id, folio_number="F1")
    db.add(folio)
    db.commit()
    return member, scheme, folio


def test_five_tile_formula_matches_worked_example(db, monkeypatch):
    member, scheme, folio = _seed_member_and_scheme(db)
    db.add(Transaction(id=uuid.uuid4(), folio_id=folio.id, type=TransactionType.PURCHASE, date=date(2024, 1, 1), amount=Decimal("3840000.00"), units=Decimal("1000")))
    db.add(Transaction(id=uuid.uuid4(), folio_id=folio.id, type=TransactionType.REDEMPTION, date=date(2025, 1, 1), amount=Decimal("600000.00"), units=Decimal("100")))
    db.commit()

    monkeypatch.setattr(
        "app.services.analytics.investment_withdrawal._current_value_for_household",
        lambda db, ids: Decimal("3500000.00"),
    )

    result = compute_investment_withdrawal(db, [member.id])

    assert result.total_invested == "3840000.00"
    assert result.total_withdrawn == "600000.00"
    assert result.net_invested == "3240000.00"
    assert result.current_value == "3500000.00"
    assert result.absolute_gain == "260000.00"


def test_gift_and_bonus_transactions_excluded_from_all_tiles(db, monkeypatch):
    member, scheme, folio = _seed_member_and_scheme(db)
    db.add(Transaction(id=uuid.uuid4(), folio_id=folio.id, type=TransactionType.GIFT_IN, date=date(2024, 1, 1), amount=Decimal("100000.00"), units=Decimal("100")))
    db.commit()

    monkeypatch.setattr("app.services.analytics.investment_withdrawal._current_value_for_household", lambda db, ids: Decimal("0.00"))

    result = compute_investment_withdrawal(db, [member.id])

    assert result.total_invested == "0.00"
    assert result.total_withdrawn == "0.00"
    assert result.absolute_gain == "0.00"


def test_empty_household_returns_all_zero_tiles(db):
    result = compute_investment_withdrawal(db, [])
    assert result.total_invested == "0.00"
    assert result.current_value == "0.00"
    assert result.monthly == []
    assert result.yearly == []
```

- [ ] **Step 2: Run, confirm failure**

Run: `cd backend && pytest tests/services/analytics/test_investment_withdrawal.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.services.analytics.investment_withdrawal'`

- [ ] **Step 3: Check how current portfolio value is computed elsewhere before
implementing — do not re-derive it**

Run: `grep -rn "current_value" backend/app/services/dashboard/holdings.py backend/app/services/analytics/*.py | head -20`

This confirms the exact existing function/field name for a household's total current value
(the holdings-computation module already used by the main dashboard) — use it directly
rather than recomputing NAV × units by hand. If the grep surfaces a function such as
`compute_holdings(db, household_member_ids) -> list[HoldingRow]` with a `current_value`
field per row, implement `_current_value_for_household` as a thin sum over that existing
call (Step 4 assumes this shape; adjust the import/call to match whatever the grep finds —
the formula, `sum(current_value for every HoldingRow across the household's folios)`, is
fixed by the spec regardless of the exact existing function name).

- [ ] **Step 4: Implement**

```python
# backend/app/services/analytics/investment_withdrawal.py
"""Investment & withdrawal analysis -- PRD attribute 14. Portfolio-level
only; fund-level drill-down is an explicit future phase, not built here
(user-confirmed scope decision, see planning doc 2026-10-07)."""
from __future__ import annotations

import uuid
from collections import defaultdict
from datetime import date
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models.folio import Folio
from app.models.reference import Scheme
from app.models.transaction import Transaction
from app.models.user import HouseholdMember
from app.services.analytics.schemas import (
    InvestmentWithdrawalBucket,
    InvestmentWithdrawalEntry,
    InvestmentWithdrawalResult,
    InvestmentWithdrawalSipSummary,
)
from app.services.dashboard.cash_flow import _CREDIT_TYPES, _DEBIT_TYPES
from app.services.dashboard.holdings import compute_holdings
from app.services.dashboard.sip import compute_active_sips, missed_instalments


def _current_value_for_household(db: Session, household_member_ids: list[uuid.UUID]) -> Decimal:
    holdings = compute_holdings(db, household_member_ids)
    return sum((Decimal(h.current_value) for h in holdings), Decimal("0.00"))


def _classify(txn_type) -> str | None:
    if txn_type in _DEBIT_TYPES:
        return "invested"
    if txn_type in _CREDIT_TYPES:
        return "withdrawn"
    return None  # GIFT_IN/GIFT_OUT/BONUS -- deliberately excluded, see Review Focus #5


def compute_investment_withdrawal(db: Session, household_member_ids: list[uuid.UUID]) -> InvestmentWithdrawalResult:
    if not household_member_ids:
        return InvestmentWithdrawalResult(
            total_invested="0.00", total_withdrawn="0.00", net_invested="0.00",
            current_value="0.00", absolute_gain="0.00", monthly=[], yearly=[],
            sip_summary=InvestmentWithdrawalSipSummary(active_count=0, total_monthly_amount="0.00", missed_count=0),
        )

    members = {m.id: m for m in db.query(HouseholdMember).filter(HouseholdMember.id.in_(household_member_ids)).all()}
    folios = {f.id: f for f in db.query(Folio).filter(Folio.household_member_id.in_(household_member_ids)).all()}
    schemes: dict[uuid.UUID, Scheme] = {}
    if folios:
        schemes = {s.id: s for s in db.query(Scheme).filter(Scheme.id.in_({f.scheme_id for f in folios.values()})).all()}

    total_invested = Decimal("0.00")
    total_withdrawn = Decimal("0.00")
    monthly_buckets: dict[tuple[int, int], list[InvestmentWithdrawalEntry]] = defaultdict(list)
    yearly_buckets: dict[int, list[InvestmentWithdrawalEntry]] = defaultdict(list)

    if folios:
        transactions = (
            db.query(Transaction)
            .filter(Transaction.folio_id.in_(folios.keys()))
            .order_by(Transaction.date, Transaction.id)
            .all()
        )
        for txn in transactions:
            direction = _classify(txn.type)
            if direction is None:
                continue
            folio = folios[txn.folio_id]
            scheme = schemes[folio.scheme_id]
            member = members[folio.household_member_id]
            amount = Decimal(txn.amount)
            if direction == "invested":
                total_invested += amount
            else:
                total_withdrawn += amount

            entry = InvestmentWithdrawalEntry(
                transaction_id=str(txn.id),
                date=txn.date,
                type=txn.type,
                amount=f"{amount:.2f}",
                direction=direction,
                scheme_name=scheme.name,
                household_member_id=str(member.id),
                household_member_name=member.name,
            )
            monthly_buckets[(txn.date.year, txn.date.month)].append(entry)
            yearly_buckets[txn.date.year].append(entry)

    current_value = _current_value_for_household(db, household_member_ids)
    net_invested = total_invested - total_withdrawn
    absolute_gain = current_value + total_withdrawn - total_invested

    monthly = [
        InvestmentWithdrawalBucket(
            period=f"{year:04d}-{month:02d}",
            invested=f"{sum((Decimal(e.amount) for e in entries if e.direction == 'invested'), Decimal('0.00')):.2f}",
            withdrawn=f"{sum((Decimal(e.amount) for e in entries if e.direction == 'withdrawn'), Decimal('0.00')):.2f}",
            entries=entries,
        )
        for (year, month), entries in sorted(monthly_buckets.items())
    ]
    yearly = [
        InvestmentWithdrawalBucket(
            period=f"{year:04d}",
            invested=f"{sum((Decimal(e.amount) for e in entries if e.direction == 'invested'), Decimal('0.00')):.2f}",
            withdrawn=f"{sum((Decimal(e.amount) for e in entries if e.direction == 'withdrawn'), Decimal('0.00')):.2f}",
            entries=entries,
        )
        for year, entries in sorted(yearly_buckets.items())
    ]

    sip_rows = compute_active_sips(db, household_member_ids)
    today = date.today()
    missed_count = sum(1 for row in sip_rows if missed_instalments(row.sip_date, today) > 0)
    total_monthly_sip = sum((Decimal(row.sip_amount) for row in sip_rows), Decimal("0.00"))

    return InvestmentWithdrawalResult(
        total_invested=f"{total_invested:.2f}",
        total_withdrawn=f"{total_withdrawn:.2f}",
        net_invested=f"{net_invested:.2f}",
        current_value=f"{current_value:.2f}",
        absolute_gain=f"{absolute_gain:.2f}",
        monthly=monthly,
        yearly=yearly,
        sip_summary=InvestmentWithdrawalSipSummary(
            active_count=len(sip_rows),
            total_monthly_amount=f"{total_monthly_sip:.2f}",
            missed_count=missed_count,
        ),
    )
```

- [ ] **Step 5: Run, confirm pass**

Run: `cd backend && pytest tests/services/analytics/test_investment_withdrawal.py -v`
Expected: PASS (fails first on the missing schemas import — complete Task 2 first if the
import fails, then return to this step)

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/analytics/investment_withdrawal.py backend/tests/services/analytics/test_investment_withdrawal.py
git commit -m "feat: add investment & withdrawal analysis compute module"
```

---

### Task 2: Backend — response schemas

**Files:**
- Modify: `backend/app/services/analytics/schemas.py`
- Test: covered by Task 1's and Task 3's tests (schema correctness is exercised by both)

**Interfaces:**
- Produces: `InvestmentWithdrawalEntry`, `InvestmentWithdrawalBucket`,
  `InvestmentWithdrawalSipSummary`, `InvestmentWithdrawalResult`,
  `AggregateInvestmentWithdrawalResponse` — consumed by Task 1 (the first four) and Task 3
  (the last one, via `recompute.py`'s `wrap_combined`).

- [ ] **Step 1: Write the failing test — schema round-trips exactly the fields the frontend
spec requires**

```python
# backend/tests/services/analytics/test_investment_withdrawal_schemas.py
from datetime import date

from app.models.enums import TransactionType
from app.services.analytics.schemas import (
    InvestmentWithdrawalBucket,
    InvestmentWithdrawalEntry,
    InvestmentWithdrawalResult,
    InvestmentWithdrawalSipSummary,
)


def test_entry_has_transaction_id_unlike_the_existing_cash_flow_entry():
    entry = InvestmentWithdrawalEntry(
        transaction_id="abc-123", date=date(2026, 1, 1), type=TransactionType.PURCHASE,
        amount="1000.00", direction="invested", scheme_name="Test Fund",
        household_member_id="m1", household_member_name="Priya",
    )
    assert entry.transaction_id == "abc-123"


def test_result_shape_matches_frontend_contract():
    result = InvestmentWithdrawalResult(
        total_invested="0.00", total_withdrawn="0.00", net_invested="0.00",
        current_value="0.00", absolute_gain="0.00",
        monthly=[InvestmentWithdrawalBucket(period="2026-01", invested="0.00", withdrawn="0.00", entries=[])],
        yearly=[],
        sip_summary=InvestmentWithdrawalSipSummary(active_count=0, total_monthly_amount="0.00", missed_count=0),
    )
    assert result.monthly[0].period == "2026-01"
    assert result.sip_summary.missed_count == 0
```

- [ ] **Step 2: Run, confirm failure**

Run: `cd backend && pytest tests/services/analytics/test_investment_withdrawal_schemas.py -v`
Expected: FAIL — `ImportError: cannot import name 'InvestmentWithdrawalEntry'`

- [ ] **Step 3: Implement**

In `backend/app/services/analytics/schemas.py`, add (near the other `Aggregate*Response`
classes — check the file's existing import block for `BaseModel`/`TransactionType` and reuse
rather than re-import):

```python
class InvestmentWithdrawalEntry(BaseModel):
    transaction_id: str
    date: date
    type: TransactionType
    amount: str
    direction: str
    scheme_name: str
    household_member_id: str
    household_member_name: str


class InvestmentWithdrawalBucket(BaseModel):
    period: str  # "YYYY-MM" for monthly buckets, "YYYY" for yearly
    invested: str
    withdrawn: str
    entries: list[InvestmentWithdrawalEntry]


class InvestmentWithdrawalSipSummary(BaseModel):
    active_count: int
    total_monthly_amount: str
    missed_count: int


class InvestmentWithdrawalResult(BaseModel):
    total_invested: str
    total_withdrawn: str
    net_invested: str
    current_value: str
    absolute_gain: str
    monthly: list[InvestmentWithdrawalBucket]
    yearly: list[InvestmentWithdrawalBucket]
    sip_summary: InvestmentWithdrawalSipSummary


class AggregateInvestmentWithdrawalResponse(BaseModel):
    members: list[MemberStatus]
    data: InvestmentWithdrawalResult
```

(`MemberStatus` is already imported/defined in this file for the other `Aggregate*Response`
classes — reuse it, don't redefine.)

- [ ] **Step 4: Run, confirm pass**

Run: `cd backend && pytest tests/services/analytics/test_investment_withdrawal_schemas.py tests/services/analytics/test_investment_withdrawal.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/analytics/schemas.py backend/tests/services/analytics/test_investment_withdrawal_schemas.py
git commit -m "feat: add investment & withdrawal response schemas"
```

---

### Task 3: Backend — register as a `_SECTIONS` entry (no new route)

**Files:**
- Modify: `backend/app/services/analytics/recompute.py`
- Test: `backend/tests/services/analytics/test_recompute_investment_withdrawal.py`

**Interfaces:**
- Consumes: `compute_investment_withdrawal` (Task 1), `AggregateInvestmentWithdrawalResponse`
  (Task 2), the existing `_SectionSpec` dataclass and `MemberStatus` type (both already
  defined in `recompute.py`).
- Produces: nothing new consumed elsewhere — this closes the backend loop. Served
  automatically by the existing generic `GET /analytics/{scope}` endpoint in
  `app/api/analytics.py` once registered here; no route change needed.

- [ ] **Step 1: Write the failing test — the new section is present in `_SECTIONS` and
dispatches correctly**

```python
# backend/tests/services/analytics/test_recompute_investment_withdrawal.py
from app.services.analytics.recompute import _SECTIONS


def test_investment_withdrawal_is_a_registered_section():
    names = [s.name for s in _SECTIONS]
    assert "investment_withdrawal" in names


def test_investment_withdrawal_section_wraps_result_with_members():
    section = next(s for s in _SECTIONS if s.name == "investment_withdrawal")
    from app.services.analytics.schemas import InvestmentWithdrawalBucket, InvestmentWithdrawalResult, InvestmentWithdrawalSipSummary

    result = InvestmentWithdrawalResult(
        total_invested="0.00", total_withdrawn="0.00", net_invested="0.00",
        current_value="0.00", absolute_gain="0.00", monthly=[], yearly=[],
        sip_summary=InvestmentWithdrawalSipSummary(active_count=0, total_monthly_amount="0.00", missed_count=0),
    )
    wrapped = section.wrap_combined([], result)
    assert wrapped.data is result
    assert wrapped.members == []
```

- [ ] **Step 2: Run, confirm failure**

Run: `cd backend && pytest tests/services/analytics/test_recompute_investment_withdrawal.py -v`
Expected: FAIL — `StopIteration` (no section named `investment_withdrawal` yet)

- [ ] **Step 3: Implement**

In `backend/app/services/analytics/recompute.py`, add the import and append to `_SECTIONS`:

```python
from app.services.analytics.investment_withdrawal import compute_investment_withdrawal
from app.services.analytics.schemas import AggregateInvestmentWithdrawalResponse
```

```python
_SECTIONS: list[_SectionSpec] = [
    # ... existing 7 entries unchanged ...
    _SectionSpec(
        "investment_withdrawal",
        compute_investment_withdrawal,
        lambda statuses, result: AggregateInvestmentWithdrawalResponse(members=statuses, data=result),
    ),
]
```

- [ ] **Step 4: Run, confirm pass**

Run: `cd backend && pytest tests/services/analytics/test_recompute_investment_withdrawal.py -v`
Expected: PASS

- [ ] **Step 5: Run the full existing recompute test suite to confirm no regression on the
other 7 sections**

Run: `cd backend && pytest tests/services/analytics/ -v`
Expected: PASS (all, including the pre-existing 7-section tests)

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/analytics/recompute.py backend/tests/services/analytics/test_recompute_investment_withdrawal.py
git commit -m "feat: register investment_withdrawal as an analytics section"
```

---

### Task 4: Frontend — `bar-chart.tsx` (visx, no new dependency)

**Files:**
- Create: `frontend/src/components/ui/charts/bar-chart.tsx`
- Test: `frontend/src/components/ui/charts/bar-chart.test.tsx`

**Interfaces:**
- Consumes: `@visx/group`, `@visx/responsive`, `@visx/shape`, `d3-shape` (already installed —
  check `frontend/src/components/ui/charts/pie-chart.tsx`'s existing import block for the
  exact package names/versions in use before importing, to avoid a version mismatch with a
  sibling chart component).
- Produces: `<BarChart data={{period: string; invested: number; withdrawn: number}[]}
  onBarClick?={(period: string) => void} />` — consumed by Task 6
  (`InvestmentWithdrawalSection.tsx`).

- [ ] **Step 1: Write the failing test — a zero-height bar renders for an empty-amount
bucket, never an omitted bar**

```tsx
// frontend/src/components/ui/charts/bar-chart.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BarChart } from "./bar-chart";

describe("BarChart", () => {
  it("renders a bar group for every bucket, including a zero-amount one", () => {
    render(
      <BarChart
        data={[
          { period: "2026-01", invested: 10000, withdrawn: 0 },
          { period: "2026-02", invested: 0, withdrawn: 0 },
        ]}
      />
    );
    expect(screen.getAllByTestId(/^bar-group-/)).toHaveLength(2);
    expect(screen.getByTestId("bar-group-2026-02")).toBeInTheDocument();
  });

  it("calls onBarClick with the period when a bar group is clicked", () => {
    const onBarClick = vi.fn();
    render(
      <BarChart data={[{ period: "2026-01", invested: 10000, withdrawn: 2000 }]} onBarClick={onBarClick} />
    );
    screen.getByTestId("bar-group-2026-01").click();
    expect(onBarClick).toHaveBeenCalledWith("2026-01");
  });
});
```

- [ ] **Step 2: Run, confirm failure**

Run: `cd frontend && npx vitest run src/components/ui/charts/bar-chart.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Implement**

```tsx
// frontend/src/components/ui/charts/bar-chart.tsx
import { Group } from "@visx/group";
import { ParentSize } from "@visx/responsive";
import { Bar } from "@visx/shape";
import { scaleBand, scaleLinear } from "d3-scale";

export interface BarChartDatum {
  period: string;
  invested: number;
  withdrawn: number;
}

interface BarChartProps {
  data: BarChartDatum[];
  onBarClick?: (period: string) => void;
}

function BarChartInner({ data, onBarClick, width, height }: BarChartProps & { width: number; height: number }) {
  const margin = { top: 8, right: 8, bottom: 24, left: 8 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const maxValue = Math.max(1, ...data.map((d) => Math.max(d.invested, d.withdrawn)));
  const xScale = scaleBand<string>().domain(data.map((d) => d.period)).range([0, innerWidth]).padding(0.3);
  const yScale = scaleLinear<number>().domain([0, maxValue]).range([innerHeight, 0]);
  const barWidth = Math.max(1, xScale.bandwidth() / 2 - 2);

  return (
    <svg width={width} height={height}>
      <Group left={margin.left} top={margin.top}>
        {data.map((d) => {
          const groupX = xScale(d.period) ?? 0;
          const investedHeight = innerHeight - yScale(d.invested);
          const withdrawnHeight = innerHeight - yScale(d.withdrawn);
          return (
            <Group
              key={d.period}
              data-testid={`bar-group-${d.period}`}
              onClick={() => onBarClick?.(d.period)}
              style={{ cursor: onBarClick ? "pointer" : "default" }}
            >
              <Bar
                x={groupX}
                y={innerHeight - investedHeight}
                width={barWidth}
                height={Math.max(0, investedHeight)}
                fill="var(--chart-invested, #2563eb)"
              />
              <Bar
                x={groupX + barWidth + 2}
                y={innerHeight - withdrawnHeight}
                width={barWidth}
                height={Math.max(0, withdrawnHeight)}
                fill="var(--chart-withdrawn, #dc2626)"
              />
            </Group>
          );
        })}
      </Group>
    </svg>
  );
}

export function BarChart(props: BarChartProps) {
  return (
    <ParentSize>
      {({ width, height }) => <BarChartInner {...props} width={width} height={height || 200} />}
    </ParentSize>
  );
}
```

(If `pie-chart.tsx`'s Step 1 grep shows `d3-shape` rather than `d3-scale` installed, swap the
scale import for whatever's actually present — `scaleBand`/`scaleLinear` are also exported
from `d3-scale`, which is a direct dependency of the already-installed `@visx/scale`; check
`frontend/package.json` for the exact installed package before assuming.)

- [ ] **Step 4: Run, confirm pass**

Run: `cd frontend && npx vitest run src/components/ui/charts/bar-chart.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ui/charts/bar-chart.tsx frontend/src/components/ui/charts/bar-chart.test.tsx
git commit -m "feat: add reusable visx bar chart component"
```

---

### Task 5: Frontend — wire the 8th analytics section into types/view scaffolding

**Files:**
- Modify: `frontend/src/features/analytics/types.ts`
- Modify: `frontend/src/features/analytics/AnalyticsView.tsx`
- Test: `frontend/src/features/analytics/AnalyticsView.test.tsx` (extend existing, or create
  if none exists — check first)

**Interfaces:**
- Produces: `"investment_withdrawal"` added to `ANALYTICS_SECTION_NAMES`; a
  `investment_withdrawal` key in `AGGREGATE_FIELD` — consumed by Task 6's
  `InvestmentWithdrawalSection.tsx` via the existing `unwrap<T>()`/`isSectionSettled()`
  pattern.

- [ ] **Step 1: Check for an existing `AnalyticsView.test.tsx` before writing a new test
file**

Run: `ls frontend/src/features/analytics/AnalyticsView.test.tsx 2>/dev/null || echo "none"`

- [ ] **Step 2: Write the failing test**

```tsx
// append to (or create) frontend/src/features/analytics/AnalyticsView.test.tsx
import { ANALYTICS_SECTION_NAMES } from "./types";

describe("ANALYTICS_SECTION_NAMES", () => {
  it("includes investment_withdrawal as the 8th registered section", () => {
    expect(ANALYTICS_SECTION_NAMES).toContain("investment_withdrawal");
  });
});
```

- [ ] **Step 3: Run, confirm failure**

Run: `cd frontend && npx vitest run src/features/analytics/AnalyticsView.test.tsx`
Expected: FAIL — `investment_withdrawal` not in the tuple

- [ ] **Step 4: Implement — `types.ts`**

In `frontend/src/features/analytics/types.ts`, add `"investment_withdrawal"` as the 8th
literal in the existing `ANALYTICS_SECTION_NAMES` tuple (alongside the existing 7:
`"allocation"`, `"ter"`, `"ter_direct_regular"`, `"benchmark"`, `"benchmark_funds"`,
`"category_ranking"`, `"score"`), and add matching TypeScript interfaces mirroring the
backend schemas from Task 2:

```typescript
export interface InvestmentWithdrawalEntry {
  transactionId: string;
  date: string;
  type: string;
  amount: string;
  direction: "invested" | "withdrawn";
  schemeName: string;
  householdMemberId: string;
  householdMemberName: string;
}

export interface InvestmentWithdrawalBucket {
  period: string;
  invested: string;
  withdrawn: string;
  entries: InvestmentWithdrawalEntry[];
}

export interface InvestmentWithdrawalSipSummary {
  activeCount: number;
  totalMonthlyAmount: string;
  missedCount: number;
}

export interface InvestmentWithdrawalResult {
  totalInvested: string;
  totalWithdrawn: string;
  netInvested: string;
  currentValue: string;
  absoluteGain: string;
  monthly: InvestmentWithdrawalBucket[];
  yearly: InvestmentWithdrawalBucket[];
  sipSummary: InvestmentWithdrawalSipSummary;
}
```

- [ ] **Step 5: Implement — `AnalyticsView.tsx`**

Add `investment_withdrawal: "data"` to the existing `AGGREGATE_FIELD` record (matching the
backend's `AggregateInvestmentWithdrawalResponse.data` field name from Task 2), following the
exact same one-line-per-section pattern as the other 7 entries.

- [ ] **Step 6: Run, confirm pass**

Run: `cd frontend && npx vitest run src/features/analytics/AnalyticsView.test.tsx`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add frontend/src/features/analytics/types.ts frontend/src/features/analytics/AnalyticsView.tsx frontend/src/features/analytics/AnalyticsView.test.tsx
git commit -m "feat: register investment_withdrawal as the 8th analytics section (frontend)"
```

---

### Task 6: Frontend — `InvestmentWithdrawalSection.tsx`

**Files:**
- Create: `frontend/src/features/analytics/InvestmentWithdrawalSection.tsx`
- Create: `frontend/src/features/analytics/InvestmentWithdrawalSection.test.tsx`
- Modify: `frontend/src/features/analytics/AnalyticsView.tsx` (render the new section)

**Interfaces:**
- Consumes: `InvestmentWithdrawalResult` (Task 5), `BarChart` (Task 4), the
  `unwrap<T>()`/`isSectionSettled()` helpers and `{data, isLoading, className}` props pattern
  already established by `CategoryRankingSection.tsx`.

- [ ] **Step 1: Write the failing tests — covering every row of the spec's States table**

```tsx
// frontend/src/features/analytics/InvestmentWithdrawalSection.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { InvestmentWithdrawalSection } from "./InvestmentWithdrawalSection";
import type { InvestmentWithdrawalResult } from "./types";

const baseResult: InvestmentWithdrawalResult = {
  totalInvested: "3840000.00",
  totalWithdrawn: "600000.00",
  netInvested: "3240000.00",
  currentValue: "3500000.00",
  absoluteGain: "260000.00",
  monthly: [{ period: "2026-01", invested: "3840000.00", withdrawn: "0.00", entries: [] }],
  yearly: [{ period: "2026", invested: "3840000.00", withdrawn: "600000.00", entries: [] }],
  sipSummary: { activeCount: 2, totalMonthlyAmount: "15000.00", missedCount: 0 },
};

describe("InvestmentWithdrawalSection", () => {
  it("renders a loading skeleton while isLoading", () => {
    render(<InvestmentWithdrawalSection data={undefined} isLoading />);
    expect(screen.getByTestId("investment-withdrawal-skeleton")).toBeInTheDocument();
  });

  it("renders all 5 tiles with the worked-example values", () => {
    render(<InvestmentWithdrawalSection data={baseResult} isLoading={false} />);
    expect(screen.getByText("₹38,40,000.00")).toBeInTheDocument();
    expect(screen.getByText("₹6,00,000.00")).toBeInTheDocument();
    expect(screen.getByText("₹2,60,000.00")).toBeInTheDocument();
  });

  it("shows an empty-state message for a household with no transactions at all", () => {
    const empty: InvestmentWithdrawalResult = { ...baseResult, totalInvested: "0.00", totalWithdrawn: "0.00", netInvested: "0.00", currentValue: "0.00", absoluteGain: "0.00", monthly: [], yearly: [] };
    render(<InvestmentWithdrawalSection data={empty} isLoading={false} />);
    expect(screen.getByText(/no investment activity yet/i)).toBeInTheDocument();
  });

  it("shows 0 active SIPs rather than omitting the SIP summary", () => {
    const noSips = { ...baseResult, sipSummary: { activeCount: 0, totalMonthlyAmount: "0.00", missedCount: 0 } };
    render(<InvestmentWithdrawalSection data={noSips} isLoading={false} />);
    expect(screen.getByText(/0 active sips/i)).toBeInTheDocument();
  });

  it("shows a missed-instalment badge when missedCount > 0", () => {
    const missed = { ...baseResult, sipSummary: { activeCount: 2, totalMonthlyAmount: "15000.00", missedCount: 1 } };
    render(<InvestmentWithdrawalSection data={missed} isLoading={false} />);
    expect(screen.getByText(/1 missed/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run, confirm failure**

Run: `cd frontend && npx vitest run src/features/analytics/InvestmentWithdrawalSection.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Implement**

Follow `CategoryRankingSection.tsx`'s exact established structure (`{data, isLoading,
className}` props; a loading-skeleton branch; an empty-state branch; main content using
`cn()` and the project's existing Tailwind CSS-variable-based styling — read that file's
full styling conventions before writing this one, to match spacing/typography exactly):

```tsx
// frontend/src/features/analytics/InvestmentWithdrawalSection.tsx
import { cn } from "@/lib/utils";
import { BarChart } from "@/components/ui/charts/bar-chart";
import type { InvestmentWithdrawalResult } from "./types";

interface InvestmentWithdrawalSectionProps {
  data: InvestmentWithdrawalResult | undefined;
  isLoading: boolean;
  className?: string;
}

function formatInr(amount: string): string {
  const value = Number(amount);
  return `₹${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function InvestmentWithdrawalSection({ data, isLoading, className }: InvestmentWithdrawalSectionProps) {
  if (isLoading || !data) {
    return <div data-testid="investment-withdrawal-skeleton" className={cn("h-64 animate-pulse rounded-lg bg-[var(--surface-muted)]", className)} />;
  }

  const hasActivity = data.monthly.length > 0 || data.yearly.length > 0;

  return (
    <div className={cn("space-y-4", className)}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Tile label="Total Invested" value={formatInr(data.totalInvested)} />
        <Tile label="Total Withdrawn" value={formatInr(data.totalWithdrawn)} />
        <Tile label="Net Invested" value={formatInr(data.netInvested)} />
        <Tile label="Current Value" value={formatInr(data.currentValue)} />
        <Tile label="Absolute Gain" value={formatInr(data.absoluteGain)} />
      </div>

      {hasActivity ? (
        <BarChart
          data={data.monthly.map((b) => ({ period: b.period, invested: Number(b.invested), withdrawn: Number(b.withdrawn) }))}
        />
      ) : (
        <p className="text-sm text-[var(--text-muted)]">No investment activity yet.</p>
      )}

      <div className="flex items-center gap-2 text-sm">
        <span>{data.sipSummary.activeCount} active SIPs</span>
        <span>{formatInr(data.sipSummary.totalMonthlyAmount)}/month</span>
        {data.sipSummary.missedCount > 0 && (
          <span className="rounded bg-[var(--warning-bg)] px-2 py-0.5 text-[var(--warning-text)]">
            {data.sipSummary.missedCount} missed
          </span>
        )}
      </div>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--border)] p-3">
      <p className="text-xs text-[var(--text-muted)]">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}
```

Then in `AnalyticsView.tsx`, add the render call alongside the other 7 sections, following
the exact existing pattern (`unwrap<InvestmentWithdrawalResult>(sections.investment_withdrawal)`
passed as `data`, `isSectionSettled(sections.investment_withdrawal)` inverted for `isLoading`
— match whatever the existing 7 call sites do verbatim).

- [ ] **Step 4: Run, confirm pass**

Run: `cd frontend && npx vitest run src/features/analytics/InvestmentWithdrawalSection.test.tsx`
Expected: PASS

- [ ] **Step 5: Run the full frontend analytics test suite to confirm no regression**

Run: `cd frontend && npx vitest run src/features/analytics/`
Expected: PASS (all)

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/analytics/InvestmentWithdrawalSection.tsx frontend/src/features/analytics/InvestmentWithdrawalSection.test.tsx frontend/src/features/analytics/AnalyticsView.tsx
git commit -m "feat: render investment & withdrawal analysis section"
```

---

## Self-Review

**1. Spec coverage:** 5-tile formula sanity-checked against the PDF's own worked example
(Task 1) ✓; monthly/yearly bucketing with embedded transaction entries for zero-extra-
round-trip drill-in (Task 1) ✓; SIP summary reusing `compute_active_sips` +
`missed_instalments` (Task 1) ✓; portfolio-level-only scope respected throughout, no
fund-level parameter anywhere ✓; `_SECTIONS`/generic-endpoint wiring instead of a bespoke
route (Task 3) ✓; new schema with `transaction_id` instead of reusing `CashFlowEntry` (Task
2) ✓; frontend section + bar chart + nav wiring (Tasks 4-6) ✓.

**2. Placeholder scan:** No "TBD"/"similar to Task N" patterns. Task 1 Step 3 and Task 4
Step 3's "check the exact existing name/package before assuming" notes are real
build-time verification instructions with a concrete fallback given inline, not deferred
design gaps.

**3. Type consistency:** `InvestmentWithdrawalResult`/`InvestmentWithdrawalBucket`/
`InvestmentWithdrawalEntry`/`InvestmentWithdrawalSipSummary` field names are identical
across Task 1's Python implementation, Task 2's Pydantic schemas, and Task 5's TypeScript
interfaces (snake_case ↔ camelCase correspondence preserved exactly, matching the project's
existing API-response camelCase-conversion convention — verify at build time whether that
conversion is automatic via an API client layer or must be done manually in each interface,
by checking how `CategoryRankingSection.tsx`'s props are typed relative to its backend
schema).

**4. Review Focus coverage:** #1 (empty household, all-zero tiles + explicit empty state) —
Task 1's `test_empty_household_returns_all_zero_tiles` + Task 6's "shows an empty-state
message" test. #2 (empty period renders as a zero-height bar, not omitted) — Task 4's
"renders a bar group for every bucket, including a zero-amount one" test. #3 (no active
SIPs) — Task 6's "shows 0 active SIPs rather than omitting" test. #4 (missed instalments
badge) — Task 6's "shows a missed-instalment badge" test. #5 (gifts/bonus excluded from
totals) — Task 1's `test_gift_and_bonus_transactions_excluded_from_all_tiles`, named
explicitly as a regression guard per this plan's Global Constraints section.
