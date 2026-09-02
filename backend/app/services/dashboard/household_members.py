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


class DuplicateSelfMemberError(Exception):
    """Raised when a user already has a `relationship = 'self'` household
    member — the DB's partial unique index (migration 0011) is the source of
    truth; this pre-check exists to turn that constraint into a clean 409
    instead of a raw IntegrityError bubbling out of the route."""


def create_household_member(
    db: DbSession,
    user_id: uuid.UUID,
    name: str,
    relationship: Relationship,
    relationship_other_label: str | None = None,
) -> HouseholdMember:
    if relationship == Relationship.SELF:
        existing_self = (
            db.query(HouseholdMember)
            .filter_by(user_id=user_id, relationship=Relationship.SELF)
            .first()
        )
        if existing_self is not None:
            raise DuplicateSelfMemberError(
                "This user already has a 'self' household member."
            )

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


def get_household_member_for_user(
    db: DbSession, user_id: uuid.UUID, member_id: uuid.UUID
) -> HouseholdMember | None:
    """Scoped lookup used to authorize access to a household member before
    acting on their data (e.g. confirming an import) — returns None for a
    member that exists but belongs to a different user, same as one that
    doesn't exist at all, so callers can't distinguish the two."""
    return db.query(HouseholdMember).filter_by(id=member_id, user_id=user_id).first()
