from __future__ import annotations

import asyncio
from datetime import date, datetime, timezone
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.models.enums import SchemePlanType
from app.services.fund_page.scope import ScopeContext
from tests.services.fund_page.factories import (
    TODAY,
    add_scheme,
    add_user_household,
    make_session,
    put_section,
)


@pytest.fixture
def db():
    session = make_session()
    try:
        yield session
    finally:
        session.close()


def _fact(rule_id, list_name, priority):
    from app.services.fund_page.insights.rules import Fact

    return Fact(rule_id, list_name, "pos", f"{rule_id} 1", [("Value", "1")], priority)


def test_top_three_prefers_performance_overlap_management_then_next_priority():
    from app.services.fund_page.insights.engine import select_top_three

    facts = [
        _fact("expense_ratio_vs_category", "key", 40),
        _fact("manager_tenure", "strength", 30),
        _fact("overlap", "consideration", 20),
        _fact("peer_beat_years", "strength", 11),
        _fact("long_term_vs_category", "strength", 10),
    ]
    assert [fact.id for fact in select_top_three(facts)] == [
        "long_term_vs_category", "overlap", "manager_tenure",
    ]

    fallback = [fact for fact in facts if fact.id not in {"overlap", "manager_tenure"}]
    assert [fact.id for fact in select_top_three(fallback)] == [
        "long_term_vs_category", "peer_beat_years", "expense_ratio_vs_category",
    ]


def _patch_inputs(monkeypatch, *, facts=None):
    from app.services.fund_page.insights import engine

    monkeypatch.setattr(engine, "gather_inputs", AsyncMock(return_value=SimpleNamespace()))
    monkeypatch.setattr(engine, "evaluate_rules", lambda _inputs: facts or [])


def test_overlap_rule_uses_stored_overlap_section_for_scope(db):
    from app.services.fund_page.insights.engine import overlap_pairs_from_stored

    household = add_user_household(db)
    scheme = add_scheme(db, "insight-overlap", "Equity Scheme - Flexi Cap Fund", SchemePlanType.DIRECT, "IO")
    other = add_scheme(db, "insight-other", "Equity Scheme - Flexi Cap Fund", SchemePlanType.DIRECT, "IX")
    now = datetime(2026, 10, 23, 13, 30, tzinfo=timezone.utc)
    put_section(db, household.user_id, "combined", "overlap", {"overlap": {
        "pairs_above_low": [{
            "fund_a": {"scheme_id": str(scheme.id), "scheme_name": scheme.name},
            "fund_b": {"scheme_id": str(other.id), "scheme_name": other.name},
            "overlap_pct": "51.0000",
        }],
    }}, now)
    ctx = ScopeContext([household.asha_id, household.dev_id], "combined", True)

    assert overlap_pairs_from_stored(db, scheme, ctx, household.user_id) == [
        (other.name, Decimal("51.0000"))
    ]


def test_stale_overlap_section_is_ignored(db):
    from app.services.fund_page.insights.engine import overlap_pairs_from_stored
    from tests.services.fund_page.factories import add_import

    household = add_user_household(db)
    scheme = add_scheme(db, "insight-stale", "Equity Scheme - Flexi Cap Fund", SchemePlanType.DIRECT, "IS")
    put_section(db, household.user_id, "combined", "overlap", {"overlap": {
        "pairs_above_low": [],
    }}, datetime(2026, 1, 1, tzinfo=timezone.utc))
    add_import(db, household.asha_id, confirmed_at=datetime(2026, 2, 1, tzinfo=timezone.utc))
    ctx = ScopeContext([household.asha_id, household.dev_id], "combined", True)

    assert overlap_pairs_from_stored(db, scheme, ctx, household.user_id) is None


def test_member_without_fund_skips_overlap_and_personal_facts(db):
    from app.services.fund_page.insights.engine import overlap_pairs_from_stored

    household = add_user_household(db)
    scheme = add_scheme(db, "insight-member", "Equity Scheme - Flexi Cap Fund", SchemePlanType.DIRECT, "IM")
    put_section(db, household.user_id, str(household.asha_id), "overlap", {
        "pairs_above_low": [],
    }, datetime(2026, 10, 23, tzinfo=timezone.utc), household_member_id=household.asha_id)
    ctx = ScopeContext([household.dev_id], str(household.dev_id), False)

    assert overlap_pairs_from_stored(db, scheme, ctx, household.user_id) is None


def test_no_facts_returns_empty_lists_not_error(db, monkeypatch):
    from app.services.fund_page.insights.engine import build_insights

    household = add_user_household(db)
    scheme = add_scheme(db, "insight-empty", "Equity Scheme - Flexi Cap Fund", SchemePlanType.DIRECT, "IE")
    ctx = ScopeContext([household.asha_id], str(household.asha_id), False)
    _patch_inputs(monkeypatch)

    result = asyncio.run(build_insights(db, scheme, ctx, household.user_id, TODAY))

    assert result.key == []
    assert result.strengths == []
    assert result.considerations == []
    assert result.top_three == []


def test_engine_issues_no_query_beyond_the_listed_inputs(db, monkeypatch):
    from app.services.fund_page.insights.engine import build_insights

    household = add_user_household(db)
    scheme = add_scheme(db, "insight-query", "Equity Scheme - Flexi Cap Fund", SchemePlanType.DIRECT, "IQ")
    ctx = ScopeContext([household.asha_id], str(household.asha_id), False)
    _patch_inputs(monkeypatch, facts=[_fact("manager_tenure", "strength", 30)])

    before = db.get_bind().dialect.name
    result = asyncio.run(build_insights(db, scheme, ctx, household.user_id, TODAY))

    assert before == "sqlite"
    assert [fact.id for fact in result.top_three] == ["manager_tenure"]
