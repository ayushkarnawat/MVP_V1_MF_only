"""Trace the actual XIRR inputs for one invented household.

From backend: python scripts/xirr_caller_audit.py [--out PATH]
"""

import argparse
import asyncio
from contextlib import ExitStack
from datetime import date
from decimal import Decimal
from functools import partial
from pathlib import Path
import sys
from typing import Callable
from unittest.mock import patch

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.models.enums import BenchmarkIndex, BenchmarkReturnType, SchemePlanType, TransactionType
from app.models.reference import BenchmarkIndexHistory, NavHistory, SchemeBenchmark
from app.models.transaction import Transaction
from app.services.analytics import benchmark, benchmark_windows
from app.services.dashboard import holdings
from app.services.dashboard import xirr as dashboard_xirr
from app.services.fund_page import returns, summary
from app.services.fund_page.scope import ScopeContext
from tests.services.fund_page.factories import (
    add_folio, add_purchase, add_scheme, add_user_household, make_session,
)


APP_TODAY = date(2025, 1, 6)
IST_TODAY = date(2025, 1, 7)
PURCHASE = date(2023, 12, 1)
WINDOW_START = date(2023, 12, 31)
REDEMPTION = date(2024, 7, 1)
NAV_DATE = date(2025, 1, 3)

CashFlow = tuple[date, Decimal]
Solver = Callable[[list[CashFlow]], Decimal | None]
AuditRow = tuple[str, tuple[CashFlow, ...], Decimal | None]


class AuditDate(date):
    @classmethod
    def today(cls) -> date:
        return APP_TODAY


def record_solver(solver: Solver, rows: list[AuditRow]) -> Solver:
    def record(flows: list[CashFlow]) -> Decimal | None:
        frame = sys._getframe(1)
        caller = frame.f_globals["__name__"].removeprefix("app.services.")
        caller += f".{frame.f_code.co_name}"
        if frame.f_code.co_name == "portfolio_xirr" and frame.f_back is not None:
            parent = frame.f_back
            module = parent.f_globals["__name__"].removeprefix("app.services.")
            caller += f" <- {module}.{parent.f_code.co_name}"
        rate = solver(flows)
        rows.append((caller, tuple(flows), rate))
        return rate

    return record


async def audit() -> list[AuditRow]:
    rows: list[AuditRow] = []

    async def no_network(*args, **kwargs):
        raise AssertionError("The invented household must use local prices")

    async def no_nav_refresh(*args, **kwargs):
        # The fund page gets its price from the seeded database below.
        return None

    with make_session() as db, ExitStack() as stack:
        household = add_user_household(db, key="xirr-audit")
        scheme = add_scheme(
            db, "xirr-audit", "Equity Scheme - Flexi Cap Fund", SchemePlanType.DIRECT, "XR2",
        )
        folio = add_folio(db, scheme, household.asha_id, "XR2-A")
        purchase = add_purchase(db, folio, PURCHASE, Decimal("100"), Decimal("10"))
        db.add(Transaction(
            folio_id=folio.id, import_id=purchase.import_id, type=TransactionType.REDEMPTION,
            date=REDEMPTION, amount=Decimal("200"), units=Decimal("10"), nav=Decimal("20"),
        ))
        db.add_all([
            NavHistory(scheme_id=scheme.id, date=day, nav=Decimal(nav))
            for day, nav in ((PURCHASE, "10"), (WINDOW_START, "11"), (NAV_DATE, "14"))
        ])
        declared_index = BenchmarkIndex.NIFTY_50
        db.add(SchemeBenchmark(
            scheme_id=scheme.id, declared_benchmark_name="Synthetic Index",
            mapped_index_key=declared_index, match_quality="exact", verified_on=IST_TODAY,
        ))
        price_dates = [PURCHASE, WINDOW_START, REDEMPTION, NAV_DATE, APP_TODAY, IST_TODAY]
        levels = {}
        for index in benchmark.LEGACY_BENCHMARK_INDICES:
            closes = ("155", "175", "185") if index == declared_index else ("150", "160", "170")
            prices = [Decimal(value) for value in ("100", "110", "125", *closes)]
            levels[index] = benchmark_windows.IndexLevels(price_dates, prices)
            db.add_all([
                BenchmarkIndexHistory(
                    index_name=index, date=day, value=value, return_type=BenchmarkReturnType.TRI,
                )
                for day, value in zip(price_dates, prices, strict=True)
            ])
        db.flush()

        # The portfolio held 100 units at the window start. The end is already the next day in IST.
        opening_value = Decimal("1100")
        ctx = benchmark_windows.WindowContext(
            today=IST_TODAY,
            starts={"1Y": WINDOW_START, "3Y": None, "5Y": None},
            portfolio_start_values={"1Y": opening_value, "3Y": None, "5Y": None},
            fund_start_values={"1Y": {scheme.id: opening_value}, "3Y": {}, "5Y": {}},
        )

        async def window_inputs(*args, **kwargs):
            return ctx, levels

        stack.enter_context(patch.object(httpx.AsyncClient, "send", no_network))
        stack.enter_context(patch.object(summary, "ensure_recent_nav", no_nav_refresh))
        stack.enter_context(patch.object(benchmark, "_window_inputs", window_inputs))
        stack.enter_context(patch.object(benchmark_windows, "ist_today", lambda: IST_TODAY))
        stack.enter_context(patch.object(
            benchmark, "compute_holdings", partial(holdings.compute_holdings, stored_only=True),
        ))
        for module in (dashboard_xirr, holdings, benchmark, benchmark_windows):
            stack.enter_context(patch.object(module, "date", AuditDate))
        for module in (dashboard_xirr, benchmark, benchmark_windows, returns):
            stack.enter_context(patch.object(module, "xirr", record_solver(module.xirr, rows)))
        stack.enter_context(patch.object(
            benchmark_windows, "xirr_fast", record_solver(benchmark_windows.xirr_fast, rows),
        ))

        member_ids = [household.asha_id, household.dev_id]
        scope = ScopeContext(member_ids, "combined", True)
        holding_rows = await holdings.compute_holdings(db, member_ids, stored_only=True)
        dashboard_xirr.calculate_dashboard_xirr(db, member_ids, holding_rows)
        await benchmark.compute_portfolio_vs_benchmarks(db, member_ids)
        await benchmark.compute_fund_vs_benchmark(db, member_ids)
        await summary.build_summary(db, scheme, scope, household.user_id, APP_TODAY)
        await returns.current_returns(db, scheme, scope, household.user_id, APP_TODAY)

    # Repeated calls (e.g. Lifetime and Current with only one held fund) can share a row.
    return list(dict.fromkeys(rows))


def format_table(rows: list[AuditRow]) -> str:
    table = [("Caller", "Flows", "First date", "Last date", "Outflows", "Inflows", "Signed flows", "Rate")]
    for caller, flows, rate in rows:
        dates = [day for day, _ in flows]
        outflows = sum((amount for _, amount in flows if amount < 0), Decimal(0))
        inflows = sum((amount for _, amount in flows if amount > 0), Decimal(0))
        signed = ", ".join(f"{day}:{amount:+.2f}" for day, amount in flows)
        table.append((
            caller, str(len(flows)), str(min(dates)), str(max(dates)),
            f"{outflows:.2f}", f"{inflows:.2f}", signed, f"{rate:.12f}" if rate is not None else "None",
        ))
    widths = [max(map(len, column)) for column in zip(*table, strict=True)]
    return "\n".join(
        " | ".join(f"{cell:<{width}}" for cell, width in zip(row, widths, strict=True)).rstrip()
        for row in table
    ) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description="Trace XIRR inputs for one invented household.")
    parser.add_argument("--out", type=Path, help="Also write the audit table to this file")
    args = parser.parse_args()
    table = format_table(asyncio.run(audit()))
    if args.out is not None:
        args.out.write_text(table, encoding="utf-8", newline="\n")
    print(table, end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
