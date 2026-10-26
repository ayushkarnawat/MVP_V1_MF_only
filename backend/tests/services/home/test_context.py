import asyncio
from datetime import date
from decimal import Decimal
from types import SimpleNamespace
import uuid

import pytest

from app.services.home import context
from app.services.home.movers import Movers, MoversView


def _holding(scheme_id: uuid.UUID, name: str, *, unavailable: bool = False):
    return SimpleNamespace(
        scheme_id=str(scheme_id),
        scheme_name=name,
        sebi_category="Equity: Large Cap",
        nav_unavailable=unavailable,
        price_from_statement=False,
        current_value=None if unavailable else "100.00",
        current_nav=None if unavailable else "10.00",
        current_nav_date=None if unavailable else date(2026, 10, 23),
    )


def test_load_home_inputs_batches_sources_and_unions_missing(monkeypatch):
    first = uuid.uuid4()
    second = uuid.uuid4()
    holdings = [_holding(first, "Zulu Fund"), _holding(second, "Alpha Fund", unavailable=True)]
    calls = {"holdings": 0, "units": 0, "navs": 0, "sectors": 0}

    async def fake_holdings(db, member_ids, *, allow_stale_today, stored_only):
        calls["holdings"] += 1
        assert allow_stale_today is True
        assert stored_only is True  # a Home GET never downloads or writes a price
        return holdings

    def fake_units(db, member_ids, **kwargs):
        calls["units"] += 1
        assert "scheme_ids" not in kwargs  # every fund held in the window, not only today's
        return {first: [(date(2026, 10, 1), Decimal("10"))], second: [(date(2026, 10, 1), Decimal("5"))]}

    def fake_navs(db, scheme_ids, start, end):
        calls["navs"] += 1
        assert set(scheme_ids) == {first, second}
        return {first: [(date(2026, 10, 22), Decimal("9")), (date(2026, 10, 23), Decimal("10"))]}

    def fake_sectors(db, scheme_ids, as_of):
        calls["sectors"] += 1
        return {first: {"Banks": Decimal("100")}}

    movers = Movers(
        requested_view="sector", view="sector", fell_back=False, estimated=True,
        coverage_pct=Decimal("100.00"), net_change=Decimal("10.00"),
        previous_value=Decimal("90"), net_pct=Decimal("11.1111"),
        as_of_nav_date=date(2026, 10, 23), previous_nav_date=date(2026, 10, 22),
        partial=True, stale_scheme_ids=(first,), missing_scheme_ids=(), funds=(),
        result=MoversView((), (), 0, Decimal("0.00")),
    )
    monkeypatch.setattr(context, "compute_holdings", fake_holdings)
    monkeypatch.setattr(context, "build_units_timeline", fake_units)
    monkeypatch.setattr(context, "load_navs_by_scheme", fake_navs)
    monkeypatch.setattr(context, "load_prior_prices", lambda db, ids, day: {})
    monkeypatch.setattr(context, "load_sector_weights", fake_sectors)
    monkeypatch.setattr(context, "compute_movers", lambda funds, today, view: movers)

    ctx = context.ScopeContext("aggregate", None, (uuid.uuid4(),), (), None)
    loaded = asyncio.run(context.load_home_inputs(
        object(), ctx, date(2026, 10, 23), nav_start=date(2026, 10, 1), view="sector"
    ))

    assert calls == {"holdings": 1, "units": 1, "navs": 1, "sectors": 1}
    assert loaded.nav_as_of == date(2026, 10, 23)
    assert loaded.partial is True
    assert [(item.name, item.scheme_id) for item in loaded.missing_funds] == [
        ("Alpha Fund", str(second)), ("Zulu Fund", str(first))
    ]
    zulu = next(fund for fund in loaded.funds if fund.scheme_id == first)
    assert zulu.sector_weights == {"Banks": Decimal("100")}


def test_load_home_inputs_skips_sector_query_for_fund_view(monkeypatch):
    monkeypatch.setattr(context, "compute_holdings", lambda *args, **kwargs: [])

    async def no_holdings(*args, **kwargs):
        return []

    monkeypatch.setattr(context, "compute_holdings", no_holdings)
    monkeypatch.setattr(context, "build_units_timeline", lambda *args, **kwargs: {})
    monkeypatch.setattr(context, "load_navs_by_scheme", lambda *args, **kwargs: {})
    monkeypatch.setattr(
        context, "load_sector_weights",
        lambda *args, **kwargs: pytest.fail("sector weights must not load"),
    )
    ctx = context.ScopeContext("aggregate", None, (), (), None)
    loaded = asyncio.run(context.load_home_inputs(
        object(), ctx, date(2026, 10, 23), nav_start=date(2026, 10, 1), view="fund"
    ))
    assert loaded.funds == ()
    assert loaded.missing_funds == ()
