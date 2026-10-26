from datetime import date
from decimal import Decimal

from app.services.home.movers import Movers, MoversView
from app.services.home.series import ValueSeries, SeriesPoint
from app.services.home.wealth import assemble_wealth_series


def _movers(*, change="5.00", pct="0.5000", previous=date(2026, 10, 22)):
    return Movers(
        requested_view="fund", view="fund", fell_back=False, estimated=False,
        coverage_pct=None, net_change=Decimal(change), previous_value=Decimal("1000"),
        net_pct=Decimal(pct), as_of_nav_date=date(2026, 10, 23),
        previous_nav_date=previous, partial=False, stale_scheme_ids=(),
        missing_scheme_ids=(), funds=(), result=MoversView((), (), 0, Decimal("0.00")),
    )


def test_one_day_uses_movers_identity_and_single_calendar_span():
    value_series = ValueSeries(
        (SeriesPoint(date(2026, 10, 22), Decimal("1000")),
         SeriesPoint(date(2026, 10, 23), Decimal("1005"))),
        False, (),
    )
    result = assemble_wealth_series(
        period="1D", requested_start=date(2026, 10, 22), end=date(2026, 10, 23),
        clamped=False, value_series=value_series, movers=_movers(), flows=[], benchmark=None,
    )
    assert result.change_method == "price_only"
    assert result.change_amount == Decimal("5.00")
    assert result.change_pct == Decimal("0.5000")
    assert result.start_value == Decimal("1000.00")
    assert result.end_value == Decimal("1005.00")


def test_first_transaction_day_is_flow_not_gain():
    value_series = ValueSeries(
        (SeriesPoint(date(2026, 10, 10), Decimal("1000")),
         SeriesPoint(date(2026, 10, 11), Decimal("1010"))),
        False, (),
    )
    result = assemble_wealth_series(
        period="1M", requested_start=date(2026, 10, 1), end=date(2026, 10, 11),
        clamped=False, value_series=value_series, movers=_movers(),
        flows=[(date(2026, 10, 10), Decimal("1000"))], benchmark=None,
    )
    assert result.start_effective == date(2026, 10, 9)
    assert result.start_value == Decimal("0.00")
    assert result.net_contributions == Decimal("1000.00")
    assert result.change_amount == Decimal("10.00")


def test_empty_series_has_zero_money_and_no_gain():
    result = assemble_wealth_series(
        period="custom", requested_start=date(2016, 1, 1), end=date(2016, 12, 31),
        clamped=False, value_series=ValueSeries((), False, ()), movers=_movers(),
        flows=[], benchmark=None,
    )
    assert result.empty is True
    assert result.points == ()
    assert result.change_amount == Decimal("0.00")
    assert result.change_pct is None
