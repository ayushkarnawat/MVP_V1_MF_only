from datetime import date, datetime, timezone
from decimal import Decimal
import json
import uuid
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.api.home import get_now_ist
from app.services.auth.session import get_active_user
from app.services.home.schemas import MissingFund, SummaryResponse
from tests.api.home_fixture import seed_home_household
from scripts.write_home_fixtures import REQUESTS, write_fixture_set


HOME_SUFFIXES = (
    "summary", "wealth-series", "allocation", "movers", "worth-a-look", "benchmarks"
)


def _envelope():
    return {
        "scope": "aggregate",
        "member_id": None,
        "nav_as_of": date(2026, 10, 23),
        "partial": False,
        "missing_funds": [],
        "computed_at": datetime(2026, 10, 23, 13, tzinfo=timezone.utc),
    }


def test_summary_response_has_exact_contract_and_plain_decimal_json():
    response = SummaryResponse(
        **_envelope(),
        display_name="Asha",
        greeting="evening",
        scope_label="Your family portfolio",
        change_amount=Decimal("1E+3"),
        change_pct=Decimal("1.2500"),
        direction="up",
        status_phrase="up",
        since_label="today",
        since_date=date(2026, 10, 22),
        top_contributor="Large Cap",
        members_connected=2,
        members_total=2,
        data_line="Data from 2 of 2 family members",
        has_holdings=True,
        total_value=Decimal("1234.50"),
        members=[],
    )
    assert list(response.model_fields) == [
        "scope", "member_id", "nav_as_of", "partial", "missing_funds", "computed_at",
        "display_name", "greeting", "scope_label", "change_amount", "change_pct",
        "direction", "status_phrase", "since_label", "since_date", "top_contributor",
        "members_connected", "members_total", "data_line", "has_holdings",
        "total_value", "members",
    ]
    assert response.model_dump(mode="json") == {
        "scope": "aggregate",
        "member_id": None,
        "nav_as_of": "2026-10-23",
        "partial": False,
        "missing_funds": [],
        "computed_at": "2026-10-23T13:00:00Z",
        "display_name": "Asha",
        "greeting": "evening",
        "scope_label": "Your family portfolio",
        "change_amount": "1000",
        "change_pct": "1.2500",
        "direction": "up",
        "status_phrase": "up",
        "since_label": "today",
        "since_date": "2026-10-22",
        "top_contributor": "Large Cap",
        "members_connected": 2,
        "members_total": 2,
        "data_line": "Data from 2 of 2 family members",
        "has_holdings": True,
        "total_value": "1234.50",
        "members": [],
    }


def test_home_models_forbid_extra_fields():
    with pytest.raises(ValidationError, match="extra_forbidden"):
        MissingFund(scheme_id="scheme", name="Fund", unexpected=True)


def test_openapi_registers_exactly_twelve_home_paths(client):
    paths = client.get("/openapi.json").json()["paths"]
    expected = {
        f"/household/aggregate/home/{suffix}" for suffix in HOME_SUFFIXES
    } | {
        f"/household-members/{{member_id}}/home/{suffix}" for suffix in HOME_SUFFIXES
    }
    assert {path for path in paths if "/home/" in path} == expected
    for path in expected:
        assert paths[path]["get"]["tags"] == ["home"]


@pytest.mark.parametrize("suffix", HOME_SUFFIXES)
def test_aggregate_home_routes_require_authentication(client, suffix):
    assert client.get(f"/household/aggregate/home/{suffix}").status_code == 401


def test_wealth_query_rejects_benchmark_outside_home_five(client):
    response = client.get(
        "/household/aggregate/home/wealth-series?benchmark=nifty_next_50"
    )
    assert response.status_code == 401


@pytest.fixture()
def home_client(client):
    household = seed_home_household(client)
    yield client, household
    client.app.dependency_overrides.pop(get_active_user, None)
    client.app.dependency_overrides.pop(get_now_ist, None)


def test_all_twelve_routes_return_exact_envelopes(home_client):
    client, household = home_client
    paths = [f"/household/aggregate/home/{suffix}" for suffix in HOME_SUFFIXES]
    paths += [
        f"/household-members/{household.asha_id}/home/{suffix}"
        for suffix in HOME_SUFFIXES
    ]
    for path in paths:
        response = client.get(path)
        assert response.status_code == 200, (path, response.text)
        body = response.json()
        assert list(body)[:6] == [
            "scope", "member_id", "nav_as_of", "partial", "missing_funds", "computed_at"
        ]


def test_home_identity_chain_and_allocation_reconcile(home_client):
    client, _household = home_client
    summary = client.get("/household/aggregate/home/summary").json()
    movers = client.get("/household/aggregate/home/movers?by=fund").json()
    wealth = client.get("/household/aggregate/home/wealth-series?period=1D").json()
    allocation = client.get("/household/aggregate/home/allocation").json()
    assert summary["change_amount"] == movers["net_change"] == wealth["change_amount"] == "12.00"
    shown = sum(
        (Decimal(row["change"]) for row in movers["gains"] + movers["losses"]),
        Decimal("0"),
    ) + Decimal(movers["others_change"])
    assert shown == Decimal(movers["net_change"])
    assert wealth["points"][-1]["value"] == wealth["end_value"]
    assert wealth["end_value"] == summary["total_value"] == allocation["total_value"] == "5212.00"


def test_custom_validation_and_foreign_member(home_client):
    client, _household = home_client
    assert client.get("/household/aggregate/home/wealth-series?period=custom").status_code == 422
    response = client.get(
        "/household/aggregate/home/wealth-series?period=custom&from=2026-10-20&to=2026-10-01"
    )
    assert response.status_code == 422
    assert response.json()["detail"] == "start must not be after end"
    foreign = uuid.uuid4()
    for suffix in HOME_SUFFIXES:
        assert client.get(f"/household-members/{foreign}/home/{suffix}").status_code == 404


def test_home_openapi_money_fields_are_strings(home_client):
    client, _household = home_client
    schemas = client.get("/openapi.json").json()["components"]["schemas"]
    money_names = {
        "change_amount", "change_pct", "total_value", "value", "pct",
        "start_value", "end_value", "net_contributions", "percentage",
        "covered_pct", "coverage_pct", "net_change", "net_pct",
        "previous_value", "change", "others_change",
    }
    for schema_name, schema in schemas.items():
        if schema_name.endswith(("Response", "Out")):
            for field, definition in schema.get("properties", {}).items():
                if field in money_names:
                    encoded = str(definition)
                    assert "number" not in encoded, (schema_name, field, definition)


def test_generated_golden_fixtures_equal_live_routes(home_client):
    client, household = home_client
    destination = Path(__file__).resolve().parents[1] / "fixtures" / "home"
    generated = write_fixture_set(client, household.asha_id, destination)
    assert set(generated) == set(REQUESTS)
    for filename, payload in generated.items():
        assert json.loads((destination / filename).read_text(encoding="utf-8")) == payload
