import uuid
from datetime import date
from decimal import Decimal
from unittest.mock import AsyncMock, patch

import pytest

from app.api.scenarios import router
from app.config import Settings, settings
from app.db.session import get_db
from app.main import app
from app.models.reference import Scenario, ScenarioSchemeResult, Scheme
from app.models.user import HouseholdMember
from app.services.dashboard.schemas import HoldingRow
from tests.api.test_analytics_route import _authed_headers_and_member


def _seed(client, *scenarios):
    override = app.dependency_overrides[get_db]
    with next(override()) as db:
        db.add_all(scenarios)
        db.commit()


def _scenario(name, **kw):
    return Scenario(id=uuid.uuid4(), name=name, description=kw.pop("description", "d"), start_date=date(2020, 1, 1), end_date=date(2020, 3, 1), scenario_type=kw.pop("scenario_type", "CRASH"), **kw)


def test_curated_scenarios_returns_only_display_rank_rows(client):
    headers, _, _ = _authed_headers_and_member(client, "+919000000701")
    curated = _scenario("Curated", display_rank=1)
    phase = _scenario("Phase", parent_scenario_id=curated.id)
    _seed(client, curated, _scenario("Not curated"))
    _seed(client, phase)
    response = client.get("/scenarios?curated=true", headers=headers)
    assert response.status_code == 200
    assert [s["name"] for s in response.json()] == ["Curated"]
    response = client.get("/scenarios", headers=headers)
    assert [s["name"] for s in response.json()] == ["Curated", "Not curated"]


def test_list_scenarios_includes_description_even_when_empty(client):
    headers, _, _ = _authed_headers_and_member(client, "+919000000706")
    _seed(client, _scenario("Quiet", description=""))

    response = client.get("/scenarios", headers=headers)

    assert response.status_code == 200
    assert response.json()[0]["description"] == ""


def test_scenario_results_returns_404_for_unknown_scenario(client):
    headers, _, _ = _authed_headers_and_member(client, "+919000000702")
    assert client.get(f"/scenarios/{uuid.uuid4()}/results", headers=headers).status_code == 404


def test_scenarios_require_auth(client):
    assert client.get("/scenarios").status_code == 401
    assert client.get(f"/scenarios/{uuid.uuid4()}/results").status_code == 401


def test_hypotheticals_default_off():
    assert Settings(_env_file=None).scenario_hypotheticals_enabled is False


@pytest.mark.parametrize("enabled", [False, True])
def test_hypothetical_release_gate_list_and_results(client, monkeypatch, enabled):
    headers, _, _ = _authed_headers_and_member(client, "+919000000703")
    hypothetical = _scenario("Hypothetical", scenario_type="HYPOTHETICAL", display_rank=8)
    scenario_id = hypothetical.id
    _seed(client, hypothetical)
    monkeypatch.setattr(settings, "scenario_hypotheticals_enabled", enabled)
    for url in ("/scenarios", "/scenarios?curated=true"):
        response = client.get(url, headers=headers)
        assert response.status_code == 200
        assert [s["scenario_type"] for s in response.json()] == (["HYPOTHETICAL"] if enabled else [])
    response = client.get(f"/scenarios/{scenario_id}/results", headers=headers)
    assert response.status_code == (200 if enabled else 404)
    if enabled:
        assert response.json()["assumptions_not_set"] is True
        assert response.json()["portfolio_impact_pct"] is None


def test_results_use_only_authenticated_household(client):
    headers, member_id, _ = _authed_headers_and_member(client, "+919000000704")
    _authed_headers_and_member(client, "+919000000705")
    scenario = _scenario("Crash")
    scenario_id = scenario.id
    _seed(client, scenario)
    with patch("app.services.analytics.scenario_engine.compute_holdings", new=AsyncMock(return_value=[])):
        response = client.get(f"/scenarios/{scenario_id}/results", headers=headers)
    assert response.status_code == 200
    assert [m["household_member_id"] for m in response.json()["by_member"]] == [member_id]


@pytest.mark.parametrize("enabled", [False, True])
def test_release_gate_queries_without_http_transport(db_session, monkeypatch, enabled):
    from types import SimpleNamespace
    from fastapi import HTTPException
    from app.api.scenarios import get_scenario_results, _list_scenarios

    scenario = _scenario("Hypothetical", scenario_type="HYPOTHETICAL", display_rank=8)
    db_session.add(scenario)
    db_session.commit()
    monkeypatch.setattr(settings, "scenario_hypotheticals_enabled", enabled)
    user = SimpleNamespace(id=uuid.uuid4())

    def finish(coroutine):
        try:
            with pytest.raises(StopIteration) as returned:
                coroutine.send(None)
            return returned.value.value
        finally:
            coroutine.close()

    for curated in (False, True):
        rows = _list_scenarios(db_session, curated, enabled)
        assert [row.scenario_type for row in rows] == (["HYPOTHETICAL"] if enabled else [])
    coroutine = get_scenario_results(scenario.id, user=user, db=db_session)
    if enabled:
        assert finish(coroutine).assumptions_not_set is True
    else:
        try:
            with pytest.raises(HTTPException) as hidden:
                coroutine.send(None)
            assert hidden.value.status_code == 404
        finally:
            coroutine.close()



def test_ruling10_list_loads_all_phase_flags_in_one_query(db_session):
    from sqlalchemy import event
    from app.api.scenarios import _list_scenarios
    groups = [_scenario(f"Group {i}") for i in range(8)]
    db_session.add_all(groups); db_session.commit()
    db_session.add_all([_scenario(f"Phase {i}", parent_scenario_id=group.id) for i, group in enumerate(groups[:4])]); db_session.commit()
    statements = []
    def record(conn, cursor, statement, parameters, context, executemany):
        if statement.lstrip().upper().startswith("SELECT"):
            statements.append(statement)
    engine = db_session.get_bind()
    event.listen(engine, "before_cursor_execute", record)
    try:
        rows = _list_scenarios(db_session, False, False)
    finally:
        event.remove(engine, "before_cursor_execute", record)
    assert len(statements) == 2
    assert [(r.name, r.has_phases) for r in rows] == [(f"Group {i}", i < 4) for i in range(8)]


def test_ruling10_list_database_work_runs_off_event_loop(db_session):
    import asyncio
    import threading
    from sqlalchemy import event
    from app.api.scenarios import list_scenarios
    db_session.add(_scenario("Worker thread")); db_session.commit()
    calling_thread = threading.get_ident()
    database_threads = []
    def record(conn, cursor, statement, parameters, context, executemany):
        if statement.lstrip().upper().startswith("SELECT"):
            database_threads.append(threading.get_ident())
    engine = db_session.get_bind()
    event.listen(engine, "before_cursor_execute", record)
    try:
        rows = asyncio.run(list_scenarios(curated=False, user=None, db=db_session))
    finally:
        event.remove(engine, "before_cursor_execute", record)
    assert [r.name for r in rows] == ["Worker thread"]
    assert len(database_threads) == 2
    assert all(thread_id != calling_thread for thread_id in database_threads)


def _planning_api_fixture(client, phone):
    headers, self_id, _ = _authed_headers_and_member(client, phone)
    partner_id = client.post("/household-members", json={"name": "Partner", "relationship": "spouse"}, headers=headers).json()["id"]
    scenario = _scenario("Planning member filter")
    equity = Scheme(id=uuid.uuid4(), name="Equity One", amfi_code=f"E{phone[-4:]}", amc_name="AMC", sebi_category="Equity Scheme - Flexi Cap Fund")
    debt = Scheme(id=uuid.uuid4(), name="Liquid One", amfi_code=f"D{phone[-4:]}", amc_name="AMC", sebi_category="Debt Scheme - Liquid Fund")
    scenario_id = scenario.id
    equity_id = equity.id
    debt_id = debt.id
    _seed(client, scenario, equity, debt)
    _seed(client,
        ScenarioSchemeResult(scenario_id=scenario_id, scheme_id=equity_id, pct_change=Decimal("-10.00")),
        ScenarioSchemeResult(scenario_id=scenario_id, scheme_id=debt_id, pct_change=Decimal("5.00")),
    )
    rows = [
        HoldingRow(
            household_member_id=self_id, household_member_name="Self",
            scheme_id=str(equity_id), scheme_name="Equity One", amc_name="AMC", plan_type="direct",
            units_held="100", average_nav="10", current_nav="10", current_nav_date=date(2026, 10, 10),
            amount_invested="1000.00", current_value="1000.00", current_profit_total="0.00",
            realized_gain="0.00", unrealized_gain="0.00", today_gain="0.00",
        ),
        HoldingRow(
            household_member_id=partner_id, household_member_name="Partner",
            scheme_id=str(debt_id), scheme_name="Liquid One", amc_name="AMC", plan_type="direct",
            units_held="200", average_nav="10", current_nav="10", current_nav_date=date(2026, 10, 10),
            amount_invested="2000.00", current_value="2000.00", current_profit_total="0.00",
            realized_gain="0.00", unrealized_gain="0.00", today_gain="0.00",
        ),
    ]

    async def fake_compute_holdings(db, ids, **kwargs):
        return [row for row in rows if uuid.UUID(row.household_member_id) in ids]

    return headers, scenario_id, self_id, partner_id, fake_compute_holdings


def test_results_member_id_filters_to_one_member(client):
    headers, scenario_id, self_id, partner_id, fake = _planning_api_fixture(client, "+919000000711")
    with patch("app.services.analytics.scenario_engine.compute_holdings", new=fake):
        partner = client.get(f"/scenarios/{scenario_id}/results?member_id={partner_id}", headers=headers)
        family = client.get(f"/scenarios/{scenario_id}/results", headers=headers)

    assert partner.status_code == 200
    partner_body = partner.json()
    assert [row["household_member_id"] for row in partner_body["by_member"]] == [partner_id]
    assert partner_body["rupee_impact"] == "100.00"
    assert partner_body["portfolio_impact_pct"] == partner_body["by_member"][0]["pct"] == "5.00"
    assert [row["bucket"] for row in partner_body["by_asset_class"]] == ["Debt"]
    assert family.status_code == 200
    family_body = family.json()
    assert {row["household_member_id"] for row in family_body["by_member"]} == {self_id, partner_id}
    assert (family_body["rupee_impact"], family_body["portfolio_impact_pct"]) == ("0.00", "0.00")


def test_results_foreign_member_id_returns_404_without_detail(client):
    headers, scenario_id, _, _, fake = _planning_api_fixture(client, "+919000000712")
    _, foreign_id, _ = _authed_headers_and_member(client, "+919000000722")
    override = app.dependency_overrides[get_db]
    with next(override()) as db:
        foreign = db.get(HouseholdMember, uuid.UUID(foreign_id))
        foreign.name = "Foreign X"
        db.commit()

    with patch("app.services.analytics.scenario_engine.compute_holdings", new=fake):
        foreign_response = client.get(f"/scenarios/{scenario_id}/results?member_id={foreign_id}", headers=headers)
        absent_response = client.get(f"/scenarios/{scenario_id}/results?member_id={uuid.uuid4()}", headers=headers)

    assert foreign_response.status_code == absent_response.status_code == 404
    assert foreign_response.json() == absent_response.json() == {"detail": "Household member not found."}
    body = foreign_response.text
    assert foreign_id not in body
    assert "Foreign X" not in body


def test_results_malformed_member_id_returns_422(client):
    headers, scenario_id, _, _, fake = _planning_api_fixture(client, "+919000000713")
    with patch("app.services.analytics.scenario_engine.compute_holdings", new=fake):
        response = client.get(f"/scenarios/{scenario_id}/results?member_id=not-a-uuid", headers=headers)
    assert response.status_code == 422


def test_results_without_member_id_returns_family_with_new_fields(client):
    headers, scenario_id, self_id, partner_id, fake = _planning_api_fixture(client, "+919000000714")
    with patch("app.services.analytics.scenario_engine.compute_holdings", new=fake):
        response = client.get(f"/scenarios/{scenario_id}/results", headers=headers)

    assert response.status_code == 200
    body = response.json()
    assert {row["household_member_id"] for row in body["by_member"]} == {self_id, partner_id}
    assert "by_asset_class" in body
    assert body["funds_data_available"] is True


def test_results_member_with_no_holdings_returns_zero_row_not_error(client):
    headers, scenario_id, _, partner_id, _ = _planning_api_fixture(client, "+919000000715")

    async def no_holdings(db, ids, **kwargs):
        return []

    with patch("app.services.analytics.scenario_engine.compute_holdings", new=no_holdings):
        response = client.get(f"/scenarios/{scenario_id}/results?member_id={partner_id}", headers=headers)

    assert response.status_code == 200
    body = response.json()
    assert body["rupee_impact"] == "0.00"
    assert body["portfolio_impact_pct"] is None
    assert body["by_asset_class"] == []
    assert body["by_member"][0]["funds"] == []


def test_member_id_is_checked_after_the_scenario(client, monkeypatch):
    headers, _, _ = _authed_headers_and_member(client, "+919000000716")
    _, foreign_id, _ = _authed_headers_and_member(client, "+919000000726")
    unknown = client.get(f"/scenarios/{uuid.uuid4()}/results?member_id={foreign_id}", headers=headers)
    assert unknown.status_code == 404
    assert unknown.json() == {"detail": "Scenario not found."}

    hidden = _scenario("Hidden hypothetical", scenario_type="HYPOTHETICAL")
    hidden_id = hidden.id
    _seed(client, hidden)
    monkeypatch.setattr(settings, "scenario_hypotheticals_enabled", False)
    response = client.get(f"/scenarios/{hidden_id}/results?member_id={foreign_id}", headers=headers)
    assert response.status_code == 404
    assert response.json() == {"detail": "Scenario not found."}
