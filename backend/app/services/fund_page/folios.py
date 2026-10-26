from __future__ import annotations

import uuid

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.folio import Folio
from app.models.user import HouseholdMember


def mask_folio(folio_number: str) -> str:
    alnum = "".join(ch for ch in folio_number if ch.isalnum())
    return "XXXXX" + alnum[-4:] if len(alnum) >= 4 else "XXXXX"


def full_folio_number(db: Session, user_id: uuid.UUID, folio_id: uuid.UUID) -> str:
    folio = (
        db.query(Folio)
        .join(HouseholdMember, HouseholdMember.id == Folio.household_member_id)
        .filter(Folio.id == folio_id, HouseholdMember.user_id == user_id)
        .first()
    )
    if folio is None:
        raise HTTPException(status_code=404, detail="Folio not found.")
    return folio.folio_number
