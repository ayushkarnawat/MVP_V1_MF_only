from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta

from sqlalchemy.orm import Session

from app.services.home.context import HomeInputs, ScopeContext
from app.services.home.series import SeriesPoint
from app.services.home.wealth import build_wealth_series


@dataclass(frozen=True)
class PortfolioValueSeries:
    days: int
    start: date
    end: date
    empty: bool
    points: tuple[SeriesPoint, ...]


def build_portfolio_value_series(
    db: Session,
    ctx: ScopeContext,
    inputs: HomeInputs,
    *,
    today: date,
    days: int,
) -> PortfolioValueSeries:
    end = inputs.nav_as_of or today
    start = end - timedelta(days=days - 1)
    wealth = build_wealth_series(
        db, ctx, inputs, today=today, period="custom", custom=(start, end), benchmark=None,
    )
    return PortfolioValueSeries(
        days=days, start=wealth.start, end=wealth.end, empty=wealth.empty, points=wealth.points,
    )
