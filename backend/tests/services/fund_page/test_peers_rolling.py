from __future__ import annotations

import asyncio
from datetime import date
from decimal import Decimal
from unittest.mock import AsyncMock

import pytest

from app.models.enums import SchemePlanType
from app.models.reference import NavHistory
from app.services.analytics.scheme_universe import CategoryPeers
from app.services.fund_page.schemas import Unavailable
from tests.services.fund_page.factories import (
    TODAY,
    add_aaum,
    add_nav_closed_form,
    add_scheme,
    add_tri_closed_form,
    make_session,
)


CATEGORY = "Equity Scheme - Flexi Cap Fund"


@pytest.fixture
def db():
    session = make_session()
    try:
        yield session
    finally:
        session.close()


def _scheme(db, key="rolling", *, category=CATEGORY):
    return add_scheme(db, key, category, SchemePlanType.DIRECT, key.upper())


def _patch_peers(monkeypatch, peers):
    value = CategoryPeers(
        schemes=peers, fund_count=len(peers),
        representative_of={scheme.id: scheme.id for scheme in peers},
    )
    monkeypatch.setattr(
        "app.services.fund_page.peers.get_category_peers", AsyncMock(return_value=value),
    )
    from app.services.fund_page.peers import peer_cache
    peer_cache.clear()


def _sparse_history(db, scheme, start=date(2020, 1, 1)):
    db.add_all([
        NavHistory(scheme_id=scheme.id, date=start, nav=Decimal("100")),
        NavHistory(scheme_id=scheme.id, date=TODAY, nav=Decimal("200")),
    ])
    add_aaum(db, scheme, Decimal("100"))
    db.flush()


def test_rolling_window_longer_than_history_is_omitted(db, monkeypatch):
    from app.services.fund_page.peers import rolling_returns

    scheme = _scheme(db, "young-rolling")
    add_nav_closed_form(db, scheme, date(2024, 10, 23), TODAY, Decimal("0.10"))
    add_aaum(db, scheme, Decimal("100"))
    _patch_peers(monkeypatch, [scheme])

    assert asyncio.run(rolling_returns(db, scheme, 3, TODAY)) == Unavailable(
        reason="no_history"
    )


def test_rolling_annualised_for_multi_year_windows(db, monkeypatch):
    from app.services.fund_page.peers import rolling_returns

    scheme = _scheme(db, "nav10")
    add_nav_closed_form(db, scheme, date(2020, 1, 1), TODAY, Decimal("0.10"))
    add_aaum(db, scheme, Decimal("100"))
    _patch_peers(monkeypatch, [scheme])

    result = asyncio.run(rolling_returns(db, scheme, 3, TODAY))

    assert result.points
    assert all(
        abs(Decimal(point.fund) - Decimal("10.0000")) < Decimal("0.01")
        for point in result.points
    )


def test_scorer_window_unchanged():
    import inspect

    from app.services.analytics import scorer

    source = inspect.getsource(scorer._compute_category_component_scores)
    assert scorer._HISTORY_YEARS == 5
    assert "years_ago(today, _HISTORY_YEARS)" in source
    assert "month_end_dates" in source
    assert "build_monthly_series_bulk" in source


@pytest.mark.parametrize(
    "period, bucket",
    [
        ("1M", "week"), ("3M", "week"),
        ("6M", "month"), ("1Y", "month"),
        ("3Y", "quarter"),
        ("5Y", "year"), ("All", "year"),
    ],
)
def test_period_bucket_widths_per_chip(db, monkeypatch, period, bucket):
    from app.services.fund_page.peers import period_returns

    scheme = _scheme(db, f"bucket-{period.lower()}")
    _sparse_history(db, scheme)
    _patch_peers(monkeypatch, [scheme])

    result = asyncio.run(period_returns(db, scheme, period, TODAY))

    assert result.bucket == bucket
    assert result.buckets
    assert result.buckets[0].start <= result.buckets[0].end
    assert result.buckets[-1].end == TODAY


def test_current_year_is_labelled_ytd(db, monkeypatch):
    from app.services.fund_page.peers import period_returns

    scheme = _scheme(db, "ytd")
    _sparse_history(db, scheme)
    _patch_peers(monkeypatch, [scheme])

    result = asyncio.run(period_returns(db, scheme, "5Y", TODAY))

    assert result.buckets[-1].label == "2026 YTD"
    assert all("YTD" not in bucket.label for bucket in result.buckets[:-1])


def test_buckets_cover_period_without_gaps(db, monkeypatch):
    from app.services.fund_page.peers import period_returns

    scheme = _scheme(db, "gaps")
    _sparse_history(db, scheme)
    _patch_peers(monkeypatch, [scheme])

    result = asyncio.run(period_returns(db, scheme, "3Y", TODAY))

    assert all(
        current.start == previous.end
        for previous, current in zip(result.buckets, result.buckets[1:])
    )


def test_non_equity_has_no_benchmark_values(db, monkeypatch):
    from app.services.fund_page.peers import period_returns, rolling_returns

    scheme = _scheme(db, "debt-period", category="Debt Scheme - Liquid Fund")
    add_nav_closed_form(db, scheme, date(2020, 1, 1), TODAY, Decimal("0.07"))
    add_aaum(db, scheme, Decimal("100"))
    _patch_peers(monkeypatch, [scheme])

    period = asyncio.run(period_returns(db, scheme, "1Y", TODAY))
    rolling = asyncio.run(rolling_returns(db, scheme, 3, TODAY))

    assert all(bucket.benchmark is None for bucket in period.buckets)
    assert all(point.benchmark is None for point in rolling.points)


def test_calendar_year_returns_complete_years_only(db, monkeypatch):
    from app.services.fund_page.peers import calendar_year_returns

    scheme = _scheme(db, "calendar")
    _sparse_history(db, scheme, start=date(2023, 6, 1))
    _patch_peers(monkeypatch, [scheme])

    rows = asyncio.run(calendar_year_returns(db, scheme, TODAY, n=5))

    assert [row.year for row in rows] == [2023, 2024, 2025]
    assert rows[0].fund is None
    assert 2026 not in [row.year for row in rows]
