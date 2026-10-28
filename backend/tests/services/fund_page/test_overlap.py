from __future__ import annotations

import asyncio
from datetime import date
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.models.enums import AssetType, MarketCapBucket, SchemePlanType
from app.services.fund_page.scope import ScopeContext
from app.services.fund_page.schemas import Unavailable
from tests.services.fund_page.factories import (
    TODAY,
    add_disclosure_batch,
    add_market_cap,
    add_scheme,
    add_stock_master,
    make_session,
)


@pytest.fixture
def db():
    session = make_session()
    try:
        yield session
    finally:
        session.close()


def _scheme(db, key):
    return add_scheme(
        db, key, "Equity Scheme - Flexi Cap Fund", SchemePlanType.DIRECT, key.upper(),
        name=f"Fund {key.upper()}",
    )


def _row(name, isin, weight, sector):
    return (name, isin, Decimal(weight), AssetType.EQUITY_DOMESTIC, sector)


def _holding(scheme, value, member_id="member"):
    return SimpleNamespace(
        scheme_id=str(scheme.id), current_value=str(value), current_nav_date=TODAY,
        household_member_id=str(member_id),
    )


def _seed(db, monkeypatch):
    from app.services.fund_page import overlap

    f, g, h = (_scheme(db, key) for key in ("f", "g", "h"))
    add_disclosure_batch(db, f, date(2026, 9, 30), [
        _row("Stock X1", "INE000X00001", "10", "IT"),
        _row("Stock X2", "INE000X00002", "20", None),
        _row("Stock X3", "INE000X00003", "30", "Financial Services"),
    ])
    add_disclosure_batch(db, g, date(2026, 9, 30), [
        _row("Stock X1", "INE000X00001", "5", "IT"),
        _row("Stock X2", "INE000X00002", "40", None),
        _row("Stock X4", "INE000X00004", "20", "IT"),
    ])
    add_disclosure_batch(db, h, date(2026, 9, 30), [
        _row("Stock X3", "INE000X00003", "10", "Financial Services"),
        _row("Stock X5", "INE000X00005", "50", "Industrials"),
    ])
    add_stock_master(db, "INE000X00003", name="Stock X3", sector="Financial Services", as_of=TODAY)
    for isin, bucket in (
        ("INE000X00001", MarketCapBucket.LARGE),
        ("INE000X00002", MarketCapBucket.MID),
        ("INE000X00003", MarketCapBucket.SMALL),
        ("INE000X00004", MarketCapBucket.LARGE),
    ):
        add_market_cap(db, isin, bucket, date(2026, 9, 1))
    holdings = [_holding(f, "600"), _holding(g, "300"), _holding(h, "100")]
    monkeypatch.setattr(overlap, "compute_holdings", AsyncMock(return_value=holdings))
    return f, g, h, holdings


def _ctx():
    return ScopeContext([__import__("uuid").uuid4()], "combined", True)


def test_overlap_pct_and_counts_for_f(db, monkeypatch):
    from app.services.fund_page.overlap import build_fund_overlap

    f, _g, _h, _holdings = _seed(db, monkeypatch)
    result = asyncio.run(build_fund_overlap(db, f, _ctx(), TODAY))

    assert result.overlap_pct == "60.0000"
    assert result.common_stock_count == 3
    assert result.total_stock_count == 3
    assert result.distribution.model_dump() == {
        "unique_to_fund_count": 0, "common_count": 3, "unique_to_others_count": 2,
        "unique_to_fund_pct": "0.0000", "common_pct": "60.0000",
        "unique_to_others_pct": "40.0000",
    }


def test_top_overlap_funds_match_pair_semantics(db, monkeypatch):
    from app.services.fund_page.overlap import build_fund_overlap

    f, g, h, _holdings = _seed(db, monkeypatch)
    result = asyncio.run(build_fund_overlap(db, f, _ctx(), TODAY))

    assert [(row.scheme_id, row.overlap_pct, row.common_stock_count) for row in result.top_overlap_funds] == [
        (str(g.id), "25.0000", 2),
        (str(h.id), "10.0000", 1),
    ]


def test_top_overlap_funds_cover_all_disclosed_funds_even_beyond_twelve(db, monkeypatch):
    from app.services.fund_page import overlap
    from app.services.fund_page.overlap import build_fund_overlap

    fund = _scheme(db, "wide-main")
    add_disclosure_batch(db, fund, date(2026, 9, 30), [_row("Shared", "SHARED000001", "10", "IT")])
    holdings = [_holding(fund, "100")]
    for index in range(14):
        peer = _scheme(db, f"wide-{index}")
        add_disclosure_batch(db, peer, date(2026, 9, 30), [_row("Shared", "SHARED000001", str(index + 1), "IT")])
        holdings.append(_holding(peer, "10"))
    monkeypatch.setattr(overlap, "compute_holdings", AsyncMock(return_value=holdings))

    result = asyncio.run(build_fund_overlap(db, fund, _ctx(), TODAY))

    assert len(result.top_overlap_funds) == 14


def test_common_holdings_and_sector_use_composition_resolver(db, monkeypatch):
    from app.services.fund_page.overlap import build_fund_overlap

    f, _g, _h, _holdings = _seed(db, monkeypatch)
    result = asyncio.run(build_fund_overlap(db, f, _ctx(), TODAY))
    common = {row.isin: row for row in result.common_holdings}
    sectors = {row.sector: row.pct for row in result.by_sector}

    assert common["INE000X00003"].sector == "Financial Services"
    assert common["INE000X00003"].portfolio_weight == "19.0000"
    assert common["INE000X00002"].sector == "Other"
    assert sectors == {"Financial Services": "30.0000", "Other": "20.0000", "IT": "10.0000"}


def test_comparison_f_vs_g_counts_and_impact_reconcile(db, monkeypatch):
    from app.services.fund_page.overlap import build_fund_comparison

    f, g, _h, _holdings = _seed(db, monkeypatch)
    result = asyncio.run(build_fund_comparison(db, f, g, _ctx(), TODAY))

    assert result.overlap_pct == "25.0000"
    assert result.counts.model_dump() == {"unique_a": 1, "common": 2, "unique_b": 1}
    assert result.impact.common_both.model_dump() == {"amount": "315.00", "pct": "31.5000"}
    assert result.impact.unique_a.model_dump() == {"amount": "180.00", "pct": "18.0000"}
    assert result.impact.unique_b.model_dump() == {"amount": "60.00", "pct": "6.0000"}
    assert result.impact.other_funds.model_dump() == {"amount": "445.00", "pct": "44.5000"}
    assert sum((Decimal(part.pct) for part in (
        result.impact.common_both, result.impact.unique_a,
        result.impact.unique_b, result.impact.other_funds,
    )), Decimal("0")) == Decimal("100.0000")


def test_market_cap_per_fund_matches_classify_isins_and_sums_to_100(db, monkeypatch):
    from app.services.fund_page.overlap import build_fund_comparison

    f, g, _h, _holdings = _seed(db, monkeypatch)
    result = asyncio.run(build_fund_comparison(db, f, g, _ctx(), TODAY))

    for allocation in (result.market_cap.a, result.market_cap.b):
        assert sum((Decimal(allocation.large), Decimal(allocation.mid), Decimal(allocation.small), Decimal(allocation.other))) == Decimal("100.0000")
    assert result.market_cap.a.model_dump() == {
        "large": "16.6667", "mid": "33.3333", "small": "50.0000", "other": "0.0000",
    }


def test_fund_without_disclosure_returns_unavailable_no_disclosure(db, monkeypatch):
    from app.services.fund_page import overlap
    from app.services.fund_page.overlap import build_fund_overlap

    fund = _scheme(db, "no-disclosure")
    monkeypatch.setattr(overlap, "compute_holdings", AsyncMock(return_value=[_holding(fund, "100")]))
    assert asyncio.run(build_fund_overlap(db, fund, _ctx(), TODAY)) == Unavailable(
        reason="no_disclosure"
    )


def test_fund_not_held_in_scope_returns_unavailable_not_held(db, monkeypatch):
    from app.services.fund_page import overlap
    from app.services.fund_page.overlap import build_fund_overlap

    fund = _scheme(db, "not-held-overlap")
    add_disclosure_batch(db, fund, date(2026, 9, 30), [_row("Stock", "NOTHELD00001", "10", "IT")])
    monkeypatch.setattr(overlap, "compute_holdings", AsyncMock(return_value=[]))
    assert asyncio.run(build_fund_overlap(db, fund, _ctx(), TODAY)) == Unavailable(
        reason="not_held"
    )


def test_overlap_scope_never_fetches_prices(db, monkeypatch):
    from app.services.fund_page import overlap
    from app.services.fund_page.overlap import build_fund_overlap

    f, _g, _h, holdings = _seed(db, monkeypatch)
    spy = AsyncMock(return_value=holdings)
    monkeypatch.setattr(overlap, "compute_holdings", spy)
    monkeypatch.setattr("app.services.dashboard.nav.warm_nav_history", AsyncMock(side_effect=AssertionError("no fetch")))
    monkeypatch.setattr("app.services.dashboard.nav._fetch_nav_history", AsyncMock(side_effect=AssertionError("no fetch")))

    asyncio.run(build_fund_overlap(db, f, _ctx(), TODAY))

    assert spy.await_args.kwargs == {"allow_stale_today": True, "stored_only": True}


def test_existing_disclosure_scope_callers_unchanged(db, monkeypatch):
    from app.services.analytics import lookthrough

    spy = AsyncMock(return_value=[])
    monkeypatch.setattr(lookthrough, "compute_holdings", spy)
    asyncio.run(lookthrough.get_disclosure_scope(db, [__import__("uuid").uuid4()]))
    assert spy.await_args.kwargs == {}
