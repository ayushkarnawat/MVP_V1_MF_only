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
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Literal

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.enums import MemberPanSource
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


def is_expired_pending(member: HouseholdMember, now: datetime) -> bool:
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
    if holder is not None and is_expired_pending(holder, now):
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


@dataclass(frozen=True)
class PanSnapshot:
    """A member's PAN claim before switch_pan_claim replaced it. Lives only in
    the RAM review session, so discard / expiry can put it back (F6)."""

    pan_encrypted: str | None
    pan_lookup_hash: str | None
    pan_pending_until: datetime | None
    pan_source: MemberPanSource | None
    pan_verified_at: datetime | None


def switch_pan_claim(
    db: Session,
    member: HouseholdMember,
    new_pan: str,
    *,
    pending: bool = True,
    now: datetime | None = None,
) -> PanSnapshot:
    """U4 / U13 "use the statement's PAN": replaces `member`'s PAN with a
    (pending) claim on `new_pan` and returns what it replaced.

    Unlike claim_pan_for_member this may replace a *permanent* PAN -- the
    user chose to. The holder check runs first and raises before anything
    changes (U12: the member keeps the PAN they had, I15). A member has one
    pan_encrypted/pan_lookup_hash pair, so "claim the new before releasing
    the old" is this single overwrite in one flush; the old PAN is kept in
    the returned snapshot, not in the DB, until Confirm makes the switch
    permanent or discard/expiry restores it (restore_pan_snapshot)."""
    now = now or datetime.now(timezone.utc)
    new_hash = hash_pan(new_pan)
    holder = _holder_of(db, new_hash, now)
    if holder is not None and holder.id != member.id:
        _raise_for_holder(member, holder)
    snapshot = PanSnapshot(
        member.pan_encrypted, member.pan_lookup_hash, member.pan_pending_until,
        member.pan_source, member.pan_verified_at,
    )
    member.pan_encrypted = encrypt_pan(new_pan)
    member.pan_lookup_hash = new_hash
    member.pan_pending_until = now + PENDING_PAN_TTL if pending else None
    try:
        db.flush()
    except IntegrityError:
        # Lost the unique index to a concurrent claim between the holder
        # check and the flush. Full rollback, as in claim_pan_for_member:
        # the resolve request that called this aborts with a 409.
        db.rollback()
        winner = _holder_of(db, new_hash, now)
        if winner is not None and winner.id != member.id:
            _raise_for_holder(member, winner)
        raise
    return snapshot


def restore_pan_snapshot(
    db: Session, member: HouseholdMember, switched_pan: str, snapshot: PanSnapshot
) -> None:
    """Undoes switch_pan_claim when its review session is discarded or
    expires. Only while the member still holds the switched PAN as a pending
    claim: a confirmed (permanent) switch is left alone."""
    if member.pan_pending_until is None or member.pan_lookup_hash != hash_pan(switched_pan):
        return
    if snapshot.pan_lookup_hash is not None:
        other = (
            db.query(HouseholdMember)
            .filter(HouseholdMember.pan_lookup_hash == snapshot.pan_lookup_hash, HouseholdMember.id != member.id)
            .first()
        )
        if other is not None:
            # The old PAN was free in the unique index while the switch was
            # pending and someone claimed it meanwhile. Nothing to restore to.
            logger.warning("Old PAN of household member %s was claimed during review; not restored", member.id)
            _clear_pan(member)
            db.flush()
            return
    member.pan_encrypted = snapshot.pan_encrypted
    member.pan_lookup_hash = snapshot.pan_lookup_hash
    member.pan_pending_until = snapshot.pan_pending_until
    member.pan_source = snapshot.pan_source
    member.pan_verified_at = snapshot.pan_verified_at
    db.flush()


DetectedPanStatus = Literal["new", "existing_member", "locked_member", "other_account"]


def classify_detected_pan(
    db: Session, user_id: uuid.UUID, pan: str, *, now: datetime | None = None
) -> tuple[DetectedPanStatus, uuid.UUID | None]:
    """Where a PAN found in a statement already lives, relative to `user_id`.

    Read-only: deliberately does not reuse `_holder_of`, which clears expired
    claims and flushes. An expired pending claim is simply ignored (= new).
    Order matters (F7, spec M9): this account's own PAN, then this account's
    locked member, and only then another account -- a locked member here must
    keep attaching even after another account later claimed the same PAN.
    The other account's member id is never returned.
    """
    now = now or datetime.now(timezone.utc)
    pan_hash = hash_pan(pan)

    def live_holders() -> list[HouseholdMember]:
        rows = db.query(HouseholdMember).filter(HouseholdMember.pan_lookup_hash == pan_hash).all()
        return [m for m in rows if not is_expired_pending(m, now)]

    holders = live_holders()
    mine = next((m for m in holders if m.user_id == user_id), None)
    if mine is not None:
        return "existing_member", mine.id
    locked = (
        db.query(HouseholdMember)
        .filter(HouseholdMember.user_id == user_id, HouseholdMember.detected_pan_hash == pan_hash)
        .order_by(HouseholdMember.created_at)
        .first()
    )
    if locked is not None:
        return "locked_member", locked.id
    if holders:
        return "other_account", None
    return "new", None
