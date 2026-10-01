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
    MemberPanSource,
    Relationship,
)
from app.models.folio import Folio
from app.models.user import HouseholdMember
from app.services.import_.crypto import decrypt_pan, encrypt_pan, hash_pan, normalize_pan
from app.services.import_.pan_claims import (
    CrossAccountPanBlockedError,
    _clear_pan,
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


class FieldNotEditableError(MemberDetailsError):
    """2026-10-01 rule: name and PAN come from the CAS. Also raised for the
    old L9 "edit an unlocked member" use of /details, which moved to PATCH."""

    status_code = 422
    code = "field_not_editable"


class InvalidPanFormatError(MemberDetailsError):
    status_code = 422
    code = "invalid_pan_format"

    def __init__(self):
        super().__init__(INVALID_PAN_MESSAGE)


class PanOnOtherMemberError(MemberDetailsError):
    code = "pan_belongs_to_other_member"

    def __init__(
        self,
        other_member_id: uuid.UUID,
        other_member_name: str,
        can_merge: bool,
        source_member_name: str = "This person",
        source_fund_count: int = 0,
        source_pan_label: str = "PAN not on statement",
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
                # Staging-QA 5C: tells two same-named people apart in the popup.
                "source_pan_label": source_pan_label,
            },
        )
        self.other_member_id = other_member_id
        self.other_member_name = other_member_name
        self.can_merge = can_merge
        self.source_fund_count = source_fund_count


class MemberDetailsRequest(BaseModel):
    relationship: Relationship
    relationship_other_label: str | None = None
    pan: str | None = None
    # 2026-10-01 rule: name and PAN come from the CAS. Kept as fields only so a
    # caller sending them gets a clear 422 instead of being silently ignored.
    name: str | None = None
    # Old clients (pre-2026-10-01) may still send this during a rollout; the
    # statement PAN is now always used, so it is accepted and ignored.
    use_detected_pan: bool = False


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
    """F34 provenance: no PAN from a statement (none at all, or one the user
    typed). Such a person can be merged into another member (M11)."""
    return member.pan_source != MemberPanSource.CAS


def complete_member_details(
    db: DbSession, user_id: uuid.UUID, member_id: uuid.UUID, body: MemberDetailsRequest
) -> HouseholdMember:
    member = db.query(HouseholdMember).filter_by(id=member_id, user_id=user_id).first()
    if member is None:
        raise MemberNotFoundError()
    if member.relationship == Relationship.SELF:
        raise InvalidMemberDetailsError("Your own details are edited from your profile.")
    if not member.is_locked:
        raise FieldNotEditableError("Edit this person from Profile → Family Members.")
    if body.name is not None:
        raise FieldNotEditableError("Names come from your statement and can’t be changed.")
    label = _validate_relationship(body)
    locked = True
    # F34 provenance: a person whose only PAN is one the user typed (L5 on a
    # name-only person) is still "name-only": nothing on a statement to verify
    # against, so an L5 typo can be corrected.
    name_only = is_name_only(member)
    if not name_only:
        # Statement PAN: always the one the CAS showed (decision QD).
        if body.pan is not None:
            raise FieldNotEditableError("This PAN comes from your statement and can’t be changed.")
        pan = decrypt_pan(member.detected_pan_encrypted)
    else:
        # No PAN on the statement: the only place a PAN is typed (decision QC).
        if body.pan is None:
            raise InvalidMemberDetailsError(f"Enter {member.name}’s PAN.")
        pan = normalise_pan_input(body.pan)
        if not _PAN_RE.match(pan):
            raise InvalidPanFormatError()

    now = datetime.now(timezone.utc)
    pan_hash = hash_pan(pan)

    # ---- checks first
    already_mine = member.pan_lookup_hash == pan_hash
    holder = None if already_mine else _holder(db, pan_hash, member.id, now)
    if holder is not None and holder.user_id == user_id:
        # Staging-QA fix 5C: a locked duplicate whose statement PAN is exactly
        # the holder's PAN is provably the same person, so it can merge too
        # (before, only a name-only source could, which stranded it).
        same_pan = member.detected_pan_hash is not None and member.detected_pan_hash == holder.pan_lookup_hash
        can_merge = locked and (name_only or same_pan)
        fund_count = db.query(Folio).filter(Folio.household_member_id == member.id).count()
        raise PanOnOtherMemberError(
            holder.id, holder.name, can_merge,
            source_member_name=member.name, source_fund_count=fund_count,
            source_pan_label=(
                mask_pan(decrypt_pan(member.detected_pan_encrypted))
                if member.detected_pan_encrypted else "PAN not on statement"
            ),
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


def refresh_pan_conflicts(db: DbSession, user_id: uuid.UUID) -> int:
    """Lazy (Review Focus 2): once no live claim holds a conflicting PAN, it
    moves into this member's unique PAN columns, the same storage as any
    other PAN, and the banner goes. Any live holder keeps the conflict --
    the other account's, or one in this user's own account (left for a
    merge, never silently moved)."""
    now = datetime.now(timezone.utc)
    rows = (
        db.query(HouseholdMember)
        .filter(HouseholdMember.user_id == user_id, HouseholdMember.pan_conflict.isnot(None))
        .all()
    )
    promoted = 0
    for m in rows:
        held = db.query(HouseholdMember).filter(HouseholdMember.pan_lookup_hash == m.detected_pan_hash).all()
        if any(not is_expired_pending(h, now) for h in held):
            continue
        for stale in held:  # an expired pending claim still occupies the index
            _clear_pan(stale)
            # _clear_pan leaves these; with no PAN left they would misreport
            # the row as having a statement / verified PAN.
            stale.pan_source = None
            stale.pan_verified_at = None
        if held:
            # The unit of work orders UPDATEs by primary key, so without this
            # flush the claim below can run before the stale row lets go of
            # the hash and hit the unique index.
            db.flush()
        m.pan_encrypted, m.pan_lookup_hash = m.detected_pan_encrypted, m.detected_pan_hash
        m.pan_pending_until = None
        m.pan_verified_at = now if m.pan_source == MemberPanSource.CAS else None
        m.detected_pan_encrypted = m.detected_pan_hash = None
        m.pan_conflict = None
        promoted += 1
    if promoted:
        try:
            db.commit()
        except IntegrityError:
            # Someone took the PAN between the read and the commit: keep the
            # conflict for now; the next list call re-checks.
            db.rollback()
            return 0
    return promoted


def require_member(db: DbSession, user_id: uuid.UUID, member_id: uuid.UUID) -> HouseholdMember:
    """Ownership only. There is no lock any more: every member's
    dashboard opens (profile-completion spec)."""
    member = db.query(HouseholdMember).filter_by(id=member_id, user_id=user_id).first()
    if member is None:
        raise HTTPException(status_code=404, detail="Household member not found.")
    return member
