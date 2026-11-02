"""Session token creation and current-user resolution — opaque bearer
token, hashed for storage (not JWT). The `sessions` table is the source of
truth, matching Database-Schema-Unifolio.md's session_token_hash design.
"""

from __future__ import annotations

import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session as DbSession

from app.db.session import get_db
from app.models.auth import AuthIdentity
from app.models.auth import Session as SessionModel
from app.models.enums import AuthIdentityProvider
from app.models.user import User

SESSION_TOKEN_BYTES = 32
SESSION_TTL_DAYS = 30


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


class SessionIdentityChangedError(Exception):
    """The identity a sign-in presented no longer belongs to the account (a Head of Family swap
    removed it while the sign-in was in flight)."""


def create_session(
    db: DbSession,
    user_id: uuid.UUID,
    auth_method: AuthIdentityProvider,
    device_info: str | None = None,
    *,
    presented_identity_id: uuid.UUID | None = None,
) -> tuple[SessionModel, str]:
    """Creates and persists a Session. Returns (session, raw_token) — the
    raw token is returned to the caller exactly once and never stored.
    `auth_method` records whichever method's verification directly produced
    this session (e.g. for a phone-gated signup, that's phone_otp, the
    completing method — not the originating Google/email identity).

    `presented_identity_id`: the identity row this sign-in authenticated with. When given, the
    account row is locked first (the same lock the Head of Family swap takes) and the session is
    refused unless that identity still belongs to the account. Without this a sign-in that found
    the old head's identity just before a swap could wait behind the swap's lock and then create
    a session on the account after the old head's identities were deleted."""
    if presented_identity_id is not None:
        # Column-only reads: they always see the committed state once the lock is granted.
        db.query(User.id).filter(User.id == user_id).with_for_update().first()
        still_attached = (
            db.query(AuthIdentity.id)
            .filter(AuthIdentity.id == presented_identity_id, AuthIdentity.user_id == user_id)
            .first()
        )
        if still_attached is None:
            db.rollback()
            raise SessionIdentityChangedError()
    raw_token = secrets.token_urlsafe(SESSION_TOKEN_BYTES)
    now = datetime.now(timezone.utc)
    session = SessionModel(
        user_id=user_id,
        session_token_hash=_hash_token(raw_token),
        auth_method=auth_method,
        created_at=now,
        expires_at=now + timedelta(days=SESSION_TTL_DAYS),
        last_active_at=now,
        device_info=device_info,
    )
    db.add(session)
    db.commit()
    return session, raw_token


def refresh_session(db: DbSession, session: SessionModel) -> SessionModel:
    now = datetime.now(timezone.utc)
    session.last_active_at = now
    session.expires_at = now + timedelta(days=SESSION_TTL_DAYS)
    db.commit()
    return session


def _extract_bearer_token(authorization: str | None) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or malformed Authorization header.")
    return authorization.removeprefix("Bearer ").strip()


def get_current_session(
    authorization: str | None = Header(default=None),
    db: DbSession = Depends(get_db),
) -> SessionModel:
    token = _extract_bearer_token(authorization)
    token_hash = _hash_token(token)
    session = db.query(SessionModel).filter_by(session_token_hash=token_hash).first()
    if not session:
        raise HTTPException(status_code=401, detail="Invalid or expired session.")
    # SQLite (dev/tests) returns naive datetimes even for DateTime(timezone=True);
    # values are always written as UTC, so tag them as such. Postgres returns aware.
    expires_at = session.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Invalid or expired session.")
    return session


def get_current_user(
    session: SessionModel = Depends(get_current_session),
    db: DbSession = Depends(get_db),
) -> User:
    user = db.get(User, session.user_id)
    if not user:
        raise HTTPException(status_code=401, detail="Session references a deleted user.")
    return user


def get_active_user(user: User = Depends(get_current_user)) -> User:
    """Authenticated user dependency for every non-grace-period endpoint."""
    if user.pending_deletion:
        raise HTTPException(
            status_code=403,
            detail="Account is pending deletion. Reactivate it to continue.",
        )
    return user
