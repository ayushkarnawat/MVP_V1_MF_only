"""Upload-time PAN claims: the one rule that ties a CAS to a household member.

Replaces the confirm-time attribution engine (attribution.py, removed
2026-09-24). A PAN is claimed for the member the file was uploaded for at
parse time -- *pending* on the two-step /imports/parse -> /imports/confirm
path, *permanent* on the one-step /cas-imports path. Confirm only ever
finalizes a claim; it never prompts or blocks. See
Docs/superpowers/specs/2026-09-24-pan-at-upload-attribution-design.md.

Storage is unchanged from ADR-004 (reopened): pan_encrypted + pan_lookup_hash
under the unique index. A pending claim occupies that index like a permanent
one, so no one else can take a PAN while its review session is open.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.user import HouseholdMember
from app.services.import_.crypto import encrypt_pan, hash_pan

logger = logging.getLogger(__name__)

# Must outlive the preview session that created the claim
# (service.SESSION_TTL_MINUTES = 60): while a session can still be confirmed,
# its pending PAN can never have expired and been taken by someone else.
PENDING_PAN_TTL = timedelta(minutes=65)

CROSS_ACCOUNT_PAN_BLOCKED_MESSAGE = (
    "This PAN is already tracked under a different Unifolio account. "
    "Contact support if you believe this is a mistake."
)


class PanConflictError(Exception):
    """Base for every upload-time PAN conflict. `code` is the 409 detail code."""

    code = "pan_conflict"

    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


class CrossAccountPanBlockedError(PanConflictError):
    code = "cross_account_pan_blocked"


class PanBelongsToOtherMemberError(PanConflictError):
    code = "pan_belongs_to_other_member"


class PanMismatchForMemberError(PanConflictError):
    code = "pan_mismatch_for_member"


def _as_aware(value: datetime | None) -> datetime | None:
    # SQLite hands DateTime(timezone=True) back naive; values are always
    # written as UTC, so tagging them UTC is exact.
    if value is None or value.tzinfo is not None:
        return value
    return value.replace(tzinfo=timezone.utc)


def _is_expired_pending(member: HouseholdMember, now: datetime) -> bool:
    until = _as_aware(member.pan_pending_until)
    return until is not None and until <= now


def _clear_pan(member: HouseholdMember) -> None:
    member.pan_encrypted = None
    member.pan_lookup_hash = None
    member.pan_pending_until = None


def _holder_of(db: Session, pan_hash: str, now: datetime) -> HouseholdMember | None:
    """The member currently holding this PAN, or None. An expired pending
    claim is cleared here (lazily -- there is no sweep job) and reported as
    no holder."""
    holder = db.query(HouseholdMember).filter(HouseholdMember.pan_lookup_hash == pan_hash).first()
    if holder is not None and _is_expired_pending(holder, now):
        _clear_pan(holder)
        db.flush()
        return None
    return holder


def _raise_for_holder(member: HouseholdMember, holder: HouseholdMember) -> None:
    if holder.user_id != member.user_id:
        raise CrossAccountPanBlockedError(CROSS_ACCOUNT_PAN_BLOCKED_MESSAGE)
    raise PanBelongsToOtherMemberError(
        f"The statement you uploaded for {member.name} belongs to a PAN that's already "
        f"in Unifolio. Please choose {member.name}'s own CAS."
    )


def claim_pan_for_member(
    db: Session,
    member: HouseholdMember,
    pan: str | None,
    *,
    pending: bool,
    now: datetime | None = None,
    _retried: bool = False,
) -> str | None:
    """Claims `pan` for `member` or raises a PanConflictError. Flushes, never
    commits: the caller commits with the rest of its unit of work, so a later
    failure in the same request rolls the claim back too."""
    if not pan:
        return None
    now = now or datetime.now(timezone.utc)
    pan_hash = hash_pan(pan)

    holder = _holder_of(db, pan_hash, now)
    if holder is not None and holder.id != member.id:
        _raise_for_holder(member, holder)

    if holder is not None:
        # Already this member's PAN. Never downgrade a permanent claim.
        if not pending:
            member.pan_pending_until = None
        elif member.pan_pending_until is not None:
            member.pan_pending_until = now + PENDING_PAN_TTL
        db.flush()
        return pan_hash

    if member.pan_lookup_hash is not None and member.pan_pending_until is None:
        raise PanMismatchForMemberError(
            f"This statement's PAN doesn't match {member.name}'s. "
            f"Please choose {member.name}'s own CAS."
        )

    # No holder: either a fresh member, or this member's own pending claim
    # for a different PAN (an abandoned earlier upload), which is replaced.
    member.pan_encrypted = encrypt_pan(pan)
    member.pan_lookup_hash = pan_hash
    member.pan_pending_until = now + PENDING_PAN_TTL if pending else None
    try:
        db.flush()
    except IntegrityError:
        # Lost a race for the unique index between _holder_of and flush.
        # Full rollback (not a savepoint -- pysqlite savepoints are
        # unreliable): every caller aborts its request with a 409 on this
        # path, and claims run before any other write in that request.
        db.rollback()
        winner = _holder_of(db, pan_hash, now)
        if winner is not None and winner.id != member.id:
            _raise_for_holder(member, winner)
        # The winner already let go (released or expired): the index is free
        # again, so retry once rather than surface a raw 500.
        if _retried:
            raise
        return claim_pan_for_member(db, member, pan, pending=pending, now=now, _retried=True)
    return pan_hash


def confirm_pan_claim(db: Session, member: HouseholdMember, pan: str | None) -> None:
    """Makes the upload-time claim permanent. Never raises: Confirm Import
    must not be blocked by PAN (spec Goal 3). Call before any other write in
    the confirm transaction -- the fallback claim may roll back."""
    if not pan:
        return
    if member.pan_lookup_hash == hash_pan(pan):
        member.pan_pending_until = None
        return
    # The pending claim vanished (e.g. a sibling session for the same member
    # was discarded). Re-claim permanently; if someone else holds it now,
    # import without storing the PAN rather than failing the confirm.
    try:
        claim_pan_for_member(db, member, pan, pending=False)
    except (PanConflictError, IntegrityError):
        logger.warning(
            "PAN claim for household member %s lost before confirm; importing without storing PAN",
            member.id,
        )


def release_pending_pan_claim(member: HouseholdMember, pan: str | None) -> None:
    """Drops this member's *pending* claim for `pan`. A permanent PAN, or a
    pending claim for a different PAN, is left alone."""
    if not pan or member.pan_pending_until is None:
        return
    if member.pan_lookup_hash == hash_pan(pan):
        _clear_pan(member)
