"""Read-only per-period category-pool number gate using stored reference data."""
from __future__ import annotations

import argparse
import asyncio
from collections.abc import Mapping
from contextlib import contextmanager
from datetime import date
from decimal import Decimal
import json
from pathlib import Path
import re
import sys
from unittest.mock import patch
import uuid

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session

from app.models.reference import Scheme
from app.services.analytics import category_ranking, performance_ranking
from app.services.analytics.category_ranking import PeriodReturns
from app.services.analytics.scheme_universe import canonical_category
from app.services.dashboard.holdings import compute_holdings
from app.services.dashboard.household_members import list_household_members
from scripts.category_average_diff_report import LocalUniverseClient


class WriteAttempted(RuntimeError):
    pass


def _tokens(statement: str) -> str:
    result: list[str] = []
    i = 0
    while i < len(statement):
        if statement.startswith("--", i):
            i += 2
            while i < len(statement) and statement[i] not in "\r\n":
                i += 1
            result.append(" ")
        elif statement.startswith("/*", i):
            i += 2
            while i < len(statement) and not statement.startswith("*/", i):
                i += 1
            if i == len(statement):
                raise WriteAttempted("Report refused an unterminated SQL comment.")
            i += 2
            result.append(" ")
        elif statement[i] in "\"'`[":
            end = "]" if statement[i] == "[" else statement[i]
            i += 1
            while i < len(statement):
                if statement[i] == end:
                    if end != "]" and i + 1 < len(statement) and statement[i + 1] == end:
                        i += 2
                        continue
                    i += 1
                    break
                i += 1
            else:
                raise WriteAttempted("Report refused an unterminated SQL quote.")
            result.append(" ")
        else:
            result.append(statement[i])
            i += 1
    return "".join(result)


@contextmanager
def guard(db: Session):
    attempted = False
    def refuse(*args):
        nonlocal attempted
        attempted = True
        raise WriteAttempted("Report stopped because a write was attempted; nothing was committed.")
    def no_write(conn, cursor, statement, parameters, context, executemany):
        tokens = re.sub(r"\bFOR\s+(?:NO\s+KEY\s+UPDATE|KEY\s+SHARE|UPDATE|SHARE)\b", " ",
                        _tokens(statement), flags=re.IGNORECASE)
        if re.search(r"\b(?:INSERT|UPDATE|DELETE|MERGE|REPLACE|TRUNCATE|DROP|ALTER|CREATE|"
                     r"PRAGMA|SET|ATTACH|DETACH|VACUUM|COMMIT|ROLLBACK|BEGIN|START|END|SAVEPOINT|"
                     r"RELEASE|LOCK|COPY|CALL|DO|SETVAL|NEXTVAL)\b", tokens, flags=re.IGNORECASE):
            refuse()
    bind = db.get_bind()
    event.listen(db, "before_flush", refuse)
    event.listen(bind, "before_cursor_execute", no_write)
    try:
        yield
        if attempted:
            refuse()
    finally:
        event.remove(db, "before_flush", refuse)
        event.remove(bind, "before_cursor_execute", no_write)


def _old_rule_averages(detailed: Mapping[uuid.UUID, PeriodReturns],
                       aaum_by_scheme: dict[uuid.UUID, Decimal] | None = None):
    """Pre-QA-12 rule: every period requires a 3Y return; size weighting is unchanged."""
    eligible = {sid: values for sid, values in detailed.items() if values[1] is not None}
    return category_ranking.category_period_weighted_averages(eligible, aaum_by_scheme or {})


async def _stored_nav_only(db: Session, schemes: list[Scheme]) -> None:
    pass


def _percent(value: Decimal | None) -> str:
    return "NA" if value is None else str((value * Decimal("100")).quantize(Decimal("0.01")))


async def _report(db: Session, user_id: uuid.UUID, today: date | None = None) -> None:
    today = today or date.today()
    members = list_household_members(db, user_id)
    holdings = await compute_holdings(db, [member.id for member in members], stored_only=True)
    ids = {uuid.UUID(str(holding.scheme_id)) for holding in holdings}
    schemes = db.query(Scheme).filter(Scheme.id.in_(ids)).order_by(Scheme.amfi_code).all() if ids else []
    client = LocalUniverseClient()
    one_changed = later_changed = 0
    with (patch.object(category_ranking, "get_category_peers", client.get_category_peers),
          patch.object(performance_ranking, "get_category_peers", client.get_category_peers),
          patch.object(category_ranking, "warm_nav_history", _stored_nav_only),
          patch.object(category_ranking, "_category_returns_cache", {}),
          patch.object(category_ranking, "_category_short_history_cache", {})):
        for scheme in schemes:
            if scheme.sebi_category and scheme.plan_type is not None:
                pool = await category_ranking.load_category_pool(db, scheme, today)
                sizes = category_ranking._latest_aaum_by_scheme(db, list(pool.detailed))
                before = _old_rule_averages(pool.detailed, sizes)
                after = pool.averages
                ranks = await performance_ranking.load_ranking_pools(db, scheme, today) if performance_ranking.is_rankable(scheme) else None
            else:
                before = after = category_ranking.category_period_weighted_averages({}, {})
                ranks = None
            one_changed += before["1y"].peers != after["1y"].peers
            later_changed += any(before[p].value != after[p].value for p in ("3y", "5y"))
            for period in ("1Y", "3Y", "5Y"):
                old, new = before[period.lower()], after[period.lower()]
                difference = None if old.value is None or new.value is None else new.value - old.value
                total = len(ranks.pools[period]) if ranks is not None else 0
                print(f"category={json.dumps(canonical_category(scheme.sebi_category) if scheme.sebi_category else '', ensure_ascii=False)} "
                      f"scheme_code={scheme.amfi_code} period={period} old_peers={old.peers} new_peers={new.peers} "
                      f"rank_total={total} old_average_percent={_percent(old.value)} new_average_percent={_percent(new.value)} "
                      f"difference_in_percentage_points={_percent(difference)}")
    print(f"funds_checked={len(schemes)}")
    print(f"funds_1y_count_changed={one_changed}")
    print(f"funds_3y_or_5y_value_changed={later_changed}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--user-id", type=uuid.UUID, required=True)
    args = parser.parse_args(argv)
    from app.config import settings
    engine = create_engine(settings.database_url)
    if engine.dialect.name == "postgresql":
        engine = engine.execution_options(postgresql_readonly=True)
    try:
        with Session(engine, autoflush=False) as db, guard(db):
            asyncio.run(_report(db, args.user_id))
    except Exception:
        print("Report stopped: fresh local reference data is required; no changes were committed.", file=sys.stderr)
        return 1
    finally:
        engine.dispose()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
