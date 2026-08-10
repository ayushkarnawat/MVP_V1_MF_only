"""Coverage gap detection and opening balance resolution engine (FR-7)."""

from __future__ import annotations

from datetime import date
from decimal import Decimal
import uuid
from typing import Any

from sqlalchemy.orm import Session

from app.models.enums import ImportStatus, TransactionType
from app.models.folio import Folio
from app.models.imports import Import
from app.models.transaction import Transaction
from app.models.user import HouseholdMember

UNIT_INFLOW_TYPES = {
    TransactionType.PURCHASE,
    TransactionType.PURCHASE_SIP,
    TransactionType.SWITCH_IN,
    TransactionType.DIVIDEND_REINVEST,
    TransactionType.OPENING_BALANCE,
}

UNIT_OUTFLOW_TYPES = {
    TransactionType.REDEMPTION,
    TransactionType.SWITCH_OUT,
}


def _type_sort_key(txn_type: TransactionType) -> int:
    """Sort inflows before outflows on identical dates."""
    if txn_type in UNIT_INFLOW_TYPES:
        return 0
    return 1


def evaluate_folio_coverage_gaps(db: Session, folio_id: uuid.UUID) -> dict[str, Any] | None:
    """Evaluates the transaction ledger for a folio to detect coverage gaps (e.g.

    redemptions exceeding known purchases due to a missing earlier statement range).
    Updates folio.has_coverage_gap and folio.coverage_gap_details in-place.
    """
    folio = db.get(Folio, folio_id)
    if not folio:
        return None

    txns = db.query(Transaction).filter_by(folio_id=folio_id).all()
    # Sort chronologically, with inflows before outflows on the same date
    txns.sort(key=lambda t: (t.date, _type_sort_key(t.type)))

    running_units = Decimal("0")
    max_deficit = Decimal("0")
    first_deficit_date: date | None = None

    for txn in txns:
        if txn.units is None:
            continue

        if txn.type in UNIT_INFLOW_TYPES:
            running_units += txn.units
        elif txn.type in UNIT_OUTFLOW_TYPES:
            running_units -= txn.units

        if running_units < Decimal("0"):
            deficit = abs(running_units)
            if deficit > max_deficit:
                max_deficit = deficit
            if first_deficit_date is None:
                first_deficit_date = txn.date

    if max_deficit > Decimal("0") and first_deficit_date is not None:
        gap_details = {
            "folio_id": str(folio.id),
            "folio_number": folio.folio_number,
            "deficit_units": str(max_deficit),
            "first_deficit_date": first_deficit_date.isoformat(),
        }
        folio.has_coverage_gap = True
        folio.coverage_gap_details = gap_details
        db.flush()
        return gap_details

    folio.has_coverage_gap = False
    folio.coverage_gap_details = None
    db.flush()
    return None


def evaluate_member_coverage_gaps(db: Session, member_id: uuid.UUID) -> list[Folio]:
    """Scans all folios for a household member and evaluates coverage gaps."""
    folios = db.query(Folio).filter_by(household_member_id=member_id).all()
    gapped_folios = []
    for f in folios:
        gap = evaluate_folio_coverage_gaps(db, f.id)
        if gap is not None:
            gapped_folios.append(f)
    return gapped_folios


def create_opening_balance(
    db: Session,
    folio_id: uuid.UUID,
    user_id: uuid.UUID,
    units: Decimal,
    date_: date,
    amount: Decimal | None = None,
    nav: Decimal | None = None,
) -> Transaction:
    """Creates a manual OPENING_BALANCE transaction to resolve a coverage gap."""
    folio = (
        db.query(Folio)
        .join(HouseholdMember, Folio.household_member_id == HouseholdMember.id)
        .filter(Folio.id == folio_id, HouseholdMember.user_id == user_id)
        .first()
    )
    if not folio:
        raise ValueError("Folio not found or not owned by user.")

    if units <= Decimal("0"):
        raise ValueError("Opening balance units must be positive.")

    if amount is None and nav is not None:
        amount = (units * nav).quantize(Decimal("0.01"))
    elif nav is None and amount is not None and units > Decimal("0"):
        nav = (amount / units).quantize(Decimal("0.0001"))
    elif amount is None and nav is None:
        nav = Decimal("10.0000")
        amount = (units * nav).quantize(Decimal("0.01"))

    assert amount is not None and nav is not None

    # Link to member's latest import or create a manual import marker
    latest_import = (
        db.query(Import)
        .filter_by(household_member_id=folio.household_member_id)
        .order_by(Import.uploaded_at.desc())
        .first()
    )
    if latest_import is None:
        from datetime import datetime, timezone
        latest_import = Import(
            id=uuid.uuid4(),
            household_member_id=folio.household_member_id,
            status=ImportStatus.IMPORT_SUCCESSFUL,
            uploaded_at=datetime.now(timezone.utc),
            confirmed_at=datetime.now(timezone.utc),
        )
        db.add(latest_import)
        db.flush()

    txn = Transaction(
        id=uuid.uuid4(),
        folio_id=folio_id,
        import_id=latest_import.id,
        type=TransactionType.OPENING_BALANCE,
        date=date_,
        amount=amount,
        units=units,
        nav=nav,
        raw_description="Manual Opening Balance Entry",
    )
    db.add(txn)
    db.flush()

    # Re-evaluate coverage gap
    evaluate_folio_coverage_gaps(db, folio_id)
    db.commit()
    db.refresh(txn)
    return txn
