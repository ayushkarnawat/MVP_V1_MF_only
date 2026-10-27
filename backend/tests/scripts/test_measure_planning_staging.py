import importlib.util
import uuid
from pathlib import Path
from types import SimpleNamespace

import pytest

from app.models.reference import Scenario

_SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "measure_planning_staging.py"


def _load():
    spec = importlib.util.spec_from_file_location("measure_planning_staging", _SCRIPT)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_module_imports_without_side_effects(monkeypatch, capsys):
    created = []

    def fail_create_engine(*args, **kwargs):
        created.append((args, kwargs))
        raise AssertionError("engine created during import")

    monkeypatch.setattr("sqlalchemy.create_engine", fail_create_engine)
    _load()
    assert created == []
    assert capsys.readouterr().out == ""


def test_time_call_returns_one_duration_per_repeat():
    module = _load()
    calls = []

    async def fn():
        calls.append(None)

    durations = module.time_call(fn, 3)
    assert len(durations) == 3
    assert calls == [None, None, None]
    assert all(duration >= 0 for duration in durations)


@pytest.mark.parametrize(
    "statement",
    [
        "SELECT 1",
        "  select * from nav_history",
        "WITH recent AS (SELECT 1) SELECT * FROM recent",
        "PRAGMA foreign_keys=ON",
        "SHOW standard_conforming_strings",
        "select pg_catalog.version()",
        "SET TRANSACTION ISOLATION LEVEL READ COMMITTED",
        "BEGIN (implicit)",
    ],
)
def test_reads_and_connection_housekeeping_are_not_writes(statement):
    assert _load().is_write_statement(statement) is False


@pytest.mark.parametrize(
    "statement",
    [
        "INSERT INTO nav_history VALUES (1)",
        "  update portfolio_snapshots set total_value = 0",
        "DELETE FROM analytics_sections",
        "REPLACE INTO nav_history VALUES (1)",
        "CREATE TABLE x (id int)",
        "ALTER TABLE nav_history ADD COLUMN y int",
        "DROP TABLE nav_history",
        "TRUNCATE nav_history",
    ],
)
def test_writes_are_detected(statement):
    assert _load().is_write_statement(statement) is True


def test_guard_blocks_an_orm_flush(db_session):
    module = _load()
    counter = module.StatementCounter()
    module.guard(db_session, counter)
    db_session.add(Scenario(id=uuid.uuid4(), name="Write", description="d"))
    with pytest.raises(module.WriteAttempted):
        db_session.flush()
    db_session.rollback()


def test_main_returns_2_when_a_write_is_attempted(db_session, monkeypatch, capsys):
    module = _load()
    monkeypatch.setattr(module, "make_engine", lambda: db_session.get_bind())
    monkeypatch.setattr(module, "list_household_members", lambda db, user_id: [SimpleNamespace(id=uuid.uuid4())])

    def writing_measure(db, user_id, runs, scenarios):
        db.add(Scenario(id=uuid.uuid4(), name="Forbidden", description="d"))
        db.flush()
        return []

    monkeypatch.setattr(module, "measure", writing_measure)
    result = module.main(["--user-id", str(uuid.uuid4())])
    output = capsys.readouterr().out.lower()
    assert result == 2
    assert "nothing was committed" in output
    db_session.rollback()


def test_main_returns_1_without_members(db_session, monkeypatch, capsys):
    module = _load()
    monkeypatch.setattr(module, "make_engine", lambda: db_session.get_bind())
    monkeypatch.setattr(module, "list_household_members", lambda db, user_id: [])
    result = module.main(["--user-id", str(uuid.uuid4())])
    output = capsys.readouterr().out.lower()
    assert result == 1
    assert "no household members" in output
