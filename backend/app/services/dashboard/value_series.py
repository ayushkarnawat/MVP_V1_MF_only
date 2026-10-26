from __future__ import annotations

from dataclasses import dataclass, replace
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
    # Portfolio draws the value line only: nothing here reads the cash flows `build_wealth_series` collects for
    # Home's return figures, and it loads every transaction of the scope up to `end` for them. That query is
    # the only use the function makes of `ctx.member_ids`, so a scope with no member ids skips it and leaves
    # the points, start, end and empty flag exactly as before (pinned by a test that compares both ways).
    value_only_ctx = replace(ctx, member_ids=())
    wealth = build_wealth_series(
        db, value_only_ctx, inputs, today=today, period="custom", custom=(start, end), benchmark=None,
    )
    return PortfolioValueSeries(
        days=days, start=wealth.start, end=wealth.end, empty=wealth.empty, points=wealth.points,
    )
