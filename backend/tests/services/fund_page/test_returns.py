"""T5: inception and current returns, with hand-derived NAV/TRI/XIRR oracles."""
from __future__ import annotations

import asyncio
from datetime import date
from decimal import Decimal
from unittest.mock import AsyncMock

from app.models.enums import BenchmarkIndex, SchemePlanType
from app.models.reference import NavHistory
from app.services.analytics.xirr import xirr
from app.services.dashboard import xirr as dashboard_xirr_module
from app.services.fund_page import summary as summary_module
from app.services.fund_page.returns import current_returns, inception_returns
from app.services.fund_page.schemas import Unavailable
from app.services.fund_page.scope import ScopeContext
from app.services.fund_page.summary import build_summary
from tests.services.fund_page.factories import (
    TODAY,
    add_folio,
    add_nav_closed_form,
    add_purchase,
    add_scheme,
    add_tri_closed_form,
    add_user_household,
    fx_nav10,
    fx_tri12,
    make_session,
)


def _equity_scheme(db, key: str):
    return add_scheme(
        db,
        key,
        "Equity Scheme - Flexi Cap Fund",
        SchemePlanType.DIRECT,
        f"AMFI{key.upper()}",
    )


def _combined(household) -> ScopeContext:
    return ScopeContext(
        [household.asha_id, household.dev_id],
        "combined",
        True,
    )


def _member(member_id) -> ScopeContext:
    return ScopeContext([member_id], str(member_id), False)


def _held_fund(db, key: str, purchase_date: date, units: str, nav: str):
    household = add_user_household(db, key=key)
    scheme = _equity_scheme(db, key)
    folio = add_folio(db, scheme, household.asha_id, f"F-{key}")
    add_purchase(db, folio, purchase_date, Decimal(units), Decimal(nav))
    return household, scheme, folio


def test_up_to_one_year_absolute_over_one_year_annualised():
    db = make_session()
    scheme = _equity_scheme(db, "inception-ten")
    fx_nav10(db, scheme)

    response = inception_returns(db, scheme, TODAY)

    three_month_days = (TODAY - date(2026, 7, 23)).days
    expected_three_month = (
        Decimal("1.1") ** (Decimal(three_month_days) / Decimal("365"))
        - Decimal("1")
    ) * Decimal("100")
    assert abs(Decimal(response.rows["fund"]["3M"]) - expected_three_month) < Decimal("0.001")
    for column in ("1Y", "3Y", "5Y", "since_inception"):
        assert abs(Decimal(response.rows["fund"][column]) - Decimal("10")) < Decimal("0.001")


def test_column_longer_than_history_is_none():
    db = make_session()
    scheme = _equity_scheme(db, "short-inception")
    add_nav_closed_form(db, scheme, date(2025, 10, 23), TODAY, Decimal("0.10"))

    response = inception_returns(db, scheme, TODAY)

    assert response.rows["fund"]["1Y"] is not None
    assert response.rows["fund"]["3Y"] is None
    assert response.rows["fund"]["5Y"] is None


def test_since_inception_benchmark_uses_fund_dates():
    db = make_session()
    scheme = _equity_scheme(db, "benchmark-fund-dates")
    add_nav_closed_form(db, scheme, date(2025, 1, 1), TODAY, Decimal("0.10"))
    fx_tri12(db, BenchmarkIndex.NIFTY_500)

    response = inception_returns(db, scheme, TODAY)

    assert abs(
        Decimal(response.rows["benchmark"]["since_inception"])
        - Decimal("12")
    ) < Decimal("0.001")


def test_current_lump_sum_matches_simple_annualised_return():
    db = make_session()
    household, scheme, _folio = _held_fund(
        db,
        "current-lump",
        date(2025, 10, 23),
        "100",
        "10",
    )
    db.add_all(
        [
            NavHistory(scheme_id=scheme.id, date=date(2025, 10, 23), nav=Decimal("10")),
            NavHistory(scheme_id=scheme.id, date=TODAY, nav=Decimal("11")),
        ]
    )
    db.flush()

    response = asyncio.run(
        current_returns(db, scheme, _member(household.asha_id), household.user_id, TODAY)
    )

    assert response.rows["holding_xirr"]["1Y"] == "10.0000"
    assert response.rows["holding_xirr"]["since_first_investment"] == "10.0000"


def test_current_sip_matches_xirr_of_flows():
    db = make_session()
    household, scheme, folio = _held_fund(
        db,
        "current-sip",
        date(2025, 10, 23),
        "100",
        "10",
    )
    add_purchase(db, folio, date(2026, 1, 23), Decimal("50"), Decimal("12"))
    add_purchase(db, folio, date(2026, 4, 23), Decimal("50"), Decimal("14"))
    db.add_all(
        [
            NavHistory(scheme_id=scheme.id, date=date(2025, 10, 23), nav=Decimal("10")),
            NavHistory(scheme_id=scheme.id, date=TODAY, nav=Decimal("15")),
        ]
    )
    db.flush()
    expected = xirr(
        [
            (date(2025, 10, 23), Decimal("-1000")),
            (date(2026, 1, 23), Decimal("-600")),
            (date(2026, 4, 23), Decimal("-700")),
            (TODAY, Decimal("3000")),
        ]
    )

    response = asyncio.run(
        current_returns(db, scheme, _member(household.asha_id), household.user_id, TODAY)
    )

    assert abs(
        Decimal(response.rows["holding_xirr"]["1Y"])
        - expected * Decimal("100")
    ) < Decimal("0.0001")


def test_current_column_longer_than_holding_is_none():
    db = make_session()
    household, scheme, _folio = _held_fund(
        db,
        "current-short",
        date(2025, 10, 23),
        "100",
        "10",
    )
    db.add_all(
        [
            NavHistory(scheme_id=scheme.id, date=date(2025, 10, 23), nav=Decimal("10")),
            NavHistory(scheme_id=scheme.id, date=TODAY, nav=Decimal("11")),
        ]
    )
    db.flush()

    response = asyncio.run(
        current_returns(db, scheme, _member(household.asha_id), household.user_id, TODAY)
    )

    assert response.rows["holding_xirr"]["1Y"] is not None
    assert response.rows["holding_xirr"]["3Y"] is None
    assert response.rows["holding_xirr"]["5Y"] is None


def test_current_benchmark_replays_same_flows():
    db = make_session()
    household, scheme, _folio = _held_fund(
        db,
        "current-benchmark",
        date(2025, 10, 23),
        "100",
        "10",
    )
    db.add_all(
        [
            NavHistory(scheme_id=scheme.id, date=date(2025, 10, 23), nav=Decimal("10")),
            NavHistory(scheme_id=scheme.id, date=TODAY, nav=Decimal("11")),
        ]
    )
    add_tri_closed_form(
        db,
        BenchmarkIndex.NIFTY_500,
        date(2025, 10, 23),
        TODAY,
        Decimal("1.00"),
    )

    response = asyncio.run(
        current_returns(db, scheme, _member(household.asha_id), household.user_id, TODAY)
    )

    assert abs(
        Decimal(response.rows["benchmark_same_flows"]["1Y"])
        - Decimal("100")
    ) < Decimal("0.001")


def test_current_opening_flow_uses_units_at_window_start_times_nav():
    db = make_session()
    household, scheme, folio = _held_fund(
        db,
        "current-opening",
        date(2024, 1, 1),
        "100",
        "5",
    )
    add_purchase(db, folio, date(2026, 1, 1), Decimal("50"), Decimal("12"))
    db.add_all(
        [
            NavHistory(scheme_id=scheme.id, date=date(2025, 10, 23), nav=Decimal("10")),
            NavHistory(scheme_id=scheme.id, date=TODAY, nav=Decimal("15")),
        ]
    )
    db.flush()
    expected = xirr(
        [
            (date(2025, 10, 23), Decimal("-1000")),
            (date(2026, 1, 1), Decimal("-600")),
            (TODAY, Decimal("2250")),
        ]
    )

    response = asyncio.run(
        current_returns(db, scheme, _member(household.asha_id), household.user_id, TODAY)
    )

    assert abs(
        Decimal(response.rows["holding_xirr"]["1Y"])
        - expected * Decimal("100")
    ) < Decimal("0.0001")


def test_current_since_first_investment_equals_summary_xirr(monkeypatch):
    class _PinnedDate(date):
        @classmethod
        def today(cls):
            return TODAY

    monkeypatch.setattr(dashboard_xirr_module, "date", _PinnedDate)
    monkeypatch.setattr(
        summary_module,
        "warm_nav_history",
        AsyncMock(return_value=None),
    )
    db = make_session()
    household, scheme, folio = _held_fund(
        db,
        "current-since-first",
        date(2025, 10, 23),
        "100",
        "10",
    )
    add_purchase(db, folio, date(2026, 1, 23), Decimal("50"), Decimal("12"))
    db.add_all(
        [
            NavHistory(scheme_id=scheme.id, date=date(2025, 10, 23), nav=Decimal("10")),
            NavHistory(scheme_id=scheme.id, date=TODAY, nav=Decimal("15")),
        ]
    )
    db.flush()
    expected = xirr(
        [
            (date(2025, 10, 23), Decimal("-1000")),
            (date(2026, 1, 23), Decimal("-600")),
            (TODAY, Decimal("2250")),
        ]
    )

    response = asyncio.run(
        current_returns(db, scheme, _member(household.asha_id), household.user_id, TODAY)
    )
    summary = asyncio.run(
        build_summary(
            db,
            scheme,
            _member(household.asha_id),
            household.user_id,
            TODAY,
        )
    )

    assert abs(
        Decimal(response.rows["holding_xirr"]["since_first_investment"])
        / Decimal("100")
        - Decimal(summary.tiles.xirr)
    ) < Decimal("0.000001")
    assert abs(Decimal(summary.tiles.xirr) - expected) < Decimal("0.000001")


def test_current_member_without_the_fund_is_unavailable_not_held():
    db = make_session()
    household, scheme, _folio = _held_fund(
        db,
        "current-not-held",
        date(2025, 10, 23),
        "100",
        "10",
    )
    db.add(NavHistory(scheme_id=scheme.id, date=TODAY, nav=Decimal("11")))
    db.flush()

    response = asyncio.run(
        current_returns(db, scheme, _member(household.dev_id), household.user_id, TODAY)
    )

    assert isinstance(response, Unavailable)
    assert response.reason == "not_held"


def test_non_equity_has_no_benchmark_row():
    db = make_session()
    scheme = add_scheme(
        db,
        "returns-debt",
        "Debt Scheme - Liquid Fund",
        SchemePlanType.DIRECT,
        "RETDEBT",
    )
    add_nav_closed_form(db, scheme, date(2021, 10, 23), TODAY, Decimal("0.07"))

    response = inception_returns(db, scheme, TODAY)

    assert response.rows["benchmark"] is None
    assert response.benchmark_reason == "no_benchmark"


def test_no_history_status():
    db = make_session()
    scheme = _equity_scheme(db, "returns-empty")

    response = inception_returns(db, scheme, TODAY)

    assert isinstance(response, Unavailable)
    assert response.reason == "no_history"


def test_returns_do_not_call_the_network(monkeypatch):
    db = make_session()
    household, scheme, _folio = _held_fund(
        db,
        "returns-offline",
        date(2025, 10, 23),
        "100",
        "10",
    )
    db.add_all(
        [
            NavHistory(scheme_id=scheme.id, date=date(2025, 10, 23), nav=Decimal("10")),
            NavHistory(scheme_id=scheme.id, date=TODAY, nav=Decimal("11")),
        ]
    )
    fx_tri12(db, BenchmarkIndex.NIFTY_500)
    monkeypatch.setattr(
        "app.services.analytics.nse_indices_client.ensure_index_history_fresh",
        AsyncMock(side_effect=AssertionError("network called")),
    )
    monkeypatch.setattr(
        "app.services.dashboard.nav._fetch_nav_history",
        AsyncMock(side_effect=AssertionError("network called")),
    )

    inception = inception_returns(db, scheme, TODAY)
    current = asyncio.run(
        current_returns(db, scheme, _member(household.asha_id), household.user_id, TODAY)
    )

    assert inception.status == "ready"
    assert current.status == "ready"


def test_current_all_rows_without_value_is_unavailable_not_minus_100(monkeypatch):
    from types import SimpleNamespace

    from app.services.fund_page import returns as returns_module

    db = make_session()
    household, scheme, _folio = _held_fund(db, "current-noval", date(2025, 10, 23), "100", "10")
    db.add_all([
        NavHistory(scheme_id=scheme.id, date=date(2025, 10, 23), nav=Decimal("10")),
        NavHistory(scheme_id=scheme.id, date=TODAY, nav=Decimal("11")),
    ])
    db.flush()
    monkeypatch.setattr(
        returns_module, "compute_holdings",
        AsyncMock(return_value=[SimpleNamespace(current_value=None)]),
    )

    response = asyncio.run(
        current_returns(db, scheme, _member(household.asha_id), household.user_id, TODAY)
    )

    assert isinstance(response, Unavailable)
    assert response.reason == "no_history"
