from app.models.auth import AuthIdentity
from app.models.enums import AuthIdentityProvider
from app.services.auth.password_reset import create_password_reset_token


def _db(client):
    from app.db.session import get_db

    return next(client.app.dependency_overrides[get_db]())


def _signup_and_complete_gate(client, email, phone):
    signup = client.post("/auth/signup/email", json={"email": email, "password": "correcthorse"})
    gate_token = signup.json()["phone_required"]["token"]
    otp_request = client.post("/auth/otp/request", json={"phone_number": phone})
    otp = otp_request.json()["otp"]
    client.post("/auth/otp/verify", json={"phone_number": phone, "otp": otp, "pending_token": gate_token})


def test_forgot_password_always_returns_200(client):
    known = client.post("/auth/password/forgot", json={"email": "unknown-entirely@example.com"})
    assert known.status_code == 200


def test_forgot_password_sends_a_reset_link_for_a_known_email(client, caplog):
    _signup_and_complete_gate(client, "forgot@example.com", "+919777777771")

    with caplog.at_level("INFO"):
        response = client.post("/auth/password/forgot", json={"email": "forgot@example.com"})

    assert response.status_code == 200
    # otp_delivery_mode=stub logs instead of sending (same as every other
    # EmailProvider caller) — the stub log line is the observable signal
    # that send_email was actually invoked.
    assert any("StubEmailProvider" in record.message for record in caplog.records)


def test_reset_password_with_a_valid_token_succeeds_and_allows_login(client):
    _signup_and_complete_gate(client, "resetflow@example.com", "+919777777772")
    db = _db(client)
    identity = (
        db.query(AuthIdentity)
        .filter_by(provider=AuthIdentityProvider.EMAIL_PASSWORD, provider_subject="resetflow@example.com")
        .one()
    )
    _, raw_token = create_password_reset_token(db, identity.user_id)
    db.close()

    reset = client.post("/auth/password/reset", json={"token": raw_token, "new_password": "brandnewpassword"})
    assert reset.status_code == 200

    login = client.post("/auth/login/email", json={"email": "resetflow@example.com", "password": "brandnewpassword"})
    assert login.status_code == 200
    assert "session_token" in login.json()


def test_reset_password_rejects_an_invalid_token(client):
    response = client.post("/auth/password/reset", json={"token": "not-a-real-token", "new_password": "brandnewpassword"})
    assert response.status_code == 401


def test_reset_password_rejects_a_short_new_password(client):
    _signup_and_complete_gate(client, "shortpw@example.com", "+919777777773")
    db = _db(client)
    identity = (
        db.query(AuthIdentity)
        .filter_by(provider=AuthIdentityProvider.EMAIL_PASSWORD, provider_subject="shortpw@example.com")
        .one()
    )
    _, raw_token = create_password_reset_token(db, identity.user_id)
    db.close()

    response = client.post("/auth/password/reset", json={"token": raw_token, "new_password": "short"})
    assert response.status_code == 422
