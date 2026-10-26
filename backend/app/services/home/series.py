"""Portfolio value-series and return calculations for Home."""

import calendar
import uuid
from bisect import bisect_left
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal
from typing import Collection, Literal, Mapping, NamedTuple, Sequence

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.reference import NavHistory


NAV_LOOKBACK_DAYS = 10
MAX_CUSTOM_YEARS = 10


class SeriesPoint(NamedTuple):
    date: date
    value: Decimal


@dataclass(frozen=True)
class ValueSeries:
    points: tuple[SeriesPoint, ...]
    partial: bool
    missing_schemes: tuple[uuid.UUID, ...]


@dataclass(frozen=True)
class DietzResult:
    gain: Decimal
    pct: Decimal | None


@dataclass(frozen=True)
class BenchmarkReturn:
    pct: Decimal | None
    effective_start: date | None
    clipped: bool


@dataclass(frozen=True)
class PeriodRange:
    start: date
    end: date
    clamped: bool


def build_value_series(
    units_by_date: Mapping[uuid.UUID, Sequence[tuple[date, Decimal]]],
    navs_by_scheme: Mapping[uuid.UUID, Sequence[tuple[date, Decimal]]],
    dates: Sequence[date],
) -> ValueSeries:
    if any(previous >= current for previous, current in zip(dates, dates[1:])):
        raise ValueError("dates must be strictly ascending")

    scheme_ids = set(units_by_date) | set(navs_by_scheme)
    value_deltas = [Decimal("0") for _point_date in dates]
    unit_deltas = [Decimal("0") for _point_date in dates]
    missing_ranges: dict[uuid.UUID, list[tuple[date, date | None]]] = {}

    for scheme_id in scheme_ids:
        unit_rows = units_by_date.get(scheme_id, ())
        nav_rows = navs_by_scheme.get(scheme_id, ())
        unit_position = 0
        nav_position = 0
        units = Decimal("0")
        nav: Decimal | None = None
        missing_since: date | None = None

        while unit_position < len(unit_rows) or nav_position < len(nav_rows):
            next_unit_date = unit_rows[unit_position][0] if unit_position < len(unit_rows) else None
            next_nav_date = nav_rows[nav_position][0] if nav_position < len(nav_rows) else None
            event_date = next_unit_date if next_nav_date is None or (
                next_unit_date is not None and next_unit_date <= next_nav_date
            ) else next_nav_date
            assert event_date is not None

            old_units = units
            old_value = units * nav if units > 0 and nav is not None else Decimal("0")
            was_missing = units > 0 and nav is None
            while unit_position < len(unit_rows) and unit_rows[unit_position][0] == event_date:
                units = unit_rows[unit_position][1]
                unit_position += 1
            while nav_position < len(nav_rows) and nav_rows[nav_position][0] == event_date:
                nav = nav_rows[nav_position][1]
                nav_position += 1

            point_index = bisect_left(dates, event_date)
            if point_index < len(dates):
                unit_deltas[point_index] += units - old_units
                new_value = units * nav if units > 0 and nav is not None else Decimal("0")
                value_deltas[point_index] += new_value - old_value

            is_missing = units > 0 and nav is None
            if not was_missing and is_missing:
                missing_since = event_date
            elif was_missing and not is_missing:
                assert missing_since is not None
                missing_ranges.setdefault(scheme_id, []).append((missing_since, event_date))
                missing_since = None

        if missing_since is not None:
            missing_ranges.setdefault(scheme_id, []).append((missing_since, None))

    points: list[SeriesPoint] = []
    total_units = Decimal("0")
    total_value = Decimal("0")
    first_point_index: int | None = None
    for point_index, point_date in enumerate(dates):
        total_units += unit_deltas[point_index]
        total_value += value_deltas[point_index]
        if first_point_index is None and total_units > 0:
            first_point_index = point_index
        if first_point_index is not None:
            points.append(SeriesPoint(point_date, total_value))

    missing_schemes: set[uuid.UUID] = set()
    if first_point_index is not None:
        for scheme_id, ranges in missing_ranges.items():
            for range_start, range_end in ranges:
                start_index = max(first_point_index, bisect_left(dates, range_start))
                end_index = len(dates) if range_end is None else bisect_left(dates, range_end)
                if start_index < end_index:
                    missing_schemes.add(scheme_id)
                    break

    missing = tuple(sorted(missing_schemes, key=str))
    return ValueSeries(tuple(points), bool(missing), missing)


def load_navs_by_scheme(
    db: Session,
    scheme_ids: Collection[uuid.UUID],
    start: date,
    end: date,
) -> dict[uuid.UUID, list[tuple[date, Decimal]]]:
    requested = set(scheme_ids)
    if not requested:
        return {}

    grouped = {scheme_id: [] for scheme_id in requested}
    rows = db.execute(
        select(NavHistory.scheme_id, NavHistory.date, NavHistory.nav)
        .where(
            NavHistory.scheme_id.in_(requested),
            NavHistory.date.between(start - timedelta(days=NAV_LOOKBACK_DAYS), end),
        )
        .order_by(NavHistory.scheme_id, NavHistory.date)
    ).all()
    for scheme_id, nav_date, nav in rows:
        grouped[scheme_id].append((nav_date, nav))
    return grouped


def load_prior_prices(
    db: Session,
    scheme_ids: Collection[uuid.UUID],
    on_or_before: date,
) -> dict[uuid.UUID, tuple[date, Decimal]]:
    """The newest stored price on or before `on_or_before` for each scheme that has one, in one query.

    The ten-day look-back of `load_navs_by_scheme` is enough for a fund priced daily, but a fund priced from
    its statements has prices weeks or months apart: without the price that was current at the start of the
    window the series would show it as worthless until its next statement price (review F4)."""
    requested = set(scheme_ids)
    if not requested:
        return {}
    newest = (
        select(NavHistory.scheme_id, func.max(NavHistory.date).label("newest"))
        .where(NavHistory.scheme_id.in_(requested), NavHistory.date <= on_or_before)
        .group_by(NavHistory.scheme_id)
        .subquery()
    )
    rows = db.execute(
        select(NavHistory.scheme_id, NavHistory.date, NavHistory.nav).join(
            newest,
            (NavHistory.scheme_id == newest.c.scheme_id) & (NavHistory.date == newest.c.newest),
        )
    ).all()
    return {scheme_id: (price_date, nav) for scheme_id, price_date, nav in rows}


def modified_dietz(
    start_value: Decimal,
    end_value: Decimal,
    flows: Sequence[tuple[date, Decimal]],
    start: date,
    end: date,
) -> DietzResult:
    if start > end:
        raise ValueError("start must not be after end")

    counted = [(flow_date, flow) for flow_date, flow in flows if start < flow_date <= end]
    net_flows = sum((flow for _flow_date, flow in counted), Decimal("0"))
    gain = end_value - start_value - net_flows

    if start == end:
        denominator = start_value
    else:
        period_days = Decimal((end - start).days)
        weighted_flows = sum(
            (flow * Decimal((end - flow_date).days) / period_days for flow_date, flow in counted),
            Decimal("0"),
        )
        denominator = start_value + weighted_flows

    pct = None
    if denominator > 0:
        pct = (gain / denominator * Decimal("100")).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
    return DietzResult(gain, pct)


def benchmark_return(
    index_levels: Sequence[tuple[date, Decimal]],
    start: date,
    end: date,
) -> BenchmarkReturn:
    if start > end:
        raise ValueError("start must not be after end")

    first_level: tuple[date, Decimal] | None = None
    start_level: Decimal | None = None
    end_level: Decimal | None = None
    for level_date, level in index_levels:
        if level_date > end:
            break
        if first_level is None:
            first_level = (level_date, level)
        end_level = level
        if level_date <= start:
            start_level = level

    if end_level is None or first_level is None:
        return BenchmarkReturn(None, None, False)

    if start_level is None:
        effective_start, start_level = first_level
        clipped = True
    else:
        effective_start = start
        clipped = False

    pct = None
    if start_level > 0:
        pct = ((end_level / start_level - Decimal("1")) * Decimal("100")).quantize(
            Decimal("0.0001"),
            rounding=ROUND_HALF_UP,
        )
    return BenchmarkReturn(pct, effective_start, clipped)


def _date_with_clamped_day(year: int, month: int, day: int) -> date:
    return date(year, month, min(day, calendar.monthrange(year, month)[1]))


def period_range(
    period: Literal["1D", "1W", "1M", "1Y", "custom"],
    today: date,
    custom: tuple[date, date] | None = None,
) -> PeriodRange:
    """Return a requested range; callers replace the 1D start with the previous NAV day."""
    if period == "1D":
        return PeriodRange(today - timedelta(days=1), today, False)
    if period == "1W":
        return PeriodRange(today - timedelta(days=7), today, False)
    if period == "1M":
        previous_month = today.month - 1
        year = today.year
        if previous_month == 0:
            previous_month = 12
            year -= 1
        return PeriodRange(_date_with_clamped_day(year, previous_month, today.day), today, False)
    if period == "1Y":
        return PeriodRange(_date_with_clamped_day(today.year - 1, today.month, today.day), today, False)
    if period != "custom":
        raise ValueError("unknown period")
    if custom is None:
        raise ValueError("custom dates are required")

    start, end = custom
    if start > end:
        raise ValueError("start must not be after end")

    floor = _date_with_clamped_day(today.year - MAX_CUSTOM_YEARS, today.month, today.day)
    clamped = False
    if end > today:
        end = today
        clamped = True
    if start < floor:
        start = floor
        clamped = True
    if start > end:
        raise ValueError("custom range falls outside the allowed window")
    return PeriodRange(start, end, clamped)
