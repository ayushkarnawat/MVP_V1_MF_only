from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from sqlalchemy.orm import Session, aliased

from app.models.enums import TransactionType
from app.models.folio import Folio
from app.models.reference import Scheme
from app.models.transaction import Transaction


TRANSACTIONS_CAP = 20
INVESTED_TYPES = frozenset({
    TransactionType.PURCHASE, TransactionType.PURCHASE_SIP, TransactionType.SWITCH_IN,
})
_NON_FUND_TYPES = frozenset({
    TransactionType.OPENING_BALANCE, TransactionType.STT, TransactionType.STAMP_DUTY,
    TransactionType.MISC, TransactionType.REVERSAL,
})


@dataclass(frozen=True)
class NewFundTx:
    date: date
    type: TransactionType
    amount: Decimal
    units: Decimal


@dataclass(frozen=True)
class NewFund:
    """A scheme first inserted for this member by this import.

    invested_amount totals purchases, SIPs and switch-ins in this import only;
    redemptions are ignored, never netted off.
    """

    scheme_id: uuid.UUID
    scheme_name: str
    amc_name: str | None
    invested_amount: Decimal
    latest_transaction_date: date
    transaction_count: int
    transactions: tuple[NewFundTx, ...]


def find_new_funds(
    db: Session, import_id: uuid.UUID, member_id: uuid.UUID,
) -> list[NewFund]:
    previous_tx = aliased(Transaction)
    previous_folio = aliased(Folio)
    other_import_has_scheme = (
        db.query(previous_tx.id)
        .join(previous_folio, previous_folio.id == previous_tx.folio_id)
        .filter(
            previous_folio.household_member_id == member_id,
            previous_folio.scheme_id == Folio.scheme_id,
            previous_tx.import_id != import_id,
        )
        .correlate(Folio)
        .exists()
    )
    rows = (
        db.query(Transaction, Scheme)
        .join(Folio, Folio.id == Transaction.folio_id)
        .join(Scheme, Scheme.id == Folio.scheme_id)
        .filter(
            Transaction.import_id == import_id,
            Folio.household_member_id == member_id,
            ~other_import_has_scheme,
        )
        .order_by(Transaction.date.desc(), Transaction.id.desc())
        .all()
    )
    by_scheme: dict[uuid.UUID, tuple[Scheme, list[Transaction]]] = {}
    for transaction, scheme in rows:
        if scheme.id not in by_scheme:
            by_scheme[scheme.id] = (scheme, [])
        by_scheme[scheme.id][1].append(transaction)

    funds = []
    for scheme, transactions in by_scheme.values():
        if all(transaction.type in _NON_FUND_TYPES for transaction in transactions):
            continue
        funds.append(NewFund(
            scheme_id=scheme.id,
            scheme_name=scheme.name,
            amc_name=scheme.amc_name,
            invested_amount=sum(
                (transaction.amount for transaction in transactions if transaction.type in INVESTED_TYPES),
                Decimal("0.00"),
            ),
            latest_transaction_date=transactions[0].date,
            transaction_count=len(transactions),
            transactions=tuple(
                NewFundTx(transaction.date, transaction.type, transaction.amount, transaction.units)
                for transaction in transactions[:TRANSACTIONS_CAP]
            ),
        ))
    return sorted(funds, key=lambda fund: (-fund.invested_amount, str(fund.scheme_id)))
