import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models.reference import NavHistory, Scheme
from app.services.analytics.risk_metrics import (
    build_monthly_series,
    build_monthly_series_bulk,
    category_medians,
    compute_consistency_hit_rate,
    compute_downside_deviation,
    month_end_dates,
    monthly_returns,
    rolling_12m_returns,
    years_ago,
)


def _session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    return sessionmaker(autoflush=False, bind=engine)()


def _scheme(db):
    scheme = Scheme(
        id=uuid.uuid4(), amfi_code=uuid.uuid4().hex[:6], isin="INF123",
        name="Test Fund", amc_name="HDFC AMC", sebi_category="Equity Scheme - Flexi Cap Fund",
    )
    db.add(scheme)
    db.commit()
    return scheme


def test_month_end_dates_spans_start_to_last_complete_month():
    dates = month_end_dates(date(2024, 1, 15), date(2024, 4, 10))
    assert dates == [date(2024, 1, 31), date(2024, 2, 29), date(2024, 3, 31)]


def test_month_end_dates_excludes_current_partial_month():
    dates = month_end_dates(date(2024, 3, 1), date(2024, 3, 15))
    assert dates == []


def test_years_ago_clamps_feb_29_in_non_leap_target_year():
    assert years_ago(date(2024, 2, 29), 1) == date(2023, 2, 28)


def test_years_ago_regular_date():
    assert years_ago(date(2024, 6, 15), 5) == date(2019, 6, 15)


def test_build_monthly_series_uses_nav_on_or_before_each_anchor():
    db = _session()
    scheme = _scheme(db)
    db.add(NavHistory(scheme_id=scheme.id, date=date(2024, 1, 10), nav=Decimal("10")))
    db.add(NavHistory(scheme_id=scheme.id, date=date(2024, 2, 5), nav=Decimal("11")))
    db.commit()

    month_ends = [date(2024, 1, 31), date(2024, 2, 29), date(2024, 3, 31)]
    series = build_monthly_series(db, scheme.id, month_ends)
    # Jan-end -> last NAV on/before it (Jan 10 = 10). Feb-end -> Feb 5 = 11.
    # Mar-end -> still 11 (nothing newer).
    assert series == [Decimal("10"), Decimal("11"), Decimal("11")]


def test_build_monthly_series_none_before_first_nav_row():
    db = _session()
    scheme = _scheme(db)
    db.add(NavHistory(scheme_id=scheme.id, date=date(2024, 2, 5), nav=Decimal("11")))
    db.commit()

    month_ends = [date(2024, 1, 31), date(2024, 2, 29)]
    series = build_monthly_series(db, scheme.id, month_ends)
    assert series == [None, Decimal("11")]


def test_build_monthly_series_empty_month_ends():
    db = _session()
    scheme = _scheme(db)
    assert build_monthly_series(db, scheme.id, []) == []


def test_build_monthly_series_carries_forward_seed_far_before_first_anchor():
    """A scheme's most recent NAV row before the series' first anchor can be
    far in the past (inception years earlier, or a long publishing gap) --
    the query's lower bound must still reach it, not just the anchors'
    own window, or the first anchor would wrongly show None instead of
    carrying forward the real last-known NAV."""
    db = _session()
    scheme = _scheme(db)
    db.add(NavHistory(scheme_id=scheme.id, date=date(2015, 1, 5), nav=Decimal("10")))
    db.add(NavHistory(scheme_id=scheme.id, date=date(2024, 2, 5), nav=Decimal("11")))
    db.commit()

    month_ends = [date(2024, 1, 31), date(2024, 2, 29)]
    series = build_monthly_series(db, scheme.id, month_ends)

    assert series == [Decimal("10"), Decimal("11")]


def test_build_monthly_series_row_fetch_query_is_bounded_below():
    """The old implementation queried `NavHistory.date <= month_ends[-1]`
    with no lower bound -- for a long-lived scheme this scanned every row
    since inception on every call, BUG-001's dominant Scorer cost. The
    fetch query must filter on a lower date bound too, not just the upper
    bound the old unbounded query used alone."""
    from sqlalchemy import event

    db = _session()
    scheme = _scheme(db)
    db.add(NavHistory(scheme_id=scheme.id, date=date(2010, 1, 5), nav=Decimal("5")))
    db.add(NavHistory(scheme_id=scheme.id, date=date(2024, 1, 10), nav=Decimal("10")))
    db.add(NavHistory(scheme_id=scheme.id, date=date(2024, 2, 5), nav=Decimal("11")))
    db.commit()

    month_ends = [date(2024, 1, 31), date(2024, 2, 29)]

    queries: list[str] = []
    engine = db.get_bind()

    def _capture(conn, cursor, statement, parameters, context, executemany):
        queries.append(statement)

    event.listen(engine, "before_cursor_execute", _capture)
    try:
        series = build_monthly_series(db, scheme.id, month_ends)
    finally:
        event.remove(engine, "before_cursor_execute", _capture)

    assert series == [Decimal("10"), Decimal("11")]
    select_queries = [q for q in queries if q.strip().upper().startswith("SELECT")]
    assert any(">=" in q for q in select_queries)


def test_build_monthly_series_bulk_matches_per_scheme_results():
    """Bulk must be output-identical to calling `build_monthly_series` once
    per scheme, including the far-seed and no-data-yet edge cases -- it's a
    query-count optimization, not a behavior change."""
    db = _session()
    old_seed_scheme = _scheme(db)
    db.add(NavHistory(scheme_id=old_seed_scheme.id, date=date(2015, 1, 5), nav=Decimal("10")))
    db.add(NavHistory(scheme_id=old_seed_scheme.id, date=date(2024, 2, 5), nav=Decimal("11")))

    no_seed_scheme = _scheme(db)
    db.add(NavHistory(scheme_id=no_seed_scheme.id, date=date(2024, 2, 5), nav=Decimal("20")))
    db.commit()

    month_ends = [date(2024, 1, 31), date(2024, 2, 29)]

    bulk = build_monthly_series_bulk(db, [old_seed_scheme.id, no_seed_scheme.id], month_ends)

    assert bulk[old_seed_scheme.id] == build_monthly_series(db, old_seed_scheme.id, month_ends)
    assert bulk[no_seed_scheme.id] == build_monthly_series(db, no_seed_scheme.id, month_ends)
    assert bulk == {
        old_seed_scheme.id: [Decimal("10"), Decimal("11")],
        no_seed_scheme.id: [None, Decimal("20")],
    }


def test_build_monthly_series_bulk_empty_inputs():
    db = _session()
    assert build_monthly_series_bulk(db, [], [date(2024, 1, 31)]) == {}
    scheme = _scheme(db)
    assert build_monthly_series_bulk(db, [scheme.id], []) == {scheme.id: []}


def test_build_monthly_series_bulk_uses_a_bounded_query_count_regardless_of_scheme_count():
    """The whole point: a 5-scheme batch and a 150-scheme batch must issue
    the same small, constant number of queries -- not one pair of queries
    per scheme (BUG-001's original Scorer-cost pattern, at the time fixed
    for `category_ranking.py`'s NAV lookups but never for this function)."""
    from sqlalchemy import event

    db = _session()
    schemes = [_scheme(db) for _ in range(5)]
    for scheme in schemes:
        db.add(NavHistory(scheme_id=scheme.id, date=date(2024, 1, 10), nav=Decimal("10")))
    db.commit()

    month_ends = [date(2024, 1, 31), date(2024, 2, 29)]
    scheme_ids = [s.id for s in schemes]

    queries: list[str] = []
    engine = db.get_bind()

    def _capture(conn, cursor, statement, parameters, context, executemany):
        queries.append(statement)

    event.listen(engine, "before_cursor_execute", _capture)
    try:
        build_monthly_series_bulk(db, scheme_ids, month_ends)
    finally:
        event.remove(engine, "before_cursor_execute", _capture)

    select_queries = [q for q in queries if q.strip().upper().startswith("SELECT")]
    assert len(select_queries) <= 2


def test_monthly_returns_first_entry_always_none():
    series = [Decimal("10"), Decimal("11"), Decimal("9.9")]
    returns = monthly_returns(series)
    assert returns[0] is None
    assert returns[1] == Decimal("11") / Decimal("10") - Decimal(1)
    assert returns[2] == Decimal("9.9") / Decimal("11") - Decimal(1)


def test_monthly_returns_none_when_either_side_missing():
    series = [None, Decimal("10"), None, Decimal("12")]
    returns = monthly_returns(series)
    assert returns == [None, None, None, None]


def test_compute_downside_deviation_only_counts_negative_returns():
    # Returns: +10%, -10%, +5%, -20%. Downside deviation over all 4 (MAR=0):
    # sqrt((0.10^2 + 0.20^2) / 4)
    returns = [Decimal("0.10"), Decimal("-0.10"), Decimal("0.05"), Decimal("-0.20")]
    result = compute_downside_deviation(returns)
    expected = ((Decimal("0.10") ** 2 + Decimal("0.20") ** 2) / Decimal(4)).sqrt()
    assert result == expected


def test_compute_downside_deviation_zero_when_no_negative_returns():
    result = compute_downside_deviation([Decimal("0.10"), Decimal("0.05")])
    assert result == Decimal("0")


def test_compute_downside_deviation_none_when_no_usable_returns():
    assert compute_downside_deviation([None, None]) is None


def test_rolling_12m_returns_needs_twelve_prior_points():
    series = [Decimal(str(100 + i)) for i in range(13)]  # 13 monthly points
    rolling = rolling_12m_returns(series)
    assert rolling[:12] == [None] * 12
    assert rolling[12] == Decimal(str(112)) / Decimal(str(100)) - Decimal(1)


def test_rolling_12m_returns_none_when_either_side_missing():
    series = [None] * 12 + [Decimal("110")]
    rolling = rolling_12m_returns(series)
    assert rolling[12] is None


def test_category_medians_per_index_across_schemes():
    scheme_a = [Decimal("0.10"), Decimal("0.20")]
    scheme_b = [Decimal("0.30"), None]
    scheme_c = [Decimal("0.05"), Decimal("0.40")]
    medians = category_medians([scheme_a, scheme_b, scheme_c])
    assert medians[0] == Decimal("0.10")  # median of 0.10, 0.30, 0.05
    assert medians[1] == Decimal("0.30")  # median of 0.20, 0.40 (0.30's peer is None)


def test_category_medians_empty_input():
    assert category_medians([]) == []


def test_compute_consistency_hit_rate_counts_beats_at_or_above_median():
    scheme_rolling = [Decimal("0.10"), Decimal("0.05"), Decimal("0.30"), None]
    medians = [Decimal("0.08"), Decimal("0.08"), Decimal("0.20"), Decimal("0.10")]
    # index0: 0.10 >= 0.08 -> hit. index1: 0.05 >= 0.08 -> miss.
    # index2: 0.30 >= 0.20 -> hit. index3: scheme value None -> skipped.
    result = compute_consistency_hit_rate(scheme_rolling, medians)
    assert result == Decimal(2) / Decimal(3) * Decimal(100)


def test_compute_consistency_hit_rate_none_when_no_comparable_windows():
    assert compute_consistency_hit_rate([None, None], [Decimal("0.1"), None]) is None
