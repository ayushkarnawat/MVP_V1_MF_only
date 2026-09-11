from datetime import datetime, timedelta, timezone


def _signup(client, phone: str) -> str:
    otp = client.post("/auth/otp/request", json={"phone_number": phone}).json()["otp"]
    return client.post("/auth/otp/verify", json={"phone_number": phone, "otp": otp}).json()["session_token"]


def test_account_deletion_requires_reason_and_returns_five_day_status(client):
    token = _signup(client, "+919200000001")
    headers = {"Authorization": f"Bearer {token}"}

    invalid = client.post("/auth/account-deletion", json={"reason": ""}, headers=headers)
    response = client.post(
        "/auth/account-deletion",
        json={"reason": "not_using_enough", "feedback": "Optional detail"},
        headers=headers,
    )

    assert invalid.status_code == 422
    assert response.status_code == 200
    body = response.json()
    assert body["pending_deletion"] is True
    scheduled = datetime.fromisoformat(body["deletion_scheduled_at"])
    assert timedelta(days=4, hours=23) < scheduled - datetime.now(timezone.utc) <= timedelta(days=5)


def test_pending_user_can_log_in_and_reactivate(client):
    phone = "+919200000002"
    token = _signup(client, phone)
    headers = {"Authorization": f"Bearer {token}"}
    client.post("/auth/account-deletion", json={"reason": "found_alternative"}, headers=headers)

    otp = client.post("/auth/otp/request", json={"phone_number": phone}).json()["otp"]
    login = client.post("/auth/otp/verify", json={"phone_number": phone, "otp": otp})
    pending_token = login.json()["session_token"]
    pending_headers = {"Authorization": f"Bearer {pending_token}"}
    me = client.get("/auth/me", headers=pending_headers)
    blocked = client.get("/household-members", headers=pending_headers)
    refreshed = client.post("/auth/session/refresh", headers=pending_headers)
    reactivated = client.post("/auth/reactivate", headers=pending_headers)

    assert login.status_code == 200
    assert me.json()["pending_deletion"] is True
    assert me.json()["deletion_scheduled_at"] is not None
    assert blocked.status_code == 403
    assert blocked.json()["detail"] == "Account is pending deletion. Reactivate it to continue."
    assert refreshed.status_code == 200
    assert reactivated.status_code == 200
    assert reactivated.json()["pending_deletion"] is False
    assert reactivated.json()["deletion_scheduled_at"] is None
