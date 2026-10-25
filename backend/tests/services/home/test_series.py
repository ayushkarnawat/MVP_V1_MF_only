import uuid
from datetime import date, timedelta
from decimal import Decimal

import pytest
from sqlalchemy import event

from app.models.reference import NavHistory, Scheme
from app.services.dashboard import nav as dashboard_nav
from app.services.home.series import (
    BenchmarkReturn,
    DietzResult,
    PeriodRange,
    SeriesPoint,
    benchmark_return,
    build_value_series,
    load_navs_by_scheme,
    modified_dietz,
    period_range,
)


SCHEME_A = uuid.UUID(int=1)
SCHEME_B = uuid.UUID(int=2)
SCHEME_C = uuid.UUID(int=3)


def _graph_fixture():
    dates = tuple(date(2026, 1, 5) + timedelta(days=offset) for offset in range(8))
    units = {
        SCHEME_A: [(date(2026, 1, 6), Decimal("10.000")), (date(2026, 1, 9), Decimal("4.000"))],
        SCHEME_B: [(date(2026, 1, 8), Decimal("20.000"))],
    }
    navs = {
        SCHEME_A: [
            (date(2026, 1, 5), Decimal("100.0000")),
            (date(2026, 1, 6), Decimal("101.0000")),
            (date(2026, 1, 7), Decimal("102.0000")),
            (date(2026, 1, 8), Decimal("103.0000")),
            (date(2026, 1, 9), Decimal("104.0000")),
            (date(2026, 1, 12), Decimal("106.0000")),
        ],
        SCHEME_B: [
            (date(2026, 1, 8), Decimal("50.0000")),
            (date(2026, 1, 9), Decimal("51.0000")),
            (date(2026, 1, 12), Decimal("49.0000")),
        ],
    }
    points = (
        SeriesPoint(date(2026, 1, 6), Decimal("1010")),
        SeriesPoint(date(2026, 1, 7), Decimal("1020")),
        SeriesPoint(date(2026, 1, 8), Decimal("2030")),
        SeriesPoint(date(2026, 1, 9), Decimal("1436")),
        SeriesPoint(date(2026, 1, 10), Decimal("1436")),
        SeriesPoint(date(2026, 1, 11), Decimal("1436")),
        SeriesPoint(date(2026, 1, 12), Decimal("1404")),
    )
    return dates, units, navs, points


def test_build_value_series_forward_fills_and_starts_at_first_holding():
    dates, units, navs, expected = _graph_fixture()

    result = build_value_series(units, navs, dates)

    assert result.points == expected
    assert result.partial is False
    assert result.missing_schemes == ()


def test_build_value_series_reports_a_held_scheme_with_no_nav_as_partial():
    dates, units, navs, expected = _graph_fixture()
    units[SCHEME_C] = [(date(2026, 1, 7), Decimal("5.000"))]

    result = build_value_series(units, navs, dates)

    assert result.points == expected
    assert result.partial is True
    assert result.missing_schemes == (SCHEME_C,)


def test_build_value_series_excludes_a_scheme_until_its_first_nav():
    result = build_value_series(
        {SCHEME_C: [(date(2026, 1, 8), Decimal("2.000"))]},
        {SCHEME_C: [(date(2026, 1, 9), Decimal("10.0000"))]},
        [date(2026, 1, 8), date(2026, 1, 9)],
    )

    assert result.points == (
        SeriesPoint(date(2026, 1, 8), Decimal("0")),
        SeriesPoint(date(2026, 1, 9), Decimal("20")),
    )
    assert result.partial is True
    assert result.missing_schemes == (SCHEME_C,)


@pytest.mark.parametrize(
    ("units", "navs"),
    [({}, {}), ({SCHEME_A: [(date(2026, 1, 5), Decimal("0"))]}, {})],
)
def test_build_value_series_with_no_positive_units_is_empty_and_complete(units, navs):
    result = build_value_series(units, navs, [date(2026, 1, 5)])

    assert result.points == ()
    assert result.partial is False
    assert result.missing_schemes == ()


@pytest.mark.parametrize(
    "dates",
    [
        [date(2026, 1, 6), date(2026, 1, 5)],
        [date(2026, 1, 5), date(2026, 1, 5)],
    ],
)
def test_build_value_series_rejects_dates_that_are_not_strictly_ascending(dates):
    with pytest.raises(ValueError):
        build_value_series({}, {}, dates)


def test_build_value_series_handles_a_long_range_with_moving_rows():
    dates = tuple(date(2025, 1, 1) + timedelta(days=offset) for offset in range(400))
    units = {
        SCHEME_A: [(dates[0], Decimal("1"))],
        SCHEME_B: [(dates[0], Decimal("2"))],
        SCHEME_C: [(dates[0], Decimal("3"))],
    }
    navs = {
        SCHEME_A: [(dates[0], Decimal("10"))],
        SCHEME_B: [(dates[0], Decimal("20"))],
        SCHEME_C: [(dates[0], Decimal("30"))],
    }

    result = build_value_series(units, navs, dates)

    assert len(result.points) == 400
    assert result.points[-1] == SeriesPoint(dates[-1], Decimal("140"))


def test_build_value_series_continues_after_all_units_are_redeemed():
    dates = [date(2026, 1, 1), date(2026, 1, 2), date(2026, 1, 3)]

    result = build_value_series(
        {SCHEME_A: [(dates[0], Decimal("5")), (dates[1], Decimal("0"))]},
        {SCHEME_A: [(dates[0], Decimal("10"))]},
        dates,
    )

    assert result.points == (
        SeriesPoint(dates[0], Decimal("50")),
        SeriesPoint(dates[1], Decimal("0")),
        SeriesPoint(dates[2], Decimal("0")),
    )


def _add_scheme(db_session, name):
    scheme = Scheme(id=uuid.uuid4(), name=name, amc_name="Test", sebi_category="Equity")
    db_session.add(scheme)
    db_session.flush()
    return scheme


def test_load_navs_by_scheme_uses_one_bulk_nav_history_statement(db_session):
    schemes = [_add_scheme(db_session, f"Scheme {index}") for index in range(3)]
    db_session.add_all([
        NavHistory(scheme_id=schemes[0].id, date=date(2026, 1, 20), nav=Decimal("10.0000")),
        NavHistory(scheme_id=schemes[1].id, date=date(2026, 1, 21), nav=Decimal("20.0000")),
    ])
    db_session.flush()
    statements = []

    def record_statement(_connection, _cursor, statement, _parameters, _context, _executemany):
        if "nav_history" in statement.lower():
            statements.append(statement)

    bind = db_session.get_bind()
    event.listen(bind, "before_cursor_execute", record_statement)
    try:
        result = load_navs_by_scheme(
            db_session,
            {scheme.id for scheme in schemes},
            date(2026, 1, 20),
            date(2026, 1, 31),
        )
    finally:
        event.remove(bind, "before_cursor_execute", record_statement)

    assert len(statements) == 1
    assert result == {
        schemes[0].id: [(date(2026, 1, 20), Decimal("10.0000"))],
        schemes[1].id: [(date(2026, 1, 21), Decimal("20.0000"))],
        schemes[2].id: [],
    }


def test_load_navs_by_scheme_empty_ids_runs_no_statement(db_session):
    statements = []

    def record_statement(*args):
        statements.append(args)

    bind = db_session.get_bind()
    event.listen(bind, "before_cursor_execute", record_statement)
    try:
        result = load_navs_by_scheme(db_session, set(), date(2026, 1, 20), date(2026, 1, 31))
    finally:
        event.remove(bind, "before_cursor_execute", record_statement)

    assert result == {}
    assert statements == []


def test_load_navs_by_scheme_uses_ten_calendar_day_lookback(db_session):
    scheme = _add_scheme(db_session, "Lookback")
    # Range is 20 to 31 January: 11 days back is out, exactly 10 days back is in (inclusive edge), and the
    # end day itself is in while the day after is out.
    db_session.add_all([
        NavHistory(scheme_id=scheme.id, date=date(2026, 1, 9), nav=Decimal("9.0000")),
        NavHistory(scheme_id=scheme.id, date=date(2026, 1, 10), nav=Decimal("10.0000")),
        NavHistory(scheme_id=scheme.id, date=date(2026, 1, 11), nav=Decimal("11.0000")),
        NavHistory(scheme_id=scheme.id, date=date(2026, 1, 31), nav=Decimal("31.0000")),
        NavHistory(scheme_id=scheme.id, date=date(2026, 2, 1), nav=Decimal("21.0000")),
    ])
    db_session.flush()

    result = load_navs_by_scheme(
        db_session,
        {scheme.id},
        date(2026, 1, 20),
        date(2026, 1, 31),
    )

    assert result[scheme.id] == [
        (date(2026, 1, 10), Decimal("10.0000")),
        (date(2026, 1, 11), Decimal("11.0000")),
        (date(2026, 1, 31), Decimal("31.0000")),
    ]


def test_load_navs_by_scheme_includes_requested_scheme_with_no_rows(db_session):
    scheme = _add_scheme(db_session, "No history")

    result = load_navs_by_scheme(
        db_session,
        {scheme.id},
        date(2026, 1, 20),
        date(2026, 1, 31),
    )

    assert result == {scheme.id: []}


def test_load_navs_by_scheme_never_fetches_nav_history(db_session, monkeypatch):
    scheme = _add_scheme(db_session, "Stored only")
    monkeypatch.setattr(
        dashboard_nav,
        "_fetch_nav_history",
        lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError("network fetch")),
    )

    assert load_navs_by_scheme(
        db_session,
        {scheme.id},
        date(2026, 1, 20),
        date(2026, 1, 31),
    ) == {scheme.id: []}


def test_modified_dietz_without_flows():
    assert modified_dietz(
        Decimal("100000"),
        Decimal("110000"),
        [],
        date(2026, 1, 1),
        date(2026, 1, 31),
    ) == DietzResult(Decimal("10000"), Decimal("10.0000"))


def test_modified_dietz_with_mid_period_contribution():
    assert modified_dietz(
        Decimal("100000"),
        Decimal("135000"),
        [(date(2026, 1, 16), Decimal("20000"))],
        date(2026, 1, 1),
        date(2026, 1, 31),
    ) == DietzResult(Decimal("15000"), Decimal("13.6364"))


def test_modified_dietz_with_withdrawal_multiplies_before_dividing():
    assert modified_dietz(
        Decimal("100000"),
        Decimal("80000"),
        [(date(2026, 1, 11), Decimal("-30000"))],
        date(2026, 1, 1),
        date(2026, 1, 31),
    ) == DietzResult(Decimal("10000"), Decimal("12.5000"))


def test_modified_dietz_with_first_investment_inside_period():
    assert modified_dietz(
        Decimal("0"),
        Decimal("105000"),
        [(date(2026, 1, 11), Decimal("100000"))],
        date(2026, 1, 1),
        date(2026, 1, 31),
    ) == DietzResult(Decimal("5000"), Decimal("7.5000"))


def test_modified_dietz_ignores_flows_on_start_and_after_end():
    assert modified_dietz(
        Decimal("100000"),
        Decimal("110000"),
        [
            (date(2026, 1, 1), Decimal("50000")),
            (date(2026, 2, 1), Decimal("50000")),
        ],
        date(2026, 1, 1),
        date(2026, 1, 31),
    ) == DietzResult(Decimal("10000"), Decimal("10.0000"))


def test_modified_dietz_has_no_percentage_when_denominator_is_not_positive():
    assert modified_dietz(
        Decimal("0"),
        Decimal("100"),
        [],
        date(2026, 1, 1),
        date(2026, 1, 31),
    ) == DietzResult(Decimal("100"), None)


def test_modified_dietz_rejects_reversed_range():
    with pytest.raises(ValueError):
        modified_dietz(
            Decimal("100"),
            Decimal("110"),
            [],
            date(2026, 1, 2),
            date(2026, 1, 1),
        )


def test_modified_dietz_same_day_uses_start_value_and_ignores_flows():
    assert modified_dietz(
        Decimal("100"),
        Decimal("110"),
        [(date(2026, 1, 1), Decimal("50"))],
        date(2026, 1, 1),
        date(2026, 1, 1),
    ) == DietzResult(Decimal("10"), Decimal("10.0000"))


def test_benchmark_return_normal_range():
    assert benchmark_return(
        [
            (date(2026, 1, 1), Decimal("20000")),
            (date(2026, 1, 31), Decimal("21000")),
        ],
        date(2026, 1, 1),
        date(2026, 1, 31),
    ) == BenchmarkReturn(Decimal("5.0000"), date(2026, 1, 1), False)


def test_benchmark_return_forward_fills_a_weekend_end():
    assert benchmark_return(
        [
            (date(2026, 1, 5), Decimal("200")),
            (date(2026, 1, 9), Decimal("202")),
        ],
        date(2026, 1, 5),
        date(2026, 1, 11),
    ) == BenchmarkReturn(Decimal("1.0000"), date(2026, 1, 5), False)


def test_benchmark_return_clips_when_history_starts_late():
    assert benchmark_return(
        [
            (date(2026, 1, 10), Decimal("200")),
            (date(2026, 1, 31), Decimal("220")),
        ],
        date(2026, 1, 1),
        date(2026, 1, 31),
    ) == BenchmarkReturn(Decimal("10.0000"), date(2026, 1, 10), True)


@pytest.mark.parametrize(
    "levels",
    [[], [(date(2026, 2, 1), Decimal("200"))]],
)
def test_benchmark_return_without_a_level_on_or_before_end_is_unavailable(levels):
    assert benchmark_return(
        levels,
        date(2026, 1, 1),
        date(2026, 1, 31),
    ) == BenchmarkReturn(None, None, False)


def test_benchmark_return_with_non_positive_start_level_has_no_percentage():
    assert benchmark_return(
        [
            (date(2026, 1, 1), Decimal("0")),
            (date(2026, 1, 31), Decimal("10")),
        ],
        date(2026, 1, 1),
        date(2026, 1, 31),
    ) == BenchmarkReturn(None, date(2026, 1, 1), False)


def test_benchmark_return_with_one_usable_point_is_zero_and_clipped():
    assert benchmark_return(
        [(date(2026, 1, 10), Decimal("200"))],
        date(2026, 1, 1),
        date(2026, 1, 31),
    ) == BenchmarkReturn(Decimal("0.0000"), date(2026, 1, 10), True)


def test_benchmark_return_rejects_reversed_range():
    with pytest.raises(ValueError):
        benchmark_return([], date(2026, 1, 2), date(2026, 1, 1))


@pytest.mark.parametrize(
    ("period", "expected_start"),
    [
        ("1D", date(2026, 10, 24)),
        ("1W", date(2026, 10, 18)),
        ("1M", date(2026, 9, 25)),
        ("1Y", date(2025, 10, 25)),
    ],
)
def test_period_range_fixed_periods(period, expected_start):
    assert period_range(period, date(2026, 10, 25)) == PeriodRange(
        expected_start,
        date(2026, 10, 25),
        False,
    )


@pytest.mark.parametrize(
    ("today", "expected_start"),
    [
        (date(2026, 3, 31), date(2026, 2, 28)),
        (date(2024, 3, 31), date(2024, 2, 29)),
    ],
)
def test_period_range_one_month_clamps_to_month_end(today, expected_start):
    assert period_range("1M", today) == PeriodRange(expected_start, today, False)


def test_period_range_one_year_clamps_leap_day():
    assert period_range("1Y", date(2024, 2, 29)) == PeriodRange(
        date(2023, 2, 28),
        date(2024, 2, 29),
        False,
    )


def test_period_range_custom_inside_window_is_unchanged():
    assert period_range(
        "custom",
        date(2026, 10, 25),
        (date(2020, 1, 1), date(2025, 12, 31)),
    ) == PeriodRange(date(2020, 1, 1), date(2025, 12, 31), False)


def test_period_range_custom_future_end_is_clamped_to_today():
    assert period_range(
        "custom",
        date(2026, 10, 25),
        (date(2026, 1, 1), date(2027, 1, 1)),
    ) == PeriodRange(date(2026, 1, 1), date(2026, 10, 25), True)


def test_period_range_custom_old_start_is_clamped_to_ten_year_window():
    assert period_range(
        "custom",
        date(2026, 10, 25),
        (date(2010, 1, 1), date(2026, 1, 1)),
    ) == PeriodRange(date(2016, 10, 25), date(2026, 1, 1), True)


def test_period_range_custom_ten_year_floor_clamps_leap_day():
    assert period_range(
        "custom",
        date(2024, 2, 29),
        (date(2010, 1, 1), date(2024, 2, 29)),
    ) == PeriodRange(date(2014, 2, 28), date(2024, 2, 29), True)


def test_period_range_custom_wholly_before_window_raises():
    with pytest.raises(ValueError):
        period_range(
            "custom",
            date(2026, 10, 25),
            (date(2010, 1, 1), date(2015, 12, 31)),
        )


def test_period_range_custom_start_after_end_raises():
    with pytest.raises(ValueError):
        period_range(
            "custom",
            date(2026, 10, 25),
            (date(2026, 1, 2), date(2026, 1, 1)),
        )


def test_period_range_custom_requires_dates():
    with pytest.raises(ValueError):
        period_range("custom", date(2026, 10, 25))


def test_period_range_rejects_unknown_period():
    with pytest.raises(ValueError):
        period_range("ALL", date(2026, 10, 25))
