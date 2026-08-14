def test_otp_request_returns_otp_in_stub_mode(client):
    response = client.post("/auth/otp/request", json={"phone_number": "+919999999999"})

    assert response.status_code == 200
    assert response.json()["otp"] is not None
    assert len(response.json()["otp"]) == 6


def test_otp_verify_creates_user_and_session_for_new_phone(client):
    phone = "+919888888888"
    otp = client.post("/auth/otp/request", json={"phone_number": phone}).json()["otp"]

    response = client.post("/auth/otp/verify", json={"phone_number": phone, "otp": otp})

    assert response.status_code == 200
    body = response.json()
    assert body["session_token"]
    assert body["onboarding_step"] is None
    assert body["onboarding_completed"] is False


def test_otp_verify_reuses_existing_user_for_known_phone(client):
    phone = "+919777777777"
    otp1 = client.post("/auth/otp/request", json={"phone_number": phone}).json()["otp"]
    first = client.post("/auth/otp/verify", json={"phone_number": phone, "otp": otp1}).json()

    otp2 = client.post("/auth/otp/request", json={"phone_number": phone}).json()["otp"]
    second = client.post("/auth/otp/verify", json={"phone_number": phone, "otp": otp2}).json()

    assert first["user_id"] == second["user_id"]


def test_otp_verify_rejects_wrong_code(client):
    phone = "+919666666666"
    client.post("/auth/otp/request", json={"phone_number": phone})

    response = client.post("/auth/otp/verify", json={"phone_number": phone, "otp": "000000"})

    assert response.status_code == 401


def test_me_requires_auth(client):
    response = client.patch("/auth/me", json={"onboarding_step": "q1"})
    assert response.status_code == 401


def test_me_updates_onboarding_fields_with_valid_session(client):
    phone = "+919555555555"
    otp = client.post("/auth/otp/request", json={"phone_number": phone}).json()["otp"]
    token = client.post("/auth/otp/verify", json={"phone_number": phone, "otp": otp}).json()["session_token"]

    response = client.patch(
        "/auth/me",
        json={"onboarding_step": "q2", "investor_type": "self_directed"},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["onboarding_step"] == "q2"
    assert body["investor_type"] == "self_directed"


def test_get_me_requires_auth(client):
    response = client.get("/auth/me")
    assert response.status_code == 401


def test_get_me_returns_current_user_state(client):
    phone = "+919333333333"
    otp = client.post("/auth/otp/request", json={"phone_number": phone}).json()["otp"]
    token = client.post("/auth/otp/verify", json={"phone_number": phone, "otp": otp}).json()["session_token"]
    client.patch(
        "/auth/me",
        json={"onboarding_step": "q3"},
        headers={"Authorization": f"Bearer {token}"},
    )

    response = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 200
    body = response.json()
    assert body["phone_number"] == phone
    assert body["onboarding_step"] == "q3"
    assert body["onboarding_completed"] is False


def test_me_can_mark_onboarding_completed(client):
    phone = "+919222222222"
    otp = client.post("/auth/otp/request", json={"phone_number": phone}).json()["otp"]
    token = client.post("/auth/otp/verify", json={"phone_number": phone, "otp": otp}).json()["session_token"]

    response = client.patch(
        "/auth/me",
        json={"onboarding_completed": True},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    assert response.json()["onboarding_completed"] is True


def test_session_refresh_requires_auth(client):
    response = client.post("/auth/session/refresh")
    assert response.status_code == 401


def test_session_refresh_extends_expiry_with_valid_session(client):
    phone = "+919444444444"
    otp = client.post("/auth/otp/request", json={"phone_number": phone}).json()["otp"]
    token = client.post("/auth/otp/verify", json={"phone_number": phone, "otp": otp}).json()["session_token"]

    response = client.post("/auth/session/refresh", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 200
    assert "expires_at" in response.json()


def test_otp_request_accepts_email(client):
    response = client.post("/auth/otp/request", json={"email": "a@example.com"})
    assert response.status_code == 200
    assert response.json()["otp"] is not None


def test_otp_request_rejects_both_identifiers(client):
    response = client.post("/auth/otp/request", json={"phone_number": "+919999999999", "email": "a@example.com"})
    assert response.status_code == 422


def test_otp_verify_email_first_signup_with_no_collision_returns_phone_required(client):
    email = "newsignup@example.com"
    otp = client.post("/auth/otp/request", json={"email": email}).json()["otp"]

    response = client.post("/auth/otp/verify", json={"email": email, "otp": otp})

    assert response.status_code == 200
    body = response.json()
    assert "phone_required" in body
    assert body["phone_required"]["token"]
    assert body["phone_required"]["prefill_email"] == email


def test_otp_verify_completing_phone_gate_creates_session(client):
    email = "gatecomplete@example.com"
    email_otp = client.post("/auth/otp/request", json={"email": email}).json()["otp"]
    gate = client.post("/auth/otp/verify", json={"email": email, "otp": email_otp}).json()
    pending_token = gate["phone_required"]["token"]

    phone = "+919123456789"
    phone_otp = client.post("/auth/otp/request", json={"phone_number": phone}).json()["otp"]
    response = client.post(
        "/auth/otp/verify",
        json={"phone_number": phone, "otp": phone_otp, "pending_token": pending_token},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["session_token"]

    me = client.get("/auth/me", headers={"Authorization": f"Bearer {body['session_token']}"})
    assert me.json()["phone_number"] == phone
    assert me.json()["email"] == email


def test_otp_verify_email_login_for_already_linked_email(client):
    email = "returning@example.com"
    email_otp = client.post("/auth/otp/request", json={"email": email}).json()["otp"]
    gate = client.post("/auth/otp/verify", json={"email": email, "otp": email_otp}).json()
    phone = "+919198765432"
    phone_otp = client.post("/auth/otp/request", json={"phone_number": phone}).json()["otp"]
    first = client.post(
        "/auth/otp/verify",
        json={"phone_number": phone, "otp": phone_otp, "pending_token": gate["phone_required"]["token"]},
    ).json()

    email_otp_2 = client.post("/auth/otp/request", json={"email": email}).json()["otp"]
    second = client.post("/auth/otp/verify", json={"email": email, "otp": email_otp_2}).json()

    assert second["session_token"]
    assert second["user_id"] == first["user_id"]


def test_otp_verify_email_matching_unverified_users_email_returns_link_required(client):
    from app.db.session import get_db
    from app.models.user import User

    phone = "+919111222333"
    phone_otp = client.post("/auth/otp/request", json={"phone_number": phone}).json()["otp"]
    first = client.post("/auth/otp/verify", json={"phone_number": phone, "otp": phone_otp}).json()

    db = next(client.app.dependency_overrides[get_db]())
    user = db.query(User).filter_by(phone_number=phone).one()
    user.email = "prelinked@example.com"
    db.commit()
    db.close()

    otp = client.post("/auth/otp/request", json={"email": "prelinked@example.com"}).json()["otp"]
    response = client.post("/auth/otp/verify", json={"email": "prelinked@example.com", "otp": otp})

    body = response.json()
    assert "link_required" in body
    assert body["link_required"]["existing_method"] == "phone"


def test_otp_verify_completing_a_link_via_phone(client):
    from app.db.session import get_db
    from app.models.user import User

    phone = "+919444555666"
    phone_otp = client.post("/auth/otp/request", json={"phone_number": phone}).json()["otp"]
    first = client.post("/auth/otp/verify", json={"phone_number": phone, "otp": phone_otp}).json()

    db = next(client.app.dependency_overrides[get_db]())
    user = db.query(User).filter_by(phone_number=phone).one()
    user.email = "tolink@example.com"
    db.commit()
    db.close()

    email_otp = client.post("/auth/otp/request", json={"email": "tolink@example.com"}).json()["otp"]
    link = client.post("/auth/otp/verify", json={"email": "tolink@example.com", "otp": email_otp}).json()
    pending_token = link["link_required"]["token"]

    phone_otp_2 = client.post("/auth/otp/request", json={"phone_number": phone}).json()["otp"]
    response = client.post(
        "/auth/otp/verify",
        json={"phone_number": phone, "otp": phone_otp_2, "pending_token": pending_token},
    )

    assert response.status_code == 200
    assert response.json()["user_id"] == first["user_id"]
