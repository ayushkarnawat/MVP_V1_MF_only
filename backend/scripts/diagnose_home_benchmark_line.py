"""Read-only diagnosis: why the Home graph's benchmark line may not draw (Batch D, item 13).

    python scripts/diagnose_home_benchmark_line.py --list-users
    python scripts/diagnose_home_benchmark_line.py --user-id <uuid> [--member-id <uuid>]

On the staging VM, inside the backend container (the deployed image does not contain this file, so it is
mounted for the one run; see Docs/orchestration/2026-11-13-batch-d-benchmark-diagnosis-prompt.md):

    cd /opt/unifolio-redesign/deploy/leapswitch
    docker compose run --rm -T -v /home/deploy/diag/diagnose_home_benchmark_line.py:/app/scripts/diagnose_home_benchmark_line.py:ro \
        backend python scripts/diagnose_home_benchmark_line.py --list-users

What it does. It calls the SAME functions the Home routes call (`resolve_scope`, `load_home_inputs`, `build_wealth_series`,
`recommend_benchmark`) for each period (1D, 1W, 1M, 1Y) and each of the five Home benchmarks, then applies the SAME
test the browser applies before it draws the second line (frontend `WealthCard.tsx`: available, not clipped, equal
point counts). It also reports how much index history is stored for each benchmark. Prints ONE JSON object.

What it prints: counts, dates, flags and index returns in percent. NO names, no folios, no rupee amounts, no
emails, no scheme names. The only identifiers are the user and member UUIDs you pass in.

Read-only: any INSERT/UPDATE/DELETE/DDL statement and any ORM flush aborts the run (exit code 2) and nothing is
committed. The Home inputs are built from stored prices only (no live fetch), exactly as the Home routes do.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import re
import sys
import uuid
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import distinct, event, func, select, text
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.enums import BenchmarkReturnType
from app.models.folio import Folio
from app.models.reference import BenchmarkIndexHistory
from app.models.user import HouseholdMember, User
from app.services.home.benchmarks import HOME_BENCHMARKS, load_cap_mix, recommend_benchmark
from app.services.home.context import load_home_inputs, resolve_scope
from app.services.home.wealth import build_wealth_series

PERIODS = ("1D", "1W", "1M", "1Y")
_WRITE_WORDS = re.compile(r"\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE|MERGE)\b", re.I)


class WriteAttempted(RuntimeError):
    pass


def _is_read_only(statement: str) -> bool:
    head = statement.lstrip().upper()
    if head.startswith(("SELECT", "SHOW", "PRAGMA")):
        return True
    # A WITH may carry a data-modifying statement (WITH d AS (DELETE ... RETURNING ...)).
    return head.startswith("WITH") and not _WRITE_WORDS.search(statement)


def install_read_only_guard(db: Session) -> None:
    @event.listens_for(db, "before_flush")
    def _no_flush(session, flush_context, instances):
        pending = list(session.new) + list(session.deleted) + [o for o in session.dirty if session.is_modified(o)]
        if pending:
            raise WriteAttempted("a database write (an ORM flush) was about to happen; nothing was committed.")

    @event.listens_for(db.get_bind(), "before_cursor_execute")
    def _no_write_sql(conn, cursor, statement, parameters, context, executemany):
        if not _is_read_only(statement):
            raise WriteAttempted(
                f"a non-read statement ({statement.lstrip()[:12]}...) was about to run; nothing was committed.",
            )


def _iso(value: date | None) -> str | None:
    return None if value is None else value.isoformat()


def list_users(db: Session) -> dict:
    rows = db.execute(
        select(
            HouseholdMember.user_id,
            func.count(distinct(HouseholdMember.id)),
            func.count(distinct(Folio.id)),
        )
        .outerjoin(Folio, Folio.household_member_id == HouseholdMember.id)
        .group_by(HouseholdMember.user_id)
        .order_by(func.count(distinct(Folio.id)).desc())
        .limit(15)
    ).all()
    return {"users": [{"user_id": str(u), "members": m, "folios": f} for u, m, f in rows],
            "note": "pick the user with the most folios; counts only"}


def index_history_report(db: Session, today: date) -> dict:
    out = {}
    for option in HOME_BENCHMARKS:
        entry = {}
        for return_type in (BenchmarkReturnType.TRI, BenchmarkReturnType.PRICE):
            rows = db.execute(
                select(BenchmarkIndexHistory.date)
                .where(BenchmarkIndexHistory.index_name == option.index, BenchmarkIndexHistory.return_type == return_type)
                .order_by(BenchmarkIndexHistory.date)
            ).scalars().all()
            recent = [d for d in rows if d >= today - timedelta(days=400)]
            gaps = [(b - a).days for a, b in zip(recent, recent[1:])]
            entry[return_type.value] = {
                "rows": len(rows),
                "first_date": _iso(rows[0]) if rows else None,
                "last_date": _iso(rows[-1]) if rows else None,
                "days_since_last": (today - rows[-1]).days if rows else None,
                "rows_last_400_days": len(recent),
                "largest_gap_days_last_400": max(gaps) if gaps else None,
            }
        out[option.index.value] = entry
    return out


def _nav_start(period: str, today: date) -> date:
    # Same rule as the Home route (api/home.py `_wealth`) for these four periods.
    if period == "1Y":
        return today - timedelta(days=373)
    if period == "1M":
        return today - timedelta(days=38)
    return today - timedelta(days=15)


def judge(series, bench) -> tuple[bool, str]:
    """The browser's own rule (WealthCard.tsx): the line is drawn only if the benchmark is available, not clipped
    and has exactly as many points as the portfolio series."""
    if bench is None:
        return False, "no benchmark object in the reply"
    if not bench.available:
        return False, "server says NOT AVAILABLE (no usable index rows on or before the end of the period)"
    if bench.clipped:
        return False, "CLIPPED: the period starts before the stored index history; the browser drops the line"
    if len(bench.points) != len(series.points):
        return False, f"POINT COUNTS DIFFER: portfolio {len(series.points)} vs benchmark {len(bench.points)}"
    if series.empty:
        return False, "portfolio series is empty"
    return True, "would draw"


async def run(db: Session, user_id: uuid.UUID, member_id: uuid.UUID | None) -> dict:
    now = datetime.now(ZoneInfo("Asia/Kolkata"))
    today = now.date()
    user = db.get(User, user_id)
    if user is None:
        raise SystemExit("error: no such user id")
    ctx = resolve_scope(db, user, member_id)
    result: dict = {
        "run_at_ist": now.isoformat(timespec="seconds"),
        "scope": ctx.scope,
        "members_in_scope": len(ctx.member_ids),
        "index_history": index_history_report(db, today),
    }
    try:
        result["alembic_version"] = db.execute(text("SELECT version_num FROM alembic_version")).scalar()
    except Exception as exc:  # noqa: BLE001 - not every database has the table (tests); the run must go on
        db.rollback()
        result["alembic_version"] = f"unavailable ({type(exc).__name__})"
    try:
        rec = recommend_benchmark(load_cap_mix(db, user.id, scope=ctx.scope, household_member_ids=ctx.member_ids))
        result["recommended"] = {"index": rec.index.value, "reason": rec.reason}
    except Exception as exc:  # noqa: BLE001 - diagnosis must keep going
        result["recommended"] = {"error": f"{type(exc).__name__}: {str(exc)[:160]}"}

    base = await load_home_inputs(db, ctx, today, nav_start=today - timedelta(days=15))
    result["holdings"] = {
        "funds": len(base.holdings),
        "funds_without_price": sum(1 for h in base.holdings if h.nav_unavailable),
        "latest_price_date": _iso(base.nav_as_of),
        "partial_prices_flag": base.partial,
        "funds_missing_todays_price": len(base.missing_funds),
    }

    grid: dict = {}
    for period in PERIODS:
        try:
            inputs = await load_home_inputs(db, ctx, today, nav_start=_nav_start(period, today))
        except Exception as exc:  # noqa: BLE001
            grid[period] = {"error": f"{type(exc).__name__}: {str(exc)[:160]}"}
            continue
        per_bench = {}
        for option in HOME_BENCHMARKS:
            try:
                series = build_wealth_series(db, ctx, inputs, today=today, period=period, benchmark=option.index)
            except Exception as exc:  # noqa: BLE001
                per_bench[option.index.value] = {"error": f"{type(exc).__name__}: {str(exc)[:160]}"}
                continue
            bench = series.benchmark
            draws, reason = judge(series, bench)
            per_bench[option.index.value] = {
                "would_draw": draws,
                "reason": reason,
                "text_line_shows": bool(bench is not None and bench.available and bench.pct is not None),
                "benchmark_pct": None if bench is None or bench.pct is None else format(bench.pct, "f"),
                "clipped": None if bench is None else bench.clipped,
                "effective_start": None if bench is None else _iso(bench.effective_start),
                "portfolio_points": len(series.points),
                "benchmark_points": None if bench is None else len(bench.points),
                "series_start": _iso(series.start),
                "series_end": _iso(series.end),
                "first_portfolio_point": _iso(series.points[0].date) if series.points else None,
                "last_portfolio_point": _iso(series.points[-1].date) if series.points else None,
                "first_benchmark_point": _iso(bench.points[0][0]) if bench is not None and bench.points else None,
                "last_benchmark_point": _iso(bench.points[-1][0]) if bench is not None and bench.points else None,
                "series_empty": series.empty,
                "series_clamped": series.clamped,
            }
        grid[period] = per_bench
    result["periods"] = grid

    cells = [v for p in grid.values() if "error" not in p for v in p.values()]
    reasons: dict[str, int] = {}
    for cell in cells:
        key = cell.get("reason") or ("error: " + cell.get("error", "?"))
        reasons[key] = reasons.get(key, 0) + 1
    result["summary"] = {
        "cells_checked": len(cells),
        "cells_that_would_draw": sum(1 for c in cells if c.get("would_draw")),
        "reasons": reasons,
    }
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    parser.add_argument("--list-users", action="store_true", help="print user ids with member and folio counts, then stop")
    parser.add_argument("--user-id", type=uuid.UUID)
    parser.add_argument("--member-id", type=uuid.UUID, default=None, help="test one member instead of the whole household")
    args = parser.parse_args(argv)
    if not args.list_users and args.user_id is None:
        print("error: give --list-users or --user-id", file=sys.stderr)
        return 2
    db = SessionLocal()
    try:
        install_read_only_guard(db)
        if args.list_users:
            print(json.dumps(list_users(db), indent=2))
            return 0
        print(json.dumps(asyncio.run(run(db, args.user_id, args.member_id)), indent=2, default=str))
        return 0
    except WriteAttempted as exc:
        print(f"FAIL read-only guard: {exc}", file=sys.stderr)
        return 2
    finally:
        db.rollback()
        db.close()


if __name__ == "__main__":
    sys.exit(main())
