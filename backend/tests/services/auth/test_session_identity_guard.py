"""A session is created only while the identity that was presented still belongs to the account.

Closes the sign-in race around a Head of Family swap: a login that looked up the old identity, then
waited behind the swap's lock, must not create a session once the swap has deleted that identity.
"""
import uuid
from datetime import datetime, timezone

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models.auth import AuthIdentity
from app.models.auth import Session as SessionModel
from app.models.enums import AuthIdentityProvider
from app.models.user import User

NOW = datetime(2026, 11, 2, tzinfo=timezone.utc)


def _db():
    from app.db.base import Base

    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    return sessionmaker(autoflush=False, bind=engine)()


def _account(db, suffix="1"):
    user = User(id=uuid.uuid4(), phone_number=f"+9190000000{suffix}", email=f"a{suffix}@example.com", created_at=NOW)
    db.add(user)
    db.flush()
    identity = AuthIdentity(
        user_id=user.id, provider=AuthIdentityProvider.PHONE_OTP, provider_subject=user.phone_number,
        identifier_verified_at=NOW, created_at=NOW, last_used_at=NOW,
    )
    db.add(identity)
    db.commit()
    return user, identity


def test_no_presented_identity_keeps_todays_behaviour():
    from app.services.auth.session import create_session

    db = _db()
    user, _ = _account(db)
    session, token = create_session(db, user.id, AuthIdentityProvider.PHONE_OTP)
    assert token and db.query(SessionModel).count() == 1 and session.user_id == user.id


def test_session_is_created_while_the_presented_identity_still_belongs_to_the_account():
    from app.services.auth.session import create_session

    db = _db()
    user, identity = _account(db)
    create_session(db, user.id, AuthIdentityProvider.PHONE_OTP, presented_identity_id=identity.id)
    assert db.query(SessionModel).count() == 1


def test_session_is_refused_when_the_presented_identity_was_deleted_by_a_swap():
    from app.services.auth.session import SessionIdentityChangedError, create_session

    db = _db()
    user, identity = _account(db)
    presented = identity.id
    db.delete(identity)
    db.commit()
    with pytest.raises(SessionIdentityChangedError):
        create_session(db, user.id, AuthIdentityProvider.PHONE_OTP, presented_identity_id=presented)
    assert db.query(SessionModel).count() == 0


def test_session_is_refused_when_the_identity_now_belongs_to_another_account():
    from app.services.auth.session import SessionIdentityChangedError, create_session

    db = _db()
    user, identity = _account(db, "1")
    other, _ = _account(db, "2")
    identity.user_id = other.id
    db.commit()
    with pytest.raises(SessionIdentityChangedError):
        create_session(db, user.id, AuthIdentityProvider.PHONE_OTP, presented_identity_id=identity.id)
    assert db.query(SessionModel).count() == 0


def test_route_helper_answers_401_not_a_server_error_when_the_identity_is_gone():
    from app.api.auth import _session_response

    db = _db()
    user, identity = _account(db)
    presented = identity.id
    db.delete(identity)
    db.commit()
    with pytest.raises(HTTPException) as exc:
        _session_response(user.id, AuthIdentityProvider.PHONE_OTP, db, presented_identity_id=presented)
    assert exc.value.status_code == 401
    assert db.query(SessionModel).count() == 0
