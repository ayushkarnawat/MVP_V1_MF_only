from datetime import date, datetime, timezone
from decimal import Decimal

import pytest
from pydantic import ValidationError

from app.services.dashboard.portfolio_insights_schemas import (
    FundSpreadOut,
    InsightsOut,
    LargestAmcOut,
    LargestHoldingOut,
    PlanSplitEntryOut,
    PlanSplitOut,
    PortfolioInsightsResponse,
    SipInsightOut,
)


def _envelope():
    return {
        "scope": "aggregate", "member_id": None, "nav_as_of": date(2026, 10, 23),
        "partial": False, "missing_funds": [],
        "computed_at": datetime(2026, 10, 23, 13, tzinfo=timezone.utc),
    }


def _entry(value="0.00", pct="0.0000"):
    return PlanSplitEntryOut(value=Decimal(value), pct=Decimal(pct))


def _response(**overrides):
    insights = InsightsOut(
        largest_holding=LargestHoldingOut(
            scheme_id="s1", fund_name="Fund", amc_name="AMC",
            value=Decimal("600000.00"), pct_of_portfolio=Decimal("60.0000"),
        ),
        spread=FundSpreadOut(fund_count=3, amc_count=2),
        plan_split=PlanSplitOut(
            direct=_entry("700000.00", "70.0000"), regular=_entry("300000.00", "30.0000"),
            unclassified=_entry(),
        ),
        largest_amc=LargestAmcOut(
            amc_name="AMC", value=Decimal("700000.00"), pct_of_portfolio=Decimal("70.0000"),
            fund_count=2,
        ),
        sips=SipInsightOut(active_count=3, monthly_total=Decimal("17000.00")),
    )
    fields = dict(
        **_envelope(), members=None, total_value=Decimal("1000000.00"), empty=False,
        empty_reason=None, insights=insights,
    )
    fields.update(overrides)
    return PortfolioInsightsResponse(**fields)


def test_response_contract_and_decimals_serialise_as_strings():
    response = _response()
    assert list(response.model_fields) == [
        "scope", "member_id", "nav_as_of", "partial", "missing_funds", "computed_at",
        "members", "total_value", "empty", "empty_reason", "insights",
    ]
    dumped = response.model_dump(mode="json")
    assert dumped["total_value"] == "1000000.00"
    assert dumped["insights"]["largest_holding"]["pct_of_portfolio"] == "60.0000"
    assert dumped["insights"]["plan_split"]["unclassified"] == {"value": "0.00", "pct": "0.0000"}
    assert dumped["insights"]["sips"] == {"active_count": 3, "monthly_total": "17000.00"}
    assert dumped["insights"]["spread"] == {"fund_count": 3, "amc_count": 2}


def test_no_signed_zero_reaches_json():
    dumped = _response(total_value=Decimal("-0.00")).model_dump(mode="json")
    assert dumped["total_value"] == "0.00"


def test_extra_fields_are_forbidden_everywhere():
    with pytest.raises(ValidationError, match="extra_forbidden"):
        FundSpreadOut(fund_count=1, amc_count=1, unexpected=True)
    with pytest.raises(ValidationError, match="extra_forbidden"):
        _response(unexpected=True)


def test_empty_reason_is_restricted():
    with pytest.raises(ValidationError):
        _response(empty_reason="other")
