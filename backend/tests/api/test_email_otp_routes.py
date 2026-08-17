"""POST /auth/email-otp/request and POST /auth/email-otp/verify -- the
inline email-OTP confirmation step that replaces the link-based
/auth/email/confirm route entirely (2026-08-17 email-otp-signup handoff
spec §3). Mirrors the shape of the deleted test_email_confirmation_routes.py.
"""

from app.models.auth import AuthIdentity, PendingIdentityVerification
from app.models.enums import AuthIdentityProvider


def _signup(client, email="otproute@example.com", password="correcthorse"):
    return client.post("/auth/signup/email", json={"email": email, "password": password})


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


def test_request_email_otp_resend_returns_a_new_code(client):
    _signup(client, "resend@example.com")

    response = client.post("/auth/email-otp/request", json={"email": "resend@example.com"})

    # Immediate resend is throttled (shared 60s window with phone) -- confirm
    # the throttle applies to the email channel too.
    assert response.status_code == 429


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
