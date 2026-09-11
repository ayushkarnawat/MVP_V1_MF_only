from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models.folio import Folio
from app.models.transaction import Transaction
from app.models.enums import TransactionType
from app.services.analytics.xirr import xirr
from app.services.dashboard.cash_flow import _CREDIT_TYPES, _DEBIT_TYPES
from app.services.dashboard.schemas import HoldingRow

_RELEVANT_TYPES = _DEBIT_TYPES | _CREDIT_TYPES


@dataclass(frozen=True)
class DashboardXirrSummary:
    lifetime_xirr: str | None
    current_holdings_xirr: str | None


def _signed_amount(
    transaction: Transaction,
    extra_debit_types: frozenset[TransactionType] = frozenset(),
) -> Decimal:
    return -transaction.amount if transaction.type in (_DEBIT_TYPES | extra_debit_types) else transaction.amount


def portfolio_xirr(
    transactions: list[Transaction],
    current_value: Decimal,
    extra_debit_types: frozenset[TransactionType] = frozenset(),
) -> Decimal | None:
    flows = [(transaction.date, _signed_amount(transaction, extra_debit_types)) for transaction in transactions]
    flows.append((date.today(), current_value))
    return xirr(flows)


def xirr_string(rate: Decimal | None) -> str | None:
    if rate is None:
        return None
    if rate == 0:
        return "0"
    return format(rate, "f")


def calculate_dashboard_xirr(
    db: Session,
    household_member_ids: list[uuid.UUID],
    holdings: list[HoldingRow],
) -> DashboardXirrSummary:
    if not household_member_ids:
        return DashboardXirrSummary(None, None)

    transaction_rows = (
        db.query(Transaction, Folio.scheme_id)
        .join(Folio, Folio.id == Transaction.folio_id)
        .filter(
            Folio.household_member_id.in_(household_member_ids),
            Transaction.type.in_(_RELEVANT_TYPES),
        )
        .order_by(Transaction.date, Transaction.id)
        .all()
    )
    transactions = [transaction for transaction, _scheme_id in transaction_rows]
    if not transactions:
        return DashboardXirrSummary(None, None)

    lifetime_value = sum(
        (Decimal(holding.current_value) for holding in holdings if holding.current_value is not None),
        Decimal("0"),
    )
    current_scheme_ids = {
        uuid.UUID(holding.scheme_id)
        for holding in holdings
        if Decimal(holding.units_held) != 0
    }
    current_transactions = [
        transaction
        for transaction, scheme_id in transaction_rows
        if scheme_id in current_scheme_ids
    ]
    current_value = sum(
        (
            Decimal(holding.current_value)
            for holding in holdings
            if holding.current_value is not None and uuid.UUID(holding.scheme_id) in current_scheme_ids
        ),
        Decimal("0"),
    )
    return DashboardXirrSummary(
        lifetime_xirr=xirr_string(portfolio_xirr(transactions, lifetime_value)),
        current_holdings_xirr=xirr_string(portfolio_xirr(current_transactions, current_value)) if current_transactions else None,
    )
