from app.models.auth import AuthIdentity
from app.models.enums import AuthIdentityProvider
from app.services.auth.email_confirmation import create_email_confirmation_token


def _db(client):
    from app.db.session import get_db

    return next(client.app.dependency_overrides[get_db]())


def _signup_and_complete_gate(client, email, phone):
    signup = client.post("/auth/signup/email", json={"email": email, "password": "correcthorse"})
    gate_token = signup.json()["phone_required"]["token"]
    otp_request = client.post("/auth/otp/request", json={"phone_number": phone})
    otp = otp_request.json()["otp"]
    client.post("/auth/otp/verify", json={"phone_number": phone, "otp": otp, "pending_token": gate_token})


def test_confirm_email_with_a_valid_token_enables_password_login(client):
    _signup_and_complete_gate(client, "confirmroute@example.com", "+919999999011")
    db = _db(client)
    identity = (
        db.query(AuthIdentity)
        .filter_by(provider=AuthIdentityProvider.EMAIL_PASSWORD, provider_subject="confirmroute@example.com")
        .one()
    )
    _, raw_token = create_email_confirmation_token(db, identity.user_id)
    db.close()

    confirm = client.post("/auth/email/confirm", json={"token": raw_token})
    assert confirm.status_code == 200

    login = client.post(
        "/auth/login/email", json={"email": "confirmroute@example.com", "password": "correcthorse"}
    )
    assert login.status_code == 200


def test_confirm_email_rejects_an_invalid_token(client):
    response = client.post("/auth/email/confirm", json={"token": "not-a-real-token"})
    assert response.status_code == 401


def test_signup_and_gate_completion_actually_dispatches_a_confirmation_email(client, caplog):
    with caplog.at_level("INFO"):
        _signup_and_complete_gate(client, "dispatch@example.com", "+919999999012")

    assert any("StubEmailProvider" in record.message for record in caplog.records)
