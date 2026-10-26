"""Pure windowed portfolio and benchmark XIRR calculations."""

from calendar import monthrange
from bisect import bisect_right
from collections.abc import Callable, Iterable, Sequence
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal
from typing import Mapping
import uuid

from sqlalchemy.orm import Session

from app.models.enums import (
    ALL_BENCHMARK_INDICES,
    BenchmarkIndex,
    BenchmarkReturnType,
    TransactionType,
)
from app.models.reference import BenchmarkIndexHistory
from app.models.transaction import Transaction
from app.services.analytics.benchmark import _portfolio_xirr, _signed_amount, _xirr_str
from app.services.analytics.schemas import BenchmarkWindowRow, FundWindowXirr, IndexXirrRow
from app.services.analytics.xirr import xirr
from app.services.analytics.xirr_fast import xirr_fast
from app.services.dashboard.snapshots import get_month_detail, get_snapshots

WINDOWS: tuple[str, ...] = ("1Y", "3Y", "5Y", "SI")
WINDOW_YEARS: dict[str, int | None] = {"1Y": 1, "3Y": 3, "5Y": 5, "SI": None}


class IndexLevels:
    def __init__(self, dates: Sequence[date], values: Sequence[Decimal]) -> None:
        self.dates = list(dates)
        self.values = list(values)

    def on_or_before(self, d: date) -> Decimal | None:
        position = bisect_right(self.dates, d) - 1
        if position < 0 or d - self.dates[position] > timedelta(days=10):
            return None
        return self.values[position]


@dataclass(frozen=True)
class WindowContext:
    today: date
    starts: dict[str, date | None]
    portfolio_start_values: dict[str, Decimal | None]
    fund_start_values: dict[str, dict[uuid.UUID, Decimal]]


@dataclass(frozen=True)
class SinceInceptionRates:
    portfolio: Decimal | None
    indices: Mapping[BenchmarkIndex, Decimal | None]


def window_start(window: str, today: date) -> date | None:
    if window not in WINDOW_YEARS:
        raise ValueError(f"Unknown benchmark window: {window}")
    years = WINDOW_YEARS[window]
    if years is None:
        return None
    last_completed = today.replace(day=1) - timedelta(days=1)
    year = last_completed.year - years
    return date(year, last_completed.month, monthrange(year, last_completed.month)[1])


async def build_window_context(
    db: Session,
    member_ids: list[uuid.UUID],
    today: date,
) -> WindowContext:
    starts = {window: window_start(window, today) for window in WINDOWS}
    snapshot_rows = await get_snapshots(db, member_ids)
    snapshots_by_member = {}
    for row in snapshot_rows:
        snapshots_by_member.setdefault(uuid.UUID(row.household_member_id), []).append(row)

    portfolio_start_values: dict[str, Decimal | None] = {"SI": None}
    fund_start_values: dict[str, dict[uuid.UUID, Decimal]] = {"SI": {}}
    detail_by_start = {}
    for window in WINDOWS[:-1]:
        start = starts[window]
        if start is None:
            portfolio_start_values[window] = None
            fund_start_values[window] = {}
            continue

        total = Decimal("0")
        available = True
        for member_id in member_ids:
            rows = snapshots_by_member.get(member_id, [])
            if not rows:
                continue
            first_month = min(row.snapshot_month for row in rows)
            if first_month > start:
                continue
            opening = next((row for row in rows if row.snapshot_month == start), None)
            if opening is None or opening.is_partial:
                available = False
                break
            total += Decimal(opening.total_value)
        portfolio_start_values[window] = total if available and total > 0 else None

        if start not in detail_by_start:
            detail_by_start[start] = await get_month_detail(db, member_ids, start)
        detail = detail_by_start[start]
        if detail is None:
            fund_start_values[window] = {}
            continue
        rows_by_scheme = {}
        for row in detail.funds:
            rows_by_scheme.setdefault(uuid.UUID(row.scheme_id), []).append(row)
        values = {}
        for scheme_id, rows in rows_by_scheme.items():
            if any(not row.priced or row.value is None for row in rows):
                continue
            value = sum((Decimal(row.value) for row in rows), Decimal("0"))
            if value > 0:
                values[scheme_id] = value
        fund_start_values[window] = values

    return WindowContext(
        today=today,
        starts=starts,
        portfolio_start_values=portfolio_start_values,
        fund_start_values=fund_start_values,
    )


def load_index_levels(
    db: Session,
    indices: Iterable[BenchmarkIndex],
    start: date,
    end: date,
) -> dict[BenchmarkIndex, IndexLevels]:
    loaded = {}
    for index in indices:
        rows = (
            db.query(BenchmarkIndexHistory.date, BenchmarkIndexHistory.value)
            .filter(
                BenchmarkIndexHistory.index_name == index,
                BenchmarkIndexHistory.return_type == BenchmarkReturnType.TRI,
                BenchmarkIndexHistory.date >= start - timedelta(days=10),
                BenchmarkIndexHistory.date <= end,
            )
            .order_by(BenchmarkIndexHistory.date)
            .all()
        )
        loaded[index] = IndexLevels(
            [row.date for row in rows],
            [row.value for row in rows],
        )  # column rows, not ORM entities: tens of thousands of rows per call
    return loaded


def index_window_xirr(
    levels: IndexLevels,
    flows: Sequence[tuple[date, Decimal]],
    start: date | None,
    start_value: Decimal | None,
    today: date,
    solver: Callable[[list[tuple[date, Decimal]]], Decimal | None] | None = None,
) -> Decimal | None:
    units = Decimal("0")
    replayed: list[tuple[date, Decimal]] = []
    if start is not None:
        start_level = levels.on_or_before(start)
        if start_level is None or start_value is None:
            return None
        units = start_value / start_level
        replayed.append((start, -start_value))

    for flow_date, signed in flows:
        level = levels.on_or_before(flow_date)
        if level is None:
            continue
        if signed < 0:
            units += -signed / level
        else:
            units -= signed / level
        replayed.append((flow_date, signed))

    terminal_level = levels.on_or_before(today)
    if terminal_level is None or not replayed:
        return None
    replayed.append((today, units * terminal_level))
    return (solver or xirr)(replayed)


def _index_rows(
    flows: Sequence[tuple[date, Decimal]],
    start: date | None,
    start_value: Decimal | None,
    today: date,
    levels: Mapping[BenchmarkIndex, IndexLevels],
    solver: Callable[[list[tuple[date, Decimal]]], Decimal | None] | None = None,
    known_rates: Mapping[BenchmarkIndex, Decimal | None] | None = None,
) -> list[IndexXirrRow]:
    rows = []
    for index in ALL_BENCHMARK_INDICES:
        if known_rates is not None and index in known_rates:
            rate = known_rates[index]
        else:
            index_levels = levels.get(index, IndexLevels([], []))
            rate = index_window_xirr(
                index_levels,
                flows,
                start,
                start_value,
                today,
                solver,
            )
        rows.append(IndexXirrRow(index=index, xirr=_xirr_str(rate)))
    return rows


def compute_window_rows(
    ctx: WindowContext,
    transactions: Sequence[Transaction],
    current_value: Decimal,
    levels: Mapping[BenchmarkIndex, IndexLevels],
    since_inception: SinceInceptionRates | None = None,
) -> list[BenchmarkWindowRow]:
    if not transactions:
        return []

    rows = []
    for window in WINDOWS:
        if window == "SI":
            flows = [(txn.date, _signed_amount(txn)) for txn in transactions]
            if since_inception is None:
                portfolio_rate = _portfolio_xirr(list(transactions), current_value)
                index_rows = _index_rows(flows, None, None, ctx.today, levels)
            else:
                portfolio_rate = since_inception.portfolio
                index_rows = _index_rows(
                    flows,
                    None,
                    None,
                    ctx.today,
                    levels,
                    solver=xirr_fast,
                    known_rates=since_inception.indices,
                )
            rows.append(
                BenchmarkWindowRow(
                    window=window,
                    available=True,
                    start_date=min(txn.date for txn in transactions),
                    portfolio_xirr=_xirr_str(portfolio_rate),
                    indices=index_rows,
                )
            )
            continue

        start = ctx.starts[window]
        start_value = ctx.portfolio_start_values[window]
        if start is None or start_value is None:
            rows.append(
                BenchmarkWindowRow(
                    window=window,
                    available=False,
                    start_date=None,
                    portfolio_xirr=None,
                    indices=[IndexXirrRow(index=index, xirr=None) for index in ALL_BENCHMARK_INDICES],
                )
            )
            continue

        flows = [
            (txn.date, _signed_amount(txn))
            for txn in transactions
            if start < txn.date <= ctx.today
        ]
        portfolio_rate = xirr_fast(
            [(start, -start_value), *flows, (ctx.today, current_value)]
        )
        rows.append(
            BenchmarkWindowRow(
                window=window,
                available=True,
                start_date=start,
                portfolio_xirr=_xirr_str(portfolio_rate),
                indices=_index_rows(
                    flows,
                    start,
                    start_value,
                    ctx.today,
                    levels,
                    solver=xirr_fast,
                ),
            )
        )
    return rows


def compute_fund_window_rows(
    ctx: WindowContext,
    scheme_id: uuid.UUID,
    fund_transactions: Sequence[Transaction],
    fund_current_value: Decimal,
    index: BenchmarkIndex,
    levels: Mapping[BenchmarkIndex, IndexLevels],
    since_inception: tuple[Decimal | None, Decimal | None] | None = None,
) -> list[FundWindowXirr]:
    rows = []
    extra_debits = frozenset({TransactionType.SWITCH_IN})
    index_levels = levels.get(index, IndexLevels([], []))
    for window in WINDOWS:
        if window == "SI":
            flows = [
                (txn.date, _signed_amount(txn, extra_debits))
                for txn in fund_transactions
            ]
            if since_inception is None:
                fund_rate = _portfolio_xirr(
                    list(fund_transactions),
                    fund_current_value,
                    extra_debit_types=extra_debits,
                )
                benchmark_rate = index_window_xirr(
                    index_levels, flows, None, None, ctx.today
                )
            else:
                fund_rate, benchmark_rate = since_inception
            rows.append(
                FundWindowXirr(
                    window=window,
                    fund_xirr=_xirr_str(fund_rate),
                    benchmark_xirr=_xirr_str(benchmark_rate),
                )
            )
            continue

        start = ctx.starts[window]
        start_value = ctx.fund_start_values[window].get(scheme_id)
        if start is None or start_value is None:
            rows.append(FundWindowXirr(window=window, fund_xirr=None, benchmark_xirr=None))
            continue
        flows = [
            (txn.date, _signed_amount(txn, extra_debits))
            for txn in fund_transactions
            if start < txn.date <= ctx.today
        ]
        fund_rate = xirr_fast(
            [(start, -start_value), *flows, (ctx.today, fund_current_value)]
        )
        benchmark_rate = index_window_xirr(
            index_levels,
            flows,
            start,
            start_value,
            ctx.today,
            xirr_fast,
        )
        rows.append(
            FundWindowXirr(
                window=window,
                fund_xirr=_xirr_str(fund_rate),
                benchmark_xirr=_xirr_str(benchmark_rate),
            )
        )
    return rows
