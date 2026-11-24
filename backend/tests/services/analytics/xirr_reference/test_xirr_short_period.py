"""FX-8e display metadata on the tile figures and the stored fund column."""

import asyncio
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from unittest.mock import AsyncMock

import pytest

from app.models.enums import TransactionType
from app.models.transaction import Transaction
from app.models.user import HouseholdMember
from app.models.enums import Relationship, TransactionOrigin
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


def _assert_tile_display(summary, basis, since_purchase, caution):
    assert summary.lifetime_xirr_basis == summary.current_holdings_xirr_basis == basis
    assert summary.lifetime_since_purchase == summary.current_holdings_since_purchase == since_purchase
    assert summary.lifetime_xirr_caution == summary.current_holdings_xirr_caution == caution


@pytest.mark.parametrize(
    ("name", "basis", "absolute", "caution"),
    [
        ("one_month", "since_purchase", "0.1", "young"),
        ("three_months_up", "since_purchase", "0.2", "young"),
        ("three_months_down", "since_purchase", "-0.15", "young"),
        ("lump_sum_366_days_across_feb_29", "annualised", "0.25", "single_transaction"),
    ],
)
def test_t8_9_fixtures_choose_basis_without_changing_the_rate(db_session, name, basis, absolute, caution):
    summary = _tile_for_fixture(db_session, name)
    expected_rate = format(xirr(_BY_NAME[name].flows), "f")
    assert summary.lifetime_xirr == summary.current_holdings_xirr == expected_rate
    _assert_tile_display(summary, basis, absolute, caution)


def test_three_month_gain_reads_20_percent_since_purchase(db_session):
    summary = _tile_for_fixture(db_session, "three_months_up")
    assert Decimal(summary.current_holdings_xirr) > Decimal("1.09")
    _assert_tile_display(summary, "since_purchase", "0.2", "young")


def test_exactly_365_days_is_annualised(db_session):
    summary = _tile_for_fixture(db_session, "lump_sum_365_days")
    assert Decimal(summary.current_holdings_xirr) == pytest.approx(Decimal("0.25"), abs=Decimal("0.000001"))
    _assert_tile_display(summary, "annualised", "0.25", "single_transaction")


def test_net_zero_on_one_day_gives_no_rate(db_session):
    summary = _tile_for_fixture(db_session, "same_day_net_zero")
    assert summary.lifetime_xirr is None
    assert summary.current_holdings_xirr is None
    _assert_tile_display(summary, None, None, None)


def test_same_day_nonzero_flows_keep_the_legacy_result(db_session):
    summary = _tile_for_fixture(db_session, "same_day_buy_and_sell")
    assert summary.lifetime_xirr == summary.current_holdings_xirr == xirr(_BY_NAME["same_day_buy_and_sell"].flows)
    _assert_tile_display(summary, None, None, None)


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
    assert response.lifetime_xirr_basis == response.current_holdings_xirr_basis == "annualised"
    assert response.lifetime_since_purchase == response.current_holdings_since_purchase == "0.325"
    rows = {row.scheme_id: row for row in response.consolidated}
    for folio, final_value in ((first, "1210"), (second, "1440")):
        row = rows[str(folio.scheme_id)]
        expected_rate = format(xirr([(purchase, Decimal("-1000")), (today, Decimal(final_value))]), "f")
        assert row.xirr == row.children[0].xirr == expected_rate
        assert row.xirr_basis == row.children[0].xirr_basis == "annualised"
        expected_return = format((Decimal(final_value) / Decimal("1000") - 1).normalize(), "f")
        assert row.since_purchase_return == row.children[0].since_purchase_return == expected_return


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


@pytest.mark.parametrize("days,caution", [(90, "young"), (730, "single_transaction")])
def test_stored_column_carries_since_purchase_and_caution_for_every_fund(db_session, monkeypatch, offline_fund_prices, days, caution):
    today = date.today()
    folio = _household(db_session, today - timedelta(days=days))
    _store_nav(db_session, folio, today, Decimal("12"))
    user_id = _user_id(db_session, folio)
    asyncio.run(_recompute_fund_column(db_session, user_id, monkeypatch))
    from app.models.analytics import AnalyticsSection

    section = db_session.query(AnalyticsSection).filter_by(
        user_id=user_id, section="benchmark_funds", scope_key="combined",
    ).one()
    fund = section.payload["comparison"]["funds"][0]
    assert fund["since_purchase_return"] == "0.2"
    assert fund["xirr_caution"] == caution
    response = asyncio.run(get_aggregate_holdings(db_session, user_id))
    assert response.consolidated[0].xirr_caution == caution
    assert response.consolidated[0].children[0].xirr_caution == caution


def test_a_fund_bought_once_inside_a_mature_household_has_its_own_single_transaction_caution(db_session, monkeypatch, offline_fund_prices):
    today = date.today()
    first = _household(db_session, today - timedelta(days=730))
    second = _add_fund(db_session, first, today - timedelta(days=730))
    original = db_session.query(Transaction).filter_by(folio_id=second.id).one()
    db_session.add(Transaction(
        folio_id=second.id, import_id=original.import_id, type=TransactionType.PURCHASE,
        origin=TransactionOrigin.CAS_ROW, date=today - timedelta(days=400),
        units=Decimal("100"), nav=Decimal("10"), amount=Decimal("1000"),
    ))
    _store_nav(db_session, first, today, Decimal("12"))
    _store_nav(db_session, second, today, Decimal("12"))
    user_id = _user_id(db_session, first)
    asyncio.run(_recompute_fund_column(db_session, user_id, monkeypatch))
    response = asyncio.run(get_aggregate_holdings(db_session, user_id))
    rows = {row.scheme_id: row for row in response.consolidated}
    assert rows[str(first.scheme_id)].xirr_caution == "single_transaction"
    assert rows[str(second.scheme_id)].xirr_caution is None
    assert response.lifetime_xirr_caution is response.current_holdings_xirr_caution is None
    stored = asyncio.run(benchmark.compute_fund_vs_benchmark(db_session, [first.household_member_id]))
    assert {row.scheme_id: row.xirr_caution for row in stored.funds} == {
        str(first.scheme_id): "single_transaction", str(second.scheme_id): None,
    }


def test_consolidated_parent_and_children_each_carry_their_own_caution(db_session, monkeypatch, offline_fund_prices):
    today = date.today()
    first = _household(db_session, today - timedelta(days=730))
    second = _add_fund(db_session, first, today - timedelta(days=90))
    user_id = _user_id(db_session, first)
    member = HouseholdMember(user_id=user_id, name="Synthetic Spouse", relationship=Relationship.SPOUSE,
                             created_at=datetime.now(timezone.utc))
    db_session.add(member)
    db_session.flush()
    second.household_member_id = member.id
    second.scheme_id = first.scheme_id
    _store_nav(db_session, first, today, Decimal("12"))
    asyncio.run(_recompute_fund_column(db_session, user_id, monkeypatch))
    response = asyncio.run(get_aggregate_holdings(db_session, user_id))
    parent = response.consolidated[0]
    assert len(response.consolidated) == 1
    assert parent.xirr_caution is None
    assert {child.household_member_id: child.xirr_caution for child in parent.children} == {
        str(first.household_member_id): "single_transaction", str(member.id): "young",
    }
