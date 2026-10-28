from __future__ import annotations

import asyncio
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.models.enums import SchemePlanType
from app.services.fund_page.schemas import Unavailable
from app.services.fund_page.scope import ScopeContext
from tests.services.fund_page.factories import TODAY, add_scheme, add_user_household, make_session


def _gather(monkeypatch, *, fund_5y, category_5y, blended=Decimal("0.31")):
    from app.services.fund_page.insights import engine

    db = make_session()
    household = add_user_household(db)
    scheme = add_scheme(db, "five-y", "Equity Scheme - Flexi Cap Fund", SchemePlanType.DIRECT, "FY")
    ctx = ScopeContext([household.asha_id], str(household.asha_id), False)
    unavailable = Unavailable(reason="x")
    monkeypatch.setattr(engine, "build_composition", lambda *a, **k: unavailable)
    monkeypatch.setattr(engine, "build_manager", lambda *a, **k: unavailable)
    monkeypatch.setattr(engine, "build_score", AsyncMock(return_value=SimpleNamespace(
        scheme_return=str(blended), category_avg_return="0.20")))
    monkeypatch.setattr(engine, "category_returns", AsyncMock(return_value=SimpleNamespace(
        category={"5Y": category_5y})))
    monkeypatch.setattr(engine, "calendar_year_returns", AsyncMock(return_value=[]))
    monkeypatch.setattr(engine, "risk_return_scatter", AsyncMock(return_value=unavailable))
    monkeypatch.setattr(engine, "get_category_peers", AsyncMock(return_value=SimpleNamespace(schemes=[])))
    monkeypatch.setattr(engine, "_category_ter_context", AsyncMock(return_value=({}, None)))
    monkeypatch.setattr(engine, "_latest_ter_for_scheme", lambda *a: None)
    monkeypatch.setattr(engine, "overlap_pairs_from_stored", lambda *a: None)
    monkeypatch.setattr(engine, "inception_returns", lambda *a, **k: SimpleNamespace(
        rows={"fund": {"5Y": fund_5y}}), raising=False)
    return asyncio.run(engine.gather_inputs(db, scheme, ctx, household.user_id, TODAY))


def test_return_5y_is_the_real_five_year_figure_not_the_blended_score_return(monkeypatch):
    inputs = _gather(monkeypatch, fund_5y="14.5000", category_5y="12.0000")
    assert inputs.return_5y == Decimal("14.5000")
    assert inputs.category_return_5y == Decimal("12.0000")
    assert inputs.return_3y == Decimal("31.00")  # unchanged blended figure


def test_five_year_rule_inputs_none_when_either_side_missing(monkeypatch):
    missing_cat = _gather(monkeypatch, fund_5y="14.5000", category_5y=None)
    assert missing_cat.category_return_5y is None
    missing_fund = _gather(monkeypatch, fund_5y=None, category_5y="12.0000")
    assert missing_fund.return_5y is None
