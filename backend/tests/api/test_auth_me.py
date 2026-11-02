"""Task 5.6: /auth/me gains `head_member_id` and `head_change_pending`, read-only and additive."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import event

from app.models.auth import HeadChangeRequest
from app.models.user import HouseholdMember
from tests.api.test_head_change_routes import (
    _db,
    _household,
    _signup,
    _start,
    _verify_all_codes,
)

OLD_KEYS = {
    "user_id",
    "phone_number",
    "email",
    "onboarding_step",
    "onboarding_completed",
    "investor_type",
    "primary_goals",
    "pending_deletion",
    "deletion_scheduled_at",
    "self_name",
    "created_at",
    "consent_outdated",
}


def _me(client, household):
    return client.get("/auth/me", headers=household["headers"])


def _head_id(client, household) -> str:
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


def _without_clock(status: dict) -> dict:
    return {key: value for key, value in status.items() if key != "expires_in_seconds"}


def test_auth_me_returns_head_member_id_and_pending_request(client):
    household = _household(client)
    head_id = _head_id(client, household)

    before = _me(client, household)
    assert before.status_code == 200
    assert before.json()["head_member_id"] == head_id
    assert before.json()["head_change_pending"] is None

    started = _start(client, household)
    pending = _me(client, household).json()["head_change_pending"]

    assert pending is not None
    assert _without_clock(pending) == _without_clock(started.json()["request"])
    assert pending["status"] == "pending"
    assert pending["verified_count"] == 1
    assert 0 < pending["expires_in_seconds"] <= 600
    assert set(pending) == set(started.json()["request"])

    _verify_all_codes(client, household, started)
    ready = _me(client, household).json()["head_change_pending"]
    assert (ready["status"], ready["ready"], ready["verified_count"]) == ("ready", True, 4)

    cancelled = client.post(
        "/auth/head-change/cancel", json={}, headers=household["headers"]
    )
    assert cancelled.status_code == 200
    assert _me(client, household).json()["head_change_pending"] is None


def test_auth_me_keeps_every_existing_field(client):
    household = _household(client, suffix="2")

    body = _me(client, household).json()

    assert OLD_KEYS <= set(body)
    assert set(body) == OLD_KEYS | {"head_member_id", "head_change_pending"}
    assert body["email"] == "head-route-2@example.com"
    assert body["self_name"] == "Head 2"


def test_auth_me_for_an_account_with_no_head_and_no_request_returns_nulls(client):
    token, _ = _signup(client, "+919100000033")

    body = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"}).json()

    assert body["head_member_id"] is None
    assert body["head_change_pending"] is None


def test_the_pending_state_is_the_callers_own_never_another_accounts(client):
    first = _household(client, suffix="3")
    second = _household(client, suffix="4")
    _start(client, first)

    assert _me(client, first).json()["head_change_pending"] is not None
    assert _me(client, second).json()["head_change_pending"] is None
    assert _me(client, second).json()["head_member_id"] == _head_id(client, second)
    assert _me(client, second).json()["head_member_id"] != _head_id(client, first)


def test_auth_me_writes_nothing_even_when_a_pending_request_has_expired(client):
    household = _household(client, suffix="5")
    started = _start(client, household)
    request_id = uuid.UUID(started.json()["request"]["request_id"])
    db = _db(client)
    request = db.get(HeadChangeRequest, request_id)
    request.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
    db.commit()
    engine = db.get_bind()
    db.close()

    writes: list[str] = []

    def record_writes(_conn, _cursor, statement, _params, _context, _executemany):
        if statement.lstrip().split(None, 1)[0].upper() in {"INSERT", "UPDATE", "DELETE"}:
            writes.append(statement.split("(", 1)[0][:80])

    event.listen(engine, "before_cursor_execute", record_writes)
    try:
        response = _me(client, household)
    finally:
        event.remove(engine, "before_cursor_execute", record_writes)

    assert response.status_code == 200
    assert response.json()["head_change_pending"] is None
    assert writes == []
    db = _db(client)
    try:
        assert db.get(HeadChangeRequest, request_id).status == "pending"
    finally:
        db.close()


def test_a_completed_or_undone_request_is_not_reported_as_pending(client):
    household = _household(client, suffix="6")
    started = _start(client, household)
    request_id = uuid.UUID(started.json()["request"]["request_id"])
    db = _db(client)
    for status in ("completed", "undone", "cancelled", "expired"):
        db.get(HeadChangeRequest, request_id).status = status
        db.commit()
        assert _me(client, household).json()["head_change_pending"] is None
    db.close()
