"""The one place that says how each transaction type changes a folio's lots.

Holdings (dashboard/holdings.py), the CAS opening-balance cost
(import_/opening_balance.py) and the parse-time cost of a unit conversion
(import_/parser.py) all replay rows through these rules, so they can't drift
apart again (Phase 3 review finding: opening cost ignored the new row types).

A lot is any mutable list whose first two items are [units, nav]; callers
append their own markers after that (e.g. "this lot is the opening balance").
"""

from __future__ import annotations

from collections.abc import Callable
from decimal import Decimal

from app.models.enums import TransactionType
from app.models.transaction import Transaction

LOT_ADDING_TYPES = {
    TransactionType.PURCHASE, TransactionType.PURCHASE_SIP, TransactionType.SWITCH_IN,
    TransactionType.DIVIDEND_REINVEST, TransactionType.OPENING_BALANCE,
    # #3: gifts are priced at NAV on the gift date; bonus and segregated units
    # arrive at zero cost (their row nav is 0).
    TransactionType.GIFT_IN, TransactionType.BONUS, TransactionType.SEGREGATION,
}
# Removed FIFO and realise a gain.
LOT_SELLING_TYPES = {TransactionType.REDEMPTION, TransactionType.SWITCH_OUT}
# Every type that removes units. Callers also use it to sort same-day rows after
# the adding ones. GIFT_OUT and REVERSAL remove units without a realised gain.
LOT_CONSUMING_TYPES = LOT_SELLING_TYPES | {TransactionType.GIFT_OUT, TransactionType.REVERSAL}


def cost_per_unit(units: Decimal, nav: Decimal, amount: Decimal | None, stamp_duty: Decimal | None) -> Decimal:
    """What a new lot cost per unit: the row's NAV, or (amount + stamp duty) ÷
    units when stamp duty was charged, so cost equals the CAS cost column
    (decided 7 Oct). Every lot replay passes this as `nav`; selling rows carry
    no stamp duty, so they keep their sale NAV."""
    if stamp_duty and units and amount is not None:
        per_unit = (amount + stamp_duty) / units
        # An exact quotient keeps Decimal's ideal exponent (5000.00 / 100.000
        # is 5E+1), which then shows up in every average cost as "5E+1" and
        # the frontend reads as 0.00 (review 8 Oct). Lossless: a positive
        # exponent means a whole number.
        return per_unit.quantize(Decimal("1")) if per_unit.as_tuple().exponent > 0 else per_unit
    return nav


def paid_amount(transaction: Transaction) -> Decimal:
    """Money that actually moved: a purchase's amount plus its stamp duty (7 Oct)."""
    return transaction.amount + (transaction.stamp_duty or Decimal("0"))


def _take_fifo(lots: list[list], units: Decimal) -> list[tuple[list, Decimal]]:
    pieces: list[tuple[list, Decimal]] = []
    while units > 0 and lots:
        lot = lots[0]
        take = min(lot[0], units)
        pieces.append((lot, take))
        lot[0] -= take
        units -= take
        if lot[0] == 0:
            lots.pop(0)
    return pieces


def apply_lot_rules(
    lots: list[list],
    txn_type: TransactionType,
    units: Decimal,
    nav: Decimal,
    new_lot: Callable[[Decimal, Decimal], list],
) -> list[tuple[list, Decimal]]:
    """Apply one row to `lots` in place. Returns the (lot, units taken) pieces
    a FIFO removal consumed — for REDEMPTION, SWITCH_OUT and GIFT_OUT — so the
    caller can price them (a realised gain, or the cost a conversion carries).
    A REVERSAL (bounced SIP) cancels the most recent earlier lot with exactly
    its units, else takes that many units from the newest lots; it returns
    nothing because nothing was sold. Other types don't touch lots."""
    if txn_type in LOT_ADDING_TYPES:
        lots.append(new_lot(units, nav))
        return []
    if txn_type == TransactionType.REVERSAL:
        match = next((i for i in range(len(lots) - 1, -1, -1) if lots[i][0] == units), None)
        if match is not None:
            lots.pop(match)
            return []
        remaining = units
        while remaining > 0 and lots:
            lot = lots[-1]
            take = min(lot[0], remaining)
            lot[0] -= take
            remaining -= take
            if lot[0] == 0:
                lots.pop()
        return []
    if txn_type in LOT_CONSUMING_TYPES:
        return _take_fifo(lots, units)
    return []
