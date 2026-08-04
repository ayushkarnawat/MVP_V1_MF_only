from datetime import date
from decimal import Decimal

from app.calc import NavPoint, UnitEvent, value_at_dates


def test_value_at_dates_tracks_balance_times_nav():
    events = [
        UnitEvent(date(2024, 1, 1), Decimal("100")),
        UnitEvent(date(2024, 6, 1), Decimal("50")),
        UnitEvent(date(2024, 9, 1), Decimal("-30")),
    ]
    nav_series = [
        NavPoint(date(2024, 1, 1), Decimal("10")),
        NavPoint(date(2024, 6, 1), Decimal("12")),
        NavPoint(date(2024, 9, 1), Decimal("11")),
        NavPoint(date(2024, 12, 31), Decimal("13")),
    ]
    points = value_at_dates(events, nav_series)
    assert len(points) == 4
    assert points[0].value == Decimal("1000.00")  # 100 * 10
    assert points[1].value == Decimal("1800.00")  # 150 * 12
    assert points[2].value == Decimal("1320.00")  # 120 * 11
    assert points[3].value == Decimal("1560.00")  # 120 * 13


def test_value_at_dates_empty_nav():
    assert value_at_dates([UnitEvent(date(2024, 1, 1), Decimal("10"))], []) == []
