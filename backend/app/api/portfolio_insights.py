from __future__ import annotations

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.home import get_now_ist
from app.api.portfolio import _envelope, _load_inputs, _members
from app.db.session import get_db
from app.models.user import User
from app.services.auth.session import get_active_user
from app.services.dashboard.portfolio_insights import compute_portfolio_insights
from app.services.dashboard.portfolio_insights_schemas import PortfolioInsightsResponse
from app.services.dashboard.sip import compute_active_sips
from app.services.home.context import resolve_scope


router = APIRouter(tags=["portfolio"])


async def _insights(db: Session, user: User, member_id: uuid.UUID | None, now_ist: datetime):
    ctx = resolve_scope(db, user, member_id)
    # Same stored-price inputs as the other Portfolio routes; the "fund" view skips the sector-weights query.
    inputs = await _load_inputs(db, ctx, now_ist.date(), lookback_days=15, view="fund")
    sip_rows = compute_active_sips(db, list(ctx.member_ids), today=now_ist.date())
    result = compute_portfolio_insights(inputs.holdings, sip_rows)
    return PortfolioInsightsResponse(
        **_envelope(ctx, inputs, now_ist), members=_members(ctx), total_value=result.total_value,
        empty=result.empty, empty_reason=result.empty_reason, insights=result.insights,
    )


@router.get("/household/aggregate/portfolio-insights", response_model=PortfolioInsightsResponse)
async def aggregate_portfolio_insights(user: User = Depends(get_active_user), db: Session = Depends(get_db), now: datetime = Depends(get_now_ist)):
    return await _insights(db, user, None, now)


@router.get("/household-members/{member_id}/portfolio-insights", response_model=PortfolioInsightsResponse)
async def member_portfolio_insights(member_id: uuid.UUID, user: User = Depends(get_active_user), db: Session = Depends(get_db), now: datetime = Depends(get_now_ist)):
    return await _insights(db, user, member_id, now)
