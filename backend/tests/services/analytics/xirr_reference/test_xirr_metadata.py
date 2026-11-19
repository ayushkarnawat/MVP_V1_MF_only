"""Price dates and stored XIRR after an intraday NAV retry."""

import asyncio
from datetime import date, timedelta
from decimal import Decimal
from unittest.mock import AsyncMock

import pytest

from app.models.analytics import AnalyticsRecomputeStatus
from app.models.folio import Folio
from app.models.reference import Scheme
from app.services.analytics import benchmark, recompute
from app.services.analytics.schemas import FundBenchmarkRow
from app.services.dashboard import nav
from app.services.dashboard.aggregate import get_aggregate_holdings
from app.services.dashboard.held_nav_refresh import HeldNavResult
from scripts.jobs import refresh_nav_daily as job
from services.dashboard.test_xirr import _disclaimer_scenario

from .test_xirr_prices import _assert_rate, _household, _recompute_fund_column, _store_nav, _user_id


@pytest.fixture(autouse=True)
def offline_prices(monkeypatch):
    monkeypatch.setattr(nav, "_fetch_nav_history", AsyncMock(return_value=[]))
    monkeypatch.setattr(benchmark, "ensure_index_history_fresh", AsyncMock())
    monkeypatch.setattr(job, "fetch_amfi_rows", AsyncMock(return_value=[]))
    monkeypatch.setattr(job, "refresh_peers", AsyncMock())
    section = next(section for section in recompute._SECTIONS if section.name == "benchmark_funds")
    monkeypatch.setattr(recompute, "_SECTIONS", [section])


def _filled_result(monkeypatch, scheme_id, today):
    result = HeldNavResult(held=1, behind=1, filled_amfi=1, filled_mfapi=0,
                           still_behind=0, amfi_newest=today)
    result.filled_scheme_ids = [scheme_id]
    monkeypatch.setattr(job, "refresh_held_navs", AsyncMock(return_value=result))
    return result


def test_held_only_run_recomputes_the_households_that_hold_a_filled_fund(db_session, monkeypatch, capsys):
    today = date.today()
    folio = _household(db_session, today - timedelta(days=365))
    user_id = _user_id(db_session, folio)
    phone = "+910000000004"
    _disclaimer_scenario(db_session, phone, today - timedelta(days=365), "100", "10", [], current_value="1000")
    other_folio = db_session.query(Folio).join(Scheme).filter(Scheme.amfi_code == f"XIRR-{phone[-6:]}").one()
    _store_nav(db_session, folio, today - timedelta(days=1), Decimal("11"))
    asyncio.run(_recompute_fund_column(db_session, user_id, monkeypatch))
    _store_nav(db_session, folio, today, Decimal("12"))
    _filled_result(monkeypatch, folio.scheme_id, today)

    asyncio.run(job.main_async(db_session, held_only=True))

    response = asyncio.run(get_aggregate_holdings(db_session, user_id))
    _assert_rate(response.current_holdings_xirr, Decimal("0.20"), "tile")
    _assert_rate(response.consolidated[0].xirr, Decimal("0.20"), "stored column")
    assert db_session.get(AnalyticsRecomputeStatus, _user_id(db_session, other_folio)) is None
    assert "NAV_RECOMPUTE households=1 ok=1" in capsys.readouterr().out.splitlines()


def test_full_run_does_not_recompute(db_session, monkeypatch, capsys):
    today = date.today()
    folio = _household(db_session, today - timedelta(days=365))
    _filled_result(monkeypatch, folio.scheme_id, today)

    asyncio.run(job.main_async(db_session))

    assert db_session.get(AnalyticsRecomputeStatus, _user_id(db_session, folio)) is None
    assert "NAV_RECOMPUTE" not in capsys.readouterr().out


def test_recompute_failure_does_not_change_exit_code_or_summary(db_session, monkeypatch, capsys, caplog):
    today = date.today()
    folio = _household(db_session, today - timedelta(days=365))
    _filled_result(monkeypatch, folio.scheme_id, today)
    monkeypatch.setattr(job, "today_ist", lambda: today)
    monkeypatch.setattr(recompute, "recompute_household_analytics", AsyncMock(side_effect=RuntimeError("synthetic failure")))

    outcome = asyncio.run(job.main_async(db_session, held_only=True))

    stamp = outcome.summary.split()[1]
    assert outcome.summary == (
        f"NAV_SUMMARY {stamp} mode=held-only held=1 behind=1 filled_amfi=1 filled_mfapi=0 "
        f"still_behind=0 missing_from_amfi=0 very_stale=0 amfi_newest={today.isoformat()}"
    )
    assert job.exit_code(outcome, alert_if_behind=True) == 0
    assert "synthetic failure" in caplog.text
    assert capsys.readouterr().out.splitlines() == [outcome.summary, "NAV_RECOMPUTE households=1 ok=0"]


def test_tile_and_column_carry_the_same_price_date(db_session, monkeypatch):
    price_date = date.today() - timedelta(days=2)
    folio = _household(db_session, price_date - timedelta(days=365))
    user_id = _user_id(db_session, folio)
    _store_nav(db_session, folio, price_date, Decimal("11"))
    asyncio.run(_recompute_fund_column(db_session, user_id, monkeypatch))

    response = asyncio.run(get_aggregate_holdings(db_session, user_id))

    assert response.xirr_as_of == price_date.isoformat()
    assert response.consolidated[0].xirr_as_of == price_date.isoformat()
    assert response.consolidated[0].children[0].xirr_as_of == price_date.isoformat()


def test_old_stored_row_without_the_new_field_still_loads():
    row = FundBenchmarkRow.model_validate({
        "scheme_id": "5293b6a4-8f12-4eb6-a4d9-ac12ddb5806c",
        "scheme_name": "Synthetic Fund",
        "fund_xirr": "0.100000",
        "benchmark_xirr": None,
    })

    assert row.fund_xirr == "0.100000"
    assert row.xirr_as_of is None
    assert row.xirr_basis is None
    assert row.since_purchase_return is None
