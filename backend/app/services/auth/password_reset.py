"""Password reset — single-use, email-delivered link. Same
hash-before-storage pattern as `identity.py`'s pending-verification
tokens (raw `secrets.token_urlsafe(32)`, sha256-hashed for storage, never
stored raw). Design Spec 2026-08-17 §3/§4c.
"""

from __future__ import annotations

import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session as DbSession

from app.models.auth import AuthIdentity, PasswordResetToken
from app.models.enums import AuthIdentityProvider
from app.services.auth.password import hash_password

RESET_TOKEN_BYTES = 32
RESET_TOKEN_TTL_MINUTES = 30


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def create_password_reset_token(db: DbSession, user_id: uuid.UUID) -> tuple[PasswordResetToken, str]:
    raw_token = secrets.token_urlsafe(RESET_TOKEN_BYTES)
    now = datetime.now(timezone.utc)
    token = PasswordResetToken(
        user_id=user_id,
        token_hash=_hash_token(raw_token),
        expires_at=now + timedelta(minutes=RESET_TOKEN_TTL_MINUTES),
        used_at=None,
        created_at=now,
    )
    db.add(token)
    db.commit()
    return token, raw_token


class PasswordResetTokenError(Exception):
    """Any failure consuming a password reset token — not found, expired, or already used."""


def consume_password_reset_token(db: DbSession, raw_token: str, new_password: str) -> None:
    token_hash = _hash_token(raw_token)
    token = db.query(PasswordResetToken).filter_by(token_hash=token_hash).first()
    if token is None:
        raise PasswordResetTokenError("This reset link is invalid or has expired.")
    if token.used_at is not None:
        raise PasswordResetTokenError("This reset link is invalid or has expired.")
    expires_at = token.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        raise PasswordResetTokenError("This reset link is invalid or has expired.")

    identity = (
        db.query(AuthIdentity)
        .filter_by(user_id=token.user_id, provider=AuthIdentityProvider.EMAIL_PASSWORD)
        .first()
    )
    if identity is None:
        # Shouldn't happen (a reset token is only ever created for a user
        # with an EMAIL_PASSWORD identity), but fail loudly rather than
        # silently no-op if the data is ever in an inconsistent state.
        raise PasswordResetTokenError("This reset link is invalid or has expired.")

    identity.password_hash = hash_password(new_password)
    # A successful reset is exactly as strong a proof of mailbox control as
    # the initial confirmation link — completing it also confirms the email
    # if it wasn't already (Design Spec §4c), without overwriting an earlier
    # genuine confirmation timestamp.
    if identity.email_confirmed_at is None:
        identity.email_confirmed_at = datetime.now(timezone.utc)

    token.used_at = datetime.now(timezone.utc)
    db.commit()
