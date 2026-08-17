import uuid
from datetime import datetime, timezone

from app.models.auth import AuthIdentity
from app.models.enums import AuthIdentityProvider
from app.services.auth.identity import create_pending_verification


def _db(client):
    from app.db.session import get_db

    return next(client.app.dependency_overrides[get_db]())


def _signup_and_complete_gate(client, email, phone):
    signup = client.post("/auth/signup/email", json={"email": email, "password": "correcthorse"})
    gate_token = signup.json()["phone_required"]["token"]
    otp_request = client.post("/auth/otp/request", json={"phone_number": phone})
    otp = otp_request.json()["otp"]
    return client.post(
        "/auth/otp/verify",
        json={"phone_number": phone, "otp": otp, "pending_token": gate_token},
    )


def test_signup_email_returns_phone_required(client):
    response = client.post("/auth/signup/email", json={"email": "new@example.com", "password": "correcthorse"})

    assert response.status_code == 200
    body = response.json()
    assert "phone_required" in body
    assert body["phone_required"]["token"]


def test_signup_email_rejects_short_passwords(client):
    response = client.post("/auth/signup/email", json={"email": "new2@example.com", "password": "short"})

    assert response.status_code == 422


def test_signup_email_conflicts_when_email_already_has_a_password_identity(client):
    _signup_and_complete_gate(client, "dup@example.com", "+919111111111")

    response = client.post("/auth/signup/email", json={"email": "dup@example.com", "password": "anotherpassword"})

    assert response.status_code == 409


def test_signup_email_normalizes_case_and_whitespace(client):
    _signup_and_complete_gate(client, "  Mixed@Example.COM  ", "+919111111112")

    second = client.post("/auth/signup/email", json={"email": "mixed@example.com", "password": "differentpassword"})
    assert second.status_code == 409


def test_signup_email_then_phone_gate_creates_an_email_password_identity_with_the_hash(client):
    verify = _signup_and_complete_gate(client, "gate@example.com", "+919222222222")

    assert verify.status_code == 200
    assert "session_token" in verify.json()

    db = _db(client)
    identity = (
        db.query(AuthIdentity)
        .filter_by(provider=AuthIdentityProvider.EMAIL_PASSWORD, provider_subject="gate@example.com")
        .one()
    )
    assert identity.password_hash is not None
    assert identity.password_hash != "correcthorse"
    db.close()


def test_login_email_succeeds_after_confirmation(client):
    _signup_and_complete_gate(client, "login@example.com", "+919333333333")

    db = _db(client)
    identity = (
        db.query(AuthIdentity)
        .filter_by(provider=AuthIdentityProvider.EMAIL_PASSWORD, provider_subject="login@example.com")
        .one()
    )
    identity.email_confirmed_at = datetime.now(timezone.utc)
    db.commit()
    db.close()

    response = client.post("/auth/login/email", json={"email": "login@example.com", "password": "correcthorse"})

    assert response.status_code == 200
    assert "session_token" in response.json()


def test_login_email_rejects_wrong_password_generically(client):
    _signup_and_complete_gate(client, "wrongpw@example.com", "+919444444444")

    response = client.post("/auth/login/email", json={"email": "wrongpw@example.com", "password": "wrongpassword"})

    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid email or password."


def test_login_email_rejects_unknown_email_with_the_same_generic_message(client):
    response = client.post("/auth/login/email", json={"email": "neverexisted@example.com", "password": "whatever1"})

    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid email or password."


def test_login_email_returns_403_when_not_yet_confirmed(client, monkeypatch):
    monkeypatch.setattr("app.api.auth.settings.require_email_confirmation", True)
    monkeypatch.setattr("app.services.auth.identity.settings.require_email_confirmation", True)
    _signup_and_complete_gate(client, "unconfirmed@example.com", "+919555555555")

    response = client.post("/auth/login/email", json={"email": "unconfirmed@example.com", "password": "correcthorse"})

    assert response.status_code == 403


def test_login_email_succeeds_immediately_in_dev_mode(client):
    _signup_and_complete_gate(client, "devsignup@example.com", "+919555555556")

    response = client.post("/auth/login/email", json={"email": "devsignup@example.com", "password": "correcthorse"})

    assert response.status_code == 200
    assert "session_token" in response.json()


def test_login_email_with_a_pending_token_attaches_the_pending_identity(client):
    _signup_and_complete_gate(client, "stepup@example.com", "+919666666601")

    db = _db(client)
    identity = (
        db.query(AuthIdentity)
        .filter_by(provider=AuthIdentityProvider.EMAIL_PASSWORD, provider_subject="stepup@example.com")
        .one()
    )
    identity.email_confirmed_at = datetime.now(timezone.utc)
    db.commit()

    _, pending_token = create_pending_verification(
        db,
        AuthIdentityProvider.GOOGLE,
        "google-sub-stepup",
        "stepup@example.com",
        True,
        matched_user_id=identity.user_id,
    )
    user_id = identity.user_id
    db.close()

    response = client.post(
        "/auth/login/email",
        json={"email": "stepup@example.com", "password": "correcthorse", "pending_token": pending_token},
    )

    assert response.status_code == 200
    assert response.json()["user_id"] == str(user_id)

    db = _db(client)
    linked = (
        db.query(AuthIdentity)
        .filter_by(provider=AuthIdentityProvider.GOOGLE, provider_subject="google-sub-stepup")
        .one()
    )
    assert linked.user_id == user_id
    db.close()


def test_login_email_rejects_a_pending_token_for_a_different_account(client):
    _signup_and_complete_gate(client, "stepupmismatch@example.com", "+919666666602")

    db = _db(client)
    identity = (
        db.query(AuthIdentity)
        .filter_by(provider=AuthIdentityProvider.EMAIL_PASSWORD, provider_subject="stepupmismatch@example.com")
        .one()
    )
    identity.email_confirmed_at = datetime.now(timezone.utc)
    db.commit()

    _, pending_token = create_pending_verification(
        db,
        AuthIdentityProvider.GOOGLE,
        "google-sub-mismatch",
        "someone-else@example.com",
        True,
        matched_user_id=uuid.uuid4(),
    )
    db.close()

    response = client.post(
        "/auth/login/email",
        json={"email": "stepupmismatch@example.com", "password": "correcthorse", "pending_token": pending_token},
    )

    assert response.status_code == 401
