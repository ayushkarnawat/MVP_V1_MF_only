import asyncio
from datetime import date
from types import SimpleNamespace
from unittest.mock import AsyncMock
import uuid

import pytest
from sqlalchemy import text
from tests.scripts.test_export_category_average_excel import world, TODAY, _SnapshotUniverse


@pytest.fixture
def report_output(db_session, world, monkeypatch, capsys):
    from scripts import category_pool_before_after as report

    client = _SnapshotUniverse(world[0], TODAY)
    client.stored = world[1]
    member_id = uuid.uuid4()
    monkeypatch.setattr(report, "LocalUniverseClient", lambda: client)
    monkeypatch.setattr(report, "list_household_members", lambda *args: [
        SimpleNamespace(id=member_id, name="Private Invented Person")])
    monkeypatch.setattr(report, "compute_holdings", AsyncMock(return_value=[
        SimpleNamespace(scheme_id=str(world[1]["910101"].id), invested_value="987654321.00")]))
    with report.guard(db_session):
        asyncio.run(report._report(db_session, uuid.uuid4(), TODAY))
    return capsys.readouterr().out


def test_before_after_marks_a_short_history_peer_as_a_1y_count_change_only(report_output):
    lines = report_output.splitlines()
    one = next(line for line in lines if "period=1Y " in line)
    assert "old_peers=5 new_peers=6 rank_total=6" in one
    assert "scheme_code=910101" in one
    assert "funds_1y_count_changed=1" in lines
    assert "funds_checked=1" in lines


def test_before_after_shows_zero_change_at_3y_and_5y(report_output):
    lines = report_output.splitlines()
    for period in ("3Y", "5Y"):
        line = next(line for line in lines if f"period={period} " in line)
        assert "difference_in_percentage_points=0.00" in line
    assert "funds_3y_or_5y_value_changed=0" in lines


@pytest.mark.parametrize("statement", ["UPDATE schemes SET name = 'probe'",
    "-- hidden\nUPDATE schemes SET name = 'probe'",
    "WITH marker AS (SELECT 1) UPDATE schemes SET name = 'probe'"])
def test_script_aborts_on_any_write_attempt(db_session, statement):
    from scripts import category_pool_before_after as report

    with pytest.raises(report.WriteAttempted), report.guard(db_session):
        db_session.execute(text(statement))


def test_script_prints_no_member_names_or_amounts(report_output):
    assert "Private Invented Person" not in report_output
    assert "987654321" not in report_output
    assert len(report_output.splitlines()) == 6
    assert not any(word in report_output for word in ("member_id", "folio", "user_id", "@"))
