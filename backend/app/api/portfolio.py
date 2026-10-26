from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.home import get_now_ist
from app.db.session import get_db
from app.models.folio import Folio
from app.models.reference import NavHistory
from app.models.user import User
from app.services.auth.session import get_active_user
from app.services.dashboard.holdings import compute_realized_summary
from app.services.dashboard.instrument_allocation import compute_instrument_allocation
from app.services.dashboard.portfolio_schemas import (
    PortfolioAllocationResponse,
    PortfolioSummaryResponse,
    PortfolioValueSeriesResponse,
    zero_unsigned,
)
from app.services.dashboard.portfolio_summary import compute_portfolio_summary
from app.services.dashboard.value_series import build_portfolio_value_series
from app.services.dashboard.xirr import calculate_dashboard_xirr
from app.services.home.context import HomeInputs, ScopeContext, load_home_inputs, resolve_scope


router = APIRouter(tags=["portfolio"])


def _envelope(ctx: ScopeContext, inputs: HomeInputs, now_ist: datetime) -> dict:
    return {
        "scope": ctx.scope,
        "member_id": None if ctx.member_id is None else str(ctx.member_id),
        "nav_as_of": inputs.nav_as_of,
        "partial": inputs.partial,
        "missing_funds": list(inputs.missing_funds),
        "computed_at": now_ist.astimezone(timezone.utc),
    }


def _members(ctx: ScopeContext) -> list | None:
    return list(ctx.members) if ctx.scope == "aggregate" else None


def _latest_price_day(db: Session, ctx: ScopeContext, today: date) -> date | None:
    """The newest stored price date, on or before `today`, of any fund the scope has ever held."""
    if not ctx.member_ids:
        return None
    held = select(Folio.scheme_id).where(Folio.household_member_id.in_(ctx.member_ids))
    return db.execute(
        select(func.max(NavHistory.date)).where(
            NavHistory.scheme_id.in_(held), NavHistory.date <= today,
        )
    ).scalar_one_or_none()


async def _load_inputs(
    db: Session, ctx: ScopeContext, today: date, *, lookback_days: int,
    view: Literal["fund", "category", "sector"],
) -> HomeInputs:
    """Home's inputs with the price window anchored on the newest stored price, not on the calendar.

    Every Portfolio figure is measured back from the latest price date (`nav_as_of`), which is the clock's day
    only while the feed is current. Anchoring the load on `today` instead left the early part of the chart
    unpriced (0.00, `partial` false), dropped funds sold before the loaded window, and left `today_gain` at 0.00
    once the newest price was more than ~10 days old (review M1)."""
    anchor = min(today, _latest_price_day(db, ctx, today) or today)
    nav_start = anchor - timedelta(days=lookback_days)
    inputs = await load_home_inputs(db, ctx, today, nav_start=nav_start, view=view)
    # The newest price of the funds actually still held can be older than the newest price of any fund ever held
    # (a fund sold after its feed went on): if so the window must reach back from that older date.
    if inputs.nav_as_of is not None and inputs.nav_as_of - timedelta(days=lookback_days) < nav_start:
        nav_start = inputs.nav_as_of - timedelta(days=lookback_days)
        inputs = await load_home_inputs(db, ctx, today, nav_start=nav_start, view=view)
    return inputs


async def _allocation(db: Session, user: User, member_id: uuid.UUID | None, now_ist: datetime):
    ctx = resolve_scope(db, user, member_id)
    # View "fund": Portfolio uses none of the movers' per-view output, so skip the disclosure-weights query that
    # the "sector" view runs (review L5).
    inputs = await _load_inputs(db, ctx, now_ist.date(), lookback_days=15, view="fund")
    xirr_summary = calculate_dashboard_xirr(db, list(ctx.member_ids), list(inputs.holdings))
    buckets = compute_instrument_allocation(inputs.holdings, xirr_summary)
    return PortfolioAllocationResponse(
        **_envelope(ctx, inputs, now_ist), members=_members(ctx), buckets=buckets,
    )


async def _summary(db: Session, user: User, member_id: uuid.UUID | None, now_ist: datetime):
    ctx = resolve_scope(db, user, member_id)
    inputs = await _load_inputs(db, ctx, now_ist.date(), lookback_days=15, view="fund")
    xirr_summary = calculate_dashboard_xirr(db, list(ctx.member_ids), list(inputs.holdings))
    realized_summary = compute_realized_summary(db, list(ctx.member_ids))
    summary = compute_portfolio_summary(inputs.holdings, xirr_summary, realized_summary, inputs.movers)
    return PortfolioSummaryResponse(
        **_envelope(ctx, inputs, now_ist), members=_members(ctx), **summary.__dict__,
    )


async def _value_series(
    db: Session, user: User, member_id: uuid.UUID | None, now_ist: datetime, days: int,
):
    ctx = resolve_scope(db, user, member_id)
    today = now_ist.date()
    inputs = await _load_inputs(db, ctx, today, lookback_days=days + 15, view="fund")
    series = build_portfolio_value_series(db, ctx, inputs, today=today, days=days)
    return PortfolioValueSeriesResponse(
        **_envelope(ctx, inputs, now_ist), members=_members(ctx),
        days=series.days, start=series.start, end=series.end,
        empty=series.empty, points=[{"date": point.date, "value": zero_unsigned(point.value)} for point in series.points],
    )


@router.get("/household/aggregate/portfolio-allocation", response_model=PortfolioAllocationResponse)
async def aggregate_portfolio_allocation(user: User = Depends(get_active_user), db: Session = Depends(get_db), now: datetime = Depends(get_now_ist)):
    return await _allocation(db, user, None, now)


@router.get("/household-members/{member_id}/portfolio-allocation", response_model=PortfolioAllocationResponse)
async def member_portfolio_allocation(member_id: uuid.UUID, user: User = Depends(get_active_user), db: Session = Depends(get_db), now: datetime = Depends(get_now_ist)):
    return await _allocation(db, user, member_id, now)


@router.get("/household/aggregate/portfolio-summary", response_model=PortfolioSummaryResponse)
async def aggregate_portfolio_summary(user: User = Depends(get_active_user), db: Session = Depends(get_db), now: datetime = Depends(get_now_ist)):
    return await _summary(db, user, None, now)


@router.get("/household-members/{member_id}/portfolio-summary", response_model=PortfolioSummaryResponse)
async def member_portfolio_summary(member_id: uuid.UUID, user: User = Depends(get_active_user), db: Session = Depends(get_db), now: datetime = Depends(get_now_ist)):
    return await _summary(db, user, member_id, now)


@router.get("/household/aggregate/portfolio-value-series", response_model=PortfolioValueSeriesResponse)
async def aggregate_portfolio_value_series(days: int = Query(30, ge=2, le=366), user: User = Depends(get_active_user), db: Session = Depends(get_db), now: datetime = Depends(get_now_ist)):
    return await _value_series(db, user, None, now, days)


@router.get("/household-members/{member_id}/portfolio-value-series", response_model=PortfolioValueSeriesResponse)
async def member_portfolio_value_series(member_id: uuid.UUID, days: int = Query(30, ge=2, le=366), user: User = Depends(get_active_user), db: Session = Depends(get_db), now: datetime = Depends(get_now_ist)):
    return await _value_series(db, user, member_id, now, days)
