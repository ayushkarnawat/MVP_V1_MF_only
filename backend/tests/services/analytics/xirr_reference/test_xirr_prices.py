"""Synthetic checks for the NAVs and terminal dates used by the two XIRR displays."""

import asyncio
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from unittest.mock import AsyncMock, Mock

import pytest

from app.models.enums import PlanType, TransactionOrigin, TransactionType
from app.models.folio import Folio
from app.models.reference import NavHistory, Scheme
from app.models.transaction import Transaction
from app.models.user import HouseholdMember
from app.services.analytics import benchmark, recompute
from app.services.dashboard import nav, xirr as dashboard_xirr
from app.services.dashboard.aggregate import get_aggregate_holdings
from app.services.dashboard.holdings import compute_holdings, invalidate_holdings_cache
from services.dashboard.test_xirr import _disclaimer_scenario

from .fixtures import FIXTURES


_UNITS = Decimal("100")
_PURCHASE_NAV = Decimal("10")
_RATE_TOLERANCE = Decimal("0.000001")
_FRIDAY = date(2026, 11, 13)
_IST = timezone(timedelta(hours=5, minutes=30))


@pytest.fixture(autouse=True)
def _offline_prices(monkeypatch):
    # NAVs come from the synthetic database and this test needs no index levels.
    monkeypatch.setattr(nav, "_fetch_nav_history", AsyncMock(return_value=[]))
    monkeypatch.setattr(benchmark, "ensure_index_history_fresh", AsyncMock())


def _household(db, purchase_date):
    # Reuse the synthetic household and opening lot. The helper's preview rate
    # is discarded. All test prices are loaded by the real holdings service.
    phone = "+910000000003"
    _disclaimer_scenario(db, phone, purchase_date, str(_UNITS), str(_PURCHASE_NAV), [], current_value="1000")
    return db.query(Folio).join(Scheme).filter(Scheme.amfi_code == f"XIRR-{phone[-6:]}").one()


def _add_fund(db, first_folio, purchase_date):
    scheme = Scheme(amfi_code="XR3-SECOND", name="Synthetic Second Fund", amc_name="Synthetic AMC", sebi_category="Equity")
    db.add(scheme)
    db.flush()
    folio = Folio(household_member_id=first_folio.household_member_id, scheme_id=scheme.id,
                  folio_number="XR3-2", plan_type=PlanType.DIRECT)
    db.add(folio)
    db.flush()
    import_id = db.query(Transaction.import_id).filter(Transaction.folio_id == first_folio.id).scalar()
    db.add(Transaction(folio_id=folio.id, import_id=import_id, type=TransactionType.PURCHASE,
                       origin=TransactionOrigin.CAS_ROW, date=purchase_date,
                       units=_UNITS, nav=_PURCHASE_NAV, amount=_UNITS * _PURCHASE_NAV))
    db.commit()
    return folio


def _store_nav(db, folio, price_date, price):
    db.add(NavHistory(scheme_id=folio.scheme_id, date=price_date, nav=price))
    db.commit()
    invalidate_holdings_cache(folio.household_member_id)


def _user_id(db, folio):
    return db.get(HouseholdMember, folio.household_member_id).user_id


def _assert_rate(actual, expected, label):
    assert actual is not None, f"{label} has no XIRR; expected {expected}"
    assert Decimal(actual) == pytest.approx(expected, abs=_RATE_TOLERANCE), (
        f"{label} returned {actual}; expected {expected}"
    )


async def _recompute_fund_column(db, user_id, monkeypatch):
    # Keep the real section computation and persistence while excluding the
    # unrelated analytics sections from this synthetic run.
    section = next(section for section in recompute._SECTIONS if section.name == "benchmark_funds")
    with monkeypatch.context() as scope:
        scope.setattr(recompute, "_SECTIONS", [section])
        await recompute.recompute_household_analytics(db, user_id)


def test_fund_without_nav_is_not_silently_dropped(db_session):
    today = date.today()
    purchase_date = today - timedelta(days=365)
    priced = _household(db_session, purchase_date)
    unpriced = _add_fund(db_session, priced, purchase_date)
    _store_nav(db_session, priced, today, Decimal("11"))

    response = asyncio.run(get_aggregate_holdings(db_session, _user_id(db_session, priced)))
    holdings = {row.scheme_id: row for row in response.holdings}
    assert holdings[str(unpriced.scheme_id)].nav_unavailable
    assert holdings[str(unpriced.scheme_id)].current_value is None

    # With a value of 1200 for the second fund: (1100 + 1200) / 2000 - 1 = 15%.
    # If that fund is excluded entirely: 1100 / 1000 - 1 = 10%.
    # Dropping only its value yields 1100 / 2000 - 1 = -45%.
    valued_rate = Decimal("0.15")
    excluded_rate = Decimal("0.10")
    for label, rate in (("lifetime", response.lifetime_xirr), ("current holdings", response.current_holdings_xirr)):
        assert rate is not None, f"{label} has no XIRR"
        actual = Decimal(rate)
        assert min(abs(actual - valued_rate), abs(actual - excluded_rate)) <= _RATE_TOLERANCE, (
            f"{label} XIRR {actual}; expected {valued_rate} with both funds valued "
            f"or {excluded_rate} with the unpriced fund's flows excluded"
        )


def test_per_fund_job_with_no_nav_holding_does_not_raise(db_session):
    today = date.today()
    purchase_date = today - timedelta(days=365)
    priced = _household(db_session, purchase_date)
    unpriced = _add_fund(db_session, priced, purchase_date)
    _store_nav(db_session, priced, today, Decimal("11"))

    result = asyncio.run(benchmark.compute_fund_vs_benchmark(db_session, [priced.household_member_id]))

    rates = {row.scheme_id: row.fund_xirr for row in result.funds}
    _assert_rate(rates[str(priced.scheme_id)], Decimal("0.10"), "priced fund")
    assert rates.get(str(unpriced.scheme_id)) is None


@pytest.mark.parametrize(
    "server_time",
    [
        pytest.param(datetime(2026, 11, 15, 12, tzinfo=timezone.utc), id="sunday-utc"),
        pytest.param(datetime(2026, 11, 17, 0, 30, tzinfo=_IST), id="0030-ist-previous-day-in-utc"),
    ],
)
def test_final_flow_is_dated_with_the_price_date_not_the_server_clock(db_session, monkeypatch, server_time):
    reference = next(fixture for fixture in FIXTURES if fixture.name == "lump_sum_365_days")
    start, end = reference.flows[0][0], reference.flows[-1][0]
    folio = _household(db_session, _FRIDAY - (end - start))
    terminal_value = reference.flows[-1][1]
    _store_nav(db_session, folio, _FRIDAY, terminal_value / _UNITS)
    member_ids = [folio.household_member_id]
    holdings = asyncio.run(compute_holdings(db_session, member_ids))
    assert holdings[0].current_nav_date == _FRIDAY

    class ServerDate(date):
        @classmethod
        def today(cls):
            return server_time.astimezone(timezone.utc).date()

    solve = Mock(wraps=dashboard_xirr.xirr)
    with monkeypatch.context() as scope:
        scope.setattr(dashboard_xirr, "date", ServerDate)
        scope.setattr(dashboard_xirr, "xirr", solve)
        summary = dashboard_xirr.calculate_dashboard_xirr(db_session, member_ids, holdings)

    terminal_flows = [call.args[0][-1] for call in solve.call_args_list]
    assert terminal_flows and all(flow == (_FRIDAY, terminal_value) for flow in terminal_flows), (
        f"terminal flows {terminal_flows}; expected {(_FRIDAY, terminal_value)}; "
        f"XIRR {summary.current_holdings_xirr}, expected {reference.expected}"
    )
    _assert_rate(summary.current_holdings_xirr, reference.expected, "Friday-priced tile")


@pytest.mark.xfail(strict=True, reason='XR-3 finding F3/F8 (FX-8d): after a new price the tile moves to 20% while the stored column stays at 10% until the next recompute.')
def test_tile_and_stored_column_agree_for_the_same_household_and_day(db_session, monkeypatch):
    today = date.today()
    folio = _household(db_session, today - timedelta(days=365))
    user_id = _user_id(db_session, folio)
    _store_nav(db_session, folio, today - timedelta(days=1), Decimal("11"))
    asyncio.run(_recompute_fund_column(db_session, user_id, monkeypatch))

    before = asyncio.run(get_aggregate_holdings(db_session, user_id))
    # One fund held by one member makes the whole tile comparable to the column.
    _assert_rate(before.current_holdings_xirr, Decimal("0.10"), "tile before NAV publication")
    _assert_rate(before.consolidated[0].xirr, Decimal("0.10"), "stored column before NAV publication")

    _store_nav(db_session, folio, today, Decimal("12"))
    after = asyncio.run(get_aggregate_holdings(db_session, user_id))
    assert after.consolidated[0].current_nav_date == today
    # Both should use 1200 / 1000 - 1 after today's NAV is available.
    updated_rate = Decimal("0.20")
    _assert_rate(after.current_holdings_xirr, updated_rate, "live tile after NAV publication")
    _assert_rate(after.consolidated[0].xirr, updated_rate, "stored column after NAV publication")


def test_same_household_morning_and_evening(db_session, monkeypatch):
    today = date.today()
    purchase_date = today - timedelta(days=365)
    steady = _household(db_session, purchase_date)
    late = _add_fund(db_session, steady, purchase_date)
    user_id = _user_id(db_session, steady)
    _store_nav(db_session, steady, today, Decimal("11"))
    _store_nav(db_session, late, today - timedelta(days=1), Decimal("11"))
    asyncio.run(_recompute_fund_column(db_session, user_id, monkeypatch))
    morning = asyncio.run(get_aggregate_holdings(db_session, user_id))

    _store_nav(db_session, late, today, Decimal("13"))
    evening = asyncio.run(get_aggregate_holdings(db_session, user_id))

    # The late publisher moves the total from 2200 to 2400 on 2000 invested.
    _assert_rate(morning.current_holdings_xirr, Decimal("0.10"), "morning tile")
    _assert_rate(evening.current_holdings_xirr, Decimal("0.20"), "evening tile")
    morning_rows = {row.scheme_id: row for row in morning.consolidated}
    evening_rows = {row.scheme_id: row for row in evening.consolidated}
    late_id = str(late.scheme_id)
    assert evening_rows[late_id].current_nav_date == today
    # FX-8c (owner-approved 19 Nov): the late publisher's own column now ends on its own price date (yesterday),
    # so its 10% gain runs over 364 days, not 365: (1.10) ** (365 / 364) - 1 = 0.100288. The column stays at
    # that stored value after the evening price until the recompute (the stale column this test documents).
    late_morning_rate = Decimal("1.10") ** (Decimal(365) / Decimal(364)) - Decimal(1)
    _assert_rate(morning_rows[late_id].xirr, late_morning_rate, "late publisher's morning column")
    _assert_rate(evening_rows[late_id].xirr, late_morning_rate, "late publisher's evening column before recompute")
