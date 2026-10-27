"""T3: `build_summary` and `ensure_recent_nav`.

Every test patches `summary.warm_nav_history` to a no-op `AsyncMock` so no
test ever attempts live HTTP, independent of `tests.offline_http` -- the
same reasoning as `pinned_xirr_clock` in `scripts/write_portfolio_fixtures.py`,
just applied at the call site instead of pinning `date.today()`, since
`ensure_recent_nav`'s own freshness check (`_fresh_scheme_ids`) is a pure DB
read with no network step to pin."""
from __future__ import annotations

import asyncio
import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from unittest.mock import AsyncMock, Mock

import pytest
from fastapi import HTTPException

from app.models.enums import Relationship, SchemePlanType
from app.models.user import HouseholdMember
from app.services.dashboard import holdings as holdings_module
from app.services.dashboard import nav as nav_module
from app.services.fund_page import summary as summary_module
from app.services.fund_page.scope import ScopeContext
from app.services.fund_page.summary import build_summary, ensure_recent_nav
from tests.services.fund_page.factories import (
    TODAY,
    add_folio,
    add_purchase,
    add_scheme,
    add_user_household,
    fx_hold,
    make_session,
    put_section,
    uid,
)


@pytest.fixture(autouse=True)
def _no_network(monkeypatch):
    monkeypatch.setattr(summary_module, "warm_nav_history", AsyncMock(return_value=None))


@pytest.fixture(autouse=True)
def _isolated_holdings_cache():
    # Fixture household-member ids are deterministic (`uid()`, no `random`),
    # so the module-global holdings cache would otherwise leak a cached
    # entry from one test's in-memory DB into the next test's, which uses
    # the same member ids on a different, unrelated DB session.
    holdings_module._holdings_cache.clear()
    holdings_module._holdings_cache_generation.clear()
    yield
    holdings_module._holdings_cache.clear()
    holdings_module._holdings_cache_generation.clear()


def _combined_ctx(household) -> ScopeContext:
    return ScopeContext([household.asha_id, household.dev_id], "combined", True)


def _member_ctx(member_id: uuid.UUID) -> ScopeContext:
    return ScopeContext([member_id], str(member_id), False)


def test_combined_scope_tiles_and_details_sum_both_members():
    db = make_session()
    household = add_user_household(db)
    hold = fx_hold(db, household)

    response = asyncio.run(build_summary(db, hold.scheme, _combined_ctx(household), household.user_id, TODAY))

    assert response.held is True
    assert response.held_by_other_members == []
    assert response.details.units == "150.000"
    assert response.tiles.invested == "1600.00"
    assert response.tiles.current_value == "2250.00"
    assert response.tiles.total_gain == "650.00"
    assert len(response.details.folios) == 2
    assert response.nav_as_of == TODAY
    assert response.nav_stale is False
    assert response.has_history is True


def test_member_scope_only_includes_that_members_holdings():
    db = make_session()
    household = add_user_household(db)
    hold = fx_hold(db, household)

    response = asyncio.run(
        build_summary(db, hold.scheme, _member_ctx(household.asha_id), household.user_id, TODAY)
    )

    assert response.details.units == "100.000"
    assert response.tiles.invested == "1000.00"
    assert response.tiles.current_value == "1500.00"
    assert len(response.details.folios) == 1
    assert response.details.folios[0].member_name == "ASHA RAO"
    assert [m.name for m in response.held_by_other_members] == ["Dev Rao"]


def test_not_held_lists_other_household_holders():
    db = make_session()
    household = add_user_household(db)
    hold = fx_hold(db, household)
    third = HouseholdMember(
        id=uid("third"), user_id=household.user_id, name="Third Member",
        relationship=Relationship.CHILD, created_at=datetime(2026, 1, 4, tzinfo=timezone.utc),
    )
    db.add(third)
    db.flush()

    response = asyncio.run(build_summary(db, hold.scheme, _member_ctx(third.id), household.user_id, TODAY))

    assert response.held is False
    assert response.tiles.current_value is None
    assert response.details.folios == []
    other_names = {m.name for m in response.held_by_other_members}
    assert other_names == {"ASHA RAO", "Dev Rao"}


def test_scheme_held_by_nobody_in_household_raises_404():
    db = make_session()
    household = add_user_household(db)
    scheme = add_scheme(db, "unheld", "Equity Scheme - Flexi Cap Fund", SchemePlanType.DIRECT, "UNHELD")

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(build_summary(db, scheme, _combined_ctx(household), household.user_id, TODAY))
    assert exc_info.value.status_code == 404


def test_xirr_uses_fresh_stored_benchmark_section_over_computing_it():
    db = make_session()
    household = add_user_household(db)
    hold = fx_hold(db, household)
    put_section(
        db, household.user_id, "combined", "benchmark_funds",
        {"comparison": {"funds": [{"scheme_id": str(hold.scheme.id), "fund_xirr": "0.123456"}]}},
        computed_at=datetime(2026, 10, 23, tzinfo=timezone.utc),
    )

    response = asyncio.run(build_summary(db, hold.scheme, _combined_ctx(household), household.user_id, TODAY))

    assert response.tiles.xirr == "0.123456"
    assert response.details.xirr == "0.123456"


def test_xirr_falls_back_to_computed_when_no_stored_section():
    db = make_session()
    household = add_user_household(db)
    hold = fx_hold(db, household)

    response = asyncio.run(build_summary(db, hold.scheme, _combined_ctx(household), household.user_id, TODAY))

    assert response.tiles.xirr is not None
    assert response.tiles.xirr != "0.123456"


def test_share_of_portfolio_pct_uses_warm_cache_without_recomputing(monkeypatch):
    class _PinnedDate(date):
        @classmethod
        def today(cls):
            return TODAY

    monkeypatch.setattr(holdings_module, "date", _PinnedDate)
    monkeypatch.setattr(nav_module, "date", _PinnedDate)
    db = make_session()
    household = add_user_household(db)
    hold = fx_hold(db, household)
    # Warm today's household-wide cache (no scheme filter) once, up front --
    # `build_summary` must read it via `peek_cached_holdings`, not call
    # `compute_holdings` a second time with no `scheme_ids` to get the total.
    asyncio.run(summary_module.compute_holdings(db, [household.asha_id, household.dev_id]))

    response = asyncio.run(build_summary(db, hold.scheme, _combined_ctx(household), household.user_id, TODAY))

    assert response.tiles.share_of_portfolio_pct == "100.0000"


def test_share_of_portfolio_pct_falls_back_to_stored_allocation_section():
    db = make_session()
    household = add_user_household(db)
    hold = fx_hold(db, household)
    put_section(
        db, household.user_id, "combined", "allocation", {"allocation": {"total_value": "4500.00"}},
        computed_at=datetime(2026, 10, 23, tzinfo=timezone.utc),
    )

    response = asyncio.run(build_summary(db, hold.scheme, _combined_ctx(household), household.user_id, TODAY))

    assert response.tiles.share_of_portfolio_pct == "50.0000"


def test_share_of_portfolio_pct_none_without_cache_or_stored_section():
    db = make_session()
    household = add_user_household(db)
    hold = fx_hold(db, household)

    response = asyncio.run(build_summary(db, hold.scheme, _combined_ctx(household), household.user_id, TODAY))

    assert response.tiles.share_of_portfolio_pct is None


def test_nav_stale_flag_true_past_ten_days():
    db = make_session()
    household = add_user_household(db)
    scheme = add_scheme(db, "stale", "Equity Scheme - Flexi Cap Fund", SchemePlanType.DIRECT, "STALE")
    folio = add_folio(db, scheme, household.asha_id, "F001")
    add_purchase(db, folio, TODAY - timedelta(days=100), Decimal("10"), Decimal("10.00"))
    stale_date = TODAY - timedelta(days=11)
    from app.models.reference import NavHistory
    db.add(NavHistory(scheme_id=scheme.id, date=stale_date, nav=Decimal("11.00")))
    db.flush()

    response = asyncio.run(build_summary(db, scheme, _combined_ctx(household), household.user_id, TODAY))

    assert response.nav_as_of == stale_date
    assert response.nav_stale is True


def test_folio_numbers_are_masked_in_summary():
    db = make_session()
    household = add_user_household(db)
    hold = fx_hold(db, household)

    response = asyncio.run(build_summary(db, hold.scheme, _combined_ctx(household), household.user_id, TODAY))

    masked = {folio.folio_masked for folio in response.details.folios}
    assert masked == {"XXXXX9183", "XXXXX5678"}
    assert all("4400918" not in m and "A1234" not in m for m in masked)


def test_first_and_last_investment_dates():
    db = make_session()
    household = add_user_household(db)
    hold = fx_hold(db, household)

    response = asyncio.run(build_summary(db, hold.scheme, _combined_ctx(household), household.user_id, TODAY))

    assert response.details.first_investment == date(2025, 1, 1)
    assert response.details.last_investment == date(2025, 6, 1)


def test_ensure_recent_nav_noop_for_cas_only_scheme(monkeypatch):
    db = make_session()
    household = add_user_household(db)
    scheme = add_scheme(db, "casonly", "Equity Scheme - Flexi Cap Fund", SchemePlanType.DIRECT, None)
    warm = AsyncMock()
    monkeypatch.setattr(summary_module, "warm_nav_history", warm)

    asyncio.run(ensure_recent_nav(db, scheme, [household.asha_id]))

    warm.assert_not_called()


def test_ensure_recent_nav_skips_invalidation_when_already_fresh(monkeypatch):
    db = make_session()
    household = add_user_household(db)
    scheme = add_scheme(db, "fresh", "Equity Scheme - Flexi Cap Fund", SchemePlanType.DIRECT, "FRESH")
    warm = AsyncMock()
    monkeypatch.setattr(summary_module, "warm_nav_history", warm)
    monkeypatch.setattr(summary_module, "_fresh_scheme_ids", lambda db, ids: {scheme.id})
    invalidate = Mock()
    monkeypatch.setattr(summary_module, "invalidate_holdings_cache", invalidate)

    asyncio.run(ensure_recent_nav(db, scheme, [household.asha_id]))

    warm.assert_called_once()
    invalidate.assert_not_called()


def test_ensure_recent_nav_invalidates_cache_when_stale(monkeypatch):
    db = make_session()
    household = add_user_household(db)
    scheme = add_scheme(db, "stale2", "Equity Scheme - Flexi Cap Fund", SchemePlanType.DIRECT, "STALE2")
    warm = AsyncMock()
    monkeypatch.setattr(summary_module, "warm_nav_history", warm)
    monkeypatch.setattr(summary_module, "_fresh_scheme_ids", lambda db, ids: set())
    invalidate = Mock()
    monkeypatch.setattr(summary_module, "invalidate_holdings_cache", invalidate)

    asyncio.run(ensure_recent_nav(db, scheme, [household.asha_id, household.dev_id]))

    warm.assert_called_once()
    assert invalidate.call_count == 2
    invalidate.assert_any_call(household.asha_id)
    invalidate.assert_any_call(household.dev_id)


def test_ensure_recent_nav_swallows_fetch_failure(monkeypatch):
    db = make_session()
    household = add_user_household(db)
    scheme = add_scheme(db, "fail", "Equity Scheme - Flexi Cap Fund", SchemePlanType.DIRECT, "FAIL")
    monkeypatch.setattr(summary_module, "_fresh_scheme_ids", lambda db, ids: set())
    monkeypatch.setattr(summary_module, "warm_nav_history", AsyncMock(side_effect=RuntimeError("boom")))
    invalidate = Mock()
    monkeypatch.setattr(summary_module, "invalidate_holdings_cache", invalidate)

    asyncio.run(ensure_recent_nav(db, scheme, [household.asha_id]))

    invalidate.assert_called_once_with(household.asha_id)
