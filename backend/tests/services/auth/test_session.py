import uuid
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models.auth import Session as SessionModel
from app.models.user import User
from app.services.auth.session import (
    _extract_bearer_token,
    create_session,
    get_current_session,
    get_current_user,
    refresh_session,
)


def _session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine, tables=[User.__table__, SessionModel.__table__])
    return sessionmaker(autoflush=False, bind=engine)()


def _user(db):
    user = User(id=uuid.uuid4(), phone_number="+919999999999", created_at=datetime.now(timezone.utc))
    db.add(user)
    db.commit()
    return user


def test_create_session_hashes_the_stored_token():
    db = _session()
    user = _user(db)

    session, raw_token = create_session(db, user.id)

    assert session.session_token_hash != raw_token
    assert len(raw_token) > 20
    assert session.user_id == user.id


def test_extract_bearer_token_rejects_missing_header():
    with pytest.raises(HTTPException) as exc_info:
        _extract_bearer_token(None)
    assert exc_info.value.status_code == 401


def test_extract_bearer_token_rejects_non_bearer_scheme():
    with pytest.raises(HTTPException) as exc_info:
        _extract_bearer_token("Basic abc123")
    assert exc_info.value.status_code == 401


def test_extract_bearer_token_returns_token():
    assert _extract_bearer_token("Bearer abc123") == "abc123"


def test_get_current_session_resolves_valid_token():
    db = _session()
    user = _user(db)
    _, raw_token = create_session(db, user.id)

    resolved = get_current_session(authorization=f"Bearer {raw_token}", db=db)

    assert resolved.user_id == user.id


def test_get_current_session_rejects_unknown_token():
    db = _session()

    with pytest.raises(HTTPException) as exc_info:
        get_current_session(authorization="Bearer not-a-real-token", db=db)
    assert exc_info.value.status_code == 401


def test_get_current_session_rejects_expired_session():
    db = _session()
    user = _user(db)
    session, raw_token = create_session(db, user.id)
    session.expires_at = datetime.now(timezone.utc) - timedelta(days=1)
    db.commit()

    with pytest.raises(HTTPException) as exc_info:
        get_current_session(authorization=f"Bearer {raw_token}", db=db)
    assert exc_info.value.status_code == 401


def test_refresh_session_extends_expiry():
    db = _session()
    user = _user(db)
    session, _ = create_session(db, user.id)
    original_expiry = session.expires_at

    refreshed = refresh_session(db, session)

    assert refreshed.expires_at > original_expiry


def test_get_current_user_resolves_user_from_session():
    db = _session()
    user = _user(db)
    session, _ = create_session(db, user.id)

    resolved = get_current_user(session=session, db=db)

    assert resolved.id == user.id
