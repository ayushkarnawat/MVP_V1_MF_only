"""Read-only staging timing check for Planning scenario results.

    python scripts/measure_planning_staging.py --user-id <uuid> [--runs 3] [--scenarios 3]

Run this on the staging VM against the staging database. It measures each ranked
scenario first for the whole family and then once per household member. Each scope
gets one cold call after its holdings cache is cleared, followed by warm calls.
Only counts, member ordinals, scenario ordinals, and timings are printed: never
names or monetary values. Any ORM or SQL write aborts the run.
"""

import argparse
import asyncio
import re
import statistics
import sys
import time
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import create_engine, event
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from app.config import settings
from app.models.reference import Scenario


class WriteAttempted(RuntimeError):
    pass


class StatementCounter:
    def __init__(self) -> None:
        self.enabled = False
        self.count = 0
        self.write_error: str | None = None

    def check_read_only(self) -> None:
        if self.write_error is not None:
            message = self.write_error
            self.write_error = None
            raise WriteAttempted(message)


_LOOP = asyncio.new_event_loop()
_WRITE_VERBS = ("INSERT", "UPDATE", "DELETE", "REPLACE", "CREATE", "ALTER", "DROP", "TRUNCATE")
_SQL_IGNORED = re.compile(
    r"--[^\n]*(?:\n|$)|/\*.*?\*/|'(?:''|[^'])*'|\"(?:\"\"|[^\"])*\"",
    re.DOTALL,
)


def run_async(coro):
    return _LOOP.run_until_complete(coro)


def is_write_statement(statement: str) -> bool:
    sql = _SQL_IGNORED.sub(" ", statement).upper()
    return any(re.search(rf"\b{verb}\b", sql) for verb in _WRITE_VERBS)


def guard(db: Session, counter: StatementCounter) -> None:
    @event.listens_for(db, "before_flush")
    def _no_flush(session, ctx, instances):
        counter.write_error = "an ORM write was about to run; nothing was committed."
        raise WriteAttempted(counter.write_error)

    @event.listens_for(db.get_bind(), "before_cursor_execute")
    def _select_only(conn, cursor, statement, parameters, context, executemany):
        if is_write_statement(statement):
            counter.write_error = "a write statement was about to run; nothing was committed."
            raise WriteAttempted(counter.write_error)
        if counter.enabled:
            counter.count += 1


def ms(t0: float) -> float:
    return (time.perf_counter() - t0) * 1000


def time_call(fn, repeat: int) -> list[float]:
    durations = []
    for _ in range(repeat):
        t0 = time.perf_counter()
        run_async(fn())
        durations.append(time.perf_counter() - t0)
    return durations


def make_engine():
    url = make_url(settings.database_url)
    engine = create_engine(url)
    if url.get_backend_name() == "postgresql":
        return engine.execution_options(postgresql_readonly=True)
    return engine


def list_household_members(db: Session, user_id: uuid.UUID):
    from app.services.dashboard.household_members import list_household_members as load_members

    return load_members(db, user_id)


def invalidate_holdings_cache(member_id: uuid.UUID) -> None:
    from app.services.dashboard.holdings import invalidate_holdings_cache as invalidate

    invalidate(member_id)


def measure(db: Session, user_id: uuid.UUID, runs: int, scenarios: int) -> list[tuple[str, str, float, float]]:
    from app.services.analytics.scenario_engine import _async_get_scenario_result_for_household

    members = list_household_members(db, user_id)
    member_ids = [member.id for member in members]
    selected = (
        db.query(Scenario)
        .filter(
            Scenario.parent_scenario_id.is_(None),
            Scenario.display_rank.isnot(None),
        )
        .order_by(Scenario.display_rank)
        .limit(scenarios)
        .all()
    )
    scopes = [("family", member_ids)]
    scopes.extend((f"member {position}", [member_id]) for position, member_id in enumerate(member_ids, 1))
    rows: list[tuple[str, str, float, float]] = []
    for ordinal, scenario in enumerate(selected, 1):
        for label, scope_ids in scopes:
            for member_id in scope_ids:
                invalidate_holdings_cache(member_id)

            async def call(current=scenario, ids=scope_ids):
                return await _async_get_scenario_result_for_household(db, current, ids)

            durations = time_call(call, runs)
            warm = durations[1:] or durations[:1]
            rows.append((f"scenario {ordinal}", label, durations[0], statistics.median(warm)))
    return rows


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--user-id", required=True, type=uuid.UUID)
    parser.add_argument("--runs", type=int, default=3)
    parser.add_argument("--scenarios", type=int, default=3)
    args = parser.parse_args(argv)
    if args.runs < 1:
        parser.error("--runs must be at least 1")
    if args.scenarios < 1:
        parser.error("--scenarios must be at least 1")

    engine = make_engine()
    try:
        with Session(engine, autoflush=False) as db:
            counter = StatementCounter()
            guard(db, counter)
            members = list_household_members(db, args.user_id)
            print(f"members: {len(members)} | scenarios requested: {args.scenarios}")
            if not members:
                print("No household members found.")
                return 1
            print("Each family/member scope pays one cold cache fill; remaining calls are warm.")
            rows = measure(db, args.user_id, args.runs, args.scenarios)
            counter.check_read_only()
            print("scenario     scope       cold s   warm median s")
            for scenario_label, scope_label, cold, warm in rows:
                print(f"{scenario_label:<12} {scope_label:<11} {cold:>7.3f} {warm:>15.3f}")
            db.rollback()
    except WriteAttempted as exc:
        print(f"ABORTED (read-only): {exc}", flush=True)
        return 2
    finally:
        engine.dispose()
    return 0


if __name__ == "__main__":
    sys.exit(main())
