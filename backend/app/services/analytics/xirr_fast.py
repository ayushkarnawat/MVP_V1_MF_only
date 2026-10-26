"""Faster Decimal Newton-Raphson XIRR for the benchmark window matrix."""

from __future__ import annotations

from datetime import date
from decimal import Decimal, DivisionByZero, InvalidOperation, Overflow, localcontext

_MAX_ITERATIONS = 100
_TOLERANCE = Decimal("0.0000001")
_DAYS_PER_YEAR = Decimal(365)

# Bisection fallback, on x = ln(1 + rate), searched over x in [-20, 14]: rates from -99.9999998% (e**-20 - 1)
# to about +1.2 million, i.e. +120 million percent a year (e**14 - 1). A root outside that range is not found.
_BISECT_LOW = Decimal("-20")
_BISECT_HIGH = Decimal("14")
_BISECT_STEP = Decimal("0.25")
_BISECT_WIDTH = Decimal("1E-12")
_BISECT_MAX_ITERATIONS = 100


def _bisect_rate(years_by_flow: list[tuple[Decimal, Decimal]]) -> Decimal | None:
    """Rate from bisection on x = ln(1 + rate); must run inside the caller's Decimal context.

    Newton from a 0.1 guess overshoots below -100% on a steep decline (a fund that lost about 45% or more
    in a year) and gives up; a bracketed search always finds a root when the discounted flows change sign
    across the range, which holds for any "money in, then less money out" shape. Several roots can exist for
    mixed shapes; the bracket nearest x = 0 (a rate of 0) wins. None when the discounted flows show no sign
    change on the grid over x in [-20, 14] (rates from -99.9999998% to about +1.2 million, i.e. +120 million
    percent a year): a root outside that range gives None, and so can a pair of roots closer together than
    one grid step (0.25 in x), whose two sign changes cancel inside one cell. Flows that net out at every
    rate (a same-day pair of -5 and +5) are zero everywhere, and the grid point nearest 0 is taken: a rate of 0."""

    def present_value(x: Decimal) -> Decimal:
        return sum((amount * (-years * x).exp() for years, amount in years_by_flow), Decimal("0"))

    # A coarse scan finds the bracket: the two ends alone can have the same sign when the last flows are
    # mixed (a purchase just before the final value), although a root sits between them. Of several
    # brackets the one nearest a rate of 0 wins, the economically plausible root.
    steps = int((_BISECT_HIGH - _BISECT_LOW) / _BISECT_STEP)
    grid = [_BISECT_LOW + _BISECT_STEP * position for position in range(steps + 1)]
    values = [present_value(x) for x in grid]
    best = None
    for position in range(steps):
        if values[position] == 0:
            candidate = (abs(grid[position]), position, position)
        elif values[position + 1] == 0 or (values[position] > 0) != (values[position + 1] > 0):
            candidate = (min(abs(grid[position]), abs(grid[position + 1])), position, position + 1)
        else:
            continue
        if best is None or candidate[0] < best[0]:
            best = candidate
    if best is None:
        return None
    _, left, right = best
    if left == right or values[right] == 0:
        return grid[right].exp() - 1
    low, high, value_low = grid[left], grid[right], values[left]
    for _ in range(_BISECT_MAX_ITERATIONS):
        middle = (low + high) / 2
        value_middle = present_value(middle)
        if value_middle == 0:
            return middle.exp() - 1
        if (value_middle > 0) == (value_low > 0):
            low, value_low = middle, value_middle
        else:
            high = middle
        if high - low < _BISECT_WIDTH:
            break
    return ((low + high) / 2).exp() - 1


def xirr_bisect(cash_flows: list[tuple[date, Decimal]]) -> Decimal | None:
    """The bisection fallback on its own, for the legacy solver (which keeps its own Newton step). Searches
    x = ln(1 + rate) in [-20, 14] only (see `_bisect_rate`): None when there is no sign change in that range
    or the arithmetic overflows."""
    if len(cash_flows) < 2:
        return None
    start_date = min(flow_date for flow_date, _ in cash_flows)
    try:
        with localcontext() as context:
            context.prec = 18
            return _bisect_rate(
                [
                    (Decimal((flow_date - start_date).days) / _DAYS_PER_YEAR, amount)
                    for flow_date, amount in cash_flows
                ]
            )
    except (Overflow, InvalidOperation, DivisionByZero):
        return None


def _newton_rate(years_by_flow: list[tuple[Decimal, Decimal]], guess: Decimal) -> Decimal | None:
    """Newton-Raphson from `guess`, inside the caller's Decimal context. None when it cannot converge;
    may raise the Decimal arithmetic errors, which the caller treats the same way."""
    rate = guess
    for _ in range(_MAX_ITERATIONS):
        base = Decimal(1) + rate
        if base <= 0:
            return None

        ln_base = base.ln()
        f_value = Decimal("0")
        f_prime = Decimal("0")
        for years, amount in years_by_flow:
            discount = (years * ln_base).exp()
            f_value += amount / discount
            if years != 0:
                f_prime += -years * amount / (discount * base)

        if f_prime == 0:
            return None
        new_rate = rate - f_value / f_prime
        if abs(new_rate - rate) < _TOLERANCE:
            return new_rate
        rate = new_rate
    return None


def xirr_fast(
    cash_flows: list[tuple[date, Decimal]],
    guess: Decimal = Decimal("0.1"),
) -> Decimal | None:
    if len(cash_flows) < 2:
        return None
    has_outflow = any(amount < 0 for _, amount in cash_flows)
    has_inflow = any(amount > 0 for _, amount in cash_flows)
    if not (has_outflow and has_inflow):
        return None

    start_date = min(flow_date for flow_date, _ in cash_flows)

    try:
        with localcontext() as context:
            # Newton stops at 1e-7, so 18 significant digits leave ample guard precision.
            context.prec = 18
            years_by_flow = [
                (
                    Decimal((flow_date - start_date).days) / _DAYS_PER_YEAR,
                    amount,
                )
                for flow_date, amount in cash_flows
            ]
            try:
                rate = _newton_rate(years_by_flow, guess)
            except (Overflow, InvalidOperation, DivisionByZero):
                rate = None  # a wild Newton step; the bracketed search below has no such steps
            if rate is not None:
                return rate
            return _bisect_rate(years_by_flow)
    except (Overflow, InvalidOperation, DivisionByZero):
        return None
