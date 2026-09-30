"""Unlock ("add details") for a CAS-detected household member, plus the lock
gate used by every member-scoped read route. Spec states L1-L9."""

from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone

from fastapi import HTTPException
from pydantic import BaseModel
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session as DbSession

from app.models.enums import (
    MemberLockReason,
    MemberNameSource,
    MemberPanSource,
    NameChangeReason,
    Relationship,
)
from app.models.folio import Folio
from app.models.member_history import HouseholdMemberNameChange
from app.models.user import HouseholdMember
from app.services.import_.crypto import decrypt_pan, encrypt_pan, hash_pan, normalize_pan
from app.services.import_.name_match import validate_person_name
from app.services.import_.pan_claims import (
    CrossAccountPanBlockedError,
    is_expired_pending,
)
from app.services.import_.parser import mask_pan

_PAN_RE = re.compile(r"^[A-Z]{5}[0-9]{4}[A-Z]$")

INVALID_PAN_MESSAGE = "Enter a valid PAN: 5 letters, 4 digits, then 1 letter."
# L5 (F37: no gendered pronouns; the spec's own L8 wording).
_L5_MESSAGE = (
    "{name} has their own Unifolio account. Their funds are included in your family "
    "total. Their own dashboard stays with their account."
)
# L9: the unlocked-member edit variant.
_L9_MESSAGE = "This PAN is already on another Unifolio account. {name}’s PAN hasn’t changed."


def normalise_pan_input(raw: str) -> str:
    return normalize_pan(raw)


class MemberDetailsError(Exception):
    status_code = 409
    code = "member_details_error"

    def __init__(self, message: str, details: dict | None = None):
        super().__init__(message)
        self.message = message
        self.details = details or {}


class MemberNotFoundError(MemberDetailsError):
    status_code = 404
    code = "member_not_found"

    def __init__(self):
        super().__init__("Household member not found.")


class InvalidMemberDetailsError(MemberDetailsError):
    status_code = 422
    code = "invalid_relationship"


class InvalidPanFormatError(MemberDetailsError):
    status_code = 422
    code = "invalid_pan_format"

    def __init__(self):
        super().__init__(INVALID_PAN_MESSAGE)


class DetectedPanMismatchError(MemberDetailsError):
    code = "detected_pan_mismatch"

    def __init__(self, detected_pan_masked: str, member_name: str = "This person"):
        super().__init__(
            "This PAN doesn’t match your statement. Your statement shows "
            f"{member_name}’s PAN as {detected_pan_masked}. Check the PAN and try again.",
            {"detected_pan_masked": detected_pan_masked},
        )
        self.detected_pan_masked = detected_pan_masked


class PanOnOtherMemberError(MemberDetailsError):
    code = "pan_belongs_to_other_member"

    def __init__(
        self,
        other_member_id: uuid.UUID,
        other_member_name: str,
        can_merge: bool,
        source_member_name: str = "This person",
        source_fund_count: int = 0,
    ):
        if can_merge:
            message = (
                f"This PAN is already on {other_member_name}. "
                f"{source_member_name} and {other_member_name} may be the same person. Merging "
                f"moves {source_member_name}’s {source_fund_count} "
                f"fund{'' if source_fund_count == 1 else 's'} into {other_member_name} and "
                f"removes {source_member_name} from your family list."
            )
        else:
            message = f"This PAN is already on {other_member_name}."
        super().__init__(
            message,
            {
                "other_member_id": str(other_member_id),
                "other_member_name": other_member_name,
                "can_merge": can_merge,
                "source_fund_count": source_fund_count,
            },
        )
        self.other_member_id = other_member_id
        self.other_member_name = other_member_name
        self.can_merge = can_merge
        self.source_fund_count = source_fund_count


class MemberDetailsRequest(BaseModel):
    name: str | None = None
    relationship: Relationship
    relationship_other_label: str | None = None
    pan: str


def _holder(db: DbSession, pan_hash: str, exclude_id: uuid.UUID, now: datetime) -> HouseholdMember | None:
    """Read-only (no lazy clearing of expired claims): the unlocked-member
    edit path must have no side effects (L9)."""
    rows = (
        db.query(HouseholdMember)
        .filter(HouseholdMember.pan_lookup_hash == pan_hash, HouseholdMember.id != exclude_id)
        .all()
    )
    live = [r for r in rows if not is_expired_pending(r, now)]
    return live[0] if live else None


def _validate_relationship(body: MemberDetailsRequest) -> str | None:
    # F33: a locked person can never become "self" (0011 unique index -> 500).
    if body.relationship == Relationship.SELF:
        raise InvalidMemberDetailsError("Choose how this person is related to you.")
    if body.relationship == Relationship.OTHER:
        label = (body.relationship_other_label or "").strip()
        if not label:
            raise InvalidMemberDetailsError("Tell us how this person is related to you.")
        return label
    return None


def is_name_only(member: HouseholdMember) -> bool:
    """F34 provenance: no statement-detected PAN, or a PAN the user typed
    (L5). Such a person has nothing on a statement to verify against, so it may
    be corrected (L5 typo) or merged into another member (M11)."""
    return member.detected_pan_hash is None or member.pan_source == MemberPanSource.USER_ENTERED


def complete_member_details(
    db: DbSession, user_id: uuid.UUID, member_id: uuid.UUID, body: MemberDetailsRequest
) -> HouseholdMember:
    member = db.query(HouseholdMember).filter_by(id=member_id, user_id=user_id).first()
    if member is None:
        raise MemberNotFoundError()
    if member.relationship == Relationship.SELF:
        raise InvalidMemberDetailsError("Your own details are edited from your profile.")
    label = _validate_relationship(body)
    new_name = validate_person_name(body.name) if body.name is not None else None
    pan = normalise_pan_input(body.pan)
    if not _PAN_RE.match(pan):
        raise InvalidPanFormatError()

    now = datetime.now(timezone.utc)
    pan_hash = hash_pan(pan)
    locked = member.is_locked
    # F34 provenance: a person whose only PAN is one the user typed (L5 on a
    # name-only person) is still "name-only": nothing on a statement to verify
    # against, so an L5 typo can be corrected.
    name_only = is_name_only(member)

    # ---- checks first; nothing below the writes may raise on the unlocked path
    if locked and not name_only and pan_hash != member.detected_pan_hash:
        raise DetectedPanMismatchError(mask_pan(decrypt_pan(member.detected_pan_encrypted)), member.name)

    already_mine = member.pan_lookup_hash == pan_hash
    holder = None if already_mine else _holder(db, pan_hash, member.id, now)
    if holder is not None and holder.user_id == user_id:
        can_merge = locked and name_only
        fund_count = db.query(Folio).filter(Folio.household_member_id == member.id).count()
        raise PanOnOtherMemberError(
            holder.id, holder.name, can_merge,
            source_member_name=member.name, source_fund_count=fund_count,
        )
    if holder is not None:  # another account
        if not locked:
            raise CrossAccountPanBlockedError(_L9_MESSAGE.format(name=member.name))
        # L5: keep what the user gave us, stay locked, and remember the typed
        # PAN of a name-only person (F34) so refresh_other_account_locks can
        # re-check it and a later unlock is verified against it.
        member.relationship = body.relationship
        member.relationship_other_label = label
        member.lock_reason = MemberLockReason.PAN_ON_OTHER_ACCOUNT
        if name_only:
            member.detected_pan_encrypted = encrypt_pan(pan)
            member.detected_pan_hash = pan_hash
            member.pan_source = MemberPanSource.USER_ENTERED
        db.commit()
        raise CrossAccountPanBlockedError(_L5_MESSAGE.format(name=member.name))

    # ---- writes
    member.relationship = body.relationship
    member.relationship_other_label = label
    if new_name is not None and new_name != member.name:
        db.add(
            HouseholdMemberNameChange(
                household_member_id=member.id, old_name=member.name, new_name=new_name,
                reason=NameChangeReason.USER_EDIT, changed_at=now,
            )
        )
        member.name = new_name
        member.name_source = MemberNameSource.USER_ENTERED
        member.name_updated_at = now

    if not already_mine:
        matches_detected = locked and not name_only and member.detected_pan_hash == pan_hash
        member.pan_encrypted = encrypt_pan(pan)
        member.pan_lookup_hash = pan_hash
        member.pan_pending_until = None
        member.pan_source = MemberPanSource.CAS if matches_detected else MemberPanSource.USER_ENTERED
        member.pan_verified_at = now if matches_detected else None
    if locked:
        member.details_completed_at = now
        member.lock_reason = None
        member.detected_pan_encrypted = None
        member.detected_pan_hash = None
    try:
        db.commit()
    except IntegrityError:
        # Lost the unique-PAN race to another claimant.
        db.rollback()
        raise CrossAccountPanBlockedError(_L5_MESSAGE.format(name=member.name)) from None
    return member


def refresh_other_account_locks(db: DbSession, user_id: uuid.UUID) -> int:
    """Lazy: a member locked as pan_on_other_account goes back to
    details_needed once the other account no longer holds that PAN."""
    now = datetime.now(timezone.utc)
    rows = (
        db.query(HouseholdMember)
        .filter(
            HouseholdMember.user_id == user_id,
            HouseholdMember.lock_reason == MemberLockReason.PAN_ON_OTHER_ACCOUNT,
            HouseholdMember.detected_pan_hash.isnot(None),
        )
        .all()
    )
    flipped = 0
    for m in rows:
        held = (
            db.query(HouseholdMember)
            .filter(
                HouseholdMember.pan_lookup_hash == m.detected_pan_hash,
                HouseholdMember.user_id != user_id,
            )
            .all()
        )
        if not any(not is_expired_pending(h, now) for h in held):
            m.lock_reason = MemberLockReason.DETAILS_NEEDED
            flipped += 1
    if flipped:
        db.commit()
    return flipped


def require_unlocked_member(db: DbSession, user_id: uuid.UUID, member_id: uuid.UUID) -> HouseholdMember:
    member = db.query(HouseholdMember).filter_by(id=member_id, user_id=user_id).first()
    if member is None:
        raise HTTPException(status_code=404, detail="Household member not found.")
    if member.is_locked:
        raise HTTPException(
            status_code=403,
            detail={
                "code": "member_details_required",
                "message": f"Add {member.name}’s details to see their dashboard.",
            },
        )
    return member
