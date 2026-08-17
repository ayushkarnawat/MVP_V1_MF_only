"""Email confirmation for EMAIL_PASSWORD identities — decoupled from
signup so the phone gate completes with zero added friction (Design Spec
2026-08-17 §4c). Same single-use, hash-before-storage token pattern as
`password_reset.py`.
"""

from __future__ import annotations

import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session as DbSession

from app.models.auth import AuthIdentity, EmailConfirmationToken
from app.models.enums import AuthIdentityProvider
from app.services.auth.email_provider import get_email_provider

CONFIRMATION_TOKEN_BYTES = 32
CONFIRMATION_TOKEN_TTL_MINUTES = 30


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def create_email_confirmation_token(db: DbSession, user_id: uuid.UUID) -> tuple[EmailConfirmationToken, str]:
    raw_token = secrets.token_urlsafe(CONFIRMATION_TOKEN_BYTES)
    now = datetime.now(timezone.utc)
    token = EmailConfirmationToken(
        user_id=user_id,
        token_hash=_hash_token(raw_token),
        expires_at=now + timedelta(minutes=CONFIRMATION_TOKEN_TTL_MINUTES),
        used_at=None,
        created_at=now,
    )
    db.add(token)
    db.commit()
    return token, raw_token


class EmailConfirmationTokenError(Exception):
    """Any failure consuming an email confirmation token — not found, expired, or already used."""


def consume_email_confirmation_token(db: DbSession, raw_token: str) -> None:
    token_hash = _hash_token(raw_token)
    token = db.query(EmailConfirmationToken).filter_by(token_hash=token_hash).first()
    if token is None or token.used_at is not None:
        raise EmailConfirmationTokenError("This confirmation link is invalid or has expired.")
    expires_at = token.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        raise EmailConfirmationTokenError("This confirmation link is invalid or has expired.")

    identity = (
        db.query(AuthIdentity)
        .filter_by(user_id=token.user_id, provider=AuthIdentityProvider.EMAIL_PASSWORD)
        .first()
    )
    if identity is None:
        raise EmailConfirmationTokenError("This confirmation link is invalid or has expired.")

    if identity.email_confirmed_at is None:
        identity.email_confirmed_at = datetime.now(timezone.utc)
    token.used_at = datetime.now(timezone.utc)
    db.commit()


def send_confirmation_email(db: DbSession, user_id: uuid.UUID, email: str) -> None:
    """Generates a token and sends it — the single call site both
    `complete_phone_gate_signup` and `attach_pending_identity` use once
    they've created an EMAIL_PASSWORD identity, so the send always happens
    exactly once per signup regardless of which phone-gate path fired."""
    _, raw_token = create_email_confirmation_token(db, user_id)
    confirm_link = f"https://app.unifolio.in/confirm-email?token={raw_token}"
    get_email_provider().send_email(
        to=email,
        subject="Confirm your Unifolio email",
        body=f"Click this link to enable password sign-in: {confirm_link}. It expires in 30 minutes.",
    )
