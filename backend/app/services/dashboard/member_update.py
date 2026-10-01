"""PATCH /household-members/{id}: relationship, phone and email of an unlocked
family member. Name and PAN come from the CAS and are never editable here."""

from __future__ import annotations

import re
import uuid

from pydantic import BaseModel
from sqlalchemy.orm import Session as DbSession

from app.models.enums import Relationship
from app.models.user import HouseholdMember
from app.services.dashboard.member_details import (
    FieldNotEditableError,
    InvalidMemberDetailsError,
    MemberNotFoundError,
)

# The auth layer has no phone normaliser (it stores the client's string as
# sent) and email-validator isn't installed, so EmailStr is unavailable. These
# two are deliberately simple: contact details are unverified (decision Q8).
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_IN_MOBILE_RE = re.compile(r"^[6-9][0-9]{9}$")


class MemberUpdateRequest(BaseModel):
    relationship: Relationship | None = None
    relationship_other_label: str | None = None
    phone_number: str | None = None
    email: str | None = None
    # Accepted only so a caller sending them gets a clear 422.
    name: str | None = None
    pan: str | None = None


def normalise_indian_phone(raw: str) -> str:
    digits = re.sub(r"[\s\-()]", "", raw)
    if digits.startswith("+91"):
        digits = digits[3:]
    elif digits.startswith("91") and len(digits) == 12:
        digits = digits[2:]
    elif digits.startswith("0") and len(digits) == 11:
        digits = digits[1:]
    if not _IN_MOBILE_RE.match(digits):
        raise InvalidMemberDetailsError("Enter a valid 10-digit Indian mobile number.")
    return f"+91{digits}"


def _clean_email(raw: str) -> str:
    email = raw.strip().lower()
    if not _EMAIL_RE.match(email):
        raise InvalidMemberDetailsError("Enter a valid email address.")
    return email


def update_member(
    db: DbSession, user_id: uuid.UUID, member_id: uuid.UUID, body: MemberUpdateRequest
) -> HouseholdMember:
    member = db.query(HouseholdMember).filter_by(id=member_id, user_id=user_id).first()
    if member is None:
        raise MemberNotFoundError()
    sent = body.model_fields_set
    if body.name is not None or body.pan is not None:
        raise FieldNotEditableError("Name and PAN come from your statement and can’t be changed.")
    is_self = member.relationship == Relationship.SELF
    if is_self and ("phone_number" in sent or "email" in sent):
        raise FieldNotEditableError("Change your phone or email from Account Info.")
    if is_self and body.relationship is not None:
        raise InvalidMemberDetailsError("Your own relationship can’t be changed.")

    if body.relationship is not None:
        if body.relationship == Relationship.SELF:
            raise InvalidMemberDetailsError("Choose how this person is related to you.")
        if body.relationship == Relationship.OTHER:
            label = (body.relationship_other_label or "").strip()
            if not label:
                raise InvalidMemberDetailsError("Tell us how this person is related to you.")
            member.relationship_other_label = label
        else:
            member.relationship_other_label = None
        member.relationship = body.relationship
    if "phone_number" in sent:
        raw = (body.phone_number or "").strip()
        member.phone_number = normalise_indian_phone(raw) if raw else None
    if "email" in sent:
        raw = (body.email or "").strip()
        member.email = _clean_email(raw) if raw else None
    db.commit()
    return member
