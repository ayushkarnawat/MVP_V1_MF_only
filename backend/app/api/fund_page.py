from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.user import User
from app.services.auth.session import get_active_user

router = APIRouter(prefix="/fund-page", tags=["fund_page"])


@router.get("/{scheme_id}/summary")
async def summary(
    scheme_id: uuid.UUID,
    scope: str = "combined",
    user: User = Depends(get_active_user),
    db: Session = Depends(get_db),
):
    # T3 replaces this stub with `build_summary`; present now only so T2 can
    # prove the auth dependency is wired before the real route exists.
    return {"status": "unavailable", "reason": "not_implemented"}
