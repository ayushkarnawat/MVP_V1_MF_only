from datetime import datetime, timedelta, timezone

import pytest

from app.models.auth import AuthIdentity, PasswordResetToken
from app.models.enums import AuthIdentityProvider
from app.models.user import User
from app.services.auth.password import verify_password
from app.services.auth.password_reset import (
    PasswordResetTokenError,
    consume_password_reset_token,
    create_password_reset_token,
)


def _make_user_with_identity(db_session, email="reset@example.com"):
    now = datetime.now(timezone.utc)
    user = User(phone_number="+919666666666", created_at=now)
    db_session.add(user)
    db_session.flush()
    identity = AuthIdentity(
        user_id=user.id,
        provider=AuthIdentityProvider.EMAIL_PASSWORD,
        provider_subject=email,
        email=None,
        password_hash="old-hash",
        email_confirmed_at=None,
        identifier_verified_at=now,
        created_at=now,
        last_used_at=now,
    )
    db_session.add(identity)
    db_session.commit()
    return user, identity


def test_create_password_reset_token_persists_a_hashed_token(db_session):
    user, _ = _make_user_with_identity(db_session)

    token, raw_token = create_password_reset_token(db_session, user.id)

    assert token.token_hash != raw_token
    assert token.used_at is None


def test_consume_password_reset_token_updates_the_hash_and_confirms_the_email(db_session):
    user, identity = _make_user_with_identity(db_session)
    _, raw_token = create_password_reset_token(db_session, user.id)

    consume_password_reset_token(db_session, raw_token, "brand-new-password")

    db_session.refresh(identity)
    assert verify_password("brand-new-password", identity.password_hash)
    assert identity.email_confirmed_at is not None


def test_consume_password_reset_token_marks_the_token_used(db_session):
    user, _ = _make_user_with_identity(db_session)
    token, raw_token = create_password_reset_token(db_session, user.id)

    consume_password_reset_token(db_session, raw_token, "brand-new-password")

    db_session.refresh(token)
    assert token.used_at is not None


def test_consume_password_reset_token_rejects_a_reused_token(db_session):
    user, _ = _make_user_with_identity(db_session)
    _, raw_token = create_password_reset_token(db_session, user.id)
    consume_password_reset_token(db_session, raw_token, "first-new-password")

    with pytest.raises(PasswordResetTokenError):
        consume_password_reset_token(db_session, raw_token, "second-new-password")


def test_consume_password_reset_token_rejects_an_expired_token(db_session):
    user, _ = _make_user_with_identity(db_session)
    token, raw_token = create_password_reset_token(db_session, user.id)
    token.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
    db_session.commit()

    with pytest.raises(PasswordResetTokenError):
        consume_password_reset_token(db_session, raw_token, "brand-new-password")


def test_consume_password_reset_token_rejects_an_unknown_token(db_session):
    with pytest.raises(PasswordResetTokenError):
        consume_password_reset_token(db_session, "not-a-real-token", "brand-new-password")


def test_consume_password_reset_token_does_not_overwrite_an_existing_confirmation_timestamp(db_session):
    # If the email was already confirmed before the reset, the original
    # confirmation timestamp should be preserved, not bumped forward.
    user, identity = _make_user_with_identity(db_session)
    original_confirmed_at = datetime(2026, 1, 1, tzinfo=timezone.utc)
    identity.email_confirmed_at = original_confirmed_at
    db_session.commit()
    _, raw_token = create_password_reset_token(db_session, user.id)

    consume_password_reset_token(db_session, raw_token, "brand-new-password")

    db_session.refresh(identity)
    assert identity.email_confirmed_at.replace(tzinfo=timezone.utc) == original_confirmed_at
