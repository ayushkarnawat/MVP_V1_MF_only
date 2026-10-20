import os
from pathlib import Path
import subprocess
import sys
import uuid
from decimal import Decimal

import pytest
from sqlalchemy import create_engine, func, select, text
from sqlalchemy.orm import Session

from app.db.base import Base
from app.models.reference import (
    Scenario, ScenarioCategoryAverage, ScenarioHypotheticalAssumption,
    ScenarioSchemeResult, Scheme,
)
from scripts.diagnose_duplicate_scenarios import find_duplicate_scenarios
from scripts.dedupe_scenarios import DedupeBlocked, dedupe_scenarios

TABLES = (ScenarioSchemeResult, ScenarioCategoryAverage, ScenarioHypotheticalAssumption, Scenario)


def test_model_index_rejects_duplicate_parents_but_allows_same_named_phases(db_session):
    from sqlalchemy.exc import IntegrityError

    first = _scenario(db_session, "First")
    second = _scenario(db_session, "Second")
    _scenario(db_session, "First", parent=first.id)
    _scenario(db_session, "First", parent=second.id)
    with pytest.raises(IntegrityError):
        _scenario(db_session, "First")
    db_session.rollback()


@pytest.fixture
def db(db_session):
    # Reproduce a pre-0043 database; never relax the model's constraint.
    db_session.execute(text("DROP INDEX IF EXISTS uq_scenarios_top_level_name"))
    db_session.commit()
    return db_session


def _scenario(db, name="Duplicate", *, parent=None, quick=None, identity=None):
    row = Scenario(id=identity or uuid.uuid4(), name=name, description="test", parent_scenario_id=parent, quick_market_pct=quick)
    db.add(row)
    db.commit()
    return row


def _dependents(db, scenario, results=1):
    for index in range(results):
        scheme = Scheme(name=f"Test {index}", amc_name="AMC", sebi_category="Equity")
        db.add(scheme)
        db.flush()
        db.add(ScenarioSchemeResult(scenario_id=scenario.id, scheme_id=scheme.id, pct_change=Decimal("-12.34")))
    db.add(ScenarioCategoryAverage(scenario_id=scenario.id, sebi_category="Equity", avg_pct_change=Decimal("-10"), scheme_count=1))
    db.add(ScenarioHypotheticalAssumption(scenario_id=scenario.id, asset_class="Equity", assumed_pct_change=Decimal("-20"), assumption_note="test"))
    db.commit()


def _counts(db):
    return {model.__tablename__: db.scalar(select(func.count()).select_from(model)) for model in TABLES}


def test_finds_a_duplicated_name_and_reports_which_copy_has_results(db):
    populated = _scenario(db, quick=Decimal("0"))
    empty = _scenario(db)
    _dependents(db, populated, 2)
    _scenario(db, "Phase", parent=populated.id)
    _scenario(db, "Unique")
    groups = find_duplicate_scenarios(db)
    assert [group.name for group in groups] == ["Duplicate"]
    copies = {copy.scenario_id: copy for copy in groups[0].copies}
    assert copies[populated.id].result_rows == 2
    assert copies[populated.id].has_quick_stats is True
    assert copies[populated.id].phase_count == 1
    assert copies[empty.id].result_rows == 0
    assert copies[empty.id].has_quick_stats is False
    assert copies[populated.id].assumption_count == 1  # _dependents adds one assumption
    assert copies[empty.id].assumption_count == 0


def test_dry_run_changes_nothing(db):
    keep = _scenario(db)
    remove = _scenario(db)
    _dependents(db, keep, 2)
    _dependents(db, remove)
    before = _counts(db)
    report = dedupe_scenarios(db, apply=False)
    assert report.kept == [keep.id]
    assert report.removed == [remove.id]
    assert report.rows_deleted == {"scenario_scheme_results": 1, "scenario_category_averages": 1, "scenario_hypothetical_assumptions": 1, "scenarios": 1}
    assert _counts(db) == before


def test_apply_keeps_the_copy_with_results_and_deletes_the_other_with_its_children(db):
    keep = _scenario(db)
    remove = _scenario(db, quick=Decimal("1"))
    _dependents(db, keep, 2)
    _dependents(db, remove)
    kept_id, removed_id = keep.id, remove.id
    report = dedupe_scenarios(db, apply=True)
    assert report.kept == [kept_id]
    assert report.removed == [removed_id]
    assert _counts(db) == {"scenario_scheme_results": 2, "scenario_category_averages": 1, "scenario_hypothetical_assumptions": 1, "scenarios": 1}
    assert db.scalar(select(Scenario.id)) == kept_id


def test_apply_removes_a_duplicate_parents_phase_rows_too(db):
    keep = _scenario(db)
    remove = _scenario(db)
    _dependents(db, keep, 2)
    kept_phase = _scenario(db, "Shared phase", parent=keep.id)
    removed_phase = _scenario(db, "Shared phase", parent=remove.id)
    _dependents(db, removed_phase)
    _dependents(db, remove)
    report = dedupe_scenarios(db, apply=True)
    assert report.rows_deleted == {"scenario_scheme_results": 2, "scenario_category_averages": 2, "scenario_hypothetical_assumptions": 2, "scenarios": 2}
    assert set(db.scalars(select(Scenario.id))) == {keep.id, kept_phase.id}
    assert _counts(db)["scenario_scheme_results"] == 2  # the kept copy's own results survive


def test_a_tie_keeps_the_copy_with_quick_stats(db):
    _scenario(db, identity=uuid.UUID(int=1))
    quick = _scenario(db, quick=Decimal("0"), identity=uuid.UUID(int=2))
    assert dedupe_scenarios(db, apply=False).kept == [quick.id]


def test_a_complete_tie_keeps_the_smallest_string_uuid(db):
    _scenario(db, identity=uuid.UUID(int=9))
    first = _scenario(db, identity=uuid.UUID(int=1))
    assert dedupe_scenarios(db, apply=True).kept == [first.id]


def test_no_duplicates_is_a_no_op(db):
    _scenario(db, "Unique")
    before = _counts(db)
    report = dedupe_scenarios(db, apply=True)
    assert report.kept == report.removed == []
    assert report.rows_deleted == {model.__tablename__: 0 for model in TABLES}
    assert _counts(db) == before


def test_phase_rows_sharing_a_name_across_different_parents_are_not_duplicates(db):
    first = _scenario(db, "First")
    second = _scenario(db, "Second")
    _scenario(db, "Phase", parent=first.id)
    _scenario(db, "Phase", parent=second.id)
    assert find_duplicate_scenarios(db) == []
    assert dedupe_scenarios(db, apply=True).removed == []
    assert db.scalar(select(func.count()).select_from(Scenario)) == 4


def test_default_is_read_only_even_with_pending_changes(db):
    _scenario(db)
    _scenario(db)
    db.autoflush = True
    pending = Scenario(name="Pending", description="not flushed")
    db.add(pending)
    dedupe_scenarios(db)
    assert pending.id is None
    with db.no_autoflush:
        assert db.scalar(select(func.count()).select_from(Scenario)) == 2


def test_failed_delete_rolls_back_all_dependent_removals(db, monkeypatch):
    keep = _scenario(db)
    remove = _scenario(db)
    _dependents(db, keep, 2)
    _dependents(db, remove)
    before = _counts(db)
    execute = db.execute

    def fail_on_parent(statement, *args, **kwargs):
        if getattr(statement, "is_delete", False) and statement.table.name == "scenarios":
            raise RuntimeError("test failure")
        return execute(statement, *args, **kwargs)

    monkeypatch.setattr(db, "execute", fail_on_parent)
    with pytest.raises(RuntimeError, match="test failure"):
        dedupe_scenarios(db, apply=True)
    assert _counts(db) == before


@pytest.mark.parametrize("script", ["diagnose_duplicate_scenarios", "dedupe_scenarios"])
def test_cli_defaults_only_report_on_a_test_database(tmp_path, script):
    url = f"sqlite:///{tmp_path / 'cli-test.db'}"
    engine = create_engine(url)
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        session.execute(text("DROP INDEX IF EXISTS uq_scenarios_top_level_name"))
        session.add_all([Scenario(name="Duplicate", description="one"), Scenario(name="Duplicate", description="two")])
        session.commit()
    environment = {**os.environ, "DATABASE_URL": url, "TEST_DATABASE_URL": ""}
    completed = subprocess.run([sys.executable, f"scripts/{script}.py"], cwd=Path(__file__).resolve().parents[2], env=environment, capture_output=True, text=True)
    assert completed.returncode == 0, completed.stderr
    assert completed.stdout.splitlines()[0] == f"Database: {url}"
    with Session(engine) as session:
        assert session.scalar(select(func.count()).select_from(Scenario)) == 2
    engine.dispose()


def test_apply_refuses_when_the_removed_copy_holds_more_phases(db):
    keep = _scenario(db)
    remove = _scenario(db)
    _dependents(db, keep, 2)
    for index in range(3):
        _scenario(db, f"Phase {index}", parent=remove.id)
    before = _counts(db)
    preview = dedupe_scenarios(db, apply=False)
    assert preview.kept == [keep.id] and len(preview.blocked) == 1
    assert str(remove.id) in preview.blocked[0] and "3 phases" in preview.blocked[0]
    with pytest.raises(DedupeBlocked, match="resolve by hand"):
        dedupe_scenarios(db, apply=True)
    assert _counts(db) == before


def test_apply_refuses_when_the_removed_copy_holds_more_assumptions(db):
    keep = _scenario(db)
    remove = _scenario(db)
    _dependents(db, keep, 2)  # 1 assumption
    for asset_class in ("Hybrid", "Other"):
        db.add(ScenarioHypotheticalAssumption(scenario_id=remove.id, asset_class=asset_class, assumed_pct_change=Decimal("-5"), assumption_note="seed"))
    db.commit()
    before = _counts(db)
    with pytest.raises(DedupeBlocked):
        dedupe_scenarios(db, apply=True)
    assert _counts(db) == before


def test_a_removed_copy_with_equal_phases_and_assumptions_is_not_blocked(db):
    keep = _scenario(db)
    remove = _scenario(db)
    _dependents(db, keep, 2)
    _dependents(db, remove)
    _scenario(db, "Phase", parent=keep.id)
    _scenario(db, "Phase", parent=remove.id)
    removed_id = remove.id
    report = dedupe_scenarios(db, apply=True)
    assert report.blocked == [] and report.removed == [removed_id]
