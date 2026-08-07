"""Distributor comparison — PRD-03 FR-11. Groups a member's holdings of one
scheme by which ARN (distributor) they were bought through, reusing the
same FIFO engine as holdings.py one level finer: by (member, scheme, ARN)
instead of just (member, scheme).

Unlike holdings.py, a group with zero units held (e.g. fully redeemed
through one distributor) is still included, not dropped — this view is
about comparing performance across distributors, including a distributor
you've since fully exited, not just what's currently held (holdings.py's
own zero-unit drop is specific to that live-holdings-table's purpose).
"""

from __future__ import annotations

import uuid
from collections import defaultdict
from datetime import date
from decimal import Decimal

from sqlalchemy import case
from sqlalchemy.orm import Session

from app.models.folio import Folio
from app.models.reference import Scheme
from app.models.transaction import Transaction
from app.services.dashboard.arn_lookup import resolve_arn
from app.services.dashboard.holdings import _LOT_CONSUMING_TYPES, _process_folio_lots
from app.services.dashboard.nav import get_nav_on_or_before
from app.services.dashboard.schemas import DistributorComparisonRow


async def compute_distributor_comparison(
    db: Session, household_member_id: uuid.UUID, scheme_id: uuid.UUID
) -> list[DistributorComparisonRow]:
    folios = (
        db.query(Folio)
        .filter(Folio.household_member_id == household_member_id, Folio.scheme_id == scheme_id)
        .all()
    )
    if not folios:
        return []

    scheme = db.get(Scheme, scheme_id)
    nav_result = await get_nav_on_or_before(db, scheme, date.today())
    if nav_result is None:
        return []
    current_nav, _current_nav_date = nav_result

    grouped: dict[str | None, list[Folio]] = defaultdict(list)
    for folio in folios:
        grouped[folio.arn_code].append(folio)

    rows: list[DistributorComparisonRow] = []
    for arn_code, group_folios in grouped.items():
        total_units = Decimal("0")
        total_cost = Decimal("0")
        total_realized = Decimal("0")

        for folio in group_folios:
            transactions = (
                db.query(Transaction)
                .filter(Transaction.folio_id == folio.id)
                .order_by(
                    Transaction.date,
                    # Same same-date purchase-before-redemption tiebreak as
                    # holdings.py — reused via the shared constant, not
                    # redefined, so the two stay in lockstep by construction.
                    case((Transaction.type.in_(_LOT_CONSUMING_TYPES), 1), else_=0),
                    Transaction.id,
                )
                .all()
            )
            units_held, cost_basis, realized_gain = _process_folio_lots(transactions)
            total_units += units_held
            total_cost += cost_basis
            total_realized += realized_gain

        current_value = total_units * current_nav
        unrealized_gain = current_value - total_cost
        current_profit_total = total_realized + unrealized_gain
        average_nav = (total_cost / total_units) if total_units else None

        distributor_name = None
        arn_status = None
        if arn_code is not None:
            resolved = await resolve_arn(db, arn_code)
            if resolved is not None:
                distributor_name = resolved.distributor_name
                arn_status = resolved.status

        rows.append(
            DistributorComparisonRow(
                arn_code=arn_code,
                distributor_name=distributor_name,
                arn_status=arn_status,
                units_held=str(total_units),
                average_nav=str(average_nav) if average_nav is not None else None,
                amount_invested=str(total_cost),
                current_value=str(current_value),
                current_profit_total=str(current_profit_total),
                realized_gain=str(total_realized),
                unrealized_gain=str(unrealized_gain),
            )
        )
    return rows
