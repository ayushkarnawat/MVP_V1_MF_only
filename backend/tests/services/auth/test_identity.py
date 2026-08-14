import uuid
from datetime import datetime, timezone

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models.auth import AuthIdentity, PendingIdentityVerification
from app.models.enums import AuthIdentityProvider
from app.models.user import User
from app.services.auth.identity import (
    find_identity_by_subject,
    pick_primary_identity,
    record_identity,
    refresh_denormalized_email,
    resolve_email_collision,
)


def _session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(
        engine, tables=[User.__table__, AuthIdentity.__table__, PendingIdentityVerification.__table__]
    )
    return sessionmaker(autoflush=False, bind=engine)()


def _user(db, phone="+919999999999") -> User:
    user = User(id=uuid.uuid4(), phone_number=phone, created_at=datetime.now(timezone.utc))
    db.add(user)
    db.commit()
    return user


def test_find_identity_by_subject_returns_none_when_absent():
    db = _session()
    assert find_identity_by_subject(db, AuthIdentityProvider.GOOGLE, "no-such-sub") is None


def test_record_identity_creates_and_is_findable():
    db = _session()
    user = _user(db)
    now = datetime.now(timezone.utc)

    record_identity(db, user.id, AuthIdentityProvider.GOOGLE, "sub-1", "a@example.com", now)

    found = find_identity_by_subject(db, AuthIdentityProvider.GOOGLE, "sub-1")
    assert found is not None
    assert found.user_id == user.id
    assert found.email == "a@example.com"


def test_pick_primary_identity_prefers_google_over_email_over_phone():
    now = datetime.now(timezone.utc)
    phone = AuthIdentity(user_id=uuid.uuid4(), provider=AuthIdentityProvider.PHONE_OTP, provider_subject="p", identifier_verified_at=now, created_at=now, last_used_at=now)
    email = AuthIdentity(user_id=uuid.uuid4(), provider=AuthIdentityProvider.EMAIL_OTP, provider_subject="e", identifier_verified_at=now, created_at=now, last_used_at=now)
    google = AuthIdentity(user_id=uuid.uuid4(), provider=AuthIdentityProvider.GOOGLE, provider_subject="g", identifier_verified_at=now, created_at=now, last_used_at=now)

    assert pick_primary_identity([phone, email, google]) is google
    assert pick_primary_identity([phone, email]) is email
    assert pick_primary_identity([phone]) is phone


def test_refresh_denormalized_email_uses_highest_precedence_identity():
    db = _session()
    user = _user(db)
    now = datetime.now(timezone.utc)
    record_identity(db, user.id, AuthIdentityProvider.EMAIL_OTP, "e@example.com", "e@example.com", now)
    record_identity(db, user.id, AuthIdentityProvider.GOOGLE, "g-sub", "g@example.com", now)

    refresh_denormalized_email(db, user)

    assert user.email == "g@example.com"


def test_refresh_denormalized_email_is_noop_when_no_email_bearing_identity():
    db = _session()
    user = _user(db)
    now = datetime.now(timezone.utc)
    record_identity(db, user.id, AuthIdentityProvider.PHONE_OTP, user.phone_number, None, now)

    refresh_denormalized_email(db, user)

    assert user.email is None


def test_resolve_email_collision_auto_link_when_another_verified_identity_matches():
    db = _session()
    existing_user = _user(db, phone="+919000000001")
    now = datetime.now(timezone.utc)
    record_identity(db, existing_user.id, AuthIdentityProvider.EMAIL_OTP, "shared@example.com", "shared@example.com", now)

    result = resolve_email_collision(db, "shared@example.com")

    assert result.kind == "auto_link"
    assert result.matched_user_id == existing_user.id


def test_resolve_email_collision_link_required_when_only_denormalized_email_matches():
    db = _session()
    existing_user = _user(db, phone="+919000000002")
    existing_user.email = "unverified@example.com"  # never separately verified — no AuthIdentity row for it
    db.commit()

    result = resolve_email_collision(db, "unverified@example.com")

    assert result.kind == "link_required"
    assert result.matched_user_id == existing_user.id


def test_resolve_email_collision_none_when_no_match():
    db = _session()
    result = resolve_email_collision(db, "nobody@example.com")
    assert result.kind == "none"
    assert result.matched_user_id is None
