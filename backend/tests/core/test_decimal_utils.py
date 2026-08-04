from decimal import Decimal

from app.core.decimal_utils import quantize_amount, quantize_nav, quantize_units, to_decimal


def test_quantize_units_three_places_half_up():
    assert quantize_units(Decimal("10.12345")) == Decimal("10.123")
    assert quantize_units(Decimal("10.1235")) == Decimal("10.124")


def test_quantize_amount_two_places():
    assert quantize_amount(Decimal("5000.005")) == Decimal("5000.01")


def test_quantize_nav_four_places():
    assert quantize_nav(Decimal("500.00001")) == Decimal("500.0000")


def test_to_decimal_handles_string_and_none():
    assert to_decimal("123.45") == Decimal("123.45")
    assert to_decimal(None) is None
