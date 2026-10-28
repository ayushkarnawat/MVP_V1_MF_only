from __future__ import annotations

import asyncio
from datetime import date, timedelta
from decimal import Decimal
from unittest.mock import AsyncMock

import pytest
from sqlalchemy import event

from app.models.enums import SchemePlanType
from app.models.reference import NavHistory
from app.services.analytics.scheme_universe import CategoryPeers
from app.services.fund_page.schemas import Unavailable
from tests.services.fund_page.factories import (
    TODAY,
    add_nav_factors,
    add_scheme,
    make_session,
)


CATEGORY = "Equity Scheme - Flexi Cap Fund"
START = date(2023, 10, 23)


@pytest.fixture
def db():
    session = make_session()
    try:
        yield session
    finally:
        session.close()


def _scheme(db, key):
    return add_scheme(db, key, CATEGORY, SchemePlanType.DIRECT, key.upper())


def _sparse_nav(db, scheme, *, start=START, end=TODAY, end_nav="140"):
    db.add_all([
        NavHistory(scheme_id=scheme.id, date=start, nav=Decimal("100")),
        NavHistory(scheme_id=scheme.id, date=start + timedelta(days=1), nav=Decimal("101")),
        NavHistory(scheme_id=scheme.id, date=end, nav=Decimal(end_nav)),
    ])
    db.flush()


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


def test_fund_point_equals_overview_risk_numbers(db, monkeypatch):
    from app.services.fund_page.peers import risk_return_scatter
    from app.services.fund_page.risk import compute_risk

    fund = _scheme(db, "scatter-fund")
    factors = [Decimal("1.001") if index % 2 == 0 else Decimal("0.999") for index in range(1096)]
    add_nav_factors(db, fund, START, factors)
    _patch_peers(monkeypatch, [fund])

    risk = compute_risk(db, fund, TODAY)
    scatter = asyncio.run(risk_return_scatter(db, fund, TODAY))
    point = next(point for point in scatter.points if point.is_fund)

    assert point.volatility_pct == risk.volatility.value


def test_peer_without_three_years_is_omitted(db, monkeypatch):
    from app.services.fund_page.peers import risk_return_scatter

    fund = _scheme(db, "scatter-history")
    old_peer = _scheme(db, "scatter-old")
    young_peer = _scheme(db, "scatter-young")
    _sparse_nav(db, fund)
    _sparse_nav(db, old_peer)
    _sparse_nav(db, young_peer, start=date(2024, 10, 23))
    _patch_peers(monkeypatch, [fund, old_peer, young_peer])

    result = asyncio.run(risk_return_scatter(db, fund, TODAY))

    assert {point.scheme_id for point in result.points} == {str(fund.id), str(old_peer.id)}


def test_scatter_flags_exactly_one_fund(db, monkeypatch):
    from app.services.fund_page.peers import risk_return_scatter

    fund = _scheme(db, "scatter-flag")
    peer = _scheme(db, "scatter-flag-peer")
    _sparse_nav(db, fund)
    _sparse_nav(db, peer)
    _patch_peers(monkeypatch, [fund, peer])

    result = asyncio.run(risk_return_scatter(db, fund, TODAY))

    assert sum(point.is_fund for point in result.points) == 1


@pytest.mark.parametrize("peer_count, expected", [(4, True), (5, False)])
def test_scatter_thin_category_flag(db, monkeypatch, peer_count, expected):
    from app.services.fund_page.peers import risk_return_scatter

    peers = [_scheme(db, f"scatter-thin-{peer_count}-{index}") for index in range(peer_count)]
    for peer in peers:
        _sparse_nav(db, peer)
    _patch_peers(monkeypatch, peers)

    assert asyncio.run(risk_return_scatter(db, peers[0], TODAY)).thin_category is expected


def test_scatter_peers_unavailable(db, monkeypatch):
    from app.services.fund_page.peers import risk_return_scatter

    fund = _scheme(db, "scatter-empty")
    _sparse_nav(db, fund)
    _patch_peers(monkeypatch, [])

    assert asyncio.run(risk_return_scatter(db, fund, TODAY)) == Unavailable(
        reason="peers_unavailable"
    )


def test_scatter_nav_query_is_flat_in_peer_count(db, monkeypatch):
    from app.services.fund_page.peers import risk_return_scatter

    peers = [_scheme(db, f"scatter-query-{index}") for index in range(5)]
    for peer in peers:
        _sparse_nav(db, peer)
    _patch_peers(monkeypatch, peers)
    reads = 0

    def count_nav(_conn, _cursor, statement, _parameters, _context, _executemany):
        nonlocal reads
        if "nav_history" in statement.lower():
            reads += 1

    event.listen(db.get_bind(), "before_cursor_execute", count_nav)
    try:
        asyncio.run(risk_return_scatter(db, peers[0], TODAY))
    finally:
        event.remove(db.get_bind(), "before_cursor_execute", count_nav)

    assert reads == 1
