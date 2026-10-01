"""Errors and PAN helpers shared by the member profile, merge and read routes,
plus refresh_pan_conflicts and require_member."""

from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session as DbSession

from app.models.enums import MemberPanSource
from app.models.user import HouseholdMember
from app.services.import_.pan_claims import _clear_pan, is_expired_pending

_PAN_RE = re.compile(r"^[A-Z]{5}[0-9]{4}[A-Z]$")

INVALID_PAN_MESSAGE = "Enter a valid PAN: 5 letters, 4 digits, then 1 letter."


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
    """Profile Save sent a field this member can't change there: a statement
    PAN, or Self's phone/email (those live on users, edited in Account Info)."""

    status_code = 422
    code = "field_not_editable"


class PanRequiredError(MemberDetailsError):
    status_code = 422
    code = "pan_required"


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


def _holder(db: DbSession, pan_hash: str, exclude_id: uuid.UUID, now: datetime) -> HouseholdMember | None:
    """The live member (other than exclude_id) holding pan_hash in the
    unique PAN column, in any account. Read-only: an expired pending claim
    is skipped but not cleared, so a validation read has no side effects."""
    rows = (
        db.query(HouseholdMember)
        .filter(HouseholdMember.pan_lookup_hash == pan_hash, HouseholdMember.id != exclude_id)
        .all()
    )
    live = [r for r in rows if not is_expired_pending(r, now)]
    return live[0] if live else None


def is_name_only(member: HouseholdMember) -> bool:
    """F34 provenance: no PAN from a statement (none at all, or one the user
    typed). Such a person can be merged into another member (M11)."""
    return member.pan_source != MemberPanSource.CAS


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
    # Two of a user's conflict rows can share one hash (0023 backfill
    # duplicates, or a typed PAN). Only the first is promoted; the other
    # stays a conflict for merge_member_into. Sessions are autoflush=False,
    # so this is tracked explicitly rather than left to the holder query
    # (final review I-1: both rows once claimed the hash in memory).
    claimed: set[str] = set()
    for m in rows:
        pan_hash = m.detected_pan_hash
        if pan_hash is None or pan_hash in claimed:
            continue
        held = db.query(HouseholdMember).filter(HouseholdMember.pan_lookup_hash == pan_hash).all()
        if any(not is_expired_pending(h, now) for h in held):
            continue
        try:
            # One commit per row, not one SAVEPOINT: pysqlite emits no BEGIN
            # before SAVEPOINT, so its RELEASE would commit anyway on SQLite.
            # A lost race (at the flush or the commit) rolls back only this
            # row, so it neither 500s GET /household-members nor blocks the
            # user's other rows.
            for stale in held:  # an expired pending claim still occupies the index
                _clear_pan(stale)
                # _clear_pan leaves these; with no PAN left they would
                # misreport the row as having a statement / verified PAN.
                stale.pan_source = None
                stale.pan_verified_at = None
            if held:
                # The unit of work orders UPDATEs by primary key, so without
                # this flush the claim below can run before the stale row
                # lets go of the hash and hit the unique index.
                db.flush()
            m.pan_encrypted, m.pan_lookup_hash = m.detected_pan_encrypted, pan_hash
            m.pan_pending_until = None
            m.pan_verified_at = now if m.pan_source == MemberPanSource.CAS else None
            m.detected_pan_encrypted = m.detected_pan_hash = None
            m.pan_conflict = None
            db.commit()
        except IntegrityError:
            # Someone took the PAN after the read: keep the conflict for now;
            # the next list call re-checks.
            db.rollback()
            continue
        claimed.add(pan_hash)
        promoted += 1
    return promoted


def require_member(db: DbSession, user_id: uuid.UUID, member_id: uuid.UUID) -> HouseholdMember:
    """Ownership only. There is no lock any more: every member's
    dashboard opens (profile-completion spec)."""
    member = db.query(HouseholdMember).filter_by(id=member_id, user_id=user_id).first()
    if member is None:
        raise HTTPException(status_code=404, detail="Household member not found.")
    return member
