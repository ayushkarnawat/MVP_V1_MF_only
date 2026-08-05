from __future__ import annotations

from pydantic import BaseModel

from app.models.enums import Relationship


class HouseholdMemberCreate(BaseModel):
    name: str
    relationship: Relationship
    relationship_other_label: str | None = None


class HouseholdMemberResponse(BaseModel):
    id: str
    name: str
    relationship: Relationship
    relationship_other_label: str | None
