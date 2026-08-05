"""Household member CRUD — scoped to the authenticated user. Per
TDD-Unifolio.md's ownership table, /household-members belongs to the
Dashboard service even though it's populated during onboarding (PRD-02
FR-6)."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy.orm import Session as DbSession

from app.models.enums import Relationship
from app.models.user import HouseholdMember


def create_household_member(
    db: DbSession,
    user_id: uuid.UUID,
    name: str,
    relationship: Relationship,
    relationship_other_label: str | None = None,
) -> HouseholdMember:
    member = HouseholdMember(
        user_id=user_id,
        name=name,
        relationship=relationship,
        relationship_other_label=relationship_other_label,
        created_at=datetime.now(timezone.utc),
    )
    db.add(member)
    db.commit()
    return member


def list_household_members(db: DbSession, user_id: uuid.UUID) -> list[HouseholdMember]:
    return (
        db.query(HouseholdMember)
        .filter_by(user_id=user_id)
        .order_by(HouseholdMember.created_at)
        .all()
    )
