import uuid
from datetime import datetime, timezone

import pytest

from app.models.user import HouseholdMember, User
from app.models.enums import Relationship


def _signup(client, phone: str) -> tuple[str, str]:
    otp = client.post("/auth/otp/request", json={"phone_number": phone}).json()["otp"]
    body = client.post(
        "/auth/otp/verify", json={"phone_number": phone, "otp": otp}
    ).json()
    return body["session_token"], body["user_id"]


def _db(client):
    from app.db.session import get_db

    return next(client.app.dependency_overrides[get_db]())


def _household(client, *, suffix: str = "1"):
    token, user_id = _signup(client, f"+9191000000{suffix}")
    db = _db(client)
    user = db.get(User, uuid.UUID(user_id))
    user.email = f"head-route-{suffix}@example.com"
    head = HouseholdMember(
        id=uuid.uuid4(),
        user_id=user.id,
        name=f"Head {suffix}",
        relationship=Relationship.SELF,
        is_head=True,
        created_at=datetime.now(timezone.utc),
    )
    candidate = HouseholdMember(
        id=uuid.uuid4(),
        user_id=user.id,
        name=f"Candidate {suffix}",
        relationship=Relationship.SPOUSE,
        is_head=False,
        email=f"candidate-route-{suffix}@example.com",
        phone_number=f"+9181000000{suffix}",
        pan_encrypted=f"encrypted-route-pan-{suffix}",
        pan_lookup_hash=f"route-pan-hash-{suffix}",
        created_at=datetime.now(timezone.utc),
    )
    db.add_all([head, candidate])
    db.commit()
    candidate_id = str(candidate.id)
    db.close()
    return {
        "token": token,
        "user_id": user_id,
        "headers": {"Authorization": f"Bearer {token}"},
        "candidate_id": candidate_id,
    }


def _start(client, household):
    first = client.post(
        "/auth/head-change/start-code",
        json={"to_member_id": household["candidate_id"]},
        headers=household["headers"],
    )
    assert first.status_code == 200
    started = client.post(
        "/auth/head-change/start",
        json={
            "to_member_id": household["candidate_id"],
            "current_head_code": first.json()["otp"],
        },
        headers=household["headers"],
    )
    assert started.status_code == 200
    return started


def test_head_change_routes_return_the_run_6_contract(client):
    household = _household(client)
    started = _start(client, household)
    body = started.json()

    assert set(body) == {"request", "codes"}
    assert body["request"] == {
        "request_id": body["request"]["request_id"],
        "status": "pending",
        "expires_in_seconds": body["request"]["expires_in_seconds"],
        "verified_count": 1,
        "ready": False,
        "current_email_verified": True,
        "current_phone_verified": False,
        "new_email_verified": False,
        "new_phone_verified": False,
    }
    assert 0 < body["request"]["expires_in_seconds"] <= 600
    assert [(c["party"], c["channel"], c["verified"]) for c in body["codes"]] == [
        ("current", "email", True),
        ("current", "phone", False),
        ("new", "email", False),
        ("new", "phone", False),
    ]
    assert body["codes"][0]["otp"] is None
    assert all(c["otp"] for c in body["codes"][1:])

    pending = client.get(
        "/auth/head-change/pending", headers=household["headers"]
    )
    assert pending.status_code == 200
    assert pending.json()["request"] == body["request"] or (
        pending.json()["request"]["request_id"] == body["request"]["request_id"]
        and pending.json()["request"]["verified_count"] == 1
    )

    phone_code = next(
        c["otp"]
        for c in body["codes"]
        if c["party"] == "current" and c["channel"] == "phone"
    )
    verified = client.post(
        "/auth/head-change/verify",
        json={
            "request_id": body["request"]["request_id"],
            "party": "current",
            "channel": "phone",
            "code": phone_code,
        },
        headers=household["headers"],
    )
    assert verified.status_code == 200
    assert verified.json()["verified_count"] == 2
    assert verified.json()["current_phone_verified"] is True

    cancelled = client.post(
        "/auth/head-change/cancel", headers=household["headers"]
    )
    assert cancelled.status_code == 200
    assert cancelled.json()["status"] == "cancelled"
    assert client.get(
        "/auth/head-change/pending", headers=household["headers"]
    ).json() == {"request": None}


def test_stub_code_present_only_in_stub_mode(client, monkeypatch):
    first = _household(client, suffix="3")
    stub = client.post(
        "/auth/head-change/start-code",
        json={"to_member_id": first["candidate_id"]},
        headers=first["headers"],
    )
    assert stub.status_code == 200
    assert stub.json()["otp"] is not None

    second = _household(client, suffix="4")
    from app.config import settings
    from app.services.auth import otp as otp_module

    class RecordingProvider:
        def send_email(self, **_kwargs):
            return None

    monkeypatch.setattr(settings, "email_delivery_mode", "ses")
    monkeypatch.setattr(otp_module, "get_email_provider", lambda: RecordingProvider())
    ses = client.post(
        "/auth/head-change/start-code",
        json={"to_member_id": second["candidate_id"]},
        headers=second["headers"],
    )
    assert ses.status_code == 200
    assert ses.json()["otp"] is None


def test_current_email_missing_has_a_clear_code_and_message(client):
    household = _household(client, suffix="5")
    db = _db(client)
    db.get(User, uuid.UUID(household["user_id"])).email = None
    db.commit()
    db.close()

    response = client.post(
        "/auth/head-change/start-code",
        json={"to_member_id": household["candidate_id"]},
        headers=household["headers"],
    )

    assert response.status_code == 409
    assert response.json()["detail"] == {
        "code": "current_email_missing",
        "message": "Add and verify an email address on your account first.",
    }


def test_start_code_foreign_member_is_indistinguishable_from_unknown(client):
    first = _household(client, suffix="a")
    second = _household(client, suffix="b")

    responses = []
    for member_id in [second["candidate_id"], str(uuid.uuid4())]:
        response = client.post(
            "/auth/head-change/start-code",
            json={"to_member_id": member_id},
            headers=first["headers"],
        )
        responses.append((response.status_code, response.json()))

    assert responses == [
        (
            404,
            {
                "detail": {
                    "code": "member_not_found",
                    "message": "Household member not found.",
                }
            },
        ),
        (
            404,
            {
                "detail": {
                    "code": "member_not_found",
                    "message": "Household member not found.",
                }
            },
        ),
    ]


@pytest.mark.parametrize(
    ("method", "path", "json_body"),
    [
        (
            "post",
            "/auth/head-change/start-code",
            {"to_member_id": "00000000-0000-0000-0000-000000000001"},
        ),
        (
            "post",
            "/auth/head-change/start",
            {"to_member_id": "00000000-0000-0000-0000-000000000001", "current_head_code": "000000"},
        ),
        (
            "post",
            "/auth/head-change/verify",
            {
                "request_id": "00000000-0000-0000-0000-000000000001",
                "party": "current",
                "channel": "email",
                "code": "000000",
            },
        ),
        (
            "post",
            "/auth/head-change/resend",
            {
                "request_id": "00000000-0000-0000-0000-000000000001",
                "party": "current",
                "channel": "email",
            },
        ),
        ("post", "/auth/head-change/cancel", None),
        ("get", "/auth/head-change/pending", None),
    ],
)
def test_route_uses_active_user_check_so_pending_deletion_is_403(
    client, method, path, json_body
):
    household = _household(client, suffix="6")
    db = _db(client)
    db.get(User, uuid.UUID(household["user_id"])).pending_deletion = True
    db.commit()
    db.close()

    response = getattr(client, method)(
        path, json=json_body, headers=household["headers"]
    ) if json_body is not None else getattr(client, method)(
        path, headers=household["headers"]
    )

    assert response.status_code == 403
    assert response.json()["detail"] == {
        "code": "account_pending_deletion",
        "message": "This account is scheduled for deletion. Reactivate it first.",
    }


def test_resend_uses_the_existing_per_code_throttle_message(client):
    household = _household(client, suffix="7")
    started = _start(client, household).json()

    response = client.post(
        "/auth/head-change/resend",
        json={
            "request_id": started["request"]["request_id"],
            "party": "current",
            "channel": "phone",
        },
        headers=household["headers"],
    )

    assert response.status_code == 429
    detail = response.json()["detail"]
    assert detail["code"] == "otp_throttled"
    assert detail["message"].startswith("Please wait ")
    assert detail["message"].endswith("s before requesting another code.")


def test_foreign_request_route_is_indistinguishable_from_unknown(client):
    first = _household(client, suffix="8")
    request_id = _start(client, first).json()["request"]["request_id"]
    second = _household(client, suffix="9")

    responses = []
    for candidate_id in [request_id, str(uuid.uuid4())]:
        response = client.post(
            "/auth/head-change/verify",
            json={
                "request_id": candidate_id,
                "party": "current",
                "channel": "phone",
                "code": "000000",
            },
            headers=second["headers"],
        )
        responses.append((response.status_code, response.json()))

    assert responses == [
        (
            404,
            {
                "detail": {
                    "code": "request_not_found",
                    "message": "Head change request not found.",
                }
            },
        ),
        (
            404,
            {
                "detail": {
                    "code": "request_not_found",
                    "message": "Head change request not found.",
                }
            },
        ),
    ]
