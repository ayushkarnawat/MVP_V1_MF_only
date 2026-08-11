from datetime import date
from decimal import Decimal

from app.services.analytics.xirr import xirr


def test_xirr_single_year_ten_percent_growth():
    # 2023 is not a leap year: 2023-01-01 -> 2024-01-01 is exactly 365 days.
    cash_flows = [(date(2023, 1, 1), Decimal("-1000")), (date(2024, 1, 1), Decimal("1100"))]
    rate = xirr(cash_flows)
    assert rate is not None
    assert abs(rate - Decimal("0.10")) < Decimal("0.0001")


def test_xirr_two_years_compounded_ten_percent():
    # 2021 and 2022 are both non-leap: 2021-01-01 -> 2023-01-01 is exactly 730 days.
    cash_flows = [(date(2021, 1, 1), Decimal("-1000")), (date(2023, 1, 1), Decimal("1210"))]
    rate = xirr(cash_flows)
    assert rate is not None
    assert abs(rate - Decimal("0.10")) < Decimal("0.0001")


def test_xirr_negative_return():
    cash_flows = [(date(2023, 1, 1), Decimal("-1000")), (date(2024, 1, 1), Decimal("900"))]
    rate = xirr(cash_flows)
    assert rate is not None
    assert abs(rate - Decimal("-0.10")) < Decimal("0.0001")


def test_xirr_multiple_cash_flows_converges_to_reasonable_rate():
    cash_flows = [
        (date(2023, 1, 1), Decimal("-1000")),
        (date(2023, 4, 1), Decimal("-1000")),
        (date(2023, 7, 1), Decimal("-1000")),
        (date(2024, 1, 1), Decimal("3200")),
    ]
    rate = xirr(cash_flows)
    assert rate is not None
    assert Decimal("0") < rate < Decimal("1")


def test_xirr_returns_none_for_single_cash_flow():
    assert xirr([(date(2023, 1, 1), Decimal("-1000"))]) is None


def test_xirr_returns_none_when_all_cash_flows_are_outflows():
    cash_flows = [(date(2023, 1, 1), Decimal("-1000")), (date(2024, 1, 1), Decimal("-500"))]
    assert xirr(cash_flows) is None


def test_xirr_returns_none_when_all_cash_flows_are_inflows():
    cash_flows = [(date(2023, 1, 1), Decimal("1000")), (date(2024, 1, 1), Decimal("500"))]
    assert xirr(cash_flows) is None


def test_xirr_returns_none_for_empty_list():
    assert xirr([]) is None
