from __future__ import annotations

import json
from pathlib import Path

from app.db.session import get_db
from app.models.reference import Scenario
from app.services.analytics.scenario_asset_class import DISPLAY_GROUPS


ROOT = Path(__file__).resolve().parents[1] / "fixtures" / "planning"
RESULT_FILES = {
    "results_family_standard.json", "results_member_dev.json",
    "results_family_multi_phase.json", "results_family_freeze.json",
    "results_family_no_fund_data.json", "results_family_no_holdings.json",
}
RESULT_KEYS = {
    "scenario", "portfolio_impact_pct", "rupee_impact", "covered_value",
    "total_value", "no_data_funds", "benchmarks", "phases", "by_fund",
    "by_member", "hypothetical_assumptions", "assumptions_not_set",
    "by_asset_class", "funds_data_available",
}
SCENARIO_KEYS = {
    "scenario_id", "name", "description", "scenario_type", "start_date",
    "end_date", "is_ongoing", "display_rank", "parent_scenario_id",
    "has_phases", "had_redemption_freeze_schemes", "quick_market_pct",
    "quick_equity_pct", "quick_debt_pct", "quick_weight_quarter",
}


def _load(name: str):
    return json.loads((ROOT / name).read_text(encoding="utf-8"))


def _writer():
    from scripts.write_planning_fixtures import REQUESTS, write_fixture_set
    return REQUESTS, write_fixture_set


def test_generated_golden_fixtures_equal_live_routes():
    requests, write_fixture_set = _writer()
    generated = write_fixture_set(ROOT, write=False)
    assert set(generated) == set(requests)
    assert {path.name for path in ROOT.glob("*.json")} == set(requests)
    for filename, payload in generated.items():
        assert _load(filename) == payload


def test_planning_fixture_semantics():
    standard = _load("results_family_standard.json")
    assert (
        standard["rupee_impact"], standard["covered_value"],
        standard["total_value"], standard["portfolio_impact_pct"],
    ) == ("-655.98", "5212.00", "5212.00", "-12.59")
    assert standard["benchmarks"] == [{"name": "nifty_50", "pct": "0.43"}]
    assert standard["funds_data_available"] is True
    assert [
        (row["bucket"], row["rupee_impact"], row["covered_value"], row["pct"])
        for row in standard["by_asset_class"]
    ] == [
        ("Equity", "-756.80", "2200.00", "-34.40"),
        ("Debt", "20.02", "2002.00", "1.00"),
        ("Gold and Silver", "80.80", "1010.00", "8.00"),
    ]
    assert [
        (row["member_name"], row["rupee_impact"], row["pct"])
        for row in standard["by_member"]
    ] == [
        ("ASHA RAO", "-756.80", "-34.40"),
        ("Dev Rao", "100.82", "3.35"),
    ]

    dev = _load("results_member_dev.json")
    assert (
        dev["rupee_impact"], dev["covered_value"],
        dev["total_value"], dev["portfolio_impact_pct"],
    ) == ("100.82", "3012.00", "3012.00", "3.35")
    assert len(dev["by_member"]) == 1
    assert dev["by_member"][0]["member_name"] == "Dev Rao"

    multi = _load("results_family_multi_phase.json")
    assert (
        multi["rupee_impact"], multi["covered_value"], multi["portfolio_impact_pct"],
    ) == ("-260.56", "5212.00", "-5.00")
    assert multi["benchmarks"] == [] and len(multi["phases"]) == 2
    assert {row["scheme_name"]: row["pct"] for row in multi["by_fund"]} == {
        "Asha Large Cap": "-3.00",
        "Asha Flexi Cap": "-2.00",
        "Dev Short Duration Debt": "0.50",
        "Dev Gold Fund": "1.00",
    }
    assert [row["rupee_impact"] for row in multi["by_asset_class"]] == [
        "-341.00", "40.04", "40.40",
    ]

    freeze = _load("results_family_freeze.json")
    assert (
        freeze["rupee_impact"], freeze["covered_value"], freeze["portfolio_impact_pct"],
    ) == ("-180.00", "3210.00", "-5.61")
    assert freeze["benchmarks"] == [] and freeze["no_data_funds"] == 0
    assert [row["bucket"] for row in freeze["by_asset_class"]] == [
        "Equity", "Gold and Silver",
    ]
    debt = next(
        fund for member in freeze["by_member"] for fund in member["funds"]
        if fund["scheme_name"] == "Dev Short Duration Debt"
    )
    assert debt["is_frozen"] is True and debt["rupee_impact"] is None

    no_data = _load("results_family_no_fund_data.json")
    assert no_data["portfolio_impact_pct"] is None
    assert (
        no_data["rupee_impact"], no_data["covered_value"], no_data["total_value"],
    ) == ("0.00", "0.00", "5212.00")
    assert no_data["no_data_funds"] == 4
    assert no_data["by_asset_class"] == []
    assert no_data["funds_data_available"] is False
    assert no_data["benchmarks"] == [{"name": "nifty_50", "pct": "12.50"}]
    no_data_funds = [
        fund for member in no_data["by_member"] for fund in member["funds"]
    ]
    assert len(no_data_funds) == 4
    assert all(fund["is_proxied"] is True for fund in no_data_funds)
    assert all(fund["proxy_basis"] == "no_comparable_data" for fund in no_data_funds)

    no_holdings = _load("results_family_no_holdings.json")
    assert (
        no_holdings["rupee_impact"], no_holdings["covered_value"],
        no_holdings["total_value"],
    ) == ("0.00", "0.00", "0.00")
    assert no_holdings["portfolio_impact_pct"] is None
    assert no_holdings["by_asset_class"] == []
    assert no_holdings["funds_data_available"] is True

    summaries = _load("scenarios_list_curated.json")
    assert [row["description"] for row in summaries] == [
        "Fixture description for scenario a.",
        "Fixture description for scenario b.",
        "Fixture description for scenario c.",
        "Fixture description for scenario d.",
        "",
    ]

    money_or_pct_keys = {
        "portfolio_impact_pct", "rupee_impact", "covered_value", "total_value",
        "pct", "quick_market_pct", "quick_equity_pct", "quick_debt_pct",
        "assumed_pct_change",
    }

    def assert_decimal_strings(value):
        if isinstance(value, dict):
            for key, child in value.items():
                if key in money_or_pct_keys:
                    assert child is None or isinstance(child, str), (key, child)
                assert_decimal_strings(child)
        elif isinstance(value, list):
            for child in value:
                assert_decimal_strings(child)

    group_order = {bucket: index for index, bucket in enumerate(DISPLAY_GROUPS)}
    for filename in RESULT_FILES:
        payload = _load(filename)
        assert set(payload) == RESULT_KEYS
        assert set(payload["scenario"]) == SCENARIO_KEYS
        assert_decimal_strings(payload)
        buckets = [row["bucket"] for row in payload["by_asset_class"]]
        assert buckets == sorted(buckets, key=group_order.__getitem__)
        assert all(bucket in DISPLAY_GROUPS for bucket in buckets)
        for row in payload["by_fund"]:
            assert set(row) == {
                "scheme_id", "scheme_name", "pct", "is_proxied",
                "proxy_basis", "is_frozen",
            }
        for row in payload["by_member"]:
            assert set(row) == {
                "household_member_id", "member_name", "rupee_impact", "pct", "funds",
            }
            for fund in row["funds"]:
                assert set(fund) == {
                    "scheme_id", "scheme_name", "rupee_impact", "is_proxied",
                    "proxy_basis", "is_frozen",
                }


def test_pre_2006_results_route_returns_index_benchmarks():
    from tests.api.planning_fixture import SCENARIO_IDS, build_planning_fixture
    runtime = build_planning_fixture()
    try:
        response = runtime.client.get(f"/scenarios/{SCENARIO_IDS['d']}/results")
        assert response.status_code == 200
        assert response.json()["benchmarks"] == [
            {"name": "nifty_50", "pct": "12.50"},
        ]
    finally:
        runtime.close()


def test_fixture_scenarios_are_date_stable():
    from tests.api.planning_fixture import build_planning_fixture
    runtime = build_planning_fixture()
    override = runtime.client.app.dependency_overrides[get_db]()
    db = next(override)
    try:
        scenarios = db.query(Scenario).all()
        assert scenarios
        assert all(scenario.is_ongoing is False for scenario in scenarios)
        assert all(scenario.end_date is not None for scenario in scenarios)
    finally:
        override.close()
        runtime.close()
