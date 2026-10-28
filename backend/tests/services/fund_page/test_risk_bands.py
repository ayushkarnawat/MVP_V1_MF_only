from __future__ import annotations

from decimal import Decimal

import pytest

from app.services.fund_page.risk_bands import band_for


@pytest.mark.parametrize(
    "metric, value, expected",
    [
        ("volatility", "11.999", ("Low", "pos")),
        ("volatility", "12", ("Moderate", "warn")),
        ("volatility", "18", ("Moderate", "warn")),
        ("volatility", "18.001", ("High", "neg")),
        ("max_drawdown", "-14.999", ("Low", "pos")),
        ("max_drawdown", "-15", ("Moderate", "warn")),
        ("max_drawdown", "-30", ("Moderate", "warn")),
        ("max_drawdown", "-30.001", ("High", "neg")),
        ("sharpe", "0.499", ("Weak", "neg")),
        ("sharpe", "0.5", ("Fair", "warn")),
        ("sharpe", "1.0", ("Fair", "warn")),
        ("sharpe", "1.001", ("Good", "pos")),
        ("beta", "0.95", ("Lower risk", "pos")),
        ("beta", "0.951", ("Market-like", "neu")),
        ("beta", "1.05", ("Market-like", "neu")),
        ("beta", "1.051", ("Higher risk", "warn")),
    ],
)
def test_band_edges(metric, value, expected):
    assert band_for(metric, Decimal(value), "Equity") == expected


@pytest.mark.parametrize("fund_class", ["Debt", "Hybrid", "Other"])
def test_other_classes_have_no_bands(fund_class):
    assert band_for("volatility", Decimal("14"), fund_class) is None
    assert band_for("max_drawdown", Decimal("-20"), fund_class) is None
    assert band_for("sharpe", Decimal("0.8"), fund_class) is None
    assert band_for("beta", Decimal("1"), fund_class) is None
