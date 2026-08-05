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
from app.models.auth import Session as SessionModel
from app.models.user import User

SESSION_TOKEN_BYTES = 32
SESSION_TTL_DAYS = 30


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def create_session(
    db: DbSession, user_id: uuid.UUID, device_info: str | None = None
) -> tuple[SessionModel, str]:
    """Creates and persists a Session. Returns (session, raw_token) — the
    raw token is returned to the caller exactly once and never stored."""
    raw_token = secrets.token_urlsafe(SESSION_TOKEN_BYTES)
    now = datetime.now(timezone.utc)
    session = SessionModel(
        user_id=user_id,
        session_token_hash=_hash_token(raw_token),
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
