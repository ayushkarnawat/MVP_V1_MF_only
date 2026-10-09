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
    # Gifts aren't cash, so they stay out of Invested/Withdrawn and the chart,
    # but the gifted units are in Current value. Gain leaves out their value at
    # transfer, the way the dashboard's XIRR counts GIFT_IN (xirr.py) -- decided
    # 9 Oct. BONUS needs nothing: it adds units without changing the value held.
    # Known limit: a GIFT_IN the CAS listed without a NAV is stored at amount 0
    # (the importer warns), so its value can't be excluded and Gain includes it.
    gifts_net = _ZERO
    for txn in transactions:
        if txn.type == TransactionType.GIFT_IN:
            gifts_net += paid_amount(txn)
        elif txn.type == TransactionType.GIFT_OUT:
            gifts_net -= paid_amount(txn)
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
        # Through today, or a later-dated entry if one exists, so the chart and
        # the tiles always cover the same transactions.
        last = max(today, entries[-1].date)
        monthly = [_bucket(f"{y:04d}-{m:02d}", by_month.get((y, m), [])) for y, m in _month_range(first, last)]
        yearly = [_bucket(f"{y:04d}", by_year.get(y, [])) for y in range(first.year, last.year + 1)]

    holdings = await compute_holdings(db, household_member_ids)
    # A holding with no NAV can't be valued: left out, never counted as 0.
    current_value = sum((Decimal(h.current_value) for h in holdings if h.current_value is not None), _ZERO)

    # SIP numbers follow the main dashboard: a row with series_count=N is N
    # parallel SIPs (DashboardView.tsx), and missed instalments are measured
    # against the folio's latest statement end -- the same reference
    # compute_active_sips uses to call a SIP active.
    sip_rows = compute_active_sips(db, household_member_ids)
    references = _references(db, list(folios.values()))
    # SipRow has no folio id, so folios are grouped by member + scheme. Where
    # their statement ends differ, the earliest wins: a miss is flagged only
    # when every folio's statement shows it, never inferred (ruling, 9 Oct).
    reference_by_holding: dict[tuple[str, str], date] = {}
    for folio in folios.values():
        ref = references.get(folio.id)
        if ref is not None:
            key = (str(folio.household_member_id), str(folio.scheme_id))
            reference_by_holding[key] = min(ref, reference_by_holding.get(key, ref))
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
        absolute_gain=f"{current_value + total_withdrawn - total_invested - gifts_net:.2f}",
        monthly=monthly,
        yearly=yearly,
        gifts_net=f"{gifts_net:.2f}",
        sip_summary=InvestmentWithdrawalSipSummary(
            active_count=active_count,
            total_monthly_amount=f"{total_monthly_sip:.2f}",
            missed_count=missed_count,
        ),
    )
