from __future__ import annotations

import uuid
from collections import defaultdict
from collections.abc import Sequence
from datetime import date
from decimal import Decimal

from sqlalchemy.orm import Session

from app.services.dashboard.holdings import FifoState, _load_folio_transactions


def build_units_timeline(
    db: Session,
    household_member_ids: Sequence[uuid.UUID],
    *,
    scheme_ids: frozenset[uuid.UUID] | None = None,
) -> dict[uuid.UUID, list[tuple[date, Decimal]]]:
    if not household_member_ids:
        return {}

    folios, transactions_by_folio = _load_folio_transactions(
        db, list(household_member_ids), scheme_ids=scheme_ids
    )
    changes: dict[uuid.UUID, dict[date, Decimal]] = defaultdict(
        lambda: defaultdict(lambda: Decimal("0"))
    )
    for folio in folios:
        state = FifoState()
        previous_units = Decimal("0")
        transactions = transactions_by_folio.get(folio.id, [])
        for index, transaction in enumerate(transactions):
            state.apply(transaction)
            is_last_on_date = (
                index + 1 == len(transactions)
                or transactions[index + 1].date != transaction.date
            )
            if is_last_on_date:
                delta = state.units - previous_units
                if delta:
                    changes[folio.scheme_id][transaction.date] += delta
                previous_units = state.units

    result: dict[uuid.UUID, list[tuple[date, Decimal]]] = {}
    for scheme_id, changes_by_date in changes.items():
        total = Decimal("0")
        points = []
        for changed_on in sorted(changes_by_date):
            next_total = total + changes_by_date[changed_on]
            if next_total != total:
                points.append((changed_on, next_total))
            total = next_total
        if points:
            result[scheme_id] = points
    return result
