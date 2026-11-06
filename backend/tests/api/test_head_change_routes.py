import uuid
from datetime import datetime, timedelta, timezone

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
    # A household that has finished sign-up: contact changes mail the old address only then.
    user.onboarding_completed_at = datetime.now(timezone.utc)
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


def _verify_all_codes(client, household, started):
    body = started.json()
    for code in body["codes"]:
        if code["verified"]:
            continue
        response = client.post(
            "/auth/head-change/verify",
            json={
                "request_id": body["request"]["request_id"],
                "party": code["party"],
                "channel": code["channel"],
                "code": code["otp"],
            },
            headers=household["headers"],
        )
        assert response.status_code == 200
    return body["request"]["request_id"]


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


def test_complete_head_change_route_returns_completed_and_requires_logout(client):
    household = _household(client, suffix="0")
    request_id = _verify_all_codes(client, household, _start(client, household))

    response = client.post(
        "/auth/head-change/complete",
        json={"request_id": request_id},
        headers=household["headers"],
    )

    assert response.status_code == 200
    assert response.json() == {"status": "completed", "logout_required": True}
    assert (
        client.get("/auth/head-change/pending", headers=household["headers"]).status_code
        == 401
    )


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
        (
            "post",
            "/auth/head-change/complete",
            {"request_id": "00000000-0000-0000-0000-000000000001"},
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


UNDO_NOT_FOUND = {
    "detail": {"code": "undo_not_found", "message": "This undo link is not valid."}
}
CROSS_ACCOUNT_REASONS = {"email_in_use", "phone_in_use", "pan_registered_elsewhere"}


class Mailbox:
    def __init__(self) -> None:
        self.sent: list[dict] = []

    def send_email(self, to, subject, body, html_body=None):
        self.sent.append({"to": to, "subject": subject, "body": body})


def _swap_through_the_routes(client, household, monkeypatch) -> tuple[str, Mailbox]:
    from app.services.auth import head_change

    mailbox = Mailbox()
    monkeypatch.setattr(head_change, "get_email_provider", lambda: mailbox, raising=False)
    started = _start(client, household)
    request_id = _verify_all_codes(client, household, started)
    completed = client.post(
        "/auth/head-change/complete",
        json={"request_id": request_id},
        headers=household["headers"],
    )
    assert completed.status_code == 200
    assert completed.json() == {"status": "completed", "logout_required": True}
    link = next(m["body"] for m in mailbox.sent if m["subject"] == "Undo the Head of Family change.")
    token = link.split("/undo-head-change#token=")[1].strip()
    mailbox.sent.clear()
    return token, mailbox


def _undo(client, token: str):
    return client.post("/auth/head-change/undo", json={"token": token})


def test_undo_route_needs_no_session_and_gives_the_old_head_their_sign_in_back(
    client, monkeypatch
):
    household = _household(client, suffix="u1")
    token, mailbox = _swap_through_the_routes(client, household, monkeypatch)
    assert client.get("/auth/me", headers=household["headers"]).status_code == 401

    response = _undo(client, token)

    assert response.status_code == 200
    assert response.json() == {"status": "undone"}
    assert {m["subject"] for m in mailbox.sent} == {
        "The Head of Family on Unifolio has been changed back."
    }
    old_phone = "+9191000000u1"
    otp = client.post("/auth/otp/request", json={"phone_number": old_phone}).json()["otp"]
    login = client.post("/auth/otp/verify", json={"phone_number": old_phone, "otp": otp})
    assert login.status_code == 200
    assert login.json()["user_id"] == household["user_id"]
    me = client.get(
        "/auth/me", headers={"Authorization": f"Bearer {login.json()['session_token']}"}
    ).json()
    assert me["phone_number"] == old_phone
    assert me["email"] == "head-route-u1@example.com"
    assert me["self_name"] == "Head u1"
    new_phone = "+9181000000u1"
    otp = client.post("/auth/otp/request", json={"phone_number": new_phone}).json()["otp"]
    other = client.post("/auth/otp/verify", json={"phone_number": new_phone, "otp": otp})
    assert other.json()["user_id"] != household["user_id"]


def test_undo_route_answers_a_used_and_an_unknown_token_identically(client, monkeypatch):
    household = _household(client, suffix="u2")
    token, _ = _swap_through_the_routes(client, household, monkeypatch)

    assert _undo(client, token).status_code == 200
    used = _undo(client, token)
    unknown = _undo(client, "never-issued")

    assert (used.status_code, used.json()) == (404, UNDO_NOT_FOUND)
    assert (unknown.status_code, unknown.json()) == (404, UNDO_NOT_FOUND)
    assert used.text == unknown.text


def test_undo_route_after_the_24_hour_window(client, monkeypatch):
    from app.models.auth import HeadChangeRequest

    household = _household(client, suffix="u3")
    token, _ = _swap_through_the_routes(client, household, monkeypatch)
    db = _db(client)
    request = db.query(HeadChangeRequest).filter_by(user_id=uuid.UUID(household["user_id"])).one()
    request.undo_expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
    db.commit()
    db.close()

    response = _undo(client, token)

    assert (response.status_code, response.json()) == (
        410,
        {"detail": {"code": "undo_expired", "message": "The 24-hour undo window has closed."}},
    )


def test_undo_route_when_the_old_phone_has_been_taken(client, monkeypatch):
    household = _household(client, suffix="u4")
    token, _ = _swap_through_the_routes(client, household, monkeypatch)
    _signup(client, "+9191000000u4")

    response = _undo(client, token)

    assert (response.status_code, response.json()) == (
        409,
        {
            "detail": {
                "code": "undo_contact_taken",
                "message": "The old phone or email has been taken since the change, so it cannot be undone.",
            }
        },
    )


def test_undo_route_rejects_a_missing_token_with_a_validation_error(client):
    assert client.post("/auth/head-change/undo", json={}).status_code == 422


def test_undo_route_does_not_accept_a_session_instead_of_a_token(client):
    household = _household(client, suffix="u5")

    response = client.post(
        "/auth/head-change/undo", json={"token": household["token"]}, headers=household["headers"]
    )

    assert (response.status_code, response.json()) == (404, UNDO_NOT_FOUND)


def _add_member(client, household, **fields) -> str:
    db = _db(client)
    try:
        member = HouseholdMember(
            id=uuid.uuid4(),
            user_id=uuid.UUID(household["user_id"]),
            created_at=datetime.now(timezone.utc),
            **fields,
        )
        db.add(member)
        db.commit()
        return str(member.id)
    finally:
        db.close()


def _eligibility(client, household):
    return client.get("/auth/head-change/eligibility", headers=household["headers"])


def _reasons(response) -> dict[str, list[str]]:
    return {item["member_id"]: item["reasons"] for item in response.json()["members"]}


def test_eligibility_lists_each_non_head_member_with_only_own_data_reasons(client):
    household = _household(client, suffix="e6")
    bare = _add_member(client, household, name="Bare", relationship=None)
    same_email = _add_member(
        client,
        household,
        name="Same Email",
        relationship=Relationship.CHILD,
        email="head-route-e6@example.com",
        phone_number="+918200000006",
        pan_lookup_hash="same-email-pan",
        pan_encrypted="enc",
    )
    same_phone = _add_member(
        client,
        household,
        name="Same Phone",
        relationship=Relationship.CHILD,
        email="same-phone@example.com",
        phone_number="+9191000000e6",
        pan_lookup_hash="same-phone-pan",
        pan_encrypted="enc",
    )

    response = _eligibility(client, household)

    assert response.status_code == 200
    assert set(response.json()) == {"members"}
    assert all(set(item) == {"member_id", "reasons"} for item in response.json()["members"])
    assert _reasons(response) == {
        household["candidate_id"]: [],
        bare: ["no_email", "no_phone", "no_pan", "label_missing"],
        same_email: ["same_email_as_head"],
        same_phone: ["same_phone_as_head"],
    }


def test_eligibility_never_returns_a_head_a_foreign_member_or_a_cross_account_reason(client):
    from app.models.enums import MemberPanConflict

    household = _household(client, suffix="e7")
    other = _household(client, suffix="e8")
    db = _db(client)
    other_user = db.get(User, uuid.UUID(other["user_id"]))
    other_user.email = "candidate-route-e7@example.com"
    other_member_id = other["candidate_id"]
    db.get(HouseholdMember, uuid.UUID(other_member_id)).phone_number = "+9181000000e7"
    other_user.phone_number = "+9181000000e7"
    db.commit()
    db.close()
    pan_elsewhere = _add_member(
        client,
        household,
        name="Pan Elsewhere",
        relationship=Relationship.SIBLING,
        email="pan-elsewhere@example.com",
        phone_number="+918300000007",
        pan_conflict=MemberPanConflict.OTHER_ACCOUNT,
        detected_pan_hash="held-by-another-account",
        detected_pan_encrypted="enc",
    )
    head_id = _head_of(client, household)

    response = _eligibility(client, household)

    assert response.status_code == 200
    reasons = _reasons(response)
    assert set(reasons) == {household["candidate_id"], pan_elsewhere}
    assert head_id not in reasons and other_member_id not in reasons
    assert reasons[household["candidate_id"]] == []
    assert reasons[pan_elsewhere] == []
    for word in CROSS_ACCOUNT_REASONS:
        assert word not in response.text
    sent = client.post(
        "/auth/head-change/start-code",
        json={"to_member_id": household["candidate_id"]},
        headers=household["headers"],
    )
    assert sent.status_code == 200
    refused = client.post(
        "/auth/head-change/start",
        json={"to_member_id": household["candidate_id"], "current_head_code": sent.json()["otp"]},
        headers=household["headers"],
    )
    assert (refused.status_code, refused.json()["detail"]["code"]) == (409, "contact_in_use")


def _head_of(client, household) -> str:
    db = _db(client)
    try:
        return str(
            db.query(HouseholdMember.id)
            .filter(
                HouseholdMember.user_id == uuid.UUID(household["user_id"]),
                HouseholdMember.is_head.is_(True),
            )
            .scalar()
        )
    finally:
        db.close()


def test_eligibility_reports_an_open_change_and_an_open_statement_import(client):
    household = _household(client, suffix="e9")
    _start(client, household)
    db = _db(client)
    candidate = db.get(HouseholdMember, uuid.UUID(household["candidate_id"]))
    candidate.pan_pending_until = datetime.now(timezone.utc) + timedelta(hours=1)
    db.commit()
    db.close()

    reasons = _reasons(_eligibility(client, household))

    assert set(reasons[household["candidate_id"]]) == {
        "import_in_progress",
        "head_change_already_open",
    }


def test_eligibility_sends_no_code_and_writes_nothing(client):
    from app.models.auth import OtpRequest
    from sqlalchemy import event

    household = _household(client, suffix="e10")
    db = _db(client)
    engine = db.get_bind()
    db.close()
    writes: list[str] = []

    def record_writes(_conn, _cursor, statement, _params, _context, _executemany):
        if statement.lstrip().split(None, 1)[0].upper() in {"INSERT", "UPDATE", "DELETE"}:
            writes.append(statement.split("(", 1)[0][:80])

    event.listen(engine, "before_cursor_execute", record_writes)
    try:
        response = _eligibility(client, household)
    finally:
        event.remove(engine, "before_cursor_execute", record_writes)

    assert response.status_code == 200
    assert writes == []
    db = _db(client)
    try:
        assert db.query(OtpRequest).filter(OtpRequest.purpose == "head_change").count() == 0
    finally:
        db.close()


def test_a_member_created_through_onboarding_is_the_head_end_to_end(client):
    # Every other test here builds the head row by hand; this one goes through the real route
    # that onboarding uses, which is how an account created after migration 0050 gets its head.
    token, user_id = _signup(client, "+919100000e12")
    headers = {"Authorization": f"Bearer {token}"}
    created = client.post(
        "/household-members",
        json={"name": "Asha Rao", "relationship": "self"},
        headers=headers,
    )
    assert created.status_code == 200
    me = client.get("/auth/me", headers=headers).json()
    assert me["head_member_id"] == created.json()["id"]


def test_eligibility_for_an_account_with_no_head_is_a_clean_error_not_a_server_error(client):
    household = _household(client, suffix="e13")
    db = _db(client)
    db.query(HouseholdMember).filter(
        HouseholdMember.user_id == uuid.UUID(household["user_id"]),
        HouseholdMember.is_head.is_(True),
    ).update({"is_head": False})
    db.commit()
    db.close()

    response = _eligibility(client, household)

    assert response.status_code == 409
    assert set(response.json()["detail"]) == {"code", "message"}


def test_eligibility_needs_a_session_and_refuses_a_pending_deletion_account(client):
    household = _household(client, suffix="e11")

    assert client.get("/auth/head-change/eligibility").status_code == 401

    db = _db(client)
    user = db.get(User, uuid.UUID(household["user_id"]))
    user.pending_deletion = True
    db.commit()
    db.close()
    response = _eligibility(client, household)
    assert (response.status_code, response.json()) == (
        403,
        {
            "detail": {
                "code": "account_pending_deletion",
                "message": "This account is scheduled for deletion. Reactivate it first.",
            }
        },
    )



def _completed_request(client, household, *, undo_expires_at, status="completed"):
    from app.models.auth import HeadChangeRequest

    db = _db(client)
    members = {
        m.is_head: m
        for m in db.query(HouseholdMember).filter(
            HouseholdMember.user_id == uuid.UUID(household["user_id"])
        )
    }
    db.add(
        HeadChangeRequest(
            user_id=uuid.UUID(household["user_id"]),
            from_member_id=members[True].id,
            to_member_id=members[False].id,
            status=status,
            expires_at=datetime.now(timezone.utc),
            undo_token_hash="x" * 64,
            undo_expires_at=undo_expires_at,
            snapshot={},
        )
    )
    db.commit()
    db.close()


def test_account_deletion_is_refused_while_the_undo_window_is_open(client):
    # The new head could otherwise schedule deletion (undo refuses a pending-deletion account),
    # wait out the 24 hours and reactivate, leaving the previous head no way back.
    household = _household(client, suffix="d01")
    _completed_request(
        client, household, undo_expires_at=datetime.now(timezone.utc) + timedelta(hours=5)
    )

    response = client.post(
        "/auth/account-deletion", json={"reason": "not_using_enough"}, headers=household["headers"]
    )

    assert response.status_code == 409
    detail = response.json()["detail"]
    assert set(detail) == {"code", "message", "available_after"}
    assert detail["code"] == "head_change_undo_window"
    assert detail["message"].startswith(
        "The Head of Family was changed in the last 24 hours. You can delete this account after "
        "the undo window closes on "
    )
    assert detail["message"].endswith(" IST.")
    assert "UTC" not in detail["message"]
    assert datetime.fromisoformat(detail["available_after"]).tzinfo is not None
    assert client.get("/auth/me", headers=household["headers"]).json()["pending_deletion"] is False


def test_account_deletion_is_allowed_after_the_undo_window_or_after_an_undo(client):
    household = _household(client, suffix="d02")
    _completed_request(
        client, household, undo_expires_at=datetime.now(timezone.utc) - timedelta(minutes=1)
    )
    assert (
        client.post(
            "/auth/account-deletion", json={"reason": "not_using_enough"}, headers=household["headers"]
        ).status_code
        == 200
    )

    undone = _household(client, suffix="d03")
    _completed_request(
        client,
        undone,
        undo_expires_at=datetime.now(timezone.utc) + timedelta(hours=5),
        status="undone",
    )
    assert (
        client.post(
            "/auth/account-deletion", json={"reason": "not_using_enough"}, headers=undone["headers"]
        ).status_code
        == 200
    )


def test_preview_foreign_unknown_and_expired_request_answer_alike(client):
    household_a = _household(client, suffix="p1")
    household_b = _household(client, suffix="p2")

    started_b = _start(client, household_b)
    req_b_id = started_b.json()["request"]["request_id"]

    started_a = _start(client, household_a)
    req_a_id = started_a.json()["request"]["request_id"]

    # Expire household_a's request in the database
    db = _db(client)
    from app.models.auth import HeadChangeRequest
    req_a = db.get(HeadChangeRequest, uuid.UUID(req_a_id))
    req_a.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
    db.commit()
    db.close()

    unknown_id = str(uuid.uuid4())

    expected_body = {
        "detail": {
            "code": "request_not_found",
            "message": "Head change request not found.",
        }
    }

    # 1. Foreign request
    res_foreign = client.get(
        f"/auth/head-change/preview?request_id={req_b_id}",
        headers=household_a["headers"],
    )
    assert res_foreign.status_code == 404
    assert res_foreign.json() == expected_body

    # 2. Unknown request
    res_unknown = client.get(
        f"/auth/head-change/preview?request_id={unknown_id}",
        headers=household_a["headers"],
    )
    assert res_unknown.status_code == 404
    assert res_unknown.json() == expected_body

    # 3. Expired request
    res_expired = client.get(
        f"/auth/head-change/preview?request_id={req_a_id}",
        headers=household_a["headers"],
    )
    assert res_expired.status_code == 404
    assert res_expired.json() == expected_body

    # Check that preview did not mutate the expired request status to "expired"
    db = _db(client)
    refreshed_req_a = db.get(HeadChangeRequest, uuid.UUID(req_a_id))
    assert refreshed_req_a.status == "pending"
    db.close()

    # 4. Cancelled (non-pending) request
    client.post("/auth/head-change/cancel", headers=household_b["headers"])
    res_cancelled = client.get(
        f"/auth/head-change/preview?request_id={req_b_id}",
        headers=household_b["headers"],
    )
    assert res_cancelled.status_code == 404
    assert res_cancelled.json() == expected_body


def test_preview_requires_a_session_and_refuses_pending_deletion(client):
    req_id = str(uuid.uuid4())
    # 1. No session -> 401
    no_auth = client.get(f"/auth/head-change/preview?request_id={req_id}")
    assert no_auth.status_code == 401

    # 2. Pending deletion -> 403 account_pending_deletion
    household = _household(client, suffix="pdel")
    started = _start(client, household)
    req_id = started.json()["request"]["request_id"]

    db = _db(client)
    user = db.get(User, uuid.UUID(household["user_id"]))
    user.pending_deletion = True
    db.commit()
    db.close()

    response = client.get(
        f"/auth/head-change/preview?request_id={req_id}",
        headers=household["headers"],
    )
    assert response.status_code == 403
    assert response.json() == {
        "detail": {
            "code": "account_pending_deletion",
            "message": "This account is scheduled for deletion. Reactivate it first.",
        }
    }


def test_preview_head_change_route_returns_run_6_contract(client):
    household = _household(client, suffix="prun6")
    db = _db(client)
    user = db.get(User, uuid.UUID(household["user_id"]))
    parent = HouseholdMember(
        id=uuid.uuid4(),
        user_id=user.id,
        name="Parent Route",
        relationship=Relationship.PARENT,
        is_head=False,
        created_at=datetime.now(timezone.utc),
    )
    db.add(parent)
    db.commit()
    db.close()

    started = _start(client, household)
    req_id = started.json()["request"]["request_id"]

    res = client.get(
        f"/auth/head-change/preview?request_id={req_id}",
        headers=household["headers"],
    )
    assert res.status_code == 200
    body = res.json()
    assert set(body) == {
        "request_id",
        "old_head",
        "new_head",
        "old_head_new_label",
        "members",
        "everyone_signed_out",
    }
    assert body["request_id"] == req_id
    assert set(body["old_head"]) == {"member_id", "name"}
    assert set(body["new_head"]) == {"member_id", "name", "email", "phone_number"}
    assert body["old_head_new_label"] == "spouse"
    assert body["everyone_signed_out"] is True
    assert isinstance(body["members"], list)
    assert len(body["members"]) == 2  # candidate (new head) + parent
    member_keys = {
        "member_id",
        "name",
        "label_before",
        "label_before_other",
        "label_after",
        "label_after_other",
        "review_recommended",
        "cleared",
    }
    for m in body["members"]:
        assert set(m) == member_keys



def test_member_removal_refusal_has_a_code_a_message_and_an_iso_date(client):
    household = _household(client, suffix="m01")
    _completed_request(
        client, household, undo_expires_at=datetime.now(timezone.utc) + timedelta(hours=5)
    )
    db = _db(client)
    old_head = (
        db.query(HouseholdMember)
        .filter(
            HouseholdMember.user_id == uuid.UUID(household["user_id"]),
            HouseholdMember.is_head.is_(True),
        )
        .one()
    )
    member_id = old_head.id
    db.close()

    response = client.delete(
        f"/household-members/{member_id}/portfolio?remove_member=true",
        headers=household["headers"],
    )

    assert response.status_code == 409
    detail = response.json()["detail"]
    assert set(detail) == {"code", "message", "available_after"}
    assert detail["code"] == "member_in_recent_head_change"
    assert "You can remove them on " in detail["message"]
    assert "Try again in 7 days" not in detail["message"]
    assert datetime.fromisoformat(detail["available_after"]).tzinfo is not None
