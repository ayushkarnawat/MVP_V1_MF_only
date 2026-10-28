from __future__ import annotations

import asyncio
from datetime import date, timedelta
from decimal import Decimal
from unittest.mock import AsyncMock

import pytest
from sqlalchemy import event

from app.models.enums import SchemePlanType
from app.models.reference import NavHistory
from app.services.analytics.category_ranking import category_period_averages
from app.services.analytics.scheme_universe import CategoryPeers
from app.services.fund_page.schemas import Unavailable
from tests.services.fund_page.factories import (
    TODAY,
    add_aaum,
    add_scheme,
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


def _scheme(db, key):
    return add_scheme(db, key, CATEGORY, SchemePlanType.DIRECT, key.upper())


def _nav(db, scheme, row_date, value):
    db.add(NavHistory(scheme_id=scheme.id, date=row_date, nav=Decimal(value)))
    db.flush()


def _peer_set(db, returns=("10", "20", "40"), *, start=None):
    start = start or date(2025, 10, 23)
    peers = []
    for index, (return_pct, aaum) in enumerate(zip(returns, ("100", "100", "200", "100", "100"))):
        scheme = _scheme(db, f"peer-{len(returns)}-{index}")
        _nav(db, scheme, start, "100")
        _nav(db, scheme, TODAY, str(Decimal("100") * (Decimal("1") + Decimal(return_pct) / Decimal("100"))))
        add_aaum(db, scheme, Decimal(aaum))
        peers.append(scheme)
    return peers


def _patch_peers(monkeypatch, peers):
    value = CategoryPeers(
        schemes=peers, fund_count=len(peers),
        representative_of={scheme.id: scheme.id for scheme in peers},
    )
    monkeypatch.setattr(
        "app.services.fund_page.peers.get_category_peers", AsyncMock(return_value=value),
    )


def _clear_cache():
    from app.services.fund_page.peers import peer_cache

    peer_cache.clear()


def test_category_average_is_aum_weighted(db, monkeypatch):
    from app.services.fund_page.peers import category_returns

    peers = _peer_set(db)
    _patch_peers(monkeypatch, peers)
    _clear_cache()

    result = asyncio.run(category_returns(db, peers[0], TODAY))

    assert result.category["1Y"] == "27.5000"
    assert result.peers_used["1Y"] == 3


def test_peer_without_start_date_is_dropped_and_counted(db, monkeypatch):
    from app.services.fund_page.peers import category_series

    peers = _peer_set(db)
    late = peers[-1]
    db.query(NavHistory).filter(
        NavHistory.scheme_id == late.id,
        NavHistory.date == date(2025, 10, 23),
    ).delete()
    _patch_peers(monkeypatch, peers)
    _clear_cache()

    result = asyncio.run(category_series(db, peers[0], "1Y", TODAY))

    assert result.peers_used == 2
    assert result.peers_total == 3


def test_daily_up_to_one_year_month_end_beyond(db, monkeypatch):
    from app.services.fund_page.peers import category_series

    peers = _peer_set(db, start=date(2023, 10, 23))
    _patch_peers(monkeypatch, peers)
    _clear_cache()

    one_year = asyncio.run(category_series(db, peers[0], "1Y", TODAY))
    three_year = asyncio.run(category_series(db, peers[0], "3Y", TODAY))

    assert one_year.granularity == "daily"
    assert three_year.granularity == "month_end"


def test_since_inception_uses_peers_existing_on_launch(db, monkeypatch):
    from app.services.fund_page.peers import category_returns

    launch = date(2024, 1, 1)
    peers = _peer_set(db, start=launch)
    late = peers[-1]
    db.query(NavHistory).filter(
        NavHistory.scheme_id == late.id,
        NavHistory.date == launch,
    ).delete()
    _nav(db, late, launch + timedelta(days=1), "100")
    _patch_peers(monkeypatch, peers)
    _clear_cache()

    result = asyncio.run(category_returns(db, peers[0], TODAY))

    assert result.peers_used["since_inception"] == 2


def test_empty_peers_returns_peers_unavailable_and_no_exception(db, monkeypatch):
    from app.services.fund_page.peers import category_returns, category_series

    scheme = _scheme(db, "empty")
    _patch_peers(monkeypatch, [])
    _clear_cache()

    assert asyncio.run(category_series(db, scheme, "1Y", TODAY)) == Unavailable(
        reason="peers_unavailable"
    )
    assert asyncio.run(category_returns(db, scheme, TODAY)) == Unavailable(
        reason="peers_unavailable"
    )


@pytest.mark.parametrize("count, expected", [(4, True), (5, False)])
def test_thin_category_flag(db, monkeypatch, count, expected):
    from app.services.fund_page.peers import category_returns

    peers = _peer_set(db, returns=tuple("10" for _ in range(count)))
    _patch_peers(monkeypatch, peers)
    _clear_cache()

    assert asyncio.run(category_returns(db, peers[0], TODAY)).thin_category is expected


def test_peers_computed_via_cache_second_call_does_not_reread_nav(db, monkeypatch):
    from app.services.fund_page.peers import category_series

    peers = _peer_set(db)
    _patch_peers(monkeypatch, peers)
    _clear_cache()
    nav_reads = 0

    def count_nav(_conn, _cursor, statement, _parameters, _context, _executemany):
        nonlocal nav_reads
        if "nav_history" in statement.lower():
            nav_reads += 1

    event.listen(db.get_bind(), "before_cursor_execute", count_nav)
    try:
        first = asyncio.run(category_series(db, peers[0], "1Y", TODAY))
        after_first = nav_reads
        second = asyncio.run(category_series(db, peers[0], "1Y", TODAY))
    finally:
        event.remove(db.get_bind(), "before_cursor_execute", count_nav)

    assert first == second
    assert after_first > 0
    assert nav_reads == after_first


def test_category_1y_3y_5y_equal_category_ranking_averages(db, monkeypatch):
    from app.services.fund_page.peers import category_returns

    start_5y = date(2021, 10, 23)
    peers = _peer_set(db, start=start_5y)
    for scheme, annual in zip(peers, (Decimal("0.10"), Decimal("0.20"), Decimal("0.40"))):
        db.query(NavHistory).filter(
            NavHistory.scheme_id == scheme.id,
            NavHistory.date == TODAY,
        ).update({NavHistory.nav: Decimal("100") * (Decimal("1") + annual) ** 5})
        for years in (1, 3):
            _nav(
                db, scheme, date(TODAY.year - years, TODAY.month, TODAY.day),
                str(Decimal("100") * (Decimal("1") + annual) ** Decimal(5 - years)),
            )
    _patch_peers(monkeypatch, peers)
    _clear_cache()

    result = asyncio.run(category_returns(db, peers[0], TODAY))
    detailed = {
        scheme.id: (annual, annual, annual, annual)
        for scheme, annual in zip(peers, (Decimal("0.10"), Decimal("0.20"), Decimal("0.40")))
    }
    expected = category_period_averages(
        detailed, {peers[0].id: Decimal("100"), peers[1].id: Decimal("100"), peers[2].id: Decimal("200")},
    )

    assert {
        period: Decimal(result.category[period.upper()]) / Decimal("100")
        for period in ("1y", "3y", "5y")
    } == {period: value[0].quantize(Decimal("0.000001")) for period, value in expected.items()}


def test_no_network_during_peer_pass(db, monkeypatch):
    from app.services.fund_page.peers import category_returns

    peers = _peer_set(db)
    _patch_peers(monkeypatch, peers)
    _clear_cache()
    monkeypatch.setattr(
        "app.services.dashboard.nav.warm_nav_history",
        AsyncMock(side_effect=AssertionError("peer pass must not warm over HTTP")),
    )
    monkeypatch.setattr(
        "app.services.dashboard.nav._fetch_nav_history",
        AsyncMock(side_effect=AssertionError("peer pass must not fetch over HTTP")),
    )

    assert asyncio.run(category_returns(db, peers[0], TODAY)).status == "ready"
