"""Actual-days/365 XIRR using bracket expansion and Decimal bisection."""

from datetime import date
from decimal import Decimal, localcontext


def independent_xirr(flows: list[tuple[date, Decimal]]) -> Decimal | None:
    if len(flows) < 2 or len({day for day, _ in flows}) < 2:
        return None

    with localcontext() as context:
        context.prec = 50
        by_date: dict[date, Decimal] = {}
        for day, amount in flows:
            by_date[day] = by_date.get(day, Decimal(0)) + amount
        if not (min(by_date.values()) < 0 < max(by_date.values())):
            return None

        origin = min(by_date)
        terms = [((day - origin).days, amount) for day, amount in sorted(by_date.items())]
        daily_exponent = -Decimal(1) / 365

        def npv(annual_growth: Decimal) -> Decimal:
            daily_discount = annual_growth ** daily_exponent
            return sum((amount * daily_discount ** days for days, amount in terms), Decimal(0))

        below = above = Decimal(1)
        below_npv = above_npv = sum(by_date.values(), Decimal(0))
        if below_npv == 0:
            return Decimal(0)

        # Expand by factors of two in both directions until adjacent values straddle zero.
        for _ in range(64):
            next_below = below / 2
            next_below_npv = npv(next_below)
            if next_below_npv == 0:
                return next_below - 1
            if (next_below_npv < 0) != (below_npv < 0):
                low, high, low_npv = next_below, below, next_below_npv
                break
            below, below_npv = next_below, next_below_npv

            next_above = above * 2
            next_above_npv = npv(next_above)
            if next_above_npv == 0:
                return next_above - 1
            if (next_above_npv < 0) != (above_npv < 0):
                low, high, low_npv = above, next_above, above_npv
                break
            above, above_npv = next_above, next_above_npv
        else:
            return None

        while high - low > Decimal("1e-30"):
            middle = (low + high) / 2
            middle_npv = npv(middle)
            if middle_npv == 0:
                return middle - 1
            if (middle_npv < 0) == (low_npv < 0):
                low, low_npv = middle, middle_npv
            else:
                high = middle
        return (low + high) / 2 - 1
