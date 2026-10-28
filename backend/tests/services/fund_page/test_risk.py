from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal

import pytest

from app.config import settings
from app.models.enums import BenchmarkIndex, BenchmarkReturnType, SchemePlanType
from app.models.reference import BenchmarkIndexHistory
from app.services.fund_page.risk import compute_risk
from app.services.fund_page.schemas import Unavailable
from tests.services.fund_page.factories import (
    TODAY,
    add_nav_factors,
    add_scheme,
    make_session,
)


def _scheme(db, key: str, category: str = "Equity Scheme - Flexi Cap Fund"):
    return add_scheme(db, key, category, SchemePlanType.DIRECT, f"AMFI{key.upper()}")


def _alternating(count: int) -> list[Decimal]:
    return [Decimal("1.01") if index % 2 == 0 else Decimal("0.99") for index in range(count)]


def _add_tri_factors(
    db,
    start: date,
    factors: list[Decimal],
    *,
    index: BenchmarkIndex = BenchmarkIndex.NIFTY_500,
    base: Decimal = Decimal("10000"),
):
    value = base
    db.add(
        BenchmarkIndexHistory(
            index_name=index,
            date=start,
            return_type=BenchmarkReturnType.TRI,
            value=value,
        )
    )
    for offset, factor in enumerate(factors, start=1):
        value = (value * factor).quantize(Decimal("0.01"))
        db.add(
            BenchmarkIndexHistory(
                index_name=index,
                date=start + timedelta(days=offset),
                return_type=BenchmarkReturnType.TRI,
                value=value,
            )
        )
    db.flush()


def test_volatility_flat_series_is_zero_and_sharpe_is_none():
    db = make_session()
    scheme = _scheme(db, "risk-flat")
    add_nav_factors(db, scheme, TODAY - timedelta(days=500), [Decimal("1")] * 500)

    response = compute_risk(db, scheme, TODAY)

    assert response.volatility.value == "0.0000"
    assert response.max_drawdown.value == "0.0000"
    assert response.sharpe.value is None


def test_max_drawdown_single_crash():
    db = make_session()
    scheme = _scheme(db, "risk-crash")
    factors = [Decimal("1")] * 400
    factors[300] = Decimal("0.70")
    add_nav_factors(db, scheme, TODAY - timedelta(days=400), factors)

    response = compute_risk(db, scheme, TODAY)

    assert response.max_drawdown.value == "-30.0000"
    assert response.max_drawdown.band == "Moderate"


def test_volatility_alternating_one_percent():
    db = make_session()
    scheme = _scheme(db, "risk-volatility")
    add_nav_factors(db, scheme, TODAY - timedelta(days=1000), _alternating(1000))

    response = compute_risk(db, scheme, TODAY)

    assert abs(Decimal(response.volatility.value) - Decimal("15.88")) < Decimal("0.01")
    assert response.volatility.band == "Moderate"


def test_sharpe_uses_cagr_and_rate_from_settings(monkeypatch):
    db = make_session()
    scheme = _scheme(db, "risk-sharpe")
    factors = [Decimal("1.0015"), Decimal("0.9995")] * 250
    add_nav_factors(db, scheme, TODAY - timedelta(days=500), factors)

    monkeypatch.setattr(settings, "risk_free_rate", Decimal("0"))
    zero_rate = compute_risk(db, scheme, TODAY)
    monkeypatch.setattr(settings, "risk_free_rate", Decimal("0.05"))
    five_rate = compute_risk(db, scheme, TODAY)

    volatility_fraction = Decimal(zero_rate.volatility.value) / Decimal("100")
    expected_difference = Decimal("0.05") / volatility_fraction
    actual_difference = Decimal(zero_rate.sharpe.value) - Decimal(five_rate.sharpe.value)
    assert abs(actual_difference - expected_difference) < Decimal("0.001")
    assert five_rate.risk_free_rate == "0.05"


def test_beta_perfectly_correlated_is_one():
    db = make_session()
    scheme = _scheme(db, "risk-beta-one")
    factors = _alternating(1000)
    start = TODAY - timedelta(days=1000)
    add_nav_factors(db, scheme, start, factors)
    _add_tri_factors(db, start, factors)

    response = compute_risk(db, scheme, TODAY)

    assert abs(Decimal(response.beta.value) - Decimal("1")) < Decimal("0.001")


def test_beta_inverse_is_minus_one():
    db = make_session()
    scheme = _scheme(db, "risk-beta-minus")
    factors = _alternating(1000)
    inverse = [Decimal("0.99") if factor == Decimal("1.01") else Decimal("1.01") for factor in factors]
    start = TODAY - timedelta(days=1000)
    add_nav_factors(db, scheme, start, factors)
    _add_tri_factors(db, start, inverse)

    response = compute_risk(db, scheme, TODAY)

    assert abs(Decimal(response.beta.value) - Decimal("-1")) < Decimal("0.001")


@pytest.mark.parametrize("shared_dates, expect_value", [(119, False), (120, True)])
def test_beta_none_below_120_shared_dates(shared_dates, expect_value):
    db = make_session()
    scheme = _scheme(db, f"risk-beta-boundary-{shared_dates}")
    factors = _alternating(500)
    start = TODAY - timedelta(days=500)
    add_nav_factors(db, scheme, start, factors)
    benchmark_start = TODAY - timedelta(days=shared_dates - 1)
    benchmark_factors = _alternating(shared_dates - 1)
    _add_tri_factors(db, benchmark_start, benchmark_factors)

    response = compute_risk(db, scheme, TODAY)

    if expect_value:
        assert response.beta.value is not None
        assert response.beta_reason is None
    else:
        assert response.beta.value is None
        assert response.beta_reason == "insufficient_shared_dates"


def test_no_beta_for_non_equity():
    db = make_session()
    scheme = _scheme(db, "risk-debt", "Debt Scheme - Liquid Fund")
    add_nav_factors(db, scheme, TODAY - timedelta(days=500), _alternating(500))

    response = compute_risk(db, scheme, TODAY)

    assert response.beta.value is None
    assert response.beta_reason == "no_benchmark"
    assert response.volatility.value is not None
    assert response.volatility.band is None


def test_under_one_year_no_history():
    db = make_session()
    scheme = _scheme(db, "risk-too-young")
    add_nav_factors(db, scheme, TODAY - timedelta(days=364), [Decimal("1")] * 364)

    response = compute_risk(db, scheme, TODAY)

    assert isinstance(response, Unavailable)
    assert response.reason == "no_history"


def test_one_to_three_years_prints_life_window():
    db = make_session()
    scheme = _scheme(db, "risk-life")
    start = TODAY - timedelta(days=500)
    add_nav_factors(db, scheme, start, _alternating(500))

    response = compute_risk(db, scheme, TODAY)

    assert response.life_window is True
    assert response.window_start == start
    assert response.window_end == TODAY


def test_other_classes_get_band_none_but_value_present():
    db = make_session()
    scheme = _scheme(db, "risk-hybrid", "Hybrid Scheme - Aggressive Hybrid Fund")
    add_nav_factors(db, scheme, TODAY - timedelta(days=500), _alternating(500))

    response = compute_risk(db, scheme, TODAY)

    assert response.volatility.value is not None
    assert response.volatility.band is None
    assert response.max_drawdown.value is not None
    assert response.max_drawdown.band is None
    assert response.sharpe.value is not None
    assert response.sharpe.band is None


def test_decimal_values_are_strings():
    db = make_session()
    scheme = _scheme(db, "risk-decimal")
    add_nav_factors(db, scheme, TODAY - timedelta(days=500), _alternating(500))

    response = compute_risk(db, scheme, TODAY)

    assert isinstance(response.risk_free_rate, str)
    assert isinstance(response.volatility.value, str)
    assert isinstance(response.max_drawdown.value, str)
    assert isinstance(response.sharpe.value, str)
