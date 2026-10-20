"""Report duplicate top-level scenarios without changing the database."""
import sys
import uuid
from dataclasses import dataclass
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import create_engine, func, select
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session, aliased

from app.models.reference import Scenario, ScenarioHypotheticalAssumption, ScenarioSchemeResult


@dataclass
class ScenarioCopy:
    scenario_id: uuid.UUID
    result_rows: int
    has_quick_stats: bool
    phase_count: int
    assumption_count: int = 0


@dataclass
class DuplicateGroup:
    name: str
    copies: list[ScenarioCopy]


def find_duplicate_scenarios(db: Session) -> list[DuplicateGroup]:
    duplicate_names = (
        select(Scenario.name)
        .where(Scenario.parent_scenario_id.is_(None))
        .group_by(Scenario.name).having(func.count() > 1)
    )
    phase = aliased(Scenario)
    result_count = (
        select(func.count()).select_from(ScenarioSchemeResult)
        .where(ScenarioSchemeResult.scenario_id == Scenario.id)
        .correlate(Scenario).scalar_subquery()
    )
    phase_count = (
        select(func.count()).select_from(phase)
        .where(phase.parent_scenario_id == Scenario.id)
        .correlate(Scenario).scalar_subquery()
    )
    assumption_count = (
        select(func.count()).select_from(ScenarioHypotheticalAssumption)
        .where(ScenarioHypotheticalAssumption.scenario_id == Scenario.id)
        .correlate(Scenario).scalar_subquery()
    )
    query = (
        select(Scenario.name, Scenario.id, Scenario.quick_market_pct, result_count, phase_count, assumption_count)
        .where(Scenario.parent_scenario_id.is_(None), Scenario.name.in_(duplicate_names))
        .order_by(Scenario.name, Scenario.id)
    )
    groups: dict[str, DuplicateGroup] = {}
    with db.no_autoflush:
        for name, identity, quick, results, phases, assumptions in db.execute(query):
            group = groups.setdefault(name, DuplicateGroup(name, []))
            group.copies.append(ScenarioCopy(identity, results, quick is not None, phases, assumptions))
    return list(groups.values())


def _database_engine():
    from app.config import settings

    url = make_url(settings.database_url)
    print(f"Database: {url.render_as_string(hide_password=True)}", flush=True)
    return create_engine(url)


def main() -> int:
    engine = _database_engine()
    try:
        with Session(engine, autoflush=False) as db:
            print("Name\tScenario ID\tResult rows\tQuick stats\tPhases\tAssumptions")
            for group in find_duplicate_scenarios(db):
                for copy in group.copies:
                    print(f"{group.name}\t{copy.scenario_id}\t{copy.result_rows}\t{copy.has_quick_stats}\t{copy.phase_count}\t{copy.assumption_count}")
    finally:
        engine.dispose()
    return 0


if __name__ == "__main__":
    sys.exit(main())
