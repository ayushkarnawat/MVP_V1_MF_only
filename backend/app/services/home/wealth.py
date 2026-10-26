from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal
from typing import Literal, Sequence

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.enums import BenchmarkIndex, BenchmarkReturnType, TransactionType
from app.models.folio import Folio
from app.models.reference import BenchmarkIndexHistory
from app.models.transaction import Transaction
from app.services.dashboard.xirr import _FUND_RELEVANT_TYPES, _signed_amount
from app.services.home.context import HomeInputs, ScopeContext
from app.services.home.series import (
    SeriesPoint,
    ValueSeries,
    benchmark_return,
    build_value_series,
    modified_dietz,
    period_range,
)


CENT = Decimal("0.01")
PCT = Decimal("0.0001")


@dataclass(frozen=True)
class BenchmarkSeries:
    index: BenchmarkIndex
    available: bool
    pct: Decimal | None
    effective_start: date | None
    clipped: bool
    points: tuple[tuple[date, Decimal], ...]


@dataclass(frozen=True)
class WealthSeries:
    period: Literal["1D", "1W", "1M", "1Y", "custom"]
    start: date
    end: date
    clamped: bool
    empty: bool
    points: tuple[SeriesPoint, ...]
    start_value: Decimal
    end_value: Decimal
    net_contributions: Decimal
    change_amount: Decimal
    change_pct: Decimal | None
    change_method: Literal["price_only", "modified_dietz"]
    benchmark: BenchmarkSeries | None
    start_effective: date


def _money(value: Decimal) -> Decimal:
    rounded = value.quantize(CENT, rounding=ROUND_HALF_UP)
    return abs(rounded) if rounded.is_zero() else rounded


def _benchmark_series(
    benchmark: tuple[BenchmarkIndex, Sequence[tuple[date, Decimal]]] | None,
    points: Sequence[SeriesPoint],
    start_effective: date,
    end: date,
) -> BenchmarkSeries | None:
    if benchmark is None:
        return None
    index, levels = benchmark
    scalar = benchmark_return(levels, start_effective, end)
    if not levels or scalar.effective_start is None:
        return BenchmarkSeries(index, False, None, None, False, ())
    effective = scalar.effective_start
    start_level = None
    for level_date, level in levels:
        if level_date <= effective:
            start_level = level
        else:
            break
    if start_level is None:
        for level_date, level in levels:
            if level_date == effective:
                start_level = level
                break
    output = []
    current_level = None
    level_position = 0
    for point in points:
        while level_position < len(levels) and levels[level_position][0] <= point.date:
            current_level = levels[level_position][1]
            level_position += 1
        if point.date >= effective and current_level is not None and start_level and start_level > 0:
            pct = ((current_level / start_level - Decimal("1")) * Decimal("100")).quantize(
                PCT, rounding=ROUND_HALF_UP
            )
            output.append((point.date, abs(pct) if pct.is_zero() else pct))
    return BenchmarkSeries(
        index=index,
        available=True,
        pct=scalar.pct,
        effective_start=effective,
        clipped=scalar.clipped,
        points=tuple(output),
    )


def assemble_wealth_series(
    *,
    period: Literal["1D", "1W", "1M", "1Y", "custom"],
    requested_start: date,
    end: date,
    clamped: bool,
    value_series: ValueSeries,
    movers,
    flows: Sequence[tuple[date, Decimal]],
    benchmark: tuple[BenchmarkIndex, Sequence[tuple[date, Decimal]]] | None,
) -> WealthSeries:
    points = tuple(SeriesPoint(point.date, _money(point.value)) for point in value_series.points)
    if not points:
        return WealthSeries(
            period, requested_start, end, clamped, True, (), Decimal("0.00"),
            Decimal("0.00"), Decimal("0.00"), Decimal("0.00"), None,
            "price_only" if period == "1D" else "modified_dietz",
            _benchmark_series(benchmark, (), requested_start, end), requested_start,
        )
    first_date = points[0].date
    start_effective = (
        first_date - timedelta(days=1) if first_date > requested_start else requested_start
    )
    start_value = Decimal("0") if first_date > requested_start else points[0].value
    end_value = points[-1].value
    counted_flows = [
        (flow_date, amount)
        for flow_date, amount in flows
        if start_effective < flow_date <= end
    ]
    net_contributions = sum((amount for _flow_date, amount in counted_flows), Decimal("0"))
    if period == "1D":
        change_amount = movers.net_change
        change_pct = movers.net_pct
        method: Literal["price_only", "modified_dietz"] = "price_only"
    else:
        dietz = modified_dietz(start_value, end_value, counted_flows, start_effective, end)
        change_amount = dietz.gain
        change_pct = dietz.pct
        method = "modified_dietz"
    return WealthSeries(
        period=period,
        start=requested_start,
        end=end,
        clamped=clamped,
        empty=False,
        points=points,
        start_value=_money(start_value),
        end_value=_money(end_value),
        net_contributions=_money(net_contributions),
        change_amount=_money(change_amount),
        change_pct=change_pct,
        change_method=method,
        benchmark=_benchmark_series(benchmark, points, start_effective, end),
        start_effective=start_effective,
    )


def _calendar_days(start: date, end: date) -> list[date]:
    return [start + timedelta(days=offset) for offset in range((end - start).days + 1)]


def build_wealth_series(
    db: Session,
    ctx: ScopeContext,
    inputs: HomeInputs,
    *,
    today: date,
    period: Literal["1D", "1W", "1M", "1Y", "custom"],
    custom: tuple[date, date] | None = None,
    benchmark: BenchmarkIndex | None = None,
) -> WealthSeries:
    end_anchor = inputs.nav_as_of or today
    requested = period_range(period, end_anchor, custom)
    start = (
        inputs.movers.previous_nav_date or requested.end
        if period == "1D"
        else requested.start
    )
    end = requested.end
    dates = _calendar_days(start, end)
    units = {fund.scheme_id: fund.units_timeline for fund in inputs.funds}
    navs = {fund.scheme_id: fund.navs for fund in inputs.funds}
    value_series = build_value_series(units, navs, dates)

    transaction_rows = db.execute(
        select(Transaction)
        .join(Folio, Folio.id == Transaction.folio_id)
        .where(
            Folio.household_member_id.in_(ctx.member_ids),
            Transaction.type.in_(_FUND_RELEVANT_TYPES),
            Transaction.date <= end,
        )
        .order_by(Transaction.date, Transaction.id)
    ).scalars().all() if ctx.member_ids else []
    extra_debits = frozenset({TransactionType.SWITCH_IN})
    flows = [
        (transaction.date, -_signed_amount(transaction, extra_debits))
        for transaction in transaction_rows
    ]

    benchmark_data = None
    if benchmark is not None:
        levels = db.execute(
            select(BenchmarkIndexHistory.date, BenchmarkIndexHistory.value)
            .where(
                BenchmarkIndexHistory.index_name == benchmark,
                BenchmarkIndexHistory.return_type == BenchmarkReturnType.TRI,
                BenchmarkIndexHistory.date <= end,
            )
            .order_by(BenchmarkIndexHistory.date)
        ).all()
        benchmark_data = (benchmark, levels)
    return assemble_wealth_series(
        period=period,
        requested_start=start,
        end=end,
        clamped=requested.clamped,
        value_series=value_series,
        movers=inputs.movers,
        flows=flows,
        benchmark=benchmark_data,
    )
