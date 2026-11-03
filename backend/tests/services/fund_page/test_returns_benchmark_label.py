from __future__ import annotations

import asyncio
from datetime import date
from decimal import Decimal

import pytest

from app.models.enums import BenchmarkIndex, BenchmarkReturnType, SchemePlanType
from app.models.reference import BenchmarkIndexHistory, NavHistory
from app.services.fund_page.benchmark_select import BenchmarkChoice
from app.services.fund_page.returns import current_returns, inception_returns
from app.services.fund_page.schemas import ReturnsResponse
from app.services.fund_page.scope import ScopeContext
from tests.services.fund_page.factories import TODAY, add_folio, add_purchase, add_scheme, add_user_household


@pytest.fixture()
def returns_case(db_session, monkeypatch):
    household = add_user_household(db_session)
    scheme = add_scheme(
        db_session, "benchmark-label", "Equity Scheme - Large Cap Fund",
        SchemePlanType.DIRECT, "LABEL-TEST",
    )
    folio = add_folio(db_session, scheme, household.asha_id, "LABEL-1")
    start = date(2025, 10, 23)
    add_purchase(db_session, folio, start, Decimal("100"), Decimal("10"))
    for day, nav, index in [(start, "10", "10000"), (TODAY, "11", "11200")]:
        db_session.add(NavHistory(scheme_id=scheme.id, date=day, nav=Decimal(nav)))
        db_session.add(BenchmarkIndexHistory(
            index_name=BenchmarkIndex.NIFTY_50, date=day,
            return_type=BenchmarkReturnType.TRI, value=Decimal(index),
        ))
    db_session.flush()
    monkeypatch.setattr(
        "app.services.fund_page.returns.benchmark_for_scheme",
        lambda *args: BenchmarkChoice("nifty_50", "factsheet", "Declared Nifty 50 TRI", "Existing note"),
    )

    def build(mode):
        if mode == "inception":
            result = inception_returns(db_session, scheme, TODAY)
        else:
            result = asyncio.run(current_returns(
                db_session, scheme, ScopeContext([household.asha_id], str(household.asha_id), False),
                household.user_id, TODAY,
            ))
        assert isinstance(result, ReturnsResponse)
        return result

    return build


def test_inception_response_carries_the_benchmark_label(returns_case):
    assert returns_case("inception").benchmark_label == "Nifty 50"


def test_current_response_carries_the_benchmark_label(returns_case):
    assert returns_case("current").benchmark_label == "Nifty 50"


@pytest.mark.parametrize("mode", ["inception", "current"])
def test_label_is_null_when_there_is_no_benchmark_index(returns_case, monkeypatch, mode):
    monkeypatch.setattr(
        "app.services.fund_page.returns.benchmark_for_scheme",
        lambda *args: BenchmarkChoice(None, "none"),
    )
    result = returns_case(mode)
    assert result.benchmark_label is None
    assert result.benchmark_reason == "no_benchmark"


@pytest.mark.parametrize("mode", ["inception", "current"])
@pytest.mark.parametrize("source", ["factsheet", "closest", "category", "none"])
def test_benchmark_label_and_source_are_preserved_for_each_source(
    returns_case, monkeypatch, mode, source,
):
    index = None if source == "none" else "nifty_50"
    declared = None if source == "none" else "Original declared benchmark"
    monkeypatch.setattr(
        "app.services.fund_page.returns.benchmark_for_scheme",
        lambda *args: BenchmarkChoice(index, source, declared),
    )
    result = returns_case(mode)
    assert result.benchmark_label == (None if source == "none" else "Nifty 50")
    assert result.benchmark_source == source
    assert result.declared_benchmark_name == declared


GOLDEN = {
    "inception": {
        "benchmark_source": "factsheet", "declared_benchmark_name": "Declared Nifty 50 TRI",
        "benchmark_note": "Existing note", "printed_as_of": None, "status": "ready",
        "mode": "inception", "columns": ["1M", "3M", "6M", "1Y", "3Y", "5Y", "since_inception"],
        "rows": {
            "fund": {"1M": "10.0000", "3M": "10.0000", "6M": "10.0000", "1Y": "10.0000",
                     "3Y": None, "5Y": None, "since_inception": "10.0000"},
            "benchmark": {"1M": "12.0000", "3M": "12.0000", "6M": "12.0000", "1Y": "12.0000",
                          "3Y": None, "5Y": None, "since_inception": "12.0000"},
        },
        "benchmark_reason": None,
    },
    "current": {
        "benchmark_source": "factsheet", "declared_benchmark_name": "Declared Nifty 50 TRI",
        "benchmark_note": "Existing note", "printed_as_of": None, "status": "ready",
        "mode": "current", "columns": ["1Y", "3Y", "5Y", "since_first_investment"],
        "rows": {
            "holding_xirr": {"1Y": "10.0000", "3Y": None, "5Y": None, "since_first_investment": "10.0000"},
            "benchmark_same_flows": {"1Y": "12.0000", "3Y": None, "5Y": None, "since_first_investment": "12.0000"},
        },
        "benchmark_reason": None,
    },
}


@pytest.mark.parametrize("mode", ["inception", "current"])
def test_existing_fields_are_unchanged(returns_case, mode):
    assert returns_case(mode).model_dump(mode="json", exclude={"benchmark_label"}) == GOLDEN[mode]


@pytest.mark.parametrize("mode", ["inception", "current"])
def test_old_returns_payload_defaults_the_new_label_to_null(mode):
    assert ReturnsResponse.model_validate(GOLDEN[mode]).benchmark_label is None
