from datetime import datetime, timedelta, timezone

from .test_auth_routes import _consent


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
    assert timedelta(days=29, hours=23) < scheduled - datetime.now(timezone.utc) <= timedelta(days=30)


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
    reactivated = client.post(
        "/auth/reactivate", json={"accepted_documents": _consent()}, headers=pending_headers
    )

    assert login.status_code == 200
    assert me.json()["pending_deletion"] is True
    assert me.json()["deletion_scheduled_at"] is not None
    assert blocked.status_code == 403
    assert blocked.json()["detail"] == "Account is pending deletion. Reactivate it to continue."
    assert refreshed.status_code == 200
    assert reactivated.status_code == 200
    assert reactivated.json()["pending_deletion"] is False
    assert reactivated.json()["deletion_scheduled_at"] is None


def _pending_headers(client, phone: str) -> dict[str, str]:
    headers = {"Authorization": f"Bearer {_signup(client, phone)}"}
    assert client.post("/auth/account-deletion", json={"reason": "other"}, headers=headers).status_code == 200
    return headers


def _rows_for(client, headers):
    import uuid

    from app.db.session import get_db
    from app.models.consent import ConsentRecord

    user_id = uuid.UUID(client.get("/auth/me", headers=headers).json()["user_id"])
    db = next(client.app.dependency_overrides[get_db]())
    try:
        return db.query(ConsentRecord).filter_by(user_id=user_id).all()
    finally:
        db.close()


def test_account_deletion_route_writes_withdrawn_rows_with_evidence(client):
    headers = _pending_headers(client, "+919200000011")
    rows = _rows_for(client, headers)
    assert {r.action.value for r in rows} == {"withdrawn"}
    assert {r.surface for r in rows} == {"account_deletion"}
    assert len(rows) == 4


def test_reactivate_when_not_pending_is_409_and_writes_nothing(client):
    token = _signup(client, "+919200000014")
    headers = {"Authorization": f"Bearer {token}"}
    before = len(_rows_for(client, headers))

    r = client.post("/auth/reactivate", json={"accepted_documents": _consent()}, headers=headers)
    bad = client.post("/auth/reactivate", json={"accepted_documents": []}, headers=headers)

    assert r.status_code == 409 and r.json()["detail"] == "Account deletion isn’t scheduled."
    assert bad.status_code == 409  # checked before consent validation
    assert len(_rows_for(client, headers)) == before


def test_reactivate_requires_consent(client):
    headers = _pending_headers(client, "+919200000012")

    no_body = client.post("/auth/reactivate", headers=headers)
    stale = client.post(
        "/auth/reactivate",
        json={"accepted_documents": [{"document_type": "terms_of_service", "document_version": "tos-old"}]},
        headers=headers,
    )

    assert no_body.status_code == 422
    assert stale.status_code == 422
    assert stale.json()["detail"]["code"] == "consent_required"
    assert set(stale.json()["detail"]["missing"]) == {"terms_of_service", "privacy_policy"}
    assert client.get("/auth/me", headers=headers).json()["pending_deletion"] is True
    assert {r.action.value for r in _rows_for(client, headers)} == {"withdrawn"}


def test_reactivate_with_consent_writes_given_rows(client):
    headers = _pending_headers(client, "+919200000013")

    r = client.post("/auth/reactivate", json={"accepted_documents": _consent()}, headers=headers)

    assert r.status_code == 200
    assert r.json()["pending_deletion"] is False
    assert r.json()["consent_outdated"] == []
    given = [row for row in _rows_for(client, headers) if row.action.value == "given"]
    assert {row.surface for row in given} == {"reactivate"}
    assert {row.purpose_code.value for row in given} == {
        "service_agreement",
        "account_and_authentication",
        "portfolio_tracking_analytics",
    }
