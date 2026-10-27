from __future__ import annotations

import uuid
from bisect import bisect_right
from collections import defaultdict
from datetime import date
from decimal import Decimal

from sqlalchemy import func, select, union_all
from sqlalchemy.orm import Session

from app.models.reference import NavHistory, Scheme
from app.services.analytics.category_ranking import (
    _aum_weighted_average,
    _bulk_nav_on_or_before,
    _latest_aaum_by_scheme,
)
from app.services.analytics.risk_metrics import month_end_dates
from app.services.analytics.scheme_universe import get_category_peers
from app.services.fund_page.peer_cache import peer_cache
from app.services.fund_page.performance import period_start
from app.services.fund_page.schemas import (
    CategoryReturnsResponse,
    CategorySeriesResponse,
    PerformancePoint,
    Unavailable,
    plain,
)

_THIN_CATEGORY_THRESHOLD = 5
_DAILY_PERIODS = {"1M", "3M", "6M", "1Y"}
_COLUMNS = ["1M", "3M", "6M", "1Y", "3Y", "5Y", "since_inception"]
_ANNUALISED = {"3Y", "5Y"}
_ZERO = Decimal("0")
_ONE = Decimal("1")
_HUNDRED = Decimal("100")

NavTuple = tuple[uuid.UUID, date, Decimal]


def _series_rows(
    db: Session, scheme_ids: list[uuid.UUID], start: date, end: date,
) -> list[NavTuple]:
    if not scheme_ids:
        return []
    ranked_seed = select(
        NavHistory.scheme_id.label("scheme_id"),
        NavHistory.date.label("date"),
        NavHistory.nav.label("nav"),
        func.row_number().over(
            partition_by=NavHistory.scheme_id,
            order_by=NavHistory.date.desc(),
        ).label("position"),
    ).where(
        NavHistory.scheme_id.in_(scheme_ids), NavHistory.date <= start,
    ).subquery()
    seed = select(
        ranked_seed.c.scheme_id, ranked_seed.c.date, ranked_seed.c.nav,
    ).where(ranked_seed.c.position == 1)
    within = select(
        NavHistory.scheme_id, NavHistory.date, NavHistory.nav,
    ).where(
        NavHistory.scheme_id.in_(scheme_ids),
        NavHistory.date > start,
        NavHistory.date <= end,
    )
    statement = union_all(seed, within).order_by("scheme_id", "date")
    return list(db.execute(statement).all())


def _values_on_or_before(
    rows: list[tuple[date, Decimal]], target: date,
) -> Decimal | None:
    dates = [row[0] for row in rows]
    index = bisect_right(dates, target) - 1
    return rows[index][1] if index >= 0 else None


def _series_targets(start: date, end: date, granularity: str, rows: list[NavTuple]) -> list[date]:
    if granularity == "daily":
        dates = sorted({row_date for _scheme_id, row_date, _nav in rows if start <= row_date <= end})
    else:
        dates = month_end_dates(start, end)
    if not dates or dates[0] != start:
        dates.insert(0, start)
    if dates[-1] != end:
        dates.append(end)
    return dates


async def _category_series_uncached(
    db: Session, scheme: Scheme, period: str, today: date,
) -> CategorySeriesResponse | Unavailable:
    peers = await get_category_peers(db, scheme.sebi_category, scheme.plan_type)
    if not peers.schemes:
        return Unavailable(reason="peers_unavailable")
    start = period_start(period, today)
    if start is None:
        start = db.query(func.min(NavHistory.date)).filter(
            NavHistory.scheme_id == scheme.id,
        ).scalar()
        if start is None:
            return Unavailable(reason="no_history")
    ids = [peer.id for peer in peers.schemes]
    rows = _series_rows(db, ids, start, today)
    by_scheme: dict[uuid.UUID, list[tuple[date, Decimal]]] = defaultdict(list)
    for scheme_id, row_date, nav in rows:
        by_scheme[scheme_id].append((row_date, nav))
    eligible = {
        scheme_id: values
        for scheme_id, values in by_scheme.items()
        if values and values[0][0] <= start and values[0][1] > 0
    }
    aaum = _latest_aaum_by_scheme(db, ids)
    granularity = "daily" if period in _DAILY_PERIODS else "month_end"
    targets = _series_targets(start, today, granularity, rows)
    points = []
    for target in targets:
        returns = {}
        for scheme_id, values in eligible.items():
            current = _values_on_or_before(values, target)
            if current is not None:
                returns[scheme_id] = current / values[0][1] - _ONE
        average = _aum_weighted_average(returns, aaum)
        if average is not None:
            points.append(PerformancePoint(date=target, pct=plain(average * _HUNDRED, 4)))
    return CategorySeriesResponse(
        period=period, granularity=granularity, category=scheme.sebi_category,
        peers_used=len(eligible), peers_total=len(peers.schemes),
        thin_category=len(eligible) < _THIN_CATEGORY_THRESHOLD,
        points=points,
    )


async def category_series(
    db: Session, scheme: Scheme, period: str, today: date,
) -> CategorySeriesResponse | Unavailable:
    key = (scheme.sebi_category, scheme.plan_type, today, "series", period)
    return await peer_cache.get_or_compute(
        key, lambda: _category_series_uncached(db, scheme, period, today),
    )


def _return_value(
    start: Decimal,
    end: Decimal,
    start_date: date,
    end_date: date,
    *,
    annualised_years: int | None,
    annualise_by_days: bool,
) -> Decimal | None:
    if start <= 0 or end <= 0:
        return None
    ratio = end / start
    days = (end_date - start_date).days
    if annualised_years is not None:
        return ratio ** (_ONE / Decimal(annualised_years)) - _ONE
    if annualise_by_days and days > 0:
        return ratio ** (Decimal("365") / Decimal(days)) - _ONE
    return ratio - _ONE


async def _category_returns_uncached(
    db: Session, scheme: Scheme, today: date,
) -> CategoryReturnsResponse | Unavailable:
    peers = await get_category_peers(db, scheme.sebi_category, scheme.plan_type)
    if not peers.schemes:
        return Unavailable(reason="peers_unavailable")
    first_fund_date = db.query(func.min(NavHistory.date)).filter(
        NavHistory.scheme_id == scheme.id,
    ).scalar()
    targets = {
        column: (first_fund_date if column == "since_inception" else period_start(column, today))
        for column in _COLUMNS
    }
    requested_dates = [target for target in targets.values() if target is not None] + [today]
    ids = [peer.id for peer in peers.schemes]
    navs = _bulk_nav_on_or_before(db, ids, requested_dates)
    aaum = _latest_aaum_by_scheme(db, ids)
    category: dict[str, str | None] = {}
    peers_used: dict[str, int] = {}
    for column in _COLUMNS:
        start_date = targets[column]
        values: dict[uuid.UUID, Decimal] = {}
        if start_date is not None:
            for scheme_id in ids:
                start = navs.get(scheme_id, {}).get(start_date)
                end = navs.get(scheme_id, {}).get(today)
                if start is None or end is None:
                    continue
                value = _return_value(
                    start, end, start_date, today,
                    annualised_years=int(column[0]) if column in _ANNUALISED else None,
                    annualise_by_days=(
                        column == "since_inception" and (today - start_date).days > 365
                    ),
                )
                if value is not None:
                    values[scheme_id] = value
        average = _aum_weighted_average(values, aaum)
        category[column] = plain(average * _HUNDRED, 4) if average is not None else None
        peers_used[column] = len(values)
    return CategoryReturnsResponse(
        columns=_COLUMNS, category=category, peers_used=peers_used,
        thin_category=max(peers_used.values(), default=0) < _THIN_CATEGORY_THRESHOLD,
    )


async def category_returns(
    db: Session, scheme: Scheme, today: date,
) -> CategoryReturnsResponse | Unavailable:
    key = (scheme.sebi_category, scheme.plan_type, today, "returns", None)
    return await peer_cache.get_or_compute(
        key, lambda: _category_returns_uncached(db, scheme, today),
    )
