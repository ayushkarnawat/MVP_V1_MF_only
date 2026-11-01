"""Read-only benchmark audit; counts and percentage-point differences only.

    python scripts/benchmark_diff_report.py --user-id UUID
    python scripts/benchmark_diff_report.py --fixture synthetic.json

Needs fresh local holdings, snapshots and daily index history. No network,
no names, identifiers, holdings amounts or index levels in output. A missing
cache or any write attempt stops the report. Never activates a mapping.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import logging
import sys
import uuid
from decimal import Decimal
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import httpx
from sqlalchemy import event
from sqlalchemy.orm import Session

from scripts.benchmark_series_check import read_only_engine

PERIODS = ("1Y", "3Y", "5Y", "SI")


def compare_results(before: dict, after: dict) -> dict:
    """Pure comparison. Input rates are fractions; output differences are points."""
    differences, changed = [], 0
    for sid in sorted(before.keys() | after.keys()):
        old, new = before.get(sid, {}), after.get(sid, {})
        key_changed = old.get("index_key") != new.get("index_key")
        fund_changed = key_changed
        for period in PERIODS:
            a, b = old.get(period), new.get(period)
            if key_changed or a != b:
                fund_changed = True
                difference = (Decimal(b) - Decimal(a)) * Decimal("100") if a is not None and b is not None else None
                differences.append((period, difference))
        changed += int(fund_changed)
    return {"funds_checked": len(before.keys() | after.keys()), "funds_changed": changed, "differences": differences}


def print_report(result: dict) -> None:
    print(f"funds_checked={result['funds_checked']} funds_changed={result['funds_changed']} comparisons_changed={len(result['differences'])}")
    for number, (period, difference) in enumerate(result["differences"], 1):
        value = "not available" if difference is None else format(difference.quantize(Decimal("0.000001")), "f")
        print(f"comparison={number} period={period} difference_pp={value}")


def _comparison_payload(result):
    before = {r.scheme_id: {"index_key": r.benchmark_index, **{w.window: w.benchmark_xirr for w in r.windows}} for r in result.funds}
    after = {r.scheme_id: {"index_key": r.index_key, **{w.window: w.benchmark_xirr for w in r.windows}} for r in result.declared_comparison}
    return compare_results(before, after)


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--user-id", type=uuid.UUID)
    group.add_argument("--fixture", type=Path)
    args = parser.parse_args(argv)
    if args.fixture:
        payload = json.loads(args.fixture.read_text(), parse_float=Decimal)
        print_report(compare_results(payload["before"], payload["after"]))
        return 0
    from app.config import settings
    from app.services.analytics.benchmark import compute_fund_vs_benchmark
    from app.services.dashboard.household_members import list_household_members
    engine = None
    attempted = False

    async def no_network(*args, **kwargs):
        nonlocal attempted
        attempted = True
        raise RuntimeError("Audit needs fresh local data")

    previous_logging = logging.root.manager.disable
    logging.disable(logging.CRITICAL)
    try:
        engine = read_only_engine(settings.database_url)
        with Session(engine, autoflush=False) as db:
            @event.listens_for(db, "do_orm_execute")
            def no_write_statement(state):
                nonlocal attempted
                sql = str(state.statement).lstrip().upper()
                import re
                if not sql.startswith("SELECT ") or re.search(r"\b(INSERT|UPDATE|DELETE|REPLACE|CREATE|ALTER|DROP|TRUNCATE|INTO|CALL|COPY)\b", sql):
                    attempted = True
                    raise RuntimeError("Audit is read-only")
            @event.listens_for(db, "before_flush")
            def no_flush(*args):
                nonlocal attempted
                attempted = True
                raise RuntimeError("Audit is read-only")
            members = [m.id for m in list_household_members(db, args.user_id)]
            with patch.object(httpx.AsyncClient, "send", no_network):
                result = asyncio.run(compute_fund_vs_benchmark(db, members))
            if attempted or result.declared_comparison is None:
                raise RuntimeError("Audit needs fresh local data")
            print_report(_comparison_payload(result))
    except Exception:
        # Exceptions can contain SQL parameters; keep them out of the report.
        print("report_stopped=1")
        return 1
    finally:
        if engine is not None:
            engine.dispose()
        logging.disable(previous_logging)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
