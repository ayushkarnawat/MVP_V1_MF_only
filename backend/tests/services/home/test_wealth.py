from datetime import date
from decimal import Decimal
from types import SimpleNamespace
import uuid

from sqlalchemy import event

from app.models.enums import BenchmarkIndex, BenchmarkReturnType
from app.models.reference import BenchmarkIndexHistory
from app.services.home.context import HomeInputs, ScopeContext
from app.services.home.movers import FundInput
from app.services.home.movers import Movers, MoversView
from app.services.home.series import ValueSeries, SeriesPoint
from app.services.home.wealth import assemble_wealth_series, build_wealth_series


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


def test_headline_value_replaces_only_the_last_series_point():
    value_series = ValueSeries(
        (SeriesPoint(date(2026, 10, 22), Decimal("10.005")),
         SeriesPoint(date(2026, 10, 23), Decimal("20.009"))),
        False, (),
    )
    result = assemble_wealth_series(
        period="1D", requested_start=date(2026, 10, 22), end=date(2026, 10, 23),
        clamped=False, value_series=value_series, movers=_movers(), flows=[], benchmark=None,
        headline_value=Decimal("20.02"),
    )
    assert result.points == (
        SeriesPoint(date(2026, 10, 22), Decimal("10.01")),
        SeriesPoint(date(2026, 10, 23), Decimal("20.02")),
    )
    assert result.start_value == Decimal("10.01")
    assert result.end_value == Decimal("20.02")


def test_benchmark_query_has_ten_day_lower_bound_and_clips(db_session):
    scheme_id = uuid.uuid4()
    fund = FundInput(
        scheme_id=scheme_id,
        name="Fund",
        category="Equity",
        units_timeline=[(date(2026, 9, 1), Decimal("1"))],
        navs=[(date(2026, 9, 1), Decimal("100")), (date(2026, 10, 23), Decimal("110"))],
    )
    db_session.add_all([
        BenchmarkIndexHistory(
            index_name=BenchmarkIndex.NIFTY_50, date=date(2020, 1, 1),
            return_type=BenchmarkReturnType.TRI, value=Decimal("1000"),
        ),
        BenchmarkIndexHistory(
            index_name=BenchmarkIndex.NIFTY_50, date=date(2026, 10, 1),
            return_type=BenchmarkReturnType.TRI, value=Decimal("2000"),
        ),
        BenchmarkIndexHistory(
            index_name=BenchmarkIndex.NIFTY_50, date=date(2026, 10, 23),
            return_type=BenchmarkReturnType.TRI, value=Decimal("2200"),
        ),
    ])
    db_session.commit()
    inputs = HomeInputs(
        holdings=(SimpleNamespace(current_value="110.00", nav_unavailable=False),),
        funds=(fund,), movers=_movers(), series=ValueSeries((), False, ()),
        nav_as_of=date(2026, 10, 23), partial=False, missing_funds=(),
    )
    ctx = ScopeContext("aggregate", None, (), (), None)
    statements = []
    listener = lambda _conn, _cursor, statement, parameters, _context, _many: statements.append(
        (statement, parameters)
    )
    event.listen(db_session.bind, "before_cursor_execute", listener)
    try:
        result = build_wealth_series(
            db_session, ctx, inputs, today=date(2026, 10, 23), period="1Y",
            benchmark=BenchmarkIndex.NIFTY_50,
        )
    finally:
        event.remove(db_session.bind, "before_cursor_execute", listener)
    benchmark_select = next(statement for statement, _params in statements if "benchmark_index_history" in statement)
    assert "benchmark_index_history.date >=" in benchmark_select
    assert result.benchmark is not None
    assert result.benchmark.clipped is True
    assert result.benchmark.effective_start == date(2026, 10, 1)
    assert result.benchmark.pct == Decimal("10.0000")
