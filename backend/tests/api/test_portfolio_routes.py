import json
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.services.dashboard.portfolio_schemas import (
    InstrumentBucketOut,
    PortfolioAllocationResponse,
    PortfolioSummaryResponse,
    PortfolioValueSeriesResponse,
)
from app.services.home.schemas import MemberOut, PointOut
from sqlalchemy import event
from scripts.write_portfolio_fixtures import REQUESTS, write_fixture_set
from tests.api.home_fixture import build_home_fixture, seed_home_household


def _envelope():
    return {
        "scope": "aggregate",
        "member_id": None,
        "nav_as_of": date(2026, 10, 23),
        "partial": False,
        "missing_funds": [],
        "computed_at": datetime(2026, 10, 23, 13, tzinfo=timezone.utc),
    }


def test_portfolio_allocation_response_has_exact_contract_and_plain_decimal_json():
    response = PortfolioAllocationResponse(
        **_envelope(),
        members=[MemberOut(id="m1", name="Asha", has_data=True)],
        buckets=[
            InstrumentBucketOut(
                label="Mutual Funds", status="live",
                current_value=Decimal("5212.00"), percentage=Decimal("100.00"),
                invested=Decimal("5000.00"), gain_loss=Decimal("212.00"), xirr="0.12",
            ),
            InstrumentBucketOut(
                label="Direct Stocks", status="coming_soon",
                current_value=None, percentage=None, invested=None, gain_loss=None, xirr=None,
            ),
        ],
    )
    assert list(response.model_fields) == [
        "scope", "member_id", "nav_as_of", "partial", "missing_funds", "computed_at",
        "members", "buckets",
    ]
    dumped = response.model_dump(mode="json")
    assert dumped["buckets"][0] == {
        "label": "Mutual Funds", "status": "live",
        "current_value": "5212.00", "percentage": "100.00",
        "invested": "5000.00", "gain_loss": "212.00", "xirr": "0.12",
    }
    assert dumped["members"] == [{"id": "m1", "name": "Asha", "has_data": True}]


def test_portfolio_summary_response_has_exact_contract_and_plain_decimal_json():
    response = PortfolioSummaryResponse(
        **_envelope(),
        members=None,
        total_value=Decimal("5212.00"), total_invested=Decimal("5000.00"),
        unrealized_gain=Decimal("212.00"), unrealized_pct=Decimal("4.2400"),
        realized_gain=Decimal("10.00"),
        today_gain=Decimal("12.00"), today_pct=Decimal("0.2300"),
        previous_nav_date=date(2026, 10, 22),
        lifetime_xirr="0.12", current_holdings_xirr="0.10",
        lifetime_xirr_disclaimer=None, current_holdings_xirr_disclaimer=None,
    )
    assert list(response.model_fields) == [
        "scope", "member_id", "nav_as_of", "partial", "missing_funds", "computed_at",
        "members", "total_value", "total_invested", "unrealized_gain", "unrealized_pct",
        "realized_gain", "today_gain", "today_pct", "previous_nav_date",
        "lifetime_xirr", "current_holdings_xirr",
        "lifetime_xirr_disclaimer", "current_holdings_xirr_disclaimer",
    ]
    dumped = response.model_dump(mode="json")
    assert dumped["members"] is None
    assert dumped["total_value"] == "5212.00"
    assert dumped["unrealized_pct"] == "4.2400"


def test_portfolio_value_series_response_has_exact_contract_and_plain_decimal_json():
    response = PortfolioValueSeriesResponse(
        **_envelope(),
        members=None, days=30, start=date(2026, 9, 24), end=date(2026, 10, 23),
        empty=False, points=[PointOut(date=date(2026, 10, 23), value=Decimal("5212.00"))],
    )
    assert list(response.model_fields) == [
        "scope", "member_id", "nav_as_of", "partial", "missing_funds", "computed_at",
        "members", "days", "start", "end", "empty", "points",
    ]
    dumped = response.model_dump(mode="json")
    assert dumped["points"] == [{"date": "2026-10-23", "value": "5212.00"}]


def test_portfolio_models_forbid_extra_fields():
    with pytest.raises(ValidationError, match="extra_forbidden"):
        InstrumentBucketOut(
            label="Mutual Funds", status="live", current_value=None,
            percentage=None, invested=None, gain_loss=None, xirr=None, unexpected=True,
        )


PORTFOLIO_SUFFIXES = ("portfolio-allocation", "portfolio-summary", "portfolio-value-series")


@pytest.fixture()
def portfolio_client(client):
    household = seed_home_household(client)
    yield client, household


@pytest.mark.parametrize("suffix", PORTFOLIO_SUFFIXES)
def test_aggregate_portfolio_routes_require_authentication(client, suffix):
    assert client.get(f"/household/aggregate/{suffix}").status_code == 401


def test_openapi_registers_exactly_six_portfolio_paths(client):
    paths = client.get("/openapi.json").json()["paths"]
    expected = {f"/household/aggregate/{suffix}" for suffix in PORTFOLIO_SUFFIXES} | {
        f"/household-members/{{member_id}}/{suffix}" for suffix in PORTFOLIO_SUFFIXES
    }
    assert {path for path in paths if "portfolio-" in path} == expected
    for path in expected:
        assert paths[path]["get"]["tags"] == ["portfolio"]


def test_all_six_portfolio_routes_return_200_with_exact_envelope(portfolio_client):
    client, household = portfolio_client
    paths = [f"/household/aggregate/{suffix}" for suffix in PORTFOLIO_SUFFIXES]
    paths += [
        f"/household-members/{household.asha_id}/{suffix}" for suffix in PORTFOLIO_SUFFIXES
    ]
    for path in paths:
        response = client.get(path)
        assert response.status_code == 200, (path, response.text)
        body = response.json()
        assert list(body)[:6] == [
            "scope", "member_id", "nav_as_of", "partial", "missing_funds", "computed_at",
        ]


def test_foreign_member_id_is_404_on_all_portfolio_routes(portfolio_client):
    client, _household = portfolio_client
    foreign = uuid.uuid4()
    for suffix in PORTFOLIO_SUFFIXES:
        assert client.get(f"/household-members/{foreign}/{suffix}").status_code == 404


def test_portfolio_value_series_days_validation(portfolio_client):
    client, _household = portfolio_client
    assert client.get(
        "/household/aggregate/portfolio-value-series?days=1"
    ).status_code == 422
    assert client.get(
        "/household/aggregate/portfolio-value-series?days=367"
    ).status_code == 422
    assert client.get(
        "/household/aggregate/portfolio-value-series?days=2"
    ).status_code == 200
    assert client.get(
        "/household/aggregate/portfolio-value-series?days=366"
    ).status_code == 200


def test_portfolio_summary_total_value_matches_home_summary(portfolio_client):
    client, _household = portfolio_client
    summary = client.get("/household/aggregate/portfolio-summary").json()
    home_summary = client.get("/household/aggregate/home/summary").json()
    allocation = client.get("/household/aggregate/portfolio-allocation").json()
    series = client.get("/household/aggregate/portfolio-value-series?days=30").json()
    assert summary["total_value"] == home_summary["total_value"]
    assert summary["total_value"] == allocation["buckets"][0]["current_value"]
    assert series["points"][-1]["value"] == summary["total_value"]
    assert summary["today_gain"] == home_summary["change_amount"]


def test_portfolio_member_scope_has_null_members(portfolio_client):
    client, household = portfolio_client
    for suffix in PORTFOLIO_SUFFIXES:
        body = client.get(f"/household-members/{household.asha_id}/{suffix}").json()
        assert body["members"] is None
    for suffix in PORTFOLIO_SUFFIXES:
        body = client.get(f"/household/aggregate/{suffix}").json()
        assert body["members"] is not None and len(body["members"]) == 2


def _all_portfolio_paths(household):
    paths = [f"/household/aggregate/{suffix}" for suffix in PORTFOLIO_SUFFIXES]
    paths += [
        f"/household-members/{household.dev_id}/{suffix}" for suffix in PORTFOLIO_SUFFIXES
    ]
    return paths


def test_all_portfolio_routes_are_select_only_and_never_recompute(monkeypatch):
    import app.services.analytics.recompute as recompute
    import app.services.dashboard.snapshots as snapshots
    from app.services.analytics.dispatch import dispatcher

    def forbidden(*_args, **_kwargs):
        raise AssertionError("Portfolio GET attempted recompute or snapshot rebuild")

    for name in vars(recompute):
        if name.startswith("compute_"):
            monkeypatch.setattr(recompute, name, forbidden)
    monkeypatch.setattr(snapshots, "rebuild_member_snapshots", forbidden)
    monkeypatch.setattr(dispatcher, "dispatch", forbidden)
    runtime = build_home_fixture()
    statements = []
    listener = lambda _conn, _cursor, statement, _params, _ctx, _many: statements.append(statement)
    event.listen(runtime.engine, "before_cursor_execute", listener)
    try:
        for path in _all_portfolio_paths(runtime.household):
            response = runtime.client.get(path)
            assert response.status_code == 200, (path, response.text)
        assert statements
        assert {statement.lstrip().split(None, 1)[0].upper() for statement in statements} == {"SELECT"}
    finally:
        event.remove(runtime.engine, "before_cursor_execute", listener)
        runtime.close()


def test_portfolio_statement_counts_do_not_grow_with_fund_count():
    counts = []
    for fund_count in (3, 9):
        runtime = build_home_fixture(fund_count=fund_count)
        try:
            runtime.client.get("/household/aggregate/portfolio-summary")
            runtime.client.get(
                f"/household-members/{runtime.household.dev_id}/portfolio-summary"
            )
            route_counts = []
            for path in _all_portfolio_paths(runtime.household):
                statements = []
                listener = lambda _conn, _cursor, statement, _params, _ctx, _many: statements.append(statement)
                event.listen(runtime.engine, "before_cursor_execute", listener)
                try:
                    response = runtime.client.get(path)
                    assert response.status_code == 200, (path, response.text)
                finally:
                    event.remove(runtime.engine, "before_cursor_execute", listener)
                route_counts.append(sum(statement.lstrip().upper().startswith("SELECT") for statement in statements))
            counts.append(route_counts)
        finally:
            runtime.close()
    assert counts[0] == counts[1]


def test_portfolio_openapi_money_and_percentage_fields_are_strings(portfolio_client):
    client, _household = portfolio_client
    schemas = client.get("/openapi.json").json()["components"]["schemas"]
    money_names = {
        "current_value", "percentage", "invested", "gain_loss", "total_value",
        "total_invested", "unrealized_gain", "unrealized_pct", "realized_gain",
        "today_gain", "today_pct", "value",
    }
    for schema_name, schema in schemas.items():
        if schema_name.startswith("Portfolio") or schema_name == "InstrumentBucketOut":
            for field, definition in schema.get("properties", {}).items():
                if field in money_names:
                    encoded = str(definition)
                    assert "number" not in encoded, (schema_name, field, definition)


@pytest.mark.parametrize("variant", ["base", "partial", "redemption", "all_down"])
def test_portfolio_parity_with_home_across_variants(variant, monkeypatch):
    import app.services.dashboard.holdings as holdings_module
    from app.models.reference import NavHistory

    async def cached_nav(db, scheme, on_date, **_kwargs):
        row = (
            db.query(NavHistory)
            .filter(NavHistory.scheme_id == scheme.id, NavHistory.date <= on_date)
            .order_by(NavHistory.date.desc())
            .first()
        )
        return None if row is None else (row.nav, row.date)

    monkeypatch.setattr(holdings_module, "get_nav_on_or_before", cached_nav)
    runtime = build_home_fixture(variant=variant)
    try:
        client = runtime.client
        household = runtime.household
        roots = [
            "/household/aggregate",
            f"/household-members/{household.asha_id}",
            f"/household-members/{household.dev_id}",
        ]
        for root in roots:
            summary = client.get(f"{root}/portfolio-summary").json()
            allocation = client.get(f"{root}/portfolio-allocation").json()
            series = client.get(f"{root}/portfolio-value-series?days=30").json()
            home_summary = client.get(f"{root}/home/summary").json()
            home_movers = client.get(f"{root}/home/movers?by=fund").json()
            holdings = client.get(f"{root}/holdings").json()["holdings"]
            holdings_total = sum(
                (Decimal(row["current_value"]) for row in holdings
                 if not row["nav_unavailable"] and row["current_value"] is not None),
                Decimal("0.00"),
            )
            assert summary["total_value"] == home_summary["total_value"]
            assert summary["total_value"] == allocation["buckets"][0]["current_value"]
            assert Decimal(summary["total_value"]) == holdings_total
            if not series["empty"]:
                assert series["points"][-1]["value"] == summary["total_value"]
            assert summary["today_gain"] == home_movers["net_change"]
            assert summary["today_pct"] == home_movers["net_pct"]
            assert Decimal(summary["unrealized_gain"]) == (
                Decimal(summary["total_value"]) - Decimal(summary["total_invested"])
            )
    finally:
        runtime.close()


def test_generated_portfolio_golden_fixtures_equal_live_routes():
    destination = Path(__file__).resolve().parents[1] / "fixtures" / "portfolio"
    # Read-only on purpose: writing first and then comparing the file with the same output can never fail.
    generated = write_fixture_set(destination, write=False)
    assert set(generated) == set(REQUESTS)
    for filename, payload in generated.items():
        assert json.loads((destination / filename).read_text(encoding="utf-8")) == payload


def test_portfolio_fixture_semantics():
    root = Path(__file__).resolve().parents[1] / "fixtures" / "portfolio"
    load = lambda name: json.loads((root / name).read_text(encoding="utf-8"))

    allocation = load("allocation_family.json")
    assert len(allocation["members"]) == 2
    assert len(allocation["buckets"]) == 8
    assert allocation["buckets"][0]["label"] == "Mutual Funds"
    assert load("allocation_member.json")["members"] is None
    allocation_empty = load("allocation_empty.json")
    assert allocation_empty["buckets"][0]["current_value"] == "0.00"
    assert all(member["has_data"] is False for member in allocation_empty["members"])

    summary = load("summary_family.json")
    assert summary["scope"] == "aggregate" and len(summary["members"]) == 2
    assert summary["total_value"] == "5212.00"
    member_summary = load("summary_member.json")
    assert member_summary["scope"] == "member" and member_summary["members"] is None
    summary_empty = load("summary_empty.json")
    assert summary_empty["total_value"] == "0.00"
    assert summary_empty["unrealized_pct"] is None
    partial = load("summary_partial.json")
    assert partial["partial"] is True
    assert [fund["name"] for fund in partial["missing_funds"]] == ["Dev Gold Fund"]

    series = load("series_family_30d.json")
    assert series["days"] == 30 and series["end"] == series["nav_as_of"]
    assert len(series["points"]) <= 31
    assert series["points"][-1]["value"] == summary["total_value"]
    assert load("series_member_30d.json")["members"] is None
    series_empty = load("series_empty.json")
    assert series_empty["empty"] is True and series_empty["points"] == []


def test_portfolio_empty_household_gives_zero_values_and_eight_buckets():
    runtime = build_home_fixture(variant="empty")
    try:
        client = runtime.client
        summary = client.get("/household/aggregate/portfolio-summary").json()
        allocation = client.get("/household/aggregate/portfolio-allocation").json()
        series = client.get("/household/aggregate/portfolio-value-series?days=30").json()
        assert summary["total_value"] == "0.00"
        assert summary["total_invested"] == "0.00"
        assert summary["unrealized_gain"] == "0.00"
        assert summary["unrealized_pct"] is None
        assert summary["today_gain"] == "0.00"
        assert summary["today_pct"] is None
        assert len(allocation["buckets"]) == 8
        assert allocation["buckets"][0]["current_value"] == "0.00"
        assert series["empty"] is True
        assert series["points"] == []
        assert len(summary["members"]) == 2
        assert all(member["has_data"] is False for member in summary["members"])
    finally:
        runtime.close()
