# backend/tests/scripts/test_refresh_nav_daily_scenario_recompute.py
import sys
import uuid
from datetime import date
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models.reference import Scenario
from scripts.jobs.refresh_nav_daily import recompute_ongoing_scenarios


def _session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    return sessionmaker(autoflush=False, bind=engine)()


def test_recompute_ongoing_scenarios_only_touches_is_ongoing_rows():
    db = _session()
    ongoing = Scenario(id=uuid.uuid4(), name="US-Iran war -- Relapse", description="d", start_date=date(2026, 7, 8), end_date=None, scenario_type="CRASH", is_ongoing=True)
    settled = Scenario(id=uuid.uuid4(), name="COVID crash", description="d", start_date=date(2020, 1, 20), end_date=date(2020, 3, 31), scenario_type="CRASH", is_ongoing=False)
    db.add_all([ongoing, settled])
    db.commit()

    with patch("scripts.jobs.refresh_nav_daily.compute_scenario_results") as mock_compute:
        recompute_ongoing_scenarios(db)

    called_ids = {call.args[1].id for call in mock_compute.call_args_list}
    assert called_ids == {ongoing.id}


def test_daily_recompute_includes_ongoing_group_and_phase_and_continues_after_failure():
    db = _session()
    group = Scenario(name="Group", description="d", start_date=date(2026, 2, 28), is_ongoing=True)
    db.add(group)
    db.commit()
    phase = Scenario(name="Phase", description="d", start_date=date(2026, 7, 8), parent_scenario_id=group.id, is_ongoing=True)
    db.add(phase)
    db.commit()

    def compute(db, scenario):
        if scenario.id == group.id:
            raise RuntimeError("broken window")

    with patch("scripts.jobs.refresh_nav_daily.compute_scenario_results", side_effect=compute) as mocked:
        recompute_ongoing_scenarios(db)
    assert {call.args[1].id for call in mocked.call_args_list} == {group.id, phase.id}
