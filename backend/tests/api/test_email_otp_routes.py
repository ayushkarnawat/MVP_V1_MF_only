"""POST /auth/email-otp/request and POST /auth/email-otp/verify -- the
inline email-OTP confirmation step that replaces the link-based
/auth/email/confirm route entirely (2026-08-17 email-otp-signup handoff
spec §3). Mirrors the shape of the deleted test_email_confirmation_routes.py.
"""

from app.models.auth import AuthIdentity, PendingIdentityVerification
from app.models.enums import AuthIdentityProvider
from app.models.enums import ConsentDocumentType as T
from app.services.legal.registry import current_document


def _consent():
    return [
        {"document_type": t.value, "document_version": current_document(t).version}
        for t in (T.TERMS_OF_SERVICE, T.PRIVACY_POLICY)
    ]


def _signup(client, email="otproute@example.com"):
    return client.post("/auth/signup/email", json={"email": email, "accepted_documents": _consent()})


def test_signup_email_returns_email_otp_required(client):
    response = _signup(client)

    assert response.status_code == 200
    body = response.json()
    assert "email_otp_required" in body
    assert body["email_otp_required"]["token"]
    assert body["email_otp_required"]["prefill_email"] == "otproute@example.com"
    assert body["email_otp_required"]["otp"] is not None  # dev-stub mode echoes it


def test_verify_email_otp_with_a_valid_code_returns_phone_required(client):
    signup = _signup(client, "validcode@example.com")
    detail = signup.json()["email_otp_required"]

    response = client.post(
        "/auth/email-otp/verify",
        json={"email": "validcode@example.com", "otp": detail["otp"], "pending_token": detail["token"]},
    )

    assert response.status_code == 200
    body = response.json()
    assert "phone_required" in body
    assert body["phone_required"]["token"] == detail["token"]
    assert body["phone_required"]["prefill_email"] == "validcode@example.com"


def test_verify_email_otp_rejects_an_invalid_code(client):
    signup = _signup(client, "wrongcode@example.com")
    detail = signup.json()["email_otp_required"]

    response = client.post(
        "/auth/email-otp/verify",
        json={"email": "wrongcode@example.com", "otp": "000000", "pending_token": detail["token"]},
    )

    assert response.status_code == 401


def test_verify_email_otp_rejects_an_unknown_pending_token(client):
    signup = _signup(client, "badtoken@example.com")
    detail = signup.json()["email_otp_required"]

    response = client.post(
        "/auth/email-otp/verify",
        json={"email": "badtoken@example.com", "otp": detail["otp"], "pending_token": "not-a-real-token"},
    )

    assert response.status_code == 401


def test_verify_email_otp_sets_pending_email_verified_without_deleting_it(client):
    signup = _signup(client, "flagcheck@example.com")
    detail = signup.json()["email_otp_required"]

    response = client.post(
        "/auth/email-otp/verify",
        json={"email": "flagcheck@example.com", "otp": detail["otp"], "pending_token": detail["token"]},
    )
    assert response.status_code == 200

    from app.db.session import get_db

    db = next(client.app.dependency_overrides[get_db]())
    pending = db.query(PendingIdentityVerification).filter_by(provider_subject="flagcheck@example.com").one()
    assert pending.email_verified is True
    db.close()


def test_verify_email_otp_rejects_a_real_code_applied_to_a_different_pending_token(client):
    """An attacker who genuinely verifies their OWN email OTP must not be
    able to apply that verification to a VICTIM's pending signup just by
    supplying the victim's pending_token alongside their own email+code --
    that would flip email_verified on a record the attacker never proved
    control of."""
    victim_signup = _signup(client, "victim@example.com")
    victim_token = victim_signup.json()["email_otp_required"]["token"]

    attacker_signup = _signup(client, "attacker@example.com")
    attacker_otp = attacker_signup.json()["email_otp_required"]["otp"]

    response = client.post(
        "/auth/email-otp/verify",
        json={"email": "attacker@example.com", "otp": attacker_otp, "pending_token": victim_token},
    )

    assert response.status_code == 401

    from app.db.session import get_db

    db = next(client.app.dependency_overrides[get_db]())
    victim_pending = db.query(PendingIdentityVerification).filter_by(email="victim@example.com").one()
    assert victim_pending.email_verified is False
    db.close()


def test_verify_email_otp_step_up_branch_rejects_a_fresh_signup_token_for_an_unrelated_account(client):
    """An attacker who completes their OWN real signup must not be able to
    pre-claim an arbitrary victim email: calling signup_email for the
    victim's email (no proof required, by design) yields a matched_user_id
    IS NULL pending_token; that token must never be attachable to the
    attacker's own already-existing account just because the attacker
    separately, genuinely verifies their OWN email+OTP in the same
    request. Only a genuine link_required collision token (matched_user_id
    already set by resolve_new_verified_identity) may attach to an
    existing account."""
    # Attacker completes a real signup end to end -- a genuine account.
    attacker_signup = _signup(client, "attacker@example.com")
    attacker_detail = attacker_signup.json()["email_otp_required"]
    verify_attacker_email = client.post(
        "/auth/email-otp/verify",
        json={
            "email": "attacker@example.com",
            "otp": attacker_detail["otp"],
            "pending_token": attacker_detail["token"],
        },
    )
    gate_token = verify_attacker_email.json()["phone_required"]["token"]
    phone_otp = client.post("/auth/otp/request", json={"phone_number": "+919777777799"}).json()["otp"]
    client.post(
        "/auth/otp/verify",
        json={"phone_number": "+919777777799", "otp": phone_otp, "pending_token": gate_token},
    )

    # Attacker mints a pending_token for the VICTIM's email -- no proof of
    # ownership required at this step, by design (anti-enumeration).
    victim_signup = _signup(client, "victim@example.com")
    victim_pending_token = victim_signup.json()["email_otp_required"]["token"]

    # Attacker requests a fresh OTP for their OWN email and genuinely
    # verifies it -- but supplies the victim's pending_token alongside it.
    attacker_otp_2 = client.post(
        "/auth/email-otp/request", json={"email": "attacker@example.com"}
    ).json()["otp"]
    response = client.post(
        "/auth/email-otp/verify",
        json={"email": "attacker@example.com", "otp": attacker_otp_2, "pending_token": victim_pending_token},
    )

    assert response.status_code == 401

    from app.db.session import get_db

    db = next(client.app.dependency_overrides[get_db]())
    # The victim's email must never have been attached to the attacker's
    # account.
    assert (
        db.query(AuthIdentity)
        .filter_by(provider=AuthIdentityProvider.EMAIL_OTP, provider_subject="victim@example.com")
        .first()
        is None
    )
    db.close()


def _create_link_pending_token(client, matched_user_id, claimed_email):
    """Simulates a genuine link_required collision token -- the shape
    resolve_new_verified_identity creates for a Google/etc. identity that
    collided with an existing account's email -- without needing the full
    Google-mocking machinery. matched_user_id set + email_verified=True
    is exactly what distinguishes this from a fresh-signup token."""
    from app.db.session import get_db
    from app.services.auth.identity import create_pending_verification

    db = next(client.app.dependency_overrides[get_db]())
    _, raw_token = create_pending_verification(
        db,
        AuthIdentityProvider.GOOGLE,
        "g-sub-contested",
        claimed_email,
        True,
        matched_user_id=matched_user_id,
    )
    db.close()
    return raw_token


def test_verify_email_otp_step_up_branch_rejects_a_different_email_than_the_pending_link_claims(client):
    """matched_user_id alone can't be forged (it's server-derived from an
    already-verified claim), but that only proves SOME email collided
    with SOME account -- not that THIS request just verified control of
    the SPECIFIC contested address. Without checking pending.email ==
    body.email, any OTP the caller can genuinely pass, for any email they
    happen to control, would satisfy the step-up."""
    from datetime import datetime, timezone

    from app.db.session import get_db
    from app.models.user import User

    db = next(client.app.dependency_overrides[get_db]())
    existing_account = User(phone_number="+919777777788", created_at=datetime.now(timezone.utc))
    db.add(existing_account)
    db.commit()
    db.refresh(existing_account)
    existing_account_id = existing_account.id
    db.close()

    link_token = _create_link_pending_token(client, existing_account_id, "contested@example.com")

    # Caller proves control of a DIFFERENT email they own, not the
    # contested one the link token was actually raised against.
    attacker_email_otp = client.post(
        "/auth/email-otp/request", json={"email": "attackerowned@example.com"}
    ).json()["otp"]

    response = client.post(
        "/auth/email-otp/verify",
        json={"email": "attackerowned@example.com", "otp": attacker_email_otp, "pending_token": link_token},
    )

    assert response.status_code == 401

    db = next(client.app.dependency_overrides[get_db]())
    assert (
        db.query(AuthIdentity)
        .filter_by(provider=AuthIdentityProvider.GOOGLE, provider_subject="g-sub-contested")
        .first()
        is None
    )
    db.close()


def test_verify_email_otp_step_up_branch_accepts_the_correct_contested_email(client):
    from datetime import datetime, timezone

    from app.db.session import get_db
    from app.models.user import User

    db = next(client.app.dependency_overrides[get_db]())
    existing_account = User(phone_number="+919777777789", created_at=datetime.now(timezone.utc))
    db.add(existing_account)
    db.commit()
    db.refresh(existing_account)
    existing_account_id = existing_account.id
    db.close()

    link_token = _create_link_pending_token(client, existing_account_id, "contested2@example.com")

    otp = client.post("/auth/email-otp/request", json={"email": "contested2@example.com"}).json()["otp"]

    response = client.post(
        "/auth/email-otp/verify",
        json={"email": "contested2@example.com", "otp": otp, "pending_token": link_token},
    )

    assert response.status_code == 200
    assert response.json()["user_id"] == str(existing_account_id)


def test_request_email_otp_resend_returns_a_new_code(client):
    _signup(client, "resend@example.com")

    response = client.post("/auth/email-otp/request", json={"email": "resend@example.com"})

    # Immediate resend is throttled (shared 60s window with phone) -- confirm
    # the throttle applies to the email channel too.
    assert response.status_code == 429


def test_signup_email_resend_returns_429_not_500(client):
    _signup(client, "signupresend@example.com")

    # Immediate re-signup with the same email hits the same OTP throttle as
    # /auth/email-otp/request -- this call site was missing the except clause
    # (an uncaught OtpRequestThrottledError 500s with no CORS headers, which
    # browsers then misreport as a CORS error instead of the real 429).
    response = _signup(client, "signupresend@example.com")

    assert response.status_code == 429


def test_request_email_otp_returns_502_not_500_when_send_fails(client, monkeypatch):
    import app.api.auth as auth_module
    from app.services.auth.email_provider import EmailSendError

    def failing_create_otp_request(*args, **kwargs):
        raise EmailSendError("boom")

    monkeypatch.setattr(auth_module, "create_otp_request", failing_create_otp_request)

    response = client.post("/auth/email-otp/request", json={"email": "failure@example.com"})

    assert response.status_code == 502
    assert response.json()["detail"]


def test_signup_email_returns_502_not_500_when_send_fails(client, monkeypatch):
    import app.api.auth as auth_module
    from app.services.auth.email_provider import EmailSendError

    def failing_create_otp_request(*args, **kwargs):
        raise EmailSendError("boom")

    monkeypatch.setattr(auth_module, "create_otp_request", failing_create_otp_request)

    response = _signup(client, "sendfailure@example.com")

    assert response.status_code == 502
    assert response.json()["detail"]


def test_request_contact_change_returns_502_not_500_when_send_fails(client, monkeypatch):
    """Mirrors test_contact_change_routes.py's `_signup` pattern (phone-OTP
    signup to get a Bearer session token) since /auth/contact-change/request
    requires an authenticated user -- unlike the two email-only routes above."""
    import app.api.auth as auth_module
    from app.services.auth.email_provider import EmailSendError

    otp = client.post("/auth/otp/request", json={"phone_number": "+919300000099"}).json()["otp"]
    signup = client.post(
        "/auth/otp/verify", json={"phone_number": "+919300000099", "otp": otp}
    ).json()
    headers = {"Authorization": f"Bearer {signup['session_token']}"}

    def failing_create_otp_request(*args, **kwargs):
        raise EmailSendError("boom")

    monkeypatch.setattr(auth_module, "create_otp_request", failing_create_otp_request)

    response = client.post(
        "/auth/contact-change/request",
        json={"channel": "email", "identifier": "contactchangefailure@example.com"},
        headers=headers,
    )

    assert response.status_code == 502
    assert response.json()["detail"]


def test_full_signup_flow_email_otp_then_phone_otp_creates_a_session(client):
    signup = _signup(client, "fullflow@example.com")
    detail = signup.json()["email_otp_required"]

    verify_email = client.post(
        "/auth/email-otp/verify",
        json={"email": "fullflow@example.com", "otp": detail["otp"], "pending_token": detail["token"]},
    )
    assert verify_email.status_code == 200
    gate_token = verify_email.json()["phone_required"]["token"]

    otp_request = client.post("/auth/otp/request", json={"phone_number": "+919777777701"})
    phone_otp = otp_request.json()["otp"]

    verify_phone = client.post(
        "/auth/otp/verify",
        json={"phone_number": "+919777777701", "otp": phone_otp, "pending_token": gate_token},
    )

    assert verify_phone.status_code == 200
    assert "session_token" in verify_phone.json()

    from app.db.session import get_db

    db = next(client.app.dependency_overrides[get_db]())
    identity = (
        db.query(AuthIdentity)
        .filter_by(provider=AuthIdentityProvider.EMAIL_OTP, provider_subject="fullflow@example.com")
        .one()
    )
    # Email-OTP verification during signup denormalizes the verified email
    # onto the new identity, not just the pending record.
    assert identity.email == "fullflow@example.com"
    db.close()


def test_phone_gate_rejects_a_phone_number_that_belongs_to_a_different_existing_account(client):
    """A brand-new email signup's mandatory phone gate must not silently log
    the caller into an unrelated existing account just because they typed
    that account's phone number -- it must 409 like signup_email's own
    already-exists check, not attach_pending_identity into someone else's
    account."""
    # An existing account, phone-only, created via a plain phone login/signup.
    existing_otp_request = client.post("/auth/otp/request", json={"phone_number": "+919777777800"})
    existing_otp = existing_otp_request.json()["otp"]
    existing_signup = client.post(
        "/auth/otp/verify", json={"phone_number": "+919777777800", "otp": existing_otp}
    )
    assert existing_signup.status_code == 200
    existing_user_id = existing_signup.json()["user_id"]

    # A different person signs up fresh with a new email, then hits the
    # phone gate with the SAME phone number as the existing account above.
    signup = _signup(client, "newperson@example.com")
    detail = signup.json()["email_otp_required"]
    verify_email = client.post(
        "/auth/email-otp/verify",
        json={"email": "newperson@example.com", "otp": detail["otp"], "pending_token": detail["token"]},
    )
    gate_token = verify_email.json()["phone_required"]["token"]

    gate_otp_request = client.post("/auth/otp/request", json={"phone_number": "+919777777800"})
    gate_otp = gate_otp_request.json()["otp"]
    verify_phone = client.post(
        "/auth/otp/verify",
        json={"phone_number": "+919777777800", "otp": gate_otp, "pending_token": gate_token},
    )

    assert verify_phone.status_code == 409
    assert "already exists" in verify_phone.json()["detail"]

    # Existing account's email must be untouched -- no silent attach happened.
    import uuid

    from app.db.session import get_db
    from app.models.user import User

    db = next(client.app.dependency_overrides[get_db]())
    existing_user = db.query(User).filter_by(id=uuid.UUID(existing_user_id)).one()
    assert existing_user.email is None
    db.close()


def test_phone_gate_rejects_a_colliding_number_at_request_time_before_any_otp_is_sent(client):
    """Same collision as the verify-time 409 above, but the phone gate should
    surface it as soon as the number is typed -- at POST /auth/otp/request --
    not only after the caller receives and re-types a code, matching
    signup_email's own request-time already-exists check."""
    existing_otp_request = client.post("/auth/otp/request", json={"phone_number": "+919777777900"})
    existing_otp = existing_otp_request.json()["otp"]
    existing_signup = client.post(
        "/auth/otp/verify", json={"phone_number": "+919777777900", "otp": existing_otp}
    )
    assert existing_signup.status_code == 200

    signup = _signup(client, "requesttimecollision@example.com")
    detail = signup.json()["email_otp_required"]
    verify_email = client.post(
        "/auth/email-otp/verify",
        json={
            "email": "requesttimecollision@example.com",
            "otp": detail["otp"],
            "pending_token": detail["token"],
        },
    )
    gate_token = verify_email.json()["phone_required"]["token"]

    gate_otp_request = client.post(
        "/auth/otp/request",
        json={"phone_number": "+919777777900", "pending_token": gate_token},
    )
    assert gate_otp_request.status_code == 409
    assert "already exists" in gate_otp_request.json()["detail"]
    # No OTP sent for the rejected request.
    assert gate_otp_request.json().get("otp") is None


def test_phone_gate_still_sends_an_otp_at_request_time_for_a_genuinely_new_number(client):
    """The request-time check must not become a false-positive block on an
    ordinary brand-new phone gate signup."""
    signup = _signup(client, "freshnumbergate@example.com")
    detail = signup.json()["email_otp_required"]
    verify_email = client.post(
        "/auth/email-otp/verify",
        json={
            "email": "freshnumbergate@example.com",
            "otp": detail["otp"],
            "pending_token": detail["token"],
        },
    )
    gate_token = verify_email.json()["phone_required"]["token"]

    gate_otp_request = client.post(
        "/auth/otp/request",
        json={"phone_number": "+919777777901", "pending_token": gate_token},
    )
    assert gate_otp_request.status_code == 200
    assert gate_otp_request.json()["otp"] is not None


def test_phone_first_signup_end_to_end(client):
    """The full new flow: phone verifies first, then email, then the
    account exists with both identities."""
    phone = "+919777788888"
    phone_otp = client.post("/auth/otp/request", json={"phone_number": phone}).json()["otp"]
    phone_result = client.post(
        "/auth/otp/verify", json={"phone_number": phone, "otp": phone_otp, "flow": "signup", "accepted_documents": _consent()}
    ).json()
    pending_token = phone_result["email_required"]["token"]

    email_otp = client.post(
        "/auth/email-otp/request", json={"email": "phonefirst@example.com", "pending_token": pending_token}
    ).json()["otp"]

    response = client.post(
        "/auth/email-otp/verify",
        json={"email": "phonefirst@example.com", "otp": email_otp, "pending_token": pending_token},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["session_token"]


def test_email_gate_rejects_an_email_that_already_has_an_account_at_request_time(client):
    """C2 fix (final review, 2026-09-28): mirrors
    test_phone_gate_rejects_a_colliding_number_at_request_time_before_any_otp_is_sent
    for the opposite direction -- the phone-first email step must reject an
    already-claimed email before an OTP is even sent, not crash with a 500
    once two EMAIL_OTP identities collide on the unique constraint, and not
    silently create a second, duplicate account."""
    existing_signup = _signup(client, "emailgatecollision@example.com")
    existing_detail = existing_signup.json()["email_otp_required"]
    existing_phone_gate = client.post(
        "/auth/email-otp/verify",
        json={
            "email": "emailgatecollision@example.com",
            "otp": existing_detail["otp"],
            "pending_token": existing_detail["token"],
        },
    ).json()["phone_required"]
    existing_gate_phone = "+919777788800"
    existing_gate_otp = client.post(
        "/auth/otp/request",
        json={"phone_number": existing_gate_phone, "pending_token": existing_phone_gate["token"]},
    ).json()["otp"]
    completed = client.post(
        "/auth/otp/verify",
        json={
            "phone_number": existing_gate_phone,
            "otp": existing_gate_otp,
            "pending_token": existing_phone_gate["token"],
        },
    )
    assert completed.status_code == 200  # account (and its EMAIL_OTP identity) now fully exists

    phone = "+919777788899"
    phone_otp = client.post("/auth/otp/request", json={"phone_number": phone}).json()["otp"]
    pending_token = client.post(
        "/auth/otp/verify", json={"phone_number": phone, "otp": phone_otp, "flow": "signup", "accepted_documents": _consent()}
    ).json()["email_required"]["token"]

    gate_request = client.post(
        "/auth/email-otp/request",
        json={"email": "emailgatecollision@example.com", "pending_token": pending_token},
    )

    assert gate_request.status_code == 409
    assert "already exists" in gate_request.json()["detail"]
    assert gate_request.json().get("otp") is None


def test_email_gate_returns_409_not_500_if_email_is_claimed_between_request_and_verify(client):
    """Defense-in-depth for the C2 fix: the race window between
    request_email_otp's up-front check and this verify call -- e.g. the
    real owner completing their own signup for the same address in that
    window. Must surface as 409, not an IntegrityError 500 from the
    auth_identities unique constraint. The colliding identity is inserted
    directly (not via a second HTTP signup) so this test isolates the race
    itself rather than also exercising the otp_requests resend throttle for
    the same email identifier."""
    import uuid
    from datetime import datetime, timezone

    from app.db.session import get_db
    from app.main import app
    from app.models.auth import AuthIdentity
    from app.models.enums import AuthIdentityProvider
    from app.models.user import User

    phone = "+919777788877"
    phone_otp = client.post("/auth/otp/request", json={"phone_number": phone}).json()["otp"]
    pending_token = client.post(
        "/auth/otp/verify", json={"phone_number": phone, "otp": phone_otp, "flow": "signup", "accepted_documents": _consent()}
    ).json()["email_required"]["token"]
    email_otp = client.post(
        "/auth/email-otp/request",
        json={"email": "raceclaimed@example.com", "pending_token": pending_token},
    ).json()["otp"]

    override = app.dependency_overrides[get_db]
    db = next(override())
    now = datetime.now(timezone.utc)
    other_user = User(id=uuid.uuid4(), phone_number="+919777788866", email="raceclaimed@example.com", created_at=now)
    db.add(other_user)
    db.flush()
    db.add(
        AuthIdentity(
            user_id=other_user.id,
            provider=AuthIdentityProvider.EMAIL_OTP,
            provider_subject="raceclaimed@example.com",
            email="raceclaimed@example.com",
            identifier_verified_at=now,
            created_at=now,
            last_used_at=now,
        )
    )
    db.commit()

    response = client.post(
        "/auth/email-otp/verify",
        json={"email": "raceclaimed@example.com", "otp": email_otp, "pending_token": pending_token},
    )

    assert response.status_code == 409
    assert "already exists" in response.json()["detail"]


def test_phone_first_signup_deletes_otp_requests_on_completion(client):
    """Confirmed pattern: the `client` fixture overrides `get_db` with its
    own TestSessionLocal bound to the test engine (see conftest.py) --
    `app.db.session.SessionLocal` is bound to the *production* engine and
    would silently query the wrong database here. Reach the test database
    through the override itself, exactly as
    tests/api/test_analytics_route.py's `_seed_section` helper already
    does."""
    from app.db.session import get_db
    from app.main import app
    from app.models.auth import OtpRequest

    phone = "+919777799999"
    phone_otp = client.post("/auth/otp/request", json={"phone_number": phone}).json()["otp"]
    pending_token = client.post(
        "/auth/otp/verify", json={"phone_number": phone, "otp": phone_otp, "flow": "signup", "accepted_documents": _consent()}
    ).json()["email_required"]["token"]
    email_otp = client.post(
        "/auth/email-otp/request", json={"email": "cleanup@example.com", "pending_token": pending_token}
    ).json()["otp"]

    client.post(
        "/auth/email-otp/verify",
        json={"email": "cleanup@example.com", "otp": email_otp, "pending_token": pending_token},
    )

    override = app.dependency_overrides[get_db]
    db = next(override())
    assert db.query(OtpRequest).filter_by(phone_number=phone).first() is None
    assert db.query(OtpRequest).filter_by(email="cleanup@example.com").first() is None


def test_email_login_request_with_an_unknown_email_is_404(client):
    r = client.post("/auth/email-otp/request", json={"email": "nobody@example.com", "flow": "login"})
    assert r.status_code == 404
    assert r.json()["detail"] == "No account found for that email — sign up instead."


def test_email_request_without_flow_is_unchanged(client):
    r = client.post("/auth/email-otp/request", json={"email": "nobody2@example.com"})
    assert r.status_code == 200


# ---------------------------------------------------------------------------
# Task 8 (consent core B2): email-first sign-up captures T&C + Privacy
# consent at its first step and records it when the account is created.


def test_email_signup_without_consent_is_422(client):
    r = client.post("/auth/signup/email", json={"email": "noconsent@example.com"})
    assert r.status_code == 422
    assert r.json()["detail"]["code"] == "consent_required"
    assert r.json()["detail"]["missing"] == ["terms_of_service", "privacy_policy"]
    from app.db.session import get_db

    db = next(client.app.dependency_overrides[get_db]())
    assert db.query(PendingIdentityVerification).filter_by(provider_subject="noconsent@example.com").count() == 0
    db.close()


def test_email_signup_records_consent_on_completion(client):
    import uuid

    from app.models.consent import ConsentRecord

    email = "consentflow@example.com"
    detail = client.post(
        "/auth/signup/email",
        json={"email": email, "accepted_documents": _consent()},
        headers={"X-Device-Id": "dev-email"},
    ).json()["email_otp_required"]
    gate_token = client.post(
        "/auth/email-otp/verify", json={"email": email, "otp": detail["otp"], "pending_token": detail["token"]}
    ).json()["phone_required"]["token"]
    phone = "+919777700901"
    phone_otp = client.post("/auth/otp/request", json={"phone_number": phone, "pending_token": gate_token}).json()["otp"]
    s = client.post(
        "/auth/otp/verify", json={"phone_number": phone, "otp": phone_otp, "pending_token": gate_token}
    ).json()

    from app.db.session import get_db

    db = next(client.app.dependency_overrides[get_db]())
    rows = db.query(ConsentRecord).filter(ConsentRecord.user_id == uuid.UUID(s["user_id"])).all()
    assert len(rows) == 3
    assert {r.surface for r in rows} == {"signup_email"}
    assert {r.device_id for r in rows} == {"dev-email"}
    db.close()
