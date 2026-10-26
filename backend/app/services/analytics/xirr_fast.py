"""Faster Decimal Newton-Raphson XIRR for the benchmark window matrix."""

from __future__ import annotations

from datetime import date
from decimal import Decimal, DivisionByZero, InvalidOperation, Overflow, localcontext

_MAX_ITERATIONS = 100
_TOLERANCE = Decimal("0.0000001")
_DAYS_PER_YEAR = Decimal(365)


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
    rate = guess

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
    except (Overflow, InvalidOperation, DivisionByZero):
        return None

    return None
