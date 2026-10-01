import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import create_engine
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models.auth import AuthIdentity, OtpRequest, PendingIdentityVerification
from app.models.enums import AuthIdentityProvider
from app.models.user import User
from app.services.auth.identity import (
    EmailCollisionError,
    PendingVerificationError,
    attach_email_to_pending,
    attach_pending_identity,
    complete_gated_signup,
    create_pending_verification,
    find_identity_by_subject,
    find_or_backfill_phone_identity,
    mark_pending_email_verified,
    peek_pending_link_info,
    pick_primary_identity,
    record_identity,
    refresh_denormalized_email,
    resolve_email_collision,
)
from app.services.auth.otp import create_otp_request


def _session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    return sessionmaker(autoflush=False, bind=engine)()


# Base.metadata.create_all(engine) above has no `tables=` filter, so it
# already creates every table including otp_requests -- this is just a
# readability alias for tests that exercise the OTP-cleanup side effect.
_session_with_otp_requests = _session


def _consent_snapshot(surface="signup_google"):
    """A valid pending-record consent snapshot (Task 8): complete_gated_signup
    refuses to create an account without one."""
    from app.models.enums import ConsentDocumentType
    from app.services.legal.consent import AcceptedDocument, ConsentEvidence, snapshot_for_signup
    from app.services.legal.registry import current_document

    accepted = [
        AcceptedDocument(document_type=t, document_version=current_document(t).version)
        for t in (ConsentDocumentType.TERMS_OF_SERVICE, ConsentDocumentType.PRIVACY_POLICY)
    ]
    evidence = ConsentEvidence(ip_truncated="10.0.0.0", ip_hmac="h" * 64, user_agent="pytest", device_id="dev-unit")
    return snapshot_for_signup(accepted, surface, evidence)


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


def test_complete_gated_signup_creates_user_with_both_identities():
    db = _session()
    _, raw_token = create_pending_verification(
        db, AuthIdentityProvider.GOOGLE, "g-sub-2", "new2@example.com", True, matched_user_id=None,
        consent_snapshot=_consent_snapshot(),
    )

    user_id = complete_gated_signup(db, raw_token, AuthIdentityProvider.PHONE_OTP, "+919111111111")

    user = db.get(User, user_id)
    assert user is not None
    assert user.phone_number == "+919111111111"
    assert user.email == "new2@example.com"
    assert find_identity_by_subject(db, AuthIdentityProvider.PHONE_OTP, "+919111111111") is not None
    assert find_identity_by_subject(db, AuthIdentityProvider.GOOGLE, "g-sub-2") is not None


def test_complete_gated_signup_sets_google_identity_email_when_verified():
    """Regression guard: the ORIGINAL complete_phone_gate_signup
    unconditionally wrote verified_email onto the pending identity's own
    `email` column, for BOTH EMAIL_OTP and GOOGLE pending records (never
    just EMAIL_OTP) -- because pending.provider was never PHONE_OTP under
    the old flow. The generalized complete_gated_signup must preserve this
    exact behavior for GOOGLE specifically, not narrow it to only the
    EMAIL_OTP case, or a verified Google identity's `email` column would
    silently regress to None and break resolve_email_collision's
    auto_link detection for that identity later."""
    db = _session()
    _, raw_token = create_pending_verification(
        db, AuthIdentityProvider.GOOGLE, "g-sub-verified", "verified@example.com", True, matched_user_id=None,
        consent_snapshot=_consent_snapshot(),
    )

    complete_gated_signup(db, raw_token, AuthIdentityProvider.PHONE_OTP, "+919111111112")

    google_identity = find_identity_by_subject(db, AuthIdentityProvider.GOOGLE, "g-sub-verified")
    assert google_identity is not None
    assert google_identity.email == "verified@example.com"
    phone_identity = find_identity_by_subject(db, AuthIdentityProvider.PHONE_OTP, "+919111111112")
    assert phone_identity.email is None


def test_complete_gated_signup_rejects_expired_token():
    db = _session()
    pending, raw_token = create_pending_verification(
        db, AuthIdentityProvider.GOOGLE, "g-sub-3", "new3@example.com", True, matched_user_id=None,
        consent_snapshot=_consent_snapshot(),
    )
    pending.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
    db.commit()

    with pytest.raises(PendingVerificationError, match="expired"):
        complete_gated_signup(db, raw_token, AuthIdentityProvider.PHONE_OTP, "+919222222222")


def test_complete_gated_signup_rejects_a_link_completion_token():
    db = _session()
    existing_user = _user(db, phone="+919333333333")
    _, raw_token = create_pending_verification(
        db, AuthIdentityProvider.GOOGLE, "g-sub-4", "link@example.com", True, matched_user_id=existing_user.id
    )

    with pytest.raises(PendingVerificationError, match="linking"):
        complete_gated_signup(db, raw_token, AuthIdentityProvider.PHONE_OTP, "+919444444444")


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


def test_complete_gated_signup_never_persists_an_unverified_email():
    # Finding 1. resolve_email_collision treats ANY matching
    # AuthIdentity.email as proof of independent verified ownership, so
    # persisting an unverified Google `email` claim here would launder it into
    # a real auto-link credential — see
    # test_unverified_email_does_not_capture_a_later_genuine_signup below for
    # the actual hijack this prevents.
    db = _session()
    _, raw_token = create_pending_verification(
        db, AuthIdentityProvider.GOOGLE, "g-sub-unverified", "victim@example.com", False, matched_user_id=None,
        consent_snapshot=_consent_snapshot(),
    )

    user_id = complete_gated_signup(db, raw_token, AuthIdentityProvider.PHONE_OTP, "+919000000010")

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
        db, AuthIdentityProvider.GOOGLE, "g-sub-attacker", "victim@example.com", False, matched_user_id=None,
        consent_snapshot=_consent_snapshot(),
    )
    complete_gated_signup(db, raw_token, AuthIdentityProvider.PHONE_OTP, "+919000000011")

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


def test_complete_gated_signup_rolls_back_atomically_on_second_identity_failure():
    # record_identity is called twice inside complete_gated_signup
    # (the second/completing identity, then the originating pending
    # identity) but must commit only once, as a single transaction —
    # otherwise a failure on the second write leaves a durably-committed
    # User+phone-identity behind with the (still-valid, still-undeleted)
    # pending token, and a retry would create a second User row for the
    # same phone number. Force the second write to fail via a pre-existing
    # (provider, provider_subject) unique-constraint collision, and
    # confirm nothing persists.
    db = _session()
    other_user = _user(db, phone="+919000000099")
    now = datetime.now(timezone.utc)
    record_identity(db, other_user.id, AuthIdentityProvider.GOOGLE, "g-sub-dup", "dup@example.com", now)

    _, raw_token = create_pending_verification(
        db, AuthIdentityProvider.GOOGLE, "g-sub-dup", "new@example.com", True, matched_user_id=None,
        consent_snapshot=_consent_snapshot(),
    )

    with pytest.raises(IntegrityError):
        complete_gated_signup(db, raw_token, AuthIdentityProvider.PHONE_OTP, "+919123456789")

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


def test_mark_pending_email_verified_sets_the_flag_without_consuming_the_pending_record():
    db = _session()
    pending, raw_token = create_pending_verification(
        db,
        AuthIdentityProvider.EMAIL_OTP,
        "otpflow@example.com",
        "otpflow@example.com",
        False,
        matched_user_id=None,
    )

    result = mark_pending_email_verified(db, raw_token, "otpflow@example.com")

    assert result.email_verified is True
    # Still present -- the phone gate step (complete_gated_signup) is
    # what eventually deletes it, not this call.
    still_there = (
        db.query(PendingIdentityVerification).filter_by(id=pending.id).first()
    )
    assert still_there is not None
    assert still_there.email_verified is True


def test_mark_pending_email_verified_rejects_an_unknown_token():
    db = _session()

    with pytest.raises(PendingVerificationError):
        mark_pending_email_verified(db, "not-a-real-token", "someone@example.com")


def test_peek_pending_link_info_returns_none_matched_user_id_for_a_fresh_signup_token():
    db = _session()
    _, raw_token = create_pending_verification(
        db,
        AuthIdentityProvider.EMAIL_OTP,
        "fresh@example.com",
        "fresh@example.com",
        False,
        matched_user_id=None,
    )

    info = peek_pending_link_info(db, raw_token)
    assert info.matched_user_id is None
    assert info.email == "fresh@example.com"


def test_peek_pending_link_info_returns_the_matched_account_and_email_for_a_link_token():
    db = _session()
    user = User(id=uuid.uuid4(), phone_number="+919777777700", created_at=datetime.now(timezone.utc))
    db.add(user)
    db.flush()
    _, raw_token = create_pending_verification(
        db,
        AuthIdentityProvider.EMAIL_OTP,
        "linkme@example.com",
        "linkme@example.com",
        True,
        matched_user_id=user.id,
    )

    info = peek_pending_link_info(db, raw_token)
    assert info.matched_user_id == user.id
    assert info.email == "linkme@example.com"


def test_peek_pending_link_info_does_not_consume_the_pending_record():
    """The step-up route calls this to decide which path to take, then
    calls attach_pending_identity/mark_pending_email_verified on the SAME
    token afterward -- peeking must not delete or invalidate it."""
    db = _session()
    _, raw_token = create_pending_verification(
        db,
        AuthIdentityProvider.EMAIL_OTP,
        "stillhere@example.com",
        "stillhere@example.com",
        False,
        matched_user_id=None,
    )

    peek_pending_link_info(db, raw_token)

    result = mark_pending_email_verified(db, raw_token, "stillhere@example.com")
    assert result.email_verified is True


def test_mark_pending_email_verified_rejects_a_mismatched_email():
    """An attacker who legitimately verifies their OWN email OTP must not
    be able to apply that verification to a DIFFERENT pending record (e.g.
    a victim's signup) just by supplying that pending record's token --
    the pending row's own email must match the email the OTP was actually
    verified for."""
    db = _session()
    _, victim_token = create_pending_verification(
        db,
        AuthIdentityProvider.EMAIL_OTP,
        "victim@example.com",
        "victim@example.com",
        False,
        matched_user_id=None,
    )

    with pytest.raises(PendingVerificationError):
        mark_pending_email_verified(db, victim_token, "attacker@example.com")

    unchanged = db.query(PendingIdentityVerification).filter_by(email="victim@example.com").one()
    assert unchanged.email_verified is False


def test_complete_gated_signup_denormalizes_user_email_when_pending_email_was_verified():
    """User.email gets populated once email_verified genuinely flips to
    True via email-OTP verification, before the phone gate completes."""
    db = _session()
    pending, raw_token = create_pending_verification(
        db,
        AuthIdentityProvider.EMAIL_OTP,
        "denorm@example.com",
        "denorm@example.com",
        False,
        matched_user_id=None, consent_snapshot=_consent_snapshot(),
    )
    mark_pending_email_verified(db, raw_token, "denorm@example.com")

    user_id = complete_gated_signup(db, raw_token, AuthIdentityProvider.PHONE_OTP, "+919888888884")

    user = db.get(User, user_id)
    assert user.email == "denorm@example.com"


def test_complete_gated_signup_email_first_direction_matches_today():
    """The existing email/Google-first shape: pending.provider is
    EMAIL_OTP, the second (completing) identity is PHONE_OTP."""
    db = _session()
    _, raw_token = create_pending_verification(
        db, AuthIdentityProvider.EMAIL_OTP, "person@example.com", "person@example.com", True, matched_user_id=None,
        consent_snapshot=_consent_snapshot(),
    )

    user_id = complete_gated_signup(db, raw_token, AuthIdentityProvider.PHONE_OTP, "+919999999999")

    user = db.get(User, user_id)
    assert user.phone_number == "+919999999999"
    assert user.email == "person@example.com"
    identities = db.query(AuthIdentity).filter_by(user_id=user_id).all()
    assert {i.provider for i in identities} == {AuthIdentityProvider.PHONE_OTP, AuthIdentityProvider.EMAIL_OTP}
    assert db.query(PendingIdentityVerification).count() == 0


def test_complete_gated_signup_phone_first_direction():
    """The new shape: pending.provider is PHONE_OTP, the second
    (completing) identity is EMAIL_OTP."""
    db = _session()
    _, raw_token = create_pending_verification(
        db, AuthIdentityProvider.PHONE_OTP, "+919999999999", "person@example.com", False, matched_user_id=None,
        consent_snapshot=_consent_snapshot(),
    )

    user_id = complete_gated_signup(db, raw_token, AuthIdentityProvider.EMAIL_OTP, "person@example.com")

    user = db.get(User, user_id)
    assert user.phone_number == "+919999999999"
    assert user.email == "person@example.com"
    identities = db.query(AuthIdentity).filter_by(user_id=user_id).all()
    assert {i.provider for i in identities} == {AuthIdentityProvider.PHONE_OTP, AuthIdentityProvider.EMAIL_OTP}
    phone_identity = next(i for i in identities if i.provider == AuthIdentityProvider.PHONE_OTP)
    email_identity = next(i for i in identities if i.provider == AuthIdentityProvider.EMAIL_OTP)
    assert phone_identity.provider_subject == "+919999999999"
    assert email_identity.provider_subject == "person@example.com"
    assert email_identity.email == "person@example.com"
    assert phone_identity.email is None


def test_complete_gated_signup_phone_first_rejects_email_with_existing_verified_identity():
    """C2 fix (final review, 2026-09-28): phone-first's email step must run
    the same collision check email/Google-first gets from
    resolve_new_verified_identity BEFORE this function runs -- otherwise a
    second account is created with a duplicate/already-claimed email,
    invisibly to resolve_email_collision's assumptions. Case 1: another
    account's verified identity (any provider) already carries this
    email -- would otherwise 500 on the auth_identities unique constraint
    once a second EMAIL_OTP identity insert is attempted."""
    db = _session()
    existing = _user(db, phone="+911111111111")
    record_identity(db, existing.id, AuthIdentityProvider.EMAIL_OTP, "taken@example.com", "taken@example.com", datetime.now(timezone.utc))
    _, raw_token = create_pending_verification(
        db, AuthIdentityProvider.PHONE_OTP, "+919999999999", "taken@example.com", False, matched_user_id=None,
        consent_snapshot=_consent_snapshot(),
    )

    with pytest.raises(EmailCollisionError, match="already exists"):
        complete_gated_signup(db, raw_token, AuthIdentityProvider.EMAIL_OTP, "taken@example.com")

    assert db.query(User).filter_by(phone_number="+919999999999").first() is None


def test_complete_gated_signup_phone_first_rejects_email_matching_denormalized_user_email():
    """Case 2: the email matches only a User.email denormalized field (no
    independently-verified identity, e.g. an email typed at signup that was
    never itself OTP-verified) -- resolve_email_collision's link_required
    kind. Silently creating a second account here would let
    resolve_email_collision's later `.first()` match either account."""
    db = _session()
    _user(db, phone="+911111111111")
    other = db.query(User).filter_by(phone_number="+911111111111").one()
    other.email = "denormalized@example.com"
    db.commit()
    _, raw_token = create_pending_verification(
        db, AuthIdentityProvider.PHONE_OTP, "+919999999999", "denormalized@example.com", False, matched_user_id=None,
        consent_snapshot=_consent_snapshot(),
    )

    with pytest.raises(EmailCollisionError, match="already exists"):
        complete_gated_signup(db, raw_token, AuthIdentityProvider.EMAIL_OTP, "denormalized@example.com")

    assert db.query(User).filter_by(phone_number="+919999999999").first() is None


def test_complete_gated_signup_email_first_direction_is_unaffected_by_the_collision_guard():
    """The collision guard is scoped to phone-first (pending.provider ==
    PHONE_OTP, second_provider == EMAIL_OTP) only -- the email/Google-first
    direction already had its collision check run earlier, by
    resolve_new_verified_identity, before a pending token was ever minted."""
    db = _session()
    _, raw_token = create_pending_verification(
        db, AuthIdentityProvider.EMAIL_OTP, "person@example.com", "person@example.com", True, matched_user_id=None,
        consent_snapshot=_consent_snapshot(),
    )

    user_id = complete_gated_signup(db, raw_token, AuthIdentityProvider.PHONE_OTP, "+919999999999")

    assert db.get(User, user_id) is not None


def test_complete_gated_signup_rejects_a_step_up_link_token():
    db = _session()
    existing = _user(db)
    _, raw_token = create_pending_verification(
        db, AuthIdentityProvider.GOOGLE, "g-sub", "person@example.com", True, matched_user_id=existing.id
    )

    with pytest.raises(PendingVerificationError, match="linking to an existing account"):
        complete_gated_signup(db, raw_token, AuthIdentityProvider.PHONE_OTP, "+919999999999")


def test_complete_gated_signup_deletes_matching_otp_requests_by_value():
    """FR-9 part 2, exercised end-to-end through the completion function."""
    db = _session_with_otp_requests()
    create_otp_request(db, "+919999999999")
    create_otp_request(db, "person@example.com", channel="email")
    _, raw_token = create_pending_verification(
        db, AuthIdentityProvider.PHONE_OTP, "+919999999999", "person@example.com", False, matched_user_id=None,
        consent_snapshot=_consent_snapshot(),
    )

    complete_gated_signup(db, raw_token, AuthIdentityProvider.EMAIL_OTP, "person@example.com")

    assert db.query(OtpRequest).filter_by(phone_number="+919999999999").first() is None
    assert db.query(OtpRequest).filter_by(email="person@example.com").first() is None


def test_complete_gated_signup_does_not_persist_an_unverified_email_claim():
    """Same guard complete_phone_gate_signup always had: an unverified
    email claim (email_verified=False) is never written into
    auth_identities.email or users.email."""
    db = _session()
    _, raw_token = create_pending_verification(
        db, AuthIdentityProvider.GOOGLE, "g-sub", "unverified@example.com", False, matched_user_id=None,
        consent_snapshot=_consent_snapshot(),
    )

    user_id = complete_gated_signup(db, raw_token, AuthIdentityProvider.PHONE_OTP, "+919999999999")

    user = db.get(User, user_id)
    assert user.email is None
    google_identity = db.query(AuthIdentity).filter_by(user_id=user_id, provider=AuthIdentityProvider.GOOGLE).one()
    assert google_identity.email is None


def test_attach_email_to_pending_sets_email_on_a_phone_first_record():
    db = _session()
    _, raw_token = create_pending_verification(
        db, AuthIdentityProvider.PHONE_OTP, "+919999999999", None, False, matched_user_id=None
    )

    pending = attach_email_to_pending(db, raw_token, "person@example.com")

    assert pending.email == "person@example.com"
    still_there = db.query(PendingIdentityVerification).filter_by(id=pending.id).first()
    assert still_there is not None
    assert still_there.email == "person@example.com"


def test_attach_email_to_pending_overwrites_a_previously_attached_email():
    """Covers the abandon-and-retry-with-a-different-email case: the
    pending record must reflect the LAST email actually entered, not the
    first."""
    db = _session()
    _, raw_token = create_pending_verification(
        db, AuthIdentityProvider.PHONE_OTP, "+919999999999", "typo@example.com", False, matched_user_id=None
    )

    pending = attach_email_to_pending(db, raw_token, "corrected@example.com")

    assert pending.email == "corrected@example.com"
    still_there = db.query(PendingIdentityVerification).filter_by(id=pending.id).first()
    assert still_there is not None
    assert still_there.email == "corrected@example.com"


def test_attach_email_to_pending_rejects_an_email_or_google_first_record():
    db = _session()
    _, raw_token = create_pending_verification(
        db, AuthIdentityProvider.EMAIL_OTP, "person@example.com", "person@example.com", False, matched_user_id=None
    )

    with pytest.raises(PendingVerificationError, match="phone-first signup"):
        attach_email_to_pending(db, raw_token, "person@example.com")


def test_attach_email_to_pending_rejects_a_step_up_link_token():
    db = _session()
    existing = _user(db)
    _, raw_token = create_pending_verification(
        db, AuthIdentityProvider.PHONE_OTP, "+919999999999", None, False, matched_user_id=existing.id
    )

    with pytest.raises(PendingVerificationError, match="linking to an existing account"):
        attach_email_to_pending(db, raw_token, "person@example.com")


def test_complete_gated_signup_requires_a_consent_snapshot():
    from app.services.legal.consent import ConsentRequiredError

    db = _session()
    _, raw_token = create_pending_verification(
        db, AuthIdentityProvider.GOOGLE, "g-sub-noconsent", "noconsent@example.com", True, matched_user_id=None
    )

    with pytest.raises(ConsentRequiredError) as exc:
        complete_gated_signup(db, raw_token, AuthIdentityProvider.PHONE_OTP, "+919100500001")

    assert exc.value.missing == ["terms_of_service", "privacy_policy"]
    db.rollback()
    assert db.query(User).filter_by(phone_number="+919100500001").first() is None
    assert find_identity_by_subject(db, AuthIdentityProvider.GOOGLE, "g-sub-noconsent") is None


def test_complete_gated_signup_writes_consent_rows_in_the_same_transaction():
    from app.models.consent import ConsentRecord

    db = _session()
    snapshot = _consent_snapshot("signup_google")
    _, raw_token = create_pending_verification(
        db, AuthIdentityProvider.GOOGLE, "g-sub-consent", "consent@example.com", True,
        matched_user_id=None, consent_snapshot=snapshot,
    )

    user_id = complete_gated_signup(db, raw_token, AuthIdentityProvider.PHONE_OTP, "+919100500002")

    rows = db.query(ConsentRecord).filter_by(user_id=user_id).all()
    assert len(rows) == 3
    assert {r.surface for r in rows} == {"signup_google"}
    assert {r.device_id for r in rows} == {"dev-unit"}
    captured = datetime.fromisoformat(snapshot["captured_at"]).replace(tzinfo=None)
    assert all(r.recorded_at.replace(tzinfo=None) == captured for r in rows)


def test_complete_gated_signup_rejects_a_snapshot_whose_versions_went_stale():
    from app.services.legal.consent import ConsentRequiredError

    db = _session()
    snapshot = _consent_snapshot()
    snapshot["documents"][0]["document_version"] = "tos-old"
    _, raw_token = create_pending_verification(
        db, AuthIdentityProvider.GOOGLE, "g-sub-stale", "stale@example.com", True,
        matched_user_id=None, consent_snapshot=snapshot,
    )

    with pytest.raises(ConsentRequiredError) as exc:
        complete_gated_signup(db, raw_token, AuthIdentityProvider.PHONE_OTP, "+919100500003")
    assert exc.value.missing == ["terms_of_service"]
    db.rollback()
    assert db.query(User).filter_by(phone_number="+919100500003").first() is None


def test_discard_pending_verification_removes_the_row():
    from app.services.auth.identity import discard_pending_verification

    db = _session()
    _, raw_token = create_pending_verification(
        db, AuthIdentityProvider.GOOGLE, "g-sub-discard", "discard@example.com", True, matched_user_id=None
    )
    discard_pending_verification(db, raw_token)
    assert db.query(PendingIdentityVerification).filter_by(provider_subject="g-sub-discard").count() == 0
    discard_pending_verification(db, raw_token)  # unknown token: no-op
