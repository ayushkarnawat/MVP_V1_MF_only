"""Decimal quantization helpers — units 3dp, amounts 2dp, NAV 4dp."""
from decimal import ROUND_HALF_UP, Decimal

UNITS_PLACES = Decimal("0.001")
AMOUNT_PLACES = Decimal("0.01")
NAV_PLACES = Decimal("0.0001")


def quantize_units(value: Decimal) -> Decimal:
    return value.quantize(UNITS_PLACES, rounding=ROUND_HALF_UP)


def quantize_amount(value: Decimal) -> Decimal:
    return value.quantize(AMOUNT_PLACES, rounding=ROUND_HALF_UP)


def quantize_nav(value: Decimal) -> Decimal:
    return value.quantize(NAV_PLACES, rounding=ROUND_HALF_UP)


def to_decimal(value: str | Decimal | int | None) -> Decimal | None:
    if value is None:
        return None
    if isinstance(value, Decimal):
        return value
    return Decimal(str(value))
