"""PUT /household-members/{id}/profile: the Complete profile popup's Save
(spec member-profile-completion-map.html). Writes only the fields sent;
nothing is required except a PAN for a member with no PAN of any kind (Q2).
A PAN is stored exactly like Self's: encrypt_pan -> pan_encrypted, hash_pan
-> the unique pan_lookup_hash, unless another account holds it (Q3: kept in
detected_pan_* with pan_conflict, and the response tells the UI to warn)."""

from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone

from pydantic import BaseModel
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session as DbSession

from app.models.enums import (
    MemberNameSource,
    MemberOrigin,
    MemberPanConflict,
    MemberPanSource,
    NameChangeReason,
    Relationship,
)
from app.models.folio import Folio
from app.models.member_history import HouseholdMemberNameChange
from app.models.user import HouseholdMember
from app.services.dashboard.holdings import invalidate_holdings_cache
from app.services.dashboard.member_details import (
    _PAN_RE,
    FieldNotEditableError,
    InvalidMemberDetailsError,
    InvalidPanFormatError,
    MemberNotFoundError,
    PanOnOtherMemberError,
    PanRequiredError,
    _holder,
)
from app.services.dashboard.profile_completion import pan_editable
from app.services.import_.crypto import encrypt_pan, hash_pan, normalize_pan
from app.services.import_.name_match import normalise_name, validate_person_name
from app.services.import_.pan_claims import CROSS_ACCOUNT_PAN_BLOCKED_MESSAGE, CrossAccountPanBlockedError
from app.services.import_.people_resolution import has_no_pan

# The auth layer has no phone normaliser and email-validator isn't installed,
# so these are deliberately simple: contact details are unverified (Q8).
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_IN_MOBILE_RE = re.compile(r"^[6-9][0-9]{9}$")


class MemberProfileRequest(BaseModel):
    name: str | None = None
    relationship: Relationship | None = None
    relationship_other_label: str | None = None
    phone_number: str | None = None
    email: str | None = None
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


def save_member_profile(
    db: DbSession, user_id: uuid.UUID, member_id: uuid.UUID, body: MemberProfileRequest
) -> HouseholdMember:
    member = db.query(HouseholdMember).filter_by(id=member_id, user_id=user_id).first()
    if member is None:
        raise MemberNotFoundError()
    sent = body.model_fields_set
    is_self = member.relationship == Relationship.SELF
    if is_self:
        if sent & {"relationship", "relationship_other_label"}:
            raise InvalidMemberDetailsError("Your own relationship can’t be changed.")
        if sent & {"phone_number", "email"}:
            raise FieldNotEditableError("Change your phone or email from Account Info.")

    # ---- validate everything first: a 422 writes nothing (Review Focus 4)
    new_name: str | None = None
    if "name" in sent and body.name is not None:
        clean = validate_person_name(body.name)  # InvalidPersonNameError -> 422 invalid_name
        # Case/spacing-only changes are not an edit, so name_source stays 'cas'.
        if normalise_name(clean) != normalise_name(member.name):
            new_name = clean

    relationship_change: tuple[Relationship | None, str | None] | None = None
    if "relationship" in sent and not is_self:
        label: str | None = None
        if body.relationship == Relationship.SELF:
            raise InvalidMemberDetailsError("Choose how this person is related to you.")
        if body.relationship == Relationship.OTHER:
            label = (body.relationship_other_label or "").strip()
            if not label:
                raise InvalidMemberDetailsError("Tell us how this person is related to you.")
        relationship_change = (body.relationship, label)

    phone = email = None
    if "phone_number" in sent:
        raw = (body.phone_number or "").strip()
        phone = normalise_indian_phone(raw) if raw else ""
    if "email" in sent:
        raw = (body.email or "").strip()
        email = _clean_email(raw) if raw else ""

    pan: str | None = None
    raw_pan = (body.pan or "").strip()
    if pan_editable(member):
        if raw_pan:
            pan = normalize_pan(raw_pan)
            if not _PAN_RE.match(pan):
                raise InvalidPanFormatError()
        elif has_no_pan(member):
            raise PanRequiredError(f"Enter {member.name}’s PAN.")
    elif raw_pan:
        raise FieldNotEditableError("This PAN comes from your statement and can’t be changed.")

    now = datetime.now(timezone.utc)
    holder = None
    pan_hash = None
    if pan is not None:
        pan_hash = hash_pan(pan)
        holder = _holder(db, pan_hash, member.id, now)
        if holder is not None and holder.user_id == user_id:
            fund_count = db.query(Folio).filter(Folio.household_member_id == member.id).count()
            raise PanOnOtherMemberError(
                holder.id,
                holder.name,
                # Same rule as merge_member_into: only a detected member can be merged away.
                can_merge=member.origin == MemberOrigin.CAS_DETECTED,
                source_member_name=member.name,
                source_fund_count=fund_count,
                source_pan_label="PAN not on statement",
            )

    # ---- writes
    if new_name is not None:
        db.add(
            HouseholdMemberNameChange(
                id=uuid.uuid4(),
                household_member_id=member.id,
                old_name=member.name,
                new_name=new_name,
                reason=NameChangeReason.USER_EDIT,
                import_id=None,
                changed_at=now,
            )
        )
        member.name = new_name
        member.name_source = MemberNameSource.USER_EDITED  # a later CAS asks first (Q1)
        member.name_updated_at = now
    if relationship_change is not None:
        member.relationship, member.relationship_other_label = relationship_change
    if phone is not None:
        member.phone_number = phone or None
    if email is not None:
        member.email = email or None
    if pan is not None:
        member.pan_source = MemberPanSource.USER_ENTERED
        member.pan_verified_at = None
        if holder is not None:
            # Q3: another account holds it. Keep it (encrypted) for the banner
            # and for refresh_pan_conflicts; the rest of the profile is saved.
            member.detected_pan_encrypted = encrypt_pan(pan)
            member.detected_pan_hash = pan_hash
            member.pan_conflict = MemberPanConflict.OTHER_ACCOUNT
        else:
            member.pan_encrypted = encrypt_pan(pan)
            member.pan_lookup_hash = pan_hash
            member.pan_pending_until = None
            member.detected_pan_encrypted = None
            member.detected_pan_hash = None
            member.pan_conflict = None
    try:
        db.commit()
    except IntegrityError:
        # Lost the unique-PAN race between _holder and commit.
        db.rollback()
        raise CrossAccountPanBlockedError(CROSS_ACCOUNT_PAN_BLOCKED_MESSAGE) from None
    if new_name is not None:
        # Cached holdings rows carry the member's name (15 min). After the
        # commit, as merge does. Snapshots read the name live, so no
        # invalidate_member_snapshots here.
        invalidate_holdings_cache(member.id)
    return member
