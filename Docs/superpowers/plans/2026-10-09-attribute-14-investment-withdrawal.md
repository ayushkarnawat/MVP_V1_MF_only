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

**Revised 2026-10-09 (pre-execution check against the code at `cd2533d`).** User decisions
of 9 Oct are folded in; the explainer is
`Docs/orchestration/subproject1-execution/a14-investment-withdrawal.html`. What changed and why:
1. The compute function is `async` and awaits `compute_holdings` (the pipeline awaits every
   section — `recompute.py:233`).
2. Test fixtures use the real models (copied from `tests/services/dashboard/test_cash_flow.py`).
3. Amounts use `lot_rules.paid_amount` (amount + stamp duty, migration 0032); a bounced SIP's
   `REVERSAL` nets against Invested instead of counting as Withdrawn.
4. Monthly/yearly buckets are continuous (zero buckets fill quiet periods) — the backend sends
   them, the chart doesn't invent them.
5. SIP summary matches the main dashboard: twin SIPs count `series_count` times, and missed
   instalments are measured against each folio's latest statement end, the same reference
   `compute_active_sips` uses to decide "active".
6. Frontend: snake_case field names (the API has no camelCase layer); existing `--color-*`
   tokens; `formatIndianCurrency` for money; no `d3-scale`; and the spec's Monthly/Yearly
   toggle, tap-a-bar transaction list and state copy, which the first draft left out.
7. `tests/services/analytics/test_recompute.py` must learn the 8th section.
8. Commits: each task's commit step stays. Codex leaves changes uncommitted; Claude commits
   each task after verifying it in WSL. Nothing is pushed.

**Run 1 rulings (9 Oct, after Codex's report).** Applied by the orchestrator to the Task 1–2
code and tests; the code listings below show the pre-ruling version:
9. **Gifts (user, option A):** gifts stay out of Invested/Withdrawn and the chart, but Current
   value holds the gifted units, so `absolute_gain = current + withdrawn − invested − gifts_net`,
   where `gifts_net` = transfer value of `GIFT_IN` minus `GIFT_OUT` (as the dashboard's XIRR
   treats gifts, `xirr.py`). New result field `gifts_net: str = "0.00"`; when it's non-zero the
   frontend shows one line under the tiles (Task 6). `BONUS` needs nothing.
10. **Missed instalments, two folios of one fund (orchestrator):** folios are grouped by member +
   scheme (SipRow has no folio id); where their statement ends differ, the **earliest** is
   used, so a miss is only flagged when every folio's statement shows it.

## Global Constraints

- **Portfolio-level only — no fund-level drill-down in this phase.** Confirmed user decision;
  do not build a per-fund breakdown view or API parameter for one.
- **Reuse `cash_flow.py`'s `_DEBIT_TYPES`/`_CREDIT_TYPES` directly** (`PURCHASE`,
  `PURCHASE_SIP`, `OPENING_BALANCE` = debit; `REDEMPTION`, `DIVIDEND_PAYOUT`, `REVERSAL` =
  credit) — do not redefine these sets. `GIFT_IN`/`GIFT_OUT`/`BONUS` are excluded from totals,
  following `cash_flow.py`'s own existing "not cash" precedent.
- **One exception, decided 9 Oct: `REVERSAL` (a bounced SIP) nets against Invested** — the
  money never left the account, so it lowers that period's Invested instead of raising
  Withdrawn. `cash_flow.py` itself is not changed (XIRR keeps its behaviour). Its entries carry
  `direction = "reversal"` so the drill-in list still shows them.
- **Amounts are `lot_rules.paid_amount(txn)`** (amount + stamp duty), the same figure
  `cash_flow.py` uses — never raw `txn.amount`.
- **The compute function is `async def`** and `await`s `compute_holdings` — `recompute.py`
  awaits every section's compute.
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
  `missed_instalments(row.sip_date, reference)` (already exists in `sip.py`) per row in
  this module; do not add a field to the shared `SipRow`/`compute_active_sips` (other
  callers don't need it). `reference` is the folio's latest confirmed statement end
  (`sip._references`), falling back to today — the same reference `compute_active_sips`
  uses, so a household whose last CAS is two months old doesn't see two false "missed"
  instalments on every SIP.
- **SIP numbers match the main dashboard:** a row with `series_count = N` is N parallel SIPs —
  count it N times and add `sip_amount × N` to the monthly total (`DashboardView.tsx:280`).
  `missed_count` is the total number of missed instalments (the spec's "N missed
  instalments"), not the number of SIPs.
- **Frontend: zero new dependencies.** The new bar chart reuses the already-installed
  `@visx/group`/`@visx/responsive`/`@visx/shape` packages powering
  `components/ui/charts/pie-chart.tsx`. `d3-scale` is not a direct dependency — compute the
  two scales by hand.
- **Frontend field names are snake_case**, exactly as the API sends them (no camelCase layer
  exists; the rest of `types.ts` is snake_case).
- **Frontend styling uses existing tokens only:** `--color-surface`, `--color-bg`,
  `--color-border`, `--color-ink`, `--color-text-secondary`, `--color-accent`,
  `--color-positive` (invested, green), `--color-negative` (withdrawn, red),
  `--color-warning`. Money is formatted with `formatIndianCurrency` from `@/lib/decimal`
  (callers prepend ₹). A later UI pass will polish this section; ship the functional baseline.
- **Decimal discipline** — every money amount computed/returned as a string-serialized
  `Decimal`, matching every other analytics module's existing convention (e.g.
  `CashFlowEntry.amount: str`, `SipRow.sip_amount: str`).

## Review Focus

1. **A new household with zero transactions** — all 5 tiles must read ₹0 and the chart must
   render an explicit empty-state message, never a bar chart plotted against an empty array
   as if it were real zero-activity data (spec's States table, row 5).
2. **A month/year with transactions in surrounding periods but none in that specific bucket**
   — the backend must send that bucket at 0.00 (periods are continuous from the first
   activity to today), and its bar must render at zero height and stay on the axis, never be
   omitted (spec's States table, row 4 — "Empty period").
3. **A household with no active SIPs** — the SIP card must read "No active SIPs", not error
   or omit the card (spec's States table, row 2).
4. **Missed instalments** — a SIP series whose last payment is more than one month overdue
   must surface a visible missed-instalment count/badge, not silently show "active" (spec's
   States table, row 3).
5. **`GIFT_IN`/`GIFT_OUT`/`BONUS` are never Invested or Withdrawn, and Gain excludes gifts at
   transfer value** (ruling 9 Oct) — a household whose only activity is a ₹5,000 gift now worth
   ₹5,500 shows Invested ₹0, Current ₹5,500, Gain ₹500, never the gift as an investment or as profit (this is a deliberate `cash_flow.py`-precedent decision, not an
   oversight — worth a named regression test since it's easy to accidentally "fix" into
   counting gifts later).
6. **A bounced SIP** (a `PURCHASE_SIP` and its `REVERSAL` for the same amount) nets to zero
   Invested and zero Withdrawn, and the drill-in list still shows both rows.
7. **Stamp duty** on a purchase is included in Invested (₹10,000 + ₹0.50 duty → ₹10,000.50).

## File Structure

**Backend — create:**
- `backend/app/services/analytics/investment_withdrawal.py`
- `backend/tests/services/analytics/test_investment_withdrawal.py`

**Backend — modify:**
- `backend/app/services/analytics/schemas.py` — new response schemas
- `backend/app/services/analytics/recompute.py` — new `_SectionSpec` entry
- `backend/tests/services/analytics/test_recompute.py` — `_MOCK_RESULTS` + row counts for 8 sections

**Frontend — create:**
- `frontend/src/components/ui/charts/bar-chart.tsx`
- `frontend/src/components/ui/charts/bar-chart.test.tsx`
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
- Consumes: `cash_flow.py`'s `_DEBIT_TYPES`/`_CREDIT_TYPES`; `lot_rules.paid_amount`;
  `holdings.compute_holdings` (`async`, returns `HoldingRow`s whose `current_value` is
  `str | None` — `None` when a NAV is unavailable); `sip.compute_active_sips`,
  `sip.missed_instalments`, `sip._references`; `Transaction`, `Folio`, `Scheme`,
  `HouseholdMember` models (all existing).
- Produces: `async def compute_investment_withdrawal(db: Session, household_member_ids:
  list[uuid.UUID]) -> InvestmentWithdrawalResult` — the signature `recompute.py`'s new
  `_SectionSpec` (Task 3) awaits.

- [ ] **Step 1: Write the failing test — the 5-tile formula on a known fixture**

Fixture helpers copy `tests/services/dashboard/test_cash_flow.py` (the real models: a `User`
owns the `HouseholdMember`; `Scheme` has `amc_name`/`sebi_category`; a `Transaction` needs
`import_id` and `nav`). `compute_holdings` and `compute_active_sips` are patched where the test
isn't about them, so these stay pure aggregation tests.

```python
# backend/tests/services/analytics/test_investment_withdrawal.py
import asyncio
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from unittest.mock import AsyncMock, patch

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models.enums import PlanType, Relationship, TransactionType
from app.models.folio import Folio
from app.models.reference import Scheme
from app.models.transaction import Transaction
from app.models.user import HouseholdMember, User
from app.services.analytics.investment_withdrawal import compute_investment_withdrawal
from app.services.dashboard.schemas import SipRow

_MODULE = "app.services.analytics.investment_withdrawal"


def _session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    return sessionmaker(autoflush=False, bind=engine)()


def _member(db):
    user = User(id=uuid.uuid4(), phone_number=f"+9199999{uuid.uuid4().hex[:5]}", created_at=datetime.now(timezone.utc))
    db.add(user)
    db.flush()
    member = HouseholdMember(id=uuid.uuid4(), user_id=user.id, name="Priya", relationship=Relationship.SELF, created_at=datetime.now(timezone.utc))
    db.add(member)
    db.commit()
    return member


def _folio(db, member):
    scheme = Scheme(id=uuid.uuid4(), amfi_code=uuid.uuid4().hex[:6], isin="INF123", name="Test Fund", amc_name="Test AMC", sebi_category="Equity Scheme - Flexi Cap Fund")
    db.add(scheme)
    db.commit()
    folio = Folio(id=uuid.uuid4(), household_member_id=member.id, scheme_id=scheme.id, folio_number=uuid.uuid4().hex[:6], plan_type=PlanType.DIRECT)
    db.add(folio)
    db.commit()
    return folio


def _txn(db, folio, type_, on_date, amount, stamp_duty=None):
    db.add(Transaction(id=uuid.uuid4(), folio_id=folio.id, import_id=uuid.uuid4(), type=type_, date=on_date,
                       amount=Decimal(amount), units=Decimal("1.000"), nav=Decimal("50.0000"),
                       stamp_duty=Decimal(stamp_duty) if stamp_duty else None))
    db.commit()


def _holding(value):
    return type("H", (), {"current_value": value})()


def _run(db, member_ids, holdings_value="0.00", sips=()):
    with (
        patch(f"{_MODULE}.compute_holdings", new=AsyncMock(return_value=[_holding(holdings_value)])),
        patch(f"{_MODULE}.compute_active_sips", return_value=list(sips)),
    ):
        return asyncio.run(compute_investment_withdrawal(db, member_ids))


def test_five_tile_formula_matches_worked_example():
    db = _session()
    member = _member(db)
    folio = _folio(db, member)
    _txn(db, folio, TransactionType.PURCHASE, date(2024, 1, 1), "3840000.00")
    _txn(db, folio, TransactionType.REDEMPTION, date(2025, 1, 1), "600000.00")

    result = _run(db, [member.id], holdings_value="3500000.00")

    assert result.total_invested == "3840000.00"
    assert result.total_withdrawn == "600000.00"
    assert result.net_invested == "3240000.00"
    assert result.current_value == "3500000.00"
    assert result.absolute_gain == "260000.00"


def test_gift_and_bonus_transactions_excluded_from_all_tiles():
    db = _session()
    member = _member(db)
    folio = _folio(db, member)
    _txn(db, folio, TransactionType.GIFT_IN, date(2024, 1, 1), "100000.00")
    _txn(db, folio, TransactionType.BONUS, date(2024, 2, 1), "0.00")

    result = _run(db, [member.id])

    assert result.total_invested == "0.00"
    assert result.total_withdrawn == "0.00"
    assert result.absolute_gain == "0.00"
    assert result.monthly == []


def test_empty_household_returns_all_zero_tiles():
    db = _session()
    result = asyncio.run(compute_investment_withdrawal(db, []))
    assert result.total_invested == "0.00"
    assert result.current_value == "0.00"
    assert result.monthly == []
    assert result.yearly == []


def test_stamp_duty_is_included_in_invested():
    db = _session()
    member = _member(db)
    _txn(db, _folio(db, member), TransactionType.PURCHASE_SIP, date(2024, 1, 5), "10000.00", stamp_duty="0.50")
    result = _run(db, [member.id])
    assert result.total_invested == "10000.50"


def test_bounced_sip_nets_against_invested_and_stays_in_the_drill_in():
    db = _session()
    member = _member(db)
    folio = _folio(db, member)
    _txn(db, folio, TransactionType.PURCHASE_SIP, date(2024, 1, 5), "5000.00")
    _txn(db, folio, TransactionType.REVERSAL, date(2024, 1, 9), "5000.00")

    result = _run(db, [member.id])

    assert result.total_invested == "0.00"
    assert result.total_withdrawn == "0.00"
    [bucket] = [b for b in result.monthly if b.period == "2024-01"]
    assert bucket.invested == "0.00"
    assert {e.direction for e in bucket.entries} == {"invested", "reversal"}


def test_quiet_months_and_years_are_sent_as_zero_buckets():
    db = _session()
    member = _member(db)
    folio = _folio(db, member)
    _txn(db, folio, TransactionType.PURCHASE, date(2024, 1, 10), "1000.00")
    _txn(db, folio, TransactionType.PURCHASE, date(2024, 4, 10), "1000.00")

    result = _run(db, [member.id])

    periods = [b.period for b in result.monthly]
    assert periods[:4] == ["2024-01", "2024-02", "2024-03", "2024-04"]
    assert periods[-1] == f"{date.today():%Y-%m}"  # continuous through the current month
    feb = next(b for b in result.monthly if b.period == "2024-02")
    assert (feb.invested, feb.withdrawn, feb.entries) == ("0.00", "0.00", [])
    assert [b.period for b in result.yearly] == [str(y) for y in range(2024, date.today().year + 1)]


def test_holdings_without_a_nav_are_left_out_of_current_value():
    db = _session()
    member = _member(db)
    with (
        patch(f"{_MODULE}.compute_holdings", new=AsyncMock(return_value=[_holding("1000.00"), _holding(None)])),
        patch(f"{_MODULE}.compute_active_sips", return_value=[]),
    ):
        result = asyncio.run(compute_investment_withdrawal(db, [member.id]))
    assert result.current_value == "1000.00"


def _sip(member, scheme_id, last_date, amount, series_count=1):
    return SipRow(scheme_id=str(scheme_id), scheme_name="Test Fund", household_member_id=str(member.id),
                  household_member_name="Priya", sip_date=last_date, sip_amount=amount,
                  next_due_date=last_date, series_count=series_count)


def test_sip_summary_counts_twin_sips_like_the_dashboard():
    db = _session()
    member = _member(db)
    folio = _folio(db, member)
    today = date.today()
    sips = [_sip(member, folio.scheme_id, today, "5000.00", series_count=2), _sip(member, folio.scheme_id, today, "1000.00")]

    result = _run(db, [member.id], sips=sips)

    assert result.sip_summary.active_count == 3
    assert result.sip_summary.total_monthly_amount == "11000.00"
    assert result.sip_summary.missed_count == 0


def test_missed_instalments_are_measured_against_the_latest_statement_not_today():
    db = _session()
    member = _member(db)
    folio = _folio(db, member)
    # Last instalment in March, latest statement ends in April: nothing missed yet,
    # however long ago April is.
    sips = [_sip(member, folio.scheme_id, date(2024, 3, 5), "5000.00")]
    with patch(f"{_MODULE}._references", return_value={folio.id: date(2024, 4, 30)}):
        result = _run(db, [member.id], sips=sips)
    assert result.sip_summary.missed_count == 0

    # Same SIP, statement ends in July: April, May and June were missed.
    with patch(f"{_MODULE}._references", return_value={folio.id: date(2024, 7, 31)}):
        result = _run(db, [member.id], sips=sips)
    assert result.sip_summary.missed_count == 3
```

- [ ] **Step 2: Run, confirm failure**

Run: `cd backend && pytest tests/services/analytics/test_investment_withdrawal.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.services.analytics.investment_withdrawal'`

- [ ] **Step 3: Current value comes from `compute_holdings` — confirmed, don't re-derive it**

Verified 9 Oct: `async def compute_holdings(db, household_member_ids) -> list[HoldingRow]`
(`backend/app/services/dashboard/holdings.py:159`), with `HoldingRow.current_value: str |
None`. Current value = the sum over rows whose `current_value` isn't `None`; a holding with no
NAV can't be valued and is left out, never counted as 0.

- [ ] **Step 4: Implement**

```python
# backend/app/services/analytics/investment_withdrawal.py
"""Investment & withdrawal analysis -- PRD attribute 14. Portfolio-level
only; fund-level drill-down is an explicit future phase, not built here
(user-confirmed scope decision, see planning doc 2026-10-07). A read-time
aggregation over transactions -- no table of its own."""
from __future__ import annotations

import uuid
from collections import defaultdict
from datetime import date
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models.enums import TransactionType
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
from app.services.dashboard.sip import _references, compute_active_sips, missed_instalments
from app.services.lot_rules import paid_amount

_ZERO = Decimal("0.00")


def _direction(txn_type: TransactionType) -> str | None:
    # A bounced SIP's REVERSAL nets against Invested (decided 9 Oct): the money
    # never left the account, so it isn't a withdrawal. cash_flow.py keeps it a
    # credit for XIRR, where the arithmetic comes out the same.
    if txn_type == TransactionType.REVERSAL:
        return "reversal"
    if txn_type in _DEBIT_TYPES:
        return "invested"
    if txn_type in _CREDIT_TYPES:
        return "withdrawn"
    return None  # GIFT_IN/GIFT_OUT/BONUS -- deliberately excluded, see Review Focus #5


def _sum(entries: list[InvestmentWithdrawalEntry], direction: str) -> Decimal:
    return sum((Decimal(e.amount) for e in entries if e.direction == direction), _ZERO)


def _bucket(period: str, entries: list[InvestmentWithdrawalEntry]) -> InvestmentWithdrawalBucket:
    invested = _sum(entries, "invested") - _sum(entries, "reversal")
    return InvestmentWithdrawalBucket(
        period=period, invested=f"{invested:.2f}", withdrawn=f"{_sum(entries, 'withdrawn'):.2f}", entries=entries,
    )


def _month_range(first: date, last: date) -> list[tuple[int, int]]:
    """Every (year, month) from `first` through `last` -- quiet months are part
    of the timeline (spec States row 4), so the backend sends them as zeros."""
    months, year, month = [], first.year, first.month
    while (year, month) <= (last.year, last.month):
        months.append((year, month))
        year, month = (year + 1, 1) if month == 12 else (year, month + 1)
    return months


def _empty_result() -> InvestmentWithdrawalResult:
    return InvestmentWithdrawalResult(
        total_invested="0.00", total_withdrawn="0.00", net_invested="0.00",
        current_value="0.00", absolute_gain="0.00", monthly=[], yearly=[],
        sip_summary=InvestmentWithdrawalSipSummary(active_count=0, total_monthly_amount="0.00", missed_count=0),
    )


async def compute_investment_withdrawal(
    db: Session, household_member_ids: list[uuid.UUID]
) -> InvestmentWithdrawalResult:
    if not household_member_ids:
        return _empty_result()

    members = {m.id: m for m in db.query(HouseholdMember).filter(HouseholdMember.id.in_(household_member_ids)).all()}
    folios = {f.id: f for f in db.query(Folio).filter(Folio.household_member_id.in_(household_member_ids)).all()}
    schemes: dict[uuid.UUID, Scheme] = {}
    transactions: list[Transaction] = []
    if folios:
        schemes = {s.id: s for s in db.query(Scheme).filter(Scheme.id.in_({f.scheme_id for f in folios.values()})).all()}
        transactions = (
            db.query(Transaction)
            .filter(Transaction.folio_id.in_(list(folios)))
            .order_by(Transaction.date, Transaction.id)
            .all()
        )

    entries: list[InvestmentWithdrawalEntry] = []
    for txn in transactions:
        direction = _direction(txn.type)
        if direction is None:
            continue
        folio = folios[txn.folio_id]
        entries.append(InvestmentWithdrawalEntry(
            transaction_id=str(txn.id),
            date=txn.date,
            type=txn.type,
            amount=f"{paid_amount(txn):.2f}",  # amount + stamp duty, same as cash_flow.py
            direction=direction,
            scheme_name=schemes[folio.scheme_id].name,
            household_member_id=str(folio.household_member_id),
            household_member_name=members[folio.household_member_id].name,
        ))

    total_invested = _sum(entries, "invested") - _sum(entries, "reversal")
    total_withdrawn = _sum(entries, "withdrawn")

    today = date.today()
    monthly: list[InvestmentWithdrawalBucket] = []
    yearly: list[InvestmentWithdrawalBucket] = []
    if entries:
        by_month: dict[tuple[int, int], list[InvestmentWithdrawalEntry]] = defaultdict(list)
        by_year: dict[int, list[InvestmentWithdrawalEntry]] = defaultdict(list)
        for e in entries:
            by_month[(e.date.year, e.date.month)].append(e)
            by_year[e.date.year].append(e)
        first = entries[0].date  # transactions are ordered by date
        monthly = [_bucket(f"{y:04d}-{m:02d}", by_month.get((y, m), [])) for y, m in _month_range(first, today)]
        yearly = [_bucket(f"{y:04d}", by_year.get(y, [])) for y in range(first.year, today.year + 1)]

    holdings = await compute_holdings(db, household_member_ids)
    # A holding with no NAV can't be valued: left out, never counted as 0.
    current_value = sum((Decimal(h.current_value) for h in holdings if h.current_value is not None), _ZERO)

    # SIP numbers follow the main dashboard: a row with series_count=N is N
    # parallel SIPs (DashboardView.tsx), and missed instalments are measured
    # against the folio's latest statement end -- the same reference
    # compute_active_sips uses to call a SIP active.
    sip_rows = compute_active_sips(db, household_member_ids)
    references = _references(db, list(folios.values()))
    reference_by_holding: dict[tuple[str, str], date] = {}
    for folio in folios.values():
        ref = references.get(folio.id)
        if ref is not None:
            key = (str(folio.household_member_id), str(folio.scheme_id))
            reference_by_holding[key] = max(ref, reference_by_holding.get(key, ref))
    active_count = sum(row.series_count for row in sip_rows)
    total_monthly_sip = sum((Decimal(row.sip_amount) * row.series_count for row in sip_rows), _ZERO)
    missed_count = sum(
        missed_instalments(row.sip_date, reference_by_holding.get((row.household_member_id, row.scheme_id), today))
        * row.series_count
        for row in sip_rows
    )

    return InvestmentWithdrawalResult(
        total_invested=f"{total_invested:.2f}",
        total_withdrawn=f"{total_withdrawn:.2f}",
        net_invested=f"{total_invested - total_withdrawn:.2f}",
        current_value=f"{current_value:.2f}",
        absolute_gain=f"{current_value + total_withdrawn - total_invested:.2f}",
        monthly=monthly,
        yearly=yearly,
        sip_summary=InvestmentWithdrawalSipSummary(
            active_count=active_count,
            total_monthly_amount=f"{total_monthly_sip:.2f}",
            missed_count=missed_count,
        ),
    )
```

- [ ] **Step 5: Run, confirm pass**

Run (WSL): `cd backend && python3 -m pytest tests/services/analytics/test_investment_withdrawal.py -q -p no:cacheprovider`
(Windows/Codex: `.venv\Scripts\python.exe -m pytest tests/services/analytics/test_investment_withdrawal.py -q`)
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

- [ ] **Step 5: Teach the existing recompute tests the 8th section**

`backend/tests/services/analytics/test_recompute.py` mocks every section through a
`_MOCK_RESULTS` dict keyed by section name and asserts row counts for 7 sections. With an 8th
section registered it fails with a `KeyError` before reaching any assertion. Add an
`"investment_withdrawal"` entry (an all-zero `InvestmentWithdrawalResult`, like the one in Step 1
of this task) and update every count that is "scopes × 7" (e.g. `assert len(rows) == 21` for 3
scopes becomes `24`). Grep the file for `== 7`, `* 7` and `21` and fix each; change no other
expectation.

- [ ] **Step 6: Run the affected test files (not the whole directory)**

Run (WSL): `cd backend && python3 -m pytest tests/services/analytics/test_recompute_investment_withdrawal.py tests/services/analytics/test_recompute.py tests/services/analytics/test_investment_withdrawal.py tests/services/analytics/test_investment_withdrawal_schemas.py -q -p no:cacheprovider`
Expected: PASS. The synthetic CAS harness (`Docs/CAS Files/synthetic/harness/test_deep.py`)
reads `_SECTIONS` itself and picks the new section up automatically — the orchestrator runs
it; don't edit it.

- [ ] **Step 7: Commit**

```bash
git add backend/app/services/analytics/recompute.py backend/tests/services/analytics/test_recompute_investment_withdrawal.py backend/tests/services/analytics/test_recompute.py
git commit -m "feat: register investment_withdrawal as an analytics section"
```

---

### Task 4: Frontend — `bar-chart.tsx` (visx, no new dependency)

**Files:**
- Create: `frontend/src/components/ui/charts/bar-chart.tsx`
- Test: `frontend/src/components/ui/charts/bar-chart.test.tsx`

**Interfaces:**
- Consumes: `@visx/group`, `@visx/responsive`, `@visx/shape` (already in `package.json`,
  used by `pie-chart.tsx`). No `d3-scale`: it's only a transitive dependency, so the two
  scales are computed by hand.
- Produces: `<BarChart data={{period: string; invested: number; withdrawn: number}[]}
  selectedPeriod?={string | null} onBarClick?={(period: string) => void} width?={number}
  height?={number} />` — consumed by Task 6 (`InvestmentWithdrawalSection.tsx`). `width`
  skips `ParentSize` (tests and fixed layouts); without it the chart fills its parent.
  The numbers are bar geometry only — never displayed, so `Number()` is fine here.

- [ ] **Step 1: Write the failing test — a zero-height bar renders for an empty-amount
bucket, never an omitted bar**

```tsx
// frontend/src/components/ui/charts/bar-chart.test.tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BarChart } from "./bar-chart";

describe("BarChart", () => {
  it("renders a bar group for every bucket, including a zero-amount one", () => {
    render(
      <BarChart
        width={600}
        height={200}
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
      <BarChart width={600} height={200} data={[{ period: "2026-01", invested: 10000, withdrawn: 2000 }]} onBarClick={onBarClick} />
    );
    fireEvent.click(screen.getByTestId("bar-group-2026-01"));
    expect(onBarClick).toHaveBeenCalledWith("2026-01");
  });

  it("scales the tallest bar to the full plot height and a zero bar to nothing", () => {
    render(
      <BarChart
        width={600}
        height={216}
        data={[
          { period: "2026-01", invested: 10000, withdrawn: 5000 },
          { period: "2026-02", invested: 0, withdrawn: 0 },
        ]}
      />
    );
    // plot height = 216 - 8 top - 8 bottom = 200
    expect(screen.getByTestId("bar-invested-2026-01").getAttribute("height")).toBe("200");
    expect(screen.getByTestId("bar-withdrawn-2026-01").getAttribute("height")).toBe("100");
    expect(screen.getByTestId("bar-invested-2026-02").getAttribute("height")).toBe("0");
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

export interface BarChartDatum {
  period: string;
  invested: number;
  withdrawn: number;
}

export interface BarChartProps {
  data: BarChartDatum[];
  selectedPeriod?: string | null;
  onBarClick?: (period: string) => void;
  /** Fixed width skips ParentSize (tests, fixed layouts). */
  width?: number;
  height?: number;
}

const MARGIN = { top: 8, right: 8, bottom: 8, left: 8 };
const GAP = 2;

// Scales are two lines of arithmetic, so no d3-scale (not a direct dependency).
function BarChartSvg({ data, selectedPeriod, onBarClick, width, height }: BarChartProps & { width: number; height: number }) {
  const plotWidth = Math.max(0, width - MARGIN.left - MARGIN.right);
  const plotHeight = Math.max(0, height - MARGIN.top - MARGIN.bottom);
  const maxValue = Math.max(1, ...data.map((d) => Math.max(d.invested, d.withdrawn)));
  const slot = data.length ? plotWidth / data.length : 0;
  const barWidth = Math.max(1, slot * 0.35);
  const barHeight = (value: number) => Math.round((Math.max(0, value) / maxValue) * plotHeight);

  return (
    <svg width={width} height={height} role="img" aria-label="Invested and withdrawn by period">
      <Group left={MARGIN.left} top={MARGIN.top}>
        {data.map((d, i) => {
          const x = i * slot + (slot - (2 * barWidth + GAP)) / 2;
          const investedHeight = barHeight(d.invested);
          const withdrawnHeight = barHeight(d.withdrawn);
          const dimmed = !!selectedPeriod && selectedPeriod !== d.period;
          return (
            <Group
              key={d.period}
              data-testid={`bar-group-${d.period}`}
              onClick={() => onBarClick?.(d.period)}
              style={{ cursor: onBarClick ? "pointer" : "default", opacity: dimmed ? 0.4 : 1 }}
            >
              {/* Full-height transparent hit area, so a zero-height period is still tappable. */}
              <rect x={i * slot} y={0} width={slot} height={plotHeight} fill="transparent" />
              <Bar
                data-testid={`bar-invested-${d.period}`}
                x={x}
                y={plotHeight - investedHeight}
                width={barWidth}
                height={investedHeight}
                fill="var(--color-positive)"
              />
              <Bar
                data-testid={`bar-withdrawn-${d.period}`}
                x={x + barWidth + GAP}
                y={plotHeight - withdrawnHeight}
                width={barWidth}
                height={withdrawnHeight}
                fill="var(--color-negative)"
              />
            </Group>
          );
        })}
      </Group>
    </svg>
  );
}

export function BarChart({ width, height = 200, ...rest }: BarChartProps) {
  if (width !== undefined) return <BarChartSvg {...rest} width={width} height={height} />;
  return (
    <div style={{ height }}>
      <ParentSize debounceTime={10}>
        {({ width: parentWidth }) => <BarChartSvg {...rest} width={parentWidth} height={height} />}
      </ParentSize>
    </div>
  );
}
```

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
- Modify: `frontend/src/mobile/features/analytics/MobileAnalyticsView.tsx` (has its own
  `AGGREGATE_FIELD: Record<AnalyticsSectionName, string>` — `tsc` fails until it has the new key)
- Test: `frontend/src/features/analytics/AnalyticsView.test.tsx` (exists — extend it)
- Test: `frontend/src/mobile/features/analytics/MobileAnalyticsView.test.tsx` (exists)

**Interfaces:**
- Produces: `"investment_withdrawal"` added to `ANALYTICS_SECTION_NAMES`; an
  `investment_withdrawal: "data"` key in both views' `AGGREGATE_FIELD` — consumed by Task 6's
  `InvestmentWithdrawalSection.tsx` via the existing `unwrap<T>()`/`isSectionSettled()`
  pattern.

- [ ] **Step 1: Find every test fixture that builds "all sections"**

Run: `git grep -n "buildSections\|ANALYTICS_SECTION_NAMES\|benchmark_funds" frontend/src -- '*.test.ts*'`

Both views wait for every name in `ANALYTICS_SECTION_NAMES` to settle. A fixture that builds
the 7 current sections would leave the new one unsettled, so "loaded" tests would see a
loading state. Add a settled `investment_withdrawal` entry to each such fixture.

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
backend schemas from Task 2 **field for field, in snake_case** (the API sends Pydantic field
names unchanged; the rest of `types.ts` is snake_case):

```typescript
export interface InvestmentWithdrawalEntry {
  transaction_id: string;
  date: string;
  type: string;
  amount: string;
  direction: "invested" | "withdrawn" | "reversal";
  scheme_name: string;
  household_member_id: string;
  household_member_name: string;
}

export interface InvestmentWithdrawalBucket {
  period: string;
  invested: string;
  withdrawn: string;
  entries: InvestmentWithdrawalEntry[];
}

export interface InvestmentWithdrawalSipSummary {
  active_count: number;
  total_monthly_amount: string;
  missed_count: number;
}

export interface InvestmentWithdrawalResult {
  total_invested: string;
  total_withdrawn: string;
  net_invested: string;
  current_value: string;
  absolute_gain: string;
  monthly: InvestmentWithdrawalBucket[];
  yearly: InvestmentWithdrawalBucket[];
  sip_summary: InvestmentWithdrawalSipSummary;
  gifts_net: string; // value of gifts received minus given, at transfer value (ruling 9 Oct)
}
```

- [ ] **Step 5: Implement — `AnalyticsView.tsx` and `MobileAnalyticsView.tsx`**

Add `investment_withdrawal: "data"` to the `AGGREGATE_FIELD` record in **both** files
(matching the backend's `AggregateInvestmentWithdrawalResponse.data` field name from Task 2),
following the exact same one-line-per-section pattern as the other 7 entries. Add the settled
`investment_withdrawal` entry to every fixture Step 1 found.

- [ ] **Step 6: Run, confirm pass**

Run: `cd frontend && npx vitest run src/features/analytics/AnalyticsView.test.tsx src/mobile/features/analytics/MobileAnalyticsView.test.tsx src/features/analytics/useAnalyticsScope.test.ts && npx tsc -b`
(plus any other test file Step 1's grep found)
Expected: PASS, `tsc -b` clean

- [ ] **Step 7: Commit**

```bash
git add frontend/src/features/analytics/types.ts frontend/src/features/analytics/AnalyticsView.tsx frontend/src/features/analytics/AnalyticsView.test.tsx frontend/src/mobile/features/analytics/MobileAnalyticsView.tsx frontend/src/mobile/features/analytics/MobileAnalyticsView.test.tsx
git commit -m "feat: register investment_withdrawal as the 8th analytics section (frontend)"
```

---

### Task 6: Frontend — `InvestmentWithdrawalSection.tsx`

**Files:**
- Create: `frontend/src/features/analytics/InvestmentWithdrawalSection.tsx`
- Create: `frontend/src/features/analytics/InvestmentWithdrawalSection.test.tsx`
- Modify: `frontend/src/features/analytics/AnalyticsView.tsx` (render the new section)
- Modify: `frontend/src/mobile/features/analytics/MobileAnalyticsView.tsx` (same section on
  mobile — both views render every analytics section)

**Interfaces:**
- Consumes: `InvestmentWithdrawalResult` (Task 5), `BarChart` (Task 4), the
  `unwrap<T>()`/`isSectionSettled()` helpers and the card chrome of
  `CategoryRankingSection.tsx` (`rounded-xl border border-[var(--color-border)]
  bg-[var(--color-surface)] p-5 sm:p-6 shadow-2xs`, `Skeleton` for loading).
- Spec it implements (`2026-10-08-attribute-14-investment-withdrawal-spec.md` §2–3): 5 tiles
  (Withdrawn in the negative colour, Current Value in the accent colour, Absolute Gain
  positive/negative by sign); a Monthly/Yearly toggle over the same chart; tapping a period
  shows that period's transactions from `entries` (no second fetch); a SIP card; the States
  table's copy: "No transactions yet", "No active SIPs", "N missed instalments".

- [ ] **Step 1: Write the failing tests — covering every row of the spec's States table**

```tsx
// frontend/src/features/analytics/InvestmentWithdrawalSection.test.tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { InvestmentWithdrawalSection } from "./InvestmentWithdrawalSection";
import type { InvestmentWithdrawalResult } from "./types";

const entry = (over: Partial<InvestmentWithdrawalResult["monthly"][number]["entries"][number]> = {}) => ({
  transaction_id: "t1", date: "2026-01-05", type: "purchase_sip", amount: "5000.00", direction: "invested" as const,
  scheme_name: "Test Flexi Cap Fund", household_member_id: "m1", household_member_name: "Priya", ...over,
});

const baseResult: InvestmentWithdrawalResult = {
  total_invested: "3840000.00",
  total_withdrawn: "600000.00",
  net_invested: "3240000.00",
  current_value: "3500000.00",
  absolute_gain: "260000.00",
  monthly: [
    { period: "2026-01", invested: "5000.00", withdrawn: "0.00", entries: [entry()] },
    { period: "2026-02", invested: "0.00", withdrawn: "0.00", entries: [] },
  ],
  yearly: [{ period: "2026", invested: "5000.00", withdrawn: "0.00", entries: [entry()] }],
  sip_summary: { active_count: 2, total_monthly_amount: "15000.00", missed_count: 0 },
  gifts_net: "0.00",
};

describe("InvestmentWithdrawalSection", () => {
  it("renders a loading skeleton while isLoading", () => {
    render(<InvestmentWithdrawalSection data={null} isLoading />);
    expect(screen.getByTestId("investment-withdrawal-skeleton")).toBeInTheDocument();
  });

  it("renders all 5 tiles with the worked-example values", () => {
    render(<InvestmentWithdrawalSection data={baseResult} />);
    expect(screen.getByText("₹38,40,000")).toBeInTheDocument();
    expect(screen.getByText("₹6,00,000")).toBeInTheDocument();
    expect(screen.getByText("₹32,40,000")).toBeInTheDocument();
    expect(screen.getByText("₹35,00,000")).toBeInTheDocument();
    expect(screen.getByText("₹2,60,000")).toBeInTheDocument();
  });

  it("shows a negative gain with a minus sign", () => {
    render(<InvestmentWithdrawalSection data={{ ...baseResult, absolute_gain: "-120000.00" }} />);
    expect(screen.getByText("−₹1,20,000")).toBeInTheDocument();
  });

  it("shows an empty-state message instead of a chart for a household with no transactions", () => {
    const empty = { ...baseResult, total_invested: "0.00", total_withdrawn: "0.00", net_invested: "0.00", current_value: "0.00", absolute_gain: "0.00", monthly: [], yearly: [] };
    render(<InvestmentWithdrawalSection data={empty} />);
    expect(screen.getByText("No transactions yet")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /invested and withdrawn/i })).not.toBeInTheDocument();
  });

  it("toggles between monthly and yearly periods", () => {
    render(<InvestmentWithdrawalSection data={baseResult} />);
    expect(screen.getByTestId("bar-group-2026-02")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Yearly" }));
    expect(screen.getByTestId("bar-group-2026")).toBeInTheDocument();
    expect(screen.queryByTestId("bar-group-2026-02")).not.toBeInTheDocument();
  });

  it("tapping a period lists that period's transactions, and a quiet period says so", () => {
    render(<InvestmentWithdrawalSection data={baseResult} />);
    fireEvent.click(screen.getByTestId("bar-group-2026-01"));
    expect(screen.getByText("Test Flexi Cap Fund")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("bar-group-2026-02"));
    expect(screen.getByText("No transactions in this period")).toBeInTheDocument();
  });

  it("labels a bounced SIP in the transaction list", () => {
    const withReversal = {
      ...baseResult,
      monthly: [{ period: "2026-01", invested: "0.00", withdrawn: "0.00", entries: [entry(), entry({ transaction_id: "t2", type: "reversal", direction: "reversal" as const })] }],
    };
    render(<InvestmentWithdrawalSection data={withReversal} />);
    fireEvent.click(screen.getByTestId("bar-group-2026-01"));
    expect(screen.getByText(/bounced sip/i)).toBeInTheDocument();
  });

  it("explains gifts under the tiles only when there are any", () => {
    const { rerender } = render(<InvestmentWithdrawalSection data={baseResult} />);
    expect(screen.queryByText(/gift/i)).not.toBeInTheDocument();
    rerender(<InvestmentWithdrawalSection data={{ ...baseResult, gifts_net: "5000.00" }} />);
    expect(screen.getByText("Gain excludes ₹5,000 of units received as gifts.")).toBeInTheDocument();
    rerender(<InvestmentWithdrawalSection data={{ ...baseResult, gifts_net: "-4000.00" }} />);
    expect(screen.getByText("Gain includes ₹4,000 of units given away as gifts.")).toBeInTheDocument();
  });

  it("shows 'No active SIPs' rather than omitting the SIP card", () => {
    render(<InvestmentWithdrawalSection data={{ ...baseResult, sip_summary: { active_count: 0, total_monthly_amount: "0.00", missed_count: 0 } }} />);
    expect(screen.getByText("No active SIPs")).toBeInTheDocument();
  });

  it("shows a missed-instalments badge when missed_count > 0", () => {
    render(<InvestmentWithdrawalSection data={{ ...baseResult, sip_summary: { active_count: 2, total_monthly_amount: "15000.00", missed_count: 3 } }} />);
    expect(screen.getByText("3 missed instalments")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run, confirm failure**

Run: `cd frontend && npx vitest run src/features/analytics/InvestmentWithdrawalSection.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Implement**

Follow `CategoryRankingSection.tsx`'s structure and chrome. Money is a Decimal string all the
way to the screen: `formatIndianCurrency` (no decimals, callers add ₹) with the sign handled
on the string, never via float arithmetic.

```tsx
// frontend/src/features/analytics/InvestmentWithdrawalSection.tsx
import { useState } from "react";
import { BarChart } from "@/components/ui/charts/bar-chart";
import { Skeleton } from "@/components/ui/skeleton";
import { formatIndianCurrency } from "@/lib/decimal";
import { cn } from "@/lib/utils";
import type { InvestmentWithdrawalBucket, InvestmentWithdrawalEntry, InvestmentWithdrawalResult } from "./types";

export interface InvestmentWithdrawalSectionProps {
  data: InvestmentWithdrawalResult | null;
  isLoading?: boolean;
  className?: string;
}

type Granularity = "monthly" | "yearly";

const CARD = "rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 sm:p-6 shadow-2xs";

/** "-120000.00" -> "−₹1,20,000". The sign is read from the string, not a float. */
function rupees(value: string): string {
  return value.startsWith("-") ? `−₹${formatIndianCurrency(value.slice(1))}` : `₹${formatIndianCurrency(value)}`;
}

function signClass(value: string): string {
  if (value.startsWith("-")) return "text-[var(--color-negative)]";
  return /[1-9]/.test(value) ? "text-[var(--color-positive)]" : "text-[var(--color-ink)]";
}

function Tile({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-3 min-w-0">
      <p className="text-xs text-[var(--color-text-secondary)]">{label}</p>
      <p className={cn("text-lg font-semibold tabular-nums", valueClass ?? "text-[var(--color-ink)]")}>{rupees(value)}</p>
    </div>
  );
}

function entryLabel(entry: InvestmentWithdrawalEntry): string {
  if (entry.direction === "reversal") return "Bounced SIP (reversed)";
  return entry.direction === "invested" ? "Invested" : "Withdrawn";
}

function PeriodTransactions({ bucket }: { bucket: InvestmentWithdrawalBucket }) {
  if (bucket.entries.length === 0) {
    return <p className="text-sm text-[var(--color-text-secondary)]">No transactions in this period</p>;
  }
  return (
    <ul className="divide-y divide-[var(--color-border)]">
      {bucket.entries.map((entry) => (
        <li key={entry.transaction_id} className="flex items-start justify-between gap-3 py-2 text-sm">
          <div className="min-w-0">
            <p className="text-[var(--color-ink)] truncate">{entry.scheme_name}</p>
            <p className="text-xs text-[var(--color-text-secondary)]">
              {entry.date} · {entry.household_member_name} · {entryLabel(entry)}
            </p>
          </div>
          <span className={cn("tabular-nums font-medium", entry.direction === "invested" ? "text-[var(--color-ink)]" : "text-[var(--color-negative)]")}>
            {rupees(entry.amount)}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function InvestmentWithdrawalSection({ data, isLoading = false, className }: InvestmentWithdrawalSectionProps) {
  const [granularity, setGranularity] = useState<Granularity>("monthly");
  const [selectedPeriod, setSelectedPeriod] = useState<string | null>(null);

  if (isLoading || !data) {
    return (
      <div data-testid="investment-withdrawal-skeleton" className={cn(CARD, "space-y-4", className)}>
        <Skeleton className="h-6 w-64" />
        <Skeleton className="h-20 w-full rounded-lg" />
        <Skeleton className="h-48 w-full rounded-lg" />
      </div>
    );
  }

  const buckets = granularity === "monthly" ? data.monthly : data.yearly;
  const selected = buckets.find((b) => b.period === selectedPeriod) ?? null;
  const sip = data.sip_summary;

  return (
    <section className={cn(CARD, "space-y-6", className)}>
      <h2 className="font-display text-lg font-bold tracking-tight text-[var(--color-ink)]">Investment &amp; Withdrawal</h2>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Tile label="Invested" value={data.total_invested} />
        <Tile label="Withdrawn" value={data.total_withdrawn} valueClass="text-[var(--color-negative)]" />
        <Tile label="Net Invested" value={data.net_invested} />
        <Tile label="Current Value" value={data.current_value} valueClass="text-[var(--color-accent)]" />
        <Tile label="Absolute Gain" value={data.absolute_gain} valueClass={signClass(data.absolute_gain)} />
      </div>
      {/[1-9]/.test(data.gifts_net) && (
        <p className="text-xs text-[var(--color-text-secondary)]">
          {data.gifts_net.startsWith("-")
            ? `Gain includes ₹${formatIndianCurrency(data.gifts_net.slice(1))} of units given away as gifts.`
            : `Gain excludes ₹${formatIndianCurrency(data.gifts_net)} of units received as gifts.`}
        </p>
      )}

      {data.monthly.length === 0 ? (
        <p className="text-sm text-[var(--color-text-secondary)]">No transactions yet</p>
      ) : (
        <div className="space-y-3">
          <div className="inline-flex rounded-lg border border-[var(--color-border)] p-0.5" role="group" aria-label="Period">
            {(["monthly", "yearly"] as const).map((g) => (
              <button
                key={g}
                type="button"
                aria-pressed={granularity === g}
                onClick={() => { setGranularity(g); setSelectedPeriod(null); }}
                className={cn(
                  "rounded-md px-3 py-1 text-xs font-semibold",
                  granularity === g ? "bg-[var(--color-accent)] text-[var(--color-surface)]" : "text-[var(--color-text-secondary)]",
                )}
              >
                {g === "monthly" ? "Monthly" : "Yearly"}
              </button>
            ))}
          </div>
          <BarChart
            data={buckets.map((b) => ({ period: b.period, invested: Number(b.invested), withdrawn: Number(b.withdrawn) }))}
            selectedPeriod={selectedPeriod}
            onBarClick={setSelectedPeriod}
          />
          <p className="text-xs text-[var(--color-text-secondary)]">
            <span className="text-[var(--color-positive)]">■</span> Invested · <span className="text-[var(--color-negative)]">■</span> Withdrawn · Tap a period to see its transactions
          </p>
          {selected && (
            <div className="rounded-lg border border-[var(--color-border)] p-3 space-y-2">
              <p className="text-xs font-semibold text-[var(--color-text-secondary)]">{selected.period}</p>
              <PeriodTransactions bucket={selected} />
            </div>
          )}
        </div>
      )}

      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-3 flex flex-wrap items-center gap-3 text-sm">
        {sip.active_count === 0 ? (
          <span className="text-[var(--color-text-secondary)]">No active SIPs</span>
        ) : (
          <>
            <span className="text-[var(--color-ink)]">{sip.active_count} active {sip.active_count === 1 ? "SIP" : "SIPs"}</span>
            <span className="tabular-nums text-[var(--color-ink)]">{rupees(sip.total_monthly_amount)}/month</span>
            {sip.missed_count > 0 && (
              <span className="rounded-md bg-[var(--color-warning)]/10 px-2 py-0.5 text-xs font-semibold text-[var(--color-warning)]">
                {sip.missed_count} missed {sip.missed_count === 1 ? "instalment" : "instalments"}
              </span>
            )}
          </>
        )}
      </div>
    </section>
  );
}
```

Then render it in **both** views, after `BenchmarkSection`, following the existing pattern
verbatim:

```tsx
const investmentWithdrawal = unwrap<InvestmentWithdrawalResult>("investment_withdrawal");
const investmentWithdrawalLoading = !!scope && !isSectionSettled(sections.investment_withdrawal);
// MobileAnalyticsView.tsx has no `scope` guard on its loading flags — copy its own pattern:
// const investmentWithdrawalLoading = !isSectionSettled(sections.investment_withdrawal);
...
{/* Section 6: Investment & Withdrawal (attribute 14) */}
<InvestmentWithdrawalSection data={investmentWithdrawal} isLoading={investmentWithdrawalLoading} />
```

The PDF print view (`print/PrintAnalyticsView.tsx`) is out of scope for this attribute; the
spec doesn't list it.

- [ ] **Step 4: Run, confirm pass**

Run: `cd frontend && npx vitest run src/features/analytics/InvestmentWithdrawalSection.test.tsx`
Expected: PASS

- [ ] **Step 5: Run the affected test files and the type check (not the whole suite)**

Run: `cd frontend && npx vitest run src/features/analytics/InvestmentWithdrawalSection.test.tsx src/components/ui/charts/bar-chart.test.tsx src/features/analytics/AnalyticsView.test.tsx src/mobile/features/analytics/MobileAnalyticsView.test.tsx && npx tsc -b`
Expected: PASS, `tsc -b` clean

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/analytics/InvestmentWithdrawalSection.tsx frontend/src/features/analytics/InvestmentWithdrawalSection.test.tsx frontend/src/features/analytics/AnalyticsView.tsx frontend/src/mobile/features/analytics/MobileAnalyticsView.tsx
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
`InvestmentWithdrawalEntry`/`InvestmentWithdrawalSipSummary` field names are identical — the
same snake_case spelling — across Task 1's Python implementation, Task 2's Pydantic schemas,
and Task 5's TypeScript interfaces. Verified 9 Oct: there is no camelCase conversion layer
(`lib/apiClient.ts`), and the rest of `types.ts` is snake_case.

**5. Revision check (9 Oct):** every function, model, field, token and package this plan names
as existing was checked against the code at `cd2533d`: `compute_holdings` (async,
`current_value: str | None`), `compute_active_sips`/`missed_instalments`/`_references`,
`lot_rules.paid_amount`, `SipRow.series_count`, the `test_cash_flow.py` fixture shapes,
`test_recompute.py`'s `_MOCK_RESULTS` and 21-row assertion, both views' `AGGREGATE_FIELD`,
`formatIndianCurrency` (no decimals, caller adds ₹), the `--color-*` tokens, and the visx
packages in `package.json`. Commands: Claude verifies in WSL with `python3 -m pytest … -p
no:cacheprovider` (system Python; `backend/.venv` is a Windows venv), Codex on Windows with
`.venv\Scripts\python.exe -m pytest …`.

**4. Review Focus coverage:** #1 (empty household, all-zero tiles + explicit empty state) —
Task 1's `test_empty_household_returns_all_zero_tiles` + Task 6's "shows an empty-state
message" test. #2 (empty period renders as a zero-height bar, not omitted) — Task 4's
"renders a bar group for every bucket, including a zero-amount one" test. #3 (no active
SIPs) — Task 6's "shows 0 active SIPs rather than omitting" test. #4 (missed instalments
badge) — Task 6's "shows a missed-instalment badge" test. #5 (gifts/bonus excluded from
totals) — Task 1's `test_gift_and_bonus_transactions_excluded_from_all_tiles`, named
explicitly as a regression guard per this plan's Global Constraints section.
