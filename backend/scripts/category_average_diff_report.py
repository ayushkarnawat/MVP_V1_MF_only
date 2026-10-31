"""Read-only category-average comparison, using local reference data only.

Run from backend: python scripts/category_average_diff_report.py --user-id <uuid>
The output contains counts and percentage-point differences only. No names,
identifiers, NAVs, sizes or holding amounts are printed. Fresh local universe
and NAV caches are required; any attempted write aborts the report.
"""
from __future__ import annotations

import argparse
import asyncio
import re
import sys
import uuid
from datetime import date
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session

from app.models.reference import Scheme
from app.services.analytics.category_ranking import (
    _aum_weighted_average, _blend_returns, _bulk_nav_on_or_before, _cagr,
    _latest_aaum_by_scheme, category_period_averages,
)
from app.services.analytics.risk_metrics import years_ago
from app.services.analytics.scheme_universe import SchemeUniverseClient, canonical_category
from app.services.dashboard.household_members import list_household_members


def compare_category_averages(detailed: dict, aaum_by_scheme: dict) -> dict:
    """Pure old-size-weighted versus new-simple comparison on the same pool.

    Returns are fractions; only the difference is in percentage points.
    A missing old/new average has no numeric difference, rather than zero.
    """
    eligible = {sid: values for sid, values in detailed.items() if values[1] is not None}
    after = category_period_averages(eligible)
    result = {}
    for period, index in (("1y", 0), ("3y", 1), ("5y", 2)):
        pool = {sid: values[index] for sid, values in eligible.items() if values[index] is not None}
        before = _aum_weighted_average(pool, aaum_by_scheme)
        mean, count = after[period]
        result[period] = {
            "before": before, "after": mean,
            "difference_pp": (mean - before) * Decimal("100") if mean is not None and before is not None else None,
            "peers_before": sum(1 for sid in pool if aaum_by_scheme.get(sid) is not None),
            "peers_after": count,
        }
    return result


class WriteAttempted(RuntimeError):
    pass


class ReadOnlyGuard:
    def __init__(self, db: Session):
        self.attempted = False

        @event.listens_for(db, "before_flush")
        def no_flush(*_):
            self.refuse()

        @event.listens_for(db.get_bind(), "before_cursor_execute")
        def no_write(conn, cursor, statement, parameters, context, executemany):
            # Fail closed, including data-changing CTEs and schema statements.
            # Transaction setup/driver housekeeping is handled by SQLAlchemy.
            if not re.match(r"^\s*(SELECT|WITH)\b", statement, re.I) or re.search(
                r"\b(INSERT|UPDATE|DELETE|REPLACE|CREATE|ALTER|DROP|TRUNCATE|INTO|CALL|COPY)\b", statement, re.I
            ):
                self.refuse()

    def refuse(self):
        self.attempted = True
        raise WriteAttempted("Report stopped because a write was attempted; nothing was committed.")

    def check(self):
        if self.attempted:
            self.refuse()


class LocalUniverseClient(SchemeUniverseClient):
    async def _fetch_nav_all_text(self):
        raise RuntimeError("Report needs a fresh local universe cache; no network request was made.")


def _local_returns(db: Session, schemes: list[Scheme], today: date) -> dict:
    targets = [years_ago(today, years) for years in (1, 3, 5)]
    navs = _bulk_nav_on_or_before(db, [scheme.id for scheme in schemes], [*targets, today])
    detailed = {}
    for scheme in schemes:
        row = navs.get(scheme.id, {})
        end, start3 = row.get(today), row.get(targets[1])
        if end is None or start3 is None or end <= 0 or start3 <= 0:
            continue
        values = [_cagr(row[target], end, years) if row.get(target) is not None and row[target] > 0 else None
                  for target, years in zip(targets, (1, 3, 5))]
        detailed[scheme.id] = (*values, _blend_returns(values[1], values[2]))
    return detailed


async def _report(db: Session, user_id: uuid.UUID, guard: ReadOnlyGuard):
    from app.services.dashboard.holdings import compute_holdings
    members = list_household_members(db, user_id)
    holdings = await compute_holdings(db, [member.id for member in members], stored_only=True)
    guard.check()
    ids = {uuid.UUID(holding.scheme_id) for holding in holdings}
    schemes = db.query(Scheme).filter(Scheme.id.in_(ids)).all()
    client = LocalUniverseClient()
    comparisons = {}
    missing = 0
    for scheme in sorted(schemes, key=lambda scheme: str(scheme.id)):
        if not scheme.sebi_category:
            missing += 1
            continue
        key = (canonical_category(scheme.sebi_category), scheme.plan_type)
        if key not in comparisons:
            peers = await client.get_category_peers(db, scheme.sebi_category, scheme.plan_type)
            guard.check()
            detailed = _local_returns(db, peers.schemes, date.today())
            comparisons[key] = compare_category_averages(detailed, _latest_aaum_by_scheme(db, list(detailed)))
        for period, values in comparisons[key].items():
            difference = values["difference_pp"]
            text = "not available" if difference is None else str(difference.quantize(Decimal(".0001")))
            print(f"period={period} peers_before={values['peers_before']} peers_after={values['peers_after']} difference_pp={text}")
    guard.check()
    print(f"funds={len(schemes)} categories_and_plans={len(comparisons)} without_category={missing}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--user-id", type=uuid.UUID, required=True)
    args = parser.parse_args()
    from app.config import settings
    engine = create_engine(settings.database_url)
    if engine.dialect.name == "postgresql":
        engine = engine.execution_options(postgresql_readonly=True)
    try:
        with Session(engine, autoflush=False) as db:
            guard = ReadOnlyGuard(db)
            asyncio.run(_report(db, args.user_id, guard))
    except Exception:
        # Database errors can contain names or amounts in SQL parameters. Keep them out of the report.
        print("Report stopped: fresh local reference data is required; no changes were committed.", file=sys.stderr)
        return 1
    finally:
        engine.dispose()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
