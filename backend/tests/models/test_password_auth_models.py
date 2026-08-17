import uuid
from datetime import datetime, timedelta, timezone

from app.models.auth import AuthIdentity, EmailConfirmationToken, PasswordResetToken, PendingIdentityVerification
from app.models.enums import AuthIdentityProvider
from app.models.user import User


def _now():
    return datetime.now(timezone.utc)


def test_auth_identity_supports_email_password_provider(db_session):
    user = User(phone_number="+919999999999", created_at=_now())
    db_session.add(user)
    db_session.flush()

    identity = AuthIdentity(
        user_id=user.id,
        provider=AuthIdentityProvider.EMAIL_PASSWORD,
        provider_subject="a@example.com",
        email=None,
        password_hash="hashed-value",
        email_confirmed_at=None,
        identifier_verified_at=_now(),
        created_at=_now(),
        last_used_at=_now(),
    )
    db_session.add(identity)
    db_session.commit()

    fetched = db_session.query(AuthIdentity).filter_by(provider_subject="a@example.com").one()
    assert fetched.provider == AuthIdentityProvider.EMAIL_PASSWORD
    assert fetched.password_hash == "hashed-value"
    assert fetched.email_confirmed_at is None


def test_pending_identity_verification_supports_password_hash(db_session):
    pending = PendingIdentityVerification(
        provider=AuthIdentityProvider.EMAIL_PASSWORD,
        provider_subject="a@example.com",
        email="a@example.com",
        email_verified=False,
        password_hash="hashed-value",
        matched_user_id=None,
        token_hash="tokhash",
        expires_at=_now() + timedelta(minutes=10),
        created_at=_now(),
    )
    db_session.add(pending)
    db_session.commit()

    fetched = db_session.query(PendingIdentityVerification).filter_by(token_hash="tokhash").one()
    assert fetched.password_hash == "hashed-value"


def test_password_reset_token_round_trip(db_session):
    user = User(phone_number="+919999999998", created_at=_now())
    db_session.add(user)
    db_session.flush()

    token = PasswordResetToken(
        user_id=user.id,
        token_hash="resethash",
        expires_at=_now() + timedelta(minutes=30),
        used_at=None,
        created_at=_now(),
    )
    db_session.add(token)
    db_session.commit()

    fetched = db_session.query(PasswordResetToken).filter_by(token_hash="resethash").one()
    assert fetched.user_id == user.id
    assert fetched.used_at is None


def test_email_confirmation_token_round_trip(db_session):
    user = User(phone_number="+919999999997", created_at=_now())
    db_session.add(user)
    db_session.flush()

    token = EmailConfirmationToken(
        user_id=user.id,
        token_hash="confirmhash",
        expires_at=_now() + timedelta(minutes=30),
        used_at=None,
        created_at=_now(),
    )
    db_session.add(token)
    db_session.commit()

    fetched = db_session.query(EmailConfirmationToken).filter_by(token_hash="confirmhash").one()
    assert fetched.user_id == user.id
