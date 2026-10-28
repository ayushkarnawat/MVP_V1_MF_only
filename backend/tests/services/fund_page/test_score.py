from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from unittest.mock import AsyncMock

import pytest

from app.models.enums import SchemePlanType
from app.services.analytics.schemas import FundScoreRow
from app.services.fund_page.scope import ScopeContext
from tests.services.fund_page.factories import (
    TODAY,
    add_import,
    add_scheme,
    add_user_household,
    make_session,
    put_section,
)


NOW = datetime(2026, 10, 23, 13, 30, tzinfo=timezone.utc)


@pytest.fixture
def db():
    session = make_session()
    try:
        yield session
    finally:
        session.close()


def _row(scheme, **overrides):
    values = dict(
        scheme_id=str(scheme.id), scheme_name=scheme.name,
        category_unavailable=False, insufficient_history=False, thin_category=False,
        risk_adjusted_tier=4, cost_adjustment="0.25", final_score="72.00",
        return_percentile="71.00", risk_percentile="64.00",
        consistency_hit_rate="0.80", scheme_return="0.19",
        category_avg_return="0.16", downside_deviation="0.021",
        category_avg_downside_deviation="0.025", consistency_hits=8,
        consistency_total_windows=10,
    )
    values.update(overrides)
    return FundScoreRow(**values)


def _setup(db):
    household = add_user_household(db)
    scheme = add_scheme(
        db, "score", "Equity Scheme - Flexi Cap Fund", SchemePlanType.DIRECT, "SCORE",
    )
    ctx = ScopeContext([household.asha_id, household.dev_id], "combined", True)
    return household, scheme, ctx


def test_score_uses_stored_section_when_present(db, monkeypatch):
    from app.services.fund_page.score import build_score

    household, scheme, ctx = _setup(db)
    row = _row(scheme)
    put_section(
        db, household.user_id, "combined", "score",
        {"score": {"funds": [row.model_dump(mode="json")]}}, NOW,
    )
    fail = AsyncMock(side_effect=AssertionError("stored score must avoid recompute"))
    monkeypatch.setattr("app.services.fund_page.score.compute_fund_score", fail)

    result = asyncio.run(build_score(db, scheme, ctx, household.user_id, TODAY, NOW))

    assert result.source == "stored"
    assert result.computed_at == NOW
    assert result.final_score == "72.00"
    fail.assert_not_awaited()


@pytest.mark.parametrize("stale", [False, True])
def test_score_computes_when_section_missing_or_stale(db, monkeypatch, stale):
    from app.services.fund_page.score import build_score

    household, scheme, ctx = _setup(db)
    if stale:
        put_section(
            db, household.user_id, "combined", "score",
            {"score": {"funds": [_row(scheme, final_score="1.00").model_dump(mode="json")]}},
            datetime(2026, 1, 1, tzinfo=timezone.utc),
        )
        add_import(
            db, household.asha_id,
            confirmed_at=datetime(2026, 2, 1, tzinfo=timezone.utc),
        )
    computed = _row(scheme, final_score="73.00")
    scorer = AsyncMock(return_value=computed)
    monkeypatch.setattr("app.services.fund_page.score.compute_fund_score", scorer)

    result = asyncio.run(build_score(db, scheme, ctx, household.user_id, TODAY, NOW))

    assert result.source == "computed"
    assert result.computed_at == NOW
    assert result.final_score == "73.00"
    scorer.assert_awaited_once_with(db, scheme)


def test_score_thin_category_and_insufficient_history_pass_through(db, monkeypatch):
    from app.services.fund_page.score import build_score

    household, scheme, ctx = _setup(db)
    scorer = AsyncMock(return_value=_row(
        scheme, thin_category=True, insufficient_history=True,
        risk_adjusted_tier=None, final_score=None,
    ))
    monkeypatch.setattr("app.services.fund_page.score.compute_fund_score", scorer)

    result = asyncio.run(build_score(db, scheme, ctx, household.user_id, TODAY, NOW))

    assert result.thin_category is True
    assert result.insufficient_history is True
    assert result.final_score is None


def test_score_equals_analytics_endpoint_row(db, monkeypatch):
    from app.api.analytics import get_fund_score
    from app.services.fund_page.score import build_score

    household, scheme, ctx = _setup(db)
    row = _row(scheme)
    service_scorer = AsyncMock(return_value=row)
    endpoint_scorer = AsyncMock(return_value=row)
    monkeypatch.setattr("app.services.fund_page.score.compute_fund_score", service_scorer)
    monkeypatch.setattr("app.api.analytics.compute_fund_score", endpoint_scorer)

    service_result = asyncio.run(
        build_score(db, scheme, ctx, household.user_id, TODAY, NOW)
    )
    endpoint_result = asyncio.run(get_fund_score(scheme.id, user=None, db=db))

    service_row = service_result.model_dump(exclude={"status", "source", "computed_at"})
    assert service_row == endpoint_result.model_dump()
