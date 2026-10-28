"""T3 design decision: `build_summary` must call `compute_holdings` exactly
once per request, over the whole household filtered by this scheme, and
derive both the ctx-scoped rows and `held_by_other_members` from that one
result -- never a second call to get the complement."""
from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock

import pytest

from app.services.dashboard import holdings as holdings_module
from app.services.fund_page import summary as summary_module
from app.services.fund_page.scope import ScopeContext
from app.services.fund_page.summary import build_summary
from tests.services.fund_page.factories import TODAY, add_user_household, fx_hold, make_session


@pytest.fixture(autouse=True)
def _no_network(monkeypatch):
    monkeypatch.setattr(summary_module, "warm_nav_history", AsyncMock(return_value=None))


@pytest.fixture(autouse=True)
def _isolated_holdings_cache():
    holdings_module._holdings_cache.clear()
    holdings_module._holdings_cache_generation.clear()
    yield
    holdings_module._holdings_cache.clear()
    holdings_module._holdings_cache_generation.clear()


def test_build_summary_calls_compute_holdings_exactly_once(monkeypatch):
    db = make_session()
    household = add_user_household(db)
    hold = fx_hold(db, household)
    real_compute_holdings = summary_module.compute_holdings
    calls: list[tuple[tuple, dict]] = []

    async def spy(*args, **kwargs):
        calls.append((args, kwargs))
        return await real_compute_holdings(*args, **kwargs)

    monkeypatch.setattr(summary_module, "compute_holdings", spy)
    ctx = ScopeContext([household.asha_id], str(household.asha_id), False)

    asyncio.run(build_summary(db, hold.scheme, ctx, household.user_id, TODAY))

    assert len(calls) == 1
    args, kwargs = calls[0]
    assert set(args[1]) == {household.asha_id, household.dev_id}
    assert kwargs["scheme_ids"] == frozenset({hold.scheme.id})
