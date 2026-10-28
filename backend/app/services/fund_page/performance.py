from __future__ import annotations

import bisect
import calendar
from datetime import date
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.enums import BenchmarkReturnType
from app.models.reference import BenchmarkIndexHistory, NavHistory, Scheme
from app.services.fund_page.benchmark_select import BENCHMARK_LABELS, benchmark_for
from app.services.fund_page.schemas import (
    PerformancePoint,
    PerformanceResponse,
    PeriodReturnsOut,
    Unavailable,
    plain,
)

MAX_POINTS = 260
_DAILY_PERIODS = {"1M", "3M", "6M", "1Y"}
_PERIOD_MONTHS = {"1M": 1, "3M": 3, "6M": 6, "1Y": 12, "3Y": 36, "5Y": 60}

Row = tuple[date, Decimal]


def months_back(end: date, months: int) -> date:
    month_index = end.month - 1 - months
    year = end.year + month_index // 12
    month = month_index % 12 + 1
    day = min(end.day, calendar.monthrange(year, month)[1])
    return date(year, month, day)


def period_start(period: str, end: date) -> date | None:
    if period == "All":
        return None
    return months_back(end, _PERIOD_MONTHS[period])


def latest_nav_date(
    db: Session,
    scheme: Scheme,
    on_or_before: date | None = None,
) -> date | None:
    query = select(NavHistory.date).where(NavHistory.scheme_id == scheme.id)
    if on_or_before is not None:
        query = query.where(NavHistory.date <= on_or_before)
    row = db.execute(query.order_by(NavHistory.date.desc()).limit(1)).first()
    return row[0] if row else None


def _earliest_nav_date(db: Session, scheme: Scheme) -> date:
    row = db.execute(
        select(NavHistory.date).where(NavHistory.scheme_id == scheme.id).order_by(NavHistory.date).limit(1)
    ).first()
    return row[0]


def _weekly(rows: list[Row]) -> list[Row]:
    """Last NAV of each ISO week; the first and last raw rows are always
    kept even when that adds an extra point outside its week's last slot."""
    by_week: dict[tuple[int, int], Row] = {}
    for row in rows:
        by_week[row[0].isocalendar()[:2]] = row
    sampled = sorted(by_week.values(), key=lambda r: r[0])
    if sampled[0] != rows[0]:
        sampled.insert(0, rows[0])
    if sampled[-1] != rows[-1]:
        sampled.append(rows[-1])
    return sampled


def _thin(rows: list[Row], max_points: int) -> list[Row]:
    if len(rows) <= max_points:
        return rows
    step = (len(rows) - 1) / (max_points - 1)
    indices = sorted({round(i * step) for i in range(max_points)})
    return [rows[i] for i in indices]


def _pct_points(rows: list[Row]) -> list[PerformancePoint]:
    base = rows[0][1]
    return [PerformancePoint(date=d, pct=plain((v / base - 1) * 100, 4)) for d, v in rows]


def _align_on_or_before(levels: list[Row], dates: list[date]) -> list[Row] | None:
    """The level on or before each fund point's date, DB-only (no live
    fetch -- D13): `None` if even the first date has nothing to align to,
    meaning this index's TRI history is missing entirely for the window."""
    if not levels:
        return None
    level_dates = [d for d, _ in levels]
    aligned = []
    for d in dates:
        idx = bisect.bisect_right(level_dates, d) - 1
        if idx < 0:
            return None
        aligned.append((d, levels[idx][1]))
    return aligned


async def period_series(db: Session, scheme: Scheme, period: str, today: date) -> PerformanceResponse | Unavailable:
    if scheme.amfi_code is None:
        return Unavailable(reason="no_history")
    end = latest_nav_date(db, scheme, today)
    if end is None:
        return Unavailable(reason="no_history")

    first_date = _earliest_nav_date(db, scheme)
    start = period_start(period, end)
    clamped = start is not None and first_date > start
    actual_start = first_date if (start is None or clamped) else start
    since_launch = actual_start == first_date

    fund_rows = db.execute(
        select(NavHistory.date, NavHistory.nav)
        .where(NavHistory.scheme_id == scheme.id, NavHistory.date >= actual_start, NavHistory.date <= end)
        .order_by(NavHistory.date)
    ).all()
    sampled = fund_rows if period in _DAILY_PERIODS else _weekly(fund_rows)
    sampled = _thin(sampled, MAX_POINTS)
    fund_points = _pct_points(sampled)

    index = benchmark_for(scheme)
    benchmark_points: list[PerformancePoint] | None = None
    benchmark_reason: str | None = None
    benchmark_return: str | None = None
    if index is None:
        benchmark_reason = "no_benchmark"
    else:
        levels = db.execute(
            select(BenchmarkIndexHistory.date, BenchmarkIndexHistory.value)
            .where(
                BenchmarkIndexHistory.index_name == index,
                BenchmarkIndexHistory.return_type == BenchmarkReturnType.TRI,
                BenchmarkIndexHistory.date <= end,
            )
            .order_by(BenchmarkIndexHistory.date)
        ).all()
        aligned = _align_on_or_before(levels, [d for d, _ in sampled])
        if aligned is None:
            benchmark_reason = "no_history"
        else:
            benchmark_points = _pct_points(aligned)
            benchmark_return = benchmark_points[-1].pct

    return PerformanceResponse(
        scheme_id=str(scheme.id),
        period=period,
        start=actual_start,
        end=end,
        clamped=clamped,
        since_launch=since_launch,
        fund=fund_points,
        benchmark_index=index.value if index is not None else None,
        benchmark_label=BENCHMARK_LABELS.get(index) if index is not None else None,
        benchmark=benchmark_points,
        benchmark_reason=benchmark_reason,
        period_returns=PeriodReturnsOut(fund=fund_points[-1].pct, benchmark=benchmark_return),
    )
