"""Preview scenario cleanup; pass --apply to commit all removals atomically."""
import argparse
import sys
import uuid
from dataclasses import dataclass, field
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.models.reference import (
    Scenario, ScenarioCategoryAverage, ScenarioHypotheticalAssumption, ScenarioSchemeResult,
)
from scripts.diagnose_duplicate_scenarios import _database_engine, find_duplicate_scenarios


@dataclass
class DedupeReport:
    kept: list[uuid.UUID]
    removed: list[uuid.UUID]
    rows_deleted: dict[str, int]
    # Groups where a copy to remove holds more phases or assumptions (seed data that
    # nothing can recompute) than the copy to keep. --apply refuses while any exist.
    blocked: list[str] = field(default_factory=list)


class DedupeBlocked(RuntimeError):
    pass


_DEPENDENTS = (ScenarioSchemeResult, ScenarioCategoryAverage, ScenarioHypotheticalAssumption)


def dedupe_scenarios(db: Session, *, apply: bool = False) -> DedupeReport:
    report = DedupeReport([], [], {model.__tablename__: 0 for model in (*_DEPENDENTS, Scenario)})
    try:
        with db.no_autoflush:
            for group in find_duplicate_scenarios(db):
                copies = sorted(group.copies, key=lambda copy: (
                    -copy.result_rows, -int(copy.has_quick_stats), str(copy.scenario_id),
                ))
                report.kept.append(copies[0].scenario_id)
                report.removed.extend(copy.scenario_id for copy in copies[1:])
                for copy in copies[1:]:
                    if copy.phase_count > copies[0].phase_count or copy.assumption_count > copies[0].assumption_count:
                        report.blocked.append(
                            f"{group.name}: would keep {copies[0].scenario_id} "
                            f"({copies[0].phase_count} phases, {copies[0].assumption_count} assumptions) "
                            f"but remove {copy.scenario_id} ({copy.phase_count} phases, {copy.assumption_count} assumptions)"
                        )
            if not report.removed:
                return report
            if report.blocked and apply:
                raise DedupeBlocked(
                    "Refusing to remove a copy that holds more phases or assumptions than the one kept; "
                    "resolve by hand:\n" + "\n".join(report.blocked)
                )
            phases = list(db.scalars(select(Scenario.id).where(Scenario.parent_scenario_id.in_(report.removed))))
            all_ids = phases + report.removed
            for model in _DEPENDENTS:
                report.rows_deleted[model.__tablename__] = db.scalar(
                    select(func.count()).select_from(model).where(model.scenario_id.in_(all_ids))
                )
            report.rows_deleted[Scenario.__tablename__] = len(all_ids)
            if not apply:
                return report
            # The self-reference has no cascade: remove phase dependents and phases first.
            for identities in (phases, report.removed):
                if not identities:
                    continue
                for model in _DEPENDENTS:
                    db.execute(delete(model).where(model.scenario_id.in_(identities)))
                db.execute(delete(Scenario).where(Scenario.id.in_(identities)))
            db.commit()
    except Exception:
        if apply:
            db.rollback()
        raise
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Commit the proposed removals")
    args = parser.parse_args()
    engine = _database_engine()
    try:
        with Session(engine, autoflush=False) as db:
            try:
                report = dedupe_scenarios(db, apply=args.apply)
            except DedupeBlocked as blocked:
                print(blocked, file=sys.stderr)
                return 1
            print("Applied" if args.apply else "Dry run (no changes)")
            print(f"Kept: {', '.join(map(str, report.kept)) or 'none'}")
            print(f"Removed: {', '.join(map(str, report.removed)) or 'none'}")
            print("Table\tRows removed" if args.apply else "Table\tRows to remove")
            for table, count in report.rows_deleted.items():
                print(f"{table}\t{count}")
            for line in report.blocked:
                print(f"BLOCKED (--apply would refuse): {line}")
    finally:
        engine.dispose()
    return 0


if __name__ == "__main__":
    sys.exit(main())
