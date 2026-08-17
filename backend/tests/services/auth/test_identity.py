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
    find_or_backfill_phone_identity,
    pick_primary_identity,
    record_identity,
    refresh_denormalized_email,
    resolve_email_collision,
)


def _session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
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


def test_attach_pending_identity_allows_a_phone_gate_token_for_an_independently_verified_account():
    # Finding 3. This test previously asserted the OPPOSITE (that a
    # matched_user_id=None token could never attach), which made an existing
    # phone-only user's first Google/email sign-in a permanent dead end: §4's
    # collision check only ever matches on EMAIL, so an account whose only
    # identifier is a phone number is never detected up front — the phone gate
    # is where the collision is discovered, and by then the caller has already
    # completed a fresh phone-OTP verification for that exact account, which
    # IS the proof of ownership the old guard was demanding in advance.
    # The replay guard still holds for any token that named a specific
    # account: see test_attach_pending_identity_rejects_mismatched_resolved_user.
    db = _session()
    existing_user = _user(db, phone="+919888888888")
    now = datetime.now(timezone.utc)
    record_identity(db, existing_user.id, AuthIdentityProvider.PHONE_OTP, existing_user.phone_number, None, now)
    _, raw_token = create_pending_verification(
        db, AuthIdentityProvider.GOOGLE, "g-sub-7", "z@example.com", True, matched_user_id=None
    )

    returned_user_id = attach_pending_identity(db, raw_token, existing_user.id)

    assert returned_user_id == existing_user.id
    attached = find_identity_by_subject(db, AuthIdentityProvider.GOOGLE, "g-sub-7")
    assert attached is not None
    assert attached.user_id == existing_user.id
    db.refresh(existing_user)
    assert existing_user.email == "z@example.com"  # denormalized from the new, verified Google identity


def test_complete_phone_gate_signup_never_persists_an_unverified_email():
    # Finding 1. resolve_email_collision treats ANY matching
    # AuthIdentity.email as proof of independent verified ownership, so
    # persisting an unverified Google `email` claim here would launder it into
    # a real auto-link credential — see
    # test_unverified_email_does_not_capture_a_later_genuine_signup below for
    # the actual hijack this prevents.
    db = _session()
    _, raw_token = create_pending_verification(
        db, AuthIdentityProvider.GOOGLE, "g-sub-unverified", "victim@example.com", False, matched_user_id=None
    )

    user_id = complete_phone_gate_signup(db, raw_token, "+919000000010")

    user = db.get(User, user_id)
    assert user.email is None
    google_identity = find_identity_by_subject(db, AuthIdentityProvider.GOOGLE, "g-sub-unverified")
    assert google_identity is not None  # the Google `sub` itself is still a legitimate credential
    assert google_identity.email is None


def test_unverified_email_does_not_capture_a_later_genuine_signup():
    # Finding 1, the consequence: after the attacker's unverified-email
    # signup, the real owner's genuinely OTP-verified email signup for the
    # same address must NOT auto-link into the attacker's account.
    db = _session()
    _, raw_token = create_pending_verification(
        db, AuthIdentityProvider.GOOGLE, "g-sub-attacker", "victim@example.com", False, matched_user_id=None
    )
    complete_phone_gate_signup(db, raw_token, "+919000000011")

    collision = resolve_email_collision(db, "victim@example.com")

    assert collision.kind == "none"
    assert collision.matched_user_id is None


def test_attach_pending_identity_never_persists_an_unverified_email():
    # Finding 1's second write site. Reachable now that a phone-gate token
    # (which is the only kind that can carry email_verified=False) can attach.
    db = _session()
    existing_user = _user(db, phone="+919000000012")
    now = datetime.now(timezone.utc)
    record_identity(db, existing_user.id, AuthIdentityProvider.PHONE_OTP, existing_user.phone_number, None, now)
    _, raw_token = create_pending_verification(
        db, AuthIdentityProvider.GOOGLE, "g-sub-attach-unverified", "victim2@example.com", False, matched_user_id=None
    )

    attach_pending_identity(db, raw_token, existing_user.id)

    attached = find_identity_by_subject(db, AuthIdentityProvider.GOOGLE, "g-sub-attach-unverified")
    assert attached.email is None
    db.refresh(existing_user)
    assert existing_user.email is None
    assert resolve_email_collision(db, "victim2@example.com").kind == "none"


def test_find_or_backfill_phone_identity_heals_a_user_row_with_no_identity():
    # Finding 2's runtime safety net: a pre-multi-method-auth `users` row that
    # migration 0005's backfill never reached.
    db = _session()
    user = _user(db, phone="+919000000013")

    identity = find_or_backfill_phone_identity(db, "+919000000013")

    assert identity is not None
    assert identity.user_id == user.id
    assert identity.provider == AuthIdentityProvider.PHONE_OTP
    assert identity.email is None
    # Sourced from users.created_at, not `now` — same rule as migration 0005
    # and the Design Spec §1 Migration note.
    assert identity.identifier_verified_at == user.created_at


def test_find_or_backfill_phone_identity_returns_existing_identity_unchanged():
    db = _session()
    user = _user(db, phone="+919000000014")
    now = datetime.now(timezone.utc)
    original = record_identity(db, user.id, AuthIdentityProvider.PHONE_OTP, user.phone_number, None, now)

    found = find_or_backfill_phone_identity(db, "+919000000014")

    assert found.id == original.id
    assert db.query(AuthIdentity).filter_by(provider_subject="+919000000014").count() == 1


def test_find_or_backfill_phone_identity_returns_none_for_a_genuinely_new_number():
    db = _session()

    assert find_or_backfill_phone_identity(db, "+919000000099") is None
    assert db.query(AuthIdentity).count() == 0


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


def test_pick_primary_identity_handles_email_password_without_a_keyerror():
    db = _session()
    now = datetime.now(timezone.utc)
    user = User(id=uuid.uuid4(), phone_number="+919777777770", created_at=now)
    db.add(user)
    db.flush()
    email_password_identity = AuthIdentity(
        user_id=user.id,
        provider=AuthIdentityProvider.EMAIL_PASSWORD,
        provider_subject="precedence@example.com",
        email=None,
        password_hash="hashed",
        email_confirmed_at=None,
        identifier_verified_at=now,
        created_at=now,
        last_used_at=now,
    )
    phone_identity = AuthIdentity(
        user_id=user.id,
        provider=AuthIdentityProvider.PHONE_OTP,
        provider_subject="+919777777770",
        email=None,
        identifier_verified_at=now,
        created_at=now,
        last_used_at=now,
    )
    db.add_all([email_password_identity, phone_identity])
    db.commit()

    result = pick_primary_identity([email_password_identity, phone_identity])

    assert result.provider == AuthIdentityProvider.EMAIL_PASSWORD


def test_create_pending_verification_stores_password_hash():
    db = _session()
    pending, raw_token = create_pending_verification(
        db,
        AuthIdentityProvider.EMAIL_PASSWORD,
        "a@example.com",
        "a@example.com",
        False,
        matched_user_id=None,
        password_hash="hashed-value",
    )
    assert pending.password_hash == "hashed-value"


def test_create_pending_verification_defaults_password_hash_to_none():
    db = _session()
    pending, raw_token = create_pending_verification(
        db,
        AuthIdentityProvider.GOOGLE,
        "google-sub-123",
        "a@example.com",
        True,
        matched_user_id=None,
    )
    assert pending.password_hash is None


def test_complete_phone_gate_signup_copies_password_hash_onto_the_new_identity():
    db = _session()
    pending, raw_token = create_pending_verification(
        db,
        AuthIdentityProvider.EMAIL_PASSWORD,
        "a@example.com",
        "a@example.com",
        False,
        matched_user_id=None,
        password_hash="hashed-value",
    )

    user_id = complete_phone_gate_signup(db, raw_token, "+919999999999")

    identity = (
        db.query(AuthIdentity)
        .filter_by(user_id=user_id, provider=AuthIdentityProvider.EMAIL_PASSWORD)
        .one()
    )
    assert identity.password_hash == "hashed-value"
    assert identity.provider_subject == "a@example.com"


def test_attach_pending_identity_copies_password_hash_onto_the_new_identity():
    db = _session()
    existing_user_id = complete_phone_gate_signup(
        db,
        create_pending_verification(
            db, AuthIdentityProvider.GOOGLE, "google-sub-456", None, False, matched_user_id=None
        )[1],
        "+919888888888",
    )

    pending, raw_token = create_pending_verification(
        db,
        AuthIdentityProvider.EMAIL_PASSWORD,
        "b@example.com",
        "b@example.com",
        False,
        matched_user_id=None,
        password_hash="hashed-value-2",
    )

    attach_pending_identity(db, raw_token, existing_user_id)

    identity = (
        db.query(AuthIdentity)
        .filter_by(user_id=existing_user_id, provider=AuthIdentityProvider.EMAIL_PASSWORD)
        .one()
    )
    assert identity.password_hash == "hashed-value-2"


def test_complete_phone_gate_signup_sends_a_confirmation_email_for_password_identities(caplog):
    db = _session()
    pending, raw_token = create_pending_verification(
        db,
        AuthIdentityProvider.EMAIL_PASSWORD,
        "confirmflow@example.com",
        "confirmflow@example.com",
        False,
        matched_user_id=None,
        password_hash="hashed-value",
    )

    with caplog.at_level("INFO"):
        complete_phone_gate_signup(db, raw_token, "+919888888882")

    assert any("StubEmailProvider" in record.message for record in caplog.records)


def test_complete_phone_gate_signup_does_not_send_email_for_google_identities(caplog):
    db = _session()
    pending, raw_token = create_pending_verification(
        db, AuthIdentityProvider.GOOGLE, "google-sub-789", "g@example.com", True, matched_user_id=None
    )

    with caplog.at_level("INFO"):
        complete_phone_gate_signup(db, raw_token, "+919888888883")

    assert not any("StubEmailProvider" in record.message for record in caplog.records)
