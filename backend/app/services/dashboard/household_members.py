"""Household member CRUD — scoped to the authenticated user. Per
TDD-Unifolio.md's ownership table, /household-members belongs to the
Dashboard service even though it's populated during onboarding (PRD-02
FR-6)."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy.orm import Session as DbSession

from app.models.enums import MemberNameSource, MemberOrigin, MemberPanSource, Relationship
from app.models.user import HouseholdMember
from app.services.dashboard.schemas import HouseholdMemberResponse
from app.services.import_.crypto import decrypt_pan
from app.services.import_.name_match import validate_person_name
from app.services.import_.parser import mask_pan


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
    name = validate_person_name(name)  # InvalidPersonNameError -> 422 invalid_name
    if relationship == Relationship.SELF:
        existing_self = (
            db.query(HouseholdMember)
            .filter_by(user_id=user_id, relationship=Relationship.SELF)
            .first()
        )
        if existing_self is not None:
            # 2026-10-01 (decision QA): the onboarding name is provisional
            # until the first CAS gives the real one. Going Back to the name
            # step and changing it renames the same row instead of failing.
            if (
                existing_self.name_source == MemberNameSource.USER_ENTERED
                and existing_self.pan_lookup_hash is None
            ):
                existing_self.name = name
                existing_self.name_updated_at = datetime.now(timezone.utc)
                db.commit()
                return existing_self
            raise DuplicateSelfMemberError(
                "This user already has a 'self' household member."
            )

    member = HouseholdMember(
        user_id=user_id,
        name=name,
        relationship=relationship,
        relationship_other_label=relationship_other_label,
        created_at=datetime.now(timezone.utc),
        origin=MemberOrigin.ONBOARDING if relationship == Relationship.SELF else MemberOrigin.MANUAL,
        name_source=MemberNameSource.USER_ENTERED,
        details_completed_at=datetime.now(timezone.utc),
        lock_reason=None,
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


def member_to_response(m: HouseholdMember) -> HouseholdMemberResponse:
    encrypted = m.pan_encrypted or m.detected_pan_encrypted
    return HouseholdMemberResponse(
        id=str(m.id),
        name=m.name,
        relationship=m.relationship,
        relationship_other_label=m.relationship_other_label,
        origin=m.origin.value,
        lock_reason=m.lock_reason.value if m.lock_reason else None,
        details_required=m.is_locked,
        pan_masked=mask_pan(decrypt_pan(encrypted)) if encrypted else None,
        phone_number=m.phone_number,
        email=m.email,
        pan_on_statement=(
            m.is_locked
            and m.detected_pan_hash is not None
            and m.pan_source != MemberPanSource.USER_ENTERED
        ),
        name_from_statement=m.name_source == MemberNameSource.CAS,
    )
