import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import create_engine
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models.auth import AuthIdentity, OtpRequest, PendingIdentityVerification, Session as SessionModel
from app.models.enums import AuthIdentityProvider
from app.models.user import User


def _session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(
        engine,
        tables=[
            User.__table__,
            AuthIdentity.__table__,
            PendingIdentityVerification.__table__,
            OtpRequest.__table__,
            SessionModel.__table__,
        ],
    )
    return sessionmaker(autoflush=False, bind=engine)()


def _user(db) -> User:
    user = User(id=uuid.uuid4(), phone_number="+919999999999", created_at=datetime.now(timezone.utc))
    db.add(user)
    db.commit()
    return user


def test_auth_identity_round_trip():
    db = _session()
    user = _user(db)
    now = datetime.now(timezone.utc)

    identity = AuthIdentity(
        user_id=user.id,
        provider=AuthIdentityProvider.GOOGLE,
        provider_subject="google-sub-123",
        email="a@example.com",
        identifier_verified_at=now,
        created_at=now,
        last_used_at=now,
    )
    db.add(identity)
    db.commit()

    fetched = db.query(AuthIdentity).filter_by(provider_subject="google-sub-123").one()
    assert fetched.user_id == user.id
    assert fetched.provider == AuthIdentityProvider.GOOGLE


def test_auth_identity_rejects_duplicate_provider_subject():
    db = _session()
    user_a = _user(db)
    now = datetime.now(timezone.utc)
    db.add(
        AuthIdentity(
            user_id=user_a.id, provider=AuthIdentityProvider.GOOGLE,
            provider_subject="dup-sub", email=None,
            identifier_verified_at=now, created_at=now, last_used_at=now,
        )
    )
    db.commit()

    user_b = User(id=uuid.uuid4(), phone_number="+919888888888", created_at=now)
    db.add(user_b)
    db.commit()
    db.add(
        AuthIdentity(
            user_id=user_b.id, provider=AuthIdentityProvider.GOOGLE,
            provider_subject="dup-sub", email=None,
            identifier_verified_at=now, created_at=now, last_used_at=now,
        )
    )
    with pytest.raises(IntegrityError):
        db.commit()


def test_pending_identity_verification_round_trip():
    db = _session()
    now = datetime.now(timezone.utc)
    pending = PendingIdentityVerification(
        provider=AuthIdentityProvider.EMAIL_OTP,
        provider_subject="new@example.com",
        email="new@example.com",
        email_verified=True,
        matched_user_id=None,
        token_hash="deadbeef",
        expires_at=now + timedelta(minutes=10),
        created_at=now,
    )
    db.add(pending)
    db.commit()

    fetched = db.query(PendingIdentityVerification).filter_by(token_hash="deadbeef").one()
    assert fetched.matched_user_id is None
    assert fetched.email_verified is True


def test_otp_request_round_trip():
    db = _session()
    now = datetime.now(timezone.utc)
    db.add(OtpRequest(phone_number="+919999999999", otp_hash="x", expires_at=now, created_at=now))
    db.commit()

    fetched = db.query(OtpRequest).filter_by(phone_number="+919999999999").one()
    assert fetched.phone_number == "+919999999999"
