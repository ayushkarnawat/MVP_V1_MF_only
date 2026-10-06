"""Hybrid CAS opening cost; artifact #1, 'Decided: the hybrid cost method'."""
from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from app.core.decimal_utils import quantize_amount, quantize_nav
from app.models.enums import CostSource
from app.services.import_.parser import NormalizedTransaction, ParsedScheme

from app.services.lot_rules import apply_lot_rules


def _in_period_lot(units: Decimal, nav: Decimal) -> list:
    return [units, nav, False]


@dataclass(frozen=True)
class OpeningLot:
    units: Decimal
    start: date
    nav: Decimal
    amount: Decimal
    cost_source: CostSource


def _split(pieces) -> tuple[Decimal, Decimal]:
    """(opening units, known in-period cost) of the lots a removal consumed."""
    opening, cost = Decimal("0"), Decimal("0")
    for lot, take in pieces:
        if lot[2]:
            opening += take
        else:
            cost += take * lot[1]
    return opening, cost


def price_opening_lot(
    scheme: ParsedScheme, txns: list[NormalizedTransaction], start: date,
    nav_series: list[tuple[date, Decimal]] | None,
) -> OpeningLot | None:
    if scheme.open_units == 0:
        return None
    lots = [[scheme.open_units, Decimal("0"), True]]
    for row in sorted(txns, key=lambda t: t.txn_date):
        apply_lot_rules(lots, row.txn_type, row.units, row.nav, _in_period_lot)
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
        pieces = apply_lot_rules(lots, row.txn_type, row.units, row.nav, _in_period_lot)
        if pieces:
            opening, known_cost = _split(pieces)
            if row.conversion_from_opening:
                amount = quantize_amount(opening * lot.nav + known_cost)
                incoming = partner[index]
                for leg in (row, incoming):
                    leg.amount = amount
                    leg.nav = quantize_nav(amount / leg.units) if leg.units else Decimal("0.0000")
                    leg.conversion_from_opening = False
