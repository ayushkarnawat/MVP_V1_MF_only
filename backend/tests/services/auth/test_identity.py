import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import create_engine
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models.auth import AuthIdentity, PendingIdentityVerification
from app.models.enums import AuthIdentityProvider
from app.models.user import User
from app.services.auth.identity import (
    PendingVerificationError,
    attach_pending_identity,
    complete_phone_gate_signup,
    create_pending_verification,
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


def test_create_pending_verification_returns_findable_token():
    db = _session()
    pending, raw_token = create_pending_verification(
        db, AuthIdentityProvider.GOOGLE, "g-sub-1", "new@example.com", True, matched_user_id=None
    )
    assert pending.matched_user_id is None
    assert raw_token  # non-empty, returned exactly once


def test_complete_phone_gate_signup_creates_user_with_both_identities():
    db = _session()
    _, raw_token = create_pending_verification(
        db, AuthIdentityProvider.GOOGLE, "g-sub-2", "new2@example.com", True, matched_user_id=None
    )

    user_id = complete_phone_gate_signup(db, raw_token, "+919111111111")

    user = db.get(User, user_id)
    assert user is not None
    assert user.phone_number == "+919111111111"
    assert user.email == "new2@example.com"
    assert find_identity_by_subject(db, AuthIdentityProvider.PHONE_OTP, "+919111111111") is not None
    assert find_identity_by_subject(db, AuthIdentityProvider.GOOGLE, "g-sub-2") is not None


def test_complete_phone_gate_signup_rejects_expired_token():
    db = _session()
    pending, raw_token = create_pending_verification(
        db, AuthIdentityProvider.GOOGLE, "g-sub-3", "new3@example.com", True, matched_user_id=None
    )
    pending.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
    db.commit()

    with pytest.raises(PendingVerificationError, match="expired"):
        complete_phone_gate_signup(db, raw_token, "+919222222222")


def test_complete_phone_gate_signup_rejects_a_link_completion_token():
    db = _session()
    existing_user = _user(db, phone="+919333333333")
    _, raw_token = create_pending_verification(
        db, AuthIdentityProvider.GOOGLE, "g-sub-4", "link@example.com", True, matched_user_id=existing_user.id
    )

    with pytest.raises(PendingVerificationError, match="linking"):
        complete_phone_gate_signup(db, raw_token, "+919444444444")


def test_attach_pending_identity_links_to_the_matched_user():
    db = _session()
    existing_user = _user(db, phone="+919555555555")
    existing_user.email = "unverified@example.com"
    db.commit()
    _, raw_token = create_pending_verification(
        db, AuthIdentityProvider.GOOGLE, "g-sub-5", "unverified@example.com", True, matched_user_id=existing_user.id
    )

    returned_user_id = attach_pending_identity(db, raw_token, existing_user.id)

    assert returned_user_id == existing_user.id
    assert find_identity_by_subject(db, AuthIdentityProvider.GOOGLE, "g-sub-5") is not None
    db.refresh(existing_user)
    assert existing_user.email == "unverified@example.com"  # Google outranks nothing new here, still refreshed via precedence


def test_attach_pending_identity_rejects_mismatched_resolved_user():
    db = _session()
    existing_user = _user(db, phone="+919666666666")
    other_user = _user(db, phone="+919777777777")
    _, raw_token = create_pending_verification(
        db, AuthIdentityProvider.GOOGLE, "g-sub-6", "x@example.com", True, matched_user_id=existing_user.id
    )

    with pytest.raises(PendingVerificationError, match="doesn't match"):
        attach_pending_identity(db, raw_token, other_user.id)


def test_attach_pending_identity_rejects_a_phone_gate_token():
    # matched_user_id is None on this token (it's a brand-new-signup pending
    # record, not a linking one) — attach_pending_identity must not treat
    # None as "matches everything." This is the other half of the
    # replay-guard OR condition from the mismatched-user test above.
    db = _session()
    existing_user = _user(db, phone="+919888888888")
    _, raw_token = create_pending_verification(
        db, AuthIdentityProvider.GOOGLE, "g-sub-7", "z@example.com", True, matched_user_id=None
    )

    with pytest.raises(PendingVerificationError, match="doesn't match"):
        attach_pending_identity(db, raw_token, existing_user.id)


def test_complete_phone_gate_signup_rolls_back_atomically_on_second_identity_failure():
    # record_identity is called twice inside complete_phone_gate_signup
    # (phone, then the originating Google/email identity) but must commit
    # only once, as a single transaction — otherwise a failure on the
    # second write leaves a durably-committed User+phone-identity behind
    # with the (still-valid, still-undeleted) pending token, and a retry
    # would create a second User row for the same phone number. Force the
    # second write to fail via a pre-existing (provider, provider_subject)
    # unique-constraint collision, and confirm nothing persists.
    db = _session()
    other_user = _user(db, phone="+919000000099")
    now = datetime.now(timezone.utc)
    record_identity(db, other_user.id, AuthIdentityProvider.GOOGLE, "g-sub-dup", "dup@example.com", now)

    _, raw_token = create_pending_verification(
        db, AuthIdentityProvider.GOOGLE, "g-sub-dup", "new@example.com", True, matched_user_id=None
    )

    with pytest.raises(IntegrityError):
        complete_phone_gate_signup(db, raw_token, "+919123456789")

    db.rollback()

    assert db.query(User).filter_by(phone_number="+919123456789").first() is None
    assert find_identity_by_subject(db, AuthIdentityProvider.PHONE_OTP, "+919123456789") is None
    # The pending record's own deletion is part of the same rolled-back
    # transaction, so the token row is still present (and still usable) --
    # confirming the whole operation, not just the User row, was atomic.
    assert (
        db.query(PendingIdentityVerification)
        .filter_by(provider_subject="g-sub-dup", matched_user_id=None)
        .first()
        is not None
    )
