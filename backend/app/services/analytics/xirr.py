"""Pure `decimal.Decimal` Newton-Raphson XIRR — no numpy/scipy, no float,
per CLAUDE.md's Decimal-never-float rule and the Phase 4 design doc's XIRR
section. `Decimal.__pow__` supports a `Decimal` (fractional) exponent for
a positive base, so `(1 + rate) ** (days / 365)` stays exact-arithmetic
throughout — no float conversion anywhere in this module.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal

_MAX_ITERATIONS = 100
_TOLERANCE = Decimal("0.0000001")
_DAYS_PER_YEAR = Decimal(365)


def xirr(cash_flows: list[tuple[date, Decimal]], guess: Decimal = Decimal("0.1")) -> Decimal | None:
    """`cash_flows` is a list of `(date, amount)` pairs — negative for an
    outflow, positive for an inflow, order doesn't matter. Returns the
    annualized rate (e.g. `Decimal("0.12")` for 12%), or `None` if there's
    no genuine two-sided cash flow to solve for, the iteration hits a
    non-real-valued power (rate collapsed to <= -100%), or Newton-Raphson
    fails to converge within `_MAX_ITERATIONS` — a real possibility for
    pathological cash-flow shapes, treated as "can't compute," not a
    crash."""
    if len(cash_flows) < 2:
        return None
    has_outflow = any(amount < 0 for _, amount in cash_flows)
    has_inflow = any(amount > 0 for _, amount in cash_flows)
    if not (has_outflow and has_inflow):
        return None

    start_date = min(d for d, _ in cash_flows)
    years_by_flow = [(Decimal((d - start_date).days) / _DAYS_PER_YEAR, amount) for d, amount in cash_flows]
    rate = guess

    for _ in range(_MAX_ITERATIONS):
        base = Decimal(1) + rate
        if base <= 0:
            return None

        f_value = Decimal("0")
        f_prime = Decimal("0")
        for years, amount in years_by_flow:
            discount = base**years
            f_value += amount / discount
            if years != 0:
                f_prime += -years * amount / (base ** (years + Decimal(1)))

        if f_prime == 0:
            return None
        new_rate = rate - f_value / f_prime
        if abs(new_rate - rate) < _TOLERANCE:
            return new_rate
        rate = new_rate

    return None
