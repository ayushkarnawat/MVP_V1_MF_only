from datetime import datetime, timedelta, timezone

import pytest

from app.models.auth import AuthIdentity
from app.models.enums import AuthIdentityProvider
from app.models.user import User
from app.services.auth.email_confirmation import (
    EmailConfirmationTokenError,
    consume_email_confirmation_token,
    create_email_confirmation_token,
    send_confirmation_email,
)


def _make_user_with_identity(db_session, email="confirm@example.com"):
    now = datetime.now(timezone.utc)
    user = User(phone_number="+919888888881", created_at=now)
    db_session.add(user)
    db_session.flush()
    identity = AuthIdentity(
        user_id=user.id,
        provider=AuthIdentityProvider.EMAIL_PASSWORD,
        provider_subject=email,
        email=None,
        password_hash="hashed",
        email_confirmed_at=None,
        identifier_verified_at=now,
        created_at=now,
        last_used_at=now,
    )
    db_session.add(identity)
    db_session.commit()
    return user, identity


def test_create_email_confirmation_token_persists_a_hashed_token(db_session):
    user, _ = _make_user_with_identity(db_session)

    token, raw_token = create_email_confirmation_token(db_session, user.id)

    assert token.token_hash != raw_token
    assert token.used_at is None


def test_consume_email_confirmation_token_sets_email_confirmed_at(db_session):
    user, identity = _make_user_with_identity(db_session)
    _, raw_token = create_email_confirmation_token(db_session, user.id)

    consume_email_confirmation_token(db_session, raw_token)

    db_session.refresh(identity)
    assert identity.email_confirmed_at is not None


def test_consume_email_confirmation_token_marks_the_token_used(db_session):
    user, _ = _make_user_with_identity(db_session)
    token, raw_token = create_email_confirmation_token(db_session, user.id)

    consume_email_confirmation_token(db_session, raw_token)

    db_session.refresh(token)
    assert token.used_at is not None


def test_consume_email_confirmation_token_rejects_a_reused_token(db_session):
    user, _ = _make_user_with_identity(db_session)
    _, raw_token = create_email_confirmation_token(db_session, user.id)
    consume_email_confirmation_token(db_session, raw_token)

    with pytest.raises(EmailConfirmationTokenError):
        consume_email_confirmation_token(db_session, raw_token)


def test_consume_email_confirmation_token_rejects_an_expired_token(db_session):
    user, _ = _make_user_with_identity(db_session)
    token, raw_token = create_email_confirmation_token(db_session, user.id)
    token.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
    db_session.commit()

    with pytest.raises(EmailConfirmationTokenError):
        consume_email_confirmation_token(db_session, raw_token)


def test_consume_email_confirmation_token_rejects_an_unknown_token(db_session):
    with pytest.raises(EmailConfirmationTokenError):
        consume_email_confirmation_token(db_session, "not-a-real-token")


def test_send_confirmation_email_logs_via_the_stub_provider(db_session, caplog):
    user, _ = _make_user_with_identity(db_session)

    with caplog.at_level("INFO"):
        send_confirmation_email(db_session, user.id, "confirm@example.com")

    assert any("StubEmailProvider" in record.message for record in caplog.records)
