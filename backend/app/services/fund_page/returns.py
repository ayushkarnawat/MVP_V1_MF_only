from __future__ import annotations

import bisect
import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.decimal_utils import quantize_amount
from app.models.enums import BenchmarkIndex, BenchmarkReturnType, TransactionType
from app.models.reference import NavHistory, Scheme
from app.services.analytics.nse_indices_client import get_index_level_on_or_before
from app.services.analytics.xirr import xirr
from app.services.dashboard.holdings import FifoState, _load_folio_transactions, compute_holdings
from app.services.dashboard.xirr import _FUND_DEBIT_TYPES, _signed_amount
from app.services.fund_page.benchmark_select import benchmark_for
from app.services.fund_page.performance import latest_nav_date, period_start
from app.services.fund_page.schemas import ReturnsResponse, Unavailable, plain
from app.services.fund_page.scope import ScopeContext
from app.services.fund_page.sections import scheme_flows

_INCEPTION_COLUMNS = ["1M", "3M", "6M", "1Y", "3Y", "5Y", "since_inception"]
_CURRENT_COLUMNS = ["1Y", "3Y", "5Y", "since_first_investment"]
_ANNUALISED_COLUMNS = {"3Y", "5Y"}
_SWITCH_IN = frozenset({TransactionType.SWITCH_IN})

NavRow = tuple[date, Decimal]
CashFlow = tuple[date, Decimal]


def _nav_rows(db: Session, scheme_id: uuid.UUID, end: date) -> list[NavRow]:
    return list(
        db.execute(
            select(NavHistory.date, NavHistory.nav)
            .where(NavHistory.scheme_id == scheme_id, NavHistory.date <= end)
            .order_by(NavHistory.date)
        ).all()
    )


def _row_on_or_before(rows: list[NavRow], target: date) -> NavRow | None:
    dates = [row[0] for row in rows]
    index = bisect.bisect_right(dates, target) - 1
    return rows[index] if index >= 0 else None


def _return_pct(start: NavRow, end: NavRow, *, annualised: bool) -> str | None:
    days = (end[0] - start[0]).days
    if days < 0 or start[1] == 0:
        return None
    ratio = end[1] / start[1]
    if annualised and days > 0:
        value = (ratio ** (Decimal("365") / Decimal(days)) - Decimal("1")) * Decimal("100")
    else:
        value = (ratio - Decimal("1")) * Decimal("100")
    return plain(value, 4)


def _index_return(
    db: Session,
    index: BenchmarkIndex,
    start: date,
    end: date,
    *,
    annualised: bool,
) -> str | None:
    first = get_index_level_on_or_before(
        db,
        index,
        start,
        return_type=BenchmarkReturnType.TRI,
    )
    last = get_index_level_on_or_before(
        db,
        index,
        end,
        return_type=BenchmarkReturnType.TRI,
    )
    if first is None or last is None:
        return None
    return _return_pct((first[1], first[0]), (last[1], last[0]), annualised=annualised)


def inception_returns(
    db: Session,
    scheme: Scheme,
    today: date,
) -> ReturnsResponse | Unavailable:
    if scheme.amfi_code is None:
        return Unavailable(reason="no_history")
    end = latest_nav_date(db, scheme, today)
    if end is None:
        return Unavailable(reason="no_history")
    rows = _nav_rows(db, scheme.id, end)
    if not rows:
        return Unavailable(reason="no_history")

    fund: dict[str, str | None] = {}
    fund_dates: dict[str, tuple[date, date] | None] = {}
    first = rows[0]
    last = rows[-1]
    for column in _INCEPTION_COLUMNS[:-1]:
        anchor = period_start(column, end)
        if anchor is None or anchor < first[0]:
            fund[column] = None
            fund_dates[column] = None
            continue
        anchor_row = _row_on_or_before(rows, anchor)
        if anchor_row is None:
            fund[column] = None
            fund_dates[column] = None
            continue
        fund[column] = _return_pct(
            anchor_row,
            last,
            annualised=column in _ANNUALISED_COLUMNS,
        )
        fund_dates[column] = (anchor_row[0], last[0])

    inception_days = (last[0] - first[0]).days
    fund["since_inception"] = _return_pct(
        first,
        last,
        annualised=inception_days > 365,
    )
    fund_dates["since_inception"] = (first[0], last[0])

    benchmark_index = benchmark_for(scheme)
    benchmark_reason: str | None = None
    benchmark: dict[str, str | None] | None = None
    if benchmark_index is None:
        benchmark_reason = "no_benchmark"
    else:
        benchmark = {}
        for column in _INCEPTION_COLUMNS:
            dates = fund_dates[column]
            benchmark[column] = (
                None
                if dates is None
                else _index_return(
                    db,
                    benchmark_index,
                    dates[0],
                    dates[1],
                    annualised=(column in _ANNUALISED_COLUMNS)
                    or (column == "since_inception" and inception_days > 365),
                )
            )
        if not any(value is not None for value in benchmark.values()):
            benchmark = None
            benchmark_reason = "no_history"

    return ReturnsResponse(
        mode="inception",
        columns=_INCEPTION_COLUMNS,
        rows={"fund": fund, "benchmark": benchmark},
        benchmark_reason=benchmark_reason,
    )


def _opening_units(
    db: Session,
    member_ids: list[uuid.UUID],
    scheme_id: uuid.UUID,
    start: date,
) -> Decimal:
    folios, transactions_by_folio = _load_folio_transactions(
        db,
        member_ids,
        scheme_ids=frozenset({scheme_id}),
    )
    units = Decimal("0")
    for folio in folios:
        state = FifoState()
        for transaction in transactions_by_folio.get(folio.id, []):
            if transaction.date >= start:
                break
            state.apply(transaction)
        units += state.units
    return units


def _window_flows(
    db: Session,
    scheme: Scheme,
    ctx: ScopeContext,
    transactions,
    start: date,
    end: date,
) -> list[CashFlow] | None:
    flows = [
        (transaction.date, _signed_amount(transaction, _SWITCH_IN))
        for transaction in transactions
        if start <= transaction.date <= end
    ]
    opening_units = _opening_units(db, ctx.member_ids, scheme.id, start)
    if opening_units:
        nav_rows = _nav_rows(db, scheme.id, start)
        opening_nav = _row_on_or_before(nav_rows, start)
        if opening_nav is None:
            return None
        flows.insert(0, (start, -(opening_units * opening_nav[1])))
    return flows


def _benchmark_xirr(
    db: Session,
    index: BenchmarkIndex,
    flows: list[CashFlow],
    end: date,
) -> Decimal | None:
    if not flows:
        return None
    net_units = Decimal("0")
    replay: list[CashFlow] = []
    for flow_date, amount in flows:
        level = get_index_level_on_or_before(
            db,
            index,
            flow_date,
            return_type=BenchmarkReturnType.TRI,
        )
        if level is None:
            return None
        if amount < 0:
            net_units += -amount / level[0]
        else:
            net_units -= amount / level[0]
        replay.append((flow_date, amount))
    closing_level = get_index_level_on_or_before(
        db,
        index,
        end,
        return_type=BenchmarkReturnType.TRI,
    )
    if closing_level is None:
        return None
    replay.append((end, net_units * closing_level[0]))
    return xirr(replay)


async def current_returns(
    db: Session,
    scheme: Scheme,
    ctx: ScopeContext,
    user_id: uuid.UUID,
    today: date,
) -> ReturnsResponse | Unavailable:
    del user_id
    holding_rows = await compute_holdings(
        db,
        ctx.member_ids,
        scheme_ids=frozenset({scheme.id}),
        allow_stale_today=True,
        stored_only=True,
    )
    if not holding_rows:
        return Unavailable(reason="not_held")
    end = latest_nav_date(db, scheme, today)
    if scheme.amfi_code is None or end is None:
        return Unavailable(reason="no_history")
    if all(row.current_value is None for row in holding_rows):
        # No priced row: a zero closing flow would read as a spurious -100% XIRR.
        return Unavailable(reason="no_history")
    current_value = quantize_amount(
        sum(
            (
                quantize_amount(Decimal(row.current_value))
                for row in holding_rows
                if row.current_value is not None
            ),
            Decimal("0"),
        )
    )
    transactions = scheme_flows(db, ctx.member_ids, scheme.id)
    investment_dates = [
        transaction.date
        for transaction in transactions
        if transaction.type in _FUND_DEBIT_TYPES
    ]
    if not investment_dates:
        return Unavailable(reason="not_held")
    first_investment = min(investment_dates)

    holding: dict[str, str | None] = {}
    benchmark: dict[str, str | None] | None
    benchmark_index = benchmark_for(scheme)
    benchmark = {} if benchmark_index is not None else None
    for column in _CURRENT_COLUMNS:
        start = (
            first_investment
            if column == "since_first_investment"
            else period_start(column, end)
        )
        if start is None or start < first_investment:
            holding[column] = None
            if benchmark is not None:
                benchmark[column] = None
            continue
        flows = _window_flows(db, scheme, ctx, transactions, start, end)
        if flows is None:
            holding[column] = None
            if benchmark is not None:
                benchmark[column] = None
            continue
        rate = xirr([*flows, (end, current_value)])
        holding[column] = plain(rate * Decimal("100"), 4) if rate is not None else None
        if benchmark is not None and benchmark_index is not None:
            benchmark_rate = _benchmark_xirr(db, benchmark_index, flows, end)
            benchmark[column] = (
                plain(benchmark_rate * Decimal("100"), 4)
                if benchmark_rate is not None
                else None
            )

    benchmark_reason: str | None = None
    if benchmark_index is None:
        benchmark_reason = "no_benchmark"
    elif benchmark is not None and not any(value is not None for value in benchmark.values()):
        benchmark = None
        benchmark_reason = "no_history"

    return ReturnsResponse(
        mode="current",
        columns=_CURRENT_COLUMNS,
        rows={"holding_xirr": holding, "benchmark_same_flows": benchmark},
        benchmark_reason=benchmark_reason,
    )
