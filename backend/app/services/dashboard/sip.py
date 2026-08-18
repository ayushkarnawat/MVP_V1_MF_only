"""Active-SIP detection and cadence projection.

A SIP is "active" if the folio has at least one PURCHASE_SIP transaction,
ever, and the folio is not fully redeemed. There is deliberately no
recency cutoff: once detected, a SIP keeps projecting its next due date
forward indefinitely, regardless of gaps in the transaction history. See
Docs/superpowers/specs/2026-08-18-active-sips-cadence-redesign-design.md
for the product rationale (supersedes PRD-03 FR-6's original 40-day
window).
"""

from __future__ import annotations

import calendar
import uuid
from collections import defaultdict
from datetime import date

from sqlalchemy import case
from sqlalchemy.orm import Session

from app.models.enums import TransactionType
from app.models.folio import Folio
from app.models.reference import Scheme
from app.models.transaction import Transaction
from app.models.user import HouseholdMember
from app.services.dashboard.holdings import _LOT_CONSUMING_TYPES, _process_folio_lots
from app.services.dashboard.schemas import SipMonthlyRow, SipRow


def _add_months_clamped(anchor: date, months: int) -> date:
    """anchor's day-of-month, `months` months later (negative allowed, for
    projecting backward), clamped to the target month's actual length."""
    month_index = anchor.month - 1 + months
    year = anchor.year + month_index // 12
    month = month_index % 12 + 1
    day = min(anchor.day, calendar.monthrange(year, month)[1])
    return date(year, month, day)


def _next_due_on_or_after(anchor: date, today: date) -> date:
    """First monthly-cadence occurrence of anchor's day-of-month that
    falls on or after today. Loop bound is small in practice — an anchor
    a decade stale is ~120 iterations of pure date arithmetic."""
    months = 0
    candidate = anchor
    while candidate < today:
        months += 1
        candidate = _add_months_clamped(anchor, months)
    return candidate

def _folio_transactions_by_id(
    db: Session, folios: list[Folio]
) -> dict[uuid.UUID, list[Transaction]]:
    """Single batched query for every given folio's transactions, ordered
    exactly like holdings.py's per-folio query (same-date redemptions
    sorted after purchases, so _process_folio_lots gets correctly-ordered
    input) — replaces what would otherwise be one query per folio."""
    folio_ids = [f.id for f in folios]
    if not folio_ids:
        return {}
    transactions = (
        db.query(Transaction)
        .filter(Transaction.folio_id.in_(folio_ids))
        .order_by(
            Transaction.date,
            case((Transaction.type.in_(_LOT_CONSUMING_TYPES), 1), else_=0),
            Transaction.id,
        )
        .all()
    )
    by_folio: dict[uuid.UUID, list[Transaction]] = defaultdict(list)
    for txn in transactions:
        by_folio[txn.folio_id].append(txn)
    return by_folio


def compute_active_sips(db: Session, household_member_ids: list[uuid.UUID]) -> list[SipRow]:
    if not household_member_ids:
        return []

    members = {
        m.id: m
        for m in db.query(HouseholdMember).filter(HouseholdMember.id.in_(household_member_ids)).all()
    }
    folios = db.query(Folio).filter(Folio.household_member_id.in_(household_member_ids)).all()
    by_folio = _folio_transactions_by_id(db, folios)
    today = date.today()

    rows: list[SipRow] = []
    for folio in folios:
        transactions = by_folio.get(folio.id, [])
        sip_txns = [t for t in transactions if t.type == TransactionType.PURCHASE_SIP]
        if not sip_txns:
            continue

        units_held, _, _ = _process_folio_lots(transactions)
        if units_held <= 0:
            continue

        latest = sip_txns[-1]  # transactions is chronologically ordered
        scheme = db.get(Scheme, folio.scheme_id)
        rows.append(
            SipRow(
                scheme_id=str(scheme.id),
                scheme_name=scheme.name,
                household_member_id=str(folio.household_member_id),
                household_member_name=members[folio.household_member_id].name,
                sip_date=latest.date,
                sip_amount=str(latest.amount),
                next_due_date=_next_due_on_or_after(latest.date, today),
            )
        )
    return rows


def compute_sips_for_month(
    db: Session, household_member_ids: list[uuid.UUID], year: int, month: int
) -> list[SipMonthlyRow]:
    if not household_member_ids:
        return []

    members = {
        m.id: m
        for m in db.query(HouseholdMember).filter(HouseholdMember.id.in_(household_member_ids)).all()
    }
    folios = db.query(Folio).filter(Folio.household_member_id.in_(household_member_ids)).all()
    by_folio = _folio_transactions_by_id(db, folios)

    rows: list[SipMonthlyRow] = []
    for folio in folios:
        transactions = by_folio.get(folio.id, [])
        sip_txns = [t for t in transactions if t.type == TransactionType.PURCHASE_SIP]
        if not sip_txns:
            continue

        first_txn = sip_txns[0]
        latest_txn = sip_txns[-1]
        actual = next(
            (t for t in reversed(sip_txns) if t.date.year == year and t.date.month == month),
            None,
        )
        scheme = db.get(Scheme, folio.scheme_id)
        member_name = members[folio.household_member_id].name

        if actual is not None:
            rows.append(
                SipMonthlyRow(
                    scheme_id=str(scheme.id),
                    scheme_name=scheme.name,
                    household_member_id=str(folio.household_member_id),
                    household_member_name=member_name,
                    date=actual.date,
                    amount=str(actual.amount),
                )
            )
            continue

        units_held, _, _ = _process_folio_lots(transactions)
        if units_held <= 0:
            # Redeemed, and no real transaction landed in this month —
            # never fabricate a projected row for a dead folio.
            continue

        if (year, month) < (first_txn.date.year, first_txn.date.month):
            continue

        months_diff = (year - latest_txn.date.year) * 12 + (month - latest_txn.date.month)
        projected_date = _add_months_clamped(latest_txn.date, months_diff)
        rows.append(
            SipMonthlyRow(
                scheme_id=str(scheme.id),
                scheme_name=scheme.name,
                household_member_id=str(folio.household_member_id),
                household_member_name=member_name,
                date=projected_date,
                amount=str(latest_txn.amount),
            )
        )
    return rows
