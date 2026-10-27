from __future__ import annotations

import uuid

from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.home import get_now_ist
from app.db.session import get_db
from app.models.reference import Scheme
from app.models.user import User
from app.services.auth.session import get_active_user
from app.services.fund_page.folios import full_folio_number
from app.services.fund_page.performance import period_series
from app.services.fund_page.returns import current_returns, inception_returns
from app.services.fund_page.risk import compute_risk
from app.services.fund_page.schemas import (
    FolioNumberResponse,
    PerformanceResponse,
    ReturnsResponse,
    RiskResponse,
    SummaryResponse,
    Unavailable,
)
from app.services.fund_page.scope import resolve_scope
from app.services.fund_page.summary import build_summary

router = APIRouter(prefix="/fund-page", tags=["fund_page"])

_PERIODS = Literal["1M", "3M", "6M", "1Y", "3Y", "5Y", "All"]
_RETURN_MODES = Literal["inception", "current"]


@router.get("/{scheme_id}/summary", response_model=SummaryResponse)
async def summary(
    scheme_id: uuid.UUID,
    scope: str = "combined",
    user: User = Depends(get_active_user),
    db: Session = Depends(get_db),
    now: datetime = Depends(get_now_ist),
):
    scheme = db.get(Scheme, scheme_id)
    if scheme is None:
        raise HTTPException(status_code=404, detail="Scheme not found.")
    ctx = resolve_scope(db, user.id, scope)
    return await build_summary(db, scheme, ctx, user.id, now.date())


@router.get("/{scheme_id}/folios/{folio_id}/number", response_model=FolioNumberResponse)
async def folio_number(
    scheme_id: uuid.UUID,
    folio_id: uuid.UUID,
    user: User = Depends(get_active_user),
    db: Session = Depends(get_db),
):
    number = full_folio_number(db, user.id, folio_id)
    return FolioNumberResponse(folio_id=str(folio_id), folio_number=number)


@router.get(
    "/{scheme_id}/performance",
    response_model=PerformanceResponse | Unavailable,
)
async def performance(
    scheme_id: uuid.UUID,
    period: _PERIODS = "1Y",
    _user: User = Depends(get_active_user),
    db: Session = Depends(get_db),
    now: datetime = Depends(get_now_ist),
):
    scheme = db.get(Scheme, scheme_id)
    if scheme is None:
        raise HTTPException(status_code=404, detail="Scheme not found.")
    return await period_series(db, scheme, period, now.date())


@router.get(
    "/{scheme_id}/returns",
    response_model=ReturnsResponse | Unavailable,
)
async def returns(
    scheme_id: uuid.UUID,
    mode: _RETURN_MODES = "inception",
    scope: str = "combined",
    user: User = Depends(get_active_user),
    db: Session = Depends(get_db),
    now: datetime = Depends(get_now_ist),
):
    scheme = db.get(Scheme, scheme_id)
    if scheme is None:
        raise HTTPException(status_code=404, detail="Scheme not found.")
    ctx = resolve_scope(db, user.id, scope)
    if mode == "current":
        return await current_returns(db, scheme, ctx, user.id, now.date())
    return inception_returns(db, scheme, now.date())


@router.get(
    "/{scheme_id}/risk",
    response_model=RiskResponse | Unavailable,
)
async def risk(
    scheme_id: uuid.UUID,
    _user: User = Depends(get_active_user),
    db: Session = Depends(get_db),
    now: datetime = Depends(get_now_ist),
):
    scheme = db.get(Scheme, scheme_id)
    if scheme is None:
        raise HTTPException(status_code=404, detail="Scheme not found.")
    return compute_risk(db, scheme, now.date())
