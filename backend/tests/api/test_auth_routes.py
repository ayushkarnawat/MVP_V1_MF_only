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
