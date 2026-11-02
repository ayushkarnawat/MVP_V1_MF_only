from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone
from typing import Literal, TypeAlias

from sqlalchemy.orm import Session as DbSession

from app.models.auth import AuthIdentity, HeadChangeRequest
from app.models.enums import Relationship
from app.models.imports import Import
from app.models.user import HouseholdMember, User
from app.services.dashboard.member_details import MemberNotFoundError
from app.services.import_.state_machine import TERMINAL_STATES


EligibilityReason: TypeAlias = Literal[
    "no_email",
    "no_phone",
    "same_email_as_head",
    "same_phone_as_head",
    "email_in_use",
    "phone_in_use",
    "pan_registered_elsewhere",
    "no_pan",
    "label_missing",
    "account_pending_deletion",
    "import_in_progress",
    "head_change_already_open",
]


def member_eligibility(
    db: DbSession, user: User, member_id: uuid.UUID
) -> list[EligibilityReason]:
    """Return every reason a household member cannot become head.

    The ownership lookup deliberately combines the member id and account id,
    and treats the current head the same as a miss. Callers therefore cannot
    use this check to discover a member belonging to another account.
    """
    member = (
        db.query(HouseholdMember)
        .filter(
            HouseholdMember.id == member_id,
            HouseholdMember.user_id == user.id,
        )
        .first()
    )
    if member is None or member.is_head:
        raise MemberNotFoundError()

    reasons: list[EligibilityReason] = []
    email = _email_key(member.email)
    phone = _phone_key(member.phone_number)
    own_identities = (
        db.query(AuthIdentity.provider_subject, AuthIdentity.email)
        .filter(AuthIdentity.user_id == user.id)
        .all()
    )

    if email is None:
        reasons.append("no_email")
    if phone is None:
        reasons.append("no_phone")
    if email is not None and (
        email == _email_key(user.email)
        or any(
            email in {_email_key(row.provider_subject), _email_key(row.email)}
            for row in own_identities
        )
    ):
        reasons.append("same_email_as_head")
    if phone is not None and (
        phone == _phone_key(user.phone_number)
        or any(
            phone in {_phone_key(row.provider_subject), _phone_key(row.email)}
            for row in own_identities
        )
    ):
        reasons.append("same_phone_as_head")

    other_users = (
        db.query(User.email, User.phone_number)
        .filter(User.id != user.id)
        .all()
    )
    other_identities = (
        db.query(AuthIdentity.provider_subject, AuthIdentity.email)
        .filter(AuthIdentity.user_id != user.id)
        .all()
    )
    if email is not None and (
        any(email == _email_key(row.email) for row in other_users)
        or any(
            email in {_email_key(row.provider_subject), _email_key(row.email)}
            for row in other_identities
        )
    ):
        reasons.append("email_in_use")
    if phone is not None and (
        any(phone == _phone_key(row.phone_number) for row in other_users)
        or any(
            phone in {_phone_key(row.provider_subject), _phone_key(row.email)}
            for row in other_identities
        )
    ):
        reasons.append("phone_in_use")

    if _pan_is_registered_elsewhere(db, user.id, member):
        reasons.append("pan_registered_elsewhere")
    if member.pan_lookup_hash is None and member.detected_pan_hash is None:
        reasons.append("no_pan")
    # "Other" (with or without free text) is as unusable as no label: the old head's new label is
    # worked out from the new head's label and the table has no answer for "other" (head_labels,
    # OLD_HEAD_LABEL_TABLE). The briefing says the dialog asks for a real label first; without
    # this the member passed every check here and then failed at the final step after all four
    # codes were used.
    if member.relationship is None or member.relationship == Relationship.OTHER:
        reasons.append("label_missing")
    if bool(user.pending_deletion) or user.deletion_scheduled_at is not None:
        reasons.append("account_pending_deletion")
    if _has_open_import_or_pan_claim(db, user.id):
        reasons.append("import_in_progress")
    if (
        db.query(HeadChangeRequest.id)
        .filter(
            HeadChangeRequest.user_id == user.id,
            HeadChangeRequest.status == "pending",
        )
        .first()
        is not None
    ):
        reasons.append("head_change_already_open")
    return reasons


def _email_key(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip().casefold()
    return normalized or None


def _phone_key(value: str | None) -> str | None:
    if value is None:
        return None
    raw = value.strip()
    if not raw:
        return None
    digits = re.sub(r"[\s\-()]", "", raw)
    if digits.startswith("+91"):
        digits = digits[3:]
    elif digits.startswith("91") and len(digits) == 12:
        digits = digits[2:]
    elif digits.startswith("0") and len(digits) == 11:
        digits = digits[1:]
    if len(digits) == 10 and digits[0] in "6789" and digits.isdigit():
        return f"+91{digits}"
    return raw


def _as_aware(value: datetime | None) -> datetime | None:
    if value is None or value.tzinfo is not None:
        return value
    return value.replace(tzinfo=timezone.utc)


def _pan_is_registered_elsewhere(
    db: DbSession, user_id: uuid.UUID, member: HouseholdMember
) -> bool:
    if member.pan_conflict is not None:
        return True
    pan_hash = member.detected_pan_hash
    if pan_hash is None:
        return False
    now = datetime.now(timezone.utc)
    holders = (
        db.query(HouseholdMember)
        .filter(
            HouseholdMember.pan_lookup_hash == pan_hash,
            HouseholdMember.user_id != user_id,
        )
        .all()
    )
    return any(
        (until := _as_aware(holder.pan_pending_until)) is None or until > now
        for holder in holders
    )


def _has_open_import_or_pan_claim(db: DbSession, user_id: uuid.UUID) -> bool:
    open_import = (
        db.query(Import.id)
        .join(
            HouseholdMember,
            HouseholdMember.id == Import.household_member_id,
        )
        .filter(
            HouseholdMember.user_id == user_id,
            Import.status.notin_(tuple(TERMINAL_STATES)),
        )
        .first()
    )
    if open_import is not None:
        return True

    now = datetime.now(timezone.utc)
    members = (
        db.query(HouseholdMember)
        .filter(HouseholdMember.user_id == user_id)
        .all()
    )
    return any(
        (until := _as_aware(member.pan_pending_until)) is not None and until > now
        for member in members
    )
