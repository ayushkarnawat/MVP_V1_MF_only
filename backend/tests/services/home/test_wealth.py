from datetime import date
from decimal import Decimal
import json
from pathlib import Path
from types import SimpleNamespace
import uuid

import pytest
from sqlalchemy import event
from sqlalchemy.orm import Session

from app.models.enums import BenchmarkIndex, BenchmarkReturnType
from app.models.reference import BenchmarkIndexHistory, NavHistory
from app.services.home.context import HomeInputs, ScopeContext
from app.services.home.movers import FundInput
from app.services.home.movers import Movers, MoversView
from app.services.home.series import ValueSeries, SeriesPoint
from app.services.home.wealth import assemble_wealth_series, build_wealth_series
from tests.api.home_fixture import FIXED_NOW, build_home_fixture, uid


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


def test_requested_benchmarks_keep_their_dates_and_values_in_the_service(db_session):
    start = date(2026, 10, 22)
    end = date(2026, 10, 24)
    db_session.add_all([
        BenchmarkIndexHistory(
            index_name=index, date=day, return_type=BenchmarkReturnType.TRI, value=Decimal(level),
        )
        for index, day, level in (
            (BenchmarkIndex.NIFTY_50, start, "120"),
            (BenchmarkIndex.NIFTY_50, end, "121"),
            (BenchmarkIndex.NIFTY_500, date(2026, 10, 23), "200"),
            (BenchmarkIndex.NIFTY_500, end, "220"),
        )
    ])
    db_session.flush()
    fund = FundInput(
        scheme_id=uuid.uuid4(), name="Fund", category="Equity",
        units_timeline=[(start, Decimal("1"))], navs=[(start, Decimal("100"))],
    )
    inputs = HomeInputs(
        holdings=(), funds=(fund,), movers=_movers(), series=ValueSeries((), False, ()),
        nav_as_of=end, partial=False, missing_funds=(),
    )

    result = build_wealth_series(
        db_session, ScopeContext("aggregate", None, (), (), None), inputs,
        today=end, period="custom", custom=(start, end), benchmark=BenchmarkIndex.NIFTY_50,
        benchmarks=(BenchmarkIndex.NIFTY_50, BenchmarkIndex.NIFTY_500, BenchmarkIndex.NIFTY_MIDCAP_150),
    )

    full, clipped, missing = result.benchmark_series
    assert full == result.benchmark
    assert full.points == (
        (start, Decimal("0.0000")),
        (date(2026, 10, 23), Decimal("0.0000")),
        (end, Decimal("0.8333")),
    )
    assert clipped.clipped and clipped.effective_start == date(2026, 10, 23)
    assert clipped.points == ((date(2026, 10, 23), Decimal("0.0000")), (end, Decimal("10.0000")))
    assert not missing.available and missing.points == ()


WEALTH_PATH = "/household/aggregate/home/wealth-series"


@pytest.fixture
def wealth_home():
    runtime = build_home_fixture()
    try:
        yield runtime
    finally:
        runtime.close()


def test_old_single_benchmark_reply_unchanged(wealth_home):
    fixture = Path(__file__).resolve().parents[2] / "fixtures/home/wealth_1m_family_benchmark.json"
    response = wealth_home.client.get(f"{WEALTH_PATH}?period=1M&benchmark=nifty_50")

    assert response.status_code == 200
    assert response.json() == json.loads(fixture.read_text(encoding="utf-8"))


NEXT_PRICE_DAY = FIXED_NOW.replace(day=26)


@pytest.fixture
def wealth_home_next_price_day():
    runtime = build_home_fixture(now=NEXT_PRICE_DAY)
    try:
        yield runtime
    finally:
        runtime.close()


def _add_next_day_navs(runtime, prices: dict[str, str]) -> None:
    with Session(runtime.engine) as db:
        db.add_all(
            NavHistory(scheme_id=uid(f"scheme-{fund}"), date=NEXT_PRICE_DAY.date(), nav=Decimal(price))
            for fund, price in prices.items()
        )
        db.commit()


def test_series_stops_at_latest_date_with_complete_enough_prices_and_says_so(wealth_home_next_price_day):
    runtime = wealth_home_next_price_day
    # The smallest holding (flexi) is waiting for Monday's price. The rest cover over half the value.
    _add_next_day_navs(runtime, {"large": "12.11", "debt": "10.02", "gold": "101.10"})

    response = runtime.client.get(f"{WEALTH_PATH}?period=1D")
    summary_response = runtime.client.get("/household/aggregate/home/summary")

    assert response.status_code == summary_response.status_code == 200
    wealth = response.json()
    assert wealth["end"] == wealth["nav_as_of"] == "2026-10-26"
    assert wealth["partial"] is True
    assert [fund["scheme_id"] for fund in wealth["missing_funds"]] == [str(uid("scheme-flexi"))]
    assert wealth["points"][-2]["value"] == "5212.00"
    assert wealth["points"][-1] == {"date": "2026-10-26", "value": "5216.00"}
    assert wealth["end_value"] == summary_response.json()["total_value"] == "5216.00"


def test_series_with_every_fund_priced_is_unchanged(wealth_home_next_price_day):
    runtime = wealth_home_next_price_day
    _add_next_day_navs(runtime, {"large": "12.11", "flexi": "19.82", "debt": "10.02", "gold": "101.10"})

    response = runtime.client.get(f"{WEALTH_PATH}?period=1D")

    assert response.status_code == 200
    wealth = response.json()
    assert wealth["end"] == wealth["nav_as_of"] == "2026-10-26"
    assert wealth["partial"] is False
    assert wealth["points"][-1] == {"date": "2026-10-26", "value": "5217.00"}
    assert wealth["end_value"] == "5217.00"


def test_majority_missing_does_not_end_on_the_partial_day(wealth_home_next_price_day):
    runtime = wealth_home_next_price_day
    # Monday's only price would pull the series down if mixed with Friday's prices.
    _add_next_day_navs(runtime, {"flexi": "19.00"})

    response = runtime.client.get(f"{WEALTH_PATH}?period=1D")

    assert response.status_code == 200
    wealth = response.json()
    assert wealth["end"] == wealth["nav_as_of"] == "2026-10-23"
    assert wealth["points"][-1] == {"date": "2026-10-23", "value": "5212.00"}
    assert wealth["end_value"] == "5212.00"


def test_three_benchmarks_return_three_series(wealth_home):
    with Session(wealth_home.engine) as db:
        db.add_all([
            BenchmarkIndexHistory(
                index_name=BenchmarkIndex.NIFTY_500, date=day,
                return_type=BenchmarkReturnType.TRI, value=level,
            )
            for day, level in (
                (date(2026, 10, 22), Decimal("120")),
                (date(2026, 10, 23), Decimal("121")),
            )
        ])
        db.commit()
    response = wealth_home.client.get(
        f"{WEALTH_PATH}?period=1D&benchmark=nifty_midcap_150"
        "&benchmarks=nifty_500&benchmarks=nifty_50&benchmarks=nifty_smallcap_250"
    )

    assert response.status_code == 200
    body = response.json()
    assert body["benchmark"]["index"] == "nifty_midcap_150"
    series = body.get("benchmark_series", [])
    assert [item["benchmark"] for item in series] == ["nifty_500", "nifty_50", "nifty_smallcap_250"]
    assert all(item["available"] and len(item["points"]) == 2 for item in series)
    assert series[0] == {
        "benchmark": "nifty_500",
        "points": [
            {"date": "2026-10-22", "pct": "0.0000"},
            {"date": "2026-10-23", "pct": "0.8333"},
        ],
        "clipped": False,
        "effective_start": "2026-10-22",
        "available": True,
    }


@pytest.mark.parametrize("fourth", ["nifty_smallcap_250", "nifty_50"])
def test_fourth_benchmark_rejected(wealth_home, fourth):
    response = wealth_home.client.get(
        f"{WEALTH_PATH}?benchmarks=nifty_50&benchmarks=nifty_500"
        f"&benchmarks=nifty_midcap_150&benchmarks={fourth}"
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "Choose up to 3 benchmarks."


def test_unavailable_benchmark_reports_available_false_and_keeps_the_others(wealth_home):
    response = wealth_home.client.get(f"{WEALTH_PATH}?benchmarks=nifty_500&benchmarks=nifty_50")

    assert response.status_code == 200
    body = response.json()
    assert body["benchmark"] is None
    series = body.get("benchmark_series", [])
    assert len(series) == 2
    assert series[0] == {
        "benchmark": "nifty_500", "points": [], "clipped": False,
        "effective_start": None, "available": False,
    }
    assert series[1]["benchmark"] == "nifty_50"
    assert series[1]["available"] is True
    assert series[1]["points"]


def test_duplicates_collapsed_and_order_kept(wealth_home):
    response = wealth_home.client.get(
        f"{WEALTH_PATH}?benchmarks=nifty_smallcap_250&benchmarks=nifty_50&benchmarks=nifty_smallcap_250"
    )

    assert response.status_code == 200
    assert [item["benchmark"] for item in response.json().get("benchmark_series", [])] == [
        "nifty_smallcap_250", "nifty_50",
    ]


def test_single_benchmark_equals_first_of_list(wealth_home):
    url = f"{WEALTH_PATH}?period=1M&benchmark=nifty_50"
    single = wealth_home.client.get(url)
    both = wealth_home.client.get(f"{url}&benchmarks=nifty_50")

    assert single.status_code == both.status_code == 200
    body = both.json()
    series = body.pop("benchmark_series", [])
    assert len(series) == 1
    assert body == single.json()
    legacy = body["benchmark"]
    assert series[0] == {
        "benchmark": legacy["index"],
        "points": legacy["points"],
        "clipped": legacy["clipped"],
        "effective_start": legacy["effective_start"],
        "available": legacy["available"],
    }


def test_member_route_accepts_benchmarks_too(wealth_home):
    member_id = wealth_home.household.dev_id
    response = wealth_home.client.get(
        f"/household-members/{member_id}/home/wealth-series?benchmarks=nifty_smallcap_250"
    )

    assert response.status_code == 200
    body = response.json()
    assert body["member_id"] == str(member_id)
    series = body.get("benchmark_series", [])
    assert len(series) == 1
    assert series[0]["benchmark"] == "nifty_smallcap_250"
    assert series[0]["available"] is True
    assert series[0]["points"]
