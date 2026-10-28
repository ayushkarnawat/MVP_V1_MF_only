"""T4: `period_series` and `benchmark_for`. FX-NAV10 (10% annual NAV growth,
2021-10-23..TODAY) and FX-TRI12 (12% annual TRI growth, Nifty 500, same
range) on an Equity Flexi Cap scheme -- both closed-form, no network."""
from __future__ import annotations

import asyncio
from datetime import date, timedelta
from decimal import Decimal

import pytest

from app.models.enums import BenchmarkIndex, SchemePlanType
from app.models.reference import NavHistory
from app.services.fund_page.benchmark_select import benchmark_for
from app.services.fund_page.performance import latest_nav_date, months_back, period_series
from app.services.fund_page.schemas import Unavailable
from tests.services.fund_page.factories import (
    TODAY,
    add_nav_closed_form,
    add_scheme,
    fx_nav10,
    fx_tri12,
    make_session,
)


def _equity_scheme(db, key: str, amfi: str | None = "AMFI1"):
    return add_scheme(db, key, "Equity Scheme - Flexi Cap Fund", SchemePlanType.DIRECT, amfi)


def test_months_back_clamps_day():
    assert months_back(date(2026, 3, 31), 1) == date(2026, 2, 28)
    assert months_back(date(2024, 3, 31), 1) == date(2024, 2, 29)


def test_rebased_to_zero_at_start():
    db = make_session()
    scheme = _equity_scheme(db, "fund10")
    fx_nav10(db, scheme)

    response = asyncio.run(period_series(db, scheme, "1Y", TODAY))

    assert response.fund[0].pct == "0.0000"


def test_one_year_legend_is_cumulative():
    db = make_session()
    scheme = _equity_scheme(db, "fund10")
    fx_nav10(db, scheme)
    fx_tri12(db, BenchmarkIndex.NIFTY_500)

    response = asyncio.run(period_series(db, scheme, "1Y", TODAY))

    assert abs(Decimal(response.fund[-1].pct) - Decimal("10.0000")) < Decimal("0.001")
    assert abs(Decimal(response.benchmark[-1].pct) - Decimal("12.0000")) < Decimal("0.001")
    assert abs(Decimal(response.period_returns.fund) - Decimal("10.0000")) < Decimal("0.001")
    assert abs(Decimal(response.period_returns.benchmark) - Decimal("12.0000")) < Decimal("0.001")
    assert response.benchmark_index == "nifty_500"
    assert response.benchmark_label == "Nifty 500"
    assert response.benchmark_reason is None
    assert response.clamped is False
    assert response.since_launch is False


def test_fund_younger_than_period_clamps_and_flags():
    db = make_session()
    scheme = _equity_scheme(db, "young")
    launch = date(2026, 2, 1)  # after the 1Y period's start (2025-10-23)
    add_nav_closed_form(db, scheme, launch, TODAY, Decimal("0.10"))

    response = asyncio.run(period_series(db, scheme, "1Y", TODAY))

    assert response.clamped is True
    assert response.since_launch is True
    assert response.start == launch


def test_missing_tri_returns_fund_only():
    db = make_session()
    scheme = _equity_scheme(db, "fund10")
    fx_nav10(db, scheme)

    response = asyncio.run(period_series(db, scheme, "1Y", TODAY))

    assert response.fund
    assert response.benchmark is None
    assert response.benchmark_reason == "no_history"
    assert response.period_returns.benchmark is None
    assert response.benchmark_index == "nifty_500"


@pytest.mark.parametrize(
    "key, category",
    [
        ("debt", "Debt Scheme - Liquid Fund"),
        ("hybrid", "Hybrid Scheme - Aggressive Hybrid Fund"),
        ("index", "Other Scheme - Index Funds"),
    ],
)
def test_non_equity_has_no_benchmark(key, category):
    db = make_session()
    scheme = add_scheme(db, key, category, SchemePlanType.DIRECT, f"AMFI{key.upper()}")
    add_nav_closed_form(db, scheme, date(2021, 10, 23), TODAY, Decimal("0.07"))

    response = asyncio.run(period_series(db, scheme, "1Y", TODAY))

    assert response.benchmark_index is None
    assert response.benchmark_label is None
    assert response.benchmark is None
    assert response.benchmark_reason == "no_benchmark"
    assert response.period_returns.benchmark is None
    assert benchmark_for(scheme) is None


def test_no_nav_rows_returns_no_history():
    db = make_session()
    scheme = _equity_scheme(db, "empty")

    response = asyncio.run(period_series(db, scheme, "1Y", TODAY))

    assert isinstance(response, Unavailable)
    assert response.reason == "no_history"
    assert latest_nav_date(db, scheme) is None


def test_future_nav_rows_are_not_used_as_the_period_end():
    db = make_session()
    scheme = _equity_scheme(db, "future")
    add_nav_closed_form(db, scheme, date(2025, 10, 23), TODAY, Decimal("0.10"))
    db.add(
        NavHistory(
            scheme_id=scheme.id,
            date=TODAY + timedelta(days=1),
            nav=Decimal("999.0000"),
        )
    )
    db.flush()

    response = asyncio.run(period_series(db, scheme, "1Y", TODAY))

    assert response.end == TODAY


def test_cas_only_without_amfi_returns_no_history():
    db = make_session()
    scheme = _equity_scheme(db, "casonly", amfi=None)
    db.add(NavHistory(scheme_id=scheme.id, date=TODAY, nav=Decimal("11.0000")))
    db.flush()

    response = asyncio.run(period_series(db, scheme, "1Y", TODAY))

    assert isinstance(response, Unavailable)
    assert response.reason == "no_history"


def test_downsample_keeps_first_and_last_and_caps_points():
    db = make_session()
    scheme = _equity_scheme(db, "long")
    add_nav_closed_form(db, scheme, TODAY.replace(year=TODAY.year - 5), TODAY, Decimal("0.08"))

    response = asyncio.run(period_series(db, scheme, "5Y", TODAY))

    assert len(response.fund) <= 260
    assert response.fund[0].date == response.start
    assert response.fund[-1].date == TODAY


def test_flat_days_are_not_dropped_as_gaps():
    # 3M window stays under MAX_POINTS (no thinning), so this isolates
    # whether unchanging NAV values are mistaken for gaps and dropped.
    db = make_session()
    scheme = _equity_scheme(db, "flat")
    start = date(2026, 7, 23)
    day = start
    while day <= TODAY:
        db.add(NavHistory(scheme_id=scheme.id, date=day, nav=Decimal("10.0000")))
        day += timedelta(days=1)
    db.flush()

    response = asyncio.run(period_series(db, scheme, "3M", TODAY))

    assert len(response.fund) == (TODAY - start).days + 1
    assert all(point.pct == "0.0000" for point in response.fund)


def test_zero_nav_rows_do_not_divide_by_zero():
    db = make_session()
    scheme = _equity_scheme(db, "zero-nav")
    db.add_all([
        NavHistory(scheme_id=scheme.id, date=TODAY - timedelta(days=10), nav=Decimal("0")),
        NavHistory(scheme_id=scheme.id, date=TODAY - timedelta(days=5), nav=Decimal("10")),
        NavHistory(scheme_id=scheme.id, date=TODAY, nav=Decimal("11")),
    ])
    db.flush()

    response = asyncio.run(period_series(db, scheme, "All", TODAY))

    assert not isinstance(response, Unavailable)
    assert response.fund[0].pct == "0.0000"
    assert response.fund[-1].pct == "10.0000"

    only_zero = _equity_scheme(db, "only-zero", amfi="AMFI2")
    db.add(NavHistory(scheme_id=only_zero.id, date=TODAY, nav=Decimal("0")))
    db.flush()
    response = asyncio.run(period_series(db, only_zero, "All", TODAY))
    assert isinstance(response, Unavailable)
