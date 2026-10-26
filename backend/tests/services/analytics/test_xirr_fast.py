import inspect
import random
import time
from datetime import date, timedelta
from decimal import Decimal

import pytest

from app.services.analytics.xirr import xirr
from app.services.analytics.xirr_fast import xirr_fast


def _random_cash_flows() -> list[list[tuple[date, Decimal]]]:
    rng = random.Random(20261026)
    origin = date(2014, 1, 1)
    cases = []
    for _ in range(500):
        count = rng.randint(2, 80)
        span_days = rng.randint(365, 12 * 365)
        dates = [
            origin,
            *[
                origin + timedelta(days=rng.randint(0, span_days))
                for _ in range(count - 2)
            ],
            origin + timedelta(days=span_days),
        ]
        if count > 2 and rng.randrange(4) == 0:
            dates[rng.randrange(1, count)] = dates[0]
        first_outflow = Decimal(rng.randint(60_000_000, 70_000_000)) / Decimal(100)
        intermediate = [
            Decimal(rng.randint(10_000, 250_000)) / Decimal(100)
            for _ in range(count - 2)
        ]
        signed_intermediate = [
            amount if rng.randrange(2) else -amount
            for amount in intermediate
        ]
        net_outflow = first_outflow - sum(signed_intermediate, Decimal(0))
        growth_basis_points = Decimal(rng.randint(105, 120)) / Decimal(100)
        terminal_inflow = (net_outflow * growth_basis_points).quantize(Decimal("0.01"))
        signed = [-first_outflow, *signed_intermediate, terminal_inflow]
        cases.append(list(zip(dates, signed)))
    return cases


def _assert_equivalent(cash_flows: list[tuple[date, Decimal]]) -> None:
    legacy = xirr(cash_flows)
    fast = xirr_fast(cash_flows)

    assert (fast is None) is (legacy is None)
    if legacy is not None:
        assert fast is not None
        assert abs(fast - legacy) < Decimal("1e-8")


def test_xirr_fast_matches_legacy_for_500_deterministic_cash_flow_sets():
    for cash_flows in _random_cash_flows():
        _assert_equivalent(cash_flows)


@pytest.mark.parametrize(
    "cash_flows",
    [
        [(date(2026, 1, 1), Decimal("-100"))],
        [
            (date(2025, 1, 1), Decimal("-100")),
            (date(2026, 1, 1), Decimal("-50")),
        ],
        [
            (date(2025, 1, 1), Decimal("100")),
            (date(2026, 1, 1), Decimal("50")),
        ],
        [
            (date(2026, 1, 1), Decimal("-100")),
            (date(2026, 1, 1), Decimal("110")),
        ],
        [
            (date(2023, 1, 1), Decimal("-100000")),
            (date(2026, 1, 1), Decimal("0.01")),
        ],
        [
            (date(2025, 1, 1), Decimal("-100")),
            (date(2026, 1, 1), Decimal("10000")),
        ],
    ],
)
def test_xirr_fast_matches_legacy_for_degenerate_and_extreme_cases(cash_flows):
    _assert_equivalent(cash_flows)


@pytest.mark.parametrize(
    ("cash_flows", "expected"),
    [
        (
            [
                (date(2025, 1, 1), Decimal("-100")),
                (date(2026, 1, 1), Decimal("110")),
            ],
            Decimal("0.1"),
        ),
        (
            [
                (date(2024, 1, 1), Decimal("-100")),
                (date(2025, 12, 31), Decimal("121")),
            ],
            Decimal("0.1"),
        ),
    ],
)
def test_xirr_fast_solves_hand_checked_annual_returns(cash_flows, expected):
    actual = xirr_fast(cash_flows)

    assert actual is not None
    assert abs(actual - expected) < Decimal("1e-12")


def test_xirr_fast_is_at_least_twice_as_fast_as_legacy_for_600_flows():
    start = date(2017, 1, 1)
    cash_flows = [
        (start + timedelta(days=position * 5), Decimal("-1000"))
        for position in range(599)
    ]
    cash_flows.append((start + timedelta(days=9 * 365), Decimal("1000000")))

    def minimum_time(solver) -> Decimal:
        timings = []
        for _ in range(3):
            before = time.perf_counter_ns()
            result = solver(cash_flows)
            timings.append(time.perf_counter_ns() - before)
            assert result is not None
        return Decimal(min(timings))

    assert minimum_time(xirr_fast) * Decimal(2) <= minimum_time(xirr)


def test_xirr_fast_returns_only_decimal_or_none_and_never_calls_float():
    result = xirr_fast(
        [
            (date(2025, 1, 1), Decimal("-100")),
            (date(2026, 1, 1), Decimal("110")),
        ]
    )

    assert result is None or isinstance(result, Decimal)
    assert "float(" not in inspect.getsource(inspect.getmodule(xirr_fast))
