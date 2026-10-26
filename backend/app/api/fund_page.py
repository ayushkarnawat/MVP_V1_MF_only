from __future__ import annotations

import uuid

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.home import get_now_ist
from app.db.session import get_db
from app.models.reference import Scheme
from app.models.user import User
from app.services.auth.session import get_active_user
from app.services.fund_page.folios import full_folio_number
from app.services.fund_page.schemas import FolioNumberResponse, SummaryResponse
from app.services.fund_page.scope import resolve_scope
from app.services.fund_page.summary import build_summary

router = APIRouter(prefix="/fund-page", tags=["fund_page"])


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
