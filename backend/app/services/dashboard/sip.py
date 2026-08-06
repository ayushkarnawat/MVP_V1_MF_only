"""Active-SIP detection — a SIP is "active" if its most recent
purchase_sip transaction, per folio, falls within the last 40 days
(covers a monthly cadence plus a grace window for processing delays)."""

from __future__ import annotations

import uuid
from datetime import date, timedelta

from sqlalchemy.orm import Session

from app.models.enums import TransactionType
from app.models.folio import Folio
from app.models.reference import Scheme
from app.models.transaction import Transaction
from app.models.user import HouseholdMember
from app.services.dashboard.schemas import SipRow

SIP_ACTIVE_WINDOW_DAYS = 40


def compute_active_sips(db: Session, household_member_ids: list[uuid.UUID]) -> list[SipRow]:
    if not household_member_ids:
        return []

    members = {m.id: m for m in db.query(HouseholdMember).filter(HouseholdMember.id.in_(household_member_ids)).all()}
    folios = db.query(Folio).filter(Folio.household_member_id.in_(household_member_ids)).all()
    cutoff = date.today() - timedelta(days=SIP_ACTIVE_WINDOW_DAYS)

    rows: list[SipRow] = []
    for folio in folios:
        most_recent = (
            db.query(Transaction)
            .filter(Transaction.folio_id == folio.id, Transaction.type == TransactionType.PURCHASE_SIP)
            .order_by(Transaction.date.desc())
            .first()
        )
        if most_recent is None or most_recent.date < cutoff:
            continue
        scheme = db.get(Scheme, folio.scheme_id)
        rows.append(
            SipRow(
                scheme_id=str(scheme.id),
                scheme_name=scheme.name,
                household_member_id=str(folio.household_member_id),
                household_member_name=members[folio.household_member_id].name,
                sip_date=most_recent.date,
                sip_amount=str(most_recent.amount),
            )
        )
    return rows
