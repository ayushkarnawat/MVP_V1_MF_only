"""Hybrid CAS opening cost; artifact #1, 'Decided: the hybrid cost method'."""
from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from app.core.decimal_utils import quantize_amount, quantize_nav
from app.models.enums import CostSource, TransactionType
from app.services.import_.parser import NormalizedTransaction, ParsedScheme

_IN = {TransactionType.PURCHASE, TransactionType.PURCHASE_SIP,
       TransactionType.SWITCH_IN, TransactionType.DIVIDEND_REINVEST}
_OUT = {TransactionType.REDEMPTION, TransactionType.SWITCH_OUT}


@dataclass(frozen=True)
class OpeningLot:
    units: Decimal
    start: date
    nav: Decimal
    amount: Decimal
    cost_source: CostSource


def _consume(lots, units):
    opening, cost = Decimal("0"), Decimal("0")
    while units > 0 and lots:
        take = min(units, lots[0][0])
        if lots[0][2]:
            opening += take
        else:
            cost += take * lots[0][1]
        lots[0][0] -= take
        units -= take
        if lots[0][0] == 0:
            lots.pop(0)
    return opening, cost


def price_opening_lot(
    scheme: ParsedScheme, txns: list[NormalizedTransaction], start: date,
    nav_series: list[tuple[date, Decimal]] | None,
) -> OpeningLot | None:
    if scheme.open_units == 0:
        return None
    lots = [[scheme.open_units, Decimal("0"), True]]
    for row in sorted(txns, key=lambda t: t.txn_date):
        if row.txn_type in _IN:
            lots.append([row.units, row.nav, False])
        elif row.txn_type in _OUT:
            _consume(lots, row.units)
    remaining = sum((u for u, n, opening in lots if opening), Decimal("0"))
    held_cost = sum((u * n for u, n, opening in lots if not opening), Decimal("0"))
    series = sorted(nav_series or [])
    before = [n for d, n in series if d < start]
    cost = ((scheme.valuation_cost - held_cost) / remaining
            if remaining > 0 and scheme.valuation_cost is not None else None)
    # Artifact #1: use the whole pre-start NAV range to reject implausible CAS cost.
    plausible = cost is not None and cost > 0 and (not before or min(before) <= cost <= max(before))
    source = CostSource.CAS_COST if plausible else CostSource.NAV_ON_START
    if not plausible:
        on_start = [n for d, n in series if d <= start]
        first_nav = next((t.nav for t in sorted(txns, key=lambda t: t.txn_date) if t.nav and t.nav > 0), None)
        cost = on_start[-1] if on_start else first_nav or scheme.valuation_nav or Decimal("0")
    nav = quantize_nav(cost)
    return OpeningLot(scheme.open_units, start, nav, quantize_amount(scheme.open_units * nav), source)


def apply_opening_cost_to_conversions(
    lot: OpeningLot, txns: list[NormalizedTransaction], partner: dict[int, NormalizedTransaction],
) -> None:
    lots = [[lot.units, lot.nav, True]]
    for index, row in sorted(enumerate(txns), key=lambda item: item[1].txn_date):
        if row.txn_type in _IN:
            lots.append([row.units, row.nav, False])
        elif row.txn_type in _OUT:
            opening, known_cost = _consume(lots, row.units)
            if row.conversion_from_opening:
                amount = quantize_amount(opening * lot.nav + known_cost)
                incoming = partner[index]
                for leg in (row, incoming):
                    leg.amount = amount
                    leg.nav = quantize_nav(amount / leg.units) if leg.units else Decimal("0.0000")
                    leg.conversion_from_opening = False
