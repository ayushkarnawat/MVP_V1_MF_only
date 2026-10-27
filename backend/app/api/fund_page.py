from __future__ import annotations

import uuid

from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.home import get_now_ist
from app.db.session import get_db
from app.models.reference import Scheme
from app.models.folio import Folio
from app.models.user import User
from app.services.auth.session import get_active_user
from app.services.fund_page.composition import all_holdings, build_composition
from app.services.fund_page.folios import full_folio_number
from app.services.fund_page.insights import build_insights
from app.services.fund_page.manager import build_manager
from app.services.fund_page.peers import (
    category_returns,
    category_series,
    period_returns,
    risk_return_scatter,
    rolling_returns,
)
from app.services.fund_page.performance import period_series
from app.services.fund_page.returns import current_returns, inception_returns
from app.services.fund_page.risk import compute_risk
from app.services.fund_page.score import build_score
from app.services.fund_page.schemas import (
    CategoryReturnsResponse,
    CategorySeriesResponse,
    CompositionResponse,
    FolioNumberResponse,
    HoldingsListResponse,
    InsightsResponse,
    ManagerResponse,
    PeerPeriodReturnsResponse,
    PerformanceResponse,
    ReturnsResponse,
    RiskResponse,
    RollingResponse,
    ScatterResponse,
    ScoreResponse,
    SummaryResponse,
    Unavailable,
)
from app.services.fund_page.scope import resolve_scope
from app.services.fund_page.summary import build_summary

router = APIRouter(prefix="/fund-page", tags=["fund_page"])

_PERIODS = Literal["1M", "3M", "6M", "1Y", "3Y", "5Y", "All"]
_RETURN_MODES = Literal["inception", "current"]
_ROLLING_WINDOWS = Literal[1, 3, 5]


def _scheme_or_404(db: Session, scheme_id: uuid.UUID) -> Scheme:
    scheme = db.get(Scheme, scheme_id)
    if scheme is None:
        raise HTTPException(status_code=404, detail="Scheme not found.")
    return scheme


@router.get("/{scheme_id}/summary", response_model=SummaryResponse)
async def summary(
    scheme_id: uuid.UUID,
    scope: str = "combined",
    user: User = Depends(get_active_user),
    db: Session = Depends(get_db),
    now: datetime = Depends(get_now_ist),
):
    scheme = _scheme_or_404(db, scheme_id)
    ctx = resolve_scope(db, user.id, scope)
    return await build_summary(db, scheme, ctx, user.id, now.date())


@router.get("/{scheme_id}/folios/{folio_id}/number", response_model=FolioNumberResponse)
async def folio_number(
    scheme_id: uuid.UUID,
    folio_id: uuid.UUID,
    user: User = Depends(get_active_user),
    db: Session = Depends(get_db),
):
    _scheme_or_404(db, scheme_id)
    folio = db.get(Folio, folio_id)
    if folio is None or folio.scheme_id != scheme_id:
        raise HTTPException(status_code=404, detail="Folio not found.")
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
    scheme = _scheme_or_404(db, scheme_id)
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
    scheme = _scheme_or_404(db, scheme_id)
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
    scheme = _scheme_or_404(db, scheme_id)
    return compute_risk(db, scheme, now.date())


@router.get(
    "/{scheme_id}/portfolio-composition",
    response_model=CompositionResponse | Unavailable,
)
async def portfolio_composition(
    scheme_id: uuid.UUID,
    _user: User = Depends(get_active_user),
    db: Session = Depends(get_db),
    now: datetime = Depends(get_now_ist),
):
    scheme = _scheme_or_404(db, scheme_id)
    return build_composition(db, scheme, now.date())


@router.get(
    "/{scheme_id}/holdings",
    response_model=HoldingsListResponse | Unavailable,
)
async def holdings(
    scheme_id: uuid.UUID,
    _user: User = Depends(get_active_user),
    db: Session = Depends(get_db),
    now: datetime = Depends(get_now_ist),
):
    scheme = _scheme_or_404(db, scheme_id)
    return all_holdings(db, scheme, now.date())


@router.get(
    "/{scheme_id}/manager",
    response_model=ManagerResponse | Unavailable,
)
async def manager(
    scheme_id: uuid.UUID,
    _user: User = Depends(get_active_user),
    db: Session = Depends(get_db),
    now: datetime = Depends(get_now_ist),
):
    scheme = _scheme_or_404(db, scheme_id)
    return build_manager(db, scheme, now.date())


@router.get("/{scheme_id}/score", response_model=ScoreResponse)
async def score(
    scheme_id: uuid.UUID,
    scope: str = "combined",
    user: User = Depends(get_active_user),
    db: Session = Depends(get_db),
    now: datetime = Depends(get_now_ist),
):
    scheme = _scheme_or_404(db, scheme_id)
    ctx = resolve_scope(db, user.id, scope)
    return await build_score(db, scheme, ctx, user.id, now.date(), now)


@router.get(
    "/{scheme_id}/peers/series",
    response_model=CategorySeriesResponse | Unavailable,
)
async def peers_series(
    scheme_id: uuid.UUID,
    period: _PERIODS = "1Y",
    _user: User = Depends(get_active_user),
    db: Session = Depends(get_db),
    now: datetime = Depends(get_now_ist),
):
    scheme = _scheme_or_404(db, scheme_id)
    return await category_series(db, scheme, period, now.date())


@router.get(
    "/{scheme_id}/peers/returns",
    response_model=CategoryReturnsResponse | Unavailable,
)
async def peers_returns(
    scheme_id: uuid.UUID,
    _user: User = Depends(get_active_user),
    db: Session = Depends(get_db),
    now: datetime = Depends(get_now_ist),
):
    scheme = _scheme_or_404(db, scheme_id)
    return await category_returns(db, scheme, now.date())


@router.get(
    "/{scheme_id}/peers/rolling",
    response_model=RollingResponse | Unavailable,
)
async def peers_rolling(
    scheme_id: uuid.UUID,
    window: _ROLLING_WINDOWS = 3,
    _user: User = Depends(get_active_user),
    db: Session = Depends(get_db),
    now: datetime = Depends(get_now_ist),
):
    scheme = _scheme_or_404(db, scheme_id)
    return await rolling_returns(db, scheme, window, now.date())


@router.get(
    "/{scheme_id}/peers/period-returns",
    response_model=PeerPeriodReturnsResponse | Unavailable,
)
async def peers_period_returns(
    scheme_id: uuid.UUID,
    period: _PERIODS = "1Y",
    _user: User = Depends(get_active_user),
    db: Session = Depends(get_db),
    now: datetime = Depends(get_now_ist),
):
    scheme = _scheme_or_404(db, scheme_id)
    return await period_returns(db, scheme, period, now.date())


@router.get(
    "/{scheme_id}/peers/scatter",
    response_model=ScatterResponse | Unavailable,
)
async def peers_scatter(
    scheme_id: uuid.UUID,
    _user: User = Depends(get_active_user),
    db: Session = Depends(get_db),
    now: datetime = Depends(get_now_ist),
):
    scheme = _scheme_or_404(db, scheme_id)
    return await risk_return_scatter(db, scheme, now.date())


@router.get("/{scheme_id}/insights", response_model=InsightsResponse)
async def insights(
    scheme_id: uuid.UUID,
    scope: str = "combined",
    user: User = Depends(get_active_user),
    db: Session = Depends(get_db),
    now: datetime = Depends(get_now_ist),
):
    scheme = _scheme_or_404(db, scheme_id)
    ctx = resolve_scope(db, user.id, scope)
    return await build_insights(db, scheme, ctx, user.id, now.date())
