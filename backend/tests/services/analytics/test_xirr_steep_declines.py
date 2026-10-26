"""Review fix L-a: both Newton solvers returned None for steep declines (annualised below about -45%)
because the first step from the 0.1 guess overshot below -100%."""

import random
from datetime import date, timedelta
from decimal import Decimal

import pytest

from app.services.analytics.xirr import xirr
from app.services.analytics.xirr_fast import xirr_fast

_START = date(2025, 1, 1)
_END = date(2026, 1, 1)  # exactly 365 days


@pytest.mark.parametrize("terminal", ["50000", "45000", "40000", "30000", "5000"])
@pytest.mark.parametrize("solver", [xirr_fast, xirr], ids=["fast", "legacy"])
def test_solvers_find_steep_one_year_declines(solver, terminal):
    flows = [(_START, Decimal("-100000")), (_END, Decimal(terminal))]

    rate = solver(flows)

    assert rate is not None
    assert abs(rate - (Decimal(terminal) / Decimal("100000") - Decimal(1))) < Decimal("1e-7")


def _realistic_shape(rng):
    """Flows built backwards from a chosen annualised rate g, so g is the known root: an opening value, up
    to six purchases or redemptions inside the period, and the terminal value that makes NPV(g) = 0."""
    opening = Decimal(rng.randint(100_000, 5_000_000))
    start = date(2025, 9, 30)
    period_days = rng.choice([365, 390, 1095])
    rate = Decimal(rng.randint(-95, 200)) / Decimal(100)
    flows = [(start, -opening)]
    for _ in range(rng.randint(0, 6)):
        amount = Decimal(rng.randint(1_000, int(opening) // 5))
        flows.append(
            (start + timedelta(days=rng.randint(1, period_days - 1)), -amount if rng.randrange(2) else amount)
        )
    end = start + timedelta(days=period_days)
    present = sum(
        (amount / (Decimal(1) + rate) ** (Decimal((day - start).days) / Decimal(365)) for day, amount in flows),
        Decimal(0),
    )
    terminal = -present * (Decimal(1) + rate) ** (Decimal(period_days) / Decimal(365))
    if terminal <= 0:
        return None
    return rate, [*flows, (end, terminal.quantize(Decimal("0.01")))]


def _npv(flows, rate):
    first = min(day for day, _ in flows)
    return sum(
        (amount / (Decimal(1) + rate) ** (Decimal((day - first).days) / Decimal(365)) for day, amount in flows),
        Decimal(0),
    )


@pytest.mark.parametrize("solver", [xirr_fast, xirr], ids=["fast", "legacy"])
def test_solvers_find_a_root_of_realistic_shapes_including_steep_declines(solver):
    """Every shape has a root by construction. The solver must return one (never None), and nearly always
    the constructed one: a few shapes whose flows change sign several times have more than one root."""
    rng = random.Random(20261027)
    checked = steep = known = 0
    while checked < 250:
        shape = _realistic_shape(rng)
        if shape is None:
            continue
        rate, flows = shape
        checked += 1
        steep += rate < Decimal("-0.45")
        actual = solver(flows)
        assert actual is not None, (rate, flows)
        assert abs(_npv(flows, actual)) < abs(flows[0][1]) * Decimal("1e-6"), (rate, actual)
        known += abs(actual - rate) < Decimal("1e-5")
    assert steep > 20  # the fuzz really exercises the declines the 0.1 guess could not reach
    assert known >= 245


def test_solvers_still_return_none_when_no_rate_exists():
    same_day = [(_START, Decimal("-100")), (_START, Decimal("110"))]
    only_outflows = [(_START, Decimal("-100")), (_END, Decimal("-5"))]
    for solver in (xirr_fast, xirr):
        assert solver(same_day) is None
        assert solver(only_outflows) is None
