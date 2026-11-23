from collections import defaultdict
from collections.abc import Sequence
from decimal import Decimal
from typing import Literal
from uuid import UUID

from app.models.transaction import Transaction
from app.services.lot_rules import LOT_CONSUMING_TYPES, apply_lot_rules


def open_or_sold(transactions: Sequence[Transaction]) -> Literal["open", "sold"]:
    """Replay independent folios before combining the member's fund position."""
    by_folio: dict[UUID, list[Transaction]] = defaultdict(list)
    for txn in transactions:
        by_folio[txn.folio_id].append(txn)
    total = Decimal("0")
    for rows in by_folio.values():
        lots: list[list[Decimal]] = []
        for txn in sorted(rows, key=lambda row: (row.date, row.type in LOT_CONSUMING_TYPES, row.id)):
            # Only remaining units matter here; lot costs and NAVs are never read.
            apply_lot_rules(lots, txn.type, txn.units, Decimal("0"), lambda units, cost: [units, cost])
        total += sum((lot[0] for lot in lots), Decimal("0"))
    return "open" if total > 0 else "sold"
