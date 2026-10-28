from __future__ import annotations

import uuid
from dataclasses import dataclass

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.services.dashboard.household_members import list_household_members
from app.services.dashboard.member_details import require_member


@dataclass(frozen=True)
class ScopeContext:
    member_ids: list[uuid.UUID]
    scope_key: str
    is_combined: bool


def resolve_scope(db: Session, user_id: uuid.UUID, scope: str) -> ScopeContext:
    if scope == "combined":
        members = list_household_members(db, user_id)
        return ScopeContext([member.id for member in members], "combined", True)
    try:
        member_id = uuid.UUID(scope)
    except ValueError:
        raise HTTPException(status_code=400, detail='scope must be "combined" or a household member id.')
    member = require_member(db, user_id, member_id)
    return ScopeContext([member.id], str(member.id), False)
