"""Hybrid CAS opening cost; artifact #1, 'Decided: the hybrid cost method'."""
from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from app.core.decimal_utils import quantize_amount, quantize_nav
from app.models.enums import CostSource
from app.services.import_.parser import NormalizedTransaction, ParsedScheme

from app.services.lot_rules import apply_lot_rules, cost_per_unit


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
        apply_lot_rules(lots, row.txn_type, row.units, cost_per_unit(row.units, row.nav, row.amount, row.stamp_duty), _in_period_lot)
    remaining = sum((u for u, n, opening in lots if opening), Decimal("0"))
    held_cost = sum((u * n for u, n, opening in lots if not opening), Decimal("0"))
    held_total = remaining + sum((u for u, n, opening in lots if not opening), Decimal("0"))
    untouched = remaining == scheme.open_units
    # A non-positive reading is never a real NAV (one confirmed mfapi.in
    # defect: 3 Axis schemes share a corrupt nav=0 row) -- drop it before it
    # can become a false floor/ceiling.
    series = sorted((d, n) for d, n in (nav_series or []) if n > 0)
    before = [n for d, n in series if d < start]

    def plausible(value):
        return value is not None and value > 0 and (not before or min(before) <= value <= max(before))

    def ok(value):
        return value is not None and value > 0

    def loosened(value):
        # ponytail: 3x is a round number, not a derived one -- revisit once a
        # real case exercises this branch. Loosened on BOTH sides: a too-low
        # result is exactly the corruption (in-period sale eating the wrong
        # lot) the guard exists to catch, so the floor can't simply be
        # dropped here.
        return ok(value) and (not before or min(before) / 3 <= value <= max(before) * 3)

    fifo_cost = ((scheme.valuation_cost - held_cost) / remaining
                 if remaining > 0 and scheme.valuation_cost is not None else None)

    if untouched:
        # Nothing was sold from the opening lot: average-cost and
        # FIFO-subtraction are the same number here (no units were removed to
        # tell the two conventions apart), so there is no ambiguity to
        # guard against -- a failed band check can only mean the NAV history
        # doesn't reach back far enough (pre-2006 funds) or doesn't exist yet
        # (a brand-new NFO), never a real cost problem. Trust it outright.
        cost, source = (fifo_cost, CostSource.CAS_COST) if ok(fifo_cost) else (None, CostSource.NAV_ON_START)
    else:
        # Some of the opening lot WAS sold in-period, so the two conventions
        # can disagree. CAMS/KFin's printed "Total Cost Value" is average
        # cost per unit times closing units (confirmed externally -- it is
        # not a FIFO-remaining-lot figure; FIFO only governs the separate,
        # optional Capital Gains Statement, not the plain CAS). Average cost
        # is therefore the primary, well-justified reading here; the
        # FIFO-subtraction figure (which lot-matching law does mandate, for
        # *which units* remain -- just not for how their cost is displayed)
        # is kept only as a secondary cross-check, in case of a parsing
        # anomaly or an edition that doesn't follow this convention.
        avg_cost = scheme.valuation_cost / held_total if held_total > 0 and scheme.valuation_cost is not None else None
        if plausible(avg_cost):
            cost, source = avg_cost, CostSource.CAS_COST
        elif plausible(fifo_cost):
            cost, source = fifo_cost, CostSource.CAS_COST
        elif loosened(avg_cost):
            cost, source = avg_cost, CostSource.CAS_COST
        elif loosened(fifo_cost):
            cost, source = fifo_cost, CostSource.CAS_COST
        else:
            cost, source = None, CostSource.NAV_ON_START

    if source == CostSource.NAV_ON_START:
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
        pieces = apply_lot_rules(lots, row.txn_type, row.units, cost_per_unit(row.units, row.nav, row.amount, row.stamp_duty), _in_period_lot)
        if pieces:
            opening, known_cost = _split(pieces)
            if row.conversion_from_opening:
                amount = quantize_amount(opening * lot.nav + known_cost)
                incoming = partner[index]
                for leg in (row, incoming):
                    leg.amount = amount
                    leg.nav = quantize_nav(amount / leg.units) if leg.units else Decimal("0.0000")
                    leg.nav_printed = False
                    leg.conversion_from_opening = False
