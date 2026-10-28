from __future__ import annotations

import json
from datetime import date
from pathlib import Path

from pydantic import TypeAdapter

from app.services.fund_page.schemas import (
    CategoryReturnsResponse,
    CategorySeriesResponse,
    CompositionResponse,
    FolioNumberResponse,
    FundComparisonResponse,
    FundOverlapResponse,
    HoldingsListResponse,
    InsightsResponse,
    ManagerResponse,
    PeerPeriodReturnsResponse,
    PerformanceResponse,
    ReturnsResponse,
    RiskResponse,
    RollingResponse,
    ScatterResponse,
    ScoreResponse,
    SummaryResponse,
    Unavailable,
)
from scripts.write_fund_fixtures import REQUESTS, write_fixture_set


FIXTURES = Path(__file__).resolve().parents[1] / "fixtures" / "fund"


def _committed():
    return {
        name: json.loads((FIXTURES / name).read_text(encoding="utf-8"))
        for name in REQUESTS
    }


def test_generated_golden_fixtures_equal_live_routes():
    assert write_fixture_set(FIXTURES, write=False) == _committed()


def test_golden_generation_is_independent_of_real_calendar_date(monkeypatch):
    class DifferentDate(date):
        @classmethod
        def today(cls):
            return cls(2041, 3, 9)

    monkeypatch.setattr("scripts.write_fund_fixtures.date", DifferentDate)
    assert write_fixture_set(FIXTURES, write=False) == _committed()


def test_fund_fixture_semantics():
    payloads = _committed()
    summary = payloads["summary_family.json"]
    assert summary["tiles"]["invested"] == "1600.00"
    assert summary["details"]["units"] == "150.000"
    assert summary["tiles"]["current_value"] == "2250.00"
    assert summary["tiles"]["total_gain"] == "650.00"
    assert payloads["risk_equity.json"]["volatility"]["band"] in {"Low", "Moderate", "High"}
    assert payloads["insights_full.json"]["top_three"]
    assert all(row["id"] for row in payloads["insights_full.json"]["top_three"])
    overlap = payloads["overlap_fund.json"]
    assert overlap["common_stock_count"] > 0
    assert overlap["total_stock_count"] >= overlap["common_stock_count"]


def test_every_fixture_validates_against_the_response_models():
    unavailable = TypeAdapter(Unavailable)
    model_by_prefix = {
        "summary_": TypeAdapter(SummaryResponse),
        "folio_": TypeAdapter(FolioNumberResponse),
        "performance_": TypeAdapter(PerformanceResponse | Unavailable),
        "returns_": TypeAdapter(ReturnsResponse | Unavailable),
        "risk_": TypeAdapter(RiskResponse | Unavailable),
        "composition": TypeAdapter(CompositionResponse | Unavailable),
        "holdings_": TypeAdapter(HoldingsListResponse | Unavailable),
        "manager": TypeAdapter(ManagerResponse | Unavailable),
        "score_": TypeAdapter(ScoreResponse),
        "peers_series": TypeAdapter(CategorySeriesResponse | Unavailable),
        "peers_returns": TypeAdapter(CategoryReturnsResponse | Unavailable),
        "peers_unavailable": unavailable,
        "rolling_": TypeAdapter(RollingResponse | Unavailable),
        "period_returns": TypeAdapter(PeerPeriodReturnsResponse | Unavailable),
        "scatter": TypeAdapter(ScatterResponse | Unavailable),
        "insights_": TypeAdapter(InsightsResponse),
        "overlap_fund": TypeAdapter(FundOverlapResponse | Unavailable),
        "overlap_unavailable": unavailable,
        "overlap_compare": TypeAdapter(FundComparisonResponse | Unavailable),
    }
    for filename, payload in _committed().items():
        adapter = next(
            adapter for prefix, adapter in model_by_prefix.items() if filename.startswith(prefix)
        )
        adapter.validate_python(payload)
