# backend/tests/scripts/test_compute_all_scenarios.py
import uuid
from datetime import date
from unittest.mock import patch

from app.models.reference import Scenario
from scripts.compute_all_scenarios import main


def _scenario(db, name, scenario_type="CRASH", parent=None):
    s = Scenario(id=uuid.uuid4(), name=name, description="d", start_date=date(2020, 1, 20),
                 end_date=date(2020, 3, 31), scenario_type=scenario_type, parent_scenario_id=parent)
    db.add(s)
    db.commit()
    return s


def test_computes_every_non_hypothetical_row_including_phases_and_groups(db_session):
    group = _scenario(db_session, "Group")
    phase = _scenario(db_session, "Phase", parent=group.id)
    plain = _scenario(db_session, "Plain")
    _scenario(db_session, "Hypo", scenario_type="HYPOTHETICAL")
    with patch("scripts.compute_all_scenarios.compute_scenario_results") as compute:
        failures = main(db_session)
    assert failures == 0
    assert {c.args[1].name for c in compute.call_args_list} == {"Group", "Phase", "Plain"}


def test_one_failing_scenario_does_not_stop_the_rest(db_session):
    _scenario(db_session, "Bad")
    _scenario(db_session, "Good")
    def compute(db, scenario):
        if scenario.name == "Bad":
            raise RuntimeError("no NAVs")
    with patch("scripts.compute_all_scenarios.compute_scenario_results", side_effect=compute) as mocked:
        failures = main(db_session)
    assert failures == 1
    assert {c.args[1].name for c in mocked.call_args_list} == {"Bad", "Good"}
