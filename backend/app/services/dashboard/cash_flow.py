"""Investment cash flow — computed entirely from parsed transactions, no
new data source. Purchases/SIP debits as outflow, redemptions and dividend
payouts as inflow, per PRD-03 FR-7. switch_in/switch_out are intra-portfolio
movements, not real cash entering or leaving the platform, and excluded —
FR-7's own wording doesn't mention switches. stt/stamp_duty/misc/segregation
are also excluded (informational, not a cash movement FR-7 describes)."""

from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from app.models.enums import TransactionType
from app.models.folio import Folio
from app.models.reference import Scheme
from app.models.transaction import Transaction
from app.models.user import HouseholdMember
from app.services.dashboard.schemas import CashFlowEntry

_DEBIT_TYPES = {TransactionType.PURCHASE, TransactionType.PURCHASE_SIP}
_CREDIT_TYPES = {TransactionType.REDEMPTION, TransactionType.DIVIDEND_PAYOUT}


def compute_cash_flow(db: Session, household_member_ids: list[uuid.UUID]) -> list[CashFlowEntry]:
    if not household_member_ids:
        return []

    members = {m.id: m for m in db.query(HouseholdMember).filter(HouseholdMember.id.in_(household_member_ids)).all()}
    folios = {f.id: f for f in db.query(Folio).filter(Folio.household_member_id.in_(household_member_ids)).all()}
    if not folios:
        return []
    schemes = {s.id: s for s in db.query(Scheme).filter(Scheme.id.in_({f.scheme_id for f in folios.values()})).all()}

    relevant_types = _DEBIT_TYPES | _CREDIT_TYPES
    transactions = (
        db.query(Transaction)
        .filter(Transaction.folio_id.in_(folios.keys()), Transaction.type.in_(relevant_types))
        .order_by(Transaction.date, Transaction.id)
        .all()
    )

    entries: list[CashFlowEntry] = []
    for txn in transactions:
        folio = folios[txn.folio_id]
        scheme = schemes[folio.scheme_id]
        entries.append(
            CashFlowEntry(
                date=txn.date,
                type=txn.type,
                amount=str(txn.amount),
                direction="debit" if txn.type in _DEBIT_TYPES else "credit",
                scheme_name=scheme.name,
                household_member_id=str(folio.household_member_id),
                household_member_name=members[folio.household_member_id].name,
            )
        )
    return entries
