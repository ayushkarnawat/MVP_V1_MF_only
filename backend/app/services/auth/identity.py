"""Identity lookup, denormalized-email refresh, and email-collision
resolution — Design Spec §1/§4. Phone-first verification never calls
resolve_email_collision (phone carries no email claim, so it can't
collide) — see identity_flow.py (Task 6) for where phone stays on its own
simpler path.
"""

from __future__ import annotations

import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Literal, NamedTuple

from sqlalchemy.orm import Session as DbSession

from app.models.auth import AuthIdentity, PendingIdentityVerification
from app.models.enums import AuthIdentityProvider
from app.models.user import User

# Lower value = higher precedence. Design Spec §1: "Identity precedence:
# Google > Email > Phone" — applied wherever only one identity can be
# shown or selected.
PROVIDER_PRECEDENCE: dict[AuthIdentityProvider, int] = {
    AuthIdentityProvider.GOOGLE: 0,
    AuthIdentityProvider.EMAIL_OTP: 1,
    AuthIdentityProvider.PHONE_OTP: 2,
}


def find_identity_by_subject(
    db: DbSession, provider: AuthIdentityProvider, provider_subject: str
) -> AuthIdentity | None:
    return db.query(AuthIdentity).filter_by(provider=provider, provider_subject=provider_subject).first()


def record_identity(
    db: DbSession,
    user_id: uuid.UUID,
    provider: AuthIdentityProvider,
    provider_subject: str,
    email: str | None,
    verified_at: datetime,
) -> AuthIdentity:
    identity = AuthIdentity(
        user_id=user_id,
        provider=provider,
        provider_subject=provider_subject,
        email=email,
        identifier_verified_at=verified_at,
        created_at=verified_at,
        last_used_at=verified_at,
    )
    db.add(identity)
    db.commit()
    return identity


def pick_primary_identity(identities: list[AuthIdentity]) -> AuthIdentity:
    return min(identities, key=lambda i: PROVIDER_PRECEDENCE[i.provider])


def refresh_denormalized_email(db: DbSession, user: User) -> None:
    """Sets user.email from the highest-precedence identity that has one.
    No-op if the account has no email-bearing identity at all."""
    identities = db.query(AuthIdentity).filter_by(user_id=user.id).all()
    with_email = [i for i in identities if i.email]
    if not with_email:
        return
    user.email = pick_primary_identity(with_email).email
    db.commit()


class EmailCollisionResult(NamedTuple):
    kind: Literal["auto_link", "link_required", "none"]
    matched_user_id: uuid.UUID | None


def resolve_email_collision(db: DbSession, email: str) -> EmailCollisionResult:
    """Design Spec §4's three-way collision check, on a new identity's
    verified email:
    1. Matches another verified AuthIdentity's email (any provider, any
       user) -> auto_link.
    2. Matches only a User's denormalized, never-separately-verified
       `email` field -> link_required.
    3. No match -> none.
    """
    verified_match = db.query(AuthIdentity).filter_by(email=email).first()
    if verified_match is not None:
        return EmailCollisionResult(kind="auto_link", matched_user_id=verified_match.user_id)

    denormalized_match = db.query(User).filter_by(email=email).first()
    if denormalized_match is not None:
        return EmailCollisionResult(kind="link_required", matched_user_id=denormalized_match.id)

    return EmailCollisionResult(kind="none", matched_user_id=None)


PENDING_VERIFICATION_TOKEN_BYTES = 32
PENDING_VERIFICATION_TTL_MINUTES = 10


def _hash_pending_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def create_pending_verification(
    db: DbSession,
    provider: AuthIdentityProvider,
    provider_subject: str,
    email: str | None,
    email_verified: bool,
    matched_user_id: uuid.UUID | None,
) -> tuple[PendingIdentityVerification, str]:
    raw_token = secrets.token_urlsafe(PENDING_VERIFICATION_TOKEN_BYTES)
    now = datetime.now(timezone.utc)
    pending = PendingIdentityVerification(
        provider=provider,
        provider_subject=provider_subject,
        email=email,
        email_verified=email_verified,
        matched_user_id=matched_user_id,
        token_hash=_hash_pending_token(raw_token),
        expires_at=now + timedelta(minutes=PENDING_VERIFICATION_TTL_MINUTES),
        created_at=now,
    )
    db.add(pending)
    db.commit()
    return pending, raw_token


class PendingVerificationError(Exception):
    """Any failure consuming a pending_identity_verifications token —
    not found, expired, or used for the wrong completion path."""


def _consume_pending_verification(db: DbSession, raw_token: str) -> PendingIdentityVerification:
    token_hash = _hash_pending_token(raw_token)
    pending = db.query(PendingIdentityVerification).filter_by(token_hash=token_hash).first()
    if not pending:
        raise PendingVerificationError("Invalid or already-used verification token.")
    expires_at = pending.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        raise PendingVerificationError("This verification has expired. Please start over.")
    return pending


def complete_phone_gate_signup(db: DbSession, raw_token: str, phone_number: str) -> uuid.UUID:
    """Only for a brand-new-signup pending record (matched_user_id IS
    NULL) — atomically creates the User plus both identities. Design Spec
    §1's mandatory phone gate."""
    pending = _consume_pending_verification(db, raw_token)
    if pending.matched_user_id is not None:
        raise PendingVerificationError(
            "This verification is for linking to an existing account, not creating a new one."
        )

    now = datetime.now(timezone.utc)
    user = User(phone_number=phone_number, email=pending.email, created_at=now)
    db.add(user)
    db.flush()
    record_identity(db, user.id, AuthIdentityProvider.PHONE_OTP, phone_number, None, now)
    record_identity(db, user.id, pending.provider, pending.provider_subject, pending.email, now)
    db.delete(pending)
    db.commit()
    return user.id


def attach_pending_identity(db: DbSession, raw_token: str, resolved_user_id: uuid.UUID) -> uuid.UUID:
    """After ANY re-auth method (phone/email/Google) resolves to
    resolved_user_id, attaches the pending record's identity to that
    user. Requires matched_user_id to already equal resolved_user_id —
    guards against a pending token being replayed against the wrong
    account."""
    pending = _consume_pending_verification(db, raw_token)
    if pending.matched_user_id is None or pending.matched_user_id != resolved_user_id:
        raise PendingVerificationError("This verification token doesn't match the account you're linking to.")

    now = datetime.now(timezone.utc)
    record_identity(db, resolved_user_id, pending.provider, pending.provider_subject, pending.email, now)
    user = db.get(User, resolved_user_id)
    refresh_denormalized_email(db, user)
    db.delete(pending)
    db.commit()
    return resolved_user_id
