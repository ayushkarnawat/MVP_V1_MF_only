"""FX-8e display metadata on the tile figures and the stored fund column."""

import asyncio
from datetime import date, timedelta
from decimal import Decimal
from unittest.mock import AsyncMock

import pytest

from app.models.enums import TransactionType
from app.services.analytics import benchmark
from app.services.analytics.xirr import xirr
from app.services.dashboard import nav
from app.services.dashboard.aggregate import get_aggregate_holdings
from services.dashboard.test_xirr import _disclaimer_scenario

from .fixtures import FIXTURES
from .test_xirr_prices import _add_fund, _household, _recompute_fund_column, _store_nav, _user_id


_BY_NAME = {fixture.name: fixture for fixture in FIXTURES}
_PHONE = "+910000000005"


def _tile_for_fixture(db, name):
    fixture = _BY_NAME[name]
    first, invested = fixture.flows[0]
    terminal_date, terminal_value = fixture.flows[-1]
    today = date.today()
    start = today - (terminal_date - first)
    top_ups = [(today - (terminal_date - when), str(-amount / 10), "10")
               for when, amount in fixture.flows[1:-1]]
    return _disclaimer_scenario(db, _PHONE, start, str(-invested / 10), "10", top_ups,
                                current_value=str(terminal_value))


def _assert_tile_display(summary, basis, since_purchase):
    assert summary.lifetime_xirr_basis == summary.current_holdings_xirr_basis == basis
    assert summary.lifetime_since_purchase == summary.current_holdings_since_purchase == since_purchase


@pytest.mark.parametrize(
    ("name", "basis", "absolute"),
    [
        ("one_month", "since_purchase", "0.1"),
        ("three_months_up", "since_purchase", "0.2"),
        ("three_months_down", "since_purchase", "-0.15"),
        ("lump_sum_366_days_across_feb_29", "annualised", None),
    ],
)
def test_t8_9_fixtures_choose_basis_without_changing_the_rate(db_session, name, basis, absolute):
    summary = _tile_for_fixture(db_session, name)
    expected_rate = format(xirr(_BY_NAME[name].flows), "f")
    assert summary.lifetime_xirr == summary.current_holdings_xirr == expected_rate
    _assert_tile_display(summary, basis, absolute)


def test_three_month_gain_reads_20_percent_since_purchase(db_session):
    summary = _tile_for_fixture(db_session, "three_months_up")
    assert Decimal(summary.current_holdings_xirr) > Decimal("1.09")
    _assert_tile_display(summary, "since_purchase", "0.2")


def test_exactly_365_days_is_annualised(db_session):
    summary = _tile_for_fixture(db_session, "lump_sum_365_days")
    assert Decimal(summary.current_holdings_xirr) == pytest.approx(Decimal("0.25"), abs=Decimal("0.000001"))
    _assert_tile_display(summary, "annualised", None)


def test_net_zero_on_one_day_gives_no_rate(db_session):
    summary = _tile_for_fixture(db_session, "same_day_net_zero")
    assert summary.lifetime_xirr is None
    assert summary.current_holdings_xirr is None
    _assert_tile_display(summary, None, None)


def test_same_day_nonzero_flows_keep_the_legacy_result(db_session):
    summary = _tile_for_fixture(db_session, "same_day_buy_and_sell")
    assert summary.lifetime_xirr == summary.current_holdings_xirr == xirr(_BY_NAME["same_day_buy_and_sell"].flows)
    _assert_tile_display(summary, None, None)


def test_absolute_return_uses_each_tiles_switch_and_withdrawal_flows(db_session):
    today = date.today()
    summary = _disclaimer_scenario(
        db_session, _PHONE, today - timedelta(days=90), "100", "10", [], current_value="1600",
        units_held="130",
        typed_txns=[
            (TransactionType.SWITCH_IN, today - timedelta(days=60), "50", "10", "500"),
            (TransactionType.REDEMPTION, today - timedelta(days=30), "20", "10", "200"),
        ],
    )

    assert summary.lifetime_xirr_basis == summary.current_holdings_xirr_basis == "since_purchase"
    assert summary.lifetime_since_purchase == "0.8"
    assert summary.current_holdings_since_purchase == "0.2"


@pytest.fixture
def offline_fund_prices(monkeypatch):
    monkeypatch.setattr(nav, "_fetch_nav_history", AsyncMock(return_value=[]))
    monkeypatch.setattr(benchmark, "ensure_index_history_fresh", AsyncMock())


def test_every_fund_over_a_year_is_unchanged(db_session, monkeypatch, offline_fund_prices):
    today = date.today()
    purchase = today - timedelta(days=730)
    first = _household(db_session, purchase)
    second = _add_fund(db_session, first, purchase)
    _store_nav(db_session, first, today, Decimal("12.1"))
    _store_nav(db_session, second, today, Decimal("14.4"))
    user_id = _user_id(db_session, first)
    asyncio.run(_recompute_fund_column(db_session, user_id, monkeypatch))

    response = asyncio.run(get_aggregate_holdings(db_session, user_id))

    combined_flows = [(purchase, Decimal("-1000")), (purchase, Decimal("-1000")), (today, Decimal("2650"))]
    expected_tile = format(xirr(combined_flows), "f")
    assert response.lifetime_xirr == response.current_holdings_xirr == expected_tile
    _assert_tile_display(response, "annualised", None)
    rows = {row.scheme_id: row for row in response.consolidated}
    for folio, final_value in ((first, "1210"), (second, "1440")):
        row = rows[str(folio.scheme_id)]
        expected_rate = format(xirr([(purchase, Decimal("-1000")), (today, Decimal(final_value))]), "f")
        assert row.xirr == row.children[0].xirr == expected_rate
        assert row.xirr_basis == row.children[0].xirr_basis == "annualised"
        assert row.since_purchase_return is row.children[0].since_purchase_return is None


@pytest.mark.parametrize(
    ("days", "price", "basis", "absolute"),
    [(90, "12", "since_purchase", "0.2"), (0, "10", None, None)],
)
def test_stored_column_uses_display_metadata_without_changing_its_window(
    db_session, monkeypatch, offline_fund_prices, days, price, basis, absolute,
):
    today = date.today()
    purchase = today - timedelta(days=days)
    folio = _household(db_session, purchase)
    _store_nav(db_session, folio, today, Decimal(price))
    result = asyncio.run(benchmark.compute_fund_vs_benchmark(db_session, [folio.household_member_id]))
    legacy_rate = xirr([(purchase, Decimal("-1000")), (today, Decimal(price) * 100)])
    expected_window = "0" if legacy_rate == 0 else format(legacy_rate, "f")
    fund = result.funds[0]
    assert next(window for window in fund.windows if window.window == "SI").fund_xirr == expected_window
    # Review finding 5 (20 Nov): the per-fund figure is the display rate, so flows that net to zero on one day
    # give no figure here too (a dash on every screen); the SI window keeps the raw solve for its own callers.
    assert fund.fund_xirr == (None if days == 0 else expected_window)
    assert fund.xirr_basis == basis
    assert fund.since_purchase_return == absolute

    user_id = _user_id(db_session, folio)
    asyncio.run(_recompute_fund_column(db_session, user_id, monkeypatch))
    response = asyncio.run(get_aggregate_holdings(db_session, user_id))
    row = response.consolidated[0]
    assert row.xirr == row.children[0].xirr == (None if days == 0 else fund.fund_xirr)
    assert row.xirr_basis == row.children[0].xirr_basis == basis
    assert row.since_purchase_return == row.children[0].since_purchase_return == absolute
