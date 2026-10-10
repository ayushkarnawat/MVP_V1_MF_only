import uuid
from datetime import date
from unittest.mock import AsyncMock, patch

import pytest

from app.api.scenarios import router
from app.config import Settings, settings
from app.db.session import get_db
from app.main import app
from app.models.reference import Scenario
from tests.api.test_analytics_route import _authed_headers_and_member


def _seed(client, *scenarios):
    override = app.dependency_overrides[get_db]
    with next(override()) as db:
        db.add_all(scenarios)
        db.commit()


def _scenario(name, **kw):
    return Scenario(id=uuid.uuid4(), name=name, description="d", start_date=date(2020, 1, 1), end_date=date(2020, 3, 1), scenario_type=kw.pop("scenario_type", "CRASH"), **kw)


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
