from __future__ import annotations

from datetime import timedelta
from decimal import Decimal, ROUND_HALF_UP

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.reference import NavHistory, Scheme
from app.services.dashboard.nav import warm_nav_history
from app.services.dashboard.schemas import NavHistoryPoint, SchemeNavHistoryResponse

_PERIOD_DAYS = {"1M": 31, "1Y": 366, "3Y": 3 * 366, "5Y": 5 * 366}
_RETURN_QUANTUM = Decimal("0.01")
_PERCENT = Decimal("100")


def _downsample(rows: list[NavHistory], max_points: int = 400) -> list[NavHistory]:
    if len(rows) <= max_points:
        return rows
    indices = [
        index * (len(rows) - 1) // (max_points - 1)
        for index in range(max_points)
    ]
    return [rows[index] for index in indices]


async def get_fund_nav_history(
    db: Session, scheme: Scheme, period: str
) -> SchemeNavHistoryResponse:
    await warm_nav_history(db, [scheme])

    earliest, latest = (
        db.query(func.min(NavHistory.date), func.max(NavHistory.date))
        .filter(NavHistory.scheme_id == scheme.id)
        .one()
    )
    if earliest is None or latest is None:
        return SchemeNavHistoryResponse(
            scheme_id=str(scheme.id),
            period="MAX",
            requested_period=period,
            clamped=period != "MAX",
            points=[],
            overall_return_pct=None,
        )

    served_period = period
    clamped = False
    if period == "MAX":
        start = earliest
    else:
        requested_start = latest - timedelta(days=_PERIOD_DAYS[period])
        if requested_start < earliest:
            start = earliest
            served_period = "MAX"
            clamped = True
        else:
            start = requested_start

    rows = (
        db.query(NavHistory)
        .filter(
            NavHistory.scheme_id == scheme.id,
            NavHistory.date >= start,
            NavHistory.date <= latest,
        )
        .order_by(NavHistory.date)
        .all()
    )
    rows = _downsample(rows)

    first_nav = rows[0].nav
    points = [
        NavHistoryPoint(
            date=row.date,
            nav=str(row.nav),
            return_pct=str(
                (((row.nav - first_nav) / first_nav) * _PERCENT).quantize(
                    _RETURN_QUANTUM, rounding=ROUND_HALF_UP
                )
            ),
        )
        for row in rows
    ]
    return SchemeNavHistoryResponse(
        scheme_id=str(scheme.id),
        period=served_period,
        requested_period=period,
        clamped=clamped,
        points=points,
        overall_return_pct=points[-1].return_pct if len(points) >= 2 else None,
    )
