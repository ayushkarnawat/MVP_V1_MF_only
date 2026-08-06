"""FIFO holdings engine — the core of the Main Dashboard backend. First lot
purchased is the first lot considered redeemed, matching Indian
capital-gains convention and how CAMS/KFintech CAS statements themselves
report gains.
"""

from __future__ import annotations

import uuid
from collections import defaultdict
from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from sqlalchemy import case
from sqlalchemy.orm import Session

from app.models.enums import PlanType, TransactionType
from app.models.folio import Folio
from app.models.reference import Scheme
from app.models.transaction import Transaction
from app.models.user import HouseholdMember
from app.services.dashboard.nav import get_nav_on_or_before, get_previous_nav_from_cache
from app.services.dashboard.schemas import HoldingRow

_LOT_ADDING_TYPES = {TransactionType.PURCHASE, TransactionType.PURCHASE_SIP, TransactionType.SWITCH_IN, TransactionType.DIVIDEND_REINVEST}
_LOT_CONSUMING_TYPES = {TransactionType.REDEMPTION, TransactionType.SWITCH_OUT}


@dataclass
class _Lot:
    units: Decimal
    nav: Decimal


def _process_folio_lots(transactions: list[Transaction]) -> tuple[Decimal, Decimal, Decimal]:
    """Returns (units_held, cost_basis, realized_gain) for one folio's
    transaction history, in FIFO order. `transactions` must already be
    sorted chronologically by the caller.

    STT/stamp_duty/misc/segregation transactions have no effect here — a
    stated simplification, see the design spec's Open Items."""
    lots: list[_Lot] = []
    realized_gain = Decimal("0")

    for txn in transactions:
        if txn.type in _LOT_ADDING_TYPES:
            lots.append(_Lot(units=txn.units, nav=txn.nav))
        elif txn.type in _LOT_CONSUMING_TYPES:
            remaining = txn.units
            while remaining > 0 and lots:
                lot = lots[0]
                take = min(lot.units, remaining)
                realized_gain += take * (txn.nav - lot.nav)
                lot.units -= take
                remaining -= take
                if lot.units == 0:
                    lots.pop(0)

    units_held = sum((lot.units for lot in lots), Decimal("0"))
    cost_basis = sum((lot.units * lot.nav for lot in lots), Decimal("0"))
    return units_held, cost_basis, realized_gain


async def compute_holdings(db: Session, household_member_ids: list[uuid.UUID]) -> list[HoldingRow]:
    if not household_member_ids:
        return []

    members = {
        m.id: m
        for m in db.query(HouseholdMember).filter(HouseholdMember.id.in_(household_member_ids)).all()
    }
    folios = db.query(Folio).filter(Folio.household_member_id.in_(household_member_ids)).all()

    grouped: dict[tuple[uuid.UUID, uuid.UUID], list[Folio]] = defaultdict(list)
    for folio in folios:
        grouped[(folio.household_member_id, folio.scheme_id)].append(folio)

    rows: list[HoldingRow] = []
    for (member_id, scheme_id), member_folios in grouped.items():
        scheme = db.get(Scheme, scheme_id)
        total_units = Decimal("0")
        total_cost = Decimal("0")
        total_realized = Decimal("0")
        # First-encountered folio's plan_type represents the merged row — a
        # stated simplification for the rare case of the same scheme held
        # via folios with different plan types (e.g. one direct, one
        # regular). Distributor comparison (a later, separate phase) is
        # where folio-level plan_type detail becomes visible.
        plan_type = member_folios[0].plan_type

        for folio in member_folios:
            transactions = (
                db.query(Transaction)
                .filter(Transaction.folio_id == folio.id)
                .order_by(
                    Transaction.date,
                    # Same-date purchases must sort before redemptions —
                    # Transaction.id is a random uuid4, so id-only tiebreak
                    # would let a same-day redemption randomly process first
                    # and silently under-consume (no lots to draw from).
                    case((Transaction.type.in_(_LOT_CONSUMING_TYPES), 1), else_=0),
                    Transaction.id,
                )
                .all()
            )
            units_held, cost_basis, realized_gain = _process_folio_lots(transactions)
            total_units += units_held
            total_cost += cost_basis
            total_realized += realized_gain

        if total_units == 0:
            continue

        nav_result = await get_nav_on_or_before(db, scheme, date.today())
        if nav_result is None:
            continue
        current_nav, current_nav_date = nav_result
        previous = get_previous_nav_from_cache(db, scheme.id, current_nav_date)
        previous_nav = previous[0] if previous else current_nav

        current_value = total_units * current_nav
        unrealized_gain = current_value - total_cost
        current_profit_total = total_realized + unrealized_gain
        today_gain = (current_nav - previous_nav) * total_units
        average_nav = (total_cost / total_units) if total_units else None

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
                current_nav=str(current_nav),
                current_nav_date=current_nav_date,
                amount_invested=str(total_cost),
                current_value=str(current_value),
                current_profit_total=str(current_profit_total),
                realized_gain=str(total_realized),
                unrealized_gain=str(unrealized_gain),
                today_gain=str(today_gain),
            )
        )
    return rows
