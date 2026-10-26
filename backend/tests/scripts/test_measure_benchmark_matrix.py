import importlib.util
from pathlib import Path

import pytest

_SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "measure_benchmark_matrix.py"


def _load():
    spec = importlib.util.spec_from_file_location("measure_benchmark_matrix", _SCRIPT)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


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
def test_data_and_schema_changes_are_writes(statement):
    assert _load().is_write_statement(statement) is True


def test_nav_cache_inserts_are_let_through_only_when_allowed():
    module = _load()
    insert = "INSERT INTO nav_history (scheme_id, date, nav) VALUES (?, ?, ?)"
    assert module.is_write_statement(insert) is True
    assert module.is_write_statement(insert, allow_nav_writes=True) is False
    other = "INSERT INTO analytics_sections (user_id) VALUES (?)"
    assert module.is_write_statement(other, allow_nav_writes=True) is True
    assert module.is_write_statement("UPDATE nav_history SET nav = 1", allow_nav_writes=True) is True
